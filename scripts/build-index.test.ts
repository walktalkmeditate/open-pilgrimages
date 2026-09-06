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
import { buildIndex, scanRoutes, readPrevious, releaseTag, waysEntry, type RouteIndex } from "./build-index.js";
import { createValidator, validateFile, type ValidationError } from "./validate.js";

const ROOT = join(import.meta.dirname, "..");
const ROUTES = join(ROOT, "routes");

interface RouteFixture {
  dirName: string;
  id: string;
  /** Merged over minimalMetadata(id) — what a section's pilgrimage block rides in on. */
  metadata?: Record<string, unknown>;
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
    // recursive: true so a second call can overwrite an existing fixture's
    // metadata.json in place, e.g. to change only its pilgrimage block.
    mkdirSync(routeDir, { recursive: true });
    writeFileSync(
      join(routeDir, "metadata.json"),
      JSON.stringify({ ...minimalMetadata(fixture.id), ...fixture.metadata }),
    );
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
  for (const name of ["build-index.ts", "cli.ts", "region.ts", "pilgrimage.ts"]) {
    cpSync(join(ROOT, "scripts", name), join(scriptsDir, name));
  }
  // main() reads this for releaseTag(): a script-repo fixture with no version
  // would fail before it ever got to writing index.json.
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", version: "1.6.0" }));

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
  const first = buildIndex(ROUTES, null, () => OLD, ROOT, RELEASE);
  const second = buildIndex(ROUTES, first, () => NEW, ROOT, RELEASE);

  assert.equal(second.generatedAt, OLD);
  assert.deepEqual(second, first);
});

test("stamps a fresh generatedAt when route data changes", () => {
  const first = buildIndex(ROUTES, null, () => OLD, ROOT, RELEASE);
  const stale: RouteIndex = { ...first, routes: first.routes.slice(1) };
  const second = buildIndex(ROUTES, stale, () => NEW, ROOT, RELEASE);

  assert.equal(second.generatedAt, NEW);
});

test("stamps a fresh generatedAt when there is no previous index", () => {
  assert.equal(buildIndex(ROUTES, null, () => NEW, ROOT, RELEASE).generatedAt, NEW);
});

test("ignores a previous generatedAt timestamp when other fields are identical", () => {
  const first = buildIndex(ROUTES, null, () => OLD, ROOT, RELEASE);
  const sameContent: RouteIndex = {
    schemaVersion: first.schemaVersion,
    release: first.release,
    generatedAt: "1999-01-01T00:00:00.000Z",
    // Carried forward so "other fields are identical" stays true regardless
    // of whether the live routes/ tree currently declares any pilgrimages.
    pilgrimages: first.pilgrimages,
    routes: first.routes,
  };
  const second = buildIndex(ROUTES, sameContent, () => NEW, ROOT, RELEASE);

  assert.equal(second.generatedAt, "1999-01-01T00:00:00.000Z");
});

test("stamps a fresh generatedAt when previous index is missing the field", () => {
  const first = buildIndex(ROUTES, null, () => OLD, ROOT, RELEASE);
  const missingGeneratedAt = {
    schemaVersion: first.schemaVersion,
    routes: first.routes,
  } as unknown as RouteIndex;

  const second = buildIndex(ROUTES, missingGeneratedAt, () => NEW, ROOT, RELEASE);

  assert.equal(second.generatedAt, NEW);
});

