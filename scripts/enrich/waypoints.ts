import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  queryOverpass, buildPoiQuery, classifyNode, extractName,
  extractNameLocalized, type OsmNode,
} from "./osm.js";
import { haversineKm, minDistanceToLineKm, projectOntoLine, type Coord } from "./geo-utils.js";

const ROOT = join(import.meta.dirname, "../..");
const BUFFER_KM = 0.5;
const DEDUP_KM = 0.05;

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function getRouteCoords(routeDir: string): Coord[] {
  const route = loadJson(join(routeDir, "route.geojson"));
  const allCoords: Coord[] = [];
  for (const feature of route.features) {
    allCoords.push(...(feature.geometry.coordinates as Coord[]));
  }
  return allCoords;
}

function getStageRanges(routeDir: string): Array<{ cumulativeKm: number }> {
  const stages = loadJson(join(routeDir, "stages.json"));
  const ranges: Array<{ cumulativeKm: number }> = [];
  let cumulative = 0;
  for (const s of stages.stages) {
    cumulative += s.distanceKm;
    ranges.push({ cumulativeKm: cumulative });
  }
  return ranges;
}

function findStageIndex(kmAlong: number, ranges: Array<{ cumulativeKm: number }>): number {
  if (ranges.length === 0) return 0;
  for (let i = 0; i < ranges.length; i++) {
    if (kmAlong <= ranges[i].cumulativeKm) return i;
  }
  return ranges.length - 1;
}

async function main() {
  const routeId = process.argv[2];
  if (!routeId) {
    console.error("Usage: tsx scripts/enrich/waypoints.ts <route-id>");
    process.exit(1);
  }

  const routeDir = join(ROOT, "routes", routeId);
  const meta = loadJson(join(routeDir, "metadata.json"));
  const wpPath = join(routeDir, "waypoints.geojson");
  const existing = existsSync(wpPath) ? loadJson(wpPath) : { type: "FeatureCollection", features: [] };

  if (!existsSync(join(routeDir, "route.geojson"))) {
    console.error("route.geojson not found. Run geometry enrichment first.");
    process.exit(1);
  }

  if (!meta.overview?.bbox) {
    console.error(`Missing overview.bbox in metadata.json for ${routeId}.`);
    process.exit(1);
  }

  const routeCoords = getRouteCoords(routeDir);
  const stageRanges = getStageRanges(routeDir);
  const bbox = meta.overview.bbox as [number, number, number, number];

  const curated = existing.features.filter((f: any) => f.properties.source !== "osm");
  const curatedCoords = curated.map((f: any) => f.geometry.coordinates as Coord);

  console.log(`Fetching POIs for ${routeId} within bbox [${bbox}]...`);
  const query = buildPoiQuery(bbox);
  const data = await queryOverpass(query, `pois-${routeId}`) as { elements: OsmNode[] };
  const nodes = data.elements.filter((e): e is OsmNode => e.type === "node");
  console.log(`Received ${nodes.length} POIs from OSM`);

  const added: Record<string, number> = {};
  let skippedDistance = 0;
  let skippedDedup = 0;
  const newWaypoints: object[] = [];

  for (const node of nodes) {
    const classification = classifyNode(node);
    if (!classification) continue;

    const coord: Coord = [node.lon, node.lat];
    const dist = minDistanceToLineKm(coord, routeCoords);

    if (dist > BUFFER_KM) {
      skippedDistance++;
      continue;
    }

    const tooCloseCurated = curatedCoords.some((c: Coord) => haversineKm(c, coord) < DEDUP_KM);
    const tooCloseOsm = newWaypoints.some((w: any) =>
      haversineKm(w.geometry.coordinates as Coord, coord) < DEDUP_KM
    );
    if (tooCloseCurated || tooCloseOsm) {
      skippedDedup++;
      continue;
    }

    const { kmAlong } = projectOntoLine(coord, routeCoords);
    const stageIndex = findStageIndex(kmAlong, stageRanges);
    const name = extractName(node.tags);
    const nameLocalized = extractNameLocalized(node.tags);

    const feature: Record<string, unknown> = {
      type: "Feature",
      id: `wp-osm-${classification.type}-node${node.id}`,
      geometry: { type: "Point", coordinates: coord },
      properties: {
        routeId,
        name,
        ...(nameLocalized && { nameLocalized }),
        type: classification.type,
        subtype: classification.subtype,
        stageIndex,
        kmFromStart: Math.round(kmAlong * 10) / 10,
        icon: classification.subtype,
        source: "osm",
        osmId: `node/${node.id}`,
        ...(node.tags.ele && isFinite(parseFloat(node.tags.ele)) && { elevation: parseFloat(node.tags.ele) }),
        ...(node.tags.opening_hours && { hours: node.tags.opening_hours }),
      },
    };

    newWaypoints.push(feature);
    added[classification.type] = (added[classification.type] ?? 0) + 1;
  }

  newWaypoints.sort((a: any, b: any) =>
    (a.properties.kmFromStart ?? 0) - (b.properties.kmFromStart ?? 0));
  const allWaypoints = [...curated, ...newWaypoints];
  allWaypoints.sort((a: any, b: any) =>
    (a.properties.kmFromStart ?? 0) - (b.properties.kmFromStart ?? 0));

  writeFileSync(wpPath, JSON.stringify({ type: "FeatureCollection", features: allWaypoints }, null, 2) + "\n");

  console.log(`\nResults:`);
  console.log(`  Curated waypoints preserved: ${curated.length}`);
  console.log(`  OSM waypoints added: ${newWaypoints.length}`);
  for (const [type, count] of Object.entries(added).sort()) {
    console.log(`    ${type}: ${count}`);
  }
  console.log(`  Skipped (>500m from route): ${skippedDistance}`);
  console.log(`  Skipped (duplicate <50m): ${skippedDedup}`);
  console.log(`  Total waypoints: ${allWaypoints.length}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
