import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  createValidator,
  validateWalkedLine,
  validateWays,
  validatePilgrimages,
  validateSectionChain,
  validatePinnedRelations,
  validateDraftedText,
  validateFile,
  type ValidationError,
} from "./validate.js";
import { SNAP_METERS } from "./ways/geo.js";

const ROOT = join(import.meta.dirname, "..");

function makeFixtureRoute(routeId = "fixture-route"): { root: string; routeDir: string; waysDir: string } {
  const root = mkdtempSync(join(tmpdir(), "validate-ways-test-"));
  const routeDir = join(root, routeId);
  const waysDir = join(routeDir, "ways");
  mkdirSync(waysDir, { recursive: true });
  writeFileSync(join(routeDir, "metadata.json"), JSON.stringify({ id: routeId }));
  return { root, routeDir, waysDir };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

interface StageOverrides {
  id?: string;
  routeId?: string;
  index?: number;
  count?: number;
  hours?: { min: number; max: number };
}

function validWay(routeId: string, index: number, count: number, overrides: StageOverrides = {}) {
  return {
    schemaVersion: "1.0.0",
    id: overrides.id ?? `pilgrimage:${routeId}:${index}`,
    title: `Stage ${index}`,
    departedAt: "2026-01-01T00:00:00Z",
    route: [
      { lat: 0, lon: 0, t: 0 },
      { lat: 0, lon: 0.01, t: 3600 },
    ],
    totalDistanceMeters: 1000,
    theirActiveSeconds: 3600,
    moments: [],
    marks: [],
    stage: {
      routeId: overrides.routeId ?? routeId,
      index: overrides.index ?? index,
      count: overrides.count ?? count,
      name: `Stage ${index}`,
      theme: "",
      narrative: "",
      closing: "",
      warnings: [],
      distanceKm: 5,
      gainMeters: 0,
      hours: overrides.hours ?? { min: 2, max: 4 },
      difficulty: "",
      start: { name: "Start", at: { lat: 0, lon: 0 } },
      end: { name: "End", at: { lat: 0, lon: 0.01 } },
    },
  };
}

function validRouteCard(routeId: string, stageCount: number, indices: number[] = []) {
  const stageIndices = indices.length > 0 ? indices : Array.from({ length: stageCount }, (_, i) => i);
  return {
    schemaVersion: "1.0.0",
    id: routeId,
    name: "Fixture Route",
    country: "ES",
    region: "Europe",
    distanceKm: 10,
    stageCount,
    tradition: "christian",
    summary: "A fixture route for validate.ts tests.",
    stages: stageIndices.map((index) => ({
      index,
      name: `Stage ${index}`,
      distanceKm: 5,
      hours: { min: 2, max: 4 },
      gainMeters: 0,
      difficulty: "",
    })),
  };
}

function validReport(routeId: string, stageCount: number) {
  return {
    schemaVersion: "1.0.0",
    routeId,
    generatedAt: "2026-01-01T00:00:00Z",
    walkedLine: { source: "route.main.geojson", points: 2, lengthKm: 1 },
    stages: Array.from({ length: stageCount }, (_, index) => ({
      index,
      name: `Stage ${index}`,
      sliceKm: 5,
      distanceKm: 5,
      ratio: 1,
      passedGate: true,
      boundaryMode: "snap",
      routePoints: 2,
      moments: 0,
      momentsBeyondEnds: 0,
      momentsWithText: 0,
      marks: 0,
      marksTrimmed: 0,
      dropped: [],
    })),
    gate: { passed: true, failing: [] },
    dropped: [],
    places: { sparse: true, stagesWithMomentBeyondEnds: 0, halfOfStages: 1, placesPerStage: 0 },
  };
}

function stageFileNameFor(index: number): string {
  return `stage-${String(index).padStart(2, "0")}.json`;
}

test("a passing two-stage package validates cleanly", () => {
  const { root, waysDir } = makeFixtureRoute();
  try {
    writeJson(join(waysDir, "route.json"), validRouteCard("fixture-route", 2));
    writeJson(join(waysDir, stageFileNameFor(0)), validWay("fixture-route", 0, 2));
    writeJson(join(waysDir, stageFileNameFor(1)), validWay("fixture-route", 1, 2));

    const ajv = createValidator();
    const errors: ValidationError[] = [];
    validateWays(ajv, join(root, "fixture-route"), errors);

    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a route with no ways/ directory is skipped without error", () => {
  const { root, routeDir } = makeFixtureRoute();
  rmSync(join(routeDir, "ways"), { recursive: true, force: true });
  try {
    const ajv = createValidator();
    const errors: ValidationError[] = [];
    validateWays(ajv, routeDir, errors);
    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stage file's id must match pilgrimage:<routeId>:<NN>", () => {
  const { root, waysDir } = makeFixtureRoute();
  try {
    writeJson(
      join(waysDir, stageFileNameFor(0)),
      validWay("fixture-route", 0, 1, { id: "pilgrimage:fixture-route:9" }),
    );

    const ajv = createValidator();
    const errors: ValidationError[] = [];
    validateWays(ajv, join(root, "fixture-route"), errors);

    assert.ok(
      errors.some((e) => e.message.includes('does not match the expected "pilgrimage:fixture-route:0"')),
      JSON.stringify(errors),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stage file's stage.routeId must match the route it ships in", () => {
  const { root, waysDir } = makeFixtureRoute();
  try {
    writeJson(join(waysDir, stageFileNameFor(0)), validWay("fixture-route", 0, 1, { routeId: "some-other-route" }));

    const ajv = createValidator();
    const errors: ValidationError[] = [];
    validateWays(ajv, join(root, "fixture-route"), errors);

    assert.ok(
      errors.some((e) => e.message.includes('stage.routeId "some-other-route" does not match route "fixture-route"')),
      JSON.stringify(errors),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stage file's stage.index must match the index encoded in its own filename", () => {
  const { root, waysDir } = makeFixtureRoute();
  try {
    // Named stage-00.json but claims to be stage 1 — the shape a copy-paste
    // or a bad cherry-pick leaves behind.
    writeJson(join(waysDir, stageFileNameFor(0)), validWay("fixture-route", 0, 2, { index: 1 }));

    const ajv = createValidator();
    const errors: ValidationError[] = [];
    validateWays(ajv, join(root, "fixture-route"), errors);

    assert.ok(
      errors.some((e) => e.message.includes("stage.index 1 does not match this file's own index 0")),
      JSON.stringify(errors),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stage's index must be less than its own count", () => {
  const { root, waysDir } = makeFixtureRoute();
  try {
    writeJson(join(waysDir, stageFileNameFor(2)), validWay("fixture-route", 2, 2));

    const ajv = createValidator();
    const errors: ValidationError[] = [];
    validateWays(ajv, join(root, "fixture-route"), errors);

    assert.ok(
      errors.some((e) => e.message.includes("stage.index 2 is not less than stage.count 2")),
      JSON.stringify(errors),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stage's hours.min must not exceed hours.max", () => {
  const { root, waysDir } = makeFixtureRoute();
  try {
    writeJson(join(waysDir, stageFileNameFor(0)), validWay("fixture-route", 0, 1, { hours: { min: 6, max: 4 } }));

    const ajv = createValidator();
    const errors: ValidationError[] = [];
    validateWays(ajv, join(root, "fixture-route"), errors);

    assert.ok(
      errors.some((e) => e.message.includes("hours.min 6 is greater than hours.max 4")),
      JSON.stringify(errors),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("route.json's stageCount must match the length of its own stages array", () => {
  const { root, waysDir } = makeFixtureRoute();
  try {
    writeJson(join(waysDir, "route.json"), validRouteCard("fixture-route", 3, [0, 1]));

    const ajv = createValidator();
    const errors: ValidationError[] = [];
    validateWays(ajv, join(root, "fixture-route"), errors);

    assert.ok(
      errors.some((e) => e.message.includes("fixture-route: stageCount=3 but the stages array has 2 entries")),
      JSON.stringify(errors),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("route.json's stage indices must be exactly 0..<stageCount", () => {
  const { root, waysDir } = makeFixtureRoute();
  try {
    writeJson(join(waysDir, "route.json"), validRouteCard("fixture-route", 2, [0, 2]));

    const ajv = createValidator();
    const errors: ValidationError[] = [];
    validateWays(ajv, join(root, "fixture-route"), errors);

    assert.ok(
      errors.some((e) => e.message.includes("are not exactly 0..<2")),
      JSON.stringify(errors),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every stage-NN.json route.json declares by count must exist on disk", () => {
  const { root, waysDir } = makeFixtureRoute();
  try {
    writeJson(join(waysDir, "route.json"), validRouteCard("fixture-route", 2));
    writeJson(join(waysDir, stageFileNameFor(0)), validWay("fixture-route", 0, 2));
    // stage-01.json is never written.

    const ajv = createValidator();
    const errors: ValidationError[] = [];
    validateWays(ajv, join(root, "fixture-route"), errors);

    assert.ok(
      errors.some(
        (e) => e.file.endsWith("stage-01.json") && e.message.includes("route.json declares stageCount=2"),
      ),
      JSON.stringify(errors),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stage file that breaks the way schema is flagged, not only cross-checked", () => {
  const { root, waysDir } = makeFixtureRoute();
  try {
    const way = validWay("fixture-route", 0, 1);
    // gainMeters is required: the app's WayStage declares it non-optional, so
    // a stage file without it would fail the decode on the phone.
    delete (way.stage as Record<string, unknown>).gainMeters;
    writeJson(join(waysDir, stageFileNameFor(0)), way);

    const ajv = createValidator();
    const errors: ValidationError[] = [];
    validateWays(ajv, join(root, "fixture-route"), errors);

    assert.ok(
      errors.some((e) => e.file.endsWith("stage-00.json") && e.message.includes("gainMeters")),
      JSON.stringify(errors),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a three-digit stage file is checked too — the schemas allow up to 200 stages", () => {
  const { root, waysDir } = makeFixtureRoute();
  try {
    // Named stage-100.json but claiming to be stage 99. Only a filter that
    // matches three digits, and reads the index back out of the name, sees it.
    writeJson(join(waysDir, "stage-100.json"), validWay("fixture-route", 100, 200, { index: 99 }));

    const ajv = createValidator();
    const errors: ValidationError[] = [];
    validateWays(ajv, join(root, "fixture-route"), errors);

    assert.ok(
      errors.some((e) => e.message.includes("stage.index 99 does not match this file's own index 100")),
      JSON.stringify(errors),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("report.json is checked as a report, never run through the stage schema", () => {
  const { root, waysDir } = makeFixtureRoute();
  try {
    // A report is a valid report and an invalid Way. A filename filter that
    // let it through to way.schema.json would bury the run in false errors.
    writeJson(join(waysDir, "report.json"), validReport("fixture-route", 1));
    writeJson(join(waysDir, "route.json"), validRouteCard("fixture-route", 1));
    writeJson(join(waysDir, stageFileNameFor(0)), validWay("fixture-route", 0, 1));

    const ajv = createValidator();
    const errors: ValidationError[] = [];
    validateWays(ajv, join(root, "fixture-route"), errors);

    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Two vertices 0.01° apart at the equator, ~1,112 m of walked line. */
function walkedLineFile(routeId: string) {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: `${routeId}-main-line`,
        geometry: { type: "LineString", coordinates: [[0, 0], [0.01, 0]] },
        properties: { routeId, type: "main" },
      },
    ],
  };
}

function stagesFile(routeId: string, endCoordinates: number[]) {
  return {
    schemaVersion: "1.0.0",
    routeId,
    stageCount: 1,
    stages: [
      {
        index: 0,
        name: { en: "Start to End" },
        start: { name: { en: "Start" }, coordinates: [0, 0] },
        end: { name: { en: "End" }, coordinates: endCoordinates },
        distanceKm: 1.1,
      },
    ],
  };
}

test("an anchor still on the walked line raises nothing", () => {
  const { root, routeDir } = makeFixtureRoute();
  try {
    writeJson(join(routeDir, "route.main.geojson"), walkedLineFile("fixture-route"));
    writeJson(join(routeDir, "stages.json"), stagesFile("fixture-route", [0.01, 0]));

    const errors: ValidationError[] = [];
    validateWalkedLine(routeDir, errors);

    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an anchor moved off the walked line is caught, with the route, the stage and the distance", () => {
  const { root, routeDir } = makeFixtureRoute();
  try {
    writeJson(join(routeDir, "route.main.geojson"), walkedLineFile("fixture-route"));
    // The end anchor edited a kilometre north, with no rebuild of the line —
    // both files stay valid on their own, and the drift check cannot see it
    // because the build rebuilds happily from the stale line.
    writeJson(join(routeDir, "stages.json"), stagesFile("fixture-route", [0.01, 0.009]));

    const errors: ValidationError[] = [];
    validateWalkedLine(routeDir, errors);

    assert.equal(errors.length, 1);
    assert.equal(errors[0].severity, "error");
    assert.ok(errors[0].file.endsWith("route.main.geojson"), errors[0].file);
    assert.match(errors[0].message, /fixture-route: stage 0 \("Start to End"\) end is \d+ m/);
    assert.match(errors[0].message, new RegExp(`past the ${SNAP_METERS} m`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a route still cutting from route.geojson has no walked line to be stale against", () => {
  const { root, routeDir } = makeFixtureRoute();
  try {
    writeJson(join(routeDir, "stages.json"), stagesFile("fixture-route", [9, 9]));

    const errors: ValidationError[] = [];
    validateWalkedLine(routeDir, errors);

    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed Camino Francés package passes every cross-check", () => {
  const ajv = createValidator();
  const errors: ValidationError[] = [];
  validateWays(ajv, join(ROOT, "routes", "camino-frances"), errors);
  assert.deepEqual(errors, []);
});

test("the committed Camino Francés walked line still reaches every one of its anchors", () => {
  const errors: ValidationError[] = [];
  validateWalkedLine(join(ROOT, "routes", "camino-frances"), errors);
  assert.deepEqual(errors, []);
});

test("a shipped ways/ package with only an osm.query is refused", () => {
  const { root, routeDir, waysDir } = makeFixtureRoute();
  try {
    writeJson(join(routeDir, "metadata.json"), { id: "fixture-route", osm: { query: 'relation["name"~"x"]' } });
    writeJson(join(waysDir, "route.json"), validRouteCard("fixture-route", 1));

    const errors: ValidationError[] = [];
    validatePinnedRelations(root, [routeDir], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /fixture-route/);
    assert.match(errors[0].message, /osm\.relations/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a shipped ways/ package with pinned relations raises nothing", () => {
  const { root, routeDir, waysDir } = makeFixtureRoute();
  try {
    writeJson(join(routeDir, "metadata.json"), { id: "fixture-route", osm: { relations: [123] } });
    writeJson(join(waysDir, "route.json"), validRouteCard("fixture-route", 1));

    const errors: ValidationError[] = [];
    validatePinnedRelations(root, [routeDir], errors);

    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a route whose ways/ holds only a report.json is not asked to pin relations", () => {
  const { root, routeDir, waysDir } = makeFixtureRoute();
  try {
    // The shape a refused route leaves behind — shikoku-88 and kumano-kodo
    // both look like this today, with no osm.relations pinned either.
    writeJson(join(waysDir, "report.json"), validReport("fixture-route", 0));

    const errors: ValidationError[] = [];
    validatePinnedRelations(root, [routeDir], errors);

    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sections of one pilgrimage may not disagree on kind", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-pilgrimage-test-"));
  try {
    const a = join(root, "routes", "one");
    const b = join(root, "routes", "two");
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    const block = { id: "kumano-kodo", name: { en: "Kumano Kodō" }, order: 1 };
    writeJson(join(a, "metadata.json"), { id: "one", pilgrimage: { ...block, kind: "legs" } });
    writeJson(join(b, "metadata.json"), { id: "two", pilgrimage: { ...block, kind: "alternatives", order: 2 } });

    const errors: ValidationError[] = [];
    validatePilgrimages(root, [a, b], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /kumano-kodo/);
    assert.match(errors[0].message, /kind/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("two sections may not claim the same order in one pilgrimage", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-pilgrimage-test-"));
  try {
    const a = join(root, "routes", "one");
    const b = join(root, "routes", "two");
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    const block = { id: "kumano-kodo", name: { en: "Kumano Kodō" }, kind: "alternatives", order: 1 };
    writeJson(join(a, "metadata.json"), { id: "one", pilgrimage: block });
    writeJson(join(b, "metadata.json"), { id: "two", pilgrimage: block });

    const errors: ValidationError[] = [];
    validatePilgrimages(root, [a, b], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /order 1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a route with no pilgrimage block raises nothing", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-pilgrimage-test-"));
  try {
    const a = join(root, "routes", "one");
    mkdirSync(a, { recursive: true });
    writeJson(join(a, "metadata.json"), { id: "one" });
    const errors: ValidationError[] = [];
    validatePilgrimages(root, [a], errors);
    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pilgrimage id may not shadow a reserved page name", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-pilgrimage-test-"));
  try {
    // #given a pilgrimage whose id names one of the hand-authored site pages
    const a = join(root, "routes", "one");
    mkdirSync(a, { recursive: true });
    writeJson(join(a, "metadata.json"), {
      id: "one",
      pilgrimage: { id: "routes", name: { en: "Routes" }, kind: "alternatives", order: 1 },
    });

    // #when validate reads the pilgrimage blocks, before build-assets writes
    const errors: ValidationError[] = [];
    validatePilgrimages(root, [a], errors);

    // #then the collision is reported here, not after the page is overwritten
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /"routes"/);
    assert.match(errors[0].message, /reserved/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pilgrimage id may not also be a route id", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-pilgrimage-test-"));
  try {
    // #given a pilgrimage and a route claiming the same page under docs/
    const a = join(root, "routes", "one");
    const b = join(root, "routes", "kumano-kodo");
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    writeJson(join(a, "metadata.json"), {
      id: "one",
      pilgrimage: { id: "kumano-kodo", name: { en: "Kumano Kodō" }, kind: "alternatives", order: 1 },
    });
    writeJson(join(b, "metadata.json"), { id: "kumano-kodo" });

    // #when / #then the double claim is reported, naming the id
    const errors: ValidationError[] = [];
    validatePilgrimages(root, [a, b], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /kumano-kodo/);
    assert.match(errors[0].message, /claimed twice/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * The real Camino Francés metadata, so the schema's eight other required
 * root fields are satisfied by data the repo already validates and these
 * two tests can say something about the pilgrimage and osm blocks alone.
 */
function metadataFixture(extra: Record<string, unknown>): Record<string, unknown> {
  const base = JSON.parse(
    readFileSync(join(ROOT, "routes", "camino-frances", "metadata.json"), "utf-8"),
  ) as Record<string, unknown>;
  return { ...base, ...extra };
}

test("the schema accepts a well-formed pilgrimage block and pinned relations", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-schema-test-"));
  try {
    const path = join(root, "metadata.json");
    writeJson(
      path,
      metadataFixture({
        pilgrimage: { id: "camino-de-santiago", name: { en: "Camino de Santiago" }, kind: "alternatives", order: 1 },
        osm: { relations: [2163569] },
      }),
    );

    const errors: ValidationError[] = [];
    validateFile(createValidator(), "pilgrimage.schema.json", path, errors);

    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the schema refuses a third kind and an osm.relations that pins nothing", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-schema-test-"));
  try {
    const kindPath = join(root, "kind.json");
    writeJson(
      kindPath,
      metadataFixture({
        pilgrimage: { id: "camino-de-santiago", name: { en: "Camino de Santiago" }, kind: "chain", order: 1 },
      }),
    );
    const emptyPath = join(root, "empty.json");
    writeJson(emptyPath, metadataFixture({ osm: { relations: [] } }));

    const ajv = createValidator();
    const kindErrors: ValidationError[] = [];
    const relationErrors: ValidationError[] = [];
    validateFile(ajv, "pilgrimage.schema.json", kindPath, kindErrors);
    validateFile(ajv, "pilgrimage.schema.json", emptyPath, relationErrors);

    // readPilgrimage refuses both; the schema has to refuse them too, or one
    // of the two gates would let a file through the other stops.
    assert.ok(kindErrors.length > 0, `"chain" is not one of the two kinds`);
    assert.ok(relationErrors.length > 0, "an empty relations array pins nothing");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function sectionWithStages(root: string, id: string, block: object, stages: object[], topology = "linear") {
  const dir = join(root, "routes", id);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, "metadata.json"), { id, overview: { topology }, pilgrimage: block });
  writeJson(join(dir, "stages.json"), { schemaVersion: "1.0.0", routeId: id, stageCount: stages.length, stages });
  return dir;
}

const legs = (order: number) => ({ id: "shikoku-88", name: { en: "Shikoku" }, kind: "legs", order });
const closedLegs = (order: number) => ({ ...legs(order), circular: true });

test("a gap between two legs sections is an error naming both", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    const a = sectionWithStages(root, "awa", legs(1), [
      { index: 0, name: "d1", start: { name: { en: "T1" }, coordinates: [0, 0] }, end: { name: { en: "T23" }, coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    const b = sectionWithStages(root, "tosa", legs(2), [
      { index: 0, name: "d1", start: { name: { en: "T24" }, coordinates: [0.5, 0] }, end: { name: { en: "T39" }, coordinates: [0.6, 0] }, distanceKm: 11 },
    ]);

    const errors: ValidationError[] = [];
    validateSectionChain(root, [a, b], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /awa/);
    assert.match(errors[0].message, /tosa/);
    // Section ids alone would still pass if the interpolated names silently
    // rendered as "undefined" — these pin the actual place names too.
    assert.match(errors[0].message, /"T23"/);
    assert.match(errors[0].message, /"T24"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sections that meet within the snap distance chain cleanly", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    const a = sectionWithStages(root, "awa", legs(1), [
      { index: 0, name: "d1", start: { name: { en: "T1" }, coordinates: [0, 0] }, end: { name: { en: "T23" }, coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    const b = sectionWithStages(root, "tosa", legs(2), [
      { index: 0, name: "d1", start: { name: { en: "T23" }, coordinates: [0.1, 0] }, end: { name: { en: "T39" }, coordinates: [0.2, 0] }, distanceKm: 11 },
    ]);
    const errors: ValidationError[] = [];
    validateSectionChain(root, [a, b], errors);
    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a circular pilgrimage must close back to its first start", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    // #given the honest Shikoku shape: Awa runs Temple 1 to 23 and does not
    // return, so each section is linear and only the circuit is circular
    const a = sectionWithStages(root, "awa", closedLegs(1), [
      { index: 0, name: "d1", start: { name: { en: "T1" }, coordinates: [0, 0] }, end: { name: { en: "T23" }, coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    const b = sectionWithStages(root, "sanuki", closedLegs(2), [
      { index: 0, name: "d1", start: { name: { en: "T23" }, coordinates: [0.1, 0] }, end: { name: { en: "T88" }, coordinates: [0.2, 0] }, distanceKm: 11 },
    ]);

    const errors: ValidationError[] = [];
    validateSectionChain(root, [a, b], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /circuit/);
    // Same guard as the gap test: the circuit-closing message interpolates
    // both endpoint names, and "undefined" would still match /circuit/.
    assert.match(errors[0].message, /"T88"/);
    assert.match(errors[0].message, /"T1"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("alternatives sections are exempt from chaining", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    const block = (order: number) => ({ id: "camino-de-santiago", name: { en: "Camino" }, kind: "alternatives", order });
    const a = sectionWithStages(root, "frances", block(1), [
      { index: 0, name: "d1", start: { name: { en: "SJPP" }, coordinates: [0, 0] }, end: { name: { en: "Zubiri" }, coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    const b = sectionWithStages(root, "norte", block(2), [
      { index: 0, name: "d1", start: { name: { en: "Irún" }, coordinates: [9, 9] }, end: { name: { en: "San Sebastián" }, coordinates: [9.1, 9] }, distanceKm: 11 },
    ]);
    const errors: ValidationError[] = [];
    validateSectionChain(root, [a, b], errors);
    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a malformed pilgrimage block does not silence the gap check for the rest", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    const a = sectionWithStages(root, "awa", legs(1), [
      { index: 0, name: "d1", start: { name: { en: "T1" }, coordinates: [0, 0] }, end: { name: { en: "T23" }, coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    // "loop" is outside readPilgrimage's two allowed kinds, so it throws here.
    // validatePilgrimages is what reports that block; this run must still
    // reach and report the real gap between the other two sections.
    const malformed = sectionWithStages(
      root,
      "middle",
      { id: "shikoku-88", name: { en: "Shikoku" }, kind: "loop", order: 2 },
      [{ index: 0, name: "d1", start: { name: { en: "M1" }, coordinates: [5, 5] }, end: { name: { en: "M2" }, coordinates: [5.1, 5] }, distanceKm: 11 }],
    );
    const c = sectionWithStages(root, "tosa", legs(3), [
      { index: 0, name: "d1", start: { name: { en: "T24" }, coordinates: [0.5, 0] }, end: { name: { en: "T39" }, coordinates: [0.6, 0] }, distanceKm: 11 },
    ]);

    const errors: ValidationError[] = [];
    validateSectionChain(root, [a, malformed, c], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /awa/);
    assert.match(errors[0].message, /tosa/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a legs section with no stages.json and no deferral is named, not skipped", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    // #given Iyo sits between Tosa and Sanuki with no stages.json and no
    // index.json deferring it — a broken tree, not a planned wait
    const tosa = sectionWithStages(root, "tosa", legs(1), [
      { index: 0, name: "d1", start: { name: { en: "T24" }, coordinates: [0, 0] }, end: { name: { en: "Kiyotaki-ji" }, coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    const iyo = join(root, "routes", "iyo");
    mkdirSync(iyo, { recursive: true });
    writeJson(join(iyo, "metadata.json"), { id: "iyo", overview: { topology: "linear" }, pilgrimage: legs(2) });
    const sanuki = sectionWithStages(root, "sanuki", legs(3), [
      { index: 0, name: "d1", start: { name: { en: "Ōkubo-ji" }, coordinates: [3, 0] }, end: { name: { en: "T88" }, coordinates: [3.1, 0] }, distanceKm: 11 },
    ]);

    // #when the chain is checked
    const errors: ValidationError[] = [];
    validateSectionChain(root, [tosa, iyo, sanuki], errors);

    // #then the missing file is named, and no gap is invented between two
    // sections that were never adjacent
    assert.equal(errors.length, 1);
    assert.match(errors[0].file, /iyo[/\\]stages\.json/);
    assert.match(errors[0].message, /iyo/);
    assert.doesNotMatch(errors[0].message, /Kiyotaki-ji/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an alternatives section with no stages.json is not an error", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    // #given only legs sections chain, so a package-less alternative owes
    // the chain nothing
    const dir = join(root, "routes", "ohechi");
    mkdirSync(dir, { recursive: true });
    writeJson(join(dir, "metadata.json"), {
      id: "ohechi",
      overview: { topology: "linear" },
      pilgrimage: { id: "kumano-kodo", name: { en: "Kumano Kodō" }, kind: "alternatives", order: 1 },
    });

    const errors: ValidationError[] = [];
    validateSectionChain(root, [dir], errors);

    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a section whose stages array is empty is a named error, not a crash", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    // #given a newly cut section committed with no stages yet, between two
    // sections that do chain
    const a = sectionWithStages(root, "awa", legs(1), [
      { index: 0, name: "d1", start: { name: { en: "T1" }, coordinates: [0, 0] }, end: { name: { en: "T23" }, coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    const empty = sectionWithStages(root, "iyo", legs(2), []);
    const c = sectionWithStages(root, "sanuki", legs(3), [
      { index: 0, name: "d1", start: { name: { en: "T66" }, coordinates: [0.5, 0] }, end: { name: { en: "T88" }, coordinates: [0.6, 0] }, distanceKm: 11 },
    ]);

    // #when the chain is checked
    const errors: ValidationError[] = [];
    validateSectionChain(root, [a, empty, c], errors);

    // #then the section with nothing to chain is named, and no gap is
    // fabricated between the two sections it sits between
    assert.equal(errors.length, 1);
    assert.match(errors[0].file, /iyo[/\\]stages\.json/);
    assert.match(errors[0].message, /iyo/);
    assert.doesNotMatch(errors[0].message, /m away/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stages.json with no stages array at all is the same named error", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    // #given a stages.json that already failed its schema — main() collects
    // errors rather than exiting, so it still reaches the chain check
    const dir = sectionWithStages(root, "iyo", legs(1), []);
    writeJson(join(dir, "stages.json"), { schemaVersion: "1.0.0", routeId: "iyo" });

    const errors: ValidationError[] = [];
    validateSectionChain(root, [dir], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].file, /iyo[/\\]stages\.json/);
    assert.match(errors[0].message, /iyo/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a drafted stage cannot reach main", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    const dir = join(root, "routes", "one");
    mkdirSync(dir, { recursive: true });
    writeJson(join(dir, "metadata.json"), { id: "one" });
    writeJson(join(dir, "stages.json"), {
      stages: [{ index: 0, name: "d1", drafted: true }, { index: 1, name: "d2" }],
    });

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    assert.ok(
      errors.some((e) => /stage 0/.test(e.message) && /drafted/.test(e.message)),
      JSON.stringify(errors),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("clearing a flag without a reviewed mark is refused", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    const dir = join(root, "routes", "one");
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(root, "docs", "review"), { recursive: true });
    writeJson(join(dir, "metadata.json"), { id: "one" });
    writeJson(join(dir, "stages.json"), { stages: [{ index: 0, name: "d1" }, { index: 1, name: "d2" }] });
    writeFileSync(join(root, "docs", "review", "one.md"), "# one\n\n- [x] stage 0 — reviewed\n- [ ] stage 1\n");

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /stage 1/);
    assert.match(errors[0].message, /docs\/review\/one\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a section with no checklist and no drafted flags is clean", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    const dir = join(root, "routes", "one");
    mkdirSync(dir, { recursive: true });
    writeJson(join(dir, "metadata.json"), { id: "one" });
    writeJson(join(dir, "stages.json"), { stages: [{ index: 0, name: "d1" }] });
    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);
    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a tick quoted only inside a fenced block does not count as a review", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    const dir = join(root, "routes", "one");
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(root, "docs", "review"), { recursive: true });
    writeJson(join(dir, "metadata.json"), { id: "one" });
    writeJson(join(dir, "stages.json"), { stages: [{ index: 0, name: "d1" }] });
    writeFileSync(
      join(root, "docs", "review", "one.md"),
      "# one\n\n- [ ] stage 0\n\nDrafted text for stage 0, quoted verbatim per spec:\n\n```\n- [x] stage 0\n```\n",
    );

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /stage 0/);
    assert.match(errors[0].message, /unticked/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a top-level tick still counts alongside a fenced block quoting other checklist lines", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    const dir = join(root, "routes", "one");
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(root, "docs", "review"), { recursive: true });
    writeJson(join(dir, "metadata.json"), { id: "one" });
    writeJson(join(dir, "stages.json"), { stages: [{ index: 0, name: "d1" }] });
    writeFileSync(
      join(root, "docs", "review", "one.md"),
      "# one\n\n- [x] stage 0 — reviewed\n\n```\n- [ ] stage 0\n- [x] stage 1\n```\n",
    );

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a blockquoted tick does not count as a review", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    const dir = join(root, "routes", "one");
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(root, "docs", "review"), { recursive: true });
    writeJson(join(dir, "metadata.json"), { id: "one" });
    writeJson(join(dir, "stages.json"), { stages: [{ index: 0, name: "d1" }] });
    writeFileSync(join(root, "docs", "review", "one.md"), "# one\n\n- [ ] stage 0\n\n> - [x] stage 0\n");

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /stage 0/);
    assert.match(errors[0].message, /unticked/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const KOHECHI = { id: "kumano-kodo", name: { en: "Kumano Kodō" }, kind: "alternatives", order: 2 };

function draftedSection(
  root: string,
  id: string,
  stages: object[],
  pilgrimage?: object,
): string {
  const dir = join(root, "routes", id);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, "metadata.json"), pilgrimage ? { id, pilgrimage } : { id });
  writeJson(join(dir, "stages.json"), { stages });
  return dir;
}

function writeChecklist(root: string, name: string, body: string): void {
  mkdirSync(join(root, "docs", "review"), { recursive: true });
  writeFileSync(join(root, "docs", "review", `${name}.md`), body);
}

test("a section falls back to its pilgrimage's checklist", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    // #given a section whose PR scoped its review to the whole pilgrimage
    const dir = draftedSection(root, "kumano-kodo-kohechi", [{ index: 0, name: "d1" }], KOHECHI);
    writeChecklist(root, "kumano-kodo", "# Kumano Kodō\n\n- [ ] kumano-kodo-kohechi stage 0\n");

    // #when the gate runs
    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    // #then it reads the pilgrimage-level file and names it
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /stage 0/);
    assert.match(errors[0].message, /docs\/review\/kumano-kodo\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unqualified line in a pilgrimage-level checklist clears nothing", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    // #given four sections share one file, so a bare "stage 0" names no one
    const dir = draftedSection(root, "kumano-kodo-kohechi", [{ index: 0, name: "d1" }], KOHECHI);
    writeChecklist(
      root,
      "kumano-kodo",
      "# Kumano Kodō\n\n- [x] stage 0\n- [ ] kumano-kodo-kohechi stage 0\n",
    );

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    // #then the unqualified tick does not satisfy the qualified line, and the
    // stray bare line is itself named as needing the section id
    assert.equal(errors.length, 2);
    assert.match(errors[0].message, /stage 0/);
    assert.match(errors[0].message, /unticked/);
    assert.match(errors[1].message, /stage 0/);
    assert.match(errors[1].message, /kumano-kodo-kohechi stage 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unqualified line in a pilgrimage-level checklist is reported", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    // #given a shared file written with the per-section form instead of the
    // section-qualified one that files
    const dir = draftedSection(root, "kumano-kodo-kohechi", [{ index: 0, name: "d1" }], KOHECHI);
    writeChecklist(root, "kumano-kodo", "# Kumano Kodō\n\n- [ ] stage 0\n");

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    // #then the bare line is named as needing its section id, with the
    // qualified form shown
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /stage 0/);
    assert.match(errors[0].message, /kumano-kodo-kohechi stage 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a qualified tick clears its own section and no other", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    // #given two sections of one pilgrimage, each with a stage 0
    const kohechi = draftedSection(root, "kumano-kodo-kohechi", [{ index: 0, name: "d1" }], KOHECHI);
    const iseji = draftedSection(root, "kumano-kodo-iseji", [{ index: 0, name: "d1" }], {
      ...KOHECHI,
      order: 3,
    });
    writeChecklist(
      root,
      "kumano-kodo",
      "# Kumano Kodō\n\n- [x] kumano-kodo-kohechi stage 0\n- [ ] kumano-kodo-iseji stage 0\n",
    );

    const errors: ValidationError[] = [];
    validateDraftedText(root, [kohechi, iseji], errors);

    // #then only the unticked section is reported
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /kumano-kodo-iseji/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a section's own checklist is preferred over its pilgrimage's", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    // #given both files exist and disagree about stage 0
    const dir = draftedSection(root, "camino-norte", [{ index: 0, name: "d1" }], {
      id: "camino-de-santiago",
      name: { en: "Camino de Santiago" },
      kind: "alternatives",
      order: 2,
    });
    writeChecklist(root, "camino-norte", "# Norte\n\n- [x] stage 0 — reviewed\n");
    writeChecklist(root, "camino-de-santiago", "# Camino\n\n- [ ] camino-norte stage 0\n");

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    // #then the section-scoped file is the one that counts
    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a qualified line in a per-section checklist is not the form that file uses", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    // #given a per-section file whose only line carries a redundant qualifier
    const dir = draftedSection(root, "camino-norte", [{ index: 0, name: "d1" }]);
    writeChecklist(root, "camino-norte", "# Norte\n\n- [ ] camino-norte stage 0\n");

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    // #then the stage reads as unlisted: the bare form is this file's form, so
    // a line in the other one records no review of anything
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /stage 0/);
    assert.match(errors[0].message, /not listed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a metadata.json that is not JSON names its file and leaves the pilgrimage check running", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-parse-test-"));
  try {
    // #given one contributor's syntax error alongside two sections that
    // genuinely disagree
    const broken = join(root, "routes", "broken");
    mkdirSync(broken, { recursive: true });
    writeFileSync(join(broken, "metadata.json"), '{ "id": "broken",\n');
    const block = { id: "kumano-kodo", name: { en: "Kumano Kodō" }, order: 1 };
    const a = join(root, "routes", "one");
    const b = join(root, "routes", "two");
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    writeJson(join(a, "metadata.json"), { id: "one", pilgrimage: { ...block, kind: "legs" } });
    writeJson(join(b, "metadata.json"), { id: "two", pilgrimage: { ...block, kind: "alternatives", order: 2 } });

    // #when the pilgrimages are checked
    const errors: ValidationError[] = [];
    validatePilgrimages(root, [broken, a, b], errors);

    // #then the unreadable file is named, and the conflict behind it is still
    // reported rather than discarded with the run
    assert.ok(
      errors.some((e) => e.file.includes("broken") && /JSON/i.test(e.message)),
      JSON.stringify(errors),
    );
    assert.ok(errors.some((e) => /conflicting kind/.test(e.message)), JSON.stringify(errors));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a metadata.json that is not JSON does not kill the chain check", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-parse-test-"));
  try {
    const a = sectionWithStages(root, "awa", legs(1), [
      { index: 0, name: "d1", start: { name: { en: "T1" }, coordinates: [0, 0] }, end: { name: { en: "T23" }, coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    const broken = join(root, "routes", "broken");
    mkdirSync(broken, { recursive: true });
    writeFileSync(join(broken, "metadata.json"), "not json at all");
    const c = sectionWithStages(root, "tosa", legs(3), [
      { index: 0, name: "d1", start: { name: { en: "T24" }, coordinates: [0.5, 0] }, end: { name: { en: "T39" }, coordinates: [0.6, 0] }, distanceKm: 11 },
    ]);

    const errors: ValidationError[] = [];
    validateSectionChain(root, [a, broken, c], errors);

    assert.ok(
      errors.some((e) => e.file.includes("broken") && /JSON/i.test(e.message)),
      JSON.stringify(errors),
    );
    assert.ok(errors.some((e) => /awa/.test(e.message) && /tosa/.test(e.message)), JSON.stringify(errors));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stages.json that is not JSON is named by the chain check, and bridges nothing", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-parse-test-"));
  try {
    const a = sectionWithStages(root, "awa", legs(1), [
      { index: 0, name: "d1", start: { name: { en: "T1" }, coordinates: [0, 0] }, end: { name: { en: "T23" }, coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    const iyo = sectionWithStages(root, "iyo", legs(2), []);
    writeFileSync(join(iyo, "stages.json"), '{ "stages": [ }');
    const c = sectionWithStages(root, "sanuki", legs(3), [
      { index: 0, name: "d1", start: { name: { en: "T66" }, coordinates: [0.5, 0] }, end: { name: { en: "T88" }, coordinates: [0.6, 0] }, distanceKm: 11 },
    ]);

    const errors: ValidationError[] = [];
    validateSectionChain(root, [a, iyo, c], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].file, /iyo[/\\]stages\.json/);
    assert.match(errors[0].message, /JSON/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a metadata.json that is not JSON does not kill the pinned-relations check", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-parse-test-"));
  try {
    const dir = join(root, "routes", "broken");
    mkdirSync(join(dir, "ways"), { recursive: true });
    writeFileSync(join(dir, "metadata.json"), '{ "id": ');
    writeJson(join(dir, "ways", "route.json"), validRouteCard("broken", 1));

    const errors: ValidationError[] = [];
    validatePinnedRelations(root, [dir], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].file, /broken[/\\]metadata\.json/);
    assert.match(errors[0].message, /JSON/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stages.json that is not JSON does not kill the drafted-text gate", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-parse-test-"));
  try {
    const dir = join(root, "routes", "one");
    mkdirSync(dir, { recursive: true });
    writeJson(join(dir, "metadata.json"), { id: "one" });
    writeFileSync(join(dir, "stages.json"), "{ oops }");

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].file, /one[/\\]stages\.json/);
    assert.match(errors[0].message, /JSON/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stage with no end anchor is a named error, not a TypeError", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    // #given a stages.json that already failed its schema — main() collects
    // errors rather than exiting, so the half-written stage still arrives here
    const a = sectionWithStages(root, "awa", legs(1), [
      { index: 0, name: "d1", start: { name: { en: "T1" }, coordinates: [0, 0] }, end: { name: { en: "T23" }, coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    const iyo = sectionWithStages(root, "iyo", legs(2), [
      { index: 0, name: "d1", start: { name: { en: "T40" }, coordinates: [0.2, 0] }, distanceKm: 11 },
    ]);
    const c = sectionWithStages(root, "sanuki", legs(3), [
      { index: 0, name: "d1", start: { name: { en: "T66" }, coordinates: [0.5, 0] }, end: { name: { en: "T88" }, coordinates: [0.6, 0] }, distanceKm: 11 },
    ]);

    // #when the chain is checked
    const errors: ValidationError[] = [];
    validateSectionChain(root, [a, iyo, c], errors);

    // #then the anchorless stage is named, and no gap is fabricated across it
    assert.equal(errors.length, 1);
    assert.match(errors[0].file, /iyo[/\\]stages\.json/);
    assert.match(errors[0].message, /iyo/);
    assert.match(errors[0].message, /stage 0/);
    assert.doesNotMatch(errors[0].message, /m away/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an anchor with coordinates but no name is a named error too", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    // #given the message the chain would print interpolates both place names,
    // so an anchor with no name.en has nothing to report a gap with
    const a = sectionWithStages(root, "awa", legs(1), [
      { index: 0, name: "d1", start: { name: { en: "T1" }, coordinates: [0, 0] }, end: { coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    const b = sectionWithStages(root, "tosa", legs(2), [
      { index: 0, name: "d1", start: { name: { en: "T24" }, coordinates: [0.5, 0] }, end: { name: { en: "T39" }, coordinates: [0.6, 0] }, distanceKm: 11 },
    ]);

    const errors: ValidationError[] = [];
    validateSectionChain(root, [a, b], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].file, /awa[/\\]stages\.json/);
    assert.match(errors[0].message, /stage 0/);
    assert.doesNotMatch(errors[0].message, /undefined/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a legs section deferred to a later release warns, and breaks the chain there", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    // #given Iyo's way graph could not be closed, so per the design it ships
    // metadata-only and index.json carries no ways block for it
    const tosa = sectionWithStages(root, "tosa", legs(1), [
      { index: 0, name: "d1", start: { name: { en: "T24" }, coordinates: [0, 0] }, end: { name: { en: "Kiyotaki-ji" }, coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    const iyo = join(root, "routes", "iyo");
    mkdirSync(iyo, { recursive: true });
    writeJson(join(iyo, "metadata.json"), { id: "iyo", pilgrimage: legs(2) });
    const sanuki = sectionWithStages(root, "sanuki", legs(3), [
      { index: 0, name: "d1", start: { name: { en: "Ōkubo-ji" }, coordinates: [3, 0] }, end: { name: { en: "T88" }, coordinates: [3.1, 0] }, distanceKm: 11 },
    ]);
    writeJson(join(root, "index.json"), {
      routes: [{ id: "tosa" }, { id: "iyo" }, { id: "sanuki" }],
    });

    // #when the chain is checked
    const errors: ValidationError[] = [];
    validateSectionChain(root, [tosa, iyo, sanuki], errors);

    // #then the release is not held for it — one warning, no error — and the
    // chain breaks there rather than measuring a gap nobody's data claims
    assert.equal(errors.length, 1);
    assert.equal(errors[0].severity, "warning");
    assert.match(errors[0].message, /iyo/);
    assert.doesNotMatch(errors[0].message, /Kiyotaki-ji/);
    assert.doesNotMatch(errors[0].message, /m away/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a legs section with a shipped package but no stages.json is still a hard error", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    // #given index.json says Iyo shipped a package, so its missing stages.json
    // is a broken tree rather than a deferral
    const tosa = sectionWithStages(root, "tosa", legs(1), [
      { index: 0, name: "d1", start: { name: { en: "T24" }, coordinates: [0, 0] }, end: { name: { en: "Kiyotaki-ji" }, coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    const iyo = join(root, "routes", "iyo");
    mkdirSync(iyo, { recursive: true });
    writeJson(join(iyo, "metadata.json"), { id: "iyo", pilgrimage: legs(2) });
    writeJson(join(root, "index.json"), {
      routes: [{ id: "tosa" }, { id: "iyo", ways: { stageCount: 4, bytes: 100, placesPerStage: 1, sparse: false } }],
    });

    const errors: ValidationError[] = [];
    validateSectionChain(root, [tosa, iyo], errors);

    assert.equal(errors.length, 1);
    assert.equal(errors[0].severity, "error");
    assert.match(errors[0].file, /iyo[/\\]stages\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sections of one pilgrimage may not disagree on name", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-pilgrimage-test-"));
  try {
    // #given two sections whose hand-copied name blocks drifted in one locale
    const a = join(root, "routes", "one");
    const b = join(root, "routes", "two");
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    const block = { id: "kumano-kodo", kind: "alternatives", order: 1 };
    writeJson(join(a, "metadata.json"), {
      id: "one",
      pilgrimage: { ...block, name: { en: "Kumano Kodō", ja: "熊野古道" } },
    });
    writeJson(join(b, "metadata.json"), {
      id: "two",
      pilgrimage: { ...block, order: 2, name: { en: "Kumano Kodō", ja: "クマノコドウ" } },
    });

    const errors: ValidationError[] = [];
    validatePilgrimages(root, [a, b], errors);

    // #then the locale that actually disagrees is the one named
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /kumano-kodo/);
    assert.match(errors[0].message, /name\.ja/);
    assert.match(errors[0].message, /熊野古道/);
    assert.match(errors[0].message, /クマノコドウ/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a locale one section leaves out is a conflict too", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-pilgrimage-test-"));
  try {
    // #given build-index derives the pilgrimage entry from whichever section
    // it reads first, so a missing locale is a silent difference
    const a = join(root, "routes", "one");
    const b = join(root, "routes", "two");
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    const block = { id: "kumano-kodo", kind: "alternatives", order: 1 };
    writeJson(join(a, "metadata.json"), {
      id: "one",
      pilgrimage: { ...block, name: { en: "Kumano Kodō", ja: "熊野古道" } },
    });
    writeJson(join(b, "metadata.json"), { id: "two", pilgrimage: { ...block, order: 2, name: { en: "Kumano Kodō" } } });

    const errors: ValidationError[] = [];
    validatePilgrimages(root, [a, b], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /name\.ja/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("identical names written in different key orders do not read as conflicting", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-pilgrimage-test-"));
  try {
    // #given the same name block hand-copied into two metadata.json files,
    // with the locales typed in a different order
    const a = join(root, "routes", "one");
    const b = join(root, "routes", "two");
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    const block = { id: "kumano-kodo", kind: "alternatives", order: 1 };
    writeJson(join(a, "metadata.json"), {
      id: "one",
      pilgrimage: { ...block, name: { en: "Kumano Kodō", ja: "熊野古道" } },
    });
    writeJson(join(b, "metadata.json"), {
      id: "two",
      pilgrimage: { ...block, order: 2, name: { ja: "熊野古道", en: "Kumano Kodō" } },
    });

    const errors: ValidationError[] = [];
    validatePilgrimages(root, [a, b], errors);

    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a section's own topology no longer arms the circuit check", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    // #given sections that call themselves circular but whose pilgrimage
    // claims no circuit — topology describes the section, not the walk
    const a = sectionWithStages(root, "awa", legs(1), [
      { index: 0, name: "d1", start: { name: { en: "T1" }, coordinates: [0, 0] }, end: { name: { en: "T23" }, coordinates: [0.1, 0] }, distanceKm: 11 },
    ], "circular");
    const b = sectionWithStages(root, "sanuki", legs(2), [
      { index: 0, name: "d1", start: { name: { en: "T23" }, coordinates: [0.1, 0] }, end: { name: { en: "T88" }, coordinates: [0.2, 0] }, distanceKm: 11 },
    ], "circular");

    const errors: ValidationError[] = [];
    validateSectionChain(root, [a, b], errors);

    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a closed circuit whose last stage returns to the first start raises nothing", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    const a = sectionWithStages(root, "awa", closedLegs(1), [
      { index: 0, name: "d1", start: { name: { en: "T1" }, coordinates: [0, 0] }, end: { name: { en: "T23" }, coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    const b = sectionWithStages(root, "sanuki", closedLegs(2), [
      { index: 0, name: "d1", start: { name: { en: "T23" }, coordinates: [0.1, 0] }, end: { name: { en: "T1" }, coordinates: [0, 0] }, distanceKm: 11 },
    ]);

    const errors: ValidationError[] = [];
    validateSectionChain(root, [a, b], errors);

    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sections of one pilgrimage may not disagree on circular", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-pilgrimage-test-"));
  try {
    // #given the flag decides whether the circuit is checked at all, so one
    // section quietly omitting it would decide for the other three
    const a = join(root, "routes", "awa");
    const b = join(root, "routes", "sanuki");
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    writeJson(join(a, "metadata.json"), { id: "awa", pilgrimage: closedLegs(1) });
    writeJson(join(b, "metadata.json"), { id: "sanuki", pilgrimage: legs(2) });

    const errors: ValidationError[] = [];
    validatePilgrimages(root, [a, b], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /shikoku-88/);
    assert.match(errors[0].message, /circular/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the schema refuses a circular flag that is not a boolean", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-schema-test-"));
  try {
    const path = join(root, "metadata.json");
    writeJson(
      path,
      metadataFixture({
        pilgrimage: { id: "shikoku-88", name: { en: "Shikoku 88" }, kind: "legs", order: 1, circular: "yes" },
      }),
    );

    const errors: ValidationError[] = [];
    validateFile(createValidator(), "pilgrimage.schema.json", path, errors);

    assert.ok(errors.length > 0, "a circuit is claimed with true, not with a word");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a section with drafted text but no checklist is told where to record the review", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    // #given the state a content PR starts in: drafted text, no docs/review
    const dir = draftedSection(root, "one", [{ index: 0, name: "d1", drafted: true }]);

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    // #then the stage is refused and the file that would clear it is named,
    // with the line to paste — a review needs somewhere to be recorded
    assert.equal(errors.length, 2);
    assert.match(errors[0].message, /stage 0/);
    assert.match(errors[0].message, /docs\/review\/one\.md/);
    assert.match(errors[0].message, /- \[x\] stage 0/);
    assert.match(errors[1].message, /no review checklist/);
    assert.match(errors[1].message, /docs\/review\/one\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stage the checklist never lists is not a reviewed stage", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    // #given a checklist that lists stage 0 and quietly forgets stage 1
    const dir = draftedSection(root, "one", [{ index: 0, name: "d1" }, { index: 1, name: "d2" }]);
    writeChecklist(root, "one", "# one\n\n- [x] stage 0 — reviewed\n");

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    // #then the unlisted stage is named: a flag deleted in the same pass that
    // never added its line would otherwise pass in silence
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /stage 1/);
    assert.match(errors[0].message, /not listed/);
    assert.match(errors[0].message, /docs\/review\/one\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pilgrimage-level tick counts when the section's own file mentions no stage", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    // #given a section file kept for notes and a pilgrimage file doing the
    // reviewing, as a whole-pilgrimage PR leaves things
    const dir = draftedSection(root, "kumano-kodo-kohechi", [{ index: 0, name: "d1" }], KOHECHI);
    writeChecklist(root, "kumano-kodo-kohechi", "# Kohechi\n\nAnchors pinned against OSM.\n");
    writeChecklist(root, "kumano-kodo", "# Kumano Kodō\n\n- [x] kumano-kodo-kohechi stage 0\n");

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unticked pilgrimage-level line is read even when a section file exists", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    const dir = draftedSection(root, "kumano-kodo-kohechi", [{ index: 0, name: "d1" }], KOHECHI);
    writeChecklist(root, "kumano-kodo-kohechi", "# Kohechi\n\nAnchors pinned against OSM.\n");
    writeChecklist(root, "kumano-kodo", "# Kumano Kodō\n\n- [ ] kumano-kodo-kohechi stage 0\n");

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /unticked/);
    assert.match(errors[0].message, /docs\/review\/kumano-kodo\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every task-list form GitHub renders is a checklist entry", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    // #given the forms a reviewer's editor and GitHub both accept
    const dir = draftedSection(
      root,
      "one",
      [0, 1, 2, 3, 4, 5].map((index) => ({ index, name: `d${index}` })),
    );
    writeChecklist(
      root,
      "one",
      "# one\n\n* [x] stage 0\n+ [x] stage 1\n- [X] stage 2\n-  [x] stage 3\n- [x]  stage 4\n1. [x] stage 5\n",
    );

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unticked box in any of those forms is still unticked", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    const dir = draftedSection(root, "one", [{ index: 0, name: "d1" }]);
    writeChecklist(root, "one", "# one\n\n* [ ] stage 0\n");

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /unticked/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a nested list item is a checklist entry, not quoted code", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    // #given stages grouped under their section heading, four spaces in
    const dir = draftedSection(root, "one", [{ index: 0, name: "d1" }]);
    writeChecklist(root, "one", "# one\n\n- Awa, temples 1–23\n    - [ ] stage 0\n");

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /unticked/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a tick in an indented code block still does not count as a review", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    // #given the drafted text quoted by indentation rather than by fence
    const dir = draftedSection(root, "one", [{ index: 0, name: "d1" }]);
    writeChecklist(root, "one", "# one\n\nQuoted verbatim:\n\n    - [x] stage 0\n\n- [ ] stage 0\n");

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /unticked/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a fence that never closes cannot swallow the checklist", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-drafted-test-"));
  try {
    // #given a quote opened with backticks and closed with tildes, which
    // hid every line after it from the gate
    const dir = draftedSection(root, "one", [{ index: 0, name: "d1" }]);
    writeChecklist(root, "one", "# one\n\n```\ndrafted text\n~~~\n\n- [x] stage 0\n");

    const errors: ValidationError[] = [];
    validateDraftedText(root, [dir], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /stage 0/);
    assert.match(errors[0].message, /not listed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
