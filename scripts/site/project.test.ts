import { test } from "node:test";
import assert from "node:assert/strict";
import { mercator, simplify, fitToBox, toPathData, type Point } from "./project.js";

test("mercator maps the origin to zero and is monotonic in both axes", () => {
  const [x0, y0] = mercator(0, 0);
  assert.ok(Math.abs(x0) < 1e-12);
  assert.ok(Math.abs(y0) < 1e-12);

  assert.ok(mercator(10, 0)[0] > mercator(0, 0)[0]);
  assert.ok(mercator(0, 10)[1] > mercator(0, 0)[1]);
  assert.ok(mercator(-10, 0)[0] < 0);
});

test("simplify keeps endpoints and drops collinear interior points", () => {
  const line: Point[] = [[0, 0], [1, 0], [2, 0], [3, 0]];
  assert.deepEqual(simplify(line, 0.01), [[0, 0], [3, 0]]);
});

test("simplify keeps a point that deviates beyond epsilon", () => {
  const line: Point[] = [[0, 0], [1, 5], [2, 0]];
  assert.equal(simplify(line, 1).length, 3);
  assert.equal(simplify(line, 10).length, 2);
});

test("simplify passes through lines of fewer than three points", () => {
  assert.deepEqual(simplify([[0, 0], [1, 1]], 1), [[0, 0], [1, 1]]);
  assert.deepEqual(simplify([[0, 0]], 1), [[0, 0]]);
});

test("fitToBox centres content inside the padded box preserving aspect", () => {
  // A wide, flat line: should span the padded width and sit vertically centred.
  const fitted = fitToBox([[[0, 0], [10, 0]]], { size: 200, padding: 20 });
  const [[ax, ay], [bx, by]] = fitted[0];

  assert.equal(ax, 20);
  assert.equal(bx, 180);
  assert.equal(ay, 100);
  assert.equal(by, 100);
});

test("fitToBox scales both axes by the same factor", () => {
  const fitted = fitToBox([[[0, 0], [10, 5]]], { size: 200, padding: 0 });
  const [[ax, ay], [bx, by]] = fitted[0];

  assert.equal(bx - ax, 200);
  assert.equal(ay - by, 100); // y is flipped: larger latitude draws higher
});

test("toPathData emits one moveto per segment at fixed precision", () => {
  const d = toPathData([[[0, 0], [1.23456, 2.5]], [[5, 5], [6, 6]]], 1);
  assert.equal(d, "M0.0,0.0 L1.2,2.5 M5.0,5.0 L6.0,6.0");
});

test("fitToBox with empty input returns empty", () => {
  assert.deepEqual(fitToBox([], { size: 200, padding: 20 }), []);
});

test("fitToBox centres a single point without NaN", () => {
  const fitted = fitToBox([[[5, 5]]], { size: 200, padding: 20 });
  const [[x, y]] = fitted[0];
  assert.ok(!Number.isNaN(x));
  assert.ok(!Number.isNaN(y));
  assert.equal(x, 100);
  assert.equal(y, 100);
});

test("fitToBox with identical points doesn't emit NaN", () => {
  const fitted = fitToBox([[[5, 5], [5, 5], [5, 5]]], { size: 200, padding: 20 });
  const points = fitted[0];
  for (const [x, y] of points) {
    assert.ok(!Number.isNaN(x));
    assert.ok(!Number.isNaN(y));
  }
});

test("toPathData skips segments with fewer than 2 points", () => {
  const d = toPathData([[[0, 0]], [[1, 1], [2, 2]]], 1);
  assert.equal(d, "M1.0,1.0 L2.0,2.0");
});

test("toPathData returns empty string for all short segments", () => {
  const d = toPathData([[[0, 0]], [[1, 1]]], 1);
  assert.equal(d, "");
});

test("simplify with zero norm edge case keeps deviating middle point", () => {
  const result = simplify([[0, 0], [1, 1], [0, 0]], 0.5);
  assert.equal(result.length, 3);
  assert.deepEqual(result, [[0, 0], [1, 1], [0, 0]]);
});
