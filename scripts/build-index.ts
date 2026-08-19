import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, realpathSync } from "fs";
import { join, relative } from "path";

const ROOT = join(import.meta.dirname, "..");

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
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
}

export interface RouteIndex {
  schemaVersion: string;
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

  return variants.sort((a, b) => a.id.localeCompare(b.id));
}

const REGION_BY_COUNTRY: Record<string, string> = {
  ES: "Europe", FR: "Europe", PT: "Europe", IT: "Europe", DE: "Europe",
  NO: "Europe", SE: "Europe", GB: "Europe",
  JP: "Asia", IN: "Asia", CN: "Asia", KR: "Asia", NP: "Asia",
  US: "Americas", MX: "Americas", CA: "Americas",
  IL: "Middle East", TR: "Middle East",
};

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

    routes.push(routeEntry);
  }

  return routes.sort((a, b) => a.id.localeCompare(b.id));
}

const SCHEMA_VERSION = "1.0.0";

export function buildIndex(
  routesDir: string,
  previous: RouteIndex | null,
  now: () => string,
  root: string,
): RouteIndex {
  const routes = scanRoutes(routesDir, root);

  // Compare everything except the timestamp. Identical content keeps the old
  // stamp so re-running the generator is a genuine no-op and the CI drift
  // check has something stable to diff against.
  const content = JSON.stringify({ schemaVersion: SCHEMA_VERSION, routes });
  const previousContent =
    previous === null
      ? null
      : JSON.stringify({ schemaVersion: previous.schemaVersion, routes: previous.routes });

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: content === previousContent ? previous!.generatedAt : now(),
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
  );

  writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
  console.log(`Generated index.json with ${index.routes.length} route(s)`);
  for (const r of index.routes) {
    const variantCount = r.variants?.length ?? 0;
    const variantNote = variantCount > 0 ? ` (${variantCount} variant(s))` : "";
    console.log(`  ${r.id}: ${r.distanceKm} km${variantNote}`);
  }
}

export function resolveInvokedPath(argv1: string | undefined): string | null {
  if (!argv1) return null;
  try {
    return realpathSync(argv1);
  } catch {
    return null;
  }
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
