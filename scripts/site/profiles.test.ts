import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { profileSvg, stagesOf, type ProfileStage } from "./profiles.js";

const ROOT = join(import.meta.dirname, "..", "..");

function stagesJson(routeId: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, "routes", routeId, "stages.json"), "utf-8"));
}

test("stagesOf reads every stage with its elevation bounds", () => {
  const stages = stagesOf(stagesJson("camino-primitivo"));

  assert.equal(stages.length, 11);
  assert.equal(stages[0].name, "Oviedo to Grado");
  assert.equal(stages[0].distanceKm, 25.2);
  assert.equal(stages[0].highPointMeters, 350);
  assert.equal(stages[0].lowPointMeters, 76);
});

test("stagesOf finds the Puerto del Palo high point on the Primitivo", () => {
  const peak = Math.max(...stagesOf(stagesJson("camino-primitivo")).map((s) => s.highPointMeters));
  assert.equal(peak, 1146);
});

test("stagesOf reads all 33 Frances stages", () => {
  assert.equal(stagesOf(stagesJson("camino-frances")).length, 33);
});

test("stagesOf gracefully degrades on null input", () => {
  assert.deepEqual(stagesOf(null), []);
});

test("stagesOf gracefully degrades when the stages key is missing", () => {
  assert.deepEqual(stagesOf({ schemaVersion: "1.0.0" }), []);
});

test("stagesOf gracefully degrades when stages is not an array", () => {
  assert.deepEqual(stagesOf({ stages: "not-an-array" }), []);
});

test("stagesOf fills sensible defaults for a stage missing every field", () => {
  const stages = stagesOf({ stages: [{}] });

  assert.deepEqual(stages, [{ name: "", distanceKm: 0, highPointMeters: 0, lowPointMeters: 0 }]);
});

test("stagesOf tolerates a null entry inside the stages array", () => {
  assert.deepEqual(stagesOf({ stages: [null] }), [
    { name: "", distanceKm: 0, highPointMeters: 0, lowPointMeters: 0 },
  ]);
});

const SAMPLE: ProfileStage[] = [
  { name: "A", distanceKm: 10, highPointMeters: 100, lowPointMeters: 0 },
  { name: "B", distanceKm: 10, highPointMeters: 200, lowPointMeters: 50 },
];

test("profileSvg emits a viewBox sized to the arguments", () => {
  assert.match(profileSvg(SAMPLE, 800, 120), /viewBox="0 0 800 120"/);
});

test("profileSvg widths each step in proportion to its distance", () => {
  const uneven: ProfileStage[] = [
    { name: "short", distanceKm: 10, highPointMeters: 100, lowPointMeters: 0 },
    { name: "long", distanceKm: 30, highPointMeters: 100, lowPointMeters: 0 },
  ];
  // First step spans a quarter of the width, so the first horizontal run ends at 200.
  assert.match(profileSvg(uneven, 800, 100), /H200(\.0)?\b/);
});

test("profileSvg returns an empty string for no stages", () => {
  assert.equal(profileSvg([], 800, 100), "");
});

test("profileSvg never emits NaN", () => {
  const flat: ProfileStage[] = [
    { name: "flat", distanceKm: 5, highPointMeters: 100, lowPointMeters: 100 },
  ];
  assert.equal(profileSvg(flat, 800, 100).includes("NaN"), false);
});

test("profileSvg never emits NaN or Infinity for a single stage", () => {
  const single: ProfileStage[] = [
    { name: "only", distanceKm: 12, highPointMeters: 500, lowPointMeters: 100 },
  ];
  const svg = profileSvg(single, 800, 100);
  assert.equal(svg.includes("NaN"), false);
  assert.equal(svg.includes("Infinity"), false);
});

test("profileSvg never emits NaN or Infinity when every stage has zero distance", () => {
  const zeroDistance: ProfileStage[] = [
    { name: "A", distanceKm: 0, highPointMeters: 100, lowPointMeters: 0 },
    { name: "B", distanceKm: 0, highPointMeters: 200, lowPointMeters: 50 },
  ];
  const svg = profileSvg(zeroDistance, 800, 100);
  assert.equal(svg.includes("NaN"), false);
  assert.equal(svg.includes("Infinity"), false);
});
