import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { buildRouteCard, buildReport, halfOfStages } from "./catalog.js";
import type { DatasetStage } from "./stage.js";

const ROOT = join(import.meta.dirname, "..", "..");
const FIXTURE = join(ROOT, "scripts", "fixtures", "way-fixture-route");
const loadJson = (name: string) => JSON.parse(readFileSync(join(FIXTURE, name), "utf-8"));
const metadata = loadJson("metadata.json");
const stages: DatasetStage[] = loadJson("stages.json").stages;

function cardValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(JSON.parse(readFileSync(join(ROOT, "schema", "way-route.schema.json"), "utf-8")), "card");
  return ajv;
}

test("halfOfStages is half the stages, rounded up", () => {
  assert.equal(halfOfStages(33), 17);
  assert.equal(halfOfStages(10), 5);
  assert.equal(halfOfStages(3), 2);
  assert.equal(halfOfStages(1), 1);
});

test("the route card carries the fields the catalog screen draws", () => {
  const card = buildRouteCard("fixture-way", metadata, stages, false);
  assert.equal(card.id, "fixture-way");
  assert.equal(card.name, "Fixture Way");
  assert.deepEqual(card.names, { es: "Camino de Prueba" });
  assert.equal(card.country, "ES");
  assert.equal(card.region, "Europe");
  assert.equal(card.stageCount, 3);
  assert.equal(card.tradition, "christian");
  assert.match(card.summary, /^A synthetic three-stage route/);
  assert.equal(card.cover, undefined);
});

test("the route card's distance is the sum of the stages, not the geometry", () => {
  const card = buildRouteCard("fixture-way", metadata, stages, false);
  assert.equal(card.distanceKm, 4.2);
});

test("the route card lists every stage with its day facts", () => {
  const card = buildRouteCard("fixture-way", metadata, stages, false);
  assert.deepEqual(card.stages[0], {
    index: 0,
    name: "Start Town to Middle",
    distanceKm: 1.1,
    gainMeters: 20,
    hours: { min: 2, max: 4 },
    difficulty: "easy",
  });
  assert.equal(card.stages.length, 3);
});

test("a stage the dataset is silent about still carries the two fields the app requires", () => {
  // The app's RouteFile.Stage declares gainMeters and difficulty non-optional,
  // so a contribution that omits them must not produce a card the phone
  // refuses to decode.
  const bare: DatasetStage[] = stages.map((stage) => {
    const { elevationGainMeters: _gain, difficulty: _difficulty, ...rest } = stage;
    return rest;
  });

  const card = buildRouteCard("fixture-way", metadata, bare, false);

  assert.deepEqual(card.stages.map((s) => s.gainMeters), [0, 0, 0]);
  assert.deepEqual(card.stages.map((s) => s.difficulty), ["", "", ""]);

  const ajv = cardValidator();
  assert.ok(ajv.validate("card", card), JSON.stringify(ajv.errors));
});

test("the route card names a cover only when one exists on disk", () => {
  assert.equal(buildRouteCard("fixture-way", metadata, stages, true).cover, "cover.jpg");
});

test("the report records each stage against its declared distance", () => {
  const report = buildReport({
    routeId: "fixture-way",
    generatedAt: metadata.lastUpdated,
    walkedLine: { source: "route.main.geojson", points: 41, lengthKm: 4.450563 },
    stages: [
      { index: 0, name: "a", sliceKm: 1.111949, distanceKm: 1.1, boundaryMode: "snap", routePoints: 2, moments: 4, momentsBeyondEnds: 2, momentsWithText: 3, marks: 1, marksTrimmed: 0, dropped: [] },
      { index: 1, name: "b", sliceKm: 2.226387, distanceKm: 2.2, boundaryMode: "snap", routePoints: 6, moments: 5, momentsBeyondEnds: 3, momentsWithText: 3, marks: 1, marksTrimmed: 0, dropped: ["wp-far-chapel is 440 m from the line"] },
      { index: 2, name: "c", sliceKm: 1.111949, distanceKm: 0.9, boundaryMode: "snap", routePoints: 2, moments: 2, momentsBeyondEnds: 0, momentsWithText: 0, marks: 4, marksTrimmed: 0, dropped: [] },
    ],
  });

  assert.equal(report.gate.passed, false);
  assert.deepEqual(report.gate.failing, [2]);
  assert.deepEqual(report.stages.map((s) => s.passedGate), [true, true, false]);
  assert.ok(Math.abs(report.stages[2].ratio - 1.2355) < 1e-3);
});

test("a route is sparse when fewer than half its stages carry a place beyond their ends", () => {
  const stageRows = (beyond: number[]) =>
    beyond.map((momentsBeyondEnds, index) => ({
      index,
      name: `s${index}`,
      sliceKm: 1,
      distanceKm: 1,
      boundaryMode: "snap" as const,
      routePoints: 2,
      moments: momentsBeyondEnds + 2,
      momentsBeyondEnds,
      momentsWithText: 0,
      marks: 0,
      marksTrimmed: 0,
      dropped: [],
    }));
  const base = {
    routeId: "fixture-way",
    generatedAt: metadata.lastUpdated,
    walkedLine: { source: "route.main.geojson" as const, points: 41, lengthKm: 3 },
  };

  const wellCurated = buildReport({ ...base, stages: stageRows([2, 1, 0]) });
  assert.equal(wellCurated.places.sparse, false);
  assert.equal(wellCurated.places.stagesWithMomentBeyondEnds, 2);
  assert.equal(wellCurated.places.halfOfStages, 2);
  assert.equal(wellCurated.places.placesPerStage, 1);
  assert.equal(wellCurated.places.note, undefined);

  const sparse = buildReport({ ...base, stages: stageRows([1, 0, 0]) });
  assert.equal(sparse.places.sparse, true);
  assert.ok(Math.abs(sparse.places.placesPerStage - 0.3) < 1e-9);
  assert.match(sparse.places.note!, /1 of 3/);
});

test("the gate and the coverage flag are independent verdicts", () => {
  // The gate governs whether a package is written and whether the catalog
  // lists the route; coverage only decides what the card says about it.
  const report = buildReport({
    routeId: "fixture-way",
    generatedAt: metadata.lastUpdated,
    walkedLine: { source: "route.geojson", points: 41, lengthKm: 9 },
    stages: [
      { index: 0, name: "a", sliceKm: 9, distanceKm: 1, boundaryMode: "snap", routePoints: 2, moments: 5, momentsBeyondEnds: 3, momentsWithText: 1, marks: 0, marksTrimmed: 0, dropped: [] },
    ],
  });
  assert.equal(report.gate.passed, false);
  assert.equal(report.places.sparse, false);
});
