import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { resolveInvokedPath } from "../cli.js";
import { RESERVED_PAGE_NAMES } from "../pages.js";
import { countryName } from "../region.js";
import { computeStats, type RouteStats } from "../stats.js";
import {
  CDN_REPO_BASE,
  cdnPathExistsOnDisk,
  currentCdnMovingRef,
  extractCdnRefs,
  isPublishedCdnPath,
  isRecognizedCdnRef,
} from "./cdn.js";
import { segmentsOf } from "./glyphs.js";
import { hashRouteGeometry, isWellFormedXml } from "./roads.js";

const ROOT = join(import.meta.dirname, "..", "..");

const HERO_FIELDS: Record<string, keyof ReturnType<typeof computeStats>["totals"]> = {
  Routes: "routes",
  "GPS Points": "routePoints",
  Waypoints: "waypoints",
  Stages: "stages",
};

const HERO_STAT_PATTERN =
  /<span class="stat-number">([^<]+)<\/span>\s*<span class="stat-label">([^<]+)<\/span>/g;

const HREF_PATTERN = /href="([^"]+)"/g;

const TRKPT_PATTERN = /<trkpt\b/g;

const JSDELIVR_BASE = `${CDN_REPO_BASE}@${currentCdnMovingRef()}`;

const STAGE_INTERIOR_PATTERN = /<details class="stage-interior">/g;

interface LocalizedStringLike {
  en?: unknown;
}

function isLocalizedStringLike(value: unknown): value is LocalizedStringLike {
  return typeof value === "object" && value !== null;
}

/**
 * A stage's interior.narrative (and commonExperiences entries) are typed as
 * LocalizedString in the schema, but the guard reads stages.json defensively
 * rather than trusting the schema holds — either a bare string or an
 * `{ en: string }` object should resolve to the same English text.
 */
function localizedText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (isLocalizedStringLike(value) && typeof value.en === "string") return value.en;
  return null;
}

interface StageLike {
  interior?: {
    narrative?: unknown;
    reflection?: unknown;
  };
  distanceKm?: unknown;
  terrainNotes?: unknown;
}

function isStageLike(value: unknown): value is StageLike {
  return typeof value === "object" && value !== null;
}

interface StagesFileLike {
  stages?: unknown;
}

function isStagesFileLike(value: unknown): value is StagesFileLike {
  return typeof value === "object" && value !== null;
}

const README_TOTALS_PATTERN =
  /([\d,]+) GPS points\.\s*([\d,]+) waypoints\.\s*([\d,]+) stages\.\s*([\d,]+) routes across/;

const README_TOTALS_FIELDS: Array<[string, keyof ReturnType<typeof computeStats>["totals"]]> = [
  ["GPS points", "routePoints"],
  ["waypoints", "waypoints"],
  ["stages", "stages"],
  ["routes", "routes"],
];

/**
 * Every glyph, elevation profile, and sparkline is duplicated inline into the
 * HTML rather than referenced — see docs/styles.css for why. The files under
 * docs/assets/{routes,profiles,sparklines}/ exist purely as CI tripwires, so
 * this guard has to read the "d" out of each one and confirm the inline copy
 * still matches, or a regenerated asset can go stale in the page silently.
 */
const ASSET_LABELS = {
  routes: "glyph",
  profiles: "elevation profile",
  sparklines: "sparkline",
  roads: "road corridor",
} as const;

type AssetKind = keyof typeof ASSET_LABELS;

// "roads" is deliberately not inlined into any page — see roads.ts — so it's
// only walked by the generic orphan scan below, never by checkInlinedAsset.
const ASSET_KINDS: readonly AssetKind[] = ["routes", "profiles", "sparklines", "roads"];

const ROADS_GEOMETRY_HASH_PATTERN = /geometry-hash="([0-9a-f]+)"/;

const ROADS_PATH_D_PATTERN = /<path\b[^>]*\bd="([^"]*)"/;

/**
 * Not a tight bound — just enough to catch the one failure this exists for:
 * an empty or all-outside-corridor Overpass response renders as well-formed
 * XML with a correct geometry hash and a literal `d=""`, zero "M" subpath
 * commands under any definition. The smallest of the eight committed
 * corridors (kumano-kodo-nakahechi) has 144.
 */
const ROADS_MIN_SUBPATHS = 1;

// Only the real hero markup satisfies this — an <img class="route-hero-roads"
// …src="assets/roads/{id}.svg">. A bare regex over raw HTML (the previous
// approach) is satisfied by an HTML comment, an <a href>, or plain prose
// mentioning the path, none of which mean the corridor actually renders.
const ROADS_HERO_IMG_PATTERN = /<img\b[^>]*>/g;
const ROADS_HERO_CLASS_PATTERN = /\bclass="[^"]*\broute-hero-roads\b[^"]*"/;
const ROADS_HERO_SRC_PATTERN = /\bsrc="assets\/roads\/([a-z0-9-]+)\.svg"/;

// The coastal variant ships full geometry, a profile, a sparkline, and a
// glyph.js entry of its own, but — unlike every route id in index.json — has
// no detail page of its own; its assets are inlined into the parent Camino
// Portugués page instead. It's the one asset id the reverse-orphan checks
// below must allow without a matching index.json route.
const COASTAL_VARIANT_ASSET_ID = "camino-portugues-coastal";

const HTML_ENTITIES: Record<string, string> = {
  aacute: "á",
  amp: "&",
  atilde: "ã",
  ccedil: "ç",
  copy: "©",
  eacute: "é",
  gt: ">",
  iacute: "í",
  ldquo: "“",
  lt: "<",
  mdash: "—",
  middot: "·",
  ndash: "–",
  ntilde: "ñ",
  oacute: "ó",
  omacr: "ō",
  Omacr: "Ō",
  rarr: "→",
  rdquo: "”",
  uacute: "ú",
  ucirc: "û",
  umacr: "ū",
  uuml: "ü",
};

/**
 * Covers both named entities (from HTML_ENTITIES) and numeric references
 * (&#39; is already used on these pages) — without the numeric branch, a
 * narrative containing an apostrophe or ampersand would be compared against
 * its correctly-escaped HTML and never match, false-failing the guard on
 * markup that rendered exactly right.
 */
function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|([a-zA-Z]+));/g,
    (full, dec: string | undefined, name: string | undefined) => {
      if (dec !== undefined) return String.fromCodePoint(Number(dec));
      return name !== undefined ? (HTML_ENTITIES[name] ?? full) : full;
    },
  );
}

function extractPathD(svg: string): string | null {
  const match = svg.match(/\sd="([^"]*)"/);
  return match ? match[1] : null;
}

// docs/routes.html's comparison table: Route | Distance | Typical Days |
// Difficulty | Stages | Waypoints | Best Months. Difficulty and Best Months
// aren't in computeStats' output, so they're matched but not captured.
const COMPARE_ROW_PATTERN =
  /<th scope="row">([^<]+)<\/th>\s*<td data-value="([^"]*)">[^<]*<\/td>\s*<td data-value="([^"]*)">[^<]*<\/td>\s*<td data-value="[^"]*">[^<]*<\/td>\s*<td data-value="([^"]*)">[^<]*<\/td>\s*<td data-value="([^"]*)">[^<]*<\/td>\s*<td data-value="[^"]*">[^<]*<\/td>/g;

const FIGURE_FIELDS: Array<[string, "distanceKm" | "estimatedDaysTypical" | "stages" | "waypoints"]> = [
  ["distance", "distanceKm"],
  ["days", "estimatedDaysTypical"],
  ["stages", "stages"],
  ["waypoints", "waypoints"],
];

// docs/routes.html's Variants table has no machine-readable variant id — only
// prose names, which don't reliably match index.json's name field (see the
// coastal variant, whose table copy is a shortened paraphrase of its
// index.json name). Its parent-route link and distance are exact and unique
// per variant, so that pair stands in for identity instead.
const VARIANT_ROW_PATTERN =
  /<tr>\s*<td>[^<]*<\/td>\s*<td><a href="\/([^"]+)">[^<]*<\/a><\/td>\s*<td>([\d,]+)\s*km<\/td>/g;

// README.md's route tables render each route as `[Name](routes/{id}/) | {km}
// km | ...`. A network route like Kumano Kodo instead renders a range
// ("36-170 km" across its variants) — capturing only the leading number
// before an optional "-{max}" gets the one figure that has to agree with
// index.json's own distanceKm (the low end / canonical route's length), the
// same way FIGURE_FIELDS' "distance" already treats index.json as the
// source of truth for docs/routes.html's comparison table.
function readmeDistanceKmPattern(id: string): RegExp {
  return new RegExp(`\\]\\(routes\\/${id}\\/\\)\\s*\\|\\s*([\\d,]+(?:\\.\\d+)?)(?:-[\\d,]+(?:\\.\\d+)?)?\\s*km`);
}

// Every detail page hand-lists a "Waypoint counts by type" table (one per
// route; camino-portugues.html carries a second one for the coastal variant)
// ending in its own "Total" row. Nothing sums the rows against that row, so a
// waypoint type introduced in waypoints.geojson without a matching table row
// — a viewpoint, a cultural site, a credential stamp — still counts toward
// the Total the page's own paragraph quotes, while silently falling out of
// the breakdown beneath it. That's the exact shape of the real bug this
// guard exists for: camino-norte's table rows summed to 2,893 against a
// Total of 2,928 — 35 short, all of it "viewpoint" and "cultural_site"
// waypoints with no row of their own.
const WAYPOINT_TYPE_TABLE_PATTERN =
  /<caption>(Waypoint counts by type[^<]*)<\/caption>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g;
const WAYPOINT_TYPE_ROW_PATTERN = /<tr><th scope="row">([^<]+)<\/th><td>([\d,]+)[^<]*<\/td><\/tr>/g;

/**
 * Nine of the eleven Overview tables on the route detail pages publish an
 * elevation range, and nothing compared any of them to the data they were
 * written from. Both live errors this guard was written against arrived the
 * same way: 1bffcda ("data: correct elevation ranges that contradicted their
 * own stages") corrected routes/{id}/metadata.json and left the pages saying
 * what they had said before it. The Kumano Kodo instance had the identical
 * cause: 00a6be9 raised that route's declared minimum from 50 m to 80 m and
 * the page went on printing 50 until b11701e — 181 commits later, 71 of them
 * touching docs/ (`git rev-list --count 00a6be9..b11701e -- docs/`), across a
 * rename that carried the stale cell into a new filename. A published figure
 * orphaned by a data correction is the shape of drift this exists for, and a
 * reader is the only thing that has ever caught one.
 *
 * Read per route id from the per-route loop, never over docs/*.html. The two
 * generated pages — the pilgrimage pages carrying build-assets' GENERATED
 * marker — are link lists with no Key Facts table at all, so an unscoped scan
 * would only ever have them to say nothing about.
 *
 * Anchored on the <caption>, not on the <h2>Key Facts</h2> above it, because
 * there are eleven of these tables and not ten: docs/camino-portugues.html
 * carries a second for the coastal variant, sitting under an <h3> inside
 * <h2>Variants</h2> with no Key Facts heading anywhere above it — and that
 * table held one of the two wrong cells. Anchoring on the heading would have
 * missed the bug the guard was written for.
 *
 * Keyed on metadata.json, not on the per-stage high and low points in
 * stages.json. The two agree everywhere except shikoku-88, whose metadata
 * declares a minimum of 0 m against stages that bottom out at 5 m, and it is
 * metadata the cells were written from — the page is a rendering of the
 * declared overview, so the declared overview is what it has to agree with.
 * It is also the only source a section without a walked line has:
 * kumano-kodo-iseji declares a range it has no stages to derive one from.
 *
 * The row is optional and has to stay optional. That same iseji declares an
 * elevationRange (0–647 m, under a note saying it is declared rather than
 * measured) while docs/kumano-kodo-iseji.html deliberately publishes no
 * Elevation range row at all — and docs/kumano-kodo-ohechi.html publishes
 * none either, its section declaring no range to publish. Those are the two
 * Overview tables that carry no elevation cell. A guard that demanded the row
 * wherever the data exists would false-positive on the first page it read.
 *
 * Two independently anchored patterns rather than one rule over the cell's
 * numbers, because shikoku-88's cell is more than a range: "0&ndash;911 m
 * (highest temple: Unpen-ji, Temple 66); total ascent 16,780 m, descent
 * 14,470 m per the 10-stage breakdown &mdash; true cumulative totals over the
 * full circuit are commonly cited as ~18,000 m each". Anything that scans
 * every figure in there flags the temple number (66), the stage count (10)
 * and the ~18,000 m aside, none of which are claims about this route's own
 * profile. The range pattern takes the cell's first "a&ndash;b m" and the
 * totals pattern the one "total ascent … descent …" clause; every one of the
 * nine elevation cells carries both shapes exactly once (`grep -c "Elevation
 * range" docs/*.html` sums to nine, and every one of those lines contains a
 * "total ascent"), so between them they read all nine and nothing else in any
 * of them.
 *
 * The en dash is matched as either the entity or the literal character.
 * docs/*.html is not uniformly entity-encoded — literal em dashes appear in
 * their hundreds and docs/camino-primitivo.html carries a bare é — so a
 * hand-written "5–410 m" is a shape this has to expect rather than pass over.
 *
 * <thead> between the caption and the tbody is tolerated. No Overview table
 * has one today, but the "Metadata-only variants" table beside the coastal
 * one on docs/camino-portugues.html does, and a header row is an ordinary
 * thing for a table to grow. Requiring <tbody> to follow <caption> meant such
 * a table dropped out of the scan without a word.
 *
 * Rendered figures carry thousands separators ("1,505"), so the commas come
 * out before anything is compared — and go back on for the declared side of
 * every message, so both halves of a comparison read alike.
 */
