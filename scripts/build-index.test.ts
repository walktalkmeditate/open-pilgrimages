import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "path";
import { statSync, mkdtempSync, writeFileSync, rmSync, symlinkSync, realpathSync } from "fs";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import { buildIndex, scanRoutes, readPrevious, resolveInvokedPath, type RouteIndex } from "./build-index.js";

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

test("ignores a previous generatedAt timestamp when other fields are identical", () => {
  const first = buildIndex(ROUTES, null, () => OLD, ROOT);
  const sameContent: RouteIndex = {
    schemaVersion: first.schemaVersion,
    generatedAt: "1999-01-01T00:00:00.000Z",
    routes: first.routes,
  };
  const second = buildIndex(ROUTES, sameContent, () => NEW, ROOT);

  assert.equal(second.generatedAt, "1999-01-01T00:00:00.000Z");
});

test("scanRoutes returns routes sorted by id, and variants sorted by id within each route", () => {
  const routes = scanRoutes(ROUTES, ROOT);
  const ids = routes.map((r) => r.id);
  const sortedIds = [...ids].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(ids, sortedIds);

  const portugues = routes.find((r) => r.id === "camino-portugues")!;
  const variantIds = portugues.variants!.map((v) => v.id);
  assert.deepEqual(variantIds, ["coastal", "espiritual", "lisboa"]);

  const kumano = routes.find((r) => r.id === "kumano-kodo")!;
  assert.deepEqual(
    kumano.variants!.map((v) => v.id),
    ["iseji", "kohechi"],
  );
});

test("buildIndex reuses the timestamp when previous came from disk (JSON round-trip)", () => {
  const first = buildIndex(ROUTES, null, () => OLD, ROOT);
  const previous: RouteIndex = JSON.parse(JSON.stringify(first));
  const second = buildIndex(ROUTES, previous, () => NEW, ROOT);

  assert.equal(second.generatedAt, OLD);
});

test("importing the module does not rewrite index.json", () => {
  const indexPath = join(ROOT, "index.json");
  const before = statSync(indexPath).mtimeMs;

  // A bare import in a child process. If main() runs on import, this rewrites
  // index.json and the mtime moves.
  execFileSync(
    process.execPath,
    ["--import", "tsx", "--eval", "import('./scripts/build-index.ts')"],
    { cwd: ROOT, stdio: "pipe" },
  );

  assert.equal(
    statSync(indexPath).mtimeMs,
    before,
    "importing build-index.ts rewrote index.json — main() is not guarded",
  );
});

test("readPrevious returns null for a missing path without warning", () => {
  const dir = mkdtempSync(join(tmpdir(), "build-index-test-"));

  // Asserting silence matters: without the existsSync early return, a missing
  // file would still yield null via the catch, but with a spurious warning.
  const originalWarn = console.warn;
  const warnCalls: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnCalls.push(args);
  };

  try {
    assert.equal(readPrevious(join(dir, "index.json")), null);
    assert.deepEqual(warnCalls, [], "a missing index is normal, not warnable");
  } finally {
    console.warn = originalWarn;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readPrevious returns null and warns for malformed JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "build-index-test-"));
  const malformedPath = join(dir, "index.json");
  writeFileSync(malformedPath, "{ this is not valid json");

  const originalWarn = console.warn;
  const warnCalls: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnCalls.push(args);
  };

  try {
    const result = readPrevious(malformedPath);
    assert.equal(result, null);
    assert.equal(warnCalls.length, 1);
    assert.ok(
      String(warnCalls[0][0]).includes(malformedPath),
      "warning should name the offending file",
    );
  } finally {
    console.warn = originalWarn;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readPrevious parses a valid index file and returns its contents", () => {
  const dir = mkdtempSync(join(tmpdir(), "build-index-test-"));
  const validPath = join(dir, "index.json");
  const contents: RouteIndex = {
    schemaVersion: "1.0.0",
    generatedAt: "2020-01-01T00:00:00.000Z",
    routes: [],
  };
  writeFileSync(validPath, JSON.stringify(contents));

  try {
    assert.deepEqual(readPrevious(validPath), contents);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveInvokedPath resolves a symlinked invocation path", () => {
  // Node resolves symlinks for import.meta.filename but leaves process.argv[1]
  // as invoked. Without this normalisation the guard silently skips main(),
  // so index.json is never regenerated and nothing reports why.
  const dir = mkdtempSync(join(tmpdir(), "build-index-test-"));
  const target = join(ROOT, "package.json");
  const link = join(dir, "invoked.js");
  symlinkSync(target, link);

  try {
    assert.equal(resolveInvokedPath(link), realpathSync(target));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveInvokedPath returns null when argv[1] is absent", () => {
  assert.equal(resolveInvokedPath(undefined), null);
});

test("resolveInvokedPath returns null for a path that does not exist", () => {
  const dir = mkdtempSync(join(tmpdir(), "build-index-test-"));
  try {
    assert.equal(resolveInvokedPath(join(dir, "nope.js")), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
