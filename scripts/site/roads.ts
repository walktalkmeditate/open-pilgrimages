import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { createHash } from "node:crypto";
import { resolveInvokedPath } from "../cli.js";
import { readJson, targets } from "./build-assets.js";
import { GLYPH_BOX, segmentsOf } from "./glyphs.js";
import { mercator, simplify, toPathData, type Box, type Point } from "./project.js";

const ROOT = join(import.meta.dirname, "..", "..");

function haversineKm(a: Point, b: Point): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const EARTH_RADIUS_KM = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h =
    s1 * s1 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * s2 * s2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * How far apart kept points may be along the path. Chosen with
 * AROUND_RADIUS_METERS below so every original route point — anywhere along
 * the path, not just at a kept point — is guaranteed to be closer to its
 * nearest kept point than the corridor radius has room for: half the
 * spacing (routes are dense GPS traces, so consecutive points are metres
 * apart, not kilometres) plus the ~3.3 km the corridor grid can reach stays
 * well inside a 6 km "around" radius. Wider than the minimum safe spacing
 * on purpose — Overpass's public instance measurably struggled (timeouts
 * past 180s) with a few hundred "around" anchors on the busiest routes;
 * fewer, further-apart anchors is the cheaper query for the same coverage.
 */
const DECIMATION_SPACING_KM = 3;

/**
 * A rectangular bbox query over a route's full extent charges Overpass for
 * the *entire bounding rectangle* of a route, not its footprint — for a
 * sprawling coastal route that's the difference between a few thousand
 * roads and (measured) over 200,000, and it reliably time out on the public
 * instance. Querying "around" a decimated trace of the path itself charges
 * only for the corridor's actual footprint, matching what build-roads keeps
 * anyway.
 */
export function decimateRoutePoints(segments: Point[][], spacingKm: number = DECIMATION_SPACING_KM): Point[] {
  const kept: Point[] = [];

  for (const segment of segments) {
    if (segment.length === 0) continue;

    let last = segment[0];
    kept.push(last);

    for (let i = 1; i < segment.length; i++) {
      const point = segment[i];
      if (haversineKm(last, point) >= spacingKm) {
        kept.push(point);
        last = point;
      }
    }

    const lastPoint = segment[segment.length - 1];
    if (kept[kept.length - 1] !== lastPoint) kept.push(lastPoint);
  }

  return kept;
}

/**
 * Bounds how many "around" anchors go into a single Overpass request.
 * camino-frances (229 decimated anchors) and shikoku-88 (415) both fail
 * outright as one request, while camino-norte succeeds at 193 — a single
 * `around:` clause carrying a route's whole decimated trace forces Overpass
 * to run proximity tests against the entire anchor list at once, and past
 * some point that workload times out or gets refused server-side rather
 * than degrading gracefully. Chosen well under camino-norte's own working
 * count so a chunked request stays comfortably inside what the free
 * instance handles, not just barely under the failure line.
 */
export const MAX_CHUNK_POINTS = 60;

/**
 * How many anchors consecutive chunks share at their boundary. A road just
 * past the edge of one chunk's anchors might sit outside every anchor's
 * `around:` radius in that chunk alone but inside the radius of an anchor
 * that belongs to the next chunk — overlapping the anchor lists themselves
 * (not just relying on AROUND_RADIUS_METERS) guarantees the seam is covered
 * by both neighbours, not neither.
 */
export const CHUNK_OVERLAP_POINTS = 6;

/**
 * Splits a decimated trace into overlapping chunks no larger than
 * `chunkSize`, so each one can be sent to Overpass as its own request. A
 * trace that already fits in one chunk comes back as a single chunk
 * containing every point, unchanged — the same request `overpassQueryFor`
 * would have built without chunking at all.
 */
