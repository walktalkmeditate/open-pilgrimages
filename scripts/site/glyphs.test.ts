import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { GLYPH_BOX, glyphFrom, segmentsOf } from "./glyphs.js";

const ROOT = join(import.meta.dirname, "..", "..");

function geojson(routeId: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, "routes", routeId, "route.geojson"), "utf-8"));
}

/**
 * shikoku-88's route.geojson was the corpus's only MultiLineString and carried
 * every multi-segment assertion below until it was split into the four dōjō
 * sections. No committed route has the shape today, so these build one rather
 * than lose the coverage while the sections wait for their walked lines.
 */
const MULTI_LINE = {
  type: "FeatureCollection",
  features: [
    {
      geometry: {
        type: "MultiLineString",
        coordinates: [
          [[134.503, 34.160], [134.49, 34.11], [134.47, 34.05]],
          [[134.31, 33.98], [134.35, 33.90]],
          [[134.44, 33.80], [134.52, 33.74], [134.528, 33.732]],
        ],
      },
    },
  ],
};

test("segmentsOf flattens LineString and MultiLineString alike", () => {
  const linear = segmentsOf(geojson("camino-frances"));
  const multi = segmentsOf(MULTI_LINE);

  assert.equal(linear.length, 1);
  assert.equal(multi.length, 3);
  assert.equal(linear[0].every((p) => p.length === 2), true);
});

test("glyphFrom simplifies camino-frances by more than two orders of magnitude", () => {
  const glyph = glyphFrom(geojson("camino-frances"));

  assert.equal(glyph.pointsIn, 33192);
  assert.ok(glyph.pointsOut > 40 && glyph.pointsOut < 200, `got ${glyph.pointsOut}`);
});

test("glyphFrom keeps every drawn coordinate inside the padded box", () => {
  const sources: Array<[string, unknown]> = [
    ["camino-frances", geojson("camino-frances")],
    ["camino-norte", geojson("camino-norte")],
    ["kumano-kodo-nakahechi", geojson("kumano-kodo-nakahechi")],
    ["a MultiLineString", MULTI_LINE],
  ];

  for (const [label, source] of sources) {
    const d = glyphFrom(source).d;
    const numbers = d.match(/-?\d+\.\d+/g)!.map(Number);

    for (const n of numbers) {
      assert.ok(
        n >= GLYPH_BOX.padding - 0.05 && n <= GLYPH_BOX.size - GLYPH_BOX.padding + 0.05,
        `${label}: coordinate ${n} escapes the padded box`,
      );
    }
  }
});

test("glyphFrom emits one moveto per source segment", () => {
  const expected = segmentsOf(MULTI_LINE).filter((s) => s.length >= 2).length;
  const moves = glyphFrom(MULTI_LINE).d.match(/M/g)!.length;

  assert.equal(expected, 3);
  assert.equal(moves, expected);
});

test("glyphFrom is deterministic", () => {
  assert.equal(glyphFrom(geojson("kumano-kodo-nakahechi")).d, glyphFrom(geojson("kumano-kodo-nakahechi")).d);
});

test("segmentsOf gracefully degrades on empty FeatureCollection", () => {
  const result = segmentsOf({ type: "FeatureCollection", features: [] });
  assert.deepEqual(result, []);
});

test("segmentsOf gracefully degrades when features key is missing", () => {
  const result = segmentsOf({ type: "FeatureCollection" });
  assert.deepEqual(result, []);
});

test("segmentsOf gracefully degrades on null geometry", () => {
  const result = segmentsOf({
    type: "FeatureCollection",
    features: [{ geometry: null }],
  });
  assert.deepEqual(result, []);
});

test("segmentsOf gracefully degrades on unhandled Point geometry", () => {
  const result = segmentsOf({
    type: "FeatureCollection",
    features: [{ geometry: { type: "Point", coordinates: [0, 0] } }],
  });
  assert.deepEqual(result, []);
});

test("segmentsOf gracefully degrades on unhandled Polygon geometry", () => {
  const result = segmentsOf({
    type: "FeatureCollection",
    features: [
      {
        geometry: {
          type: "Polygon",
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        },
      },
    ],
  });
  assert.deepEqual(result, []);
});

test("segmentsOf gracefully degrades on LineString with missing coordinates", () => {
  const result = segmentsOf({
    type: "FeatureCollection",
    features: [{ geometry: { type: "LineString" } }],
  });
  assert.deepEqual(result, []);
});

test("segmentsOf gracefully degrades on MultiLineString with missing coordinates", () => {
  const result = segmentsOf({
    type: "FeatureCollection",
    features: [{ geometry: { type: "MultiLineString" } }],
  });
  assert.deepEqual(result, []);
});

test("segmentsOf gracefully degrades on null input", () => {
  const result = segmentsOf(null);
  assert.deepEqual(result, []);
});

test("segmentsOf tolerates a declared type with wrongly-shaped coordinates", () => {
  // Nullish-guarding alone left these throwing several calls deeper.
  const cases: unknown[] = [
    { type: "FeatureCollection", features: [{ geometry: { type: "LineString", coordinates: "nope" } }] },
    { type: "FeatureCollection", features: [{ geometry: { type: "LineString", coordinates: 5 } }] },
    { type: "FeatureCollection", features: [{ geometry: { type: "MultiLineString", coordinates: "nope" } }] },
    { type: "FeatureCollection", features: [{ geometry: { type: "MultiLineString", coordinates: 5 } }] },
    { type: "FeatureCollection", features: [{ geometry: { type: "MultiLineString", coordinates: [1, 2, 3] } }] },
  ];

  for (const input of cases) {
    assert.deepEqual(segmentsOf(input), [], `threw or mis-parsed: ${JSON.stringify(input)}`);
  }
});

test("segmentsOf drops non-array coordinate entries inside a LineString", () => {
  const input = {
    type: "FeatureCollection",
    features: [{ geometry: { type: "LineString", coordinates: [[1, 2], 7, [3, 4]] } }],
  };

  assert.deepEqual(segmentsOf(input), [[[1, 2], [3, 4]]]);
});
