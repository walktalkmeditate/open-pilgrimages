import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { queryOverpass, buildRelationGeomQuery, type OsmRelation } from "./osm.js";
import { haversineMeters, lineLengthMeters, SNAP_METERS } from "../ways/geo.js";
import type { Position } from "../ways/types.js";
import { resolveInvokedPath } from "../cli.js";

const ROOT = join(import.meta.dirname, "../..");

export interface GraphEdge {
  to: number;
  meters: number;
  /** The edge's own geometry, already oriented from this node to `to`. */
  line: Position[];
}

export interface WayGraph {
  nodes: Position[];
  adjacency: Map<number, GraphEdge[]>;
}

const key = (p: Position): string => `${p[0]},${p[1]}`;

/**
 * Connectivity by exact coordinate identity, not by a radius. Overpass emits
 * a way's shared node with the same seven decimals in every way that carries
 * it, so identity is the true topology — and a fuzzy radius is what made the
 * first attempt at this cut corners wherever the route passes near itself in
 * a town (633 km instead of 764).
 */
export function buildWayGraph(ways: Position[][]): WayGraph {
  const occurrences = new Map<string, number>();
  for (const way of ways) {
    for (const point of way) occurrences.set(key(point), (occurrences.get(key(point)) ?? 0) + 1);
  }

  const nodes: Position[] = [];
  const nodeIds = new Map<string, number>();
  const nodeId = (p: Position): number => {
    const k = key(p);
    let id = nodeIds.get(k);
    if (id === undefined) {
      id = nodes.length;
      nodeIds.set(k, id);
      nodes.push(p);
    }
    return id;
  };

  const adjacency = new Map<number, GraphEdge[]>();
  const link = (from: number, to: number, line: Position[]): void => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    if (!adjacency.has(to)) adjacency.set(to, []);
    const meters = lineLengthMeters(line);
    adjacency.get(from)!.push({ to, meters, line });
    adjacency.get(to)!.push({ to: from, meters, line: [...line].reverse() });
  };

  for (const way of ways) {
    if (way.length < 2) continue;
    let start = 0;
    for (let i = 1; i < way.length; i++) {
      // A coordinate another way also carries is a real junction, even in the
      // middle of this one; without splitting there, a side path that meets
      // this way mid-block would be unreachable.
      const isJunction = (occurrences.get(key(way[i])) ?? 0) > 1;
      if (isJunction || i === way.length - 1) {
        const segment = way.slice(start, i + 1);
        if (segment.length >= 2) link(nodeId(segment[0]), nodeId(segment[segment.length - 1]), segment);
        start = i;
      }
    }
  }

  return { nodes, adjacency };
}

export function nearestGraphNode(graph: WayGraph, p: Position): { node: number; meters: number } {
  let node = 0;
  let meters = Infinity;
  for (let i = 0; i < graph.nodes.length; i++) {
    const d = haversineMeters(graph.nodes[i], p);
    if (d < meters) {
      meters = d;
      node = i;
    }
  }
  return { node, meters };
}

export function shortestPath(
  graph: WayGraph,
  from: number,
  to: number,
): { meters: number; line: Position[] } | null {
  const count = graph.nodes.length;
  const distance = new Float64Array(count).fill(Infinity);
  const previous = new Int32Array(count).fill(-1);
  const previousLine: Array<Position[] | undefined> = new Array(count);
  const settled = new Uint8Array(count);
  distance[from] = 0;

  // A binary heap, not a linear scan: the Camino's graph has ~3,000 nodes and
  // this runs 33 times, once per stage leg.
  const heap: Array<[number, number]> = [[0, from]];
  const push = (item: [number, number]): void => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
        if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
        i = smallest;
      }
    }
    return top;
  };

  while (heap.length > 0) {
    const [d, u] = pop();
    if (settled[u] === 1) continue;
    settled[u] = 1;
    if (u === to) break;
    for (const edge of graph.adjacency.get(u) ?? []) {
      if (d + edge.meters < distance[edge.to]) {
        distance[edge.to] = d + edge.meters;
        previous[edge.to] = u;
        previousLine[edge.to] = edge.line;
        push([distance[edge.to], edge.to]);
      }
    }
  }

  if (!Number.isFinite(distance[to])) return null;

  const chunks: Position[][] = [];
  for (let u = to; previous[u] !== -1; u = previous[u]) chunks.push(previousLine[u]!);
  chunks.reverse();

  const line: Position[] = [];
  for (const chunk of chunks) {
    for (const point of chunk) {
      const last = line[line.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) line.push(point);
    }
  }
  if (line.length === 0) line.push(graph.nodes[from]);

  return { meters: distance[to], line };
}

