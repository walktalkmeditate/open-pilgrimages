import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { queryOverpass, buildRelationGeomQuery, type OsmRelation } from "./osm.js";
import { haversineMeters, lineLengthMeters } from "../ways/geo.js";
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
): { line: Position[]; legs: number[]; missing: string[] } {
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

  return { line, legs, missing };
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

function loadJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
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

async function main(): Promise<void> {
  const routeId = process.argv[2];
  if (!routeId) {
    console.error("Usage: tsx scripts/enrich/build-main-line.ts <route-id>");
    process.exit(1);
  }

  const routeDir = join(ROOT, "routes", routeId);
  const metadata = loadJson(join(routeDir, "metadata.json"));
  const stagesPath = join(routeDir, "stages.json");
  if (!existsSync(stagesPath)) {
    console.error(`${routeId} has no stages.json, so there is nothing to anchor a walked line to.`);
    process.exit(1);
  }
  const stages = loadJson(stagesPath).stages as Array<{
    index: number;
    name: { en: string };
    distanceKm: number;
    start: { coordinates: Position };
    end: { coordinates: Position };
  }>;

  const relationIds: number[] | undefined = metadata.osm?.relations;
  const query = relationIds ? buildRelationGeomQuery(relationIds) : metadata.osm?.query;
  if (!query) {
    console.error(`${routeId}'s metadata.json has no osm.relations or osm.query.`);
    process.exit(1);
  }

  console.log(`Fetching member way geometry for ${routeId}…`);
  // geometry.ts builds this same query from this same metadata.osm config and
  // caches it under geom-<routeId>. Sharing the key means one cached payload
  // rather than two, and a route whose geometry was already fetched costs
  // nothing here.
  const data = (await queryOverpass(query, `geom-${routeId}`)) as { elements: OsmRelation[] };
  const relations = data.elements.filter((e): e is OsmRelation => e.type === "relation");
  if (relations.length === 0) {
    console.error("Overpass returned no relations. Aborting to preserve existing data.");
    process.exit(1);
  }

  const ways = extractWays(relations);
  console.log(`${relations.length} relation(s), ${ways.length} member way(s)`);

  const anchors: Position[] = stages.map((s) => s.start.coordinates);
  anchors.push(stages[stages.length - 1].end.coordinates);

  const result = mainLine(ways, anchors);
  refuseIncompleteLine(result.missing);

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

  writeFileSync(join(routeDir, "route.main.geojson"), JSON.stringify(geojson, null, 2) + "\n");

  const totalKm = lineLengthMeters(result.line) / 1000;
  const declaredKm = stages.reduce((sum, s) => sum + s.distanceKm, 0);
  console.log(
    `\nWrote route.main.geojson: ${result.line.length} points, ${totalKm.toFixed(1)} km ` +
      `against ${declaredKm.toFixed(1)} km of stages\n`,
  );
  for (const stage of stages) {
    const km = result.legs[stage.index] / 1000;
    const ratio = km / stage.distanceKm;
    const verdict = Math.abs(ratio - 1) <= 0.1 ? "ok  " : "GATE";
    console.log(
      `  ${verdict} ${String(stage.index).padStart(2)} ${stage.name.en.slice(0, 44).padEnd(46)} ` +
        `${km.toFixed(2)} km vs ${stage.distanceKm} km (${ratio.toFixed(3)})`,
    );
  }
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  await main();
}