export function chunkTrace(
  points: Point[],
  chunkSize: number = MAX_CHUNK_POINTS,
  overlap: number = CHUNK_OVERLAP_POINTS,
): Point[][] {
  if (points.length === 0) return [];
  if (points.length <= chunkSize) return [points];

  const step = Math.max(1, chunkSize - overlap);
  const chunks: Point[][] = [];

  for (let start = 0; start < points.length; start += step) {
    const end = Math.min(start + chunkSize, points.length);
    chunks.push(points.slice(start, end));
    if (end >= points.length) break;
  }

  return chunks;
}

/**
 * Only the "major roads" tier — motorway through tertiary — is fetched or
 * rendered. An earlier version of this query requested the full OSM
 * highway set (also including unclassified/residential), on the theory
 * that a wider cache would be useful for some future, denser rendering —
 * but the cache is gitignored, so that speculative future exists on
 * exactly one machine. Measured on the committed camino-ingles cache,
 * unclassified/residential made up 76% of fetched ways and 74% of geometry
 * points, every one of them discarded at render time by isAllowedWay
 * below, and that surplus was very likely the dominant term in the query
 * weight that produced the 504s which forced this project's chunking and
 * per-chunk-resume machinery in the first place. Querying only what render
 * actually keeps cuts that load roughly 4x; a future denser rendering can
 * fetch the wider set then, against a lighter, working query as its
 * baseline.
 */
const MAJOR_HIGHWAY_VALUES = ["motorway", "trunk", "primary", "secondary", "tertiary"] as const;
const MAJOR_HIGHWAY_PATTERN = new RegExp(`^(${MAJOR_HIGHWAY_VALUES.join("|")})$`);

export const OVERPASS_TIMEOUT_SECONDS = 280;

/** Metres. Deliberately wider than the ~3 km corridor build-roads actually keeps — see DECIMATION_SPACING_KM. */
const AROUND_RADIUS_METERS = 6000;

/**
 * The anchored highway regex is the only exclusion this query needs:
 * construction/proposed/raceway/busway/unclassified/residential (and every
 * other highway value, plus *_link variants) simply aren't in the
 * allow-list, so "^(...)$" already keeps them out. access!=private is the
 * one additional restriction the regex can't express, since it lives on a
 * different tag.
 *
 * `points` should already be decimateRoutePoints' output, not every raw
 * coordinate — Overpass's standalone "around" filter (no bbox, no prior
 * query) accepts a flat list of lat/lon pairs and returns anything within
 * range of *any* of them, which is exactly a corridor prefilter.
 */
export function overpassQueryFor(points: Point[]): string {
  const coordsClause = points.map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join(",");

  return (
    `[out:json][timeout:${OVERPASS_TIMEOUT_SECONDS}];\n` +
    `way(around:${AROUND_RADIUS_METERS},${coordsClause})` +
    `["highway"~"^(${MAJOR_HIGHWAY_VALUES.join("|")})$"]["access"!="private"];\n` +
    `out geom;`
  );
}

export interface OverpassGeometryPoint {
  lat: number;
  lon: number;
}

export interface OverpassWay {
  type: "way";
  id: number;
  tags: Record<string, string>;
  geometry: OverpassGeometryPoint[];
}

/** What fetch-roads.ts persists to .cache/roads/{route-id}.json. `elements` is Overpass's raw, unvalidated response. */
export interface RoadsCacheFile {
  fetchedAt: string;
  routeId: string;
  query: string;
  elements: unknown[];
}

function rawWayId(element: unknown): number | null {
  if (typeof element !== "object" || element === null) return null;
  const v = element as { type?: unknown; id?: unknown };
  return v.type === "way" && typeof v.id === "number" ? v.id : null;
}

/**
 * Merges the raw Overpass elements from a route's chunk requests into one
 * deduplicated, deterministically ordered list — ready to write straight
 * into a RoadsCacheFile's `elements` field, the same shape a single-request
 * route already produces. Chunks overlap at their boundaries (see
 * CHUNK_OVERLAP_POINTS), so the same way routinely comes back from more than
 * one chunk; it's kept once, by OSM way id, using whichever chunk returned
 * it first. Sorting by id afterward means the merged cache — and everything
 * rendered from it — doesn't depend on how many chunks a route needed or
 * what order they were requested in.
 */
