import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import {
  haversineMeters,
  walkedLine,
  cumulativeMeters,
  lineLengthMeters,
  nearestVertex,
  indexAtMeters,
  stageBoundaries,
  simplify,
  strideCap,
  roundLine,
  projectOnLine,
  routePoints,
  withinGate,
  RDP_TOLERANCE_METERS,
  MAX_ROUTE_POINTS,
} from "./geo.js";
import type { Position } from "./types.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "way-fixture-route");
const fixtureLine = () =>
  walkedLine(JSON.parse(readFileSync(join(FIXTURE, "route.main.geojson"), "utf-8")));

/** 0.001° at the equator, to 4 dp, on the R = 6,371,000 m sphere. */
const DEG_MILLI_METERS = 111.1949;

test("haversineMeters measures a milli-degree at the equator", () => {
  assert.ok(Math.abs(haversineMeters([0, 0], [0.001, 0]) - DEG_MILLI_METERS) < 0.001);
  assert.ok(Math.abs(haversineMeters([0, 0], [0, 0.001]) - DEG_MILLI_METERS) < 0.001);
});

test("haversineMeters is zero for a point against itself", () => {
  assert.equal(haversineMeters([-1.236, 43.163], [-1.236, 43.163]), 0);
});

test("walkedLine concatenates MultiLineString parts and drops the shared seam point", () => {
  const line = fixtureLine();
  // 21 + 21 points, minus the [0.02, 0] both parts carry.
  assert.equal(line.length, 41);
  assert.deepEqual(line[0], [0, 0]);
  assert.deepEqual(line[40], [0.02, 0.02]);
});

test("walkedLine reads a LineString feature too", () => {
  const line = walkedLine({
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[0, 0], [0, 0], [0.001, 0]] }, properties: {} }],
  });
  assert.deepEqual(line, [[0, 0], [0.001, 0]]);
});

test("cumulativeMeters starts at zero and ends at the line length", () => {
  const line = fixtureLine();
  const cum = cumulativeMeters(line);
  assert.equal(cum.length, line.length);
  assert.equal(cum[0], 0);
  assert.ok(Math.abs(cum[40] - lineLengthMeters(line)) < 1e-9);
  assert.ok(Math.abs(cum[40] - 4450.563) < 0.01);
});

test("nearestVertex finds the index and its distance", () => {
  const line = fixtureLine();
  const found = nearestVertex(line, [0.0101, 0]);
  assert.equal(found.index, 10);
  assert.ok(Math.abs(found.meters - 11.1) < 0.2);
});

test("indexAtMeters returns the last vertex at or before the distance", () => {
  const cum = cumulativeMeters(fixtureLine());
  assert.equal(indexAtMeters(cum, 0), 0);
  assert.equal(indexAtMeters(cum, DEG_MILLI_METERS * 3.5), 3);
  assert.equal(indexAtMeters(cum, 1e9), 40);
});

test("stageBoundaries snaps to the nearest vertex when the anchor is on the line", () => {
  const line = fixtureLine();
  const cum = cumulativeMeters(line);
  const bounds = stageBoundaries(
    line,
    cum,
    [[0, 0], [0.01, 0], [0.02, 0.01], [0.02, 0.02]],
    [1.1, 2.2, 0.9],
  );
  assert.deepEqual(bounds.map((b) => b.index), [0, 10, 30, 40]);
  assert.deepEqual(bounds.map((b) => b.mode), ["snap", "snap", "snap", "snap"]);
});

test("stageBoundaries falls back to the declared-distance position for an anchor far off the line", () => {
  const line = fixtureLine();
  const cum = cumulativeMeters(line);
  // The middle anchor is ~4.4 km north of the line — the shape a stage-boundary
  // town takes when OSM's main relation does not pass through it at all.
  const bounds = stageBoundaries(
    line,
    cum,
    [[0, 0], [0.01, 0.04], [0.02, 0.01], [0.02, 0.02]],
    [1.1, 2.2, 0.9],
  );
  assert.equal(bounds[1].mode, "proportional");
  assert.ok(bounds[1].offMeters > 500);
  // 1.1 of 4.2 declared km along a 4450.563 m line = 1165.4 m in, which is
  // vertex 10 (1112.2 m) — the last one at or before it.
  assert.equal(bounds[1].index, 10);
  assert.deepEqual([bounds[0].mode, bounds[2].mode, bounds[3].mode], ["snap", "snap", "snap"]);
});

test("simplify drops a vertex inside the tolerance and keeps one outside it", () => {
  const line = fixtureLine();
  // Stage 0's slice: the only bend is 5.6 m off the straight, inside 8 m.
  assert.deepEqual(simplify(line.slice(0, 11), RDP_TOLERANCE_METERS), [[0, 0], [0.01, 0]]);
  // Stage 1's slice keeps the 16.7 m bend and the right-angle corner.
  const stage1 = simplify(line.slice(10, 31), RDP_TOLERANCE_METERS);
  assert.deepEqual(stage1, [[0.01, 0], [0.012, 0], [0.013, 0.00015], [0.014, 0], [0.02, 0], [0.02, 0.01]]);
});

