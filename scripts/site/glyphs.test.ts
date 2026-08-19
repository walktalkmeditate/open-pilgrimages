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