export function mergeWayElements(chunkResults: unknown[][]): unknown[] {
  const byId = new Map<number, unknown>();

  for (const elements of chunkResults) {
    for (const element of elements) {
      const id = rawWayId(element);
      if (id === null || byId.has(id)) continue;
      byId.set(id, element);
    }
  }

  return [...byId.entries()].sort(([a], [b]) => a - b).map(([, element]) => element);
}

function isOverpassGeometryPoint(value: unknown): value is OverpassGeometryPoint {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { lat?: unknown; lon?: unknown };
  return typeof v.lat === "number" && typeof v.lon === "number";
}

/**
 * Coerces one raw Overpass element into a typed way, or null if it isn't a
 * well-formed way — the cache is this pipeline's own output, but it was
 * still `JSON.parse`d from disk, so it's read as defensively as any other
 * file this project doesn't fully control.
 */
function toOverpassWay(value: unknown): OverpassWay | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as { type?: unknown; id?: unknown; tags?: unknown; geometry?: unknown };
  if (v.type !== "way" || typeof v.id !== "number") return null;

  const tags: Record<string, string> = {};
  if (typeof v.tags === "object" && v.tags !== null) {
    for (const [key, val] of Object.entries(v.tags as Record<string, unknown>)) {
      if (typeof val === "string") tags[key] = val;
    }
  }

  const geometry = Array.isArray(v.geometry) ? v.geometry.filter(isOverpassGeometryPoint) : [];

  return { type: "way", id: v.id, tags, geometry };
}

export function waysFromCache(cache: RoadsCacheFile): OverpassWay[] {
  return cache.elements.map(toOverpassWay).filter((w): w is OverpassWay => w !== null);
}

/**
 * The render-time gate — the same major-roads set overpassQueryFor above
 * fetches, re-applied here as defense in depth. The cache is a file on
 * disk, not the query's live output: it could have been fetched by an
 * older, wider query (this project used to request all seven highway
 * values), hand-edited, or otherwise drifted, so build-roads re-checks the
 * highway value and access=private rather than trusting the query that
 * produced it.
 */
export function isAllowedWay(way: OverpassWay): boolean {
  const highway = way.tags.highway;
  if (!highway || !MAJOR_HIGHWAY_PATTERN.test(highway)) return false;
  if (way.tags.access === "private") return false;
  return true;
}

const CORRIDOR_GRID_DEGREES = 0.01;
const CORRIDOR_RADIUS_KM = 3;
const APPROX_KM_PER_DEGREE = 111;

/**
 * How many grid cells a route point's influence spreads over, so that a road
 * point sharing a nearby-but-not-identical cell still counts as "within the
 * corridor". The grid is isotropic in *degrees*, not kilometres, so the
 * corridor's real reach isn't the clean circle that framing suggests: at
 * 43°N a 0.01° cell is ~1.11 km north-south but only ~1.11 × cos(43°) ≈
 * 0.81 km east-west, so this radius (3 cells, from ceil(3 / 1.11)) reaches
 * ~3.3 km north-south and only ~2.4 km east-west — and further than either
 * on the diagonal, since corridorCellSet/wayInCorridor bound dx and dy
 * independently (Chebyshev distance, a square neighbourhood), not a circle.
 * None of this matters at the scale a faint ~3 km corridor renders at — a
 * prototype confirmed the grid is fast and accurate enough for that — but
 * it is a squashed, square-edged shape, not the clean isotropic circle
 * "coarse and isotropic" once implied.
 */
const CORRIDOR_RADIUS_CELLS = Math.ceil(
  CORRIDOR_RADIUS_KM / (CORRIDOR_GRID_DEGREES * APPROX_KM_PER_DEGREE),
);

function gridCellOf(lon: number, lat: number): [number, number] {
  return [Math.round(lon / CORRIDOR_GRID_DEGREES), Math.round(lat / CORRIDOR_GRID_DEGREES)];
}

