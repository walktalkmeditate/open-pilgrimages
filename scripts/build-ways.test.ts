import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { buildRouteWays, stageFileName } from "./build-ways.js";
import type { DatasetStage } from "./ways/stage.js";

const ROOT = join(import.meta.dirname, "..");
const FIXTURE = join(ROOT, "scripts", "fixtures", "way-fixture-route");
const loadJson = (path: string) => JSON.parse(readFileSync(path, "utf-8"));
const fixture = (name: string) => loadJson(join(FIXTURE, name));

function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const name of ["way.schema.json", "way-route.schema.json", "way-report.schema.json"]) {
    ajv.addSchema(loadJson(join(ROOT, "schema", name)), name);
  }
  return ajv;
}

function build(overrides: { stages?: DatasetStage[] } = {}) {
  const stagesFile = fixture("stages.json");
  return buildRouteWays({
    routeId: "fixture-way",
    metadata: fixture("metadata.json"),
    stages: overrides.stages ?? stagesFile.stages,
    waypoints: fixture("waypoints.geojson").features,
    routeGeoJson: fixture("route.main.geojson"),
    walkedLineSource: "route.main.geojson",
    hasCover: false,
  });
}

/** The fixture's stage 2 is deliberately long; this is the passing variant. */
function passingStages(): DatasetStage[] {
  const stages: DatasetStage[] = fixture("stages.json").stages;
  return stages.map((s) => (s.index === 2 ? { ...s, distanceKm: 1.1 } : s));
}

test("a route with no stages refuses to build rather than throw a bare TypeError", () => {
  assert.throws(() => build({ stages: [] }), /fixture-way: stages\.json has no stages/);
});

test("a non-contiguous stage index refuses to build rather than silently misalign the boundaries", () => {
  const stages = passingStages();
  stages[1] = { ...stages[1], index: 5 };
  assert.throws(
    () => build({ stages }),
    /fixture-way: stage 1 declares index 5; this build requires contiguous 0-based indices/,
  );
});

test("stageFileName zero-pads to two digits", () => {
  assert.equal(stageFileName(0), "stage-00.json");
  assert.equal(stageFileName(7), "stage-07.json");
  assert.equal(stageFileName(32), "stage-32.json");
});

test("a stage more than ten percent off its declared distance fails the route's build", () => {
  const result = build();
  assert.equal(result.emitted, false);
  assert.equal(result.report.gate.passed, false);
  assert.deepEqual(result.report.gate.failing, [2]);
  assert.equal(result.ways.length, 0);
});

test("the failure message names the stage and both figures", () => {
  const result = build();
  const stage = result.report.stages[2];
  assert.equal(stage.index, 2);
  assert.equal(stage.distanceKm, 0.9);
  assert.ok(Math.abs(stage.sliceKm - 1.112) < 1e-3, `${stage.sliceKm}`);
});

test("a route whose stages all pass the gate emits one Way per stage", () => {
  const result = build({ stages: passingStages() });
  assert.equal(result.emitted, true);
  assert.deepEqual(result.ways.map((w) => w.id), [
    "pilgrimage:fixture-way:0",
    "pilgrimage:fixture-way:1",
    "pilgrimage:fixture-way:2",
  ]);
});

test("every emitted file validates against its schema", () => {
  const ajv = validator();
  const result = build({ stages: passingStages() });
  for (const way of result.ways) {
    assert.ok(ajv.validate("way.schema.json", way), `${way.id}: ${JSON.stringify(ajv.errors)}`);
  }
  assert.ok(ajv.validate("way-route.schema.json", result.route), JSON.stringify(ajv.errors));
  assert.ok(ajv.validate("way-report.schema.json", result.report), JSON.stringify(ajv.errors));
});

