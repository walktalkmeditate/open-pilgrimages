import { fitToBox, mercator, simplify, toPathData, type Box, type Point } from "./project.js";

export const GLYPH_BOX: Box = { size: 200, padding: 12 };

/**
 * Simplification tolerance as a fraction of the fitted box span. Tuned so the
 * longest route (shikoku-88, 49k points) stays under 10 KB of path data while
 * the shortest (kumano-kodo) keeps its branching structure legible.
 */
const EPSILON_FRACTION = 0.0016;

export interface Glyph {
  d: string;
  pointsIn: number;
  pointsOut: number;
}

interface GeoJsonLike {
  features?: Array<{ geometry?: { type?: string; coordinates?: unknown } }>;
}

export function segmentsOf(geojson: unknown): Point[][] {
  const features = (geojson as GeoJsonLike).features ?? [];
  const segments: Point[][] = [];

  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    const raw =
      geometry.type === "MultiLineString"
        ? (geometry.coordinates as number[][][])
        : geometry.type === "LineString"
          ? [geometry.coordinates as number[][]]
          : [];

    for (const line of raw) {
      segments.push(line.map(([lon, lat]): Point => [lon, lat]));
    }
  }

  return segments;
}

export function glyphFrom(geojson: unknown, box: Box = GLYPH_BOX): Glyph {
  const source = segmentsOf(geojson);
  const pointsIn = source.reduce((sum, s) => sum + s.length, 0);

  const projected = source.map((segment) =>
    segment.map(([lon, lat]) => mercator(lon, lat)),
  );
  const fitted = fitToBox(projected, box);

  const epsilon = (box.size - 2 * box.padding) * EPSILON_FRACTION;
  const simplified = fitted.map((segment) => simplify(segment, epsilon));
  const pointsOut = simplified.reduce(
    (sum, s) => sum + (s.length >= 2 ? s.length : 0),
    0,
  );

  return { d: toPathData(simplified), pointsIn, pointsOut };
}
