import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createValidator, validateWays, type ValidationError } from "./validate.js";

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
    })),
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

test("the committed Camino Francés package passes every cross-check", () => {
  const ajv = createValidator();
  const errors: ValidationError[] = [];
  validateWays(ajv, join(ROOT, "routes", "camino-frances"), errors);
  assert.deepEqual(errors, []);
});