test("a stage Way carries the clock, geometry, moments, marks and stage block", () => {
  const way = build({ stages: passingStages() }).ways[0];

  // No source: the app assigns it from the stage block.
  assert.equal("source" in way, false);
  assert.equal(way.title, "Start Town to Middle");
  // Deterministic: the route's own lastUpdated, never wall-clock time.
  assert.equal(way.departedAt, "2026-08-19T00:00:00Z");
  assert.deepEqual(way.route, [
    { lat: 0, lon: 0, t: 0 },
    { lat: 0, lon: 0.01, t: 10800 },
  ]);
  assert.ok(Math.abs(way.totalDistanceMeters - 1111.9) < 0.5, `${way.totalDistanceMeters}`);
  assert.equal(way.theirActiveSeconds, 10800);
  assert.deepEqual(way.moments.map((m) => m.id), ["wp-start-town", "wp-shrine", "wp-museum", "stage-end"]);
  assert.deepEqual(way.marks.map((m) => m.id), ["wp-fuente"]);
  assert.equal(way.stage.count, 3);
  assert.equal(way.stage.closing, "What did you bring that you do not need?");
});

test("a moment is written flat, the way the importer reads it", () => {
  const moment = build({ stages: passingStages() }).ways[0].moments[1];
  assert.equal(moment.id, "wp-shrine");
  assert.equal(moment.kind, "waypoint");
  assert.equal(moment.label, "Roadside Shrine");
  assert.equal(moment.icon, "building.columns");
  assert.equal(moment.sitMinutes, 5);
  assert.deepEqual(moment.pin, { lat: 0.0002, lon: 0.005 });
  // The regression this guards: Way's synthesized Codable would nest these.
  assert.equal(typeof (moment as unknown as { kind: unknown }).kind, "string");
});

test("nothing nil is written as null — the importer treats absent as absent", () => {
  const way = build({ stages: passingStages() }).ways[0];
  const text = JSON.stringify(way);
  assert.equal(text.includes("null"), false, text);
  assert.equal("tzIdentifier" in way, false, "no route's metadata carries a time zone");
  assert.equal("weather" in way, false);
  assert.equal("expires" in way, false);
});

test("the report counts moments, marks, and what was dropped", () => {
  const report = build({ stages: passingStages() }).report;
  assert.deepEqual(report.stages.map((s) => s.moments), [4, 5, 2]);
  assert.deepEqual(report.stages.map((s) => s.momentsBeyondEnds), [2, 3, 0]);
  assert.deepEqual(report.stages.map((s) => s.marks), [1, 1, 4]);
  assert.deepEqual(report.stages[1].dropped.length, 1);
  assert.deepEqual(report.stages[0].dropped.length, 1);
  assert.deepEqual(report.stages.map((s) => s.marksTrimmed), [0, 0, 0]);
  assert.equal(report.walkedLine.source, "route.main.geojson");
  assert.equal(report.walkedLine.points, 41);
});

test("the report flags coverage without gating on it", () => {
  const report = build({ stages: passingStages() }).report;
  assert.equal(report.gate.passed, true);
  // Two of three stages carry a place beyond their own ends, so not sparse.
  assert.equal(report.places.sparse, false);
  assert.equal(report.places.stagesWithMomentBeyondEnds, 2);
  assert.equal(report.places.halfOfStages, 2);
  assert.ok(Math.abs(report.places.placesPerStage - 1.7) < 0.05, `${report.places.placesPerStage}`);
});

test("the build is deterministic — the same inputs give byte-identical output", () => {
  assert.equal(
    JSON.stringify(build({ stages: passingStages() })),
    JSON.stringify(build({ stages: passingStages() })),
  );
});

