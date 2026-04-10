import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  queryOverpass, buildPoiQuery, classifyNode, extractName,
  extractNameLocalized, type OsmNode,
} from "./osm.js";
import {
  haversineKm, minDistanceToLineKm, projectOntoLine,
  pointToSegmentDistanceKm, type Coord,
} from "./geo-utils.js";

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
    const geom = feature.geometry;
    if (geom.type === "LineString") {
      allCoords.push(...(geom.coordinates as Coord[]));
    } else if (geom.type === "MultiLineString") {
      for (const line of geom.coordinates as Coord[][]) {
        allCoords.push(...line);
      }
    } else {
      console.warn(`  ⚠ Unsupported geometry type '${geom.type}' in feature — skipping`);
    }
  }
  return allCoords;
}

interface StageRange {
  startIdx: number;
  endIdx: number;
  startCoord: Coord;
  endCoord: Coord;
  distanceKm: number;
  cumulativeStartKm: number;
}

interface StageRangeInfo {
  ranges: StageRange[];
  useGeographicFallback: boolean;
}

function getStageRanges(routeDir: string, routeCoords: Coord[]): StageRangeInfo {
  const stages = loadJson(join(routeDir, "stages.json"));
  const ranges: StageRange[] = [];
  let cumulative = 0;

  const boundaryIdxs: number[] = [];
  for (const s of stages.stages) {
    const startCoord = s.start.coordinates as Coord;
    const { segmentIndex } = projectOntoLine(startCoord, routeCoords);
    boundaryIdxs.push(segmentIndex);
  }
  boundaryIdxs.push(routeCoords.length - 1);

  // Force first stage to claim from coord 0 (any geometry before the projected
  // first stage start belongs to stage 0 — typically a short OSM relation prefix
  // that approaches the canonical start point).
  boundaryIdxs[0] = 0;

  const monotonic = boundaryIdxs.every((v, i) => i === 0 || v >= boundaryIdxs[i - 1]);
  if (!monotonic) {
    console.warn(
      `  ⚠ Stage boundary indexes are NOT monotonic — route geometry is not in walking order ` +
      `(common for circular/network topologies). Falling back to geographic nearest-segment assignment.`,
    );
  }

  for (let i = 0; i < stages.stages.length; i++) {
    const distanceKm = stages.stages[i].distanceKm;
    ranges.push({
      startIdx: boundaryIdxs[i],
      endIdx: boundaryIdxs[i + 1],
      startCoord: stages.stages[i].start.coordinates as Coord,
      endCoord: stages.stages[i].end.coordinates as Coord,
      distanceKm,
      cumulativeStartKm: cumulative,
    });
    cumulative += distanceKm;
  }
  return { ranges, useGeographicFallback: !monotonic };
}

function assignStageByIndex(
  coordIdx: number,
  ranges: StageRange[],
): { stageIndex: number; kmFromStart: number } {
  let stageIdx = ranges.length - 1;
  for (let i = 0; i < ranges.length; i++) {
    if (coordIdx >= ranges[i].startIdx && coordIdx < ranges[i].endIdx) {
      stageIdx = i;
      break;
    }
  }
  const r = ranges[stageIdx];
  const span = r.endIdx - r.startIdx;
  const fraction = span > 0 ? Math.max(0, Math.min(1, (coordIdx - r.startIdx) / span)) : 0;
  const kmFromStart = r.cumulativeStartKm + fraction * r.distanceKm;
  return { stageIndex: stageIdx, kmFromStart };
}

function assignStageByGeography(
  wpCoord: Coord,
  ranges: StageRange[],
): { stageIndex: number; kmFromStart: number } {
  let bestStage = 0;
  let bestDist = Infinity;
  for (let i = 0; i < ranges.length; i++) {
    const d = pointToSegmentDistanceKm(wpCoord, ranges[i].startCoord, ranges[i].endCoord);
    if (d < bestDist) {
      bestDist = d;
      bestStage = i;
    }
  }
  const r = ranges[bestStage];
  const dAB = haversineKm(r.startCoord, r.endCoord);
  const dAP = haversineKm(r.startCoord, wpCoord);
  const dBP = haversineKm(r.endCoord, wpCoord);
  const projLen = dAB < 0.001 ? 0 : (dAP * dAP + dAB * dAB - dBP * dBP) / (2 * dAB);
  const fraction = Math.max(0, Math.min(1, projLen / Math.max(dAB, 0.001)));
  const kmFromStart = r.cumulativeStartKm + fraction * r.distanceKm;
  return { stageIndex: bestStage, kmFromStart };
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
  const { ranges: stageRanges, useGeographicFallback } = getStageRanges(routeDir, routeCoords);
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

    let stageIndex: number;
    let kmFromStart: number;
    if (useGeographicFallback) {
      ({ stageIndex, kmFromStart } = assignStageByGeography(coord, stageRanges));
    } else {
      const { segmentIndex } = projectOntoLine(coord, routeCoords);
      ({ stageIndex, kmFromStart } = assignStageByIndex(segmentIndex, stageRanges));
    }
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
        kmFromStart: Math.round(kmFromStart * 10) / 10,
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
