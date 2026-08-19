import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "path";
import { buildIndex, scanRoutes, type RouteIndex } from "./build-index.js";

const ROOT = join(import.meta.dirname, "..");
const ROUTES = join(ROOT, "routes");

test("scans every top-level route directory", () => {
  const ids = scanRoutes(ROUTES, ROOT).map((r) => r.id).sort();
  assert.deepEqual(ids, [
    "camino-frances",
    "camino-ingles",
    "camino-norte",
    "camino-portugues",
    "camino-primitivo",
    "kumano-kodo",
    "shikoku-88",
  ]);
});

test("attaches variants only to routes that have them", () => {
  const byId = new Map(scanRoutes(ROUTES, ROOT).map((r) => [r.id, r]));

  assert.deepEqual(
    byId.get("camino-portugues")!.variants!.map((v) => v.id).sort(),
    ["coastal", "espiritual", "lisboa"],
  );
  assert.deepEqual(
    byId.get("kumano-kodo")!.variants!.map((v) => v.id).sort(),
    ["iseji", "kohechi"],
  );
  assert.equal(byId.get("camino-frances")!.variants, undefined);
});

test("resolves paths relative to the repo root", () => {
  const frances = scanRoutes(ROUTES, ROOT).find((r) => r.id === "camino-frances")!;
  assert.equal(frances.path, "routes/camino-frances");
  assert.equal(frances.distanceKm, 764);
  assert.equal(frances.country, "ES");
  assert.equal(frances.region, "Europe");
});

const OLD = "2020-01-01T00:00:00.000Z";
const NEW = "2099-12-31T00:00:00.000Z";

test("carries the previous generatedAt forward when route data is unchanged", () => {
  const first = buildIndex(ROUTES, null, () => OLD, ROOT);
  const second = buildIndex(ROUTES, first, () => NEW, ROOT);

  assert.equal(second.generatedAt, OLD);
  assert.deepEqual(second, first);
});

test("stamps a fresh generatedAt when route data changes", () => {
  const first = buildIndex(ROUTES, null, () => OLD, ROOT);
  const stale: RouteIndex = { ...first, routes: first.routes.slice(1) };
  const second = buildIndex(ROUTES, stale, () => NEW, ROOT);

  assert.equal(second.generatedAt, NEW);
});

test("stamps a fresh generatedAt when there is no previous index", () => {
  assert.equal(buildIndex(ROUTES, null, () => NEW, ROOT).generatedAt, NEW);
});

test("ignores a previous generatedAt that differs only in timestamp", () => {
  const first = buildIndex(ROUTES, null, () => OLD, ROOT);
  const reordered: RouteIndex = {
    schemaVersion: first.schemaVersion,
    generatedAt: "1999-01-01T00:00:00.000Z",
    routes: first.routes,
  };
  const second = buildIndex(ROUTES, reordered, () => NEW, ROOT);

  assert.equal(second.generatedAt, "1999-01-01T00:00:00.000Z");
});