export function corridorCellSet(routePoints: Point[]): Set<string> {
  const cells = new Set<string>();

  for (const [lon, lat] of routePoints) {
    const [gx, gy] = gridCellOf(lon, lat);
    for (let dx = -CORRIDOR_RADIUS_CELLS; dx <= CORRIDOR_RADIUS_CELLS; dx++) {
      for (let dy = -CORRIDOR_RADIUS_CELLS; dy <= CORRIDOR_RADIUS_CELLS; dy++) {
        cells.add(`${gx + dx},${gy + dy}`);
      }
    }
  }

  return cells;
}

/**
 * Tests only `way.geometry`'s vertices, not the segments between them — a
 * long, nearly straight OSM way whose two nearest vertices both fall just
 * outside the corridor is dropped even if the segment connecting them
 * would have passed through it. Roads within a few kilometres of a
 * pilgrimage route are rarely a single multi-kilometre straight line
 * between OSM nodes, so this is a fine trade against computing real
 * point-to-segment distance for every way against every corridor cell.
 */
export function wayInCorridor(way: OverpassWay, cells: Set<string>): boolean {
  return way.geometry.some((pt) => {
    const [gx, gy] = gridCellOf(pt.lon, pt.lat);
    return cells.has(`${gx},${gy}`);
  });
}

export interface CorridorSelection {
  kept: OverpassWay[];
  waysFetched: number;
  waysKept: number;
}

export function selectCorridor(routePoints: Point[], ways: OverpassWay[]): CorridorSelection {
  const cells = corridorCellSet(routePoints);
  const kept = ways.filter((way) => wayInCorridor(way, cells));
  return { kept, waysFetched: ways.length, waysKept: kept.length };
}

/**
 * Replicates fitToBox's bounds-and-scale math (project.ts, frozen) but
 * against a caller-supplied set of bounding points rather than the segments
 * being fitted. This is what lets the road corridor project into the exact
 * same coordinate space as the route glyph: fitToBox always derives bounds
 * from whatever it's given, so fitting roads through it directly would size
 * them to the corridor's own extent — which reaches past the route on every
 * bend — rather than the route's, and the two layers would drift apart.
 */
