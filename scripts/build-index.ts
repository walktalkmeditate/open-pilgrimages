import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { byCodepoint, resolveInvokedPath } from "./cli.js";
import { primaryCountry, regionOf } from "./region.js";
import { readPilgrimage, groupSections, type PilgrimageBlock } from "./pilgrimage.js";

const ROOT = join(import.meta.dirname, "..");

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function byIdThenPath(a: { id: string; path: string }, b: { id: string; path: string }): number {
  return byCodepoint(a.id, b.id) || byCodepoint(a.path, b.path);
}

export interface VariantEntry {
  id: string;
  name: Record<string, string>;
  distanceKm: number;
  path: string;
}

export interface RouteEntry {
  id: string;
  name: Record<string, string>;
  region: string;
  country: string;
  distanceKm: number;
  topology: string;
  tradition: string;
  path: string;
  variants?: VariantEntry[];
  ways?: WaysEntry;
  pilgrimage?: string;
}

/** What the app needs to size a download, and to say how curated it is. */
export interface WaysEntry {
  stageCount: number;
  bytes: number;
  /** Places beyond the day's own ends, averaged over the stages. */
  placesPerStage: number;
  /** Fewer than half the stages carry such a place: the card says so. */
  sparse: boolean;
}

export interface RouteIndex {
  schemaVersion: string;
  release: string;
  generatedAt: string;
  pilgrimages?: PilgrimageEntry[];
  routes: RouteEntry[];
}

function scanVariants(routeDir: string, root: string): VariantEntry[] {
  const variantsDir = join(routeDir, "variants");
  if (!existsSync(variantsDir) || !statSync(variantsDir).isDirectory()) {
    return [];
  }

  const variants: VariantEntry[] = [];
  for (const entry of readdirSync(variantsDir)) {
    const varDir = join(variantsDir, entry);
    const metaPath = join(varDir, "metadata.json");
    if (!statSync(varDir).isDirectory() || !existsSync(metaPath)) continue;

    const meta = loadJson(metaPath);
    variants.push({
      id: meta.id,
      name: meta.name,
      distanceKm: meta.overview?.distanceKm ?? 0,
      path: relative(root, varDir),
    });
  }

  return variants.sort(byIdThenPath);
}

/**
 * The tag the release will carry, read from package.json rather than from git:
 * the tag does not exist yet when this runs, and CI has no tags at all.
 * .claude/commands/release.md bumps the version before regenerating.
 */
export function releaseTag(packageJsonPath: string): string {
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { version?: string };
  const version = pkg.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`package.json version "${version}" is not a SemVer release`);
  }
  return `v${version}`;
}

/**
 * A route earns a catalog entry when its own report says every stage cleared
 * the length gate. Coverage does not gate it — it rides along as
 * `placesPerStage` and `sparse`, which is what the app's card reads. Reading
 * the report rather than recomputing keeps one verdict, in one file, that a
 * reviewer can open.
 */
export function waysEntry(routeDir: string): WaysEntry | undefined {
  const reportPath = join(routeDir, "ways", "report.json");
  const cardPath = join(routeDir, "ways", "route.json");
  if (!existsSync(reportPath) || !existsSync(cardPath)) return undefined;

  let report: {
    gate?: { passed?: boolean };
    places?: { sparse?: boolean; placesPerStage?: number };
    stages?: unknown[];
  };
  try {
    report = JSON.parse(readFileSync(reportPath, "utf-8"));
  } catch (error) {
    console.warn(`Could not parse ${reportPath}, omitting ways entry:`, error);
    return undefined;
  }
  if (report.gate?.passed !== true) return undefined;

  let bytes = 0;
  const waysDir = join(routeDir, "ways");
  for (const entry of readdirSync(waysDir)) {
    // report.json is the repo's own bookkeeping; the app never downloads it.
    if (entry === "report.json") continue;
    bytes += statSync(join(waysDir, entry)).size;
  }

  return {
    stageCount: report.stages?.length ?? 0,
    bytes,
    placesPerStage: report.places?.placesPerStage ?? 0,
    sparse: report.places?.sparse ?? true,
  };
}

/**
 * One route directory as read from disk: the entry it contributes to
 * `routes[]`, plus what only the directory itself can say — the pilgrimage
 * block, and whether `metadata.json` actually declared a distance, which the
 * entry's own `distanceKm` has already collapsed to 0.
 */
export interface ScannedSection {
  entry: RouteEntry;
  block?: PilgrimageBlock;
  declaredDistanceKm?: number;
}