export function mainLine(
  ways: Position[][],
  anchors: Position[],
): { line: Position[]; legs: number[]; missing: string[]; snaps: number[] } {
  const graph = buildWayGraph(ways);
  const nodes = anchors.map((anchor) => nearestGraphNode(graph, anchor));

  const line: Position[] = [];
  const legs: number[] = [];
  const missing: string[] = [];

  const append = (points: Position[]): void => {
    for (const point of points) {
      const last = line[line.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) line.push(point);
    }
  };

  for (let i = 0; i < nodes.length - 1; i++) {
    if (nodes[i].node === nodes[i + 1].node) {
      legs.push(0);
      continue;
    }
    const path = shortestPath(graph, nodes[i].node, nodes[i + 1].node);
    if (!path) {
      missing.push(
        `leg ${i} (${anchors[i].join(",")} → ${anchors[i + 1].join(",")}) has no connected path`,
      );
      legs.push(0);
      continue;
    }
    legs.push(path.meters);
    append(path.line);
  }

  return { line, legs, missing, snaps: nodes.map((n) => n.meters) };
}

/**
 * A gap means the graph is disconnected where the route is not, and `mainLine`
 * scores that leg 0 and joins straight across it. Writing the file anyway is
 * worse than writing none: build-ways would cut every stage from a line that
 * silently omits a day's walking, and the gate would argue with the wrong
 * number.
 */
export function refuseIncompleteLine(missing: string[]): void {
  if (missing.length === 0) return;
  for (const gap of missing) console.error(`  ⚠ ${gap}`);
  console.error(
    `${missing.length} leg(s) have no connected path. Refusing to write a line with gaps in it.`,
  );
  process.exit(1);
}

/**
 * The second gate, and it catches what the first cannot see. Withholding a
 * *terminal* relation leaves the remaining graph perfectly connected — the
 * line simply stops short, `missing` stays empty, and nothing complains.
 * Measured on Awa, dropping 22→23 shortened the line by 21.6 km in silence
 * and moved Temple 23's anchor 13,454 m off the graph. Only the snap says so.
 * SNAP_METERS is the same tolerance build-ways snaps stage boundaries with,
 * so an anchor past it could not be cut to anyway.
 */
export function refuseDistantAnchors(snaps: Array<{ label: string; meters: number }>): void {
  const far = snaps.filter((s) => s.meters > SNAP_METERS);
  if (far.length === 0) return;
  for (const anchor of far) {
    console.error(`  ⚠ ${anchor.label} is ${Math.round(anchor.meters)} m from the nearest point on the line`);
  }
  console.error(
    `${far.length} anchor(s) sit further than ${SNAP_METERS} m from the line. ` +
      `Refusing to write a line that does not reach them — the pinned relations are wrong or one is missing.`,
  );
  process.exit(1);
}

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/**
 * Overpass's answer, checked rather than asserted. The old cast promised an
 * `elements` array and got whatever the endpoint felt like sending: an error
 * document, a `{}` from a rewritten cache, or the `{ remark: … }` a soft
 * timeout produces all satisfied the type and died one line later on
 * `.filter`, naming neither the route nor the reason.
 */
export function relationsFrom(data: unknown, routeId: string): OsmRelation[] {
  const elements = typeof data === "object" && data !== null
    ? (data as { elements?: unknown }).elements
    : undefined;

  if (!Array.isArray(elements)) {
    throw new Error(`${routeId}: Overpass returned no elements array, so there is no geometry to build a walked line from`);
  }

  return elements.filter((element): element is OsmRelation =>
    typeof element === "object" && element !== null && (element as { type?: unknown }).type === "relation",
  );
}

function extractWays(relations: OsmRelation[]): Position[][] {
  const ways: Position[][] = [];
  for (const relation of relations) {
    for (const member of relation.members) {
      if (member.type !== "way" || !member.geometry || member.role === "alternative") continue;
      ways.push(member.geometry.map((point) => [point.lon, point.lat] as Position));
    }
  }
  return ways;
}

/**
 * A name query pulls in every spur and variant that shares the trail's name —
 * Shikoku's 4,020 km line came from 89 such relations. The walked line is cut
 * from the section's own trail, so the relations are pinned or nothing runs.
 */
