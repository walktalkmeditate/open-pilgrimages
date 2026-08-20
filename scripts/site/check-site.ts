import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { resolveInvokedPath } from "../cli.js";
import { computeStats, type RouteStats } from "../stats.js";

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
} as const;

type AssetKind = keyof typeof ASSET_LABELS;

const ASSET_KINDS: readonly AssetKind[] = ["routes", "profiles", "sparklines"];

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
  iacute: "í",
  ldquo: "“",
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

function decodeEntities(text: string): string {
  return text.replace(/&([a-zA-Z]+);/g, (full, name: string) => HTML_ENTITIES[name] ?? full);
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

interface RouteFilterOverview {
  days: number;
  distanceKm: number;
  difficulty: string;
  bestMonths: number[];
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
 * A malformed or incomplete metadata.json degrades to null rather than
 * throwing; that shape of problem is npm run validate's job to report.
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

  if (
    typeof days !== "number" ||
    typeof distanceKm !== "number" ||
    typeof difficulty !== "string" ||
    !Array.isArray(bestMonths) ||
    !bestMonths.every((m): m is number => typeof m === "number")
  ) {
    return null;
  }

  return { days, distanceKm, difficulty, bestMonths };
}

const ROUTE_FILTER_ATTRS: Array<[string, (overview: RouteFilterOverview) => string]> = [
  ["data-days", (o) => String(o.days)],
  ["data-distance-km", (o) => String(o.distanceKm)],
  ["data-difficulty", (o) => o.difficulty],
  ["data-best-months", (o) => o.bestMonths.join(",")],
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
   * computeStats()'s independently-derived routePoints. A byte-for-byte
   * regeneration diff (CI's other guard) only fires if someone forgets to
   * run the build; this fires even if the committed file was hand-edited to
   * still look plausible.
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
      const rendered = readDataAttr(cardTag, attr);
      const expected = expectedFor(overview);
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
   * The interior journey narratives are hand-inlined into each detail page
   * rather than templated, so nothing stops them drifting from stages.json
   * silently: a stage added, removed, or reworded in the data would leave
   * the page's editorial content wrong with no build failure. This checks
   * two things that would catch that drift — the rendered stage count still
   * matches stages.json, and the first stage's narrative still reads exactly
   * as authored — without trying to diff all 109 stages' prose byte-for-byte.
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

    const renderedCount = (detailHtml.match(STAGE_INTERIOR_PATTERN) ?? []).length;
    if (renderedCount !== stages.length) {
      add(
        file,
        `renders ${renderedCount} stage interior narrative(s) (<details class="stage-interior">), ` +
          `stages.json has ${stages.length} stage(s) — interior journey content has drifted from the data`,
      );
    }

    const firstStage: unknown = stages[0];
    const firstNarrative = isStageLike(firstStage)
      ? localizedText(firstStage.interior?.narrative)
      : null;

    if (firstNarrative && !detailHtml.includes(firstNarrative)) {
      add(
        file,
        `stage 1's interior narrative does not appear verbatim on the page — ` +
          `interior journey content has drifted from stages.json`,
      );
    }
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

      // The coastal variant ships full geometry, a profile, and a sparkline of
      // its own, but has no detail page — its assets are inlined into the
      // parent Camino Portugués page instead.
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
    checkRouteFilterAttrs(id);

    if (RESERVED_PAGE_NAMES.has(id)) {
      add("index.json", `route id "${id}" collides with a reserved page name`);
    }
  }

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