export function fitToRouteBounds(
  routeBoundsPoints: Point[],
  segments: Point[][],
  box: Box,
): Point[][] {
  if (routeBoundsPoints.length === 0) return segments;

  let minX = routeBoundsPoints[0][0];
  let maxX = minX;
  let minY = routeBoundsPoints[0][1];
  let maxY = minY;

  for (let i = 1; i < routeBoundsPoints.length; i++) {
    const [x, y] = routeBoundsPoints[i];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const inner = box.size - 2 * box.padding;
  const span = Math.max(maxX - minX, maxY - minY) || 1e-9;
  const scale = inner / span;

  const offsetX = box.padding + (inner - (maxX - minX) * scale) / 2;
  const offsetY = box.padding + (inner - (maxY - minY) * scale) / 2;

  return segments.map((segment) =>
    segment.map(([x, y]): Point => [(x - minX) * scale + offsetX, (maxY - y) * scale + offsetY]),
  );
}

function endpointKey(pt: OverpassGeometryPoint): string {
  return `${pt.lat.toFixed(7)},${pt.lon.toFixed(7)}`;
}

interface WayEndpoint {
  wayIndex: number;
  atStart: boolean;
}

/**
 * Chains ways together through simple pass-through points — where exactly
 * two way-ends meet — into longer continuous polylines, leaving real
 * intersections (three or more way-ends) and dead ends (one way-end) as
 * chain boundaries. OSM habitually splits one physical road into many short
 * ways at every intersection; rendering (and simplifying) each of those
 * independently, rather than merging them back into the single road they
 * actually are, is what made early corridor output many times larger than
 * the measured target — Douglas-Peucker has almost nothing to remove from a
 * 3-point way, and every way boundary costs a fresh SVG "M" moveto.
 */
export function mergeConnectedWays(ways: OverpassWay[]): OverpassGeometryPoint[][] {
  const usable = ways.filter((w) => w.geometry.length >= 2);
  const endpointToWays = new Map<string, WayEndpoint[]>();

  const addEndpoint = (key: string, entry: WayEndpoint): void => {
    const list = endpointToWays.get(key);
    if (list) {
      list.push(entry);
    } else {
      endpointToWays.set(key, [entry]);
    }
  };

  usable.forEach((way, wayIndex) => {
    addEndpoint(endpointKey(way.geometry[0]), { wayIndex, atStart: true });
    addEndpoint(endpointKey(way.geometry[way.geometry.length - 1]), { wayIndex, atStart: false });
  });

  const consumed = new Array<boolean>(usable.length).fill(false);

  function unconsumedNeighborAt(key: string): WayEndpoint | null {
    const list = endpointToWays.get(key);
    if (!list || list.length !== 2) return null; // not a simple pass-through point
    const candidates = list.filter((e) => !consumed[e.wayIndex]);
    return candidates.length === 1 ? candidates[0] : null;
  }

  const chains: OverpassGeometryPoint[][] = [];

  for (let i = 0; i < usable.length; i++) {
    if (consumed[i]) continue;
    consumed[i] = true;
    let chain = usable[i].geometry;

    for (;;) {
      const key = endpointKey(chain[chain.length - 1]);
      const neighbor = unconsumedNeighborAt(key);
      if (!neighbor) break;

      consumed[neighbor.wayIndex] = true;
      const geometry = usable[neighbor.wayIndex].geometry;
      const toAppend = neighbor.atStart ? geometry.slice(1) : [...geometry].reverse().slice(1);
      chain = chain.concat(toAppend);
    }

    for (;;) {
      const key = endpointKey(chain[0]);
      const neighbor = unconsumedNeighborAt(key);
      if (!neighbor) break;

      consumed[neighbor.wayIndex] = true;
      const geometry = usable[neighbor.wayIndex].geometry;
      const toPrepend = neighbor.atStart ? [...geometry].reverse().slice(0, -1) : geometry.slice(0, -1);
      chain = toPrepend.concat(chain);
    }

    chains.push(chain);
  }

  return chains;
}

/**
 * Looser than glyphs.ts's own EPSILON_FRACTION (0.0016) and rendered at
 * integer precision (see toPathData below) rather than one decimal place —
 * deliberately, since the corridor is a faint background texture, not the
 * route itself, and the byte budget is much tighter: this project's
 * road-corridor plan sets a ~150 KB ceiling per route, and the corridor
 * fragments into far more separate path segments (one per merged road,
 * broken at every real junction) than a route's own single continuous line
 * ever does. Coarser simplification and coordinates are where that overhead
 * gets paid down without dropping roads outright.
 */
const ROADS_EPSILON_FRACTION = 0.005;
const ROADS_PATH_PRECISION = 0;
const ROADS_STROKE_WIDTH = 0.5;
const ODBL_ATTRIBUTION = "© OpenStreetMap contributors, ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/)";

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXmlAttr(text: string): string {
  return text.replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);
}

/**
 * A hash of the route's coordinates, independent of everything else in
 * route.geojson (stage names, tags, whitespace). This is the anchor the
 * staleness guard compares against: a roads SVG rendered from an offline
 * cache can't know the route's geometry changed since, but it can carry a
 * fingerprint of the geometry it *was* rendered against, and check-site
 * recomputes the same fingerprint from the current file to catch drift.
 */
export function hashRouteGeometry(geojson: unknown): string {
  const segments = segmentsOf(geojson);
  return createHash("sha256").update(JSON.stringify(segments)).digest("hex");
}

/**
 * A hand-rolled well-formedness check rather than a real XML parser — this
 * project takes no new dependencies and Node ships no DOMParser. It walks
 * tag open/close balance only; good enough to catch a truncated or
 * malformed build output without pulling in an XML library for one guard.
 */
