export type Point = [number, number];

export interface Box {
  /** Width and height of the square viewBox. */
  size: number;
  /** Inset on every edge, in viewBox units. */
  padding: number;
}

/** WGS84 to Web Mercator, in radians. Scale is irrelevant — fitToBox normalizes. */
export function mercator(lon: number, lat: number): Point {
  return [
    (lon * Math.PI) / 180,
    Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
  ];
}

/** Ramer-Douglas-Peucker. Iterative to avoid blowing the stack on long routes. */
export function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    const [ax, ay] = points[lo];
    const [bx, by] = points[hi];
    const dx = bx - ax;
    const dy = by - ay;
    const norm = Math.hypot(dx, dy);

    let bestDistance = -1;
    let bestIndex = -1;

    for (let i = lo + 1; i < hi; i++) {
      const [px, py] = points[i];
      const distance =
        norm === 0
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * px - dx * py + bx * ay - by * ax) / norm;

      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    if (bestIndex !== -1 && bestDistance > epsilon) {
      keep[bestIndex] = true;
      stack.push([lo, bestIndex], [bestIndex, hi]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

/**
 * Scale every segment into a square box by a single shared factor, centred,
 * with the y axis flipped so higher latitudes draw higher on screen.
 */
export function fitToBox(segments: Point[][], box: Box): Point[][] {
  const all = segments.flat();
  if (all.length === 0) return segments;

  const xs = all.map(([x]) => x);
  const ys = all.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const inner = box.size - 2 * box.padding;
  const span = Math.max(maxX - minX, maxY - minY) || 1e-9;
  const scale = inner / span;

  const offsetX = box.padding + (inner - (maxX - minX) * scale) / 2;
  const offsetY = box.padding + (inner - (maxY - minY) * scale) / 2;

  return segments.map((segment) =>
    segment.map(([x, y]): Point => [
      (x - minX) * scale + offsetX,
      (maxY - y) * scale + offsetY,
    ]),
  );
}

export function toPathData(segments: Point[][], precision = 1): string {
  return segments
    .filter((segment) => segment.length >= 2)
    .map((segment) =>
      segment
        .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(precision)},${y.toFixed(precision)}`)
        .join(" "),
    )
    .join(" ");
}
