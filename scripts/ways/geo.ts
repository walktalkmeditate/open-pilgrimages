import type { Position, WayRoutePoint } from "./types.js";

const EARTH_RADIUS_METERS = 6371000;

/** Ramer–Douglas–Peucker tolerance. See MAX_ROUTE_POINTS for why both exist. */
export const RDP_TOLERANCE_METERS = 8;

/**
 * The engine's on-way threshold is 60 m and WayGeometry.lowestFrac is a linear
 * scan, so a 25 km day at this cap leaves ~25 m between vertices — dense enough
 * to trigger on, cheap enough to scan. OwnWalkWayBuilder's own cap is 4,000, so
 * a stage stays well inside the geometry the app already exercises.
 */
export const MAX_ROUTE_POINTS = 1000;

/**
 * Beyond this, a stage-boundary place is not on the walked line at all — the
 * OSM main relation simply does not pass through it — and snapping to the
 * nearest vertex would hand the neighbouring stages each other's kilometres.
 * Measured on the Camino Francés: snapping alone leaves 7 of 33 stages outside
 * the gate; with this fallback, 2.
 */
export const SNAP_METERS = 500;

export const GATE_TOLERANCE = 0.1;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export function haversineMeters(a: Position, b: Position): number {
  const dLat = toRadians(b[1] - a[1]);
  const dLon = toRadians(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRadians(a[1])) * Math.cos(toRadians(b[1])) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

const samePoint = (a: Position | undefined, b: Position): boolean =>
  a !== undefined && a[0] === b[0] && a[1] === b[1];

/**
 * Flattens a route FeatureCollection into one ordered polyline. MultiLineString
 * parts are concatenated in file order, and a point identical to its
 * predecessor is dropped, because adjacent OSM ways repeat their shared node.
 */
export function walkedLine(fc: unknown): Position[] {
  const features = (fc as { features?: Array<{ geometry?: { type?: string; coordinates?: unknown } }> })
    .features ?? [];
  const line: Position[] = [];

  const push = (part: Position[]) => {
    for (const point of part) {
      if (!samePoint(line[line.length - 1], point)) line.push(point);
    }
  };

  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type === "LineString") {
      push(geometry.coordinates as Position[]);
    } else if (geometry.type === "MultiLineString") {
      for (const part of geometry.coordinates as Position[][]) push(part);
    }
  }

  return line;
}

export function cumulativeMeters(line: Position[]): number[] {
  const cumulative: number[] = [0];
  for (let i = 1; i < line.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineMeters(line[i - 1], line[i]));
  }
  return cumulative;
}