export function isWellFormedXml(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  const tagPattern = /<\/?([a-zA-Z][\w:.-]*)\b[^>]*?(\/)?>/g;
  const stack: string[] = [];
  let sawTag = false;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(trimmed)) !== null) {
    const [full, name, selfClosing] = match;
    sawTag = true;

    if (full.startsWith("</")) {
      if (stack.pop() !== name) return false;
    } else if (!selfClosing) {
      stack.push(name);
    }
  }

  return sawTag && stack.length === 0;
}

export interface RoadsRender {
  svg: string;
  waysFetched: number;
  waysKept: number;
}

/**
 * Renders the road corridor for one route from its cached Overpass ways —
 * never from the network. Returns null only when the route has no geometry
 * to align against, matching build-assets.ts's own "missing input, skip
 * rather than throw" convention for the same case.
 */
export function roadsSvgFrom(routeGeo: unknown, cache: RoadsCacheFile, box: Box = GLYPH_BOX): RoadsRender | null {
  const routeSegments = segmentsOf(routeGeo);
  if (routeSegments.length === 0) return null;

  const routeBoundsPoints = routeSegments.flat().map(([lon, lat]) => mercator(lon, lat));

  const allowedWays = waysFromCache(cache).filter(isAllowedWay);
  const { kept, waysKept } = selectCorridor(routeSegments.flat(), allowedWays);
  const waysFetched = cache.elements.length;

  const sorted = [...kept].sort((a, b) => a.id - b.id);
  const chains = mergeConnectedWays(sorted);
  const roadSegments = chains.map((chain) => chain.map((pt): Point => mercator(pt.lon, pt.lat)));

  const fitted = fitToRouteBounds(routeBoundsPoints, roadSegments, box);
  const epsilon = (box.size - 2 * box.padding) * ROADS_EPSILON_FRACTION;
  const simplified = fitted.map((segment) => simplify(segment, epsilon));
  const d = toPathData(simplified, ROADS_PATH_PRECISION);

  const hash = hashRouteGeometry(routeGeo);
  const extractDate = cache.fetchedAt.slice(0, 10);

  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box.size} ${box.size}" ` +
    `fill="none" stroke="currentColor" stroke-width="${ROADS_STROKE_WIDTH}" ` +
    `stroke-linecap="round" stroke-linejoin="round">` +
    `<metadata><roads-source geometry-hash="${hash}" extract-date="${extractDate}" ` +
    `attribution="${escapeXmlAttr(ODBL_ATTRIBUTION)}"/></metadata>` +
    `<path d="${d}"/>` +
    `</svg>\n`;

  return { svg, waysFetched, waysKept };
}

export function cachePathFor(root: string, id: string): string {
  return join(root, ".cache", "roads", `${id}.json`);
}

interface RoadsCacheFileLike {
  fetchedAt?: unknown;
  routeId?: unknown;
  query?: unknown;
  elements?: unknown;
}

function isRoadsCacheFileLike(value: unknown): value is RoadsCacheFileLike {
  return typeof value === "object" && value !== null;
}

export function readRoadsCache(root: string, id: string): RoadsCacheFile | null {
  const path = cachePathFor(root, id);
  if (!existsSync(path)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }

  if (!isRoadsCacheFileLike(parsed)) return null;
  const { fetchedAt, routeId, query, elements } = parsed;
  if (typeof fetchedAt !== "string" || typeof routeId !== "string" || typeof query !== "string") {
    return null;
  }
  if (!Array.isArray(elements)) return null;

  // A cache file's own routeId is the one thing that can catch it being a
  // mis-named or hand-copied cache for a *different* route than the one
  // being rendered — the geometry hash embedded in the rendered SVG
  // fingerprints the route's coordinates, not the roads data, so it
  // structurally cannot catch this on its own.
  if (routeId !== id) return null;

  return { fetchedAt, routeId, query, elements };
}

