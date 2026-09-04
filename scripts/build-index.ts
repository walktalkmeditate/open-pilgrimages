import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { byCodepoint, resolveInvokedPath } from "./cli.js";

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

export const REGION_BY_COUNTRY: Record<string, string> = {
  ES: "Europe", FR: "Europe", PT: "Europe", IT: "Europe", DE: "Europe",
  NO: "Europe", SE: "Europe", GB: "Europe",
  JP: "Asia", IN: "Asia", CN: "Asia", KR: "Asia", NP: "Asia",
  US: "Americas", MX: "Americas", CA: "Americas",
  IL: "Middle East", TR: "Middle East",
};

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
  } catch {
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

export function scanRoutes(routesDir: string, root: string): RouteEntry[] {
  const routes: RouteEntry[] = [];

  for (const entry of readdirSync(routesDir)) {
    const routeDir = join(routesDir, entry);
    const metaPath = join(routeDir, "metadata.json");
    if (!statSync(routeDir).isDirectory() || !existsSync(metaPath)) continue;

    const meta = loadJson(metaPath);
    const countries: string[] = meta.overview?.countries ?? [];
    const primaryCountry =
      countries.length > 1 ? countries[countries.length - 1] : countries[0] ?? "";

    const routeEntry: RouteEntry = {
      id: meta.id,
      name: meta.name,
      region: REGION_BY_COUNTRY[primaryCountry] ?? "Other",
      country: primaryCountry,
      distanceKm: meta.overview?.distanceKm ?? 0,
      topology: meta.overview?.topology ?? "",
      tradition: meta.tradition?.type ?? "",
      path: relative(root, routeDir),
    };

    const variants = scanVariants(routeDir, root);
    if (variants.length > 0) {
      routeEntry.variants = variants;
    }

    const ways = waysEntry(routeDir);
    if (ways) {
      routeEntry.ways = ways;
    }

    routes.push(routeEntry);
  }

  return routes.sort(byIdThenPath);
}

const SCHEMA_VERSION = "1.0.0";

export function buildIndex(
  routesDir: string,
  previous: RouteIndex | null,
  now: () => string,
  root: string,
  release: string,
): RouteIndex {
  const routes = scanRoutes(routesDir, root);

  // Compare everything except the timestamp. Identical content keeps the old
  // stamp so re-running the generator is a genuine no-op and the CI drift
  // check has something stable to diff against.
  const content = JSON.stringify({ schemaVersion: SCHEMA_VERSION, release, routes });
  const previousContent =
    previous === null
      ? null
      : JSON.stringify({
          schemaVersion: previous.schemaVersion,
          release: previous.release,
          routes: previous.routes,
        });

  return {
    schemaVersion: SCHEMA_VERSION,
    release,
    generatedAt:
      content === previousContent && typeof previous?.generatedAt === "string"
        ? previous.generatedAt
        : now(),
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

  const index = buildIndex(
    routesDir,
    readPrevious(indexPath),
    () => new Date().toISOString(),
    ROOT,
    releaseTag(join(ROOT, "package.json")),
  );

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
