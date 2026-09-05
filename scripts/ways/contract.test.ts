import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { SCHEMA_VERSION } from "./types.js";

const ROOT = join(import.meta.dirname, "..", "..");
const FIXTURE = join(ROOT, "scripts", "fixtures", "way-fixture-route");

function loadJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const name of [
    "way.schema.json",
    "way-route.schema.json",
    "way-report.schema.json",
    "pilgrimage.schema.json",
    "stages.schema.json",
    "route.schema.json",
    "waypoints.schema.json",
  ]) {
    ajv.addSchema(loadJson(join(ROOT, "schema", name)), name);
  }
  return ajv;
}

test("the three way schemas compile under Ajv 2020", () => {
  const ajv = validator();
  for (const name of ["way.schema.json", "way-route.schema.json", "way-report.schema.json"]) {
    assert.ok(ajv.getSchema(name), `${name} did not compile`);
  }
});

/** The shape of the iOS plan's `stage-00.json`, trimmed to two route points. */
function fixtureShapedWay(): Record<string, unknown> {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "pilgrimage:fixture-way:0",
    title: "Start Town to Middle",
    departedAt: "2026-08-19T00:00:00Z",
    route: [
      { lat: 0, lon: 0, t: 0 },
      { lat: 0, lon: 0.01, t: 10800 },
    ],
    totalDistanceMeters: 1111.9,
    theirActiveSeconds: 10800,
    moments: [
      {
        id: "wp-start-town",
        frac: 0,
        kind: "waypoint",
        label: "Start Town",
        icon: "house.lodge",
        at: { lat: 0, lon: 0 },
        pin: { lat: 0, lon: 0 },
      },
    ],
    marks: [
      {
        id: "wp-fuente",
        kind: "water",
        name: "Fuente",
        at: { lat: 0, lon: 0.006 },
        frac: 0.6,
        offLineMeters: 33.4,
      },
    ],
    stage: {
      routeId: "fixture-way",
      index: 0,
      count: 3,
      name: "Start Town to Middle",
      theme: "Setting out",
      narrative: "A flat first hour.",
      closing: "What did you bring?",
      warnings: [],
      distanceKm: 1.1,
      gainMeters: 20,
      hours: { min: 2, max: 4 },
      difficulty: "easy",
      start: { name: "Start Town", at: { lat: 0, lon: 0 } },
      end: { name: "Middle", at: { lat: 0, lon: 0.01 } },
    },
  };
}

test("a stage Way in the importer's wire format validates", () => {
  const ajv = validator();
  assert.ok(ajv.validate("way.schema.json", fixtureShapedWay()), JSON.stringify(ajv.errors));
});

test("the way schema rejects Swift Codable's nested moment kind", () => {
  const ajv = validator();
  const way = fixtureShapedWay();
  // The exact regression this schema exists to catch: emitting what Way's
  // synthesized Codable would write instead of what the importer reads.
  (way.moments as Array<Record<string, unknown>>)[0] = {
    id: "wp-start-town",
    frac: 0,
    at: { lat: 0, lon: 0 },
    kind: { waypoint: { label: "Start Town", icon: "house.lodge" } },
  };
  assert.equal(ajv.validate("way.schema.json", way), false);
});

test("the way schema rejects a source field — the app assigns the source itself", () => {
  const ajv = validator();
  const way = fixtureShapedWay();
  way.source = { pilgrimage: { routeId: "fixture-way", stageIndex: 0 } };
  assert.equal(ajv.validate("way.schema.json", way), false);
});

test("the way schema requires every field of the stage block", () => {
  const ajv = validator();
  for (const field of ["theme", "narrative", "closing", "warnings", "gainMeters", "difficulty"]) {
    const way = fixtureShapedWay();
    delete (way.stage as Record<string, unknown>)[field];
    assert.equal(ajv.validate("way.schema.json", way), false, `stage.${field} must be required`);
  }
});

test("the way schema holds the importer's own caps", () => {
  const ajv = validator();
  const tooLongLabel = fixtureShapedWay();
  (tooLongLabel.moments as Array<Record<string, unknown>>)[0].label = "x".repeat(81);
  assert.equal(ajv.validate("way.schema.json", tooLongLabel), false, "label caps at 80");

  const tooManyMarks = fixtureShapedWay();
  const mark = (tooManyMarks.marks as Array<unknown>)[0];
  tooManyMarks.marks = Array.from({ length: 401 }, () => mark);
  assert.equal(ajv.validate("way.schema.json", tooManyMarks), false, "marks cap at 400");
});

test("the route-card schema requires the same two fields the stage block does", () => {
  const ajv = validator();
  const card = loadJson(join(ROOT, "routes", "camino-frances", "ways", "route.json"));
  assert.ok(ajv.validate("way-route.schema.json", card), JSON.stringify(ajv.errors));

  for (const field of ["gainMeters", "difficulty"]) {
    const missing = loadJson(join(ROOT, "routes", "camino-frances", "ways", "route.json"));
    delete missing.stages[0][field];
    assert.equal(
      ajv.validate("way-route.schema.json", missing),
      false,
      `stages[].${field} must be required — the app's RouteFile.Stage cannot decode without it`,
    );
  }
});

test("the route-card schema accepts the empty difficulty the build writes for a silent stage", () => {
  const ajv = validator();
  const card = loadJson(join(ROOT, "routes", "camino-frances", "ways", "route.json"));
  card.stages[0].difficulty = "";
  assert.ok(ajv.validate("way-route.schema.json", card), JSON.stringify(ajv.errors));
});

test("the stages schema rejects an interior with no reflection", () => {
  const ajv = validator();
  const stages = loadJson(join(FIXTURE, "stages.json"));
  assert.ok(
    ajv.validate("stages.schema.json", stages),
    `fixture must validate before mutation: ${JSON.stringify(ajv.errors)}`,
  );
  delete stages.stages[0].interior.reflection;
  assert.equal(ajv.validate("stages.schema.json", stages), false, "interior.reflection must be required");
});

test("the fixture route validates against the dataset's own schemas", () => {
  const ajv = validator();
  for (const [file, schema] of [
    ["metadata.json", "pilgrimage.schema.json"],
    ["stages.json", "stages.schema.json"],
    ["waypoints.geojson", "waypoints.schema.json"],
    ["route.main.geojson", "route.schema.json"],
  ] as const) {
    assert.ok(
      ajv.validate(schema, loadJson(join(FIXTURE, file))),
      `${file}: ${JSON.stringify(ajv.errors)}`,
    );
  }
});

test("the fixture's walked line is a MultiLineString of two parts sharing one point", () => {
  const fc = loadJson(join(FIXTURE, "route.main.geojson"));
  const geom = fc.features[0].geometry;
  assert.equal(geom.type, "MultiLineString");
  assert.equal(geom.coordinates.length, 2);
  assert.deepEqual(geom.coordinates[0].at(-1), geom.coordinates[1][0]);
});

test("the fixture carries every moment type and every mark kind", () => {
  const wp = loadJson(join(FIXTURE, "waypoints.geojson"));
  const types = new Set(wp.features.map((f: any) => f.properties.type));
  for (const t of [
    "town", "sacred_site", "cultural_site", "viewpoint", "credential_stamp",
    "water_source", "food", "accommodation", "transport", "supply", "medical",
  ]) {
    assert.ok(types.has(t), `fixture is missing a ${t} waypoint`);
  }
  assert.equal(wp.features.length, 16);
});
