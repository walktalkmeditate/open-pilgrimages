import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import { computeStats } from "./stats.js";

const ROOT = join(import.meta.dirname, "..");

test("totals match the figures published on the site and README", () => {
  const { totals } = computeStats(ROOT);

  assert.equal(totals.routes, 7);
  assert.equal(totals.routePoints, 159624);
  assert.equal(totals.waypoints, 12576);
  assert.equal(totals.stages, 109);
});

test("per-route figures match npm run stats", () => {
  const byId = new Map(computeStats(ROOT).routes.map((r) => [r.id, r]));

  assert.equal(byId.get("camino-frances")!.routePoints, 33192);
  assert.equal(byId.get("camino-frances")!.waypoints, 2957);
  assert.equal(byId.get("camino-frances")!.stages, 33);
  assert.equal(byId.get("shikoku-88")!.routePoints, 49097);
  assert.equal(byId.get("kumano-kodo")!.waypoints, 157);
  assert.equal(byId.get("camino-ingles")!.distanceKm, 112);
});

test("variants are listed but excluded from totals", () => {
  const stats = computeStats(ROOT);
  const portugues = stats.routes.find((r) => r.id === "camino-portugues")!;

  assert.deepEqual(portugues.variants.sort(), ["coastal", "espiritual", "lisboa"]);
  // 13,722 is the parent route alone — coastal's 5,546 is not folded in.
  assert.equal(portugues.routePoints, 13722);
});

test("importing the module does not print or exit", () => {
  assert.equal(typeof computeStats, "function");
});

// Regression guard: scripts/stats.ts used to count route points via
// feature.geometry.coordinates.length, which is correct for LineString but
// undercounts MultiLineString (it counts line segments, not points).
// shikoku-88 is the dataset's only MultiLineString route — 77 segments,
// 49,097 points — so it's the one case that would silently regress.
test("MultiLineString route points are flattened, not undercounted", () => {
  const stats = computeStats(ROOT);
  const shikoku = stats.routes.find((r) => r.id === "shikoku-88")!;

  assert.equal(shikoku.routePoints, 49097);
  assert.equal(stats.totals.routePoints, 159624);
});

test("importing stats.ts as a subprocess prints nothing and exits cleanly", () => {
  // #given a route dataset that satisfies computeStats's expectations
  // #when the module is imported (not invoked) in a fresh process
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "--eval", "import('./scripts/stats.ts')"],
    { cwd: ROOT, encoding: "utf-8" },
  );

  // #then it produces no console output — a bare import has no side effects
  assert.equal(output, "");
});

function minimalMetadata(id: string): Record<string, unknown> {
  return {
    id,
    name: { en: `Route ${id}` },
    overview: { topology: "linear", distanceKm: 10, countries: ["FR"] },
    tradition: { type: "christian" },
  };
}

function createRouteFixture(): { root: string; routeDir: string } {
  const root = mkdtempSync(join(tmpdir(), "stats-test-"));
  const routesDir = join(root, "routes");
  const routeDir = join(routesDir, "fixture-route");
  mkdirSync(routeDir, { recursive: true });

  return { root, routeDir };
}

test("a route missing everything but metadata.json degrades to zeroed defaults", () => {
  // #given a route directory with only metadata.json present
  const { root, routeDir } = createRouteFixture();
  writeFileSync(join(routeDir, "metadata.json"), JSON.stringify(minimalMetadata("fixture-route")));

  try {
    // #when computeStats reads it
    const stats = computeStats(root);
    const route = stats.routes.find((r) => r.id === "fixture-route")!;

    // #then missing stages/waypoints/route files degrade to zero, not a throw
    assert.equal(route.stages, 0);
    assert.equal(route.waypoints, 0);
    assert.equal(route.routePoints, 0);
    assert.equal(route.stageSumKm, 0);
    assert.equal(route.interiorDone, 0);
    assert.equal(route.interiorTotal, 0);
    assert.deepEqual(route.variants, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("malformed JSON in stages.json, waypoints.geojson, and route.geojson does not throw", () => {
  // #given a route directory whose data files are all syntactically invalid JSON
  const { root, routeDir } = createRouteFixture();
  writeFileSync(join(routeDir, "metadata.json"), JSON.stringify(minimalMetadata("fixture-route")));
  writeFileSync(join(routeDir, "stages.json"), "{ not valid json");
  writeFileSync(join(routeDir, "waypoints.geojson"), "{ not valid json");
  writeFileSync(join(routeDir, "route.geojson"), "{ not valid json");

  try {
    // #when / #then computeStats reads it without throwing, and degrades to defaults
    const stats = computeStats(root);
    const route = stats.routes.find((r) => r.id === "fixture-route")!;

    assert.equal(route.stages, 0);
    assert.equal(route.waypoints, 0);
    assert.equal(route.routePoints, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a shape-wrong stages.stages or waypoints.features degrades instead of throwing", () => {
  // #given stages.json and waypoints.geojson whose top-level fields are the wrong shape
  const { root, routeDir } = createRouteFixture();
  writeFileSync(join(routeDir, "metadata.json"), JSON.stringify(minimalMetadata("fixture-route")));
  writeFileSync(join(routeDir, "stages.json"), JSON.stringify({ stages: "not-an-array" }));
  writeFileSync(join(routeDir, "waypoints.geojson"), JSON.stringify({ features: { not: "an array" } }));

  try {
    // #when computeStats reads it
    const stats = computeStats(root);
    const route = stats.routes.find((r) => r.id === "fixture-route")!;

    // #then the Array.isArray guard at each level falls back to empty, not a crash
    assert.equal(route.stages, 0);
    assert.equal(route.waypoints, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a route directory without metadata.json is skipped, not crashed on", () => {
  // #given a route directory that never got a metadata.json written
  const root = mkdtempSync(join(tmpdir(), "stats-test-"));
  const routesDir = join(root, "routes");
  mkdirSync(join(routesDir, "incomplete-route"), { recursive: true });

  try {
    // #when / #then computeStats simply omits it, matching today's existsSync-guarded skip
    const stats = computeStats(root);
    assert.deepEqual(stats.routes, []);
    assert.equal(stats.totals.routes, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// resolveInvokedPath itself is shared CLI plumbing tested in scripts/cli.test.ts.

test("running stats.ts as a CLI script prints the route points total the site and README headline", () => {
  // #given the dataset totals stats.ts computes
  // #when stats.ts runs as a script
  const output = execFileSync(process.execPath, ["--import", "tsx", "scripts/stats.ts"], {
    cwd: ROOT,
    encoding: "utf-8",
  });

  // #then the totals block prints a thousands-separated Route points line
  // matching the figure the site and README publish
  assert.match(output, /Route points: 159,624/);
});