export function requireRelations(routeDir: string, routeId: string): number[] {
  const metadata = loadJson(join(routeDir, "metadata.json")) as {
    osm?: { relations?: number[] };
  };
  const relations = metadata.osm?.relations;
  if (!Array.isArray(relations) || relations.length === 0) {
    throw new Error(
      `${routeId}: metadata.json needs osm.relations to build a walked line. ` +
        `A section whose relations cannot be pinned ships metadata-only with ways: null.`,
    );
  }
  return relations;
}

export interface Anchor {
  coordinates: Position;
  label: string;
}

interface AnchorSet {
  anchors: Anchor[];
  from: string;
  /** Declared km per leg, where the anchors came from something that declares one. */
  declaredLegKm?: number[];
}

/**
 * Stage boundaries anchor the line for a route that already has stages. A
 * section whose days are still to be cut *from this line* has none, and its
 * two declared endpoints alone will not stand in for them: the shortest path
 * between Temple 1 and Temple 23 takes every shortcut the trail declines to.
 * So the places already placed on the route by hand anchor it instead, in
 * route order, with the section's own endpoints closing each end — a boundary
 * temple belongs to the neighbouring section and is not among its own
 * curated waypoints.
 *
 * `kmFromStart` orders them and is read for nothing else. It is a distance
 * along whatever line the waypoints were last measured against, which for a
 * section cut out of a larger route is not this one; the order it gives is
 * still the order the route visits them in.
 */
export function anchorsFrom(routeDir: string, routeId: string): AnchorSet {
  const stagesPath = join(routeDir, "stages.json");
  if (existsSync(stagesPath)) {
    const stages = (loadJson(stagesPath) as { stages: unknown }).stages as Array<{
      index: number;
      name: { en: string };
      distanceKm: number;
      start: { coordinates: Position };
      end: { coordinates: Position };
    }>;
    if (!Array.isArray(stages) || stages.length === 0) {
      throw new Error(`${routeId}: stages.json has no stages to anchor a walked line to`);
    }
    const anchors = stages.map((stage) => ({
      coordinates: stage.start.coordinates,
      label: stage.name.en,
    }));
    const last = stages[stages.length - 1];
    anchors.push({ coordinates: last.end.coordinates, label: `end of ${last.name.en}` });
    return { anchors, from: "stages.json", declaredLegKm: stages.map((s) => s.distanceKm) };
  }

  const metadata = loadJson(join(routeDir, "metadata.json")) as {
    overview?: {
      startPoint?: { name?: { en?: string }; coordinates?: Position };
      endPoint?: { name?: { en?: string }; coordinates?: Position };
    };
  };
  const start = metadata.overview?.startPoint;
  const end = metadata.overview?.endPoint;
  if (!start?.coordinates || !end?.coordinates) {
    throw new Error(
      `${routeId}: with no stages.json, the walked line is anchored on overview.startPoint, ` +
        `the curated waypoints, and overview.endPoint — and metadata.json declares no such endpoints.`,
    );
  }

  const waypointsPath = join(routeDir, "waypoints.geojson");
  if (!existsSync(waypointsPath)) {
    throw new Error(
      `${routeId}: with no stages.json, the curated waypoints anchor the walked line, ` +
        `and there is no waypoints.geojson to read them from.`,
    );
  }
  const waypoints = (loadJson(waypointsPath) as { features: unknown }).features as Array<{
    id?: string;
    geometry: { coordinates: Position };
    properties: { name?: string; source?: string; kmFromStart?: number };
  }>;
  const curated = (Array.isArray(waypoints) ? waypoints : []).filter(
    (f) => f.properties?.source === undefined,
  );
  if (curated.length === 0) {
    throw new Error(
      `${routeId}: waypoints.geojson holds no curated waypoints, so there is nothing between ` +
        `the endpoints to hold the line to the route.`,
    );
  }
  for (const feature of curated) {
    if (typeof feature.properties.kmFromStart !== "number") {
      throw new Error(
        `${routeId}: curated waypoint "${feature.id ?? feature.properties.name}" has no ` +
          `kmFromStart, so the anchors cannot be put in route order.`,
      );
    }
  }

  const anchors: Anchor[] = [
    { coordinates: start.coordinates, label: start.name?.en ?? "start" },
    ...[...curated]
      .sort((a, b) => a.properties.kmFromStart! - b.properties.kmFromStart!)
      .map((f) => ({
        coordinates: f.geometry.coordinates,
        label: f.properties.name ?? f.id ?? "curated waypoint",
      })),
    { coordinates: end.coordinates, label: end.name?.en ?? "end" },
  ];

  // A section's own endpoint is often one of its curated waypoints too, and an
  // anchor repeated back to back only scores a zero-length leg.
  const deduped = anchors.filter(
    (anchor, i) =>
      i === 0 ||
      anchor.coordinates[0] !== anchors[i - 1].coordinates[0] ||
      anchor.coordinates[1] !== anchors[i - 1].coordinates[1],
  );

  return { anchors: deduped, from: "overview endpoints and waypoints.geojson" };
}