test("running build-ways.ts as a CLI writes a package and a report", () => {
  // Nested inside the repo root so node can resolve the bare "tsx" loader,
  // the same reason build-index.test.ts nests its temp repo.
  const dir = mkdtempSync(join(ROOT, ".build-ways-test-"));
  try {
    mkdirSync(join(dir, "routes"), { recursive: true });
    cpSync(FIXTURE, join(dir, "routes", "fixture-way"), { recursive: true });
    cpSync(join(ROOT, "schema"), join(dir, "schema"), { recursive: true });
    cpSync(join(ROOT, "scripts"), join(dir, "scripts"), { recursive: true });
    cpSync(join(ROOT, "package.json"), join(dir, "package.json"));

    // Make the fixture's third stage honest so the package is emitted.
    const stagesPath = join(dir, "routes", "fixture-way", "stages.json");
    const stagesFile = loadJson(stagesPath);
    stagesFile.stages[2].distanceKm = 1.1;
    writeFileSync(stagesPath, JSON.stringify(stagesFile, null, 2));

    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", join(dir, "scripts", "build-ways.ts")],
      { cwd: dir, encoding: "utf-8" },
    );

    assert.match(output, /fixture-way: 3 stage\(s\), listed/);
    const waysDir = join(dir, "routes", "fixture-way", "ways");
    assert.deepEqual(readdirSync(waysDir).sort(), [
      "report.json", "route.json", "stage-00.json", "stage-01.json", "stage-02.json",
    ]);
    assert.equal(loadJson(join(waysDir, "stage-00.json")).id, "pilgrimage:fixture-way:0");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failing route leaves a report behind but no package", () => {
  const dir = mkdtempSync(join(ROOT, ".build-ways-test-"));
  try {
    mkdirSync(join(dir, "routes"), { recursive: true });
    cpSync(FIXTURE, join(dir, "routes", "fixture-way"), { recursive: true });
    cpSync(join(ROOT, "schema"), join(dir, "schema"), { recursive: true });
    cpSync(join(ROOT, "scripts"), join(dir, "scripts"), { recursive: true });
    cpSync(join(ROOT, "package.json"), join(dir, "package.json"));

    // The fixture's stage 2 is 23.6% long as committed. A coverage failure is
    // reported, not fatal — an unfinished dataset is not a broken build.
    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", join(dir, "scripts", "build-ways.ts")],
      { cwd: dir, encoding: "utf-8" },
    );

    assert.match(output, /fixture-way: no package — 1 stage\(s\) outside the gate/);
    assert.match(output, /stage 2 \("Bend to End Town"\): the walked line measures 1\.11 km against a declared 0\.9 km/);

    const waysDir = join(dir, "routes", "fixture-way", "ways");
    assert.deepEqual(readdirSync(waysDir), ["report.json"]);
    assert.equal(existsSync(join(waysDir, "route.json")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a route that loses an input file leaves no stale package behind", () => {
  const dir = mkdtempSync(join(ROOT, ".build-ways-test-"));
  try {
    mkdirSync(join(dir, "routes"), { recursive: true });
    cpSync(FIXTURE, join(dir, "routes", "fixture-way"), { recursive: true });
    cpSync(join(ROOT, "schema"), join(dir, "schema"), { recursive: true });
    cpSync(join(ROOT, "scripts"), join(dir, "scripts"), { recursive: true });
    cpSync(join(ROOT, "package.json"), join(dir, "package.json"));

    const stagesPath = join(dir, "routes", "fixture-way", "stages.json");
    const stagesFile = loadJson(stagesPath);
    stagesFile.stages[2].distanceKm = 1.1;
    writeFileSync(stagesPath, JSON.stringify(stagesFile, null, 2));

    const runBuildWays = () =>
      execFileSync(process.execPath, ["--import", "tsx", join(dir, "scripts", "build-ways.ts")], {
        cwd: dir,
        encoding: "utf-8",
      });

    runBuildWays();
    const waysDir = join(dir, "routes", "fixture-way", "ways");
    assert.deepEqual(readdirSync(waysDir).sort(), [
      "report.json", "route.json", "stage-00.json", "stage-01.json", "stage-02.json",
    ]);

    // The route loses an input between builds — a re-fetch that dropped a
    // file, say. The earlier build's package must not survive this one.
    rmSync(join(dir, "routes", "fixture-way", "waypoints.geojson"));
    runBuildWays();
    assert.equal(existsSync(waysDir), false, "a skipped route must not keep a stale package");

    execFileSync(process.execPath, ["--import", "tsx", join(dir, "scripts", "build-index.ts")], {
      cwd: dir,
      encoding: "utf-8",
    });
    const index = loadJson(join(dir, "index.json"));
    const entry = index.routes.find((r: { id: string }) => r.id === "fixture-way");
    assert.equal(entry?.ways, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
