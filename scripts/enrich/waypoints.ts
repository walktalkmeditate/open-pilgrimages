import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  queryOverpass, buildPoiQuery, classifyNode, extractName,
  extractNameLocalized, resolveName, type OsmNode,
} from "./osm.js";
import {
  haversineKm, minDistanceToLineKm, projectOntoLine,
  pointToSegmentDistanceKm, type Coord,
} from "./geo-utils.js";
import { walkedLine, lineLengthMeters } from "../ways/geo.js";
import { MOMENT_TYPES } from "../ways/moments.js";
import { resolveInvokedPath } from "../cli.js";

const ROOT = join(import.meta.dirname, "../..");
/**
 * The ways builder drops a place more than MOMENT_DROP_METERS from the line,
 * so admitting one past that only writes a waypoint no package will carry.
 */
const BUFFER_KM = 0.3;
const DEDUP_KM = 0.05;

/**
 * A service is useful without a name: an unnamed drinking fountain is still
 * water, an unnamed bus stop is still a way out. A place is not — the name is
 * the whole of what a stage card shows, so an unnamed viewpoint arrives on the
 * phone as a pin labelled "Unnamed" that tells a walker nothing. The place
 * types are exactly the ones build-ways turns into moments, so MOMENT_TYPES is
 * asked rather than a second list that could drift away from it.
 */
export function keepsNode(type: string, tags: Record<string, string>): boolean {
  if (!MOMENT_TYPES.includes(type)) return true;
  return resolveName(tags) !== undefined;
}

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

/**
 * A section whose day stages are cut *from these very waypoints* has to be
 * enriched before it has any: Shikoku's day rule ends a day at the nearest
 * named accommodation or town wherever no temple falls in range, and it can
 * only read what a run like this one wrote. One provisional range stands in
 * for the days that do not exist yet — every waypoint lands on stage 0, with
 * a kmFromStart spread across the section's declared distance — and both are
 * re-assigned once the days are cut.
 *
 * The corridor is deliberately untouched by this: which places are admitted
 * is decided by route.geojson and BUFFER_KM whether or not stages exist, so
 * the derived set a later re-run reproduces does not turn on it.
 */
export function wholeRouteRange(routeCoords: Coord[], distanceKm: number): StageRangeInfo {
  return {
    ranges: [{
      startIdx: 0,
      endIdx: routeCoords.length - 1,
      startCoord: routeCoords[0],
      endCoord: routeCoords[routeCoords.length - 1],
      distanceKm,
      cumulativeStartKm: 0,
    }],
    useGeographicFallback: false,
  };
}

export const OVERWRITE_FLAG = "--overwrite-stage-index";

/**
 * build-ways cuts a route's days from route.main.geojson wherever one exists;
 * everything below measures along route.geojson, which is that same route with
 * the variants still on it. Where both files are present the two lines are
 * different lengths, so every stageIndex and kmFromStart this script writes
 * would be measured along a line no package is cut from — and would replace
 * whatever was derived from the walked line with a cruder answer.
 *
 * The loss is what makes this worth refusing over rather than merely getting
 * right later: neither field records where it came from, so a re-run leaves no
 * trace. Coverage collapses at the next build, in a report that names no cause
 * and no run.
 *
 * Only once the days exist. A section is enriched before it has any — Shikoku's
 * day rule ends a day at the nearest named accommodation or town waypoint, and
 * can only read what a run like this one wrote — and that bootstrap has no cut
 * to disagree with yet.
 */