async function main(): Promise<void> {
  const routeId = process.argv[2];
  if (!routeId) {
    console.error("Usage: tsx scripts/enrich/build-main-line.ts <route-id>");
    process.exit(1);
  }

  const routeDir = join(ROOT, "routes", routeId);
  const metadata = loadJson(join(routeDir, "metadata.json")) as {
    name: { en: string };
    overview?: { distanceKm?: number };
  };
  const { anchors, from, declaredLegKm } = anchorsFrom(routeDir, routeId);

  const relationIds = requireRelations(routeDir, routeId);
  const query = buildRelationGeomQuery(relationIds);

  console.log(`Fetching member way geometry for ${routeId}…`);
  // geometry.ts builds this same query from this same metadata.osm config and
  // caches it under geom-<routeId>. Sharing the key means one cached payload
  // rather than two, and a route whose geometry was already fetched costs
  // nothing here.
  const relations = relationsFrom(await queryOverpass(query, `geom-${routeId}`), routeId);
  if (relations.length === 0) {
    console.error("Overpass returned no relations. Aborting to preserve existing data.");
    process.exit(1);
  }

  const ways = extractWays(relations);
  console.log(`${relations.length} relation(s), ${ways.length} member way(s)`);
  console.log(`${anchors.length} anchor(s) from ${from}`);

  const result = mainLine(ways, anchors.map((a) => a.coordinates));
  refuseIncompleteLine(result.missing);
  const snaps = anchors.map((anchor, i) => ({ label: anchor.label, meters: result.snaps[i] }));
  refuseDistantAnchors(snaps);

  const geojson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: `${routeId}-main-line`,
        geometry: { type: "LineString", coordinates: result.line },
        properties: {
          routeId,
          name: metadata.name.en,
          type: "main",
          source:
            `OpenStreetMap (${relations.length} relations, member ways only, shortest connected ` +
            `path between stage boundaries, fetched ${new Date().toISOString().split("T")[0]})`,
          notes:
            "The walked line: the route's main line with optional variants and detours left out. " +
            "Stage geometry is cut from this, never from route.geojson.",
        },
      },
    ],
  };

  writeFileSync(join(routeDir, "route.main.geojson"), JSON.stringify(geojson) + "\n");

  const totalKm = lineLengthMeters(result.line) / 1000;
  const declaredKm = declaredLegKm
    ? declaredLegKm.reduce((sum, km) => sum + km, 0)
    : metadata.overview?.distanceKm;
  const against = declaredKm === undefined
    ? ""
    : ` against ${declaredKm.toFixed(1)} km declared`;
  console.log(`\nWrote route.main.geojson: ${result.line.length} points, ${totalKm.toFixed(1)} km${against}\n`);

  const worst = snaps.reduce((a, b) => (b.meters > a.meters ? b : a));
  console.log(
    `  worst anchor snap: ${Math.round(worst.meters)} m at ${worst.label} ` +
      `(limit ${SNAP_METERS} m), ${result.missing.length} leg(s) unconnected\n`,
  );

  for (let i = 0; i < result.legs.length; i++) {
    const km = result.legs[i] / 1000;
    const declared = declaredLegKm?.[i];
    if (declared === undefined) {
      console.log(
        `  ${String(i).padStart(2)} ${`${anchors[i].label} → ${anchors[i + 1].label}`.slice(0, 52).padEnd(54)} ` +
          `${km.toFixed(2)} km`,
      );
      continue;
    }
    const ratio = km / declared;
    const verdict = Math.abs(ratio - 1) <= 0.1 ? "ok  " : "GATE";
    console.log(
      `  ${verdict} ${String(i).padStart(2)} ${anchors[i].label.slice(0, 44).padEnd(46)} ` +
        `${km.toFixed(2)} km vs ${declared} km (${ratio.toFixed(3)})`,
    );
  }
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  await main();
}