const KEY_FACTS_TABLE_PATTERN =
  /<caption>(Overview of [^<]*)<\/caption>\s*(?:<thead>[\s\S]*?<\/thead>\s*)?<tbody>([\s\S]*?)<\/tbody>/g;
const KEY_FACTS_ELEVATION_ROW_PATTERN =
  /<tr><th scope="row">Elevation range<\/th><td>([^<]*)<\/td><\/tr>/;
const KEY_FACTS_ELEVATION_RANGE_PATTERN = /(\d[\d,]*)\s*(?:&ndash;|–)\s*(\d[\d,]*)\s*m/;
const KEY_FACTS_ELEVATION_TOTALS_PATTERN =
  /total ascent\s+([\d,]+)\s*m,?\s*descent\s+([\d,]+)\s*m/;

/**
 * The Distance row that sits in the same <tbody>, and the one figure in it
 * that is this section's own length — see checkKeyFacts for why that
 * figure is what pairs a table with a section.
 *
 * Only the leading figure, because a Distance cell carries real editorial
 * prose after it: docs/camino-frances.html:63 reads "764 km (sum of the 33
 * stages below; commonly cited published figures range 780&ndash;800 km
 * depending on edition)" and docs/kumano-kodo-nakahechi.html:63 goes on to
 * name two sibling sections' distances. readmeDistanceKmPattern already takes
 * exactly this reading of the README's own route tables, for the same reason.
 *
 * The cell body is matched across markup rather than with [^<]*, because that
 * nakahechi row links to both siblings' pages from inside its own <td>. The
 * optional "~" is iseji's and ohechi's, whose declared distances are estimates
 * ("~170 km (not measured &mdash; no walked line exists yet)").
 */
const KEY_FACTS_DISTANCE_ROW_PATTERN =
  /<tr><th scope="row">Distance<\/th><td>([\s\S]*?)<\/td><\/tr>/;
const KEY_FACTS_LEADING_DISTANCE_PATTERN = /^\s*~?\s*([\d,]+(?:\.\d+)?)\s*km\b/;

/**
 * The rest of the Overview table. Everything above reads one row; these read
 * the other six, against the same routes/{section}/metadata.json overview and
 * through the same caption anchor and distance pairing.
 *
 * All eleven tables carry all six rows — the six patterns below, scanned over
 * docs/*.html, return 66 matches, which is 11 × 6 — so unlike the elevation
 * row there is no section that deliberately omits one. A missing row is still
 * a silent skip rather than a report, for the same reason Distance is not
 * re-checked here: this guard exists to catch a published figure orphaned by a
 * data correction, not to police which rows a page chooses to publish.
 *
 * Distance is deliberately absent from this list. The pairing already keys on
 * that row, so a Distance cell that drifts from index.json makes its table
 * match no section and is reported there. Checking it again would emit two
 * reports for one edit, and the two would disagree about what the reader is
 * being told to fix.
 *
 * Cells are decoded before anything is matched, so a separator can arrive as
 * an entity or as the literal character without doubling every alternation.
 * Both spellings are live in docs/: `grep -ho '&rarr;' docs/*.html` counts 141
 * and `grep -ho '→' docs/*.html` counts 113 — the arrows in the stage-interior
 * headings ("Ferrol → Neda") are written literally while the Countries cells
 * are written as entities. decodeEntities already carries rarr and ndash, and
 * checkStageInteriors already takes this same decode-then-compare reading of a
 * detail page.
 *
 * Two shapes of cell, and two ways of reading them:
 *
 * Topology, Difficulty and Countries are compared whole, because in all
 * thirty-three of those cells the value is the entire cell — nothing but
 * "Linear", "Expert", "Portugal → Spain". A cell that grows an editorial aside
 * will be reported, and that is the intended reading: these are data cells,
 * and prose about a route's difficulty belongs in the page's own paragraphs,
 * where nothing has to parse it.
 *
 * Typical duration and Start/End are read with anchored patterns, because
 * those cells carry more than the figure. The duration cell states the same
 * three numbers in two different orders — "31 days (range 28&ndash;35)" on
 * nine tables against "9&ndash;14 days (typical 11)" on kumano-kodo-iseji's
 * and kumano-kodo-ohechi's, the same two sections whose figures are declared
 * rather than measured. Both orders are accepted; neither is preferred, and
 * nothing here asks a page to change the one it uses.
 *
 * Start and End are checked on their elevation figure and never on the place
 * name, and that is a limit rather than an oversight. Measured against the
 * committed pages: 7 of the 22 Start/End cells do not contain their own
 * name.en as a substring at all ("K&omacr;yasan" for "Koyasan",
 * "Ry&omacr;zen-ji, Temple 1" for "Ry&omacr;zen-ji (Temple 1)",
 * "Ir&uacute;n, Spain, at the French border" for "Ir&uacute;n, Spain (French
 * border)"), and 10 of the 22 are not equal to it once the elevation figure is
 * taken out (add "Saint-Jean-Pied-de-Port, France" for
 * "Saint-Jean-Pied-de-Port", and the two Santiago cells that append "&mdash;
 * via Arz&uacute;a" and "&mdash; via Melide"). So neither an equality reading
 * nor a containment reading of these cells holds today, and a name check would
 * report between seven and ten correct cells on its first run. Every one of
 * those differences is the page reading better than the datum. Do not tighten
 * this.
 *
 * The elevation figure itself appears in two shapes: parenthesised on
 * eighteen of the twenty-two Start/End rows ("Takijiri-oji (100 m)") and
 * after a comma on iseji's and ohechi's four ("Tanabe, 10 m").
 *
 * Each pattern requires a digit immediately after its delimiter — inside the
 * bracket, or after the comma-space — and that requirement is what keeps a
 * number inside the place name out of the reading. "Porto Cathedral
 * (S&eacute; do Porto) (80 m)" reads 80 rather than failing on the first
 * bracket, and "Ry&omacr;zen-ji, Temple 1 (15 m)" and "&Omacr;kubo-ji, Temple
 * 88 (450 m)" read 15 and 450 rather than a temple number: strip the "m" unit
 * from both patterns and all three still read the same figure, as do the other
 * nineteen, so the unit is not what protects them. What it does guard against
 * is a bracketed figure that is no measurement at all, which no committed cell
 * carries. The comma pattern's \b is load-bearing on its own terms: without
 * it, ", 5 miles from X" matches and yields 5.
 *
 * Where both patterns match one cell, the match with the lower index wins, so
 * the figure the cell states first is the one read. No committed cell matches
 * both — the commas in "Ir&uacute;n, Spain, at the French border (20 m)" and
 * "Ry&omacr;zen-ji, Temple 1 (15 m)" are followed by words, not figures — so
 * this reads all twenty-two exactly as a parenthesised-first order does. It
 * settles a shape whose two halves are already separate habits: comma-form
 * altitudes on iseji's and ohechi's four cells, and trailing "&mdash; …"
 * prose on four others, one of which — camino-portugues' coastal End, "A
 * Guarda, Spain &mdash; border ferry crossing from Caminha (5 m)" — puts its
 * own altitude inside that trailing clause. Written together they give
 * "Pamplona, 446 m &mdash; below Alto del Perd&oacute;n (780 m)", where 446 is
 * the point and 780 a hill it passes.
 */
const KEY_FACTS_DURATION_ROW_PATTERN =
  /<tr><th scope="row">Typical duration<\/th><td>([\s\S]*?)<\/td><\/tr>/;
const KEY_FACTS_TOPOLOGY_ROW_PATTERN =
  /<tr><th scope="row">Topology<\/th><td>([\s\S]*?)<\/td><\/tr>/;
const KEY_FACTS_DIFFICULTY_ROW_PATTERN =
  /<tr><th scope="row">Difficulty<\/th><td>([\s\S]*?)<\/td><\/tr>/;
const KEY_FACTS_COUNTRIES_ROW_PATTERN =
  /<tr><th scope="row">Countries<\/th><td>([\s\S]*?)<\/td><\/tr>/;
const KEY_FACTS_START_ROW_PATTERN =
  /<tr><th scope="row">Start<\/th><td>([\s\S]*?)<\/td><\/tr>/;
const KEY_FACTS_END_ROW_PATTERN = /<tr><th scope="row">End<\/th><td>([\s\S]*?)<\/td><\/tr>/;

const KEY_FACTS_DURATION_TYPICAL_FIRST_PATTERN =
  /^\s*(\d+)\s*days?\s*\(\s*range\s+(\d+)\s*–\s*(\d+)\s*\)/;
const KEY_FACTS_DURATION_RANGE_FIRST_PATTERN =
  /^\s*(\d+)\s*–\s*(\d+)\s*days?\s*\(\s*typical\s+(\d+)\s*\)/;

const KEY_FACTS_POINT_PAREN_ELEVATION_PATTERN = /\((\d[\d,]*)\s*m\)/;
const KEY_FACTS_POINT_COMMA_ELEVATION_PATTERN = /,\s*(\d[\d,]*)\s*m\b/;

const KEY_FACTS_POINT_ROWS: Array<[label: string, pattern: RegExp, field: "startPoint" | "endPoint"]> = [
  ["Start", KEY_FACTS_START_ROW_PATTERN, "startPoint"],
  ["End", KEY_FACTS_END_ROW_PATTERN, "endPoint"],
];

/**
 * Whether a route detail page publishes a Variants section at all. Read
 * against index.json's variants[] for that route by checkVariantsSection, in
 * both directions.
 *
 * The bug: docs/kumano-kodo-nakahechi.html carried an <h2>Variants</h2> whose
 * table presented the Iseji as a variant *of the Nakahechi*, through the
 * release whose whole premise was that the Iseji is a sibling section under a
 * pilgrimage and not a variant of anything. index.json gave that route no
 * variants[] the entire time; docs/routes.html had already dropped the rows,
 * README.md had moved them into the pilgrimage table, and
 * scripts/build-index.test.ts asserts variants === undefined for it. Replayed
 * over `git rev-list --reverse HEAD` (340 commits), scoped to route ids, the
 * two patterns below fire on that page for the 18 commits 44f5543..174b4f7
 * inclusive and on no other route page at any commit in that range.
 *
 * Keyed on the structure — a section heading, or the caption of a variants
 * table — and never on the word "variant". Every use of the word in docs/ today
 * is a legitimate one: `grep -oi variant docs/*.html | wc -l` counts 32
 * occurrences on 29 lines across seven pages, and they are:
 *
 *   - docs/camino-primitivo.html:110,165,168,181,186 — the Hospitales
 *     variant, a higher, more exposed walking alternative to one day of the
 *     Primitivo. It is real, it is described five times, and it is not in that
 *     route's variants[]: no directory, no distanceKm, nothing for a data
 *     check to compare against. Editorial prose about a way to walk a stage is
 *     not a published variant.
 *   - docs/camino-norte.html:173,177,494 — the coastal variant of the Norte,
 *     the same shape: three mentions inside stage narratives, no variants[].
 *   - docs/camino-portugues.html:7,203,395,396 — a meta description, a
 *     sentence about choosing "the longer forest variant", a paragraph of
 *     history, and a file path (routes/camino-portugues/variants/coastal/,
 *     which alone accounts for three of the 32).
 *   - docs/contribute.html:58 — a "wanted" tag naming two stubs.
 *   - docs/routes.html:347,399,400,402,405,425 — the catalog's own variants
 *     table, plus a waypoint-table caption that mentions the Coastal variant
 *     in passing.
 *   - docs/kumano-kodo-nakahechi.html:63 — and this is the one that settles
 *     it. That line is the Distance cell b11701e wrote to *fix* the bug: "The
 *     Kohechi and the Iseji are sibling sections, not variants of this one".
 *     The sentence denying the relationship contains the word. A keyword rule
 *     scoped to route ids fires on camino-primitivo for 215 commits, on
 *     camino-norte for 196, and on kumano-kodo-nakahechi for 24 — the 18 with
 *     the bug plus the 6 since the fix, still red on the corrected page.
 *
 * Scoped to index.json's route ids in the per-route loop, never over
 * docs/*.html. Unscoped, these same patterns fire on docs/routes.html for 217
 * of the 340 commits: that page is the catalog, it carries every route's
 * variants under one <h2>Variants</h2>, and it has no route id of its own to
 * look variants[] up by. checkKeyFacts and checkTerrainNotesDistance, the
 * checks added in the three commits before this one, are scoped the same way.
 *
 * Two anchors, because a page can publish the section under either. The
 * heading is the section marker (docs/camino-ingles.html:241,
 * docs/camino-portugues.html:325, and its <h3>Other Variants</h3> at :398);
 * the caption is the table's own (docs/camino-ingles.html:243,
 * docs/camino-portugues.html:400, and the deleted nakahechi table's
 * "Metadata-only variants of the Kumano Kodo."). Firing on either means a
 * variants table left behind under a renamed heading is still caught — and
 * that is the whole reason the caption anchor is here, since every page that
 * carries a variants table today also carries the heading above it.
 *
 * Four committed captions name a variant. The caption pattern requires
 * "variants of", which is what the two on route pages say and what the two on
 * docs/routes.html do not: :347 is a waypoint table mentioning the Coastal
 * variant in passing, correctly passed over, and :402 is a real variants table
 * captioned "Pilgrimage route variants, their parent route, and data
 * completeness", which this pattern would miss. That is a known limit rather
 * than an oversight — routes.html is out of scope, and a variants table
 * captioned that way on a route page would still be caught by its heading.
 *
 * Heading text is matched whole, not as a substring. Across all 340 commits,
 * exactly two heading texts in docs/*.html have ever contained the word —
 * <h2>Variants</h2> and <h3>Other Variants</h3>, 856 and 215 matches
 * respectively over every page at every commit, and nothing else at all.
 * Requiring the whole text is what keeps b11701e's replacement heading —
 * <h2>The Other Ways</h2>, over prose that links all four sections — out of
 * the reading.
 *
 * These read presence only, and deliberately not the table under the heading.
 * docs/camino-portugues.html:337 puts a full Overview table *inside* its
 * <h2>Variants</h2> section, for the coastal variant; any rule that tried to
 * parse "the table belonging to the Variants heading" would have to decide
 * which of the two it meant. Presence has no such question to answer.
 *
 * KEY_FACTS_TABLE_PATTERN's caption-anchored parse was the obvious thing to
 * reuse and does not fit: it exists to hand a <tbody> to the row readers, and
 * this check never opens a table body. What it does borrow is that pattern's
 * lesson — anchor on the <caption>, because a table can sit under a heading
 * that says nothing about it.
 */