test("stamps a fresh generatedAt when previous index has a non-string generatedAt", () => {
  const first = buildIndex(ROUTES, null, () => OLD, ROOT, RELEASE);
  const numericGeneratedAt = {
    schemaVersion: first.schemaVersion,
    generatedAt: 12345,
    routes: first.routes,
  } as unknown as RouteIndex;

  const second = buildIndex(ROUTES, numericGeneratedAt, () => NEW, ROOT, RELEASE);

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
  const first = buildIndex(ROUTES, null, () => OLD, ROOT, RELEASE);
  const previous: RouteIndex = JSON.parse(JSON.stringify(first));
  const second = buildIndex(ROUTES, previous, () => NEW, ROOT, RELEASE);

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
    release: "v1.6.0",
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

const RELEASE = "v1.6.0";

test("the index names the release tag the catalog will read", () => {
  const index = buildIndex(ROUTES, null, () => NEW, ROOT, releaseTag(join(ROOT, "package.json")));
  assert.match(index.release, /^v\d+\.\d+\.\d+$/);
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as { version: string };
  assert.equal(index.release, `v${pkg.version}`);
});

test("releaseTag rejects a package.json without a SemVer version", () => {
  const dir = mkdtempSync(join(tmpdir(), "build-index-test-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "next" }));
    assert.throws(() => releaseTag(join(dir, "package.json")), /not a SemVer release/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a route with no ways directory gets no ways entry", () => {
  const { root, routesDir } = createTempRoutesDir([{ dirName: "alpha", id: "alpha" }]);
  try {
    assert.equal(waysEntry(join(routesDir, "alpha")), undefined);
    assert.equal(scanRoutes(routesDir, root)[0].ways, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a route whose every stage cleared the gate gets a sized ways entry", () => {
  const { root, routesDir } = createTempRoutesDir([{ dirName: "alpha", id: "alpha" }]);
  try {
    const waysDir = join(routesDir, "alpha", "ways");
    mkdirSync(waysDir);
    writeFileSync(join(waysDir, "report.json"), JSON.stringify({
      gate: { passed: true, failing: [] },
      places: { sparse: false, stagesWithMomentBeyondEnds: 2, halfOfStages: 1, placesPerStage: 1.5 },
      stages: [{ index: 0 }, { index: 1 }],
    }));
    writeFileSync(join(waysDir, "route.json"), "0123456789");
    writeFileSync(join(waysDir, "stage-00.json"), "01234");

    assert.deepEqual(waysEntry(join(routesDir, "alpha")), {
      stageCount: 2, bytes: 15, placesPerStage: 1.5, sparse: false,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a sparsely curated route is still listed, flagged for the card to say so", () => {
  const { root, routesDir } = createTempRoutesDir([{ dirName: "alpha", id: "alpha" }]);
  try {
    const waysDir = join(routesDir, "alpha", "ways");
    mkdirSync(waysDir);
    writeFileSync(join(waysDir, "report.json"), JSON.stringify({
      gate: { passed: true, failing: [] },
      places: { sparse: true, stagesWithMomentBeyondEnds: 1, halfOfStages: 2, placesPerStage: 0.3, note: "n" },
      stages: [{ index: 0 }, { index: 1 }, { index: 2 }],
    }));
    writeFileSync(join(waysDir, "route.json"), "{}");

    const entry = scanRoutes(routesDir, root)[0];
    assert.equal(entry.ways?.sparse, true);
    assert.equal(entry.ways?.placesPerStage, 0.3);
    assert.equal(entry.ways?.stageCount, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a route with a stage outside the length gate gets no ways entry at all", () => {
  const { root, routesDir } = createTempRoutesDir([{ dirName: "alpha", id: "alpha" }]);
  try {
    const waysDir = join(routesDir, "alpha", "ways");
    mkdirSync(waysDir);
    writeFileSync(join(waysDir, "report.json"), JSON.stringify({
      gate: { passed: false, failing: [2] },
      places: { sparse: false, stagesWithMomentBeyondEnds: 3, halfOfStages: 2, placesPerStage: 2 },
      stages: [{ index: 0 }, { index: 1 }, { index: 2 }],
    }));
    writeFileSync(join(waysDir, "route.json"), "{}");

    assert.equal(waysEntry(join(routesDir, "alpha")), undefined);
    const entry = scanRoutes(routesDir, root)[0];
    assert.equal(entry.id, "alpha");
    assert.equal(entry.ways, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed index.json names the version package.json is at", () => {
  // The release procedure bumps package.json and then regenerates. Without
  // this guard, forgetting the regeneration ships an index that pins every
  // package download to the previous release, and both tags resolve on the
  // CDN, so nothing would 404 to give it away.
  const index = JSON.parse(readFileSync(join(ROOT, "index.json"), "utf-8")) as RouteIndex;
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as { version: string };
  assert.equal(
    index.release,
    `v${pkg.version}`,
    "index.json is stale — run npm run build-index and commit the result",
  );
});

const KUMANO = { id: "kumano-kodo", name: { en: "Kumano Kodō" }, kind: "alternatives" };

test("pilgrimages are derived from the sections that declare them", () => {
  const { root, routesDir } = createTempRoutesDir([
    { dirName: "one", id: "one", metadata: { pilgrimage: { ...KUMANO, order: 2 } } },
    { dirName: "two", id: "two", metadata: { pilgrimage: { ...KUMANO, order: 1 } } },
  ]);
  try {
    const index = buildIndex(routesDir, null, () => NEW, root, RELEASE);

    assert.equal(index.pilgrimages?.length, 1);
    assert.equal(index.pilgrimages?.[0].id, "kumano-kodo");
    assert.deepEqual(index.pilgrimages?.[0].sections, ["two", "one"]);
    assert.equal(index.routes.find((r) => r.id === "one")?.pilgrimage, "kumano-kodo");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a legs pilgrimage carries totals and an alternatives one does not", () => {
  const shikoku = { id: "shikoku-88", name: { en: "Shikoku" }, kind: "legs" };
  const { root, routesDir } = createTempRoutesDir([
    { dirName: "awa", id: "awa", metadata: { pilgrimage: { ...shikoku, order: 1 } } },
    { dirName: "tosa", id: "tosa", metadata: { pilgrimage: { ...shikoku, order: 2 } } },
    { dirName: "norte", id: "norte", metadata: { pilgrimage: { ...KUMANO, order: 1 } } },
  ]);
  try {
    const index = buildIndex(routesDir, null, () => NEW, root, RELEASE);
    const legs = index.pilgrimages?.find((p) => p.id === "shikoku-88");
    const alternatives = index.pilgrimages?.find((p) => p.id === "kumano-kodo");

    // minimalMetadata gives every fixture overview.distanceKm = 1.
    assert.equal(legs?.distanceKm, 2);
    assert.equal(legs?.stageCount, 0);
    assert.equal(alternatives?.distanceKm, undefined);
    assert.equal(alternatives?.stageCount, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a route with no pilgrimage block is left ungrouped", () => {
  const { root, routesDir } = createTempRoutesDir([{ dirName: "lone", id: "lone" }]);
  try {
    const index = buildIndex(routesDir, null, () => NEW, root, RELEASE);
    assert.equal(index.pilgrimages, undefined);
    assert.equal(index.routes[0].pilgrimage, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stamps a fresh generatedAt when a shared pilgrimage's name changes", () => {
  const { root, routesDir } = createTempRoutesDir([
    { dirName: "one", id: "one", metadata: { pilgrimage: { ...KUMANO, order: 2 } } },
    { dirName: "two", id: "two", metadata: { pilgrimage: { ...KUMANO, order: 1 } } },
  ]);
  try {
    const first = buildIndex(routesDir, null, () => OLD, root, RELEASE);

    // Only the pilgrimage's own metadata changes here — neither route's own
    // fields move at all — which is exactly what the comparison used to miss.
    const renamed = { ...KUMANO, name: { en: "Kumano Kodō, renamed" } };
    writeRouteFixtures(routesDir, [
      { dirName: "one", id: "one", metadata: { pilgrimage: { ...renamed, order: 2 } } },
      { dirName: "two", id: "two", metadata: { pilgrimage: { ...renamed, order: 1 } } },
    ]);

    const second = buildIndex(routesDir, first, () => NEW, root, RELEASE);

    assert.equal(second.generatedAt, NEW);
    assert.equal(second.pilgrimages?.[0].name.en, "Kumano Kodō, renamed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("index.schema.json accepts pilgrimages[] and a route that names one", () => {
  const root = mkdtempSync(join(tmpdir(), "build-index-schema-test-"));
  try {
    const base = JSON.parse(readFileSync(join(ROOT, "index.json"), "utf-8")) as RouteIndex;
    const path = join(root, "index.json");
    writeFileSync(
      path,
      JSON.stringify({
        ...base,
        pilgrimages: [
          { id: "camino-de-santiago", name: { en: "Camino de Santiago" }, kind: "alternatives", sections: ["camino-frances"] },
        ],
        routes: base.routes.map((route) =>
          route.id === "camino-frances" ? { ...route, pilgrimage: "camino-de-santiago" } : route,
        ),
      }),
    );

    const errors: ValidationError[] = [];
    validateFile(createValidator(), "index.schema.json", path, errors);

    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("index.schema.json refuses a third kind and a pilgrimage with no sections", () => {
  const root = mkdtempSync(join(tmpdir(), "build-index-schema-test-"));
  try {
    const base = JSON.parse(readFileSync(join(ROOT, "index.json"), "utf-8")) as RouteIndex;
    const write = (name: string, pilgrimage: Record<string, unknown>): string => {
      const path = join(root, name);
      writeFileSync(path, JSON.stringify({ ...base, pilgrimages: [pilgrimage] }));
      return path;
    };
    const named = { id: "camino-de-santiago", name: { en: "Camino de Santiago" } };
    const kindPath = write("kind.json", { ...named, kind: "chain", sections: ["camino-frances"] });
    const emptyPath = write("empty.json", { ...named, kind: "alternatives", sections: [] });

    const ajv = createValidator();
    const kindErrors: ValidationError[] = [];
    const sectionErrors: ValidationError[] = [];
    validateFile(ajv, "index.schema.json", kindPath, kindErrors);
    validateFile(ajv, "index.schema.json", emptyPath, sectionErrors);

    assert.ok(kindErrors.length > 0, `"chain" is not one of the two kinds`);
    assert.ok(sectionErrors.length > 0, "a pilgrimage with no sections groups nothing");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