export function stageAssignmentRefusal(routeDir: string, routeId: string): string | undefined {
  if (!existsSync(join(routeDir, "stages.json"))) return undefined;
  const mainPath = join(routeDir, "route.main.geojson");
  if (!existsSync(mainPath)) return undefined;

  const mainKm = lineLengthMeters(walkedLine(loadJson(mainPath))) / 1000;
  // getRouteCoords, not walkedLine: the figure has to be the length of the line
  // the corridor and the assignment below actually run over, joins between
  // features included, or it would understate what this script measures along.
  const routeKm = lineLengthMeters(getRouteCoords(routeDir)) / 1000;
  const wpPath = join(routeDir, "waypoints.geojson");
  const assigned = existsSync(wpPath)
    ? loadJson(wpPath).features.filter(
        (f: any) => typeof f.properties?.stageIndex === "number").length
    : 0;

  return [
    `${routeId}: refusing to assign stages — this route's days are not cut from the line this script measures.`,
    `  route.main.geojson  ${mainKm.toFixed(1)} km  — build-ways cuts the days from this`,
    `  route.geojson       ${routeKm.toFixed(1)} km  — this run would measure along this, ` +
      `${(routeKm / mainKm).toFixed(2)}x longer`,
    `  ${assigned} waypoint(s) on disk already carry a stageIndex, and every one would be overwritten.`,
    `Derive both fields from route.main.geojson instead. A route that has already been re-derived`,
    `records the rule it used in its metadata.json provenance.`,
    `To fetch anyway and accept the overwrite, pass ${OVERWRITE_FLAG}.`,
  ].join("\n");
}

/**
 * The refusal above only composes the message; this is the half that acts on
 * it. It throws rather than exiting inline so that both arms are reachable
 * from a test — an enforcement written straight into main() can be softened to
 * a warning by one word with nothing failing, which is the same silence the
 * refusal itself exists to break.
 *
 * The overridden arm still prints: a gate that goes quiet when it is waived
 * reads exactly like a gate that found nothing.
 */
export function enforceStageAssignmentRefusal(
  refusal: string | undefined,
  args: readonly string[],
  print: (message: string) => void,
): void {
  if (refusal === undefined) return;
  if (!args.includes(OVERWRITE_FLAG)) throw new Error(refusal);
  print(`${refusal}\n${OVERWRITE_FLAG} was passed — overwriting anyway.\n`);
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
  const args = process.argv.slice(2);
  const routeId = args.find((arg) => !arg.startsWith("--"));
  if (!routeId) {
    console.error(`Usage: tsx scripts/enrich/waypoints.ts <route-id> [${OVERWRITE_FLAG}]`);
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

  // Ahead of the Overpass fetch, so a refused route costs nothing and cannot
  // half-write.
  enforceStageAssignmentRefusal(
    stageAssignmentRefusal(routeDir, routeId),
    args,
    (message) => console.warn(message),
  );

  const routeCoords = getRouteCoords(routeDir);
  const hasStages = existsSync(join(routeDir, "stages.json"));
  if (!hasStages && typeof meta.overview?.distanceKm !== "number") {
    console.error(
      `${routeId} has no stages.json to assign waypoints to and no overview.distanceKm ` +
      `to spread them across instead.`,
    );
    process.exit(1);
  }
  const { ranges: stageRanges, useGeographicFallback } = hasStages
    ? getStageRanges(routeDir, routeCoords)
    : wholeRouteRange(routeCoords, meta.overview.distanceKm);
  if (!hasStages) {
    console.log(
      `  ⚠ No stages.json yet — every waypoint lands on stage 0 with a provisional ` +
      `kmFromStart across ${meta.overview.distanceKm} km, to be re-assigned once the days are cut.`,
    );
  }
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
  let skippedUnnamed = 0;
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

    // Ahead of the dedup so a nameless place never crowds out the named one
    // standing 50 m from it.
    if (!keepsNode(classification.type, node.tags)) {
      skippedUnnamed++;
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
  console.log(`  Skipped (>${BUFFER_KM * 1000}m from route): ${skippedDistance}`);
  console.log(`  Skipped (duplicate <${DEDUP_KM * 1000}m): ${skippedDedup}`);
  console.log(`  Skipped (place with no name): ${skippedUnnamed}`);
  console.log(`  Total waypoints: ${allWaypoints.length}`);
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  await main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
