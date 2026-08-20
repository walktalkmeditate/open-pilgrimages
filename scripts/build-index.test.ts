import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "path";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  cpSync,
} from "fs";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import { buildIndex, scanRoutes, readPrevious, type RouteIndex } from "./build-index.js";

const ROOT = join(import.meta.dirname, "..");
const ROUTES = join(ROOT, "routes");

interface RouteFixture {
  dirName: string;
  id: string;
}

function minimalMetadata(id: string): Record<string, unknown> {
  return {
    id,
    name: { en: id },
    overview: { countries: ["FR"], distanceKm: 1, topology: "linear" },
    tradition: { type: "christian" },
  };
}

function writeRouteFixtures(routesDir: string, fixtures: RouteFixture[]): void {
  for (const fixture of fixtures) {
    const routeDir = join(routesDir, fixture.dirName);
    mkdirSync(routeDir);
    writeFileSync(join(routeDir, "metadata.json"), JSON.stringify(minimalMetadata(fixture.id)));
  }
}

function createTempRoutesDir(fixtures: RouteFixture[]): { root: string; routesDir: string } {
  const root = mkdtempSync(join(tmpdir(), "build-index-test-"));
  const routesDir = join(root, "routes");
  mkdirSync(routesDir);
  writeRouteFixtures(routesDir, fixtures);

  return { root, routesDir };
}

function createTempScriptRepo(fixtures: RouteFixture[]): {
  dir: string;
  scriptPath: string;
  indexPath: string;
} {
  // Nested inside the repo root (never under routes/) rather than the system
  // tmpdir: node resolves the "tsx" loader as a bare specifier from cwd, and
  // only walking up to the repo's own node_modules/ can satisfy that.
  const dir = mkdtempSync(join(ROOT, ".build-index-test-"));
  const routesDir = join(dir, "routes");
  mkdirSync(routesDir);
  writeRouteFixtures(routesDir, fixtures);

  const scriptsDir = join(dir, "scripts");
  mkdirSync(scriptsDir);
  cpSync(join(ROOT, "scripts", "build-index.ts"), join(scriptsDir, "build-index.ts"));
  cpSync(join(ROOT, "scripts", "cli.ts"), join(scriptsDir, "cli.ts"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));

  return { dir, scriptPath: join(scriptsDir, "build-index.ts"), indexPath: join(dir, "index.json") };
}

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

test("stamps a fresh generatedAt when previous index is missing the field", () => {
  const first = buildIndex(ROUTES, null, () => OLD, ROOT);
  const missingGeneratedAt = {
    schemaVersion: first.schemaVersion,
    routes: first.routes,
  } as unknown as RouteIndex;

  const second = buildIndex(ROUTES, missingGeneratedAt, () => NEW, ROOT);

  assert.equal(second.generatedAt, NEW);
});

test("stamps a fresh generatedAt when previous index has a non-string generatedAt", () => {
  const first = buildIndex(ROUTES, null, () => OLD, ROOT);
  const numericGeneratedAt = {
    schemaVersion: first.schemaVersion,
    generatedAt: 12345,
    routes: first.routes,
  } as unknown as RouteIndex;

  const second = buildIndex(ROUTES, numericGeneratedAt, () => NEW, ROOT);

  assert.equal(second.generatedAt, NEW);
});

test("scanRoutes sorts routes by metadata id, independent of directory listing order", () => {
  const { root, routesDir } = createTempRoutesDir([
    { dirName: "01-zulu", id: "zulu" },
    { dirName: "02-alpha", id: "alpha" },
  ]);

  try {
    const ids = scanRoutes(routesDir, root).map((r) => r.id);
    assert.deepEqual(ids, ["alpha", "zulu"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("buildIndex reuses the timestamp when previous came from disk (JSON round-trip)", () => {
  const first = buildIndex(ROUTES, null, () => OLD, ROOT);
  const previous: RouteIndex = JSON.parse(JSON.stringify(first));
  const second = buildIndex(ROUTES, previous, () => NEW, ROOT);

  assert.equal(second.generatedAt, OLD);
});

test("running build-index.ts as a CLI script writes index.json", () => {
  const { dir, scriptPath, indexPath } = createTempScriptRepo([
    { dirName: "01-alpha", id: "alpha" },
    { dirName: "02-beta", id: "beta" },
  ]);

  try {
    const output = execFileSync(process.execPath, ["--import", "tsx", scriptPath], {
      cwd: dir,
      encoding: "utf-8",
    });

    assert.match(output, /Generated index\.json with 2 route\(s\)/);

    const written = JSON.parse(readFileSync(indexPath, "utf-8")) as RouteIndex;
    assert.deepEqual(
      written.routes.map((r) => r.id),
      ["alpha", "beta"],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("importing the module does not rewrite index.json", () => {
  const { dir, indexPath } = createTempScriptRepo([]);

  try {
    // A bare import in a child process, run against a disposable repo copy so
    // a broken guard writes into the temp dir instead of the real index.json.
    execFileSync(
      process.execPath,
      ["--import", "tsx", "--eval", "import('./scripts/build-index.ts')"],
      { cwd: dir, stdio: "pipe" },
    );

    assert.equal(
      existsSync(indexPath),
      false,
      "importing build-index.ts wrote index.json — main() is not guarded",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

// resolveInvokedPath itself is shared CLI plumbing tested in scripts/cli.test.ts.
