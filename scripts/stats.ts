import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function main() {
  const routesDir = join(ROOT, "routes");
  let totalStages = 0;
  let totalWaypoints = 0;
  let totalDistanceKm = 0;

  console.log("Open Pilgrimages — Dataset Statistics\n");
  console.log("=".repeat(60));

  for (const entry of readdirSync(routesDir).sort()) {
    const routeDir = join(routesDir, entry);
    if (!statSync(routeDir).isDirectory()) continue;
    const metaPath = join(routeDir, "metadata.json");
    if (!existsSync(metaPath)) continue;

    const meta = loadJson(metaPath);
    const stagesPath = join(routeDir, "stages.json");
    const wpPath = join(routeDir, "waypoints.geojson");
    const routePath = join(routeDir, "route.geojson");

    const stages = existsSync(stagesPath) ? loadJson(stagesPath) : null;
    const wp = existsSync(wpPath) ? loadJson(wpPath) : null;
    const route = existsSync(routePath) ? loadJson(routePath) : null;

    const stageCount = stages?.stages?.length ?? 0;
    const wpCount = wp?.features?.length ?? 0;
    const coordCount = route?.features?.reduce(
      (sum: number, f: { geometry: { coordinates: unknown[] } }) =>
        sum + (f.geometry?.coordinates?.length ?? 0),
      0
    ) ?? 0;
    const distKm = meta.overview?.distanceKm ?? 0;
    const stageDistSum = stages?.stages?.reduce(
      (sum: number, s: { distanceKm: number }) => sum + (s.distanceKm ?? 0),
      0
    ) ?? 0;

    totalStages += stageCount;
    totalWaypoints += wpCount;
    totalDistanceKm += distKm;

    console.log(`\n${meta.name.en}`);
    console.log("-".repeat(40));
    console.log(`  Route ID:     ${meta.id}`);
    console.log(`  Topology:     ${meta.overview?.topology}`);
    console.log(`  Tradition:    ${meta.tradition?.type}`);
    console.log(`  Distance:     ${distKm} km (metadata)`);
    console.log(`  Stage sum:    ${stageDistSum.toFixed(1)} km`);
    console.log(`  Stages:       ${stageCount}`);
    console.log(`  Waypoints:    ${wpCount}`);
    console.log(`  Route points: ${coordCount}`);
    console.log(`  Countries:    ${meta.overview?.countries?.join(", ") ?? "?"}`);

    if (stages?.stages) {
      const interiorCount = stages.stages.filter(
        (s: { interior?: unknown }) => s.interior
      ).length;
      console.log(`  Interior:     ${interiorCount}/${stageCount} stages have interior journey content`);
    }

    const variantsDir = join(routeDir, "variants");
    if (existsSync(variantsDir) && statSync(variantsDir).isDirectory()) {
      const variants = readdirSync(variantsDir).filter((v) =>
        existsSync(join(variantsDir, v, "metadata.json"))
      );
      if (variants.length > 0) {
        console.log(`  Variants:     ${variants.join(", ")}`);
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`\nTotals:`);
  console.log(`  Routes:       ${readdirSync(routesDir).filter((e) => existsSync(join(routesDir, e, "metadata.json"))).length}`);
  console.log(`  Stages:       ${totalStages}`);
  console.log(`  Waypoints:    ${totalWaypoints}`);
  console.log(`  Distance:     ${totalDistanceKm.toLocaleString()} km`);
}

main();
