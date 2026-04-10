import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { queryOverpass, buildRelationGeomQuery, type OsmRelation } from "./osm.js";
import { haversineKm, type Coord } from "./geo-utils.js";

const ROOT = join(import.meta.dirname, "../..");

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function extractLineCoords(relation: OsmRelation): Array<[number, number]> {
  const coords: Array<[number, number]> = [];
  for (const member of relation.members) {
    if (member.type === "way" && member.geometry && member.role !== "alternative") {
      for (const point of member.geometry) {
        const last = coords[coords.length - 1];
        if (!last || last[0] !== point.lon || last[1] !== point.lat) {
          coords.push([point.lon, point.lat]);
        }
      }
    }
  }
  return coords;
}

async function main() {
  const routeId = process.argv[2];
  if (!routeId) {
    console.error("Usage: tsx scripts/enrich/geometry.ts <route-id>");
    process.exit(1);
  }

  const routeDir = join(ROOT, "routes", routeId);
  const meta = loadJson(join(routeDir, "metadata.json"));
  const routePath = join(routeDir, "route.geojson");
  const existing = existsSync(routePath) ? loadJson(routePath) : null;
  const oldCount = existing?.features?.reduce(
    (sum: number, f: any) => sum + (f.geometry?.coordinates?.length ?? 0), 0) ?? 0;

  const osmConfig = meta.osm;
  if (!osmConfig) {
    console.error(`No OSM config in metadata.json for ${routeId}. Add an "osm" field first.`);
    process.exit(1);
  }

  let query: string;
  if (osmConfig.relations) {
    query = buildRelationGeomQuery(osmConfig.relations);
  } else if (osmConfig.query) {
    query = osmConfig.query;
  } else {
    console.error(`OSM config has neither "relations" nor "query" for ${routeId}`);
    process.exit(1);
  }

  console.log(`Fetching geometry for ${routeId}...`);
  const data = await queryOverpass(query, `geom-${routeId}`) as { elements: OsmRelation[] };

  let relations = data.elements.filter((e): e is OsmRelation => e.type === "relation");
  if (relations.length === 0) {
    console.error("No relations returned from Overpass. Aborting to preserve existing data.");
    process.exit(1);
  }

  // Preserve the order from osm.relations so concatenation walks in the
  // intended sequence (Overpass returns relations in document order, which
  // does not match the requested order for multi-relation routes).
  if (osmConfig.relations && Array.isArray(osmConfig.relations)) {
    const requestedOrder = osmConfig.relations as number[];
    const byId = new Map(relations.map((r) => [r.id, r]));
    const ordered: OsmRelation[] = [];
    for (const id of requestedOrder) {
      const rel = byId.get(id);
      if (rel) ordered.push(rel);
    }
    // Append any relations the API returned that weren't in the requested list
    for (const rel of relations) {
      if (!requestedOrder.includes(rel.id)) ordered.push(rel);
    }
    relations = ordered;
  }
  console.log(`Received ${relations.length} relations`);

  const isNetwork = meta.overview?.topology === "network";
  const features: object[] = [];

  if (isNetwork) {
    for (const rel of relations) {
      const coords = extractLineCoords(rel);
      if (coords.length === 0) continue;
      const name = rel.tags["name:en"] || rel.tags["name"] || `Segment ${rel.id}`;
      const segment = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      features.push({
        type: "Feature",
        id: `${routeId}-${segment}`,
        geometry: { type: "LineString", coordinates: coords },
        properties: {
          routeId,
          name,
          type: "main",
          segment,
          source: `OpenStreetMap (relation ${rel.id}, fetched ${new Date().toISOString().split("T")[0]})`,
        },
      });
    }
  } else {
    let allCoords: Array<[number, number]> = [];
    for (const rel of relations) {
      allCoords.push(...extractLineCoords(rel));
    }

    const trimStart = osmConfig.trimStart?.coordinates as [number, number] | undefined;
    if (trimStart && allCoords.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < allCoords.length; i++) {
        const d = haversineKm(allCoords[i] as Coord, trimStart as Coord);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx > 0) {
        const before = allCoords.length;
        allCoords = allCoords.slice(bestIdx);
        console.log(
          `Trimmed ${before - allCoords.length} pre-start coordinates ` +
          `(closest match ${bestDist.toFixed(3)} km from trim target [${trimStart.join(", ")}])`,
        );
      }
    }

    features.push({
      type: "Feature",
      id: `${routeId}-main`,
      geometry: { type: "LineString", coordinates: allCoords },
      properties: {
        routeId,
        name: meta.name.en,
        type: "main",
        source: `OpenStreetMap (${relations.length} relations, fetched ${new Date().toISOString().split("T")[0]})`,
      },
    });
  }

  const geojson = { type: "FeatureCollection", features };
  writeFileSync(routePath, JSON.stringify(geojson, null, 2) + "\n");

  const newCount = features.reduce(
    (sum: number, f: any) => sum + (f.geometry?.coordinates?.length ?? 0), 0);
  console.log(`Wrote route.geojson: ${oldCount} -> ${newCount} points`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