const VARIANTS_SECTION_HEADING_PATTERN = /<h([23])(?:\s[^>]*)?>\s*(?:Other\s+)?Variants\s*<\/h\1>/i;
const VARIANTS_TABLE_CAPTION_PATTERN = /<caption>[^<]*\bvariants\s+of\b[^<]*<\/caption>/i;

function normalizedCell(rendered: string): string {
  return decodeEntities(rendered).replace(/\s+/g, " ").trim();
}

function figureFromCell(rendered: string): number {
  return Number(rendered.replace(/,/g, ""));
}

/**
 * Whichever of two matches sits earlier in the string it was matched against.
 * exec rather than match because only RegExpExecArray types index as present,
 * and both callers pass non-global patterns, which carry no lastIndex state
 * between calls.
 */
function earlierMatch(
  first: RegExpExecArray | null,
  second: RegExpExecArray | null,
): RegExpExecArray | null {
  if (first === null) return second;
  if (second === null) return first;
  return first.index <= second.index ? first : second;
}

/**
 * terrainNotes prose mentions kilometres constantly without describing the
 * stage's own length: a mid-stage split point ("split this stage at Pasaia
 * (~10 km)"), an alternative nobody walks ("walking around the bay instead is
 * about 35 km of industrial road"), a sub-segment ("17 km stretch without any
 * villages", "660 m elevation gain in the final 12 km"), a neighbouring
 * route's length ("the Valcarlos Route … longer at 28 km"), a distance still
 * to run ("102 km to Santiago"), or a gap between two landmarks ("The longest
 * gap: 80.7 km from Temple 37 to Temple 38"). A "km figure near the word
 * stage" pattern flags all of those. So the rule is not proximity — it is
 * that the figure has to be asserted *as* the stage's own length.
 *
 * Across every terrainNotes string in routes/<id>/stages.json, exactly five
 * stages assert that, in four grammatical shapes, and those four shapes are
 * what the patterns below encode. In every one, the figure is predicated of a
 * noun that denotes this stage — "day", "stage", or the pronoun "its". In
 * every false positive above, it is predicated of something else: a place, a
 * segment, a variant, a gap, a road, a destination. That is the distinction,
 * and it is a lexical one the corpus makes consistently.
 *
 * The hard case is camino-norte stage 12, whose single sentence contains both
 * a true claim and a false one: "The 18.6 km measures the whole stage, ferry
 * included; about 1.8 km of that is the crossing, so roughly 16.8 km is on
 * foot." 16.8 is deliberately not distanceKm — it is the walking portion. No
 * sentence- or clause-window can separate the two, but the predicate can:
 * FIGURE_IS_THE_STAGE requires the complement to be the stage itself ("the
 * whole stage"), which "the crossing" and "on foot" are not.
 */
const TERRAIN_NOTES_DISTANCE_PATTERNS = [
  // "The day is 15.3 km" — the stage-noun is the subject of a measuring verb.
  // The verb has to sit immediately after the noun, so "split this stage at
  // Pasaia (~10 km)" cannot reach it.
  /\b(?:day|stage)\s+(?:is|covers|totals|measures|spans)\s+(?:about\s+|roughly\s+|approximately\s+|around\s+|~\s*)?(\d+(?:\.\d+)?)\s*km\b/gi,

  // "Longest day of the Camino Primitivo at 30.5 km", "The longest single
  // stage of the Norte — 39.8 km": the figure is an appositive to a
  // stage-noun that *heads* its clause. Three guards keep this off the
  // asides. The noun must follow a sentence boundary behind nothing but a
  // determiner and modifiers — a demonstrative inside that run means an
  // earlier verb took the stage as its object ("pilgrims split this stage"),
  // not that the clause is about the stage. The span to the connector cannot
  // cross a sentence end or enter a parenthetical. And the figure must follow
  // the connector immediately, which is why "at Pasaia (~10 km)" and "at
  // Islares" fall out: those "at"s govern a place, not a distance. A comma is
  // deliberately not an accepted connector — "(La Salvé, 5 km)" shows why.
  /(?:^|[.;]\s+)(?:the|a|an|another|this)?\s*(?:(?!(?:this|that|these|those|it)\b)[^\s.;()]+\s+){0,4}?(?:day|stage)\b[^.;(),]{0,45}?(?:\bat\b|[—–:])\s*(?:about\s+|roughly\s+|approximately\s+|around\s+|~\s*)?(\d+(?:\.\d+)?)\s*km\b/gi,

  // "make this feel longer than its 28 km" — a possessive whose only possible
  // antecedent inside a stage's own terrainNotes is that stage.
  /\b(?:its|(?:this|the)\s+(?:day|stage)['’]s)\s+(?:about\s+|roughly\s+|approximately\s+|around\s+|~\s*)?(\d+(?:\.\d+)?)\s*km\b/gi,

  // "The 18.6 km measures the whole stage" — figure first, stage-noun as the
  // complement. Requiring that complement is what keeps the sibling clauses
  // "1.8 km of that is the crossing" and "16.8 km is on foot" silent.
  /\bthe\s+(\d+(?:\.\d+)?)\s*km\s+(?:is|covers|measures|spans|totals)\s+the\s+(?:whole\s+|entire\s+|full\s+)?(?:day|stage)\b/gi,
] as const;

const GLYPHS_JS_KEY_PATTERN = /^\s*"([^"]+)":/gm;

// Every script docs/*.html is allowed to reference. A page can be revealed
// by CSS on the <html class="js"> hook (see routes.html's filter panel)
// without its behaviour script running at all if the <script> tag or the
// file itself goes missing — nothing else catches that. Keeping this list
// hand-maintained, rather than derived from what's on disk, is the point:
// a stray script left behind by a removed feature should be reported, not
// silently grandfathered in because it exists.
const KNOWN_SCRIPTS = new Set(["hero.js", "route-sort.js", "route-filter.js", "cdn-preview.js"]);

// bestMonths is not in schema/pilgrimage.schema.json's overview.required, so
// a schema-valid route can legitimately omit it — every field below is
// therefore independently optional. Missing/invalid fields are `undefined`,
// not a reason to bail out of the other three: readRouteFilterOverview used
// to return null (skip everything) the moment any one of the four was
// missing, so a route without bestMonths silently disabled its days/
// distanceKm/difficulty checks too.
interface RouteFilterOverview {
  days?: number;
  distanceKm?: number;
  difficulty?: string;
  bestMonths?: number[];
}

interface MetadataOverviewLike {
  distanceKm?: unknown;
  difficulty?: unknown;
  bestMonths?: unknown;
  estimatedDays?: { typical?: unknown; min?: unknown; max?: unknown };
  elevationRange?: unknown;
  topology?: unknown;
  countries?: unknown;
  startPoint?: unknown;
  endPoint?: unknown;
}

interface MetadataLike {
  overview?: MetadataOverviewLike;
  metadataOnly?: unknown;
}

function isMetadataLike(value: unknown): value is MetadataLike {
  return typeof value === "object" && value !== null;
}

/**
 * The route chooser filter (docs/route-filter.js) reads days/distance/
 * difficulty/best-months straight off each route-card's data-* attributes
 * instead of a duplicated dataset — see docs/routes.html. This is the
 * independent source of truth those attributes are checked against below.
 * Returns null only when metadata.json itself is missing, unparsable, or has
 * no overview object at all — that shape of problem is npm run validate's
 * job to report. Once there's an overview object, each field is read on its
 * own: a missing or wrong-typed field is left undefined on the result rather
 * than discarding the other three.
 */
function readRouteFilterOverview(routeDir: string): RouteFilterOverview | null {
  const metaPath = join(routeDir, "metadata.json");
  if (!existsSync(metaPath)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(metaPath, "utf-8"));
  } catch {
    return null;
  }

  if (!isMetadataLike(parsed) || typeof parsed.overview !== "object" || parsed.overview === null) {
    return null;
  }

  const { distanceKm, difficulty, bestMonths, estimatedDays } = parsed.overview;
  const days = estimatedDays?.typical;

  const overview: RouteFilterOverview = {};
  if (typeof days === "number") overview.days = days;
  if (typeof distanceKm === "number") overview.distanceKm = distanceKm;
  if (typeof difficulty === "string") overview.difficulty = difficulty;
  if (Array.isArray(bestMonths) && bestMonths.every((m): m is number => typeof m === "number")) {
    overview.bestMonths = bestMonths;
  }

  return overview;
}

/**
 * Spec §4.3 lets a section ship with no walked line at all, and every check
 * over a file derived from geometry has to let it — build-assets.ts skips
 * writing those files for exactly this shape, so demanding them would fail
 * forever. What those checks must not do is read that intent off the absence
 * of routes/{id}/route.geojson alone: a section that should have geometry and
 * never got it — a new one cut without npm run fetch-osm — is byte-identical
 * on disk to one that never can have any, and would silently take the same
 * exemption. Nothing else catches that either; validate's validateFile
 * returns without a word on a file that isn't there.
 *
 * So the exemption is granted against something the section says about
 * itself. metadataOnly is single-purpose: a section that ships a line never
 * carries it, which is the reason osm.note — the nearest existing field —
 * could not do this job, since the Kohechi and the Nakahechi both carry one
 * alongside a full route.geojson.
 */
function declaresMetadataOnly(routeDir: string): boolean {
  const metaPath = join(routeDir, "metadata.json");
  if (!existsSync(metaPath)) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(metaPath, "utf-8"));
  } catch {
    return false; // an unparsable metadata.json is npm run validate's job
  }

  if (!isMetadataLike(parsed)) return false;
  return typeof parsed.metadataOnly === "string" && parsed.metadataOnly.trim().length > 0;
}

interface DeclaredElevationRange {
  minMeters?: number;
  maxMeters?: number;
  totalAscentMeters?: number;
  totalDescentMeters?: number;
}

/**
 * The figures a Key Facts elevation cell is checked against, read straight
 * from a section's own metadata.json — a route directory's or a variant's,
 * the shape is the same. Every field is independently optional because the
 * data makes them so: kumano-kodo-iseji declares a min and a max and no
 * totals, having no line to derive totals from. Returns null when there is no
 * elevationRange to compare against at all, which is not a problem — see
 * KEY_FACTS_TABLE_PATTERN on why the row is optional in both directions.
 */
function readDeclaredElevationRange(sectionDir: string): DeclaredElevationRange | null {
  const metaPath = join(sectionDir, "metadata.json");
  if (!existsSync(metaPath)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(metaPath, "utf-8"));
  } catch {
    return null; // an unparsable metadata.json is npm run validate's job
  }

  if (!isMetadataLike(parsed)) return null;
  const range = parsed.overview?.elevationRange;
  if (typeof range !== "object" || range === null) return null;

  const { minMeters, maxMeters, totalAscentMeters, totalDescentMeters } =
    range as Record<string, unknown>;

  const declared: DeclaredElevationRange = {};
  if (typeof minMeters === "number") declared.minMeters = minMeters;
  if (typeof maxMeters === "number") declared.maxMeters = maxMeters;
  if (typeof totalAscentMeters === "number") declared.totalAscentMeters = totalAscentMeters;
  if (typeof totalDescentMeters === "number") declared.totalDescentMeters = totalDescentMeters;

  return declared;
}

interface DeclaredKeyFacts {
  typicalDays?: number;
  minDays?: number;
  maxDays?: number;
  topology?: string;
  difficulty?: string;
  countries?: string[];
  startElevationMeters?: number;
  endElevationMeters?: number;
}

/**
 * The other six Key Facts rows' figures, read from the same section
 * metadata.json readDeclaredElevationRange above reads. Separate from that
 * reader rather than folded into it because the two answer different
 * questions: a null there means "this section declares no elevationRange", a
 * meaningful and common state that the caller skips on. There is no equivalent
 * here — a section that declares none of these six fields is schema-invalid,
 * which validate reports — so this returns null only when metadata.json is
 * missing or unparsable, and otherwise a record of whatever it found.
 *
 * Every field is independently optional even though schema/pilgrimage.schema.json
 * puts estimatedDays, topology, startPoint and difficulty in overview.required.
 * countries and endPoint are genuinely optional there, estimatedDays.typical is
 * optional inside its own object, and a NamedLocation's coordinates may be a
 * [lon, lat] pair with no third element. A field this reader did not find is a
 * cell that goes uncompared, never a report: this guard exists to catch a
 * published figure that drifted from its data, and a route with no data to
 * drift from is validate's problem, not this one's.
 */
