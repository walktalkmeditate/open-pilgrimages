import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { buildStageBlock, closingFor, lastSentence, midpointHours, type DatasetStage } from "./stage.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "way-fixture-route");
const stages: DatasetStage[] = JSON.parse(readFileSync(join(FIXTURE, "stages.json"), "utf-8")).stages;

test("midpointHours takes the middle of the estimated range", () => {
  assert.equal(midpointHours({ min: 7, max: 9 }), 8);
  assert.equal(midpointHours({ min: 3, max: 3 }), 3);
});

test("midpointHours falls back to one hour when the dataset gives no range", () => {
  // A zero would make every t identical and divide the clock by nothing.
  assert.equal(midpointHours(undefined), 1);
  assert.equal(midpointHours({}), 1);
});

test("lastSentence returns the final sentence of a narrative", () => {
  assert.equal(lastSentence("One thing. Then another thing."), "Then another thing.");
  assert.equal(lastSentence("No terminator here"), "No terminator here");
  assert.equal(lastSentence(undefined), undefined);
  assert.equal(lastSentence("   "), undefined);
});

test("closingFor prefers the interior reflection", () => {
  assert.equal(closingFor(stages[0]), "What did you bring that you do not need?");
});

test("closingFor falls back to the narrative's last sentence when there is no reflection", () => {
  const stage: DatasetStage = {
    index: 0,
    name: { en: "A to B" },
    start: { name: { en: "A" }, coordinates: [0, 0] },
    end: { name: { en: "B" }, coordinates: [0.01, 0] },
    distanceKm: 1,
    interior: { narrative: { en: "The path climbs. Then it does not." } },
  };
  assert.equal(closingFor(stage), "Then it does not.");
});

test("the stage block carries the day's facts in the app's shape", () => {
  const block = buildStageBlock("fixture-way", 3, stages[0]);
  assert.deepEqual(block, {
    routeId: "fixture-way",
    index: 0,
    count: 3,
    name: "Start Town to Middle",
    theme: "Setting out",
    narrative: "A flat first hour along the equator, which is exactly as unremarkable as it sounds.",
    closing: "What did you bring that you do not need?",
    warnings: [],
    distanceKm: 1.1,
    gainMeters: 20,
    hours: { min: 2, max: 4 },
    difficulty: "easy",
    start: { name: "Start Town", at: { lat: 0, lon: 0 } },
    end: { name: "Middle", at: { lat: 0, lon: 0.01 } },
  });
});

test("the stage block carries warnings when the dataset has them, and an empty array when it does not", () => {
  assert.deepEqual(buildStageBlock("fixture-way", 3, stages[1]).warnings, [
    "The corner at the end of the first leg is unsigned. Turn north.",
  ]);
  // Never undefined: the app's WayStage declares `warnings` non-optional.
  assert.deepEqual(buildStageBlock("fixture-way", 3, stages[0]).warnings, []);
});

test("a stage with no interior still writes every key the app requires", () => {
  const block = buildStageBlock("fixture-way", 3, {
    index: 0,
    name: { en: "A to B" },
    start: { name: { en: "A" }, coordinates: [0, 0] },
    end: { name: { en: "B" }, coordinates: [0.01, 0] },
    distanceKm: 1,
  });
  assert.equal(block.theme, "");
  assert.equal(block.narrative, "");
  assert.equal(block.closing, "");
  assert.deepEqual(block.warnings, []);
  assert.equal(block.gainMeters, 0);
  assert.equal(block.difficulty, "");
  assert.deepEqual(block.hours, { min: 1, max: 1 });
});

test("the stage block does not package elevation loss, which nothing in this slice reads", () => {
  const block = buildStageBlock("fixture-way", 3, {
    ...stages[0],
    elevationLossMeters: 557,
  } as DatasetStage);
  assert.equal((block as unknown as Record<string, unknown>).lossMeters, undefined);
  assert.equal((block as unknown as Record<string, unknown>).elevationLossMeters, undefined);
});

test("every string in the stage block is capped", () => {
  const block = buildStageBlock("fixture-way", 3, {
    index: 0,
    name: { en: "n".repeat(300) },
    start: { name: { en: "s".repeat(300) }, coordinates: [0, 0] },
    end: { name: { en: "e".repeat(300) }, coordinates: [0.01, 0] },
    distanceKm: 1,
    warnings: [{ en: "w".repeat(500) }],
    interior: {
      theme: { en: "t".repeat(300) },
      narrative: { en: "a".repeat(5000) },
      reflection: { en: "r".repeat(900) },
    },
  });
  assert.equal(block.name.length, 120);
  assert.equal(block.theme.length, 80);
  assert.equal(block.narrative.length, 2000);
  assert.equal(block.closing.length, 400);
  assert.equal(block.warnings[0].length, 300);
  assert.equal(block.start.name.length, 120);
});
