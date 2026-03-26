type Coord = [number, number] | [number, number, number];

export type { Coord };

export function haversineKm(a: Coord, b: Coord): number {
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinLon * sinLon;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function pointToSegmentDistanceKm(point: Coord, segStart: Coord, segEnd: Coord): number {
  const d1 = haversineKm(point, segStart);
  const dSeg = haversineKm(segStart, segEnd);
  if (dSeg < 0.001) return d1;
  const t = Math.max(0, Math.min(1, dotProjection(point, segStart, segEnd, dSeg)));
  const proj: Coord = [
    segStart[0] + t * (segEnd[0] - segStart[0]),
    segStart[1] + t * (segEnd[1] - segStart[1]),
  ];
  return haversineKm(point, proj);
}

function dotProjection(p: Coord, a: Coord, b: Coord, dAB: number): number {
  const dAP = haversineKm(a, p);
  const dBP = haversineKm(b, p);
  return (dAP * dAP + dAB * dAB - dBP * dBP) / (2 * dAB * dAB);
}

export function minDistanceToLineKm(point: Coord, line: Coord[]): number {
  let min = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const d = pointToSegmentDistanceKm(point, line[i], line[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

export function projectOntoLine(point: Coord, line: Coord[]): { segmentIndex: number; kmAlong: number } {
  let bestSeg = 0;
  let bestDist = Infinity;
  let bestT = 0;

  for (let i = 0; i < line.length - 1; i++) {
    const dSeg = haversineKm(line[i], line[i + 1]);
    if (dSeg < 0.001) continue;
    const t = Math.max(0, Math.min(1, dotProjection(point, line[i], line[i + 1], dSeg)));
    const proj: Coord = [
      line[i][0] + t * (line[i + 1][0] - line[i][0]),
      line[i][1] + t * (line[i + 1][1] - line[i][1]),
    ];
    const d = haversineKm(point, proj);
    if (d < bestDist) {
      bestDist = d;
      bestSeg = i;
      bestT = t;
    }
  }

  let kmAlong = 0;
  for (let i = 0; i < bestSeg; i++) {
    kmAlong += haversineKm(line[i], line[i + 1]);
  }
  kmAlong += bestT * haversineKm(line[bestSeg], line[bestSeg + 1]);

  return { segmentIndex: bestSeg, kmAlong };
}

export function findStageIndex(
  kmAlong: number,
  stages: Array<{ distanceKm: number }>
): number {
  let cumulative = 0;
  for (let i = 0; i < stages.length; i++) {
    cumulative += stages[i].distanceKm;
    if (kmAlong <= cumulative) return i;
  }
  return stages.length - 1;
}