function readDeclaredKeyFacts(sectionDir: string): DeclaredKeyFacts | null {
  const metaPath = join(sectionDir, "metadata.json");
  if (!existsSync(metaPath)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(metaPath, "utf-8"));
  } catch {
    return null; // an unparsable metadata.json is npm run validate's job
  }

  if (!isMetadataLike(parsed)) return null;
  const overview = parsed.overview;
  if (typeof overview !== "object" || overview === null) return null;

  const { estimatedDays, topology, difficulty, countries, startPoint, endPoint } = overview;

  const declared: DeclaredKeyFacts = {};

  if (typeof estimatedDays === "object" && estimatedDays !== null) {
    const { typical, min, max } = estimatedDays;
    if (typeof typical === "number") declared.typicalDays = typical;
    if (typeof min === "number") declared.minDays = min;
    if (typeof max === "number") declared.maxDays = max;
  }

  if (typeof topology === "string") declared.topology = topology;
  if (typeof difficulty === "string") declared.difficulty = difficulty;
  if (Array.isArray(countries) && countries.every((c): c is string => typeof c === "string")) {
    declared.countries = countries;
  }

  const startElevation = pointElevation(startPoint);
  if (startElevation !== undefined) declared.startElevationMeters = startElevation;
  const endElevation = pointElevation(endPoint);
  if (endElevation !== undefined) declared.endElevationMeters = endElevation;

  return declared;
}

function pointElevation(point: unknown): number | undefined {
  if (typeof point !== "object" || point === null) return undefined;
  const { coordinates } = point as Record<string, unknown>;
  if (!Array.isArray(coordinates)) return undefined;
  const altitude = coordinates[2];
  return typeof altitude === "number" ? altitude : undefined;
}

const ROUTE_FILTER_ATTRS: Array<[string, (overview: RouteFilterOverview) => string | undefined]> = [
  ["data-days", (o) => (o.days === undefined ? undefined : String(o.days))],
  ["data-distance-km", (o) => (o.distanceKm === undefined ? undefined : String(o.distanceKm))],
  ["data-difficulty", (o) => o.difficulty],
  ["data-best-months", (o) => (o.bestMonths === undefined ? undefined : o.bestMonths.join(","))],
];

const CARD_OPEN = '<div class="route-card"';
const GROUP_OPEN = '<div class="route-group"';

/**
 * Finds the opening <div class="route-card" ...> tag for a given route id by
 * walking backward from its "/{id}" link, rather than a single regex over
 * the whole grid — cards are visually identical apart from their data-*
 * attributes, so nothing else reliably ties a tag back to one specific route.
 */
function findRouteCardIndex(html: string, id: string): number | null {
  const hrefIndex = html.indexOf(`href="/${id}"`);
  if (hrefIndex === -1) return null;

  const cardOpenIndex = html.lastIndexOf(CARD_OPEN, hrefIndex);
  return cardOpenIndex === -1 ? null : cardOpenIndex;
}

function findRouteCardOpenTag(html: string, id: string): string | null {
  const cardOpenIndex = findRouteCardIndex(html, id);
  if (cardOpenIndex === null) return null;

  const tagEndIndex = html.indexOf(">", cardOpenIndex);
  if (tagEndIndex === -1) return null;

  return html.slice(cardOpenIndex, tagEndIndex + 1);
}

/**
 * Where the `<div class="route-group">` opening at `start` closes. Nothing in
 * the markup marks a group's own closing tag, so this counts div nesting
 * forward from the opening one — the same "walk out from a known anchor"
 * approach findRouteCardOpenTag takes, rather than a parser this repo has no
 * reason to grow.
 */
function routeGroupEnd(html: string, start: number): number {
  const divTags = /<div\b|<\/div>/g;
  divTags.lastIndex = start;
  let depth = 0;

  for (let match = divTags.exec(html); match !== null; match = divTags.exec(html)) {
    depth += match[0] === "</div>" ? -1 : 1;
    if (depth === 0) return match.index;
  }

  return html.length;
}

/**
 * The pilgrimage whose heading a card sits under, or null if it sits under
 * none. The id is read from the group's heading link — the region before its
 * first card, so a group whose heading is missing reads as ungrouped rather
 * than borrowing the first card's own href.
 */
function pilgrimageGroupOf(html: string, cardIndex: number): string | null {
  for (let start = html.indexOf(GROUP_OPEN); start !== -1; ) {
    const end = routeGroupEnd(html, start);
    if (cardIndex > start && cardIndex < end) {
      const group = html.slice(start, end);
      const firstCard = group.indexOf(CARD_OPEN);
      const heading = group.slice(0, firstCard === -1 ? group.length : firstCard);
      const link = heading.match(/href="\/([^"]+)"/);
      return link ? link[1] : null;
    }
    start = html.indexOf(GROUP_OPEN, Math.max(end, start + 1));
  }

  return null;
}

function readDataAttr(openTag: string, attr: string): string | undefined {
  const match = openTag.match(new RegExp(`${attr}="([^"]*)"`));
  return match ? match[1] : undefined;
}

const DIFFICULTY_SELECT_PATTERN = /<select id="filter-difficulty"[^>]*>([\s\S]*?)<\/select>/;
const OPTION_VALUE_PATTERN = /<option value="([^"]*)"/g;

interface DifficultySchemaLike {
  properties?: {
    overview?: {
      properties?: {
        difficulty?: {
          enum?: unknown;
        };
      };
    };
  };
}

function isDifficultySchemaLike(value: unknown): value is DifficultySchemaLike {
  return typeof value === "object" && value !== null;
}

/**
 * schema/pilgrimage.schema.json is this guard's source of truth for the
 * difficulty vocabulary — docs/routes.html's filter is checked against it,
 * not the other way round, so the two can't drift silently in either
 * direction. Degrades to null (skip the check) rather than throwing: unlike
 * index.json, a missing or reshaped schema file here isn't this guard's
 * story to tell, and the fixture roots in check-site.test.ts have no
 * schema/ directory at all.
 */
function readDifficultyEnum(root: string): string[] | null {
  const schemaPath = join(root, "schema", "pilgrimage.schema.json");
  if (!existsSync(schemaPath)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(schemaPath, "utf-8"));
  } catch {
    return null;
  }

  if (!isDifficultySchemaLike(parsed)) return null;
  const enumValues = parsed.properties?.overview?.properties?.difficulty?.enum;
  if (!Array.isArray(enumValues) || !enumValues.every((v): v is string => typeof v === "string")) {
    return null;
  }

  return enumValues;
}

export interface Problem {
  file: string;
  message: string;
}

export interface PageOverrides {
  indexHtml?: string;
  routesHtml?: string;
  readmeMd?: string;
}

interface IndexVariantShape {
  id: string;
  distanceKm: number;
}

function isIndexVariantShape(value: unknown): value is IndexVariantShape {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { distanceKm?: unknown }).distanceKm === "number"
  );
}

interface IndexRouteShape {
  id: string;
  pilgrimage?: string;
  distanceKm?: number;
  variants?: IndexVariantShape[];
}

function isIndexRouteShape(value: unknown): value is IndexRouteShape {
  if (typeof value !== "object" || value === null) return false;
  const route = value as {
    id?: unknown;
    pilgrimage?: unknown;
    distanceKm?: unknown;
    variants?: unknown;
  };
  if (typeof route.id !== "string") return false;
  if (route.pilgrimage !== undefined && typeof route.pilgrimage !== "string") return false;
  if (route.distanceKm !== undefined && typeof route.distanceKm !== "number") return false;
  if (route.variants === undefined) return true;
  return Array.isArray(route.variants) && route.variants.every(isIndexVariantShape);
}

interface IndexRoute {
  id: string;
  pilgrimage?: string;
  distanceKm?: number;
  variants: IndexVariantShape[];
}

/**
 * index.json is this guard's source of truth for which routes — and which
 * variants — must exist everywhere else. A malformed file here should fail
 * loudly and immediately — not degrade into an empty list that silently
 * reports the site as clean because there was nothing left to check against.
 */
