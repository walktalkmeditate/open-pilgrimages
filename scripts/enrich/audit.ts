import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "../..");

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function main() {
  const routeId = process.argv[2];
  if (!routeId) {
    console.error("Usage: tsx scripts/enrich/audit.ts <route-id>");
    process.exit(1);
  }

  const routeDir = join(ROOT, "routes", routeId);
  if (!existsSync(join(routeDir, "metadata.json"))) {
    console.error(`Route not found: ${routeId}`);
    process.exit(1);
  }

  const meta = loadJson(join(routeDir, "metadata.json"));
  const stages = existsSync(join(routeDir, "stages.json"))
    ? loadJson(join(routeDir, "stages.json"))
    : null;
  const wp = existsSync(join(routeDir, "waypoints.geojson"))
    ? loadJson(join(routeDir, "waypoints.geojson"))
    : null;
  const route = existsSync(join(routeDir, "route.geojson"))
    ? loadJson(join(routeDir, "route.geojson"))
    : null;
  const hasStats = existsSync(join(routeDir, "stats.json"));

  console.log(`\nAudit: ${meta.name.en} (${routeId})`);
  console.log("=".repeat(50));

  const coordCount = route?.features?.reduce(
    (sum: number, f: { geometry: { coordinates: unknown[] } }) =>
      sum + (f.geometry?.coordinates?.length ?? 0), 0) ?? 0;
  const geoStatus = coordCount > 100 ? "full-resolution" : "simplified";
  console.log(`\nGeometry: ${coordCount} points (${geoStatus})`);

  console.log(`Stages: ${stages?.stages?.length ?? 0}`);

  const typeCounts: Record<string, number> = {};
  let osmCount = 0;
  let curatedCount = 0;
  for (const f of wp?.features ?? []) {
    const t = f.properties.type;
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
    if (f.properties.source === "osm") osmCount++;
    else curatedCount++;
  }
  console.log(`\nWaypoints: ${wp?.features?.length ?? 0} total (${curatedCount} curated, ${osmCount} OSM)`);
  for (const [type, count] of Object.entries(typeCounts).sort()) {
    console.log(`  ${type}: ${count}`);
  }

  const allTypes = ["water_source", "medical", "accommodation", "food", "supply", "transport",
                    "town", "sacred_site", "credential_stamp", "viewpoint", "cultural_site"];
  const missing = allTypes.filter(t => !typeCounts[t]);
  if (missing.length > 0) {
    console.log(`\nMissing waypoint types: ${missing.join(", ")}`);
  }

  console.log(`\nStats: ${hasStats ? "exists" : "NOT FOUND"}`);

  const osmConfig = meta.osm;
  if (osmConfig) {
    console.log(`OSM config: ${osmConfig.relations ? `${osmConfig.relations.length} relations` : "query-based"}`);
  } else {
    console.log("OSM config: NOT CONFIGURED in metadata.json");
  }

  console.log(`Bbox: ${meta.overview?.bbox ?? "NOT SET"}`);
}

main();