/** What fetch-roads.ts persists to .cache/roads/chunks/{route-id}/{index}.json as each chunk succeeds. */
export interface RoadsChunkCacheFile {
  routeId: string;
  chunkIndex: number;
  anchorHash: string;
  fetchedAt: string;
  elements: unknown[];
}

/**
 * Identifies the exact anchor points a chunk request was built from. Stored
 * alongside each cached chunk and recomputed from the current chunking on
 * every run — if MAX_CHUNK_POINTS, CHUNK_OVERLAP_POINTS, or the route's own
 * geometry ever changes what anchors chunk N carries, this hash changes too,
 * and isFreshChunkCache (below) stops treating the old cache entry as valid
 * for that slot rather than silently merging stale, mismatched data.
 */
export function hashChunkAnchors(points: Point[]): string {
  return createHash("sha256").update(JSON.stringify(points)).digest("hex");
}

export function chunkCacheDir(root: string, routeId: string): string {
  return join(root, ".cache", "roads", "chunks", routeId);
}

export function chunkCachePathFor(root: string, routeId: string, index: number): string {
  return join(chunkCacheDir(root, routeId), `${index}.json`);
}

interface RoadsChunkCacheFileLike {
  routeId?: unknown;
  chunkIndex?: unknown;
  anchorHash?: unknown;
  fetchedAt?: unknown;
  elements?: unknown;
}

function isRoadsChunkCacheFileLike(value: unknown): value is RoadsChunkCacheFileLike {
  return typeof value === "object" && value !== null;
}

function parseRoadsChunkCache(parsed: unknown): RoadsChunkCacheFile | null {
  if (!isRoadsChunkCacheFileLike(parsed)) return null;
  const { routeId, chunkIndex, anchorHash, fetchedAt, elements } = parsed;
  if (
    typeof routeId !== "string" ||
    typeof chunkIndex !== "number" ||
    typeof anchorHash !== "string" ||
    typeof fetchedAt !== "string" ||
    !Array.isArray(elements)
  ) {
    return null;
  }
  return { routeId, chunkIndex, anchorHash, fetchedAt, elements };
}

/** Reads one chunk's cache file, or null if it's missing or unparsable — the same defensive posture as readRoadsCache. */
export function readRoadsChunkCache(root: string, routeId: string, index: number): RoadsChunkCacheFile | null {
  const path = chunkCachePathFor(root, routeId, index);
  if (!existsSync(path)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }

  return parseRoadsChunkCache(parsed);
}

/**
 * A cached chunk is only safe to reuse without a network call if it was
 * written for this exact route, this exact slot in the chunking, and this
 * exact set of anchor points — any mismatch means the chunking definition
 * moved on since it was fetched, and the cache entry is stale.
 */
export function isFreshChunkCache(
  cache: RoadsChunkCacheFile,
  routeId: string,
  chunkIndex: number,
  anchorHash: string,
): boolean {
  return cache.routeId === routeId && cache.chunkIndex === chunkIndex && cache.anchorHash === anchorHash;
}

export type ChunkMergeResult =
  | { status: "complete"; elements: unknown[]; earliestFetchedAt: string }
  | { status: "incomplete"; missingIndices: number[] };

/**
 * Merges a route's per-chunk caches into the flat, deduplicated element list
 * the existing RoadsCacheFile format expects — but only once every chunk
 * from 0..chunkCount-1 is present. A partial set reports exactly which
 * indices are still missing instead of merging around the gap: a corridor
 * silently missing a slice of chunks would render as a complete-looking but
 * wrong SVG, which is worse than not rendering at all.
 *
 * `earliestFetchedAt` is the oldest of the per-chunk fetch times, not
 * `new Date()` at merge time — a route whose chunks were fetched across more
 * than one run (see isFreshChunkCache) would otherwise carry a merge
 * timestamp that has nothing to do with when its road data actually came
 * from Overpass, so its rendered extract-date would disagree with every
 * other route's for a reason that has nothing to do with the data itself.
 * Comparing the ISO 8601 strings directly is safe: every timestamp this
 * project writes is UTC (`Date.toISOString()`), so lexicographic order is
 * chronological order.
 */
