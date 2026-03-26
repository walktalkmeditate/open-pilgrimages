import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(import.meta.dirname, "..");

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

interface VariantEntry {
  id: string;
  name: Record<string, string>;
  distanceKm: number;
  path: string;
}

interface RouteEntry {
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

function scanVariants(routeDir: string): VariantEntry[] {
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
      path: relative(ROOT, varDir),
    });
  }

  return variants;
}

function main() {
  const routesDir = join(ROOT, "routes");
  const routes: RouteEntry[] = [];

  for (const entry of readdirSync(routesDir)) {
    const routeDir = join(routesDir, entry);
    const metaPath = join(routeDir, "metadata.json");
    if (!statSync(routeDir).isDirectory() || !existsSync(metaPath)) continue;

    const meta = loadJson(metaPath);
    const countries: string[] = meta.overview?.countries ?? [];
    const primaryCountry = countries.length > 1 ? countries[countries.length - 1] : countries[0] ?? "";

    const regionMap: Record<string, string> = {
      ES: "Europe", FR: "Europe", PT: "Europe", IT: "Europe", DE: "Europe",
      NO: "Europe", SE: "Europe", GB: "Europe",
      JP: "Asia", IN: "Asia", CN: "Asia", KR: "Asia", NP: "Asia",
      US: "Americas", MX: "Americas", CA: "Americas",
      IL: "Middle East", TR: "Middle East",
    };

    const routeEntry: RouteEntry = {
      id: meta.id,
      name: meta.name,
      region: regionMap[primaryCountry] ?? "Other",
      country: primaryCountry,
      distanceKm: meta.overview?.distanceKm ?? 0,
      topology: meta.overview?.topology ?? "",
      tradition: meta.tradition?.type ?? "",
      path: relative(ROOT, routeDir),
    };

    const variants = scanVariants(routeDir);
    if (variants.length > 0) {
      routeEntry.variants = variants.map((v) => ({
        id: v.id,
        name: v.name,
        distanceKm: v.distanceKm,
        path: v.path,
      }));
    }

    routes.push(routeEntry);
  }

  const index = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    routes,
  };

  const indexPath = join(ROOT, "index.json");
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
  console.log(`Generated index.json with ${routes.length} route(s)`);
  for (const r of routes) {
    const variantCount = r.variants?.length ?? 0;
    const variantNote = variantCount > 0 ? ` (${variantCount} variant(s))` : "";
    console.log(`  ${r.id}: ${r.distanceKm} km${variantNote}`);
  }
}

main();
