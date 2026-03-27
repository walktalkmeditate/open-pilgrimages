import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { queryOverpass, buildRelationGeomQuery, type OsmRelation } from "./osm.js";

const ROOT = join(import.meta.dirname, "../..");

async function main() {
  const routeId = process.argv[2];
  if (!routeId) {
    console.error("Usage: tsx scripts/enrich/fetch-geometry-chunked.ts <route-id>");
    process.exit(1);
  }

  const meta = JSON.parse(readFileSync(join(ROOT, "routes", routeId, "metadata.json"), "utf-8"));
  const osmConfig = meta.osm;

  if (!osmConfig?.relations) {
    console.error("This script requires osm.relations in metadata.json (not query-based).");
    process.exit(1);
  }

  const relations: OsmRelation[] = [];

  for (let idx = 0; idx < osmConfig.relations.length; idx++) {
    const relId = osmConfig.relations[idx];
    if (idx > 0) {
      console.log("  Waiting 10s between requests...");
      await new Promise((r) => setTimeout(r, 10000));
    }
    console.log(`Fetching relation ${relId}...`);
    const data = await queryOverpass(
      buildRelationGeomQuery([relId]),
      `geom-${routeId}-${relId}`
    ) as { elements: OsmRelation[] };
    const rels = data.elements.filter((e): e is OsmRelation => e.type === "relation");
    relations.push(...rels);
    console.log(`  ${rels.length} relation(s), ${rels.reduce((s, r) => s + r.members.length, 0)} members`);
  }

  if (relations.length === 0) {
    console.error("No relations returned. Aborting.");
    process.exit(1);
  }

  const coords: Array<[number, number]> = [];
  for (const rel of relations) {
    for (const member of rel.members) {
      if (member.type === "way" && member.geometry && member.role !== "alternative") {
        for (const pt of member.geometry) {
          const last = coords[coords.length - 1];
          if (!last || last[0] !== pt.lon || last[1] !== pt.lat) {
            coords.push([pt.lon, pt.lat]);
          }
        }
      }
    }
  }

  const geojson = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      id: `${routeId}-main`,
      geometry: { type: "LineString", coordinates: coords },
      properties: {
        routeId,
        name: meta.name.en,
        type: "main",
        source: `OpenStreetMap (${relations.length} relations, fetched ${new Date().toISOString().split("T")[0]})`,
      },
    }],
  };

  const routePath = join(ROOT, "routes", routeId, "route.geojson");
  writeFileSync(routePath, JSON.stringify(geojson) + "\n");
  console.log(`\nWrote route.geojson: ${coords.length} points`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