export function mergeChunkCaches(
  chunkCount: number,
  caches: ReadonlyArray<RoadsChunkCacheFile | null>,
): ChunkMergeResult {
  const missingIndices: number[] = [];
  for (let i = 0; i < chunkCount; i++) {
    if (!caches[i]) missingIndices.push(i);
  }

  if (missingIndices.length > 0) {
    return { status: "incomplete", missingIndices };
  }

  const present = caches.slice(0, chunkCount) as RoadsChunkCacheFile[];
  const earliestFetchedAt = present.reduce(
    (earliest, cache) => (cache.fetchedAt < earliest ? cache.fetchedAt : earliest),
    present[0].fetchedAt,
  );

  return {
    status: "complete",
    elements: mergeWayElements(present.map((cache) => cache.elements)),
    earliestFetchedAt,
  };
}

export type RoadsBuildStatus =
  | { id: string; status: "written"; waysFetched: number; waysKept: number; bytes: number }
  | { id: string; status: "skipped"; reason: string };

/**
 * Renders every route's committed roads SVG from .cache/roads/ alone — this
 * function never calls fetch or reaches the network. A route with no cache
 * is skipped and reported, never failed and never written as an empty file:
 * the cache is only ever produced by a separate, explicit `fetch-roads` run,
 * so CI (which never runs that) must be able to build everything else clean
 * regardless of whether a given route's cache exists on the machine running
 * it. The same "skip and report, never write" rule applies when a cache
 * exists but nothing in it survives rendering: an empty `elements` array, or
 * every way falling outside the corridor, would otherwise render as
 * well-formed XML with a correct geometry hash and a literal `d=""` —
 * passing every other check-site assertion while shipping nothing.
 */
export function buildRoads(root: string): RoadsBuildStatus[] {
  const outDir = join(root, "docs", "assets", "roads");
  mkdirSync(outDir, { recursive: true });

  const results: RoadsBuildStatus[] = [];

  for (const { key, dir } of targets(root)) {
    const geo = readJson(join(dir, "route.geojson"));
    if (!geo) {
      results.push({ id: key, status: "skipped", reason: "no route.geojson" });
      continue;
    }

    const cache = readRoadsCache(root, key);
    if (!cache) {
      results.push({ id: key, status: "skipped", reason: "no cached roads data — run npm run fetch-roads" });
      continue;
    }

    let rendered: RoadsRender | null;
    try {
      rendered = roadsSvgFrom(geo, cache);
    } catch (error) {
      results.push({
        id: key,
        status: "skipped",
        reason: `render failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    if (!rendered) {
      results.push({ id: key, status: "skipped", reason: "route has no geometry to align against" });
      continue;
    }

    if (rendered.waysKept === 0) {
      results.push({
        id: key,
        status: "skipped",
        reason:
          `0 ways kept in corridor (${rendered.waysFetched} fetched) — refusing to write an empty ` +
          `roads SVG; the cache may have come back empty or every way may fall outside the corridor`,
      });
      continue;
    }

    writeFileSync(join(outDir, `${key}.svg`), rendered.svg);
    results.push({
      id: key,
      status: "written",
      waysFetched: rendered.waysFetched,
      waysKept: rendered.waysKept,
      bytes: Buffer.byteLength(rendered.svg, "utf-8"),
    });
  }

  return results;
}

function main(): void {
  const results = buildRoads(ROOT);

  for (const result of results) {
    if (result.status === "written") {
      console.log(
        `${result.id}: wrote ${(result.bytes / 1024).toFixed(1)} KB ` +
          `(${result.waysKept}/${result.waysFetched} ways kept)`,
      );
    } else {
      console.log(`${result.id}: skipped — ${result.reason}`);
    }
  }

  const written = results.filter((r) => r.status === "written").length;
  console.log(`\n${written}/${results.length} roads corridor SVG(s) written.`);
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