export function scanSections(routesDir: string, root: string): ScannedSection[] {
  const sections: ScannedSection[] = [];
  const failures: string[] = [];

  for (const entry of readdirSync(routesDir)) {
    const routeDir = join(routesDir, entry);
    const metaPath = join(routeDir, "metadata.json");
    if (!statSync(routeDir).isDirectory() || !existsSync(metaPath)) continue;

    const meta = loadJson(metaPath);
    const country = primaryCountry(meta.overview?.countries);

    const routeEntry: RouteEntry = {
      id: meta.id,
      name: meta.name,
      region: regionOf(country),
      country,
      distanceKm: meta.overview?.distanceKm ?? 0,
      topology: meta.overview?.topology ?? "",
      tradition: meta.tradition?.type ?? "",
      path: relative(root, routeDir),
    };

    // Per route directory, the isolation build-ways gives each of its own:
    // readPilgrimage names the field it refused but not the file it came
    // from, and thrown bare from here a single typo killed the run with a
    // stack trace pointing at pilgrimage.ts. Collecting instead of throwing
    // means twelve directories report twelve problems, not the first one.
    let pilgrimage: PilgrimageBlock | undefined;
    try {
      pilgrimage = readPilgrimage(meta);
    } catch (error) {
      failures.push(
        `${relative(root, metaPath)}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    if (pilgrimage) routeEntry.pilgrimage = pilgrimage.id;

    const variants = scanVariants(routeDir, root);
    if (variants.length > 0) {
      routeEntry.variants = variants;
    }

    const ways = waysEntry(routeDir);
    if (ways) {
      routeEntry.ways = ways;
    }

    sections.push({
      entry: routeEntry,
      block: pilgrimage,
      declaredDistanceKm:
        typeof meta.overview?.distanceKm === "number" ? meta.overview.distanceKm : undefined,
    });
  }

  // An index missing a section is worse than no index: consumers read it from
  // @main and would see the route quietly disappear from the catalog.
  if (failures.length > 0) throw new Error(failures.join("\n"));

  return sections.sort((a, b) => byIdThenPath(a.entry, b.entry));
}

export function scanRoutes(routesDir: string, root: string): RouteEntry[] {
  return scanSections(routesDir, root).map((section) => section.entry);
}

export interface PilgrimageEntry {
  id: string;
  name: Record<string, string>;
  kind: "legs" | "alternatives";
  sections: string[];
  distanceKm?: number;
  stageCount?: number;
}

/**
 * Derived from the sections `scanSections` already read, not from a second
 * walk of routes/: the two traversals disagreed about order (one sorted, one
 * raw readdir), which decided the order these floating-point sums were
 * reduced in, and that differs between macOS and ubuntu-latest.
 */
export function scanPilgrimages(sections: ScannedSection[]): PilgrimageEntry[] {
  const declared = sections.filter(
    (section): section is ScannedSection & { block: PilgrimageBlock } => section.block !== undefined,
  );

  const grouped = groupSections(declared.map(({ entry, block }) => ({ routeId: entry.id, block })));
  return [...grouped.entries()]
    .map(([id, { block, routeIds }]) => {
      const members = declared.filter((d) => d.block.id === id);
      const entry: PilgrimageEntry = { id, name: block.name, kind: block.kind, sections: routeIds };
      // A walker walks one alternative, so a total across them describes no
      // walk anyone takes; only a chained pilgrimage has a meaningful sum.
      if (block.kind === "legs") {
        // A total is emitted only when every section fed it. Summing a
        // missing input as zero would pair a whole pilgrimage's distance
        // with three quarters of its days, and the app renders the pair as
        // fact. The two inputs fail for different reasons: a section with no
        // distanceKm is a file schema/pilgrimage.schema.json requires it in,
        // so validate refuses it; a section with no stageCount has simply
        // not shipped its ways package yet, which the design allows.
        const distances = members
          .map((m) => m.declaredDistanceKm)
          .filter((km): km is number => km !== undefined);
        if (distances.length === members.length) {
          entry.distanceKm = Number(distances.reduce((sum, km) => sum + km, 0).toFixed(1));
        }

        const stageCounts = members
          .map((m) => m.entry.ways?.stageCount)
          .filter((count): count is number => count !== undefined);
        if (stageCounts.length === members.length) {
          entry.stageCount = stageCounts.reduce((sum, count) => sum + count, 0);
        }
      }
      return entry;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

const SCHEMA_VERSION = "1.0.0";

export function buildIndex(
  routesDir: string,
  previous: RouteIndex | null,
  now: () => string,
  root: string,
  release: string,
): RouteIndex {
  const sections = scanSections(routesDir, root);
  const routes = sections.map((section) => section.entry);
  const pilgrimages = scanPilgrimages(sections);

  // Compare everything except the timestamp. Identical content keeps the old
  // stamp so re-running the generator is a genuine no-op and the CI drift
  // check has something stable to diff against. pilgrimages is normalized to
  // undefined when empty on both sides, matching how it's only ever emitted
  // (or read back) as a present, non-empty array — so "nobody declares one"
  // never differs from itself as undefined vs. an absent key.
  const content = JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    release,
    pilgrimages: pilgrimages.length > 0 ? pilgrimages : undefined,
    routes,
  });
  const previousContent =
    previous === null
      ? null
      : JSON.stringify({
          schemaVersion: previous.schemaVersion,
          release: previous.release,
          pilgrimages: previous.pilgrimages,
          routes: previous.routes,
        });

  return {
    schemaVersion: SCHEMA_VERSION,
    release,
    generatedAt:
      content === previousContent && typeof previous?.generatedAt === "string"
        ? previous.generatedAt
        : now(),
    ...(pilgrimages.length > 0 ? { pilgrimages } : {}),
    routes,
  };
}

export function readPrevious(indexPath: string): RouteIndex | null {
  if (!existsSync(indexPath)) return null;
  try {
    return JSON.parse(readFileSync(indexPath, "utf-8")) as RouteIndex;
  } catch (error) {
    console.warn(`Could not read previous index at ${indexPath}, treating as absent:`, error);
    return null;
  }
}

function main() {
  const routesDir = join(ROOT, "routes");
  const indexPath = join(ROOT, "index.json");

  let index: RouteIndex;
  try {
    index = buildIndex(
      routesDir,
      readPrevious(indexPath),
      () => new Date().toISOString(),
      ROOT,
      releaseTag(join(ROOT, "package.json")),
    );
  } catch (error) {
    console.error("\nBuild failed:");
    for (const line of (error instanceof Error ? error.message : String(error)).split("\n")) {
      console.error(`  ✗ ${line}`);
    }
    process.exit(1);
  }

  writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
  console.log(`Generated index.json with ${index.routes.length} route(s)`);
  for (const r of index.routes) {
    const variantCount = r.variants?.length ?? 0;
    const variantNote = variantCount > 0 ? ` (${variantCount} variant(s))` : "";
    console.log(`  ${r.id}: ${r.distanceKm} km${variantNote}`);
  }
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
