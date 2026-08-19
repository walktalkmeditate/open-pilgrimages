import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { GLYPH_BOX, glyphFrom, segmentsOf } from "./glyphs.js";

const ROOT = join(import.meta.dirname, "..", "..");

function geojson(routeId: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, "routes", routeId, "route.geojson"), "utf-8"));
}

test("segmentsOf flattens LineString and MultiLineString alike", () => {
  const linear = segmentsOf(geojson("camino-frances"));
  const multi = segmentsOf(geojson("shikoku-88"));

  assert.equal(linear.length, 1);
  assert.ok(multi.length > 1, "shikoku-88 is a MultiLineString");
  assert.equal(linear[0].every((p) => p.length === 2), true);
});

test("glyphFrom simplifies camino-frances by more than two orders of magnitude", () => {
  const glyph = glyphFrom(geojson("camino-frances"));

  assert.equal(glyph.pointsIn, 33192);
  assert.ok(glyph.pointsOut > 40 && glyph.pointsOut < 200, `got ${glyph.pointsOut}`);
});

test("glyphFrom keeps every drawn coordinate inside the padded box", () => {
  for (const id of ["camino-frances", "shikoku-88", "kumano-kodo"]) {
    const d = glyphFrom(geojson(id)).d;
    const numbers = d.match(/-?\d+\.\d+/g)!.map(Number);

    for (const n of numbers) {
      assert.ok(
        n >= GLYPH_BOX.padding - 0.05 && n <= GLYPH_BOX.size - GLYPH_BOX.padding + 0.05,
        `${id}: coordinate ${n} escapes the padded box`,
      );
    }
  }
});

test("glyphFrom emits one moveto per source segment", () => {
  const shikoku = geojson("shikoku-88");
  const expected = segmentsOf(shikoku).filter((s) => s.length >= 2).length;
  const moves = glyphFrom(shikoku).d.match(/M/g)!.length;

  assert.equal(moves, expected);
});

test("glyphFrom is deterministic", () => {
  assert.equal(glyphFrom(geojson("kumano-kodo")).d, glyphFrom(geojson("kumano-kodo")).d);
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