export function lineLengthMeters(line: Position[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += haversineMeters(line[i - 1], line[i]);
  return total;
}

export function nearestVertex(line: Position[], p: Position): { index: number; meters: number } {
  let index = 0;
  let meters = Infinity;
  for (let i = 0; i < line.length; i++) {
    const d = haversineMeters(line[i], p);
    if (d < meters) {
      meters = d;
      index = i;
    }
  }
  return { index, meters };
}

export function indexAtMeters(cumulative: number[], meters: number): number {
  let index = 0;
  for (let i = 0; i < cumulative.length; i++) {
    if (cumulative[i] <= meters) index = i;
    else break;
  }
  return index;
}

export interface Boundary {
  index: number;
  offMeters: number;
  mode: "snap" | "proportional";
}

/**
 * One boundary per stage edge: `anchors` is the stages' start coordinates plus
 * the last stage's end, so it is one longer than `declaredKm`.
 */
export function stageBoundaries(
  line: Position[],
  cumulative: number[],
  anchors: Position[],
  declaredKm: number[],
  snapMeters: number = SNAP_METERS,
): Boundary[] {
  const totalLineMeters = cumulative[cumulative.length - 1];
  const totalDeclaredMeters = declaredKm.reduce((sum, km) => sum + km, 0) * 1000;
  const boundaries: Boundary[] = [];
  let declaredSoFar = 0;

  for (let i = 0; i < anchors.length; i++) {
    const found = nearestVertex(line, anchors[i]);
    if (found.meters <= snapMeters || totalDeclaredMeters === 0) {
      boundaries.push({ index: found.index, offMeters: found.meters, mode: "snap" });
    } else {
      const along = (declaredSoFar / totalDeclaredMeters) * totalLineMeters;
      boundaries.push({
        index: indexAtMeters(cumulative, along),
        offMeters: found.meters,
        mode: "proportional",
      });
    }
    if (i < declaredKm.length) declaredSoFar += declaredKm[i] * 1000;
  }

  return boundaries;
}

/**
 * Metres in a local plane. Over the few hundred metres an RDP or projection
 * step spans, this is exact enough and, unlike a law-of-cosines projection,
 * does not lose precision when the point is nearly on the segment.
 */
function planar(origin: Position, p: Position): [number, number] {
  const lat0 = toRadians(origin[1]);
  return [
    toRadians(p[0]) * Math.cos(lat0) * EARTH_RADIUS_METERS,
    toRadians(p[1]) * EARTH_RADIUS_METERS,
  ];
}

function perpendicularMeters(p: Position, a: Position, b: Position): number {
  const origin: Position = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const [px, py] = planar(origin, p);
  const [ax, ay] = planar(origin, a);
  const [bx, by] = planar(origin, b);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function simplify(line: Position[], toleranceMeters: number): Position[] {
  if (line.length < 3) return line.slice();

  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;

  // Explicit stack rather than recursion: a 38,000-point route would blow the
  // call stack on a pathologically straight segment.
  const stack: Array<[number, number]> = [[0, line.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let farthest = -1;
    let farthestMeters = 0;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularMeters(line[i], line[start], line[end]);
      if (d > farthestMeters) {
        farthestMeters = d;
        farthest = i;
      }
    }
    if (farthestMeters > toleranceMeters && farthest > 0) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }

  return line.filter((_, i) => keep[i] === 1);
}

export function strideCap(line: Position[], maxPoints: number): Position[] {
  if (line.length <= maxPoints) return line.slice();
  const stride = Math.ceil((line.length - 1) / (maxPoints - 1));
  const capped: Position[] = [];
  for (let i = 0; i < line.length; i += stride) capped.push(line[i]);
  const last = line[line.length - 1];
  if (!samePoint(capped[capped.length - 1], last)) capped.push(last);
  return capped;
}

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * Six decimals is ~0.11 m — finer than any GPS fix and half the bytes of the
 * seven OSM publishes. Rounding before measuring is deliberate: the app
 * measures the rounded line, so the build's totalDistanceMeters must too.
 */
export function roundLine(line: Position[]): Position[] {
  const rounded: Position[] = [];
  for (const point of line) {
    const next: Position =
      point.length === 3
        ? [round6(point[0]), round6(point[1]), Math.round(point[2] * 10) / 10]
        : [round6(point[0]), round6(point[1])];
    if (!samePoint(rounded[rounded.length - 1], next)) rounded.push(next);
  }
  return rounded;
}

export function projectOnLine(
  line: Position[],
  cumulative: number[],
  p: Position,
): { frac: number; at: Position; offLineMeters: number } {
  const total = cumulative[cumulative.length - 1];
  let best = { frac: 0, at: line[0], offLineMeters: Infinity };

  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const origin: Position = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const [px, py] = planar(origin, p);
    const [ax, ay] = planar(origin, a);
    const [bx, by] = planar(origin, b);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
    const offLineMeters = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (offLineMeters < best.offLineMeters) {
      const at: Position = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const along = cumulative[i - 1] + t * (cumulative[i] - cumulative[i - 1]);
      best = { frac: total === 0 ? 0 : along / total, at, offLineMeters };
    }
  }

  return best;
}

/**
 * The clock exists only so WayGeometry.elapsed(atFrac:) has something to read:
 * nothing on a stage walk or in its preview shows it.
 */
export function routePoints(
  line: Position[],
  cumulative: number[],
  hours: number,
): WayRoutePoint[] {
  const total = cumulative[cumulative.length - 1];
  const seconds = hours * 3600;
  return line.map((point, i) => {
    const routePoint: WayRoutePoint = {
      lat: point[1],
      lon: point[0],
      t: Math.round(seconds * (total === 0 ? 0 : cumulative[i] / total) * 10) / 10,
    };
    if (point.length === 3) routePoint.alt = point[2];
    return routePoint;
  });
}

export function withinGate(
  measuredKm: number,
  declaredKm: number,
  tolerance: number = GATE_TOLERANCE,
): boolean {
  if (declaredKm <= 0) return false;
  // measuredKm / declaredKm - 1 lands a float64 epsilon past an exact ±10% boundary
  // (e.g. 1.1 / 1.0 - 1 === 0.10000000000000009), so a stage at exactly the edge
  // needs slack the size of that rounding error, not the gate's own tolerance.
  return Math.abs(measuredKm / declaredKm - 1) <= tolerance + 1e-9;
}
