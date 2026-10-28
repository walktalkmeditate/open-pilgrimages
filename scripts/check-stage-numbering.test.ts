import { test } from "node:test";
import assert from "node:assert/strict";
import { checkStageNumbering, isMajorBump, MOVE_TOLERANCE_METERS } from "./check-stage-numbering.js";

type Ends = [[number, number], [number, number]];

/** A stages.json body with one stage per [start, end] pair, indexed in order. */
function stages(...ends: Ends[]): string {
  return JSON.stringify({
    stages: ends.map(([start, end], index) => ({
      index,
      name: { en: `stage ${index}` },
      start: { name: { en: "from" }, coordinates: start },
      end: { name: { en: "to" }, coordinates: end },
      distanceKm: 20,
    })),
  });
}

const A: [number, number] = [-3.912, 42.337];
const B: [number, number] = [-4.14, 42.289];
const C: [number, number] = [-4.4, 42.3];
/** ~600 m and ~400 m north of A: one degree of latitude is ~111.2 km. */
const A_600M: [number, number] = [A[0], A[1] + 0.0054];
const A_400M: [number, number] = [A[0], A[1] + 0.0036];

test("the tolerance is 500 m", () => {
  assert.equal(MOVE_TOLERANCE_METERS, 500);
});

test("an unchanged route passes", () => {
  assert.deepEqual(checkStageNumbering("camino-frances", "v1.0.0", stages([A, B], [B, C]), stages([A, B], [B, C])), []);
});

test("a renamed stage passes", () => {
  const renamed = JSON.parse(stages([A, B])) as { stages: { name: { en: string } }[] };
  renamed.stages[0].name.en = "Hornillos del Camino to Castrojeriz";
  assert.deepEqual(checkStageNumbering("camino-frances", "v1.0.0", stages([A, B]), JSON.stringify(renamed)), []);
});

test("a start moved 600 m fails and names the stage by its link number", () => {
  const problems = checkStageNumbering("camino-frances", "v1.0.0", stages([A, B]), stages([A_600M, B]));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: stage 1 \(index 0\)'s start moved 60\d m since v1\.0\.0/);
});

test("a 400 m nudge passes", () => {
  assert.deepEqual(checkStageNumbering("camino-frances", "v1.0.0", stages([A, B]), stages([A_400M, B])), []);
});

test("a changed stage count fails", () => {
  const problems = checkStageNumbering("camino-frances", "v1.0.0", stages([A, B], [B, C]), stages([A, B], [B, C], [C, A]));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: 2 stages at v1\.0\.0, 3 now/);
});

test("a route gone from the working tree fails", () => {
  const problems = checkStageNumbering("camino-frances", "v1.0.0", stages([A, B]), undefined);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: walkable at v1\.0\.0 but its stages\.json is gone/);
});

test("unreadable JSON is reported, not thrown", () => {
  const problems = checkStageNumbering("camino-frances", "v1.0.0", stages([A, B]), "{not json");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: stages\.json could not be read/);
});

test("a stage with no end is reported, not thrown", () => {
  const broken = JSON.parse(stages([A, B])) as { stages: Record<string, unknown>[] };
  delete broken.stages[0].end;
  const problems = checkStageNumbering("camino-frances", "v1.0.0", stages([A, B]), JSON.stringify(broken));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: stages\.json could not be read/);
});

test("stages are matched by index, not array order", () => {
  const reordered = JSON.parse(stages([A, B], [B, C])) as { stages: unknown[] };
  reordered.stages.reverse();
  assert.deepEqual(checkStageNumbering("camino-frances", "v1.0.0", stages([A, B], [B, C]), JSON.stringify(reordered)), []);
});

test("isMajorBump only for a strictly higher major", () => {
  assert.equal(isMajorBump("v1.12.0", "2.0.0"), true);
  assert.equal(isMajorBump("v1.12.0", "1.13.0"), false);
  assert.equal(isMajorBump("v1.12.0", "1.12.0"), false);
  assert.equal(isMajorBump("v2.0.0", "1.99.0"), false);
  assert.equal(isMajorBump("v1.12.0", "2.0.0-rc.1"), false);
  assert.equal(isMajorBump("v1.12.0", "not-a-version"), false);
  assert.equal(isMajorBump("main", "2.0.0"), false);
});

test("coordinates with non-numeric elements are reported, not passed", () => {
  const broken = JSON.parse(stages([A, B])) as { stages: Record<string, unknown>[] };
  (broken.stages[0].start as unknown as Record<string, unknown>).coordinates = ["a", "b"];
  const problems = checkStageNumbering("camino-frances", "v1.0.0", stages([A, B]), JSON.stringify(broken));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: stages\.json could not be read/);
});

test("empty coordinate arrays are reported, not passed", () => {
  const broken = JSON.parse(stages([A, B])) as { stages: Record<string, unknown>[] };
  (broken.stages[0].start as unknown as Record<string, unknown>).coordinates = [];
  const problems = checkStageNumbering("camino-frances", "v1.0.0", stages([A, B]), JSON.stringify(broken));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: stages\.json could not be read/);
});
