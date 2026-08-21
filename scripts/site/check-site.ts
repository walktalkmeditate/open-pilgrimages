import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { resolveInvokedPath } from "../cli.js";
import { computeStats, type RouteStats } from "../stats.js";
import { segmentsOf } from "./glyphs.js";
import { hashRouteGeometry, isWellFormedXml } from "./roads.js";

const ROOT = join(import.meta.dirname, "..", "..");

const RESERVED_PAGE_NAMES = new Set([
  "index",
  "routes",
  "schema",
  "usage",
  "contribute",
  "404",
  "styles",
  "hero",
]);

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

const JSDELIVR_BASE = "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1";

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

const ROADS_PAGE_REFERENCE_PATTERN = /assets\/roads\/([a-z0-9-]+)\.svg/g;

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
  estimatedDays?: { typical?: unknown };
}

interface MetadataLike {
  overview?: MetadataOverviewLike;
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

const ROUTE_FILTER_ATTRS: Array<[string, (overview: RouteFilterOverview) => string | undefined]> = [
  ["data-days", (o) => (o.days === undefined ? undefined : String(o.days))],
  ["data-distance-km", (o) => (o.distanceKm === undefined ? undefined : String(o.distanceKm))],
  ["data-difficulty", (o) => o.difficulty],
  ["data-best-months", (o) => (o.bestMonths === undefined ? undefined : o.bestMonths.join(","))],
];

/**
 * Finds the opening <div class="route-card" ...> tag for a given route id by
 * walking backward from its "/{id}" link, rather than a single regex over
 * the whole grid — cards are visually identical apart from their data-*
 * attributes, so nothing else reliably ties a tag back to one specific route.
 */
function findRouteCardOpenTag(html: string, id: string): string | null {
  const hrefIndex = html.indexOf(`href="/${id}"`);
  if (hrefIndex === -1) return null;

  const cardOpenIndex = html.lastIndexOf('<div class="route-card"', hrefIndex);
  if (cardOpenIndex === -1) return null;

  const tagEndIndex = html.indexOf(">", cardOpenIndex);
  if (tagEndIndex === -1) return null;

  return html.slice(cardOpenIndex, tagEndIndex + 1);
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
  variants?: IndexVariantShape[];
}

function isIndexRouteShape(value: unknown): value is IndexRouteShape {
  if (typeof value !== "object" || value === null) return false;
  const route = value as { id?: unknown; variants?: unknown };
  if (typeof route.id !== "string") return false;
  if (route.variants === undefined) return true;
  return Array.isArray(route.variants) && route.variants.every(isIndexVariantShape);
}

interface IndexRoute {
  id: string;
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

  return routes.map((route) => ({ id: route.id, variants: route.variants ?? [] }));
}

function isExternalOrAnchor(href: string): boolean {
  return /^(https?:|mailto:|tel:|#)/.test(href);
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

  const indexRoutes = readIndexRoutes(join(root, "index.json"));
  const ids = indexRoutes.map((route) => route.id);
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
  function checkRouteGpx(id: string): void {
    const gpxPath = join(root, "routes", id, "route.gpx");
    const file = `routes/${id}/route.gpx`;

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
   * <trkpt> count rather than trusting the file exists.
   */
  function checkRoadsAsset(assetId: string, geojsonPath: string): void {
    const svgPath = join(docs, "assets", "roads", `${assetId}.svg`);
    const file = `docs/assets/roads/${assetId}.svg`;

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

    const hashMatch = svg.match(ROADS_GEOMETRY_HASH_PATTERN);
    if (!hashMatch) {
      add(
        file,
        `roads corridor SVG for "${assetId}" has no embedded geometry-hash in its <metadata>`,
      );
      return;
    }

    if (!existsSync(geojsonPath)) return; // no route.geojson to compare against — not this guard's job

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
    const found = new Set(
      [...detailHtml.matchAll(ROADS_PAGE_REFERENCE_PATTERN)].map((match) => match[1]),
    );

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

  for (const id of ids) {
    if (!routesHtml.includes(`href="/${id}"`)) {
      add("docs/routes.html", `route "${id}" has no link to /${id} in the catalog`);
    }

    if (!readmeMd.includes(`](routes/${id}/)`)) {
      add("README.md", `route "${id}" has no link to routes/${id}/ in the README route table`);
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

      if (id === "camino-portugues") {
        checkInlinedAsset("routes", "camino-portugues-coastal", detailPages);
        checkInlinedAsset("profiles", "camino-portugues-coastal", detailPages);
        checkInlinedAsset("sparklines", "camino-portugues-coastal", detailPages);
      }
    }

    if (!glyphsJs.includes(`"${id}"`)) {
      add(
        "docs/assets/glyphs.js",
        `route "${id}" has no generated glyph — run npm run build-assets`,
      );
    }

    checkRouteGpx(id);
    checkRoadsAsset(id, join(root, "routes", id, "route.geojson"));
    checkRouteFilterAttrs(id);

    if (RESERVED_PAGE_NAMES.has(id)) {
      add("index.json", `route id "${id}" collides with a reserved page name`);
    }
  }

  checkCoastalVariantGpx();
  checkRoadsAsset(
    COASTAL_VARIANT_ASSET_ID,
    join(root, "routes", "camino-portugues", "variants", "coastal", "route.geojson"),
  );
  checkRouteFilterWiring();
  checkDifficultyFilterVocabulary();

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
      if (RESERVED_PAGE_NAMES.has(stem) || ids.includes(stem)) continue;
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
