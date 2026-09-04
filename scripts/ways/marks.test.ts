import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { buildMarks, MARK_KIND_BY_TYPE, MARK_NAME_MAX, MAX_MARKS } from "./marks.js";
import { walkedLine, cumulativeMeters, simplify, roundLine, RDP_TOLERANCE_METERS, projectOnLine } from "./geo.js";
import type { WaypointFeature } from "./moments.js";
import type { Position } from "./types.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "way-fixture-route");
const loadJson = (name: string) => JSON.parse(readFileSync(join(FIXTURE, name), "utf-8"));

function stageSlice(from: number, to: number): { line: Position[]; cumulative: number[] } {
  const line = roundLine(simplify(walkedLine(loadJson("route.main.geojson")).slice(from, to + 1), RDP_TOLERANCE_METERS));
  return { line, cumulative: cumulativeMeters(line) };
}

const waypointsForStage = (index: number): WaypointFeature[] =>
  loadJson("waypoints.geojson").features.filter((f: WaypointFeature) => f.properties.stageIndex === index);

test("every service type the dataset carries has a mark kind", () => {
  assert.deepEqual(MARK_KIND_BY_TYPE, {
    water_source: "water",
    food: "food",
    accommodation: "bed",
    transport: "transport",
    supply: "supply",
    medical: "medical",
  });
});

test("a water source becomes a water mark with its distance off the line", () => {
  const { line, cumulative } = stageSlice(0, 10);
  const { marks } = buildMarks({ line, cumulative, waypoints: waypointsForStage(0) });

  assert.deepEqual(marks.map((m) => m.id), ["wp-fuente"]);
  assert.equal(marks[0].kind, "water");
  assert.equal(marks[0].name, "Fuente del Camino");
  assert.ok(Math.abs(marks[0].frac - 0.6) < 1e-3);
  assert.ok(Math.abs(marks[0].offLineMeters - 33.4) < 0.3);
  // The fountain's own place — the fixture puts it at [0.006, 0.0003] — not
  // the point on the line nearest to it, which a mark has no `pin` to hold.
  assert.deepEqual(marks[0].at, { lat: 0.0003, lon: 0.006 });
});

test("an off-line mark's `at` is where the place is, not the line's nearest point to it", () => {
  const { line, cumulative } = stageSlice(0, 10);
  const { marks } = buildMarks({ line, cumulative, waypoints: waypointsForStage(0) });
  const mark = marks.find((m) => m.id === "wp-fuente")!;

  const onLine = projectOnLine(line, cumulative, [mark.at.lon, mark.at.lat]);
  assert.notDeepEqual(mark.at, { lat: onLine.at[1], lon: onLine.at[0] });
});

test("a service more than 300 m off the line is dropped and named in the warnings", () => {
  const { line, cumulative } = stageSlice(0, 10);
  const { marks, dropped } = buildMarks({ line, cumulative, waypoints: waypointsForStage(0) });
  assert.equal(marks.some((m) => m.id === "wp-far-fountain"), false);
  assert.equal(dropped.length, 1);
  assert.match(dropped[0], /wp-far-fountain/);
});

test("a moment-type waypoint never becomes a mark", () => {
  const { line, cumulative } = stageSlice(10, 30);
  const { marks } = buildMarks({ line, cumulative, waypoints: waypointsForStage(1) });
  assert.deepEqual(marks.map((m) => m.id), ["wp-cafe"]);
  assert.equal(marks[0].kind, "food");
});

test("the last stage carries a mark of every remaining kind, ordered by frac", () => {
  const { line, cumulative } = stageSlice(30, 40);
  const { marks } = buildMarks({ line, cumulative, waypoints: waypointsForStage(2) });
  assert.deepEqual(marks.map((m) => m.kind), ["bed", "medical", "supply", "transport"]);
  assert.deepEqual(marks.map((m) => Math.round(m.frac * 10) / 10), [0.2, 0.4, 0.6, 0.8]);
});

test("a mark name is capped at eighty characters", () => {
  const line: Position[] = [[0, 0], [0.01, 0]];
  const { marks } = buildMarks({
    line,
    cumulative: cumulativeMeters(line),
    waypoints: [
      {
        id: "wp-long",
        type: "Feature",
        geometry: { type: "Point", coordinates: [0.005, 0] },
        properties: { routeId: "fixture-way", type: "food", name: "x".repeat(200), stageIndex: 0 },
      },
    ],
  });
  assert.equal(marks[0].name.length, MARK_NAME_MAX);
});

test("a stage over the app's mark limit keeps the ones nearest the trail", () => {
  const line: Position[] = [[0, 0], [0.01, 0]];
  const waypoints: WaypointFeature[] = Array.from({ length: MAX_MARKS + 5 }, (_, i) => ({
    id: `wp-${String(i).padStart(4, "0")}`,
    type: "Feature",
    geometry: { type: "Point", coordinates: [0.005, i * 0.0000005] },
    properties: { routeId: "fixture-way", type: "water_source", name: `f${i}`, stageIndex: 0 },
  }));

  const { marks, trimmed } = buildMarks({ line, cumulative: cumulativeMeters(line), waypoints });

  assert.equal(marks.length, MAX_MARKS);
  assert.equal(trimmed, 5);
  // The five farthest off the line are the five that went.
  for (const id of ["wp-0400", "wp-0401", "wp-0402", "wp-0403", "wp-0404"]) {
    assert.equal(marks.some((m) => m.id === id), false, `${id} should have been trimmed`);
  }
});

test("a waypoint with no mapped kind is skipped without a warning", () => {
  const line: Position[] = [[0, 0], [0.01, 0]];
  const { marks, dropped } = buildMarks({
    line,
    cumulative: cumulativeMeters(line),
    waypoints: [
      {
        id: "wp-sign",
        type: "Feature",
        geometry: { type: "Point", coordinates: [0.005, 0] },
        properties: { routeId: "fixture-way", type: "waymarker", name: "Arrow", stageIndex: 0 },
      },
    ],
  });
  assert.deepEqual(marks, []);
  assert.deepEqual(dropped, []);
});