function readIndexRoutes(indexPath: string): IndexRoute[] {
  if (!existsSync(indexPath)) {
    throw new Error(`${indexPath}: file not found`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(indexPath, "utf-8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${indexPath}: not valid JSON (${reason})`);
  }

  const routes = (parsed as { routes?: unknown } | null)?.routes;

  if (!Array.isArray(routes) || !routes.every(isIndexRouteShape)) {
    throw new Error(
      `${indexPath}: expected { routes: Array<{ id: string, variants?: Array<{ id: string, distanceKm: number }> }> }, got something else`,
    );
  }

  return routes.map((route) => ({
    id: route.id,
    pilgrimage: route.pilgrimage,
    distanceKm: route.distanceKm,
    variants: route.variants ?? [],
  }));
}

interface IndexPilgrimage {
  id: string;
  sections: string[];
}

function isIndexPilgrimageShape(value: unknown): value is IndexPilgrimage {
  if (typeof value !== "object" || value === null) return false;
  const pilgrimage = value as { id?: unknown; sections?: unknown };
  if (typeof pilgrimage.id !== "string") return false;
  return (
    Array.isArray(pilgrimage.sections) &&
    pilgrimage.sections.every((section): section is string => typeof section === "string")
  );
}

/**
 * readIndexRoutes has already thrown on a missing or malformed index.json by
 * the time this runs, so this reader can parse without repeating those guards.
 * What it does repeat is that reader's refusal to degrade: `String(p.id)` and
 * an `Array.isArray(...) ? ... : []` fallback turned a reshaped pilgrimages[]
 * into an empty list, and an empty list silently switches off every
 * pilgrimage check below — a clean report about nothing. An absent field is
 * the one thing that legitimately means "no pilgrimages"; a present one that
 * is the wrong shape is reported.
 */
function readIndexPilgrimages(indexPath: string): IndexPilgrimage[] {
  const parsed = JSON.parse(readFileSync(indexPath, "utf-8")) as { pilgrimages?: unknown };
  if (parsed.pilgrimages === undefined) return [];

  if (!Array.isArray(parsed.pilgrimages) || !parsed.pilgrimages.every(isIndexPilgrimageShape)) {
    throw new Error(
      `${indexPath}: expected { pilgrimages?: Array<{ id: string, sections: string[] }> }, got something else`,
    );
  }

  return parsed.pilgrimages.map((pilgrimage) => ({
    id: pilgrimage.id,
    sections: pilgrimage.sections,
  }));
}

function isExternalOrAnchor(href: string): boolean {
  return /^(https?:|mailto:|tel:|#)/.test(href);
}

/**
 * Every route id whose roads corridor is actually referenced by a real
 * `<img class="route-hero-roads" … src="assets/roads/{id}.svg">` in this
 * page — the only markup shape that makes the corridor render. Requiring
 * both the class and the src on the same tag, rather than matching
 * `assets/roads/{id}.svg` anywhere in the raw HTML, means deleting the hero
 * `<img>` while leaving a stray mention behind (a comment, a footer link, a
 * copy-pasted code sample) no longer satisfies the guard.
 */
function roadsHeroReferencedIds(html: string): Set<string> {
  const ids = new Set<string>();

  for (const [tag] of html.matchAll(ROADS_HERO_IMG_PATTERN)) {
    if (!ROADS_HERO_CLASS_PATTERN.test(tag)) continue;
    const srcMatch = tag.match(ROADS_HERO_SRC_PATTERN);
    if (srcMatch) ids.add(srcMatch[1]);
  }

  return ids;
}

export function checkSite(root: string, overrides: PageOverrides = {}): Problem[] {
  const problems: Problem[] = [];
  const add = (file: string, message: string): void => {
    problems.push({ file, message });
  };

  const docs = join(root, "docs");
  const readDocsFile = (...parts: string[]): string => {
    const path = join(docs, ...parts);
    return existsSync(path) ? readFileSync(path, "utf-8") : "";
  };

  const indexPath = join(root, "index.json");
  const indexRoutes = readIndexRoutes(indexPath);
  const ids = indexRoutes.map((route) => route.id);
  const routeIdSet = new Set(ids);
  const pilgrimages = readIndexPilgrimages(indexPath);
  const pilgrimageIds = new Set(pilgrimages.map((p) => p.id));
  // A pilgrimage has no directory but does have a page, and both live in the
  // same flat namespace under open.pilgrimag.es.
  const pageIds = new Set([...routeIdSet, ...pilgrimageIds]);
  const indexRouteById = new Map(indexRoutes.map((route) => [route.id, route]));
  const stats = computeStats(root);
  const statsById = new Map(stats.routes.map((route) => [route.id, route]));

  const indexHtml = overrides.indexHtml ?? readDocsFile("index.html");
  const routesHtml = overrides.routesHtml ?? readDocsFile("routes.html");
  const readmePath = join(root, "README.md");
  const readmeMd =
    overrides.readmeMd ?? (existsSync(readmePath) ? readFileSync(readmePath, "utf-8") : "");
  const glyphsJs = readDocsFile("assets", "glyphs.js");

  function checkInlinedAsset(kind: AssetKind, assetId: string, pages: Array<[string, string]>): void {
    const svgPath = join(docs, "assets", kind, `${assetId}.svg`);
    if (!existsSync(svgPath)) return;

    const d = extractPathD(readFileSync(svgPath, "utf-8"));
    if (!d) return;

    for (const [file, html] of pages) {
      if (!html.includes(d)) {
        add(
          file,
          `inlined ${ASSET_LABELS[kind]} does not match docs/assets/${kind}/${assetId}.svg (run npm run build-assets and re-inline)`,
        );
      }
    }
  }

  /**
   * The one check that catches route.gpx silently drifting from the geometry
   * it was generated from: comparing its <trkpt> count against
   * computeStats()'s independently-derived routePoints. CI's other guard —
   * the byte-for-byte regeneration diff against a fresh npm run build-assets
   * — also catches this, but only as part of a full CI run; this one works
   * against whatever is on disk right now, no build step required, so it
   * catches a hand-edited file locally too.
   */
  function checkRouteGpx(id: string, metadataOnly: boolean): void {
    const gpxPath = join(root, "routes", id, "route.gpx");
    const geojsonPath = join(root, "routes", id, "route.geojson");
    const file = `routes/${id}/route.gpx`;

    // Spec §4.3: a section that declares itself metadata-only has no
    // route.geojson to derive a GPX track from — build-assets.ts already
    // skips writing one for exactly this reason (see its own "missing inputs
    // are skipped" comment). Neither file will ever exist for such a
    // section, so there is nothing here to compare. A section missing both
    // that declares nothing is the accident case, and falls through to the
    // missing-route.gpx report below — see declaresMetadataOnly for why the
    // declaration and not the absence.
    if (metadataOnly && !existsSync(gpxPath) && !existsSync(geojsonPath)) return;

    if (!existsSync(gpxPath)) {
      add(file, `route "${id}" has no route.gpx — run npm run build-assets`);
      return;
    }

    const gpx = readFileSync(gpxPath, "utf-8");
    if (gpx.trim().length === 0) {
      add(file, `route.gpx for "${id}" is empty — run npm run build-assets`);
      return;
    }

    const trkptCount = (gpx.match(TRKPT_PATTERN) ?? []).length;
    const expected = statsById.get(id)?.routePoints ?? 0;
    if (trkptCount !== expected) {
      add(
        file,
        `route.gpx for "${id}" has ${trkptCount} <trkpt> point(s), data says ${expected} — run npm run build-assets`,
      );
    }
  }

  /**
   * The roads corridor SVG is fetched offline (see roads.ts) and can't be
   * regenerated by CI, so it can silently go stale against a route.geojson
   * that was corrected or re-fetched after the SVG was last built. The
   * embedded geometry-hash in its <metadata> is the only thing that can
   * catch that: this recomputes the same hash from the current
   * route.geojson and compares, the same way checkRouteGpx compares a
   * <trkpt> count rather than trusting the file exists. It also checks that
   * the <path d> actually carries road geometry — a file can be non-empty,
   * well-formed, and hash-correct while still rendering nothing, if the
   * cache it was built from came back empty. Every id this is called with
   * (every route, plus the coastal variant) is expected to have its own
   * route.geojson, so a missing one is reported rather than silently
   * skipped — otherwise a moved or renamed route/variant directory would
   * quietly turn the whole staleness check off.
   */
  function checkRoadsAsset(assetId: string, geojsonPath: string, metadataOnly = false): void {
    const svgPath = join(docs, "assets", "roads", `${assetId}.svg`);
    const file = `docs/assets/roads/${assetId}.svg`;

    // Spec §4.3: a section that declares itself metadata-only has neither a
    // route.geojson to build a roads corridor from, nor an SVG built from
    // one — build-assets.ts already skips writing it for exactly that
    // reason. Two other shapes look similar and are both still reported: an
    // SVG that exists with no route.geojson behind it (a moved or renamed
    // route directory — see the doc comment above), and a section missing
    // both while declaring nothing, which is a section whose geometry was
    // never fetched rather than one that can never have any.
    if (metadataOnly && !existsSync(svgPath) && !existsSync(geojsonPath)) return;

    if (!existsSync(svgPath)) {
      add(
        file,
        `route "${assetId}" has no roads corridor SVG — run npm run fetch-roads && npm run build-roads`,
      );
      return;
    }

    const svg = readFileSync(svgPath, "utf-8");
    if (svg.trim().length === 0) {
      add(file, `roads corridor SVG for "${assetId}" is empty — run npm run build-roads`);
      return;
    }

    if (!isWellFormedXml(svg)) {
      add(file, `roads corridor SVG for "${assetId}" is not well-formed XML`);
      return;
    }

    // Well-formed XML with a correct geometry hash and a literal `d=""` is
    // exactly what an empty or all-outside-corridor Overpass response
    // renders as — see roadsSvgFrom/buildRoads, which now also refuses to
    // *write* that shape. This is the other end of the same guard: a file
    // that reached this point some other way (an older build, a hand edit)
    // still gets caught.
    const pathMatch = svg.match(ROADS_PATH_D_PATTERN);
    const subpaths = (pathMatch?.[1].match(/M/g) ?? []).length;
    if (subpaths < ROADS_MIN_SUBPATHS) {
      add(
        file,
        `roads corridor SVG for "${assetId}" renders an empty corridor (its <path d> carries no ` +
          `road geometry) — run npm run fetch-roads && npm run build-roads`,
      );
      return;
    }

    const hashMatch = svg.match(ROADS_GEOMETRY_HASH_PATTERN);
    if (!hashMatch) {
      add(
        file,
        `roads corridor SVG for "${assetId}" has no embedded geometry-hash in its <metadata>`,
      );
      return;
    }

    if (!existsSync(geojsonPath)) {
      add(
        file,
        `roads corridor SVG for "${assetId}" has no route.geojson at ${geojsonPath} to check its ` +
          `embedded geometry-hash against — the staleness guard cannot confirm it isn't stale`,
      );
      return;
    }

    let geo: unknown;
    try {
      geo = JSON.parse(readFileSync(geojsonPath, "utf-8"));
    } catch {
      return; // malformed route.geojson is npm run validate's job to report
    }

    const expected = hashRouteGeometry(geo);
    if (hashMatch[1] !== expected) {
      add(
        file,
        `roads corridor SVG for "${assetId}" was rendered against stale route geometry ` +
          `(embedded hash ${hashMatch[1]}, current route.geojson hashes to ${expected}) — ` +
          `run npm run fetch-roads && npm run build-roads`,
      );
    }
  }

  /**
   * checkRouteGpx() above only walks index.json's top-level route ids, so
   * routes/camino-portugues/variants/coastal/route.gpx — a real, committed,
   * 5,546-point file that the rest of this guard already special-cases for
   * glyph, profile, and sparkline drift — got no existence or point-count
   * check at all. computeStats() doesn't compute a per-variant point total,
   * so this reads the variant's own route.geojson and derives one the same
   * way computeStats() does, rather than looking it up by id.
   */
  function checkCoastalVariantGpx(): void {
    const variantDir = join(root, "routes", "camino-portugues", "variants", "coastal");
    const geojsonPath = join(variantDir, "route.geojson");
    if (!existsSync(geojsonPath)) return; // no geometry yet — nothing to compare against

    let geo: unknown;
    try {
      geo = JSON.parse(readFileSync(geojsonPath, "utf-8"));
    } catch {
      return; // malformed route.geojson is npm run validate's job to report
    }

    const expected = segmentsOf(geo).reduce((sum, segment) => sum + segment.length, 0);
    const gpxPath = join(variantDir, "route.gpx");
    const file = "routes/camino-portugues/variants/coastal/route.gpx";

    if (!existsSync(gpxPath)) {
      add(file, `route "${COASTAL_VARIANT_ASSET_ID}" has no route.gpx — run npm run build-assets`);
      return;
    }

    const gpx = readFileSync(gpxPath, "utf-8");
    if (gpx.trim().length === 0) {
      add(file, `route.gpx for "${COASTAL_VARIANT_ASSET_ID}" is empty — run npm run build-assets`);
      return;
    }

    const trkptCount = (gpx.match(TRKPT_PATTERN) ?? []).length;
    if (trkptCount !== expected) {
      add(
        file,
        `route.gpx for "${COASTAL_VARIANT_ASSET_ID}" has ${trkptCount} <trkpt> point(s), data says ${expected} — run npm run build-assets`,
      );
    }
  }

  /**
   * Task 1 shipped GPX generation, but nothing linked to it: every detail
   * page's Files & CDN table listed metadata.json/route.geojson/stages.json/
   * waypoints.geojson/stats.json and left route.gpx to be guessed at. This
   * only checks that the page links its own route.gpx somewhere — it
   * doesn't care whether that's a table row, the jsDelivr code block, or
   * both.
   */
  function checkRouteGpxLink(id: string, detailHtml: string): void {
    const file = `docs/${id}.html`;
    if (!detailHtml.includes(`routes/${id}/route.gpx`)) {
      add(
        file,
        `route "${id}" detail page has no link to its route.gpx — add a Files & CDN row linking ` +
          `${JSDELIVR_BASE}/routes/${id}/route.gpx`,
      );
    }
  }

  /**
   * checkRoadsAsset (above) only confirms every route's roads corridor SVG
   * exists, parses, and hashes against the right route.geojson — it says
   * nothing about which pages actually reference which file. The corridor
   * is referenced (an <img>), never inlined (see roads.ts / the road-
   * corridor plan), so a page pointing at the *wrong* route's SVG would
   * render silently: valid markup, a real image, just the wrong one — the
   * same class of bug an asset-only guard misses when it never looks at the
   * pages consuming the asset. `expectedIds` covers every roads reference a
   * page legitimately carries — normally just its own id, but
   * camino-portugues.html also carries the coastal variant's second hero,
   * so both must be listed together in one call: checking them in two
   * separate passes would see the first hero's reference already present
   * and misreport it as belonging to the wrong route.
   */
  function checkRoadsPageReferences(file: string, detailHtml: string, expectedIds: readonly string[]): void {
    const found = roadsHeroReferencedIds(detailHtml);

    for (const id of expectedIds) {
      if (!found.has(id)) {
        add(
          file,
          `has no reference to its roads corridor SVG (assets/roads/${id}.svg) — the hero should ` +
            `layer it behind the route glyph`,
        );
      }
    }

    for (const foundId of found) {
      if (!expectedIds.includes(foundId)) {
        add(
          file,
          `references assets/roads/${foundId}.svg, which isn't one of this page's own routes ` +
            `(${expectedIds.join(", ")}) — check for a copy-pasted or mismatched route id`,
        );
      }
    }
  }

  /**
   * The filter panel on docs/routes.html is revealed by CSS on the
   * <html class="js"> hook, set by an inline script, rather than by
   * route-filter.js itself — that fixed a real layout shift on load. It also
   * means deleting route-filter.js, or just its <script> tag, leaves the
   * panel rendered and fully interactive-looking while doing nothing: no
   * other check here would notice, since nothing else ties routes.html to
   * the script it depends on.
   */
  function checkRouteFilterWiring(): void {
    if (!routesHtml.includes('src="route-filter.js"')) {
      add(
        "docs/routes.html",
        'routes.html has no <script src="route-filter.js"> — the filter panel ' +
          "would render at first paint and do nothing",
      );
    }

    const scriptPath = join(docs, "route-filter.js");
    if (!existsSync(scriptPath)) {
      add(
        "docs/route-filter.js",
        "docs/route-filter.js does not exist — routes.html's filter panel has no script to run",
      );
    } else if (readFileSync(scriptPath, "utf-8").trim().length === 0) {
      add(
        "docs/route-filter.js",
        "docs/route-filter.js is empty — routes.html's filter panel has no script to run",
      );
    }
  }

  /**
   * The route chooser filter (docs/route-filter.js) reads days/distance/
   * difficulty/best-months straight off each route-card's data-* attributes
   * rather than a second copy of the dataset. Nothing else stops those
   * attributes drifting from metadata.json when a route's difficulty or best
   * months change — this would silently misfile the route in the filter.
   */
  function checkRouteFilterAttrs(id: string): void {
    const overview = readRouteFilterOverview(join(root, "routes", id));
    if (!overview) return; // malformed/incomplete metadata.json is validate's job

    const cardTag = findRouteCardOpenTag(routesHtml, id);
    if (!cardTag) {
      add(
        "docs/routes.html",
        `route "${id}" card has no route filter data-* attributes (data-days, data-distance-km, ` +
          `data-difficulty, data-best-months) — add them or the route chooser silently drops it`,
      );
      return;
    }

    for (const [attr, expectedFor] of ROUTE_FILTER_ATTRS) {
      const expected = expectedFor(overview);
      if (expected === undefined) continue; // this field is missing/invalid in metadata.json — validate's job

      const rendered = readDataAttr(cardTag, attr);
      if (rendered === undefined) {
        add(
          "docs/routes.html",
          `route "${id}" card is missing route filter attribute ${attr} (metadata.json says ${expected})`,
        );
      } else if (rendered !== expected) {
        add(
          "docs/routes.html",
          `route "${id}" card's route filter attribute ${attr} reads "${rendered}", metadata.json says "${expected}"`,
        );
      }
    }
  }

  /**
   * A section's page and its card in the catalog both say which pilgrimage
   * it belongs to, and both are hand-edited — the "Part of the …" line on
   * the page, the `.route-group` wrapper in docs/routes.html. Neither was
   * checked against index.json, so a section could ship under the wrong
   * heading, or with no way back up to its pilgrimage at all, and every
   * guard here would still be green.
   */
  function checkPilgrimageBacklink(id: string, pilgrimageId: string, detailHtml: string): void {
    if (!detailHtml.includes(`href="/${pilgrimageId}"`)) {
      add(
        `docs/${id}.html`,
        `section "${id}" has no link back to its pilgrimage — add a link to /${pilgrimageId}, ` +
          `the way the Camino sections carry "Part of the Camino de Santiago"`,
      );
    }
  }

  function checkPilgrimageGrouping(id: string, pilgrimageId: string): void {
    const cardIndex = findRouteCardIndex(routesHtml, id);
    // No card at all is already reported by the catalog-link check above;
    // saying it twice in different words helps nobody.
    if (cardIndex === null) return;

    const groupId = pilgrimageGroupOf(routesHtml, cardIndex);
    if (groupId === null) {
      add(
        "docs/routes.html",
        `section "${id}" card sits in no route-group — wrap it in pilgrimage "${pilgrimageId}"'s ` +
          `<div class="route-group">, or the catalog shows it as belonging to nothing`,
      );
    } else if (groupId !== pilgrimageId) {
      add(
        "docs/routes.html",
        `section "${id}" card sits in pilgrimage "${groupId}"'s route-group, but index.json says ` +
          `it belongs to "${pilgrimageId}"`,
      );
    }
  }

  /**
   * See readmeDistanceKmPattern's doc comment for why only the leading
   * figure of a range is checked. `distanceKm` comes from index.json rather
   * than statsById/computeStats — the two agree by construction
   * (build-index.ts copies metadata.json's overview.distanceKm verbatim —
   * see scanSections there), but index.json is the artifact this repo
   * publishes and the one a reader compares the README against, so it's the
   * more direct source of truth for this guard to name.
   */
  function checkReadmeDistanceKm(id: string, distanceKm: number | undefined): void {
    if (distanceKm === undefined) return; // schema requires it on every real route; nothing to check without one

    const match = readmeMd.match(readmeDistanceKmPattern(id));
    if (!match) return; // no route-table row for this id — the link-coverage check above already reports that

    const rendered = Number(match[1].replace(/,/g, ""));
    if (rendered !== distanceKm) {
      add(
        "README.md",
        `README's route table lists "${id}" at ${match[1]} km, but index.json's distanceKm is ` +
          `${distanceKm} km — update the README's Distance cell`,
      );
    }
  }

  function checkWaypointTypeTables(id: string, detailHtml: string): void {
    const file = `docs/${id}.html`;

    for (const tableMatch of detailHtml.matchAll(WAYPOINT_TYPE_TABLE_PATTERN)) {
      const [, caption, tbody] = tableMatch;
      let sum = 0;
      let total: number | null = null;

      for (const rowMatch of tbody.matchAll(WAYPOINT_TYPE_ROW_PATTERN)) {
        const [, label, rawCount] = rowMatch;
        const count = Number(rawCount.replace(/,/g, ""));
        if (label === "Total") {
          total = count;
        } else {
          sum += count;
        }
      }

      if (total !== null && sum !== total) {
        add(
          file,
          `"${caption}" rows sum to ${sum}, but its own Total row reads ${total} — add the missing ` +
            `waypoint type row(s), or correct the Total`,
        );
      }
    }
  }

  /**
   * Which section an Overview table describes is read off the leading figure
   * of its own Distance row, not off its position on the page.
   *
   * Position was the first attempt, and it fails silently — which is worse
   * than not checking at all. It paired routes/{id}/metadata.json against the
   * first table and each routes/{id}/variants/{name} directory, in readdirSync
   * order, against the ones after it. That is correct on today's pages only by
   * luck: routes/camino-portugues/variants/ holds coastal, espiritual and
   * lisboa, only coastal declares an elevationRange, and the pairing survives
   * because "c" sorts before "e" and "l". Rename coastal to anything sorting
   * after them and its table pairs against a range-less variant, where the
   * skip that correctly keeps this guard quiet on variants with no range to
   * compare turns a genuinely drifted cell into no output whatsoever. A gate
   * that switches itself off is the one failure a gate must not have.
   *
   * Distance is the key because it is exact and unique per section within a
   * route — 243 km for the Camino Portugués against 110, 73 and 620 for its
   * three variants; 112 against 75 for the Inglés — and because it is a figure
   * every section is required to carry: schema/pilgrimage.schema.json lists
   * distanceKm in overview.required, index.json republishes it for the route
   * and for each variant, and isIndexVariantShape already refuses a variant
   * that arrives without one. This is the same substitution VARIANT_ROW_PATTERN
   * makes for docs/routes.html's variants table, whose rows likewise carry no
   * id and are identified by their parent route plus their distance.
   *
   * The asset id was the alternative, and it is a real identifier: eight of
   * the ten route detail pages carry an <img class="route-hero-roads"
   * src="assets/roads/{id}.svg">, nine such heroes in all, and
   * docs/camino-portugues.html:331 puts the coastal variant's six lines above
   * that variant's table — the string COASTAL_VARIANT_ASSET_ID already names.
   * It was rejected on three counts. The two pages without one are iseji's and
   * ohechi's, whose sections ship no walked line and so have no corridor to
   * render, and those are the sections whose figures are declared rather than
   * measured — the ones a drift gate can least afford to lose. It sits outside
   * the table, so pairing on it means "nearest preceding hero", which is the
   * positional rule again under a different anchor, failing the same silent
   * way as soon as anything is inserted between the two. And it is an asset
   * id, not a section id: the "{route}-{variant}" spelling a variant's
   * corridor uses has exactly one instance to be inferred from.
   *
   * The section list comes from index.json's routes[].variants, the same list
   * the variants-table check further down reads, rather than a readdirSync of
   * the variants directory — index.json is this guard's declared source of
   * truth for which variants exist, and it already carries the distanceKm this
   * pairing needs.
   *
   * A table that matches no section, or more than one, is reported. An
   * unidentified table is precisely the state in which a real drift goes
   * unseen, so it has to be loud; only a table paired to a section that
   * declares nothing to compare is passed over in silence. One consequence
   * worth naming: a Key Facts Distance cell that drifts from index.json
   * surfaces here as a pairing failure, which is why all three of those
   * messages name a stale Distance cell as the likely cause before they
   * describe the coverage that is lost. Nothing else reads those cells —
   * checkReadmeDistanceKm covers the README's route tables and
   * COMPARE_ROW_PATTERN docs/routes.html's comparison table, and neither one
   * opens a detail page.
   *
   * Pairing happens once per table, and every row check below runs off the
   * section it resolved. See KEY_FACTS_DURATION_ROW_PATTERN for what those
   * checks read and why Distance is not among them.
   */
  function checkKeyFacts(id: string, detailHtml: string): void {
    const file = `docs/${id}.html`;
    const routeDir = join(root, "routes", id);
    const route = indexRouteById.get(id);
    if (!route) return;

    const sectionDir = (variantId?: string) =>
      variantId === undefined ? routeDir : join(routeDir, "variants", variantId);

    const sections: Array<{
      file: string;
      distanceKm?: number;
      declared: DeclaredElevationRange | null;
      keyFacts: DeclaredKeyFacts | null;
    }> = [
      {
        file: `routes/${id}/metadata.json`,
        distanceKm: route.distanceKm,
        declared: readDeclaredElevationRange(sectionDir()),
        keyFacts: readDeclaredKeyFacts(sectionDir()),
      },
      ...route.variants.map((variant) => ({
        file: `routes/${id}/variants/${variant.id}/metadata.json`,
        distanceKm: variant.distanceKm,
        declared: readDeclaredElevationRange(sectionDir(variant.id)),
        keyFacts: readDeclaredKeyFacts(sectionDir(variant.id)),
      })),
    ];

    const sectionList = sections
      .map((section) => {
        const key =
          section.distanceKm === undefined
            ? "no distanceKm in index.json"
            : `${section.distanceKm} km`;
        return `${section.file} (${key})`;
      })
      .join(", ");

    for (const [, caption, tbody] of detailHtml.matchAll(KEY_FACTS_TABLE_PATTERN)) {
      const distanceRow = tbody.match(KEY_FACTS_DISTANCE_ROW_PATTERN);
      const leadingDistance = distanceRow?.[1].match(KEY_FACTS_LEADING_DISTANCE_PATTERN);

      if (!leadingDistance) {
        add(
          file,
          `"${caption}" has no Distance row opening with an "N km" figure, so nothing says which ` +
            `section of "${id}" it describes and every Key Facts cell in this table goes ` +
            `unchecked — open the Distance cell with that section's own distanceKm (${sectionList})`,
        );
        continue;
      }

      const matches = sections.filter(
        (section) => section.distanceKm === figureFromCell(leadingDistance[1]),
      );

      if (matches.length === 0) {
        add(
          file,
          `"${caption}" opens with a Distance of ${leadingDistance[1]} km, which is the distanceKm ` +
            `of no section of "${id}" in index.json (${sectionList}) — most likely this Distance ` +
            `cell has drifted from the data, and until it names one section's distance every Key ` +
            `Facts cell in this table goes unchecked`,
        );
        continue;
      }

      if (matches.length > 1) {
        add(
          file,
          `"${caption}" opens with a Distance of ${leadingDistance[1]} km, which is the distanceKm ` +
            `of ${matches.length} sections of "${id}" in index.json ` +
            `(${matches.map((section) => section.file).join(", ")}) — so nothing tells their ` +
            `tables apart and every Key Facts cell in this table goes unchecked`,
        );
        continue;
      }

      const { file: source, declared, keyFacts } = matches[0];

      checkKeyFactsElevation(file, caption, tbody, source, declared);
      if (!keyFacts) continue; // metadata.json missing or unparsable — validate's job
      checkKeyFactsDuration(file, caption, tbody, source, keyFacts);
      checkKeyFactsWord(file, caption, tbody, source, "Topology", keyFacts.topology);
      checkKeyFactsWord(file, caption, tbody, source, "Difficulty", keyFacts.difficulty);
      checkKeyFactsCountries(file, caption, tbody, source, keyFacts.countries);
      checkKeyFactsEndpoints(file, caption, tbody, source, keyFacts);
    }
  }

  function checkKeyFactsElevation(
    file: string,
    caption: string,
    tbody: string,
    source: string,
    declared: DeclaredElevationRange | null,
  ): void {
    if (!declared) return; // this section declares no range to compare against

    const row = tbody.match(KEY_FACTS_ELEVATION_ROW_PATTERN);
    if (!row) return; // the row is optional in both directions
    const cell = row[1];

    const range = cell.match(KEY_FACTS_ELEVATION_RANGE_PATTERN);
    const { minMeters, maxMeters, totalAscentMeters, totalDescentMeters } = declared;

    if (range && minMeters !== undefined && maxMeters !== undefined) {
      const drifted =
        figureFromCell(range[1]) !== minMeters || figureFromCell(range[2]) !== maxMeters;
      if (drifted) {
        add(
          file,
          `"${caption}" gives an elevation range of ${range[1]}–${range[2]} m, but ${source} ` +
            `declares ${minMeters.toLocaleString("en-US")}–${maxMeters.toLocaleString("en-US")} m ` +
            `— update the Key Facts cell, or correct overview.elevationRange`,
        );
      }
    }

    const totals = cell.match(KEY_FACTS_ELEVATION_TOTALS_PATTERN);
    if (totals && totalAscentMeters !== undefined && totalDescentMeters !== undefined) {
      const drifted =
        figureFromCell(totals[1]) !== totalAscentMeters ||
        figureFromCell(totals[2]) !== totalDescentMeters;
      if (drifted) {
        add(
          file,
          `"${caption}" gives a total ascent of ${totals[1]} m and descent of ${totals[2]} m, ` +
            `but ${source} declares ${totalAscentMeters.toLocaleString("en-US")} m and ` +
            `${totalDescentMeters.toLocaleString("en-US")} m — update the Key Facts cell, or ` +
            `correct overview.elevationRange`,
        );
      }
    }
  }

  /**
   * Both sides are printed in whichever of the two orders the page itself
   * used, so a reader is comparing like with like rather than reading the
   * declared figures back in a shape their page does not use. typical is
   * dropped from both sides together when the section declares none — schema
   * requires min and max inside estimatedDays but not typical — which keeps
   * the message from printing a figure that was never compared.
   */
  function checkKeyFactsDuration(
    file: string,
    caption: string,
    tbody: string,
    source: string,
    declared: DeclaredKeyFacts,
  ): void {
    const row = tbody.match(KEY_FACTS_DURATION_ROW_PATTERN);
    if (!row) return;
    const cell = normalizedCell(row[1]);

    const typicalFirst = cell.match(KEY_FACTS_DURATION_TYPICAL_FIRST_PATTERN);
    const rangeFirst = cell.match(KEY_FACTS_DURATION_RANGE_FIRST_PATTERN);
    const rendered = typicalFirst
      ? { typical: Number(typicalFirst[1]), min: Number(typicalFirst[2]), max: Number(typicalFirst[3]) }
      : rangeFirst
        ? { typical: Number(rangeFirst[3]), min: Number(rangeFirst[1]), max: Number(rangeFirst[2]) }
        : null;
    if (!rendered) return; // neither shape — nothing to read a figure out of

    const { typicalDays, minDays, maxDays } = declared;
    if (minDays === undefined || maxDays === undefined) return;

    const comparedTypical = typicalDays !== undefined;
    const agrees =
      rendered.min === minDays &&
      rendered.max === maxDays &&
      (!comparedTypical || rendered.typical === typicalDays);
    if (agrees) return;

    const inPageShape = (typical: number | undefined, min: number, max: number) => {
      if (typical === undefined) return `${min}–${max} days`;
      return typicalFirst
        ? `${typical} days (range ${min}–${max})`
        : `${min}–${max} days (typical ${typical})`;
    };

    add(
      file,
      `"${caption}" gives a typical duration of ` +
        `${inPageShape(comparedTypical ? rendered.typical : undefined, rendered.min, rendered.max)}, ` +
        `but ${source} declares ${inPageShape(typicalDays, minDays, maxDays)} — update the Key ` +
        `Facts cell, or correct overview.estimatedDays`,
    );
  }

  /**
   * Topology and Difficulty read identically: one enum value, one cell, and
   * nothing else in it. The comparison is case-folded because the page
   * title-cases what the data holds in lower case ("Network" against
   * "network") — a page that wrote it lower case would be checked all the
   * same, since this guard is about the value having drifted and not about
   * how the cell is capitalised. The declared side of the message is
   * title-cased to match the rendered side, the way the elevation messages
   * put the thousands separators back on.
   */
  function checkKeyFactsWord(
    file: string,
    caption: string,
    tbody: string,
    source: string,
    label: "Topology" | "Difficulty",
    value: string | undefined,
  ): void {
    if (value === undefined) return;

    const pattern =
      label === "Topology" ? KEY_FACTS_TOPOLOGY_ROW_PATTERN : KEY_FACTS_DIFFICULTY_ROW_PATTERN;
    const row = tbody.match(pattern);
    if (!row) return;

    const rendered = normalizedCell(row[1]);
    if (rendered.toLowerCase() === value.toLowerCase()) return;

    const titleCased = value.charAt(0).toUpperCase() + value.slice(1);
    add(
      file,
      `"${caption}" gives a ${label.toLowerCase()} of "${rendered}", but ${source} declares ` +
        `"${titleCased}" — update the Key Facts cell, or correct overview.${label.toLowerCase()}`,
    );
  }

  /**
   * The cell renders ISO codes as English names joined by an arrow, in the
   * order the array declares them, so the whole cell is rebuilt from the data
   * and compared against the whole rendered cell.
   *
   * A code countryName does not know silently switches this cell off rather
   * than failing — see COUNTRY_NAME in scripts/region.ts. The alternative is a
   * route through a new country breaking CI before its page has been written,
   * which would make adding a country harder than leaving one unchecked.
   */
  function checkKeyFactsCountries(
    file: string,
    caption: string,
    tbody: string,
    source: string,
    codes: string[] | undefined,
  ): void {
    if (codes === undefined || codes.length === 0) return;

    const names = codes.map(countryName);
    if (names.some((name) => name === undefined)) return;

    const row = tbody.match(KEY_FACTS_COUNTRIES_ROW_PATTERN);
    if (!row) return;

    const rendered = normalizedCell(row[1]);
    const expected = names.join(" → ");
    if (rendered.toLowerCase() === expected.toLowerCase()) return;

    add(
      file,
      `"${caption}" gives countries of "${rendered}", but ${source} declares "${expected}" ` +
        `(${codes.join(", ")}) — update the Key Facts cell, or correct overview.countries`,
    );
  }

  /**
   * The elevation figure in a Start or End cell, and deliberately not the
   * place name beside it — KEY_FACTS_DURATION_ROW_PATTERN's comment carries
   * the measurements showing why a name check would report correct cells, and
   * asks that this not be tightened.
   */
  function checkKeyFactsEndpoints(
    file: string,
    caption: string,
    tbody: string,
    source: string,
    declared: DeclaredKeyFacts,
  ): void {
    for (const [label, pattern, field] of KEY_FACTS_POINT_ROWS) {
      const meters =
        field === "startPoint" ? declared.startElevationMeters : declared.endElevationMeters;
      if (meters === undefined) continue;

      const row = tbody.match(pattern);
      if (!row) continue;

      const cell = normalizedCell(row[1]);
      const figure = earlierMatch(
        KEY_FACTS_POINT_PAREN_ELEVATION_PATTERN.exec(cell),
        KEY_FACTS_POINT_COMMA_ELEVATION_PATTERN.exec(cell),
      );
      if (!figure) continue; // no elevation published in this cell — the name alone is not checkable

      if (figureFromCell(figure[1]) === meters) continue;

      add(
        file,
        `"${caption}" gives the ${label} elevation as ${figure[1]} m, but ${source} declares ` +
          `${meters.toLocaleString("en-US")} m — update the Key Facts cell, or correct ` +
          `overview.${field}.coordinates`,
      );
    }
  }

  /**
   * See VARIANTS_SECTION_HEADING_PATTERN for what counts as publishing a
   * Variants section and why the word "variant" is not it.
   *
   * The inverse direction — variants declared, no section published — is
   * checked too, and it is checked because the tree earns it. Across all 340
   * commits there are 859 route/commit pairs declaring at least one variant;
   * on 618 of them the route's detail page exists at that commit, and all 618
   * of those pages publish a Variants section. (The other 241 have no detail
   * page at all, which the route-contract check a few loops down already
   * reports, and which this one passes over rather than saying twice.) So
   * nothing here starts red. Only camino-ingles (1 variant) and
   * camino-portugues (3) declare any today, and both publish one.
   */
  function checkVariantsSection(id: string, detailHtml: string): void {
    const route = indexRouteById.get(id);
    if (!route) return;

    const anchor =
      VARIANTS_SECTION_HEADING_PATTERN.exec(detailHtml) ??
      VARIANTS_TABLE_CAPTION_PATTERN.exec(detailHtml);
    const declared = route.variants;
    const file = `docs/${id}.html`;

    if (anchor && declared.length === 0) {
      add(
        file,
        `publishes a Variants section (${anchor[0]}) while index.json declares no variants for ` +
          `"${id}" — a sibling section or a walking alternative described on this page is not a ` +
          `variant of it; remove the section, or declare the variant under ` +
          `routes/${id}/variants/ and rebuild index.json`,
      );
      return;
    }

    if (!anchor && declared.length > 0) {
      add(
        file,
        `publishes no Variants section, but index.json declares ${declared.length} variant(s) for ` +
          `"${id}" (${declared.map((variant) => variant.id).join(", ")}) — the page is hiding data ` +
          `the catalog and the CDN already publish; add the section, or remove the variant(s) from ` +
          `routes/${id}/variants/ and rebuild index.json`,
      );
    }
  }

  function checkTerrainNotesDistance(id: string): void {
    const stagesPath = join(root, "routes", id, "stages.json");
    if (!existsSync(stagesPath)) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(stagesPath, "utf-8"));
    } catch {
      return; // malformed stages.json is npm run validate's job to report
    }

    if (!isStagesFileLike(parsed) || !Array.isArray(parsed.stages)) return;
    const file = `routes/${id}/stages.json`;

    parsed.stages.forEach((stage: unknown, index: number) => {
      if (!isStageLike(stage)) return;

      const notes = localizedText(stage.terrainNotes);
      if (!notes) return;

      const actual = typeof stage.distanceKm === "number" ? stage.distanceKm : undefined;
      if (actual === undefined) return;

      // A note can state its length more than once, and in more than one of
      // the four shapes; every distinct figure it asserts has to agree.
      const claimed = new Set<number>();
      for (const pattern of TERRAIN_NOTES_DISTANCE_PATTERNS) {
        for (const match of notes.matchAll(pattern)) claimed.add(Number(match[1]));
      }

      for (const named of claimed) {
        if (named === actual) continue;
        add(
          file,
          `stage ${index + 1}'s terrainNotes names ${named} km as the day's distance, but this ` +
            `stage's distanceKm is ${actual} km — reword the note or fix distanceKm`,
        );
      }
    });
  }

  /**
   * schema/pilgrimage.schema.json allows difficulty "expert" as well as
   * easy/moderate/hard, but the filter's <select> only offered three of the
   * four — a schema-valid "expert" route would render its card with
   * data-difficulty="expert" (checkRouteFilterAttrs above confirms that much)
   * and then be invisible under every option in the difficulty dropdown,
   * with nothing here or in the browser to say so.
   */
  function checkDifficultyFilterVocabulary(): void {
    const enumValues = readDifficultyEnum(root);
    if (!enumValues) return; // schema file missing/malformed — not this guard's job

    const selectMatch = routesHtml.match(DIFFICULTY_SELECT_PATTERN);
    if (!selectMatch) {
      add(
        "docs/routes.html",
        'no <select id="filter-difficulty"> found — can\'t verify its options cover the schema\'s difficulty enum',
      );
      return;
    }

    const optionValues = new Set(
      [...selectMatch[1].matchAll(OPTION_VALUE_PATTERN)].map((m) => m[1]).filter((v) => v !== ""),
    );

    for (const value of enumValues) {
      if (!optionValues.has(value)) {
        add(
          "docs/routes.html",
          `difficulty filter has no option for schema value "${value}" — a route with this difficulty ` +
            `would be invisible under every difficulty selection`,
        );
      }
    }
  }

  /**
   * The interior journey narratives are hand-inlined into each detail page
   * rather than templated, so nothing stops them drifting from stages.json
   * silently: a stage added, removed, or reworded in the data would leave
   * the page's editorial content wrong with no build failure. This checks
   * the rendered stage count against stages.json, then every stage's
   * narrative and reflection against the page's text — checking only
   * stage 1 previously left 33 of 34 camino-norte narratives and all 34
   * reflections completely unguarded. detailHtml is compared after decoding
   * HTML entities, since the narrative/reflection text from stages.json is
   * unescaped and a correctly-escaped page (e.g. "&amp;" for a literal "&")
   * would otherwise never match.
   */
  function checkInteriorJourney(id: string, detailHtml: string): void {
    const stagesPath = join(root, "routes", id, "stages.json");
    if (!existsSync(stagesPath)) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(stagesPath, "utf-8"));
    } catch {
      return; // malformed stages.json is npm run validate's job to report
    }

    if (!isStagesFileLike(parsed) || !Array.isArray(parsed.stages)) return;
    const stages = parsed.stages;
    const file = `docs/${id}.html`;
    const decoded = decodeEntities(detailHtml);

    const renderedCount = (detailHtml.match(STAGE_INTERIOR_PATTERN) ?? []).length;
    if (renderedCount !== stages.length) {
      add(
        file,
        `renders ${renderedCount} stage interior narrative(s) (<details class="stage-interior">), ` +
          `stages.json has ${stages.length} stage(s) — interior journey content has drifted from the data`,
      );
    }

    stages.forEach((stage: unknown, index: number) => {
      if (!isStageLike(stage)) return;
      const stageNum = index + 1;

      const narrative = localizedText(stage.interior?.narrative);
      if (narrative && !decoded.includes(narrative)) {
        add(
          file,
          `stage ${stageNum}'s interior narrative does not appear verbatim on the page — ` +
            `interior journey content has drifted from stages.json`,
        );
      }

      const reflection = localizedText(stage.interior?.reflection);
      if (reflection && !decoded.includes(reflection)) {
        add(
          file,
          `stage ${stageNum}'s interior reflection does not appear verbatim on the page — ` +
            `interior journey content has drifted from stages.json`,
        );
      }
    });
  }

  /**
   * Seven detail pages once shipped route.gpx links pointing at `@v1` while
   * `v1` still predated GPX entirely — every one of them 404'd in
   * production, and nothing here had ever looked at what a CDN link
   * actually pointed at. This closes the offline half of that gap: for
   * every jsDelivr URL this repo's own pages and README reference, it
   * confirms the path is something that could ever resolve (it exists in
   * the working tree, and it's inside the published surface — routes/,
   * schema/, index.json) and that the version ref is one this project
   * actually produces (`@v1`, or a released `@vX.Y.Z`).
   *
   * What it cannot catch — by design, not oversight — is a path that exists
   * now but hasn't been released yet, the exact shape of the original bug.
   * "Assert the file existed at `v1`" is circular: the PR that adds a file
   * and its link would fail this guard until a release ships it, which
   * requires merging the PR first. See check-cdn.ts (npm run check-cdn) for
   * the networked check that closes that gap instead, run once as part of
   * cutting a release rather than on every CI run.
   *
   * Scans docs/*.js alongside docs/*.html — docs/cdn-preview.js carries the
   * one CDN URL this site actually fetches at runtime (its live index.json
   * preview on the usage page), and until this scanned .js files that URL
   * was only checked because the same text happens to also appear in
   * usage.html's code sample, a coincidence nothing enforced.
   *
   * Honours the indexHtml/routesHtml overrides the same way the internal-
   * link check at the bottom of checkSite does (see usingOverriddenPages
   * there) — the docs-page half of this guard used to always read the real
   * docs/ off disk regardless of what a test passed in, so it had no way to
   * be driven by a synthetic fixture and no negative test ever exercised it.
   */
  function checkCdnLinks(): void {
    const usingOverriddenDocsPages = overrides.indexHtml !== undefined || overrides.routesHtml !== undefined;

    const pages: Array<[string, string]> = usingOverriddenDocsPages
      ? [
          ["docs/index.html", indexHtml],
          ["docs/routes.html", routesHtml],
        ]
      : existsSync(docs)
        ? readdirSync(docs)
            .filter((entry) => entry.endsWith(".html") || entry.endsWith(".js"))
            .map((entry): [string, string] => [`docs/${entry}`, readFileSync(join(docs, entry), "utf-8")])
        : [];
    pages.push(["README.md", readmeMd]);

    // Every route detail page ships a Files & CDN table, so zero extracted
    // CDN refs on one is never a clean pass — it means either the table
    // went missing, or (the shape this project has now shipped four times)
    // CDN_URL_PATTERN in cdn.ts no longer matches this repo's actual CDN
    // URLs, e.g. after an org/repo rename edited one of the two places that
    // string used to live without the other. Scoped to detail pages only:
    // index.html/routes.html/contribute.html/etc. legitimately have none.
    const detailPageFiles = new Set(ids.map((id) => `docs/${id}.html`));

    for (const [file, html] of pages) {
      const cdnRefs = extractCdnRefs(html);

      if (detailPageFiles.has(file) && cdnRefs.length === 0) {
        add(
          file,
          "has zero CDN links — every route detail page's Files & CDN table should reference this " +
            "repo's own jsDelivr URLs; zero here means the table is missing, or CDN_URL_PATTERN in " +
            "cdn.ts no longer matches this repo's actual CDN URLs",
        );
      }

      for (const cdnRef of cdnRefs) {
        if (!isRecognizedCdnRef(cdnRef.ref)) {
          add(
            file,
            `links to ${cdnRef.url}, whose version ref "@${cdnRef.ref}" isn't one this project uses — ` +
              `the catalog is read from @main; packages are pinned at a released @vX.Y.Z tag`,
          );
        }

        if (cdnRef.path === "") continue; // a bare base URL — nothing else to check

        if (!isPublishedCdnPath(cdnRef.path)) {
          add(
            file,
            `links to ${cdnRef.url}, whose path "${cdnRef.path}" is outside the published CDN surface ` +
              `(routes/, schema/, index.json) — this can never resolve`,
          );
          continue; // a path that can never be published isn't also worth an existence check
        }

        if (!cdnPathExistsOnDisk(root, cdnRef.path)) {
          add(
            file,
            `links to ${cdnRef.url}, but "${cdnRef.path}" does not exist in the repo`,
          );
        }
      }
    }
  }

  const pilgrimageByRouteId = new Map(
    indexRoutes.map((route) => [route.id, route.pilgrimage] as const),
  );
  const distanceKmByRouteId = new Map(
    indexRoutes.map((route) => [route.id, route.distanceKm] as const),
  );

  for (const id of ids) {
    // Spec §4.3: a section whose relation is absent, or whose way graph is
    // discontinuous, ships metadata-only with no route.geojson at all —
    // not a route awaiting a rebuild. build-assets.ts already skips
    // writing a glyph, GPX track, or roads corridor for exactly this shape
    // (see its own "missing inputs are skipped" comment); the checks below
    // that can only be satisfied by files derived from geometry have to
    // agree, or a section with nothing to derive them from would fail here
    // forever. The absence alone cannot say which shape this is, so the
    // section has to declare it — see declaresMetadataOnly.
    const routeDir = join(root, "routes", id);
    const hasGeometry = existsSync(join(routeDir, "route.geojson"));
    const isMetadataOnly = !hasGeometry && declaresMetadataOnly(routeDir);

    if (!routesHtml.includes(`href="/${id}"`)) {
      add("docs/routes.html", `route "${id}" has no link to /${id} in the catalog`);
    }

    const pilgrimageId = pilgrimageByRouteId.get(id);
    if (pilgrimageId !== undefined) {
      checkPilgrimageGrouping(id, pilgrimageId);
    }

    if (!readmeMd.includes(`](routes/${id}/)`)) {
      add("README.md", `route "${id}" has no link to routes/${id}/ in the README route table`);
    } else {
      checkReadmeDistanceKm(id, distanceKmByRouteId.get(id));
    }

    const detailPagePath = join(docs, `${id}.html`);
    if (!existsSync(detailPagePath)) {
      add(`docs/${id}.html`, `route "${id}" is in index.json but has no detail page`);
    } else {
      const detailHtml = readFileSync(detailPagePath, "utf-8");
      const identifiesRoute =
        detailHtml.includes(`<code>${id}</code>`) ||
        detailHtml.includes(`https://open.pilgrimag.es/${id}"`);
      if (!identifiesRoute) {
        add(
          `docs/${id}.html`,
          `route "${id}" detail page exists but does not identify itself as ${id} (expected <code>${id}</code> or a canonical link to /${id})`,
        );
      }

      const detailPages: Array<[string, string]> = [[`docs/${id}.html`, detailHtml]];
      checkInlinedAsset("routes", id, [
        ...detailPages,
        ["docs/routes.html", routesHtml],
        ["docs/index.html", indexHtml],
      ]);
      checkInlinedAsset("profiles", id, detailPages);
      checkInlinedAsset("sparklines", id, detailPages);
      checkInteriorJourney(id, detailHtml);
      checkWaypointTypeTables(id, detailHtml);
      checkKeyFacts(id, detailHtml);
      checkVariantsSection(id, detailHtml);
      if (pilgrimageId !== undefined) {
        checkPilgrimageBacklink(id, pilgrimageId, detailHtml);
      }

      if (!isMetadataOnly) {
        checkRouteGpxLink(id, detailHtml);

        // The coastal variant ships full geometry, a profile, and a sparkline of
        // its own, but has no detail page — its assets are inlined into the
        // parent Camino Portugués page instead. It does get its own roads
        // corridor hero further down that same page, so both ids are checked
        // in one call — see checkRoadsPageReferences' doc comment for why.
        checkRoadsPageReferences(
          `docs/${id}.html`,
          detailHtml,
          id === "camino-portugues" ? [id, COASTAL_VARIANT_ASSET_ID] : [id],
        );
      }

      if (id === "camino-portugues") {
        checkInlinedAsset("routes", "camino-portugues-coastal", detailPages);
        checkInlinedAsset("profiles", "camino-portugues-coastal", detailPages);
        checkInlinedAsset("sparklines", "camino-portugues-coastal", detailPages);
      }
    }

    if (!isMetadataOnly && !glyphsJs.includes(`"${id}"`)) {
      add(
        "docs/assets/glyphs.js",
        `route "${id}" has no generated glyph — run npm run build-assets`,
      );
    }

    checkRouteGpx(id, isMetadataOnly);
    checkRoadsAsset(id, join(routeDir, "route.geojson"), isMetadataOnly);
    checkRouteFilterAttrs(id);
    checkTerrainNotesDistance(id);

    if (RESERVED_PAGE_NAMES.has(id)) {
      add("index.json", `route id "${id}" collides with a reserved page name`);
    }
  }

  for (const id of pilgrimageIds) {
    if (RESERVED_PAGE_NAMES.has(id)) {
      add("index.json", `pilgrimage id "${id}" collides with a reserved page name`);
    }
    if (routeIdSet.has(id)) {
      add("index.json", `"${id}" is claimed twice — it is both a pilgrimage and a route id`);
    }
  }
  for (const pilgrimage of pilgrimages) {
    if (pilgrimage.sections.length === 0) {
      add("index.json", `pilgrimage "${pilgrimage.id}" has no sections`);
    }

    // The reverse orphan scan permits a pilgrimage page; nothing required one,
    // so a pilgrimage whose page was never generated locally shipped a 404 at
    // open.pilgrimag.es/<id> with every guard green. The route contract asks
    // the same of every route id a few loops above.
    if (!existsSync(join(docs, `${pilgrimage.id}.html`))) {
      add(
        `docs/${pilgrimage.id}.html`,
        `pilgrimage "${pilgrimage.id}" is in index.json but has no generated page — ` +
          `run npm run build-assets and commit the page`,
      );
    }

    // build-index derives sections from the same walk that emits routes[],
    // so this can't happen from that path today. It becomes reachable once a
    // route is nested under a variants[] parent while still declaring a
    // pilgrimage block — buildPilgrimagePages would then drop the section
    // from the generated page in silence, so this has to be caught here.
    for (const sectionId of pilgrimage.sections) {
      if (!routeIdSet.has(sectionId)) {
        add(
          "index.json",
          `pilgrimage "${pilgrimage.id}" lists section "${sectionId}", which is not a route in ` +
            `routes[] — add a pilgrimage block to that section's own metadata.json, or remove ` +
            `"${sectionId}" from pilgrimage "${pilgrimage.id}"'s sections list`,
        );
      }
    }
  }
  for (const route of indexRoutes) {
    if (route.pilgrimage && !pilgrimageIds.has(route.pilgrimage)) {
      add(
        "index.json",
        `route "${route.id}" names pilgrimage "${route.pilgrimage}", which is not in pilgrimages[]`,
      );
    }
  }

  checkCoastalVariantGpx();
  checkRoadsAsset(
    COASTAL_VARIANT_ASSET_ID,
    join(root, "routes", "camino-portugues", "variants", "coastal", "route.geojson"),
  );
  checkRouteFilterWiring();
  checkDifficultyFilterVocabulary();
  checkCdnLinks();

  // Reverse checks: the loop above confirms everything index.json expects
  // exists. It never confirms the opposite — that everything sitting on disk
  // is still expected. Without this, removing a route from index.json leaves
  // its detail page, its assets, and its glyphs.js entry to linger, entirely
  // unreported.
  const knownAssetIds = new Set<string>([...ids, COASTAL_VARIANT_ASSET_ID]);

  if (existsSync(docs)) {
    for (const entry of readdirSync(docs)) {
      if (!entry.endsWith(".html")) continue;
      const stem = entry.slice(0, -".html".length);
      if (RESERVED_PAGE_NAMES.has(stem) || pageIds.has(stem)) continue;
      add(
        `docs/${entry}`,
        `orphaned detail page — "${stem}" is not a route in index.json; delete this page or add the route back to index.json`,
      );
    }

    for (const entry of readdirSync(docs)) {
      if (!entry.endsWith(".js")) continue;
      if (KNOWN_SCRIPTS.has(entry)) continue;
      add(
        `docs/${entry}`,
        `orphaned script — "${entry}" is not in check-site.ts's KNOWN_SCRIPTS; delete it or add it to KNOWN_SCRIPTS if it's a real, wired-up script`,
      );
    }
  }

  for (const match of glyphsJs.matchAll(GLYPHS_JS_KEY_PATTERN)) {
    const key = match[1];
    if (!knownAssetIds.has(key)) {
      add(
        "docs/assets/glyphs.js",
        `orphaned glyph entry "${key}" — not a route in index.json; remove it or run npm run build-assets after restoring the route`,
      );
    }
  }

  for (const kind of ASSET_KINDS) {
    const assetDir = join(docs, "assets", kind);
    if (!existsSync(assetDir)) continue;

    for (const entry of readdirSync(assetDir)) {
      if (!entry.endsWith(".svg")) continue;
      const assetId = entry.slice(0, -".svg".length);
      if (!knownAssetIds.has(assetId)) {
        add(
          `docs/assets/${kind}/${entry}`,
          `orphaned ${ASSET_LABELS[kind]} asset — "${assetId}" is not a route in index.json; delete this file or add the route back to index.json`,
        );
      }
    }
  }

  const tableVariantRows: Array<{ parentId: string; distanceKm: number }> = [];
  for (const match of routesHtml.matchAll(VARIANT_ROW_PATTERN)) {
    const [, parentId, rawDistanceKm] = match;
    tableVariantRows.push({ parentId, distanceKm: Number(rawDistanceKm.replace(/,/g, "")) });
  }

  const matchedTableRowIndices = new Set<number>();

  for (const route of indexRoutes) {
    for (const variant of route.variants) {
      const rowIndex = tableVariantRows.findIndex(
        (row, i) =>
          !matchedTableRowIndices.has(i) &&
          row.parentId === route.id &&
          row.distanceKm === variant.distanceKm,
      );
      if (rowIndex === -1) {
        add(
          "docs/routes.html",
          `variant "${variant.id}" of "${route.id}" (${variant.distanceKm} km) has no row in the variants table — add one, or remove the variant from index.json`,
        );
      } else {
        matchedTableRowIndices.add(rowIndex);
      }
    }
  }

  tableVariantRows.forEach((row, i) => {
    if (!matchedTableRowIndices.has(i)) {
      add(
        "docs/routes.html",
        `variants table lists a variant of "${row.parentId}" (${row.distanceKm} km) that matches no variant in index.json — remove the row, or add the variant back to index.json`,
      );
    }
  });

  const { totals } = stats;

  const readmeTotalsMatch = readmeMd.match(README_TOTALS_PATTERN);
  if (!readmeTotalsMatch) {
    add("README.md", "totals line (GPS points/waypoints/stages/routes) not found");
  } else {
    const [, ...renderedValues] = readmeTotalsMatch;
    README_TOTALS_FIELDS.forEach(([label, totalsKey], index) => {
      const rendered = renderedValues[index];
      const expected = totals[totalsKey].toLocaleString("en-US");
      if (rendered !== expected) {
        add("README.md", `README totals "${label}" reads ${rendered}, data says ${expected}`);
      }
    });
  }

  const seenHeroLabels = new Set<string>();

  for (const match of indexHtml.matchAll(HERO_STAT_PATTERN)) {
    const [, rendered, rawLabel] = match;
    const label = rawLabel.trim();
    const totalsKey = HERO_FIELDS[label];
    if (!totalsKey) continue;

    seenHeroLabels.add(label);
    const expected = totals[totalsKey].toLocaleString("en-US");
    if (rendered.trim() !== expected) {
      add(
        "docs/index.html",
        `hero stat "${label}" reads ${rendered.trim()}, data says ${expected}`,
      );
    }
  }

  for (const label of Object.keys(HERO_FIELDS)) {
    if (!seenHeroLabels.has(label)) {
      add("docs/index.html", `hero stat "${label}" is missing`);
    }
  }

  const statsByName = new Map<string, RouteStats>(stats.routes.map((route) => [route.name, route]));

  for (const match of routesHtml.matchAll(COMPARE_ROW_PATTERN)) {
    const [, rawName, ...values] = match;
    const name = decodeEntities(rawName.trim());
    const route = statsByName.get(name);

    if (!route) {
      add(
        "docs/routes.html",
        `comparison table row "${name}" does not match any route in index.json`,
      );
      continue;
    }

    FIGURE_FIELDS.forEach(([label, key], index) => {
      const rendered = values[index];
      const expected = String(route[key]);
      if (rendered !== expected) {
        add(
          "docs/routes.html",
          `comparison table "${label}" for "${route.id}" reads ${rendered}, data says ${expected}`,
        );
      }
    });
  }

  const usingOverriddenPages = overrides.indexHtml !== undefined || overrides.routesHtml !== undefined;
  const pagesToScan: Array<[string, string]> = usingOverriddenPages
    ? [
        ["docs/index.html", indexHtml],
        ["docs/routes.html", routesHtml],
      ]
    : existsSync(docs)
      ? readdirSync(docs)
          .filter((entry) => entry.endsWith(".html"))
          .map((entry): [string, string] => [
            `docs/${entry}`,
            readFileSync(join(docs, entry), "utf-8"),
          ])
      : [];

  for (const [file, html] of pagesToScan) {
    for (const match of html.matchAll(HREF_PATTERN)) {
      const href = match[1];
      if (isExternalOrAnchor(href)) continue;
      if (href.endsWith(".html")) {
        add(file, `internal link "${href}" should be extensionless`);
      }
    }
  }

  return problems;
}

function main(): void {
  let problems: Problem[];

  try {
    problems = checkSite(ROOT);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  for (const problem of problems) {
    console.error(`${problem.file}: ${problem.message}`);
  }

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s). Site data is out of sync.`);
    process.exit(1);
  }

  console.log("Site is in sync with route data.");
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