test("simplify returns a two-point line unchanged", () => {
  assert.deepEqual(simplify([[0, 0], [0.01, 0]], RDP_TOLERANCE_METERS), [[0, 0], [0.01, 0]]);
});

test("strideCap keeps the endpoints and never exceeds the cap", () => {
  const line: Position[] = Array.from({ length: 3000 }, (_, i) => [i * 0.0001, 0]);
  const capped = strideCap(line, MAX_ROUTE_POINTS);
  assert.ok(capped.length <= MAX_ROUTE_POINTS, `got ${capped.length}`);
  assert.deepEqual(capped[0], line[0]);
  assert.deepEqual(capped.at(-1), line.at(-1));
});

test("strideCap leaves a line already under the cap alone", () => {
  const line: Position[] = [[0, 0], [0.001, 0], [0.002, 0]];
  assert.deepEqual(strideCap(line, MAX_ROUTE_POINTS), line);
});

test("roundLine rounds to six decimals and drops the repeats that creates", () => {
  assert.deepEqual(
    roundLine([[0.0000001, 0], [0.0000002, 0], [0.001, 0]]),
    [[0, 0], [0.001, 0]],
  );
});

test("projectOnLine puts a point on the line and reports how far off it was", () => {
  const line = simplify(fixtureLine().slice(0, 11), RDP_TOLERANCE_METERS);
  const cum = cumulativeMeters(line);
  const shrine = projectOnLine(line, cum, [0.005, 0.0002]);
  assert.ok(Math.abs(shrine.frac - 0.5) < 1e-6);
  assert.deepEqual(shrine.at.map((v) => +v.toFixed(6)), [0.005, 0]);
  assert.ok(Math.abs(shrine.offLineMeters - 22.2) < 0.2);
});

test("projectOnLine clamps to the ends rather than running off the line", () => {
  const line: Position[] = [[0, 0], [0.01, 0]];
  const cum = cumulativeMeters(line);
  assert.equal(projectOnLine(line, cum, [-0.01, 0]).frac, 0);
  assert.equal(projectOnLine(line, cum, [0.02, 0]).frac, 1);
});

test("routePoints synthesize a clock that is monotonic and ends at the stage's hours", () => {
  const line = simplify(fixtureLine().slice(10, 31), RDP_TOLERANCE_METERS);
  const cum = cumulativeMeters(line);
  const pts = routePoints(line, cum, 5);
  assert.equal(pts.length, line.length);
  assert.equal(pts[0].t, 0);
  assert.equal(pts.at(-1)!.t, 18000);
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].t >= pts[i - 1].t, `t fell at ${i}`);
  assert.equal(pts[0].lat, 0);
  assert.equal(pts[0].lon, 0.01);
  assert.equal(pts[0].alt, undefined);
});

test("routePoints carry altitude when the walked line has a third ordinate", () => {
  const line: Position[] = [[0, 0, 172], [0.01, 0, 945]];
  const pts = routePoints(line, cumulativeMeters(line), 1);
  assert.equal(pts[0].alt, 172);
  assert.equal(pts[1].alt, 945);
});

test("withinGate accepts ten percent either way and rejects beyond it", () => {
  assert.equal(withinGate(1.1, 1.0), true);
  assert.equal(withinGate(0.9, 1.0), true);
  assert.equal(withinGate(1.1001, 1.0), false);
  assert.equal(withinGate(0.8999, 1.0), false);
});

test("the fixture's three stages measure what the plan says they measure", () => {
  const line = fixtureLine();
  const cum = cumulativeMeters(line);
  const bounds = stageBoundaries(line, cum, [[0, 0], [0.01, 0], [0.02, 0.01], [0.02, 0.02]], [1.1, 2.2, 0.9]);
  const declared = [1.1, 2.2, 0.9];
  const measured = [0, 1, 2].map((k) => {
    const slice = roundLine(strideCap(simplify(line.slice(bounds[k].index, bounds[k + 1].index + 1), RDP_TOLERANCE_METERS), MAX_ROUTE_POINTS));
    return lineLengthMeters(slice) / 1000;
  });
  assert.ok(Math.abs(measured[0] - 1.111949) < 1e-4, `${measured[0]}`);
  assert.ok(Math.abs(measured[1] - 2.226387) < 1e-4, `${measured[1]}`);
  assert.ok(Math.abs(measured[2] - 1.111949) < 1e-4, `${measured[2]}`);
  assert.deepEqual(measured.map((m, k) => withinGate(m, declared[k])), [true, true, false]);
});
