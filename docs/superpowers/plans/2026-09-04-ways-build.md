# Ways Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn every pilgrimage route's stages into ready-to-walk Way files that the Pilgrim iOS app decodes unchanged, plus a coverage report, a catalog floor, and the `index.json` fields the app's catalog reads.

**Architecture:** A build step (`scripts/build-ways.ts`) reads each route's *walked line*, `stages.json`, and `waypoints.geojson` and writes `routes/<route-id>/ways/stage-NN.json`, `ways/route.json`, and `ways/report.json`. Geometry, moment selection, mark selection, the stage block, and the catalog/report are four small pure modules under `scripts/ways/`, each with its own test file; `build-ways.ts` is thin orchestration plus JSON-Schema validation of everything it writes. `build-index.ts` gains the `release` and per-route `ways` fields so `index.json` stays the single generated registry. A separate, network-touching enrichment script (`scripts/enrich/build-main-line.ts`) produces the walked line (`route.main.geojson`) that stage slicing needs, because a route's committed `route.geojson` bundles optional variants and detours.

**Tech Stack:** TypeScript run through `tsx` (no build step), `node:test` + `node:assert/strict` for tests, Ajv 2020 + ajv-formats for JSON Schema, plain `fetch` against the Overpass API for the enrichment script.

## Deviations from the spec (read before starting)

These are the only places this plan knowingly differs from `2026-09-03-honor-slice-two-pilgrimage-stages-design.md` §1. Each is measured, not assumed.

1. **`scripts/build-ways.ts`, not `.mjs`.** Every script in this repo is TypeScript run through `tsx` (`package.json` `"test": "node --import tsx --test \"scripts/**/*.test.ts\""`, `tsconfig.json` `"include": ["scripts/**/*.ts"]`). A `.mjs` file would be invisible to `npx tsc --noEmit`, which CI runs.
2. **Pipeline order is `fetch → build-ways → build-index → validate`, not "build-ways after validation".** `index.json` must report each route's `ways` entry, and `build-index.ts` is the only writer of `index.json` (CI runs `npm run build-index` then `git diff --exit-code index.json`). Putting the `ways` fields in `build-index` and running it after `build-ways` keeps that invariant. `npm run validate` at the end validates the ways files too.
3. **`departedAt` and `report.generatedAt` come from the route's `metadata.json` `lastUpdated`, not from wall-clock time.** CI runs the generators and then fails on any diff in `routes/`; a wall-clock stamp would make every build drift. `lastUpdated` is already required by `pilgrimage.schema.json` and already whole-second ISO-8601 with `Z` on all seven routes (e.g. `"2026-08-19T00:00:00Z"`). This is the same reasoning that made `build-index.ts` carry `generatedAt` forward. It is only constrained to `format: date-time`, though, so a contributor may legally write `2026-08-19T00:00:00.000Z` or an offset — and the Way schema's `departedAt` pattern demands whole seconds and a `Z`. The build normalizes with `new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z")` before writing, so a millisecond stamp in the dataset cannot fail the package's own schema.
4. **Stage boundaries snap to the nearest vertex only when that vertex is within 500 m; otherwise they fall back to the position implied by the preceding stages' declared `distanceKm`.** Measured on the real Camino Francés walked line: pure nearest-vertex snapping puts 7 of 33 stages outside the ±10 % gate, because four stage-boundary towns (Bercianos del Real Camino 3,976 m, Terradillos-area anchors, San Martín del Camino 2,041 m, Foncebadón 696 m) are not on the OSM main line at all. With the 500 m fallback, 2 of 33 remain outside. The fallback never fires when the boundary is genuinely on the line.
5. **Three schema files, not one.** `schema/way.schema.json` is the app contract for a stage file, as the spec says; `schema/way-route.schema.json` and `schema/way-report.schema.json` cover the two sibling outputs, matching `validate.ts`'s existing one-schema-per-file pattern.
6. **`cover` is emitted only when `routes/<route-id>/cover.jpg` exists.** No route has one; spec open question 1 (Mapbox static renders under ODbL) is out of this plan's scope, so the field is simply absent today.
7. **`tzIdentifier` is always absent.** No `metadata.json` in the dataset carries a time zone (`grep -rli "timezone\|tzIdentifier" routes/` returns nothing), and the spec says "else null".
8. **Nil-valued fields are omitted, not written as `null`.** `PilgrimageWayImporter` parses field by field and treats an absent optional as absent; omitting is smaller over the CDN and matches the iOS fixture.
9. **A stage file carries a `schemaVersion` the app ignores.** The iOS fixture has none, but this repo's constraint is a SemVer `schemaVersion` in every file. `PilgrimageWayImporter` reads named fields and skips what it does not recognise (its own test asserts an unknown mark `kind` is skipped rather than fatal), so the extra key is inert on the phone and keeps the dataset self-describing. It is the only key this build emits that the iOS fixture does not.
10. **`route.json`'s `summary` comes from `metadata.description.en`.** The spec names `metadata.overview.description`, which does not exist in any of the seven routes' metadata; `description` is the required top-level localized field carrying the same prose.
11. **A route that fails the length gate still gets a `report.json`, and `npm run build-ways` still exits 0.** The spec says such a route "emits no `ways/` directory"; what it withholds here is the *package* — `route.json` and the stage files. A route that fails is exactly the one whose report someone needs to read (that report is what answers spec open question 2), and a dataset whose routes do not all have a walked line yet is unfinished, not broken, so `npm run pipeline` has to stay runnable. A *schema* failure is still fatal.
12. **The coverage floor is a flag on the catalog entry, not a gate on it.** The spec makes the floor decide whether `index.json` lists a route at all. Measured, that lists nothing: the Camino Francés carries a place beyond the day's own ends on 7 of its 33 stages against a floor of 17, and it is the only route that clears the length gate. So a route that clears the *length* gate is listed, with `placesPerStage` and `sparse: true` on its `ways` entry, and the app says "few places marked yet" on its card. The length gate stays hard: any stage outside ±10 % means a report and no entry.
13. **A stage's marks are trimmed to the app's limit rather than failing the route.** `PilgrimageWayImporter.maxMarks` is 400, and the Camino Francés' busiest stage carries 393 service waypoints before the 300 m off-line drop — one new fountain from a file the app would refuse. Over the limit, the build keeps the 400 nearest the line and records `marksTrimmed` in the report.

## Measured facts this plan is built on

Run before writing this plan, against the committed data on `feat/ways-build`:

| Fact | Value |
|---|---|
| `routes/camino-frances/route.geojson` length | **994.4 km** over 33,192 points (spec said 989 km) |
| Sum of its 33 stages' `distanceKm` | **763.7 km** |
| Stages outside ±10 % when sliced from `route.geojson` | **22 of 33** |
| Camino Francés eligible (moment-type) waypoints | **52**; **17** lie within 60 m of the line; **none of stage 0's** do (nearest 117 m) — exactly the spec's figures |
| Camino Francés stages with a moment beyond the start/end places | **7 of 33** — half would be 17, so the route is `sparse` |
| Shikoku 88 eligible waypoints | **88**, of which 77 within 60 m; **9 of 10** stages clear the moment floor |
| Shikoku 88 sliced from `route.geojson` | 4,020 km of geometry for 907 km of stages; **10 of 10** fail the gate |
| Kumano Kodo | 4 of 4 stages clear the moment floor; **4 of 4** fail the gate, even sliced from the Nakahechi feature alone |
| Walked line from the OSM way graph (Task 6's algorithm) | **767.5 km** over 32,820 points vs 763.7 km declared; **2 of 33** stages outside ±10 % |
| Same, after RDP at 8 m | max **254** points per stage (the 1,000 cap never binds), ~200 KB of route arrays for the whole route |
| OSM relation member roles for the Camino's six sub-relations | **every role is empty** — variants cannot be separated by role, which is why Task 6 needs a graph search |
| Camino Francés stages with a place beyond their own ends | **7 of 33**, **8 such places in total** — about **0.2 per stage** |
| Service waypoints on the Camino's busiest stage | **393**, against the importer's 400-mark limit |
| `cdn.jsdelivr.net/gh/…@v1/index.json` served today | **1,725 bytes, 3 routes, generated 2026-03-26** — while the `v1` tag points at the August commit |
| `…@v1.6.0/index.json` and `…@main/index.json` served today | **5,071 bytes, 7 routes, generated 2026-08-19** |

**Consequence, stated plainly:** after this plan, `routes/camino-frances/ways/` exists, validates, and is the one route `index.json` lists — flagged `sparse`, because it carries a place beyond the day's own ends on 7 of its 33 stages and the app's card should say so. Shikoku 88 is the mirror image: well curated, but with stage distances no walked line can be measured against, so it stays unlisted. Curating more places onto the Camino's stages, and correcting Shikoku's stage distances, are dataset-content jobs outside this plan. The report is what makes that visible instead of guessed at.

## Global Constraints

- **Data licence** for everything under `routes/` (including the new `ways/` directories and `route.main.geojson`) is **ODbL 1.0**; code (`schema/`, `scripts/`, `docs/`) is **MIT**.
- **Coordinates are `[longitude, latitude]`, optionally `[longitude, latitude, altitude]`** (GeoJSON order) in every GeoJSON file. Way files use the app's `{lat, lon}` object order instead — never mix the two in one function.
- **Localized strings are `{ "en": "…" }` maps with `en` always required.**
- **`schemaVersion` is a SemVer string in every file the build writes** (`"1.0.0"`).
- **Route IDs are kebab-case**, matching `^[a-z0-9-]{1,64}$`.
- **Every output is validated against its JSON Schema inside the pipeline**; a route that fails validation fails the build.
- **No placeholders.** No `TODO`, no stub data, no file written with fields the schema does not describe.
- **Comments explain why, never what.** The repo's existing scripts are the model: every comment in `build-index.ts` and `cli.ts` justifies a decision.
- **Never commit to `main`.** All work happens on `feat/ways-build` in `/Users/rubberduck/GitHub/momentmaker/open-pilgrimages/.worktrees/ways-build`.
- **Every commit message ends with:**
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```
- **Never use `--no-verify`.**
- If `node_modules/` is absent in the worktree, run `npm ci` once before the first test run.

**Verified facts every task depends on** (measured, not assumed — do not "fix" code to disagree with these):

- **The wire format is the iOS fixture's, not Swift `Codable`'s.** The app does not decode a stage file with `Way`'s synthesized `Codable`; `PilgrimageWayImporter` reads a flat shape and constructs the `Way` itself. A moment is `{ "id", "frac", "kind": "waypoint", "label", "icon", "text"?, "names"?, "sitMinutes"?, "at": {lat,lon}, "pin": {lat,lon} }` — flat, never `"kind": { "waypoint": { … } }`. A stage file carries **no `source` field**: the app assigns `.pilgrimage(routeId:stageIndex:)` from `stage.routeId` and `stage.index`, and refuses a file whose stage block disagrees with the route and index it was fetched for.
- **Caps come from the importer, not from taste:** moment `label` 80 characters, `icon` 64, `text` 600, stage `theme` 80; at most 200 moments, 400 marks, and 2,000 route points per stage; 2 MB per stage file and 512 KB for `route.json`.
- **`departedAt` and the report's `generatedAt` are the route's own `metadata.lastUpdated`**, never wall-clock time — CI regenerates and then fails on any diff under `routes/`.
- **`route.json`'s `summary` is `metadata.description.en`.** `metadata.overview.description` does not exist in any of the seven routes.
- **`tzIdentifier` is omitted.** No route's `metadata.json` carries a time zone.
- **Pipeline order is `fetch → build-ways → build-index → validate`.** `build-index` reads each route's report to decide its `ways` entry, so it must run after `build-ways`, and it remains the only writer of `index.json`.
- **A route that fails the length gate gets a `report.json`, no package, and exit 0.** Only a schema failure exits non-zero.
- **The app reads the catalog from `@main`, and packages from the exact `release` tag.** jsDelivr caches tag URLs permanently, so a moved tag keeps serving old bytes; see Task 7 for the measurement.

## File Structure

**New — the contract:**
- `schema/way.schema.json` — a stage Way file, exactly as the iOS app decodes it. Changing it is changing the app.
- `schema/way-route.schema.json` — `ways/route.json`, the route's card data.
- `schema/way-report.schema.json` — `ways/report.json`, the coverage report.
- `scripts/ways/types.ts` — the TypeScript mirror of those three schemas. One file, no logic.

**New — the build, one responsibility each:**
- `scripts/ways/geo.ts` + `geo.test.ts` — haversine metres, line concatenation, cumulative distance, stage boundaries, RDP, the stride cap, projection onto a line, the clock, the length gate.
- `scripts/ways/text.ts` — `cap` and `nonEnglishNames`, the two string rules every module shares.
- `scripts/ways/moments.ts` + `moments.test.ts` — which waypoints become moments, their icons, composed text, local names, sit minutes, the start/end places, the 300 m drop.
- `scripts/ways/marks.ts` + `marks.test.ts` — which waypoints become marks and their kinds.
- `scripts/ways/stage.ts` + `stage.test.ts` — the `stage` block on a Way file.
- `scripts/ways/catalog.ts` + `catalog.test.ts` — `route.json`, `report.json`, and the coverage flag.
- `scripts/build-ways.ts` + `build-ways.test.ts` — read a route, drive the modules, validate, write.
- `scripts/enrich/build-main-line.ts` + `build-main-line.test.ts` — the walked line, from OSM way geometry.

**New — the fixture route (checked in, never under `routes/`):**
- `scripts/fixtures/way-fixture-route/metadata.json`
- `scripts/fixtures/way-fixture-route/stages.json`
- `scripts/fixtures/way-fixture-route/waypoints.geojson`
- `scripts/fixtures/way-fixture-route/route.main.geojson`

**Modified:**
- `scripts/build-index.ts` — adds `release` and per-route `ways` to `index.json`; exports `REGION_BY_COUNTRY` so `catalog.ts` cannot drift from it.
- `scripts/validate.ts` — validates `route.main.geojson` and every `ways/*.json`.
- `schema/index.schema.json` — describes `release` and `ways`.
- `schema/stages.schema.json` — makes `interior.reflection` required (spec open question 4).
- `package.json` — `build-ways`, `build-main-line`, and the new `pipeline`.
- `.github/workflows/validate.yml` — runs `npm run build-ways` so ways files are drift-checked like `docs/assets`.
- `.claude/commands/release.md` — regenerate-and-commit before tagging, and the `v1` finding.
- `CHANGELOG.md`, `schema/CHANGELOG.md`, `README.md`, `CLAUDE.md`, `docs/usage.html`, `docs/schema.html` — documentation.
- `.gitignore` — a `.build-ways-test-*/` entry beside the existing `.build-index-test-*/`, for the temp repos `build-ways.test.ts` creates inside the repo root.

---

## Task 1: The contract — schemas, types, and a fixture route

**Files:**
- Create: `schema/way.schema.json`
- Create: `schema/way-route.schema.json`
- Create: `schema/way-report.schema.json`
- Create: `scripts/ways/types.ts`
- Create: `scripts/fixtures/way-fixture-route/metadata.json`
- Create: `scripts/fixtures/way-fixture-route/stages.json`
- Create: `scripts/fixtures/way-fixture-route/waypoints.geojson`
- Create: `scripts/fixtures/way-fixture-route/route.main.geojson`
- Create: `scripts/ways/contract.test.ts`
- Modify: `.gitignore` (add `.build-ways-test-*/`)

**Interfaces:**
- Produces: `schema/way.schema.json`, `schema/way-route.schema.json`, `schema/way-report.schema.json` — loadable by Ajv 2020 under those exact names, the way `validate.ts` loads the existing five.
- Produces: `scripts/ways/types.ts` exporting `Position`, `WayCoordinate`, `WayRoutePoint`, `WayMoment`, `WayMarkKind`, `WayMark`, `WayStage`, `WayFile`, `WayRouteFile`, `WayReportStage`, `WayReportFile`, `SCHEMA_VERSION`.
- Produces: `scripts/fixtures/way-fixture-route/` — a three-stage synthetic route whose walked line is a `MultiLineString`, with 15 waypoints covering every moment type and every mark kind, one off-line moment waypoint, one off-line mark waypoint, a temple with structured fields and no description, and a third stage whose slice is deliberately 23.6 % longer than its declared distance.
- Produces: a `.gitignore` entry for `.build-ways-test-*/`, which Task 5's CLI tests need — they `mkdtempSync(join(ROOT, ".build-ways-test-"))` inside the repo root, because node can only resolve the bare `tsx` loader by walking up to this repo's own `node_modules/`.

**Why the Way JSON looks the way it does:** it is not a design choice. It is the wire format `PilgrimageWayImporter` reads, fixed by Task 1 of the iOS plan (`pilgrim-ios/.worktrees/honor-slice-two/docs/superpowers/plans/2026-09-04-honor-slice-two-ios.md`) and its `stage-00.json` / `stage-01.json` / `route.json` fixtures. The app does **not** decode a stage file with `Way`'s synthesized `Codable`; the importer parses named fields and constructs the `Way` itself, the way `WayImporter` builds one from a `TourManifest`. Three consequences the schema below encodes:

- A moment is **flat**: `"kind": "waypoint"` is a string, with `label` and `icon` as siblings — never `"kind": { "waypoint": { … } }`.
- A stage file has **no `source` field**. The app assigns `.pilgrimage(routeId:stageIndex:)` from `stage.routeId` and `stage.index`, and refuses a file whose stage block disagrees with what it fetched.
- Every field of the `stage` block is **required** — `WayStage` declares `theme`, `narrative`, `closing`, `warnings`, `gainMeters` and `difficulty` non-optional — so the build always writes them, with an empty string or an empty array where the dataset is silent.

The importer skips what it does not recognise (its own test asserts an unknown mark `kind` is skipped, not fatal), which is why the repo's `schemaVersion` can ride along inertly.

- [ ] **Step 1: Write the failing test**

Create `scripts/ways/contract.test.ts`:

```ts
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
  assert.equal(wp.features.length, 15);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="way schemas compile"` (or `node --import tsx --test scripts/ways/contract.test.ts`)
Expected: FAIL — `Cannot find module './types.js'` / `ENOENT: no such file or directory, open '.../schema/way.schema.json'`

- [ ] **Step 3: Write `scripts/ways/types.ts`**

```ts
/** SemVer of every file this build writes, per the repo's schemaVersion rule. */
export const SCHEMA_VERSION = "1.0.0";

/** GeoJSON order: [lon, lat] or [lon, lat, alt]. Never [lat, lon]. */
export type Position = [number, number] | [number, number, number];

/** The app's order: an object, lat first. Never a bare array. */
export interface WayCoordinate {
  lat: number;
  lon: number;
}

export interface WayRoutePoint {
  lat: number;
  lon: number;
  alt?: number;
  /** Seconds since departure, synthesized from the stage's estimated hours. */
  t: number;
}

export interface WayMoment {
  id: string;
  frac: number;
  /**
   * Flat, as PilgrimageWayImporter reads it — never the nested single-key
   * object Way's synthesized Codable would write. Only waypoints exist here.
   */
  kind: "waypoint";
  /** Capped at 80: WayImporter.maxLabelCharacters. */
  label: string;
  /** SF Symbol name; the app falls back to `mappin` for one the device lacks. */
  icon: string;
  text?: string;
  names?: Record<string, string>;
  sitMinutes?: number;
  /** On the line, so the engine's 60 m trigger fires as the walker passes. */
  at: WayCoordinate;
  /** The place's own coordinate, for the map pin. */
  pin: WayCoordinate;
}

export type WayMarkKind = "water" | "food" | "bed" | "transport" | "supply" | "medical";

export interface WayMark {
  id: string;
  kind: WayMarkKind;
  name: string;
  at: WayCoordinate;
  frac: number;
  offLineMeters: number;
}

export interface WayStageHours {
  min: number;
  max: number;
}

export interface WayStagePlace {
  name: string;
  at: WayCoordinate;
}

/**
 * Every field is required: the app's `WayStage` declares them non-optional, so
 * the build writes an empty string or an empty array where the dataset is
 * silent rather than dropping a key the decoder expects.
 */
export interface WayStage {
  routeId: string;
  index: number;
  count: number;
  name: string;
  theme: string;
  narrative: string;
  closing: string;
  warnings: string[];
  distanceKm: number;
  gainMeters: number;
  hours: WayStageHours;
  difficulty: string;
  start: WayStagePlace;
  end: WayStagePlace;
}

/**
 * No `source`: the app assigns `.pilgrimage(routeId:stageIndex:)` from the
 * stage block and refuses a file whose block disagrees with what it fetched.
 */
export interface WayFile {
  schemaVersion: string;
  id: string;
  title: string;
  /** ISO-8601, whole seconds, UTC. */
  departedAt: string;
  route: WayRoutePoint[];
  totalDistanceMeters: number;
  theirActiveSeconds: number;
  moments: WayMoment[];
  marks: WayMark[];
  stage: WayStage;
}

export interface WayRouteStage {
  index: number;
  name: string;
  distanceKm: number;
  gainMeters?: number;
  hours: WayStageHours;
  difficulty?: string;
}

export interface WayRouteFile {
  schemaVersion: string;
  id: string;
  name: string;
  names?: Record<string, string>;
  country: string;
  region: string;
  distanceKm: number;
  stageCount: number;
  tradition: string;
  summary: string;
  cover?: string;
  stages: WayRouteStage[];
}

export interface WayReportStage {
  index: number;
  name: string;
  sliceKm: number;
  distanceKm: number;
  ratio: number;
  passedGate: boolean;
  boundaryMode: "snap" | "proportional";
  routePoints: number;
  moments: number;
  momentsBeyondEnds: number;
  momentsWithText: number;
  marks: number;
  /** How many marks the 400-mark app limit left behind, if any. */
  marksTrimmed: number;
  dropped: string[];
}

export interface WayReportFile {
  schemaVersion: string;
  routeId: string;
  generatedAt: string;
  walkedLine: { source: string; points: number; lengthKm: number };
  stages: WayReportStage[];
  gate: { passed: boolean; failing: number[] };
  /**
   * How well curated the route is. This does not gate anything — it becomes
   * the `sparse` flag and `placesPerStage` on the catalog entry, and the app
   * says "few places marked yet" on a sparse route's card.
   */
  places: {
    sparse: boolean;
    stagesWithMomentBeyondEnds: number;
    halfOfStages: number;
    placesPerStage: number;
    note?: string;
  };
}
```

- [ ] **Step 4: Write `schema/way.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/schema/way.schema.json",
  "title": "Pilgrimage Stage Way",
  "description": "One stage of a pilgrimage route, in the wire format the Pilgrim iOS app's PilgrimageWayImporter reads. Flat moments, no source field, every stage field required. A change here is a change to the app.",
  "type": "object",
  "required": [
    "schemaVersion", "id", "title", "departedAt",
    "route", "totalDistanceMeters", "theirActiveSeconds", "moments", "marks", "stage"
  ],
  "properties": {
    "schemaVersion": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "id": { "type": "string", "pattern": "^pilgrimage:[a-z0-9-]{1,64}:[0-9]{1,3}$" },
    "title": { "type": "string", "minLength": 1, "maxLength": 120 },
    "departedAt": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$",
      "description": "Whole-second UTC. Never shown for a stage."
    },
    "tzIdentifier": { "type": "string", "minLength": 1, "maxLength": 64 },
    "route": {
      "type": "array",
      "minItems": 2,
      "maxItems": 1000,
      "items": { "$ref": "#/$defs/RoutePoint" }
    },
    "totalDistanceMeters": { "type": "number", "exclusiveMinimum": 0, "maximum": 400000 },
    "theirActiveSeconds": { "type": "number", "exclusiveMinimum": 0, "maximum": 172800 },
    "moments": { "type": "array", "maxItems": 200, "items": { "$ref": "#/$defs/Moment" } },
    "marks": { "type": "array", "maxItems": 400, "items": { "$ref": "#/$defs/Mark" } },
    "stage": { "$ref": "#/$defs/Stage" }
  },
  "additionalProperties": false,

  "$defs": {
    "Coordinate": {
      "type": "object",
      "required": ["lat", "lon"],
      "properties": {
        "lat": { "type": "number", "minimum": -90, "maximum": 90 },
        "lon": { "type": "number", "minimum": -180, "maximum": 180 }
      },
      "additionalProperties": false
    },
    "RoutePoint": {
      "type": "object",
      "required": ["lat", "lon", "t"],
      "properties": {
        "lat": { "type": "number", "minimum": -90, "maximum": 90 },
        "lon": { "type": "number", "minimum": -180, "maximum": 180 },
        "alt": { "type": "number", "minimum": -500, "maximum": 9000 },
        "t": { "type": "number", "minimum": 0, "maximum": 172800 }
      },
      "additionalProperties": false
    },
    "Moment": {
      "type": "object",
      "description": "Flat: kind is the string \"waypoint\", with label and icon as siblings. The nested single-key object Way's synthesized Codable would write is exactly what this shape exists to reject.",
      "required": ["id", "frac", "kind", "label", "icon", "at", "pin"],
      "properties": {
        "id": { "type": "string", "minLength": 1, "maxLength": 80 },
        "frac": { "type": "number", "minimum": 0, "maximum": 1 },
        "kind": { "const": "waypoint" },
        "label": { "type": "string", "minLength": 1, "maxLength": 80 },
        "icon": { "type": "string", "minLength": 1, "maxLength": 64 },
        "text": { "type": "string", "minLength": 1, "maxLength": 600 },
        "names": {
          "type": "object",
          "minProperties": 1,
          "additionalProperties": { "type": "string", "minLength": 1, "maxLength": 120 }
        },
        "sitMinutes": { "type": "integer", "minimum": 1, "maximum": 60 },
        "at": { "$ref": "#/$defs/Coordinate" },
        "pin": { "$ref": "#/$defs/Coordinate" }
      },
      "additionalProperties": false
    },
    "Mark": {
      "type": "object",
      "required": ["id", "kind", "name", "at", "frac", "offLineMeters"],
      "properties": {
        "id": { "type": "string", "minLength": 1, "maxLength": 80 },
        "kind": { "type": "string", "enum": ["water", "food", "bed", "transport", "supply", "medical"] },
        "name": { "type": "string", "minLength": 1, "maxLength": 80 },
        "at": { "$ref": "#/$defs/Coordinate" },
        "frac": { "type": "number", "minimum": 0, "maximum": 1 },
        "offLineMeters": { "type": "number", "minimum": 0, "maximum": 300 }
      },
      "additionalProperties": false
    },
    "Stage": {
      "type": "object",
      "description": "Every field required: the app's WayStage declares them non-optional. The build writes an empty string or array where the dataset is silent.",
      "required": [
        "routeId", "index", "count", "name", "theme", "narrative", "closing",
        "warnings", "distanceKm", "gainMeters", "hours", "difficulty", "start", "end"
      ],
      "properties": {
        "routeId": { "type": "string", "pattern": "^[a-z0-9-]{1,64}$" },
        "index": { "type": "integer", "minimum": 0, "maximum": 199 },
        "count": { "type": "integer", "minimum": 1, "maximum": 200 },
        "name": { "type": "string", "minLength": 1, "maxLength": 120 },
        "theme": { "type": "string", "maxLength": 80 },
        "narrative": { "type": "string", "maxLength": 2000 },
        "closing": { "type": "string", "maxLength": 400 },
        "warnings": {
          "type": "array",
          "maxItems": 10,
          "items": { "type": "string", "minLength": 1, "maxLength": 300 }
        },
        "distanceKm": { "type": "number", "exclusiveMinimum": 0, "maximum": 400 },
        "gainMeters": { "type": "number", "minimum": 0, "maximum": 10000 },
        "hours": {
          "type": "object",
          "required": ["min", "max"],
          "properties": {
            "min": { "type": "number", "exclusiveMinimum": 0, "maximum": 48 },
            "max": { "type": "number", "exclusiveMinimum": 0, "maximum": 48 }
          },
          "additionalProperties": false
        },
        "difficulty": { "type": "string", "enum": ["easy", "moderate", "hard", "expert", ""] },
        "start": { "$ref": "#/$defs/Place" },
        "end": { "$ref": "#/$defs/Place" }
      },
      "additionalProperties": false
    },
    "Place": {
      "type": "object",
      "required": ["name", "at"],
      "properties": {
        "name": { "type": "string", "minLength": 1, "maxLength": 120 },
        "at": { "$ref": "#/$defs/Coordinate" }
      },
      "additionalProperties": false
    }
  }
}
```

`theme`, `narrative`, `closing` and `difficulty` allow the empty string on purpose: they are required keys the app's model cannot represent as absent, and a route that arrives without an interior should ship a silent card rather than fail its whole build. The report counts what is missing.

- [ ] **Step 5: Write `schema/way-route.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/schema/way-route.schema.json",
  "title": "Pilgrimage Way Route Card",
  "description": "routes/<route-id>/ways/route.json — the route's card data, downloaded with its stages.",
  "type": "object",
  "required": ["schemaVersion", "id", "name", "country", "region", "distanceKm", "stageCount", "tradition", "summary", "stages"],
  "properties": {
    "schemaVersion": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "id": { "type": "string", "pattern": "^[a-z0-9-]{1,64}$" },
    "name": { "type": "string", "minLength": 1, "maxLength": 120 },
    "names": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": { "type": "string", "minLength": 1, "maxLength": 120 }
    },
    "country": { "type": "string", "pattern": "^[A-Z]{2}$" },
    "region": { "type": "string", "enum": ["Europe", "Asia", "Americas", "Africa", "Oceania", "Middle East", "Other"] },
    "distanceKm": { "type": "number", "exclusiveMinimum": 0, "maximum": 10000 },
    "stageCount": { "type": "integer", "minimum": 1, "maximum": 200 },
    "tradition": { "type": "string", "enum": ["christian", "buddhist", "shinto", "multi-faith", "secular", "mixed"] },
    "summary": { "type": "string", "minLength": 1, "maxLength": 600 },
    "cover": { "type": "string", "pattern": "^[a-z0-9._-]{1,64}$" },
    "stages": {
      "type": "array",
      "minItems": 1,
      "maxItems": 200,
      "items": {
        "type": "object",
        "required": ["index", "name", "distanceKm", "hours"],
        "properties": {
          "index": { "type": "integer", "minimum": 0, "maximum": 199 },
          "name": { "type": "string", "minLength": 1, "maxLength": 120 },
          "distanceKm": { "type": "number", "exclusiveMinimum": 0, "maximum": 400 },
          "gainMeters": { "type": "number", "minimum": 0, "maximum": 10000 },
          "hours": {
            "type": "object",
            "required": ["min", "max"],
            "properties": {
              "min": { "type": "number", "exclusiveMinimum": 0, "maximum": 48 },
              "max": { "type": "number", "exclusiveMinimum": 0, "maximum": 48 }
            },
            "additionalProperties": false
          },
          "difficulty": { "type": "string", "enum": ["easy", "moderate", "hard", "expert"] }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 6: Write `schema/way-report.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/schema/way-report.schema.json",
  "title": "Pilgrimage Way Coverage Report",
  "description": "routes/<route-id>/ways/report.json — the honest picture of what a route can promise a walker.",
  "type": "object",
  "required": ["schemaVersion", "routeId", "generatedAt", "walkedLine", "stages", "gate", "places"],
  "properties": {
    "schemaVersion": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "routeId": { "type": "string", "pattern": "^[a-z0-9-]{1,64}$" },
    "generatedAt": { "type": "string", "format": "date-time" },
    "walkedLine": {
      "type": "object",
      "required": ["source", "points", "lengthKm"],
      "properties": {
        "source": { "type": "string", "enum": ["route.main.geojson", "route.geojson"] },
        "points": { "type": "integer", "minimum": 2 },
        "lengthKm": { "type": "number", "exclusiveMinimum": 0 }
      },
      "additionalProperties": false
    },
    "stages": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["index", "name", "sliceKm", "distanceKm", "ratio", "passedGate", "boundaryMode", "routePoints", "moments", "momentsBeyondEnds", "momentsWithText", "marks", "dropped"],
        "properties": {
          "index": { "type": "integer", "minimum": 0 },
          "name": { "type": "string" },
          "sliceKm": { "type": "number", "minimum": 0 },
          "distanceKm": { "type": "number", "minimum": 0 },
          "ratio": { "type": "number", "minimum": 0 },
          "passedGate": { "type": "boolean" },
          "boundaryMode": { "type": "string", "enum": ["snap", "proportional"] },
          "routePoints": { "type": "integer", "minimum": 0 },
          "moments": { "type": "integer", "minimum": 0 },
          "momentsBeyondEnds": { "type": "integer", "minimum": 0 },
          "momentsWithText": { "type": "integer", "minimum": 0 },
          "marks": { "type": "integer", "minimum": 0 },
          "marksTrimmed": { "type": "integer", "minimum": 0 },
          "dropped": { "type": "array", "items": { "type": "string" } }
        },
        "additionalProperties": false
      }
    },
    "gate": {
      "type": "object",
      "required": ["passed", "failing"],
      "properties": {
        "passed": { "type": "boolean" },
        "failing": { "type": "array", "items": { "type": "integer", "minimum": 0 } }
      },
      "additionalProperties": false
    },
    "places": {
      "type": "object",
      "description": "How well curated the route is. Gates nothing: it becomes the sparse flag and placesPerStage on the catalog entry.",
      "required": ["sparse", "stagesWithMomentBeyondEnds", "halfOfStages", "placesPerStage"],
      "properties": {
        "sparse": { "type": "boolean" },
        "stagesWithMomentBeyondEnds": { "type": "integer", "minimum": 0 },
        "halfOfStages": { "type": "integer", "minimum": 0 },
        "placesPerStage": { "type": "number", "minimum": 0 },
        "note": { "type": "string" }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 7: Write the fixture's `metadata.json`**

Create `scripts/fixtures/way-fixture-route/metadata.json`:

```json
{
  "schemaVersion": "1.0.0",
  "id": "fixture-way",
  "lastUpdated": "2026-08-19T00:00:00Z",
  "name": { "en": "Fixture Way", "es": "Camino de Prueba" },
  "description": {
    "en": "A synthetic three-stage route used only by the ways build's tests. Its geometry is two straight legs meeting at a right angle on the equator, so every distance in the tests is arithmetic rather than a guess."
  },
  "overview": {
    "distanceKm": 4.2,
    "estimatedDays": { "min": 3, "max": 3, "typical": 3 },
    "topology": "linear",
    "startPoint": { "name": { "en": "Start Town" }, "coordinates": [0, 0] },
    "endPoint": { "name": { "en": "End Town" }, "coordinates": [0.02, 0.02] },
    "difficulty": "easy",
    "countries": ["ES"]
  },
  "tradition": { "type": "christian" },
  "provenance": {
    "license": "ODbL-1.0",
    "sources": [
      {
        "name": "Synthetic fixture",
        "license": "ODbL-1.0",
        "url": "https://github.com/walktalkmeditate/open-pilgrimages",
        "dataTypes": ["geometry", "stages", "waypoints"]
      }
    ]
  }
}
```

- [ ] **Step 8: Write the fixture's `stages.json`**

Create `scripts/fixtures/way-fixture-route/stages.json`. Stage 2 declares 0.9 km against a 1.1119 km slice — a 23.6 % overshoot, the spec's "deliberately 20 % long" stage.

```json
{
  "schemaVersion": "1.0.0",
  "routeId": "fixture-way",
  "stageCount": 3,
  "stages": [
    {
      "index": 0,
      "name": { "en": "Start Town to Middle", "es": "Pueblo Inicial a Medio" },
      "start": { "name": { "en": "Start Town" }, "coordinates": [0, 0] },
      "end": { "name": { "en": "Middle" }, "coordinates": [0.01, 0] },
      "distanceKm": 1.1,
      "elevationGainMeters": 20,
      "estimatedHours": { "min": 2, "max": 4 },
      "difficulty": "easy",
      "interior": {
        "theme": { "en": "Setting out" },
        "narrative": { "en": "A flat first hour along the equator, which is exactly as unremarkable as it sounds." },
        "reflection": { "en": "What did you bring that you do not need?" }
      }
    },
    {
      "index": 1,
      "name": { "en": "Middle to Bend" },
      "start": { "name": { "en": "Middle" }, "coordinates": [0.01, 0] },
      "end": { "name": { "en": "Bend" }, "coordinates": [0.02, 0.01] },
      "distanceKm": 2.2,
      "elevationGainMeters": 60,
      "estimatedHours": { "min": 4, "max": 6 },
      "difficulty": "moderate",
      "warnings": [
        { "en": "The corner at the end of the first leg is unsigned. Turn north." }
      ],
      "interior": {
        "theme": { "en": "The turn" },
        "narrative": { "en": "The way leaves the line it has held all morning and turns north without warning." },
        "reflection": { "en": "Where did you last change direction?" }
      }
    },
    {
      "index": 2,
      "name": { "en": "Bend to End Town" },
      "start": { "name": { "en": "Bend" }, "coordinates": [0.02, 0.01] },
      "end": { "name": { "en": "End Town" }, "coordinates": [0.02, 0.02] },
      "distanceKm": 0.9,
      "elevationGainMeters": 10,
      "estimatedHours": { "min": 2, "max": 3 },
      "difficulty": "easy",
      "interior": {
        "theme": { "en": "Arriving" },
        "narrative": { "en": "A short north leg into the end town." },
        "reflection": { "en": "What arrived with you?" }
      }
    }
  ]
}
```

- [ ] **Step 9: Write the fixture's `route.main.geojson`**

Create `scripts/fixtures/way-fixture-route/route.main.geojson`. Two parts sharing `[0.02, 0]`; the vertices at `[0.007, 0.00005]` (5.6 m off the straight) and `[0.013, 0.00015]` (16.7 m off) exist so the RDP tolerance has something to drop and something to keep.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "fixture-way-main",
      "geometry": {
        "type": "MultiLineString",
        "coordinates": [
          [[0, 0], [0.001, 0], [0.002, 0], [0.003, 0], [0.004, 0], [0.005, 0], [0.006, 0], [0.007, 0.00005], [0.008, 0], [0.009, 0], [0.01, 0], [0.011, 0], [0.012, 0], [0.013, 0.00015], [0.014, 0], [0.015, 0], [0.016, 0], [0.017, 0], [0.018, 0], [0.019, 0], [0.02, 0]],
          [[0.02, 0], [0.02, 0.001], [0.02, 0.002], [0.02, 0.003], [0.02, 0.004], [0.02, 0.005], [0.02, 0.006], [0.02, 0.007], [0.02, 0.008], [0.02, 0.009], [0.02, 0.01], [0.02, 0.011], [0.02, 0.012], [0.02, 0.013], [0.02, 0.014], [0.02, 0.015], [0.02, 0.016], [0.02, 0.017], [0.02, 0.018], [0.02, 0.019], [0.02, 0.02]]
        ]
      },
      "properties": {
        "routeId": "fixture-way",
        "name": "Fixture Way",
        "type": "main",
        "source": "Synthetic fixture, not derived from OpenStreetMap"
      }
    }
  ]
}
```

- [ ] **Step 10: Write the fixture's `waypoints.geojson`**

Create `scripts/fixtures/way-fixture-route/waypoints.geojson`:

```json
{
  "type": "FeatureCollection",
  "features": [
    { "type": "Feature", "id": "wp-start-town", "geometry": { "type": "Point", "coordinates": [0, 0] },
      "properties": { "routeId": "fixture-way", "name": "Start Town", "type": "town", "stageIndex": 0, "kmFromStart": 0, "description": "Where the way begins." } },
    { "type": "Feature", "id": "wp-shrine", "geometry": { "type": "Point", "coordinates": [0.005, 0.0002] },
      "properties": { "routeId": "fixture-way", "name": "Roadside Shrine", "type": "sacred_site", "stageIndex": 0, "kmFromStart": 0.56, "description": "A whitewashed niche with a candle in it." } },
    { "type": "Feature", "id": "wp-museum", "geometry": { "type": "Point", "coordinates": [0.008, 0] },
      "properties": { "routeId": "fixture-way", "name": "Village Museum", "type": "cultural_site", "stageIndex": 0, "kmFromStart": 0.89 } },
    { "type": "Feature", "id": "wp-lookout", "geometry": { "type": "Point", "coordinates": [0.012, 0.0005] },
      "properties": { "routeId": "fixture-way", "name": "Lookout", "type": "viewpoint", "stageIndex": 1, "kmFromStart": 1.33, "description": "The whole first leg, behind you." } },
    { "type": "Feature", "id": "temple-3", "geometry": { "type": "Point", "coordinates": [0.016, 0] },
      "properties": { "routeId": "fixture-way", "name": "Third Temple", "type": "sacred_site", "subtype": "temple", "stageIndex": 1, "kmFromStart": 1.78, "templeNumber": 3, "tradition": "buddhist", "denomination": "Koyasan Shingon", "credentialStamp": true, "stampFee": { "currency": "JPY", "amount": 500 } } },
    { "type": "Feature", "id": "wp-office", "geometry": { "type": "Point", "coordinates": [0.02, 0.004] },
      "properties": { "routeId": "fixture-way", "name": "Pilgrim Office", "nameLocalized": { "es": "Oficina del Peregrino" }, "type": "credential_stamp", "stageIndex": 1, "kmFromStart": 2.67, "credentialStamp": true } },
    { "type": "Feature", "id": "wp-far-chapel", "geometry": { "type": "Point", "coordinates": [0.014, 0.004] },
      "properties": { "routeId": "fixture-way", "name": "Far Chapel", "type": "sacred_site", "stageIndex": 1, "kmFromStart": 1.56 } },
    { "type": "Feature", "id": "wp-end-town", "geometry": { "type": "Point", "coordinates": [0.02, 0.02] },
      "properties": { "routeId": "fixture-way", "name": "End Town", "nameLocalized": { "es": "Pueblo Final" }, "type": "town", "stageIndex": 2, "kmFromStart": 4.45 } },
    { "type": "Feature", "id": "wp-fuente", "geometry": { "type": "Point", "coordinates": [0.006, 0.0003] },
      "properties": { "routeId": "fixture-way", "name": "Fuente del Camino", "type": "water_source", "stageIndex": 0, "kmFromStart": 0.67, "waterReliability": "permanent" } },
    { "type": "Feature", "id": "wp-far-fountain", "geometry": { "type": "Point", "coordinates": [0.007, 0.004] },
      "properties": { "routeId": "fixture-way", "name": "Far Fountain", "type": "water_source", "stageIndex": 0, "kmFromStart": 0.78 } },
    { "type": "Feature", "id": "wp-cafe", "geometry": { "type": "Point", "coordinates": [0.013, 0.0002] },
      "properties": { "routeId": "fixture-way", "name": "Bar Central", "type": "food", "stageIndex": 1, "kmFromStart": 1.45 } },
    { "type": "Feature", "id": "wp-albergue", "geometry": { "type": "Point", "coordinates": [0.02, 0.012] },
      "properties": { "routeId": "fixture-way", "name": "Albergue Municipal", "type": "accommodation", "stageIndex": 2, "kmFromStart": 3.56, "capacity": 24 } },
    { "type": "Feature", "id": "wp-clinic", "geometry": { "type": "Point", "coordinates": [0.02, 0.014] },
      "properties": { "routeId": "fixture-way", "name": "Centro de Salud", "type": "medical", "stageIndex": 2, "kmFromStart": 3.78 } },
    { "type": "Feature", "id": "wp-shop", "geometry": { "type": "Point", "coordinates": [0.02, 0.016] },
      "properties": { "routeId": "fixture-way", "name": "Tienda", "type": "supply", "stageIndex": 2, "kmFromStart": 4 } },
    { "type": "Feature", "id": "wp-bus", "geometry": { "type": "Point", "coordinates": [0.02, 0.018] },
      "properties": { "routeId": "fixture-way", "name": "Parada de Autobús", "type": "transport", "stageIndex": 2, "kmFromStart": 4.22 } }
  ]
}
```

- [ ] **Step 11: Ignore the temp repos Task 5's CLI tests create**

`.worktrees/` is already committed on this branch, so nothing is pending there. What is missing is the sibling of the existing `.build-index-test-*/` entry (line 16). In `.gitignore`, on the line after it, add:

```
.build-ways-test-*/
```

Verify: `git check-ignore -v .build-ways-test-abc/`
Expected: `.gitignore:17:.build-ways-test-*/	.build-ways-test-abc/`

- [ ] **Step 12: Run the test to verify it passes**

Run: `node --import tsx --test scripts/ways/contract.test.ts`
Expected: PASS — `ℹ pass 9`, `ℹ fail 0`

- [ ] **Step 13: Type-check**

Run: `npx tsc --noEmit`
Expected: no output, exit 0

- [ ] **Step 14: Commit**

```bash
git add .gitignore schema/way.schema.json schema/way-route.schema.json schema/way-report.schema.json \
  scripts/ways/types.ts scripts/ways/contract.test.ts scripts/fixtures/way-fixture-route
git commit -m "$(cat <<'EOF'
feat(ways): pin the Way file contract in schema, types, and a fixture route

The Way JSON is not a design choice — it is the wire format the Pilgrim app's
PilgrimageWayImporter reads: flat moments with kind as a string, no source
field, every stage field required. The schema rejects the nested single-key
object Swift's synthesized Codable would write, because emitting that instead
is the one mistake this contract exists to catch. A TypeScript mirror lets the
build be checked against it, and a synthetic three-stage route gives every
later task real arithmetic to assert against.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Geometry — slicing, simplifying, the clock, and the gate

**Files:**
- Create: `scripts/ways/geo.ts`
- Create: `scripts/ways/geo.test.ts`

**Interfaces:**
- Consumes: `Position`, `WayRoutePoint` from `scripts/ways/types.ts` (Task 1).
- Produces:
  - `haversineMeters(a: Position, b: Position): number`
  - `walkedLine(fc: unknown): Position[]` — concatenates every feature's `LineString` / `MultiLineString` parts in file order, dropping a point identical to its predecessor.
  - `cumulativeMeters(line: Position[]): number[]`
  - `lineLengthMeters(line: Position[]): number`
  - `nearestVertex(line: Position[], p: Position): { index: number; meters: number }`
  - `indexAtMeters(cumulative: number[], meters: number): number`
  - `stageBoundaries(line: Position[], cumulative: number[], anchors: Position[], declaredKm: number[], snapMeters?: number): Boundary[]` where `Boundary = { index: number; offMeters: number; mode: "snap" | "proportional" }`
  - `simplify(line: Position[], toleranceMeters: number): Position[]` — Ramer–Douglas–Peucker
  - `strideCap(line: Position[], maxPoints: number): Position[]`
  - `roundLine(line: Position[]): Position[]` — 6 decimal places, then drop repeats
  - `projectOnLine(line: Position[], cumulative: number[], p: Position): { frac: number; at: Position; offLineMeters: number }`
  - `routePoints(line: Position[], cumulative: number[], hours: number): WayRoutePoint[]`
  - `withinGate(measuredKm: number, declaredKm: number, tolerance?: number): boolean`
  - constants `RDP_TOLERANCE_METERS = 8`, `MAX_ROUTE_POINTS = 1000`, `SNAP_METERS = 500`, `GATE_TOLERANCE = 0.10`

**Why not reuse `scripts/enrich/geo-utils.ts`:** it works in kilometres, has no tests, and computes projections through a law-of-cosines `dotProjection` that loses precision at the metre scale this build works in. It stays where it is, serving the enrichment scripts.

- [ ] **Step 1: Write the failing test**

Create `scripts/ways/geo.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import {
  haversineMeters,
  walkedLine,
  cumulativeMeters,
  lineLengthMeters,
  nearestVertex,
  indexAtMeters,
  stageBoundaries,
  simplify,
  strideCap,
  roundLine,
  projectOnLine,
  routePoints,
  withinGate,
  RDP_TOLERANCE_METERS,
  MAX_ROUTE_POINTS,
} from "./geo.js";
import type { Position } from "./types.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "way-fixture-route");
const fixtureLine = () =>
  walkedLine(JSON.parse(readFileSync(join(FIXTURE, "route.main.geojson"), "utf-8")));

/** 0.001° at the equator, to 4 dp, on the R = 6,371,000 m sphere. */
const DEG_MILLI_METERS = 111.1949;

test("haversineMeters measures a milli-degree at the equator", () => {
  assert.ok(Math.abs(haversineMeters([0, 0], [0.001, 0]) - DEG_MILLI_METERS) < 0.001);
  assert.ok(Math.abs(haversineMeters([0, 0], [0, 0.001]) - DEG_MILLI_METERS) < 0.001);
});

test("haversineMeters is zero for a point against itself", () => {
  assert.equal(haversineMeters([-1.236, 43.163], [-1.236, 43.163]), 0);
});

test("walkedLine concatenates MultiLineString parts and drops the shared seam point", () => {
  const line = fixtureLine();
  // 21 + 21 points, minus the [0.02, 0] both parts carry.
  assert.equal(line.length, 41);
  assert.deepEqual(line[0], [0, 0]);
  assert.deepEqual(line[40], [0.02, 0.02]);
});

test("walkedLine reads a LineString feature too", () => {
  const line = walkedLine({
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[0, 0], [0, 0], [0.001, 0]] }, properties: {} }],
  });
  assert.deepEqual(line, [[0, 0], [0.001, 0]]);
});

test("cumulativeMeters starts at zero and ends at the line length", () => {
  const line = fixtureLine();
  const cum = cumulativeMeters(line);
  assert.equal(cum.length, line.length);
  assert.equal(cum[0], 0);
  assert.ok(Math.abs(cum[40] - lineLengthMeters(line)) < 1e-9);
  assert.ok(Math.abs(cum[40] - 4450.563) < 0.01);
});

test("nearestVertex finds the index and its distance", () => {
  const line = fixtureLine();
  const found = nearestVertex(line, [0.0101, 0]);
  assert.equal(found.index, 10);
  assert.ok(Math.abs(found.meters - 11.1) < 0.2);
});

test("indexAtMeters returns the last vertex at or before the distance", () => {
  const cum = cumulativeMeters(fixtureLine());
  assert.equal(indexAtMeters(cum, 0), 0);
  assert.equal(indexAtMeters(cum, DEG_MILLI_METERS * 3.5), 3);
  assert.equal(indexAtMeters(cum, 1e9), 40);
});

test("stageBoundaries snaps to the nearest vertex when the anchor is on the line", () => {
  const line = fixtureLine();
  const cum = cumulativeMeters(line);
  const bounds = stageBoundaries(
    line,
    cum,
    [[0, 0], [0.01, 0], [0.02, 0.01], [0.02, 0.02]],
    [1.1, 2.2, 0.9],
  );
  assert.deepEqual(bounds.map((b) => b.index), [0, 10, 30, 40]);
  assert.deepEqual(bounds.map((b) => b.mode), ["snap", "snap", "snap", "snap"]);
});

test("stageBoundaries falls back to the declared-distance position for an anchor far off the line", () => {
  const line = fixtureLine();
  const cum = cumulativeMeters(line);
  // The middle anchor is ~4.4 km north of the line — the shape a stage-boundary
  // town takes when OSM's main relation does not pass through it at all.
  const bounds = stageBoundaries(
    line,
    cum,
    [[0, 0], [0.01, 0.04], [0.02, 0.01], [0.02, 0.02]],
    [1.1, 2.2, 0.9],
  );
  assert.equal(bounds[1].mode, "proportional");
  assert.ok(bounds[1].offMeters > 500);
  // 1.1 of 4.2 declared km along a 4450.563 m line = 1165.4 m in, which is
  // vertex 10 (1112.2 m) — the last one at or before it.
  assert.equal(bounds[1].index, 10);
  assert.deepEqual([bounds[0].mode, bounds[2].mode, bounds[3].mode], ["snap", "snap", "snap"]);
});

test("simplify drops a vertex inside the tolerance and keeps one outside it", () => {
  const line = fixtureLine();
  // Stage 0's slice: the only bend is 5.6 m off the straight, inside 8 m.
  assert.deepEqual(simplify(line.slice(0, 11), RDP_TOLERANCE_METERS), [[0, 0], [0.01, 0]]);
  // Stage 1's slice keeps the 16.7 m bend and the right-angle corner.
  const stage1 = simplify(line.slice(10, 31), RDP_TOLERANCE_METERS);
  assert.deepEqual(stage1, [[0.01, 0], [0.012, 0], [0.013, 0.00015], [0.014, 0], [0.02, 0], [0.02, 0.01]]);
});

test("simplify returns a two-point line unchanged", () => {
  assert.deepEqual(simplify([[0, 0], [0.01, 0]], RDP_TOLERANCE_METERS), [[0, 0], [0.01, 0]]);
});

test("strideCap keeps the endpoints and never exceeds the cap", () => {
  const line: Position[] = Array.from({ length: 3000 }, (_, i) => [i * 0.0001, 0]);
  const capped = strideCap(line, MAX_ROUTE_POINTS);
  assert.ok(capped.length <= MAX_ROUTE_POINTS, `got ${capped.length}`);
  assert.deepEqual(capped[0], line[0]);
  assert.deepEqual(capped.at(-1), line.at(-1));
});

test("strideCap leaves a line already under the cap alone", () => {
  const line: Position[] = [[0, 0], [0.001, 0], [0.002, 0]];
  assert.deepEqual(strideCap(line, MAX_ROUTE_POINTS), line);
});

test("roundLine rounds to six decimals and drops the repeats that creates", () => {
  assert.deepEqual(
    roundLine([[0.0000001, 0], [0.0000002, 0], [0.001, 0]]),
    [[0, 0], [0.001, 0]],
  );
});

test("projectOnLine puts a point on the line and reports how far off it was", () => {
  const line = simplify(fixtureLine().slice(0, 11), RDP_TOLERANCE_METERS);
  const cum = cumulativeMeters(line);
  const shrine = projectOnLine(line, cum, [0.005, 0.0002]);
  assert.ok(Math.abs(shrine.frac - 0.5) < 1e-6);
  assert.deepEqual(shrine.at.map((v) => +v.toFixed(6)), [0.005, 0]);
  assert.ok(Math.abs(shrine.offLineMeters - 22.2) < 0.2);
});

test("projectOnLine clamps to the ends rather than running off the line", () => {
  const line: Position[] = [[0, 0], [0.01, 0]];
  const cum = cumulativeMeters(line);
  assert.equal(projectOnLine(line, cum, [-0.01, 0]).frac, 0);
  assert.equal(projectOnLine(line, cum, [0.02, 0]).frac, 1);
});

test("routePoints synthesize a clock that is monotonic and ends at the stage's hours", () => {
  const line = simplify(fixtureLine().slice(10, 31), RDP_TOLERANCE_METERS);
  const cum = cumulativeMeters(line);
  const pts = routePoints(line, cum, 5);
  assert.equal(pts.length, line.length);
  assert.equal(pts[0].t, 0);
  assert.equal(pts.at(-1)!.t, 18000);
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].t >= pts[i - 1].t, `t fell at ${i}`);
  assert.equal(pts[0].lat, 0);
  assert.equal(pts[0].lon, 0.01);
  assert.equal(pts[0].alt, undefined);
});

test("routePoints carry altitude when the walked line has a third ordinate", () => {
  const line: Position[] = [[0, 0, 172], [0.01, 0, 945]];
  const pts = routePoints(line, cumulativeMeters(line), 1);
  assert.equal(pts[0].alt, 172);
  assert.equal(pts[1].alt, 945);
});

test("withinGate accepts ten percent either way and rejects beyond it", () => {
  assert.equal(withinGate(1.1, 1.0), true);
  assert.equal(withinGate(0.9, 1.0), true);
  assert.equal(withinGate(1.1001, 1.0), false);
  assert.equal(withinGate(0.8999, 1.0), false);
});

test("the fixture's three stages measure what the plan says they measure", () => {
  const line = fixtureLine();
  const cum = cumulativeMeters(line);
  const bounds = stageBoundaries(line, cum, [[0, 0], [0.01, 0], [0.02, 0.01], [0.02, 0.02]], [1.1, 2.2, 0.9]);
  const declared = [1.1, 2.2, 0.9];
  const measured = [0, 1, 2].map((k) => {
    const slice = roundLine(strideCap(simplify(line.slice(bounds[k].index, bounds[k + 1].index + 1), RDP_TOLERANCE_METERS), MAX_ROUTE_POINTS));
    return lineLengthMeters(slice) / 1000;
  });
  assert.ok(Math.abs(measured[0] - 1.111949) < 1e-4, `${measured[0]}`);
  assert.ok(Math.abs(measured[1] - 2.226387) < 1e-4, `${measured[1]}`);
  assert.ok(Math.abs(measured[2] - 1.111949) < 1e-4, `${measured[2]}`);
  assert.deepEqual(measured.map((m, k) => withinGate(m, declared[k])), [true, true, false]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test scripts/ways/geo.test.ts`
Expected: FAIL — `Cannot find module './geo.js'`

- [ ] **Step 3: Write `scripts/ways/geo.ts`**

```ts
import type { Position, WayRoutePoint } from "./types.js";

const EARTH_RADIUS_METERS = 6371000;

/** Ramer–Douglas–Peucker tolerance. See MAX_ROUTE_POINTS for why both exist. */
export const RDP_TOLERANCE_METERS = 8;

/**
 * The engine's on-way threshold is 60 m and WayGeometry.lowestFrac is a linear
 * scan, so a 25 km day at this cap leaves ~25 m between vertices — dense enough
 * to trigger on, cheap enough to scan. OwnWalkWayBuilder's own cap is 4,000, so
 * a stage stays well inside the geometry the app already exercises.
 */
export const MAX_ROUTE_POINTS = 1000;

/**
 * Beyond this, a stage-boundary place is not on the walked line at all — the
 * OSM main relation simply does not pass through it — and snapping to the
 * nearest vertex would hand the neighbouring stages each other's kilometres.
 * Measured on the Camino Francés: snapping alone leaves 7 of 33 stages outside
 * the gate; with this fallback, 2.
 */
export const SNAP_METERS = 500;

export const GATE_TOLERANCE = 0.1;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export function haversineMeters(a: Position, b: Position): number {
  const dLat = toRadians(b[1] - a[1]);
  const dLon = toRadians(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRadians(a[1])) * Math.cos(toRadians(b[1])) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

const samePoint = (a: Position | undefined, b: Position): boolean =>
  a !== undefined && a[0] === b[0] && a[1] === b[1];

/**
 * Flattens a route FeatureCollection into one ordered polyline. MultiLineString
 * parts are concatenated in file order, and a point identical to its
 * predecessor is dropped, because adjacent OSM ways repeat their shared node.
 */
export function walkedLine(fc: unknown): Position[] {
  const features = (fc as { features?: Array<{ geometry?: { type?: string; coordinates?: unknown } }> })
    .features ?? [];
  const line: Position[] = [];

  const push = (part: Position[]) => {
    for (const point of part) {
      if (!samePoint(line[line.length - 1], point)) line.push(point);
    }
  };

  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type === "LineString") {
      push(geometry.coordinates as Position[]);
    } else if (geometry.type === "MultiLineString") {
      for (const part of geometry.coordinates as Position[][]) push(part);
    }
  }

  return line;
}

export function cumulativeMeters(line: Position[]): number[] {
  const cumulative: number[] = [0];
  for (let i = 1; i < line.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineMeters(line[i - 1], line[i]));
  }
  return cumulative;
}

export function lineLengthMeters(line: Position[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += haversineMeters(line[i - 1], line[i]);
  return total;
}

export function nearestVertex(line: Position[], p: Position): { index: number; meters: number } {
  let index = 0;
  let meters = Infinity;
  for (let i = 0; i < line.length; i++) {
    const d = haversineMeters(line[i], p);
    if (d < meters) {
      meters = d;
      index = i;
    }
  }
  return { index, meters };
}

export function indexAtMeters(cumulative: number[], meters: number): number {
  let index = 0;
  for (let i = 0; i < cumulative.length; i++) {
    if (cumulative[i] <= meters) index = i;
    else break;
  }
  return index;
}

export interface Boundary {
  index: number;
  offMeters: number;
  mode: "snap" | "proportional";
}

/**
 * One boundary per stage edge: `anchors` is the stages' start coordinates plus
 * the last stage's end, so it is one longer than `declaredKm`.
 */
export function stageBoundaries(
  line: Position[],
  cumulative: number[],
  anchors: Position[],
  declaredKm: number[],
  snapMeters: number = SNAP_METERS,
): Boundary[] {
  const totalLineMeters = cumulative[cumulative.length - 1];
  const totalDeclaredMeters = declaredKm.reduce((sum, km) => sum + km, 0) * 1000;
  const boundaries: Boundary[] = [];
  let declaredSoFar = 0;

  for (let i = 0; i < anchors.length; i++) {
    const found = nearestVertex(line, anchors[i]);
    if (found.meters <= snapMeters || totalDeclaredMeters === 0) {
      boundaries.push({ index: found.index, offMeters: found.meters, mode: "snap" });
    } else {
      const along = (declaredSoFar / totalDeclaredMeters) * totalLineMeters;
      boundaries.push({
        index: indexAtMeters(cumulative, along),
        offMeters: found.meters,
        mode: "proportional",
      });
    }
    if (i < declaredKm.length) declaredSoFar += declaredKm[i] * 1000;
  }

  return boundaries;
}

/**
 * Metres in a local plane. Over the few hundred metres an RDP or projection
 * step spans, this is exact enough and, unlike a law-of-cosines projection,
 * does not lose precision when the point is nearly on the segment.
 */
function planar(origin: Position, p: Position): [number, number] {
  const lat0 = toRadians(origin[1]);
  return [
    toRadians(p[0]) * Math.cos(lat0) * EARTH_RADIUS_METERS,
    toRadians(p[1]) * EARTH_RADIUS_METERS,
  ];
}

function perpendicularMeters(p: Position, a: Position, b: Position): number {
  const origin: Position = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const [px, py] = planar(origin, p);
  const [ax, ay] = planar(origin, a);
  const [bx, by] = planar(origin, b);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function simplify(line: Position[], toleranceMeters: number): Position[] {
  if (line.length < 3) return line.slice();

  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;

  // Explicit stack rather than recursion: a 38,000-point route would blow the
  // call stack on a pathologically straight segment.
  const stack: Array<[number, number]> = [[0, line.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let farthest = -1;
    let farthestMeters = 0;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularMeters(line[i], line[start], line[end]);
      if (d > farthestMeters) {
        farthestMeters = d;
        farthest = i;
      }
    }
    if (farthestMeters > toleranceMeters && farthest > 0) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }

  return line.filter((_, i) => keep[i] === 1);
}

export function strideCap(line: Position[], maxPoints: number): Position[] {
  if (line.length <= maxPoints) return line.slice();
  const stride = Math.ceil((line.length - 1) / (maxPoints - 1));
  const capped: Position[] = [];
  for (let i = 0; i < line.length; i += stride) capped.push(line[i]);
  const last = line[line.length - 1];
  if (!samePoint(capped[capped.length - 1], last)) capped.push(last);
  return capped;
}

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * Six decimals is ~0.11 m — finer than any GPS fix and half the bytes of the
 * seven OSM publishes. Rounding before measuring is deliberate: the app
 * measures the rounded line, so the build's totalDistanceMeters must too.
 */
export function roundLine(line: Position[]): Position[] {
  const rounded: Position[] = [];
  for (const point of line) {
    const next: Position =
      point.length === 3
        ? [round6(point[0]), round6(point[1]), Math.round(point[2] * 10) / 10]
        : [round6(point[0]), round6(point[1])];
    if (!samePoint(rounded[rounded.length - 1], next)) rounded.push(next);
  }
  return rounded;
}

export function projectOnLine(
  line: Position[],
  cumulative: number[],
  p: Position,
): { frac: number; at: Position; offLineMeters: number } {
  const total = cumulative[cumulative.length - 1];
  let best = { frac: 0, at: line[0], offLineMeters: Infinity };

  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const origin: Position = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const [px, py] = planar(origin, p);
    const [ax, ay] = planar(origin, a);
    const [bx, by] = planar(origin, b);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
    const offLineMeters = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (offLineMeters < best.offLineMeters) {
      const at: Position = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const along = cumulative[i - 1] + t * (cumulative[i] - cumulative[i - 1]);
      best = { frac: total === 0 ? 0 : along / total, at, offLineMeters };
    }
  }

  return best;
}

/**
 * The clock exists only so WayGeometry.elapsed(atFrac:) has something to read:
 * nothing on a stage walk or in its preview shows it.
 */
export function routePoints(
  line: Position[],
  cumulative: number[],
  hours: number,
): WayRoutePoint[] {
  const total = cumulative[cumulative.length - 1];
  const seconds = hours * 3600;
  return line.map((point, i) => {
    const routePoint: WayRoutePoint = {
      lat: point[1],
      lon: point[0],
      t: Math.round(seconds * (total === 0 ? 0 : cumulative[i] / total) * 10) / 10,
    };
    if (point.length === 3) routePoint.alt = point[2];
    return routePoint;
  });
}

export function withinGate(
  measuredKm: number,
  declaredKm: number,
  tolerance: number = GATE_TOLERANCE,
): boolean {
  if (declaredKm <= 0) return false;
  return Math.abs(measuredKm / declaredKm - 1) <= tolerance;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test scripts/ways/geo.test.ts`
Expected: PASS — `ℹ pass 20`, `ℹ fail 0`

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no output, exit 0

- [ ] **Step 6: Commit**

```bash
git add scripts/ways/geo.ts scripts/ways/geo.test.ts
git commit -m "$(cat <<'EOF'
feat(ways): cut a stage from a walked line, and measure whether it is honest

Slicing, Ramer-Douglas-Peucker at 8 m, the 1,000-point cap, the synthesized
clock, and the +-10% length gate. The one non-obvious rule is the boundary
fallback: a stage-boundary town more than 500 m from the line is not on it,
and snapping to the nearest vertex hands the neighbouring stages each other's
kilometres. On the Camino Frances that fallback is the difference between 7
stages outside the gate and 2.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Moments — the places that rise as cards

**Files:**
- Create: `scripts/ways/text.ts`
- Create: `scripts/ways/moments.ts`
- Create: `scripts/ways/moments.test.ts`

**Interfaces:**
- Consumes: `Position`, `WayCoordinate`, `WayMoment` from `scripts/ways/types.ts` (Task 1); `projectOnLine` and `haversineMeters` from `scripts/ways/geo.ts` (Task 2).
- Produces `scripts/ways/text.ts`:
  - `cap(value: string | undefined, maxCharacters: number): string | undefined` — trims, drops the empty, truncates.
  - `nonEnglishNames(localized: Record<string, string> | undefined): Record<string, string> | undefined` — drops `en`, returns undefined when nothing is left.
  - `wholeSecondISO(value: string): string` — normalizes any `format: date-time` string to the whole-second `…Z` form the Way schema's `departedAt` pattern requires.
- Produces `scripts/ways/moments.ts`:
  - `MOMENT_TYPES: readonly string[]` = `["sacred_site", "cultural_site", "viewpoint", "town", "credential_stamp"]`
  - `ICON_BY_TYPE: Record<string, string>`
  - `MOMENT_DROP_METERS = 300`, `PLACE_MATCH_METERS = 150`, `SIT_MINUTES = 5`
  - `iconFor(properties: WaypointProperties): string`
  - `composedText(properties: WaypointProperties): string | undefined`
  - `buildMoments(input: MomentInput): MomentResult`
  - types `WaypointFeature`, `WaypointProperties`, `StagePlace`, `MomentInput`, `MomentResult`

**Contract details that are decisions, not guesses:**
- A moment is written flat — `kind: "waypoint"` with `label` and `icon` as siblings — because that is what `PilgrimageWayImporter` reads. `label` is capped at 80, the importer's `maxLabelCharacters`.
- Moment ids are `wp-<waypoint id>` unless the waypoint's own id already starts with `wp-`, in which case it is used verbatim. The Camino's ids are already `wp-sjpp`, Shikoku's are `temple-12`; doubling the prefix would make `wp-wp-sjpp`.
- The stage's own start and end become moments with ids `stage-start` and `stage-end`, and only when no `town` waypoint sits within 150 m of them.
- Moments sort by `frac`, ties broken by id codepoint order, so a rebuild is byte-identical.

- [ ] **Step 1: Write the failing test**

Create `scripts/ways/moments.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { cap, nonEnglishNames, wholeSecondISO } from "./text.js";
import {
  buildMoments,
  composedText,
  iconFor,
  MOMENT_DROP_METERS,
  type WaypointFeature,
} from "./moments.js";
import {
  walkedLine,
  cumulativeMeters,
  simplify,
  roundLine,
  RDP_TOLERANCE_METERS,
} from "./geo.js";
import type { Position } from "./types.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "way-fixture-route");
const loadJson = (name: string) => JSON.parse(readFileSync(join(FIXTURE, name), "utf-8"));

function stageSlice(from: number, to: number): { line: Position[]; cumulative: number[] } {
  const line = roundLine(simplify(walkedLine(loadJson("route.main.geojson")).slice(from, to + 1), RDP_TOLERANCE_METERS));
  return { line, cumulative: cumulativeMeters(line) };
}

function waypointsForStage(index: number): WaypointFeature[] {
  return loadJson("waypoints.geojson").features.filter(
    (f: WaypointFeature) => f.properties.stageIndex === index,
  );
}

test("cap trims, drops the empty, and truncates", () => {
  assert.equal(cap("  hello  ", 10), "hello");
  assert.equal(cap("   ", 10), undefined);
  assert.equal(cap(undefined, 10), undefined);
  assert.equal(cap("abcdefghijk", 5), "abcde");
});

test("nonEnglishNames drops en and returns undefined when nothing is left", () => {
  assert.deepEqual(nonEnglishNames({ en: "Start", es: "Inicio" }), { es: "Inicio" });
  assert.equal(nonEnglishNames({ en: "Start" }), undefined);
  assert.equal(nonEnglishNames(undefined), undefined);
});

test("wholeSecondISO normalizes anything format: date-time allows", () => {
  // metadata.lastUpdated is only constrained to date-time, but the Way
  // schema's departedAt pattern demands whole seconds and a Z.
  assert.equal(wholeSecondISO("2026-08-19T00:00:00Z"), "2026-08-19T00:00:00Z");
  assert.equal(wholeSecondISO("2026-08-19T00:00:00.448Z"), "2026-08-19T00:00:00Z");
  assert.equal(wholeSecondISO("2026-08-19T02:00:00+02:00"), "2026-08-19T00:00:00Z");
  assert.match(wholeSecondISO("2026-08-19T00:00:00Z"), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test("iconFor maps each moment type to its SF Symbol", () => {
  assert.equal(iconFor({ type: "sacred_site" }), "building.columns");
  assert.equal(iconFor({ type: "cultural_site" }), "book.closed");
  assert.equal(iconFor({ type: "viewpoint" }), "eye");
  assert.equal(iconFor({ type: "town" }), "house.lodge");
  assert.equal(iconFor({ type: "credential_stamp" }), "seal");
});

test("iconFor gives any stamp-bearing waypoint the seal, whatever its type", () => {
  assert.equal(iconFor({ type: "sacred_site", credentialStamp: true }), "seal");
  assert.equal(iconFor({ type: "town", credentialStamp: true }), "seal");
  assert.equal(iconFor({ type: "sacred_site", credentialStamp: false }), "building.columns");
});

test("composedText builds a line from a temple's structured fields", () => {
  assert.equal(
    composedText({
      type: "sacred_site",
      templeNumber: 3,
      tradition: "buddhist",
      denomination: "Koyasan Shingon",
      credentialStamp: true,
      stampFee: { currency: "JPY", amount: 500 },
    }),
    "Temple 3 · Koyasan Shingon · stamp available (¥500)",
  );
});

test("composedText falls back to the tradition when there is no denomination", () => {
  assert.equal(
    composedText({ type: "sacred_site", templeNumber: 7, tradition: "buddhist" }),
    "Temple 7 · Buddhist",
  );
});

test("composedText says only what it knows", () => {
  assert.equal(composedText({ type: "credential_stamp", credentialStamp: true }), "stamp available");
  assert.equal(
    composedText({ type: "sacred_site", credentialStamp: true, stampFee: { currency: "EUR", amount: 2 } }),
    "stamp available (€2)",
  );
  assert.equal(
    composedText({ type: "sacred_site", credentialStamp: true, stampFee: { currency: "XYZ", amount: 9 } }),
    "stamp available (9 XYZ)",
  );
  assert.equal(composedText({ type: "cultural_site" }), undefined);
});

test("stage 0's moments are the town, the shrine, the museum, and a synthesized end", () => {
  const { line, cumulative } = stageSlice(0, 10);
  const result = buildMoments({
    line,
    cumulative,
    waypoints: waypointsForStage(0),
    start: { name: "Start Town", at: [0, 0] },
    end: { name: "Middle", at: [0.01, 0] },
  });

  assert.deepEqual(result.moments.map((m) => m.id), ["wp-start-town", "wp-shrine", "wp-museum", "stage-end"]);
  assert.deepEqual(result.moments.map((m) => m.kind), ["waypoint", "waypoint", "waypoint", "waypoint"]);
  assert.deepEqual(result.moments.map((m) => m.icon), [
    "house.lodge", "building.columns", "book.closed", "house.lodge",
  ]);
  assert.equal(result.moments[0].label, "Start Town");
  assert.deepEqual(result.moments.map((m) => Math.round(m.frac * 1000) / 1000), [0, 0.5, 0.8, 1]);
  assert.equal(result.beyondEnds, 2);
});

test("a start place with a town waypoint on it does not get a second, synthesized moment", () => {
  const { line, cumulative } = stageSlice(0, 10);
  const result = buildMoments({
    line,
    cumulative,
    waypoints: waypointsForStage(0),
    start: { name: "Start Town", at: [0, 0] },
    end: { name: "Middle", at: [0.01, 0] },
  });
  assert.equal(result.moments.filter((m) => m.id === "stage-start").length, 0);
});

test("a moment carries text, local names, sit minutes, and a pin off the line", () => {
  const { line, cumulative } = stageSlice(10, 30);
  const result = buildMoments({
    line,
    cumulative,
    waypoints: waypointsForStage(1),
    start: { name: "Middle", at: [0.01, 0] },
    end: { name: "Bend", at: [0.02, 0.01] },
  });
  const byId = new Map(result.moments.map((m) => [m.id, m]));

  const lookout = byId.get("wp-lookout")!;
  assert.ok(Math.abs(lookout.frac - 0.1036) < 1e-3, `${lookout.frac}`);
  assert.equal(lookout.text, "The whole first leg, behind you.");
  assert.equal(lookout.sitMinutes, 5);
  assert.deepEqual(lookout.pin, { lat: 0.0005, lon: 0.012 });
  // `at` is on the line so the engine's 60 m trigger fires on the trail.
  assert.ok(Math.abs(lookout.at.lat) < 1e-4);
  assert.notDeepEqual(lookout.at, lookout.pin);

  const temple = byId.get("temple-3")!;
  assert.equal(temple.icon, "seal");
  assert.equal(temple.text, "Temple 3 · Koyasan Shingon · stamp available (¥500)");
  assert.equal(temple.sitMinutes, 5);

  const office = byId.get("wp-office")!;
  assert.equal(office.text, "stamp available");
  assert.deepEqual(office.names, { es: "Oficina del Peregrino" });
  assert.equal(office.sitMinutes, undefined);
});

test("a waypoint more than 300 m off the line is dropped and named in the warnings", () => {
  const { line, cumulative } = stageSlice(10, 30);
  const result = buildMoments({
    line,
    cumulative,
    waypoints: waypointsForStage(1),
    start: { name: "Middle", at: [0.01, 0] },
    end: { name: "Bend", at: [0.02, 0.01] },
  });
  assert.equal(result.moments.some((m) => m.id === "wp-far-chapel"), false);
  assert.equal(result.dropped.length, 1);
  assert.match(result.dropped[0], /wp-far-chapel/);
  assert.match(result.dropped[0], new RegExp(String(MOMENT_DROP_METERS)));
});

test("a stage whose only places are its own ends counts zero moments beyond them", () => {
  const { line, cumulative } = stageSlice(30, 40);
  const result = buildMoments({
    line,
    cumulative,
    waypoints: waypointsForStage(2),
    start: { name: "Bend", at: [0.02, 0.01] },
    end: { name: "End Town", at: [0.02, 0.02] },
  });
  assert.deepEqual(result.moments.map((m) => m.id), ["stage-start", "wp-end-town"]);
  assert.deepEqual(result.moments.at(-1)!.names, { es: "Pueblo Final" });
  assert.equal(result.beyondEnds, 0);
});

test("moments are ordered by frac with ties broken by id, so a rebuild is byte-identical", () => {
  const line: Position[] = [[0, 0], [0.01, 0]];
  const cumulative = cumulativeMeters(line);
  const at = (lon: number, id: string): WaypointFeature => ({
    id,
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, 0] },
    properties: { routeId: "fixture-way", name: id, type: "town", stageIndex: 0 },
  });
  const result = buildMoments({
    line,
    cumulative,
    waypoints: [at(0.005, "wp-zulu"), at(0.005, "wp-alpha")],
    start: { name: "A", at: [0, 0] },
    end: { name: "B", at: [0.01, 0] },
  });
  const middle = result.moments.filter((m) => m.id.startsWith("wp-"));
  assert.deepEqual(middle.map((m) => m.id), ["wp-alpha", "wp-zulu"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test scripts/ways/moments.test.ts`
Expected: FAIL — `Cannot find module './text.js'`

- [ ] **Step 3: Write `scripts/ways/text.ts`**

```ts
/**
 * Every string the build writes is capped at parse time on the app side too;
 * capping here means a long dataset field is truncated once, in a file the
 * reviewer can read, rather than silently on the phone.
 */
export function cap(value: string | undefined, maxCharacters: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, maxCharacters);
}

/**
 * The dataset's localized name maps include `en`, which is already the label.
 * Repeating it as a "local name" would print the same words twice on a card.
 */
/**
 * `metadata.lastUpdated` is only constrained to `format: date-time`, so a
 * contributor may legally write milliseconds or a `+02:00` offset. The Way
 * schema's `departedAt` pattern demands whole seconds in UTC, so the build
 * normalizes rather than trusting the dataset to have been tidy.
 */
export function wholeSecondISO(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`"${value}" is not a date-time this build can normalize`);
  }
  return parsed.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function nonEnglishNames(
  localized: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!localized) return undefined;
  const rest: Record<string, string> = {};
  for (const key of Object.keys(localized).sort()) {
    if (key === "en") continue;
    const value = cap(localized[key], 120);
    if (value) rest[key] = value;
  }
  return Object.keys(rest).length > 0 ? rest : undefined;
}
```

- [ ] **Step 4: Write `scripts/ways/moments.ts`**

```ts
import type { Position, WayCoordinate, WayMoment } from "./types.js";
import { haversineMeters, projectOnLine } from "./geo.js";
import { cap, nonEnglishNames } from "./text.js";

export interface WaypointProperties {
  type: string;
  name?: string;
  nameLocalized?: Record<string, string>;
  description?: string;
  stageIndex?: number;
  kmFromStart?: number;
  templeNumber?: number;
  tradition?: string;
  denomination?: string;
  credentialStamp?: boolean;
  stampFee?: { currency?: string; amount?: number };
}

export interface WaypointFeature {
  id?: string;
  type?: string;
  geometry: { type: string; coordinates: Position };
  properties: WaypointProperties;
}

export interface StagePlace {
  name: string;
  at: Position;
  localized?: Record<string, string>;
}

export interface MomentInput {
  line: Position[];
  cumulative: number[];
  /** Already filtered to this stage's `stageIndex`. */
  waypoints: WaypointFeature[];
  start: StagePlace;
  end: StagePlace;
}

export interface MomentResult {
  moments: WayMoment[];
  dropped: string[];
  /** Moments that are neither the stage's start place nor its end place. */
  beyondEnds: number;
}

export const MOMENT_TYPES: readonly string[] = [
  "sacred_site",
  "cultural_site",
  "viewpoint",
  "town",
  "credential_stamp",
];

export const ICON_BY_TYPE: Record<string, string> = {
  sacred_site: "building.columns",
  cultural_site: "book.closed",
  viewpoint: "eye",
  town: "house.lodge",
  credential_stamp: "seal",
};

/** A place this far off the trail is a detour, not something you walk past. */
export const MOMENT_DROP_METERS = 300;

/** Close enough that the stage's own start or end place is already on the map. */
export const PLACE_MATCH_METERS = 150;

export const SIT_MINUTES = 5;

const SIT_TYPES = new Set(["sacred_site", "viewpoint"]);

const MOMENT_TEXT_MAX = 600;
/** WayImporter.maxLabelCharacters — a longer label is refused on the phone. */
const LABEL_MAX = 80;

const CURRENCY_SYMBOL: Record<string, string> = { JPY: "¥", EUR: "€", GBP: "£", USD: "$" };

export function iconFor(properties: WaypointProperties): string {
  if (properties.credentialStamp === true) return "seal";
  return ICON_BY_TYPE[properties.type] ?? "mappin";
}

function feeText(fee: WaypointProperties["stampFee"]): string {
  if (!fee || typeof fee.amount !== "number" || !fee.currency) return "";
  const symbol = CURRENCY_SYMBOL[fee.currency];
  return symbol ? ` (${symbol}${fee.amount})` : ` (${fee.amount} ${fee.currency})`;
}

/**
 * The line a card shows when the dataset gave a place no description. Built
 * only from fields that are already facts about the place, never invented.
 */
export function composedText(properties: WaypointProperties): string | undefined {
  const parts: string[] = [];

  if (typeof properties.templeNumber === "number") {
    parts.push(`Temple ${properties.templeNumber}`);
  }

  const school =
    cap(properties.denomination, 80) ??
    (properties.tradition
      ? properties.tradition.charAt(0).toUpperCase() + properties.tradition.slice(1)
      : undefined);
  if (school) parts.push(school);

  if (properties.credentialStamp === true) {
    parts.push(`stamp available${feeText(properties.stampFee)}`);
  }

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

const coordinate = (p: Position): WayCoordinate => ({ lat: p[1], lon: p[0] });

/** `wp-sjpp` is already prefixed; `temple-12` is not. Never `wp-wp-sjpp`. */
function momentId(rawId: string): string {
  return rawId.startsWith("wp-") ? rawId : `wp-${rawId}`;
}

function placeMoment(
  id: string,
  place: StagePlace,
  line: Position[],
  cumulative: number[],
): WayMoment {
  const projection = projectOnLine(line, cumulative, place.at);
  const moment: WayMoment = {
    id,
    frac: projection.frac,
    kind: "waypoint",
    label: cap(place.name, LABEL_MAX) ?? place.name,
    icon: "house.lodge",
    at: coordinate(projection.at),
    pin: coordinate(place.at),
  };
  const names = nonEnglishNames(place.localized);
  if (names) moment.names = names;
  return moment;
}

export function buildMoments(input: MomentInput): MomentResult {
  const { line, cumulative, waypoints, start, end } = input;
  const moments: WayMoment[] = [];
  const dropped: string[] = [];
  const beyondEndIds = new Set<string>();

  let startHasTown = false;
  let endHasTown = false;

  for (const feature of waypoints) {
    const properties = feature.properties;
    if (!MOMENT_TYPES.includes(properties.type)) continue;

    const rawId = feature.id;
    if (!rawId) continue;

    const point = feature.geometry.coordinates;
    const nearStart = haversineMeters(point, start.at) <= PLACE_MATCH_METERS;
    const nearEnd = haversineMeters(point, end.at) <= PLACE_MATCH_METERS;
    if (properties.type === "town") {
      if (nearStart) startHasTown = true;
      if (nearEnd) endHasTown = true;
    }

    const projection = projectOnLine(line, cumulative, point);
    if (projection.offLineMeters > MOMENT_DROP_METERS) {
      dropped.push(
        `${rawId} ("${properties.name ?? rawId}") is ${Math.round(projection.offLineMeters)} m ` +
          `from the line, beyond the ${MOMENT_DROP_METERS} m limit`,
      );
      continue;
    }

    const id = momentId(rawId);
    const moment: WayMoment = {
      id,
      frac: projection.frac,
      kind: "waypoint",
      label: cap(properties.name, LABEL_MAX) ?? id,
      icon: iconFor(properties),
      at: coordinate(projection.at),
      pin: coordinate(point),
    };

    const text = cap(properties.description, MOMENT_TEXT_MAX) ?? composedText(properties);
    if (text) moment.text = text;

    const names = nonEnglishNames(properties.nameLocalized);
    if (names) moment.names = names;

    if (SIT_TYPES.has(properties.type)) moment.sitMinutes = SIT_MINUTES;

    moments.push(moment);
    if (!nearStart && !nearEnd) beyondEndIds.add(id);
  }

  if (!startHasTown) moments.push(placeMoment("stage-start", start, line, cumulative));
  if (!endHasTown) moments.push(placeMoment("stage-end", end, line, cumulative));

  moments.sort((a, b) => a.frac - b.frac || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { moments, dropped, beyondEnds: beyondEndIds.size };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --import tsx --test scripts/ways/moments.test.ts`
Expected: PASS — `ℹ pass 14`, `ℹ fail 0`

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no output, exit 0

- [ ] **Step 7: Commit**

```bash
git add scripts/ways/text.ts scripts/ways/moments.ts scripts/ways/moments.test.ts
git commit -m "$(cat <<'EOF'
feat(ways): turn a stage's meaningful places into moments

Sacred sites, cultural sites, viewpoints, towns and stamp spots become cards;
the stage's own ends join them only when no town waypoint already stands
there. The split between `at` and `pin` is the load-bearing part: on the real
Camino only 17 of 52 eligible waypoints lie within the engine's 60 m trigger
of the line, and none of stage 0's, so the trigger reads a projected point
while the map draws the place where it actually is.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Marks and the stage block

**Files:**
- Create: `scripts/ways/marks.ts`
- Create: `scripts/ways/marks.test.ts`
- Create: `scripts/ways/stage.ts`
- Create: `scripts/ways/stage.test.ts`
- Modify: `schema/stages.schema.json` (make `interior.reflection` required)

**Interfaces:**
- Consumes: `Position`, `WayMark`, `WayStage`, `WayStageHours` from `scripts/ways/types.ts` (Task 1); `projectOnLine` from `scripts/ways/geo.ts` (Task 2); `WaypointFeature`, `MOMENT_DROP_METERS` from `scripts/ways/moments.ts` (Task 3); `cap` from `scripts/ways/text.ts` (Task 3).
- Produces `scripts/ways/marks.ts`:
  - `MARK_KIND_BY_TYPE: Record<string, WayMarkKind>` = `{ water_source: "water", food: "food", accommodation: "bed", transport: "transport", supply: "supply", medical: "medical" }`
  - `MARK_NAME_MAX = 80`, `MAX_MARKS = 400`
  - `buildMarks(input: { line: Position[]; cumulative: number[]; waypoints: WaypointFeature[] }): { marks: WayMark[]; dropped: string[]; trimmed: number }`
- Produces `scripts/ways/stage.ts`:
  - `DatasetStage` — the shape `stages.json` gives a stage
  - `buildStageBlock(routeId: string, count: number, stage: DatasetStage): WayStage` — every field always present, because the app's `WayStage` declares them non-optional
  - `closingFor(stage: DatasetStage): string | undefined`
  - `lastSentence(text: string | undefined): string | undefined`
  - `midpointHours(hours: { min?: number; max?: number } | undefined): number`

**Spec open question 4, settled:** all 109 stages across all seven routes already carry `interior.reflection.en` (verified). Making it required in `stages.schema.json` turns the narrative-last-sentence fallback into a guard that never fires for committed data — but the fallback stays in `closingFor`, because `interior` itself is still optional and a future contribution could arrive without one.

- [ ] **Step 1: Write the failing test for marks**

Create `scripts/ways/marks.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { buildMarks, MARK_KIND_BY_TYPE, MARK_NAME_MAX, MAX_MARKS } from "./marks.js";
import { walkedLine, cumulativeMeters, simplify, roundLine, RDP_TOLERANCE_METERS } from "./geo.js";
import type { WaypointFeature } from "./moments.js";
import type { Position } from "./types.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "way-fixture-route");
const loadJson = (name: string) => JSON.parse(readFileSync(join(FIXTURE, name), "utf-8"));

function stageSlice(from: number, to: number): { line: Position[]; cumulative: number[] } {
  const line = roundLine(simplify(walkedLine(loadJson("route.main.geojson")).slice(from, to + 1), RDP_TOLERANCE_METERS));
  return { line, cumulative: cumulativeMeters(line) };
}

const waypointsForStage = (index: number): WaypointFeature[] =>
  loadJson("waypoints.geojson").features.filter((f: WaypointFeature) => f.properties.stageIndex === index);

test("every service type the dataset carries has a mark kind", () => {
  assert.deepEqual(MARK_KIND_BY_TYPE, {
    water_source: "water",
    food: "food",
    accommodation: "bed",
    transport: "transport",
    supply: "supply",
    medical: "medical",
  });
});

test("a water source becomes a water mark with its distance off the line", () => {
  const { line, cumulative } = stageSlice(0, 10);
  const { marks } = buildMarks({ line, cumulative, waypoints: waypointsForStage(0) });

  assert.deepEqual(marks.map((m) => m.id), ["wp-fuente"]);
  assert.equal(marks[0].kind, "water");
  assert.equal(marks[0].name, "Fuente del Camino");
  assert.ok(Math.abs(marks[0].frac - 0.6) < 1e-3);
  assert.ok(Math.abs(marks[0].offLineMeters - 33.4) < 0.3);
  assert.deepEqual(marks[0].at, { lat: 0, lon: 0.006 });
});

test("a service more than 300 m off the line is dropped and named in the warnings", () => {
  const { line, cumulative } = stageSlice(0, 10);
  const { marks, dropped } = buildMarks({ line, cumulative, waypoints: waypointsForStage(0) });
  assert.equal(marks.some((m) => m.id === "wp-far-fountain"), false);
  assert.equal(dropped.length, 1);
  assert.match(dropped[0], /wp-far-fountain/);
});

test("a moment-type waypoint never becomes a mark", () => {
  const { line, cumulative } = stageSlice(10, 30);
  const { marks } = buildMarks({ line, cumulative, waypoints: waypointsForStage(1) });
  assert.deepEqual(marks.map((m) => m.id), ["wp-cafe"]);
  assert.equal(marks[0].kind, "food");
});

test("the last stage carries a mark of every remaining kind, ordered by frac", () => {
  const { line, cumulative } = stageSlice(30, 40);
  const { marks } = buildMarks({ line, cumulative, waypoints: waypointsForStage(2) });
  assert.deepEqual(marks.map((m) => m.kind), ["bed", "medical", "supply", "transport"]);
  assert.deepEqual(marks.map((m) => Math.round(m.frac * 10) / 10), [0.2, 0.4, 0.6, 0.8]);
});

test("a mark name is capped at eighty characters", () => {
  const line: Position[] = [[0, 0], [0.01, 0]];
  const { marks } = buildMarks({
    line,
    cumulative: cumulativeMeters(line),
    waypoints: [
      {
        id: "wp-long",
        type: "Feature",
        geometry: { type: "Point", coordinates: [0.005, 0] },
        properties: { routeId: "fixture-way", type: "food", name: "x".repeat(200), stageIndex: 0 },
      },
    ],
  });
  assert.equal(marks[0].name.length, MARK_NAME_MAX);
});

test("a stage over the app's mark limit keeps the ones nearest the trail", () => {
  const line: Position[] = [[0, 0], [0.01, 0]];
  const waypoints: WaypointFeature[] = Array.from({ length: MAX_MARKS + 5 }, (_, i) => ({
    id: `wp-${String(i).padStart(4, "0")}`,
    type: "Feature",
    geometry: { type: "Point", coordinates: [0.005, i * 0.0000005] },
    properties: { routeId: "fixture-way", type: "water_source", name: `f${i}`, stageIndex: 0 },
  }));

  const { marks, trimmed } = buildMarks({ line, cumulative: cumulativeMeters(line), waypoints });

  assert.equal(marks.length, MAX_MARKS);
  assert.equal(trimmed, 5);
  // The five farthest off the line are the five that went.
  for (const id of ["wp-0400", "wp-0401", "wp-0402", "wp-0403", "wp-0404"]) {
    assert.equal(marks.some((m) => m.id === id), false, `${id} should have been trimmed`);
  }
});

test("a waypoint with no mapped kind is skipped without a warning", () => {
  const line: Position[] = [[0, 0], [0.01, 0]];
  const { marks, dropped } = buildMarks({
    line,
    cumulative: cumulativeMeters(line),
    waypoints: [
      {
        id: "wp-sign",
        type: "Feature",
        geometry: { type: "Point", coordinates: [0.005, 0] },
        properties: { routeId: "fixture-way", type: "waymarker", name: "Arrow", stageIndex: 0 },
      },
    ],
  });
  assert.deepEqual(marks, []);
  assert.deepEqual(dropped, []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test scripts/ways/marks.test.ts`
Expected: FAIL — `Cannot find module './marks.js'`

- [ ] **Step 3: Write `scripts/ways/marks.ts`**

```ts
import type { Position, WayMark, WayMarkKind } from "./types.js";
import { projectOnLine } from "./geo.js";
import { cap } from "./text.js";
import { MOMENT_DROP_METERS, type WaypointFeature } from "./moments.js";

/**
 * The six kinds the map has a glyph for. A waypoint of any other service type
 * — waymarker, camping, pass, information — draws nothing, so packaging it
 * would be dead weight on the download. No route in the dataset carries one
 * today; the skip exists so a future one does not break the build.
 */
export const MARK_KIND_BY_TYPE: Record<string, WayMarkKind> = {
  water_source: "water",
  food: "food",
  accommodation: "bed",
  transport: "transport",
  supply: "supply",
  medical: "medical",
};

export const MARK_NAME_MAX = 80;

/**
 * PilgrimageWayImporter.maxMarks — a stage file with more is refused whole on
 * the phone. The Camino Francés' busiest stage already carries 393 service
 * waypoints, so this is one new fountain away from mattering.
 */
export const MAX_MARKS = 400;

export interface MarkInput {
  line: Position[];
  cumulative: number[];
  /** Already filtered to this stage's `stageIndex`. */
  waypoints: WaypointFeature[];
}

export function buildMarks(
  input: MarkInput,
): { marks: WayMark[]; dropped: string[]; trimmed: number } {
  const marks: WayMark[] = [];
  const dropped: string[] = [];

  for (const feature of input.waypoints) {
    const kind = MARK_KIND_BY_TYPE[feature.properties.type];
    if (!kind) continue;

    const rawId = feature.id;
    if (!rawId) continue;

    const point = feature.geometry.coordinates;
    const projection = projectOnLine(input.line, input.cumulative, point);
    if (projection.offLineMeters > MOMENT_DROP_METERS) {
      dropped.push(
        `${rawId} ("${feature.properties.name ?? rawId}") is ${Math.round(projection.offLineMeters)} m ` +
          `from the line, beyond the ${MOMENT_DROP_METERS} m limit`,
      );
      continue;
    }

    const id = rawId.startsWith("wp-") ? rawId : `wp-${rawId}`;
    marks.push({
      id,
      kind,
      name: cap(feature.properties.name, MARK_NAME_MAX) ?? id,
      at: { lat: point[1], lon: point[0] },
      frac: projection.frac,
      offLineMeters: Math.round(projection.offLineMeters * 10) / 10,
    });
  }

  // Over the app's limit, keep the ones nearest the trail: a walker passes
  // those, and the map only draws 40 at a time anyway. Failing the whole route
  // because one city day has 401 fountains would help nobody.
  let trimmed = 0;
  if (marks.length > MAX_MARKS) {
    trimmed = marks.length - MAX_MARKS;
    marks.sort((a, b) => a.offLineMeters - b.offLineMeters || (a.id < b.id ? -1 : 1));
    marks.length = MAX_MARKS;
  }

  marks.sort((a, b) => a.frac - b.frac || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { marks, dropped, trimmed };
}
```

- [ ] **Step 4: Run the marks test to verify it passes**

Run: `node --import tsx --test scripts/ways/marks.test.ts`
Expected: PASS — `ℹ pass 8`, `ℹ fail 0`

- [ ] **Step 5: Write the failing test for the stage block**

Create `scripts/ways/stage.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { buildStageBlock, closingFor, lastSentence, midpointHours, type DatasetStage } from "./stage.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "way-fixture-route");
const stages: DatasetStage[] = JSON.parse(readFileSync(join(FIXTURE, "stages.json"), "utf-8")).stages;

test("midpointHours takes the middle of the estimated range", () => {
  assert.equal(midpointHours({ min: 7, max: 9 }), 8);
  assert.equal(midpointHours({ min: 3, max: 3 }), 3);
});

test("midpointHours falls back to one hour when the dataset gives no range", () => {
  // A zero would make every t identical and divide the clock by nothing.
  assert.equal(midpointHours(undefined), 1);
  assert.equal(midpointHours({}), 1);
});

test("lastSentence returns the final sentence of a narrative", () => {
  assert.equal(lastSentence("One thing. Then another thing."), "Then another thing.");
  assert.equal(lastSentence("No terminator here"), "No terminator here");
  assert.equal(lastSentence(undefined), undefined);
  assert.equal(lastSentence("   "), undefined);
});

test("closingFor prefers the interior reflection", () => {
  assert.equal(closingFor(stages[0]), "What did you bring that you do not need?");
});

test("closingFor falls back to the narrative's last sentence when there is no reflection", () => {
  const stage: DatasetStage = {
    index: 0,
    name: { en: "A to B" },
    start: { name: { en: "A" }, coordinates: [0, 0] },
    end: { name: { en: "B" }, coordinates: [0.01, 0] },
    distanceKm: 1,
    interior: { narrative: { en: "The path climbs. Then it does not." } },
  };
  assert.equal(closingFor(stage), "Then it does not.");
});

test("the stage block carries the day's facts in the app's shape", () => {
  const block = buildStageBlock("fixture-way", 3, stages[0]);
  assert.deepEqual(block, {
    routeId: "fixture-way",
    index: 0,
    count: 3,
    name: "Start Town to Middle",
    theme: "Setting out",
    narrative: "A flat first hour along the equator, which is exactly as unremarkable as it sounds.",
    closing: "What did you bring that you do not need?",
    warnings: [],
    distanceKm: 1.1,
    gainMeters: 20,
    hours: { min: 2, max: 4 },
    difficulty: "easy",
    start: { name: "Start Town", at: { lat: 0, lon: 0 } },
    end: { name: "Middle", at: { lat: 0, lon: 0.01 } },
  });
});

test("the stage block carries warnings when the dataset has them, and an empty array when it does not", () => {
  assert.deepEqual(buildStageBlock("fixture-way", 3, stages[1]).warnings, [
    "The corner at the end of the first leg is unsigned. Turn north.",
  ]);
  // Never undefined: the app's WayStage declares `warnings` non-optional.
  assert.deepEqual(buildStageBlock("fixture-way", 3, stages[0]).warnings, []);
});

test("a stage with no interior still writes every key the app requires", () => {
  const block = buildStageBlock("fixture-way", 3, {
    index: 0,
    name: { en: "A to B" },
    start: { name: { en: "A" }, coordinates: [0, 0] },
    end: { name: { en: "B" }, coordinates: [0.01, 0] },
    distanceKm: 1,
  });
  assert.equal(block.theme, "");
  assert.equal(block.narrative, "");
  assert.equal(block.closing, "");
  assert.deepEqual(block.warnings, []);
  assert.equal(block.gainMeters, 0);
  assert.equal(block.difficulty, "");
  assert.deepEqual(block.hours, { min: 1, max: 1 });
});

test("the stage block does not package elevation loss, which nothing in this slice reads", () => {
  const block = buildStageBlock("fixture-way", 3, {
    ...stages[0],
    elevationLossMeters: 557,
  } as DatasetStage);
  assert.equal((block as Record<string, unknown>).lossMeters, undefined);
  assert.equal((block as Record<string, unknown>).elevationLossMeters, undefined);
});

test("every string in the stage block is capped", () => {
  const block = buildStageBlock("fixture-way", 3, {
    index: 0,
    name: { en: "n".repeat(300) },
    start: { name: { en: "s".repeat(300) }, coordinates: [0, 0] },
    end: { name: { en: "e".repeat(300) }, coordinates: [0.01, 0] },
    distanceKm: 1,
    warnings: [{ en: "w".repeat(500) }],
    interior: {
      theme: { en: "t".repeat(300) },
      narrative: { en: "a".repeat(5000) },
      reflection: { en: "r".repeat(900) },
    },
  });
  assert.equal(block.name.length, 120);
  assert.equal(block.theme.length, 80);
  assert.equal(block.narrative.length, 2000);
  assert.equal(block.closing.length, 400);
  assert.equal(block.warnings[0].length, 300);
  assert.equal(block.start.name.length, 120);
});
```

- [ ] **Step 6: Run the stage test to verify it fails**

Run: `node --import tsx --test scripts/ways/stage.test.ts`
Expected: FAIL — `Cannot find module './stage.js'`

- [ ] **Step 7: Write `scripts/ways/stage.ts`**

```ts
import type { Position, WayStage } from "./types.js";
import { cap } from "./text.js";

export interface LocalizedString {
  en: string;
  [language: string]: string;
}

export interface DatasetStage {
  index: number;
  name: LocalizedString;
  start: { name: LocalizedString; coordinates: Position };
  end: { name: LocalizedString; coordinates: Position };
  distanceKm: number;
  elevationGainMeters?: number;
  elevationLossMeters?: number;
  estimatedHours?: { min?: number; max?: number };
  difficulty?: string;
  warnings?: LocalizedString[];
  interior?: {
    theme?: LocalizedString;
    narrative?: LocalizedString;
    reflection?: LocalizedString;
  };
}

const NAME_MAX = 120;
const THEME_MAX = 80;
const NARRATIVE_MAX = 2000;
const CLOSING_MAX = 400;
const WARNING_MAX = 300;

/**
 * A stage with no estimated range still needs a clock, because
 * WayGeometry.elapsed(atFrac:) divides by theirActiveSeconds. One hour is the
 * smallest honest placeholder; nothing on a stage walk ever shows it.
 */
export function midpointHours(hours: { min?: number; max?: number } | undefined): number {
  const min = hours?.min;
  const max = hours?.max;
  if (typeof min === "number" && typeof max === "number") return (min + max) / 2;
  if (typeof min === "number") return min;
  if (typeof max === "number") return max;
  return 1;
}

export function lastSentence(text: string | undefined): string | undefined {
  const trimmed = cap(text, Number.MAX_SAFE_INTEGER);
  if (!trimmed) return undefined;
  const sentences = trimmed.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length === 0) return trimmed;
  return sentences[sentences.length - 1].trim();
}

/**
 * Every stage in the dataset carries `interior.reflection`, and the schema now
 * requires it — but `interior` itself is optional, so a contribution can still
 * arrive without one, and the narrative's last sentence is what closes the day
 * when that happens.
 */
export function closingFor(stage: DatasetStage): string | undefined {
  return (
    cap(stage.interior?.reflection?.en, CLOSING_MAX) ??
    cap(lastSentence(stage.interior?.narrative?.en), CLOSING_MAX)
  );
}

/**
 * Every field is written, even when the dataset is silent: the app's WayStage
 * declares `theme`, `narrative`, `closing`, `warnings`, `gainMeters` and
 * `difficulty` non-optional, so a missing key would fail the decode outright.
 * An empty string renders as nothing; a missing key renders as a refused
 * package.
 */
export function buildStageBlock(routeId: string, count: number, stage: DatasetStage): WayStage {
  const hoursMid = stage.estimatedHours;
  return {
    routeId,
    index: stage.index,
    count,
    name: cap(stage.name.en, NAME_MAX) ?? `Stage ${stage.index + 1}`,
    theme: cap(stage.interior?.theme?.en, THEME_MAX) ?? "",
    narrative: cap(stage.interior?.narrative?.en, NARRATIVE_MAX) ?? "",
    closing: closingFor(stage) ?? "",
    warnings: (stage.warnings ?? [])
      .map((warning) => cap(warning.en, WARNING_MAX))
      .filter((warning): warning is string => warning !== undefined),
    distanceKm: stage.distanceKm,
    gainMeters: typeof stage.elevationGainMeters === "number" ? stage.elevationGainMeters : 0,
    hours: {
      min: typeof hoursMid?.min === "number" ? hoursMid.min : midpointHours(hoursMid),
      max: typeof hoursMid?.max === "number" ? hoursMid.max : midpointHours(hoursMid),
    },
    difficulty: stage.difficulty ?? "",
    start: {
      name: cap(stage.start.name.en, NAME_MAX) ?? "Start",
      at: { lat: stage.start.coordinates[1], lon: stage.start.coordinates[0] },
    },
    end: {
      name: cap(stage.end.name.en, NAME_MAX) ?? "End",
      at: { lat: stage.end.coordinates[1], lon: stage.end.coordinates[0] },
    },
  };
}
```

- [ ] **Step 8: Run the stage test to verify it passes**

Run: `node --import tsx --test scripts/ways/stage.test.ts`
Expected: PASS — `ℹ pass 10`, `ℹ fail 0`

- [ ] **Step 9: Make `interior.reflection` required in `schema/stages.schema.json`**

In `schema/stages.schema.json`, replace the `interior` block (currently at `$defs.Stage.properties.interior`) with:

```json
        "interior": {
          "type": "object",
          "description": "Editorial content about the pilgrim experience on this stage",
          "required": ["reflection"],
          "properties": {
            "theme": { "$ref": "#/$defs/LocalizedString" },
            "narrative": { "$ref": "#/$defs/LocalizedString" },
            "commonExperiences": {
              "type": "array",
              "items": { "$ref": "#/$defs/LocalizedString" }
            },
            "reflection": { "$ref": "#/$defs/LocalizedString" }
          },
          "additionalProperties": true
        }
```

- [ ] **Step 10: Verify the whole committed dataset still validates**

Run: `npm run validate`
Expected: `Found 13 route(s)` … `Validation passed (0 warning(s))` — every one of the 109 stages already carries a reflection, so requiring it changes nothing about today's data.

- [ ] **Step 11: Run the full suite and type-check**

Run: `npm test && npx tsc --noEmit`
Expected: `ℹ fail 0`, then no tsc output

- [ ] **Step 12: Commit**

```bash
git add scripts/ways/marks.ts scripts/ways/marks.test.ts scripts/ways/stage.ts scripts/ways/stage.test.ts schema/stages.schema.json
git commit -m "$(cat <<'EOF'
feat(ways): draw services as marks, and package the day's own words

Water, food, beds, transport, supply and medical points become quiet pins
with a frac and a distance off the line, so the walk can say "water in 280 m"
without making them tappable. The stage block carries the theme, narrative,
closing line, warnings and day facts the morning card and the summary read.

Also makes interior.reflection required in stages.schema.json: all 109 stages
already carry one, so this turns the narrative-last-sentence fallback into a
guard that fires only for a contribution that arrives without an interior.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: The build step, the catalog, the report, the coverage flag, and the pipeline

**Files:**
- Create: `scripts/ways/catalog.ts`
- Create: `scripts/ways/catalog.test.ts`
- Create: `scripts/build-ways.ts`
- Create: `scripts/build-ways.test.ts`
- Modify: `scripts/build-index.ts`
- Modify: `scripts/build-index.test.ts`
- Modify: `scripts/validate.ts`
- Modify: `schema/index.schema.json`
- Modify: `package.json`
- Modify: `.github/workflows/validate.yml`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces `scripts/ways/catalog.ts`:
  - `buildRouteCard(routeId, metadata, stages, hasCover): WayRouteFile`
  - `buildReport(input: ReportInput): WayReportFile`
  - `halfOfStages(stageCount: number): number` — `Math.ceil(stageCount / 2)`
- Produces `scripts/build-ways.ts`:
  - `buildRouteWays(input: RouteWaysInput): RouteWaysResult` where `RouteWaysResult = { ways: WayFile[]; route: WayRouteFile; report: WayReportFile; emitted: boolean }`
  - `stageFileName(index: number): string` — `stage-00.json`, zero-padded to two digits
  - `main()` guarded by `import.meta.filename === resolveInvokedPath(process.argv[1])`, the way `build-index.ts` guards its own
- Produces from `scripts/build-index.ts`: `RouteIndex` gains `release: string`; `RouteEntry` gains `ways?: { stageCount: number; bytes: number; placesPerStage: number; sparse: boolean }`; `REGION_BY_COUNTRY` becomes an export.

**Three decisions this task makes, and why:**
1. **`report.json` is written even when the route fails.** A route that fails is exactly the one whose report someone needs to read — it is what answers spec open question 2. The *package* (`route.json` + `stage-NN.json`) is what a failing gate withholds.
2. **The length gate governs both the package and the index entry; coverage is a flag on it.** The spec makes the floor decide listing, but measured that lists nothing — the Camino Francés is the only route that clears the gate and it carries a place beyond the day's own ends on 7 of 33 stages. So a route that clears the gate is listed with `"ways": { "stageCount", "bytes", "placesPerStage", "sparse" }`, and `sparse: true` (fewer than half its stages carrying such a place) is what makes the app's card say "few places marked yet". A route with any stage outside ±10 % still gets a report and no entry, and the app hides it.
3. **`summary` comes from `metadata.description.en`, not `metadata.overview.description`.** The spec names a field that does not exist in any of the seven routes' metadata; `description` is the required top-level localized field that carries the same prose.

**Only top-level routes are built.** Variants are not separately downloadable in the app (`index.json` hangs a `ways` entry off a route entry, not a variant entry), and only one of the six variants — `camino-portugues/variants/coastal` — even has `stages.json`.

- [ ] **Step 1: Write the failing test for the catalog and report**

Create `scripts/ways/catalog.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { buildRouteCard, buildReport, halfOfStages } from "./catalog.js";
import type { DatasetStage } from "./stage.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "way-fixture-route");
const loadJson = (name: string) => JSON.parse(readFileSync(join(FIXTURE, name), "utf-8"));
const metadata = loadJson("metadata.json");
const stages: DatasetStage[] = loadJson("stages.json").stages;

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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx --test scripts/ways/catalog.test.ts`
Expected: FAIL — `Cannot find module './catalog.js'`

- [ ] **Step 3: Export `REGION_BY_COUNTRY`, then write `scripts/ways/catalog.ts`**

First, one line in `scripts/build-index.ts` (currently line 64) — `const REGION_BY_COUNTRY` becomes:

```ts
export const REGION_BY_COUNTRY: Record<string, string> = {
```

Reusing it, rather than copying the table, is why a route's region can never disagree between `index.json` and the card the app draws. `build-index.ts`'s `main()` is guarded by `import.meta.filename === resolveInvokedPath(process.argv[1])`, so importing it does not run it — there is already a test pinning that.

Then create `scripts/ways/catalog.ts`:

```ts
import type {
  WayReportFile,
  WayReportStage,
  WayRouteFile,
  WayRouteStage,
} from "./types.js";
import { SCHEMA_VERSION } from "./types.js";
import { cap, nonEnglishNames } from "./text.js";
import { midpointHours, type DatasetStage } from "./stage.js";
import { withinGate } from "./geo.js";
import { REGION_BY_COUNTRY } from "../build-index.js";

const NAME_MAX = 120;
const SUMMARY_MAX = 600;

/**
 * The review's coverage bar. It no longer gates listing — measured, that
 * listed nothing — so it decides only whether a route's card says "few places
 * marked yet".
 */
export function halfOfStages(stageCount: number): number {
  return Math.ceil(stageCount / 2);
}

export interface RouteMetadata {
  name: Record<string, string>;
  description?: Record<string, string>;
  overview?: { countries?: string[] };
  tradition?: { type?: string };
}

export function buildRouteCard(
  routeId: string,
  metadata: RouteMetadata,
  stages: DatasetStage[],
  hasCover: boolean,
): WayRouteFile {
  const countries = metadata.overview?.countries ?? [];
  // The last country is the one the route ends in — the Camino Francés starts
  // in France and is filed under Spain, the same rule build-index applies.
  const country = countries.length > 1 ? countries[countries.length - 1] : countries[0] ?? "";

  const cardStages: WayRouteStage[] = stages.map((stage) => {
    const entry: WayRouteStage = {
      index: stage.index,
      name: cap(stage.name.en, NAME_MAX) ?? `Stage ${stage.index + 1}`,
      distanceKm: stage.distanceKm,
      hours: {
        min: typeof stage.estimatedHours?.min === "number" ? stage.estimatedHours.min : midpointHours(stage.estimatedHours),
        max: typeof stage.estimatedHours?.max === "number" ? stage.estimatedHours.max : midpointHours(stage.estimatedHours),
      },
    };
    if (typeof stage.elevationGainMeters === "number") entry.gainMeters = stage.elevationGainMeters;
    if (stage.difficulty) entry.difficulty = stage.difficulty;
    return entry;
  });

  const card: WayRouteFile = {
    schemaVersion: SCHEMA_VERSION,
    id: routeId,
    name: cap(metadata.name.en, NAME_MAX) ?? routeId,
    country,
    region: REGION_BY_COUNTRY[country] ?? "Other",
    // The stages' own sum, not the geometry's length: what a walker will walk.
    distanceKm: Math.round(stages.reduce((sum, s) => sum + s.distanceKm, 0) * 10) / 10,
    stageCount: stages.length,
    tradition: metadata.tradition?.type ?? "",
    summary: cap(metadata.description?.en, SUMMARY_MAX) ?? "",
    stages: cardStages,
  };

  const names = nonEnglishNames(metadata.name);
  if (names) card.names = names;
  if (hasCover) card.cover = "cover.jpg";

  return card;
}

export interface ReportStageInput {
  index: number;
  name: string;
  sliceKm: number;
  distanceKm: number;
  boundaryMode: "snap" | "proportional";
  routePoints: number;
  moments: number;
  momentsBeyondEnds: number;
  momentsWithText: number;
  marks: number;
  marksTrimmed: number;
  dropped: string[];
}

export interface ReportInput {
  routeId: string;
  generatedAt: string;
  walkedLine: { source: "route.main.geojson" | "route.geojson"; points: number; lengthKm: number };
  stages: ReportStageInput[];
}

export function buildReport(input: ReportInput): WayReportFile {
  const stages: WayReportStage[] = input.stages.map((stage) => ({
    index: stage.index,
    name: stage.name,
    sliceKm: Math.round(stage.sliceKm * 1000) / 1000,
    distanceKm: stage.distanceKm,
    ratio: stage.distanceKm > 0 ? Math.round((stage.sliceKm / stage.distanceKm) * 10000) / 10000 : 0,
    passedGate: withinGate(stage.sliceKm, stage.distanceKm),
    boundaryMode: stage.boundaryMode,
    routePoints: stage.routePoints,
    moments: stage.moments,
    momentsBeyondEnds: stage.momentsBeyondEnds,
    momentsWithText: stage.momentsWithText,
    marks: stage.marks,
    marksTrimmed: stage.marksTrimmed,
    dropped: stage.dropped,
  }));

  const failing = stages.filter((s) => !s.passedGate).map((s) => s.index);
  const withMoment = stages.filter((s) => s.momentsBeyondEnds > 0).length;
  const half = halfOfStages(stages.length);
  const sparse = withMoment < half;
  const placesPerStage =
    stages.length === 0
      ? 0
      : Math.round((stages.reduce((sum, s) => sum + s.momentsBeyondEnds, 0) / stages.length) * 10) / 10;

  return {
    schemaVersion: SCHEMA_VERSION,
    routeId: input.routeId,
    generatedAt: input.generatedAt,
    walkedLine: {
      source: input.walkedLine.source,
      points: input.walkedLine.points,
      lengthKm: Math.round(input.walkedLine.lengthKm * 1000) / 1000,
    },
    stages,
    gate: { passed: failing.length === 0, failing },
    places: {
      sparse,
      stagesWithMomentBeyondEnds: withMoment,
      halfOfStages: half,
      placesPerStage,
      ...(sparse
        ? {
            note:
              `only ${withMoment} of ${stages.length} stages carry a place beyond their own ` +
              `start and end; the app's card will say "few places marked yet"`,
          }
        : {}),
    },
  };
}
```

- [ ] **Step 4: Run the catalog test to verify it passes**

Run: `node --import tsx --test scripts/ways/catalog.test.ts`
Expected: PASS — `ℹ pass 8`, `ℹ fail 0`

- [ ] **Step 5: Write the failing test for the build step**

Create `scripts/build-ways.test.ts`:

```ts
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
```

- [ ] **Step 6: Run it to verify it fails**

Run: `node --import tsx --test scripts/build-ways.test.ts`
Expected: FAIL — `Cannot find module './build-ways.js'`

- [ ] **Step 7: Add the index fields in `scripts/build-index.ts`**

`REGION_BY_COUNTRY` was already exported in Step 3. The file's existing `fs` import already brings in `readFileSync`, `existsSync`, `readdirSync` and `statSync`, so no import changes are needed.

Add, immediately after the `RouteEntry` interface:

```ts
/** What the app needs to size a download, and to say how curated it is. */
export interface WaysEntry {
  stageCount: number;
  bytes: number;
  /** Places beyond the day's own ends, averaged over the stages. */
  placesPerStage: number;
  /** Fewer than half the stages carry such a place: the card says so. */
  sparse: boolean;
}
```

Add `ways?: WaysEntry;` as the last property of `RouteEntry`, and `release: string;` to `RouteIndex` immediately after `schemaVersion`.

Add these two functions above `scanRoutes`:

```ts
/**
 * The tag the release will carry, read from package.json rather than from git:
 * the tag does not exist yet when this runs, and CI has no tags at all.
 * .claude/commands/release.md bumps the version before regenerating.
 */
export function releaseTag(packageJsonPath: string): string {
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { version?: string };
  const version = pkg.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`package.json version "${version}" is not a SemVer release`);
  }
  return `v${version}`;
}

/**
 * A route earns a catalog entry when its own report says every stage cleared
 * the length gate. Coverage does not gate it — it rides along as
 * `placesPerStage` and `sparse`, which is what the app's card reads. Reading
 * the report rather than recomputing keeps one verdict, in one file, that a
 * reviewer can open.
 */
export function waysEntry(routeDir: string): WaysEntry | undefined {
  const reportPath = join(routeDir, "ways", "report.json");
  const cardPath = join(routeDir, "ways", "route.json");
  if (!existsSync(reportPath) || !existsSync(cardPath)) return undefined;

  let report: {
    gate?: { passed?: boolean };
    places?: { sparse?: boolean; placesPerStage?: number };
    stages?: unknown[];
  };
  try {
    report = JSON.parse(readFileSync(reportPath, "utf-8"));
  } catch {
    return undefined;
  }
  if (report.gate?.passed !== true) return undefined;

  let bytes = 0;
  const waysDir = join(routeDir, "ways");
  for (const entry of readdirSync(waysDir)) {
    // report.json is the repo's own bookkeeping; the app never downloads it.
    if (entry === "report.json") continue;
    bytes += statSync(join(waysDir, entry)).size;
  }

  return {
    stageCount: report.stages?.length ?? 0,
    bytes,
    placesPerStage: report.places?.placesPerStage ?? 0,
    sparse: report.places?.sparse ?? true,
  };
}
```

In `scanRoutes`, after `const variants = scanVariants(routeDir, root);` add:

```ts
    const ways = waysEntry(routeDir);
    if (ways) {
      routeEntry.ways = ways;
    }
```

Change `buildIndex`'s signature and body so the release rides along:

```ts
export function buildIndex(
  routesDir: string,
  previous: RouteIndex | null,
  now: () => string,
  root: string,
  release: string,
): RouteIndex {
  const routes = scanRoutes(routesDir, root);

  // Compare everything except the timestamp. Identical content keeps the old
  // stamp so re-running the generator is a genuine no-op and the CI drift
  // check has something stable to diff against.
  const content = JSON.stringify({ schemaVersion: SCHEMA_VERSION, release, routes });
  const previousContent =
    previous === null
      ? null
      : JSON.stringify({
          schemaVersion: previous.schemaVersion,
          release: previous.release,
          routes: previous.routes,
        });

  return {
    schemaVersion: SCHEMA_VERSION,
    release,
    generatedAt:
      content === previousContent && typeof previous?.generatedAt === "string"
        ? previous.generatedAt
        : now(),
    routes,
  };
}
```

And in `main()`:

```ts
  const index = buildIndex(
    routesDir,
    readPrevious(indexPath),
    () => new Date().toISOString(),
    ROOT,
    releaseTag(join(ROOT, "package.json")),
  );
```

- [ ] **Step 8: Write `scripts/build-ways.ts`**

```ts
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { join } from "path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { resolveInvokedPath } from "./cli.js";
import type { Position, WayFile, WayReportFile, WayRouteFile } from "./ways/types.js";
import { SCHEMA_VERSION } from "./ways/types.js";
import {
  walkedLine,
  cumulativeMeters,
  lineLengthMeters,
  stageBoundaries,
  simplify,
  strideCap,
  roundLine,
  routePoints,
  RDP_TOLERANCE_METERS,
  MAX_ROUTE_POINTS,
} from "./ways/geo.js";
import { buildMoments, type WaypointFeature } from "./ways/moments.js";
import { buildMarks } from "./ways/marks.js";
import { buildStageBlock, midpointHours, type DatasetStage } from "./ways/stage.js";
import { wholeSecondISO } from "./ways/text.js";
import { buildReport, buildRouteCard, type ReportStageInput, type RouteMetadata } from "./ways/catalog.js";

export function stageFileName(index: number): string {
  return `stage-${String(index).padStart(2, "0")}.json`;
}

export interface RouteWaysInput {
  routeId: string;
  metadata: RouteMetadata & { lastUpdated: string };
  stages: DatasetStage[];
  waypoints: WaypointFeature[];
  routeGeoJson: unknown;
  walkedLineSource: "route.main.geojson" | "route.geojson";
  hasCover: boolean;
}

export interface RouteWaysResult {
  ways: WayFile[];
  route: WayRouteFile;
  report: WayReportFile;
  /** True when every stage cleared the length gate, so a package was built. */
  emitted: boolean;
}

export function buildRouteWays(input: RouteWaysInput): RouteWaysResult {
  const line = walkedLine(input.routeGeoJson);
  const cumulative = cumulativeMeters(line);

  const anchors: Position[] = input.stages.map((s) => s.start.coordinates);
  anchors.push(input.stages[input.stages.length - 1].end.coordinates);
  const boundaries = stageBoundaries(
    line,
    cumulative,
    anchors,
    input.stages.map((s) => s.distanceKm),
  );

  const ways: WayFile[] = [];
  const reportStages: ReportStageInput[] = [];

  for (const stage of input.stages) {
    const from = Math.min(boundaries[stage.index].index, boundaries[stage.index + 1].index);
    const to = Math.max(boundaries[stage.index].index, boundaries[stage.index + 1].index);

    // Round last: the app measures the rounded line, so the build must too.
    const slice = roundLine(
      strideCap(simplify(line.slice(from, to + 1), RDP_TOLERANCE_METERS), MAX_ROUTE_POINTS),
    );
    const sliceCumulative = cumulativeMeters(slice);
    const meters = lineLengthMeters(slice);
    const hours = midpointHours(stage.estimatedHours);

    const stageWaypoints = input.waypoints.filter((w) => w.properties.stageIndex === stage.index);
    const moments = buildMoments({
      line: slice,
      cumulative: sliceCumulative,
      waypoints: stageWaypoints,
      start: { name: stage.start.name.en, at: stage.start.coordinates, localized: stage.start.name },
      end: { name: stage.end.name.en, at: stage.end.coordinates, localized: stage.end.name },
    });
    const marks = buildMarks({ line: slice, cumulative: sliceCumulative, waypoints: stageWaypoints });
    const block = buildStageBlock(input.routeId, input.stages.length, stage);

    // No `source`: the app assigns .pilgrimage(routeId:stageIndex:) from the
    // stage block, and refuses a file whose block disagrees with what it
    // fetched. Writing one here would be a field nothing reads.
    ways.push({
      schemaVersion: SCHEMA_VERSION,
      id: `pilgrimage:${input.routeId}:${stage.index}`,
      // The stage block's name is already trimmed and capped to 120.
      title: block.name,
      departedAt: wholeSecondISO(input.metadata.lastUpdated),
      route: routePoints(slice, sliceCumulative, hours),
      totalDistanceMeters: Math.round(meters * 10) / 10,
      theirActiveSeconds: Math.round(hours * 3600),
      moments: moments.moments,
      marks: marks.marks,
      stage: block,
    });

    reportStages.push({
      index: stage.index,
      name: stage.name.en,
      sliceKm: meters / 1000,
      distanceKm: stage.distanceKm,
      boundaryMode: boundaries[stage.index].mode,
      routePoints: slice.length,
      moments: moments.moments.length,
      momentsBeyondEnds: moments.beyondEnds,
      momentsWithText: moments.moments.filter((m) => m.text !== undefined).length,
      marks: marks.marks.length,
      marksTrimmed: marks.trimmed,
      dropped: [...moments.dropped, ...marks.dropped].sort(),
    });
  }

  const report = buildReport({
    routeId: input.routeId,
    generatedAt: input.metadata.lastUpdated,
    walkedLine: {
      source: input.walkedLineSource,
      points: line.length,
      lengthKm: lineLengthMeters(line) / 1000,
    },
    stages: reportStages,
  });

  return {
    ways: report.gate.passed ? ways : [],
    route: buildRouteCard(input.routeId, input.metadata, input.stages, input.hasCover),
    report,
    emitted: report.gate.passed,
  };
}

function loadJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function createValidator(root: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const name of ["way.schema.json", "way-route.schema.json", "way-report.schema.json"]) {
    ajv.addSchema(loadJson(join(root, "schema", name)), name);
  }
  return ajv;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function main(): void {
  const root = process.cwd();
  const routesDir = join(root, "routes");
  const ajv = createValidator(root);
  const failures: string[] = [];

  for (const entry of readdirSync(routesDir).sort()) {
    const routeDir = join(routesDir, entry);
    if (!statSync(routeDir).isDirectory()) continue;

    const metadataPath = join(routeDir, "metadata.json");
    const stagesPath = join(routeDir, "stages.json");
    const waypointsPath = join(routeDir, "waypoints.geojson");
    if (!existsSync(metadataPath) || !existsSync(stagesPath) || !existsSync(waypointsPath)) continue;

    const mainLinePath = join(routeDir, "route.main.geojson");
    const source = existsSync(mainLinePath) ? "route.main.geojson" : "route.geojson";
    const geoPath = join(routeDir, source);
    if (!existsSync(geoPath)) continue;

    const metadata = loadJson(metadataPath);
    const result = buildRouteWays({
      routeId: metadata.id,
      metadata,
      stages: loadJson(stagesPath).stages,
      waypoints: loadJson(waypointsPath).features,
      routeGeoJson: loadJson(geoPath),
      walkedLineSource: source,
      hasCover: existsSync(join(routeDir, "cover.jpg")),
    });

    const waysDir = join(routeDir, "ways");
    // A stale package from an earlier build would outlive the data that
    // justified it, and CI's drift check would never see it go.
    rmSync(waysDir, { recursive: true, force: true });
    mkdirSync(waysDir, { recursive: true });

    if (!ajv.validate("way-report.schema.json", result.report)) {
      failures.push(`${metadata.id}: report.json is invalid — ${JSON.stringify(ajv.errors)}`);
      continue;
    }
    writeJson(join(waysDir, "report.json"), result.report);

    // A coverage failure is reported, not fatal: a dataset whose routes do not
    // all have a walked line yet is unfinished, not broken, and `npm run
    // pipeline` has to stay runnable while that is true. Only a schema failure
    // — a package that would not decode on the phone — exits non-zero.
    if (!result.emitted) {
      console.log(`${metadata.id}: no package — ${result.report.gate.failing.length} stage(s) outside the gate`);
      for (const index of result.report.gate.failing) {
        const stage = result.report.stages[index];
        console.log(
          `    stage ${index} ("${stage.name}"): the walked line measures ` +
            `${stage.sliceKm.toFixed(2)} km against a declared ${stage.distanceKm} km`,
        );
      }
      continue;
    }

    if (!ajv.validate("way-route.schema.json", result.route)) {
      failures.push(`${metadata.id}: route.json is invalid — ${JSON.stringify(ajv.errors)}`);
      continue;
    }
    writeJson(join(waysDir, "route.json"), result.route);

    for (const way of result.ways) {
      if (!ajv.validate("way.schema.json", way)) {
        failures.push(`${metadata.id}: ${way.id} is invalid — ${JSON.stringify(ajv.errors)}`);
        continue;
      }
      writeJson(join(waysDir, stageFileName(way.stage.index)), way);
    }

    const coverage = result.report.places.sparse
      ? `sparse (${result.report.places.placesPerStage} places per stage — ${result.report.places.note})`
      : `${result.report.places.placesPerStage} places per stage`;
    console.log(`${metadata.id}: ${result.ways.length} stage(s), listed, ${coverage}`);
    const trimmed = result.report.stages.filter((stage) => stage.marksTrimmed > 0);
    for (const stage of trimmed) {
      console.log(`    stage ${stage.index}: ${stage.marksTrimmed} mark(s) over the app's limit, farthest from the line dropped`);
    }
  }

  if (failures.length > 0) {
    console.error("\nBuild failed:");
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
```

- [ ] **Step 9: Run the build-ways test to verify it passes**

Run: `node --import tsx --test scripts/build-ways.test.ts`
Expected: PASS — `ℹ pass 13`, `ℹ fail 0`

- [ ] **Step 10: Add the index tests**

Append to `scripts/build-index.test.ts`:

Extend the file's existing `./build-index.js` import to `import { buildIndex, scanRoutes, readPrevious, releaseTag, waysEntry, type RouteIndex } from "./build-index.js";`, then add:

```ts
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
```

Then update the existing call sites — count them, do not guess:

- **Thirteen `buildIndex(ROUTES, …)` calls** (lines 112, 113, 120, 122, 128, 132, 138, 144, 150, 156, 163, 183, 185) each gain `RELEASE` as a fifth argument, e.g. `buildIndex(ROUTES, null, () => OLD, ROOT, RELEASE)`.
- **Two bare `RouteIndex` object literals** gain `release: RELEASE`: `sameContent` (line 133) and `contents` in the *readPrevious parses a valid index file* test (line 284). Both spell out every field, so `tsc` fails on the new required one.
- **Nothing else needs touching.** `stale` (line 121) and `previous` (line 184) are built from an already-`release`-carrying index by spread and by JSON round-trip; `missingGeneratedAt` (line 148) and `numericGeneratedAt` (line 161) go through `as unknown as RouteIndex`, which suppresses the check by design.

Run `npx tsc --noEmit` after this step — it is the only thing that proves every call site was found.

- [ ] **Step 11: Describe the new index fields in `schema/index.schema.json`**

Add `"release"` to the top-level `required` array so it reads `["schemaVersion", "release", "generatedAt", "routes"]`, add this property beside `schemaVersion`:

```json
    "release": {
      "type": "string",
      "pattern": "^v\\d+\\.\\d+\\.\\d+$",
      "description": "The git tag this build will be released under. The app pins every package download to it."
    },
```

and add this property to `$defs.RouteEntry.properties`:

```json
        "ways": {
          "type": "object",
          "required": ["stageCount", "bytes", "placesPerStage", "sparse"],
          "description": "Present only when every stage of the route's package cleared the length gate. Absent means the app hides the route. `sparse` is true when fewer than half the stages carry a place beyond the day's own start and end, and the app's card says so.",
          "properties": {
            "stageCount": { "type": "integer", "minimum": 1, "maximum": 200 },
            "bytes": { "type": "integer", "minimum": 1, "maximum": 52428800 },
            "placesPerStage": { "type": "number", "minimum": 0, "maximum": 200 },
            "sparse": { "type": "boolean" }
          },
          "additionalProperties": false
        },
```

- [ ] **Step 12: Validate the new outputs in `scripts/validate.ts`**

In `createValidator`, extend the schema list to:

```ts
  for (const name of [
    "index.schema.json",
    "pilgrimage.schema.json",
    "stages.schema.json",
    "route.schema.json",
    "waypoints.schema.json",
    "way.schema.json",
    "way-route.schema.json",
    "way-report.schema.json",
  ]) {
```

Add this function above `main`:

```ts
/**
 * The build validates what it writes, but the committed files are what ships:
 * a hand-edited stage file, or one left behind by an older build, would
 * otherwise reach the CDN unchecked.
 */
function validateWays(ajv: Ajv, routeDir: string, errors: ValidationError[]): void {
  const waysDir = join(routeDir, "ways");
  if (!existsSync(waysDir) || !statSync(waysDir).isDirectory()) return;

  validateFile(ajv, "way-report.schema.json", join(waysDir, "report.json"), errors);
  validateFile(ajv, "way-route.schema.json", join(waysDir, "route.json"), errors);
  for (const entry of readdirSync(waysDir)) {
    if (!/^stage-\d{2}\.json$/.test(entry)) continue;
    validateFile(ajv, "way.schema.json", join(waysDir, entry), errors);
  }
}
```

In `main()`'s per-route loop, after `validateFile(ajv, "waypoints.schema.json", …)` add:

```ts
    validateFile(ajv, "route.schema.json", join(dir, "route.main.geojson"), errors);
    validateWays(ajv, dir, errors);
```

(`validateFile` already returns early for a path that does not exist, so a route without a main line or a `ways/` directory costs nothing.)

- [ ] **Step 13: Wire the pipeline in `package.json`**

Change the `scripts` block's `pipeline` line and add two commands:

```json
    "build-ways": "tsx scripts/build-ways.ts",
    "build-main-line": "tsx scripts/enrich/build-main-line.ts",
    "pipeline": "npm run fetch && npm run build-ways && npm run build-index && npm run validate",
```

(`build-main-line` is written in Task 6; naming it here keeps one edit to `package.json` in the plan.)

- [ ] **Step 14: Run the build against the committed dataset**

Run: `npm run build-ways; echo "exit $?"`
Expected: a `no package` line for every one of the seven routes and `exit 0`, because no route has a `route.main.geojson` yet and `route.geojson` bundles variants. For example:

```
camino-frances: no package — 22 stage(s) outside the gate
    stage 1 ("Roncesvalles to Zubiri"): the walked line measures 24.21 km against a declared 21.4 km
    …
shikoku-88: no package — 10 stage(s) outside the gate
…
exit 0
```

This is the honest starting state, and it is what Task 6 fixes for the Camino Francés.

- [ ] **Step 15: Run the whole pipeline**

Run: `npm run build-ways && npm run build-index && npm run validate`
Expected: seven `no package` lines; `Generated index.json with 7 route(s)`; `Validation passed (0 warning(s))`. `git status --porcelain routes index.json` now shows seven new `routes/*/ways/report.json` files and a modified `index.json` carrying `"release": "v1.6.0"` and no `ways` entries.

- [ ] **Step 16: Run the full suite and type-check**

Run: `npm test && npx tsc --noEmit`
Expected: `ℹ fail 0`, then no tsc output

- [ ] **Step 17: Run `npm run build-ways` in CI**

In `.github/workflows/validate.yml`, insert this step immediately **before** the existing `- name: Build index` step:

```yaml
      - name: Build ways
        run: npm run build-ways
```

The order matters and mirrors `npm run pipeline`: `build-ways` writes `routes/*/ways/`, then `build-index` reads those reports to decide each route's `ways` entry, then the existing "Check index.json is up to date" step diffs `index.json` and the existing "Check generated assets are up to date" step diffs `routes`. Putting `build-ways` after `build-index` would leave a ways rebuild that changed a package's byte size unable to fail the index check.

- [ ] **Step 18: Commit**

```bash
git add scripts/ways/catalog.ts scripts/ways/catalog.test.ts scripts/build-ways.ts scripts/build-ways.test.ts \
  scripts/build-index.ts scripts/build-index.test.ts scripts/validate.ts \
  schema/index.schema.json package.json .github/workflows/validate.yml routes index.json
git commit -m "$(cat <<'EOF'
feat(ways): build stage packages, a coverage report, and the catalog floor

npm run build-ways writes routes/<id>/ways/ and npm run pipeline now runs it
before build-index, so index.json can carry the release tag the app pins its
downloads to and, per route, the stage count, byte size, and curation of a
package whose every stage cleared the length gate. The review's coverage floor
became a flag on that entry rather than a gate on it: measured, gating on it
listed nothing at all.

The report is written even for a route that fails, because a route that fails
is exactly the one whose report someone needs to read. As of this commit all
seven fail: none has a walked line yet, and route.geojson bundles the optional
variants — the Camino Frances measures 994 km of geometry against 764 km of
stages. Task 6 gives it one.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: The walked line

**Files:**
- Create: `scripts/enrich/build-main-line.ts`
- Create: `scripts/enrich/build-main-line.test.ts`
- Create: `routes/camino-frances/route.main.geojson`
- Modify: `routes/camino-frances/stages.json` (two compensating `distanceKm` corrections)
- Modify: `routes/camino-frances/ways/**` and `index.json` (regenerated)

**Interfaces:**
- Consumes: `queryOverpass`, `buildRelationGeomQuery`, `OsmRelation` from `scripts/enrich/osm.ts`; `haversineMeters` and `lineLengthMeters` from `scripts/ways/geo.ts`; `Position` from `scripts/ways/types.ts`; `resolveInvokedPath` from `scripts/cli.ts`.
- Produces:
  - `WayGraph = { nodes: Position[]; adjacency: Map<number, GraphEdge[]> }`, `GraphEdge = { to: number; meters: number; line: Position[] }`
  - `buildWayGraph(ways: Position[][]): WayGraph`
  - `nearestGraphNode(graph: WayGraph, p: Position): { node: number; meters: number }`
  - `shortestPath(graph: WayGraph, from: number, to: number): { meters: number; line: Position[] } | null`
  - `mainLine(ways: Position[][], anchors: Position[]): { line: Position[]; legs: number[]; missing: string[] }`

**What the investigation found, so the implementer does not repeat it:**

- `route.geojson` cannot be filtered down to a walked line. `scripts/enrich/geometry.ts` already excludes members with `role === "alternative"`, and yet the Camino Francés' committed geometry is 994.4 km against 763.7 km of stages. Querying the six sub-relations' member roles directly returns **`{"(empty)": 523}`, `{"(empty)": 691}`, … — every single member role is empty.** The alternatives are ordinary unroled members. There is no role, tag, or sub-relation to filter on.
- The superroute (2163573) carries exactly those six sub-relations plus one member with `role: "alternative"` (relation 1844694), which the existing fetch already excludes. So the excess is *inside* the six, not beside them.
- Zipping the committed polyline's vertices within 15 m and running Dijkstra over that gives 633.0 km and puts 29 of 33 stages outside the gate — it cuts corners wherever the route passes near itself in a town. **Rejected.**
- Building the graph from OSM's *member ways*, where connectivity is exact coordinate identity rather than a fuzzy radius, and running Dijkstra between consecutive stage anchors gives **767.5 km over 32,820 points, with 2 of 33 stages outside the gate.** This is the algorithm below.
- Shikoku 88's own attempt produces a 1,101 km line against stage distances summing to 907 km for a ~1,200 km circuit, and 10 of 10 stages fail. `CHANGELOG.md` already documents why: its 10-stage breakdown is "a simplification of the full 1,200 km circuit, 293 km of which is unstaged coastal road". Its stage distances, not its geometry, are what would need work. **Shikoku gets no `route.main.geojson` in this plan.**

**The one manual step, and its guardrail.** After the Camino's line is built, two stages remain outside the gate — 16 (Carrión de los Condes to Terradillos de los Templarios, measured ~23.3 km against a declared 26.3) and 17 (Terradillos to Bercianos del Real Camino, ~26.0 against 23.2). They are a compensating pair: Brierley splits that day at a different albergue than the point on the OSM line nearest Terradillos, so one stage borrows what the other lends and the route total barely moves. Correcting both to the measured figures is legitimate; correcting stages one at a time until the gate goes quiet is not. **The guardrail: only correct a set of stages whose net change to the route total is under 0.5 km, and re-assert that the sum still rounds to `metadata.overview.distanceKm`. Anything else is a data problem to report, not to paper over.**

- [ ] **Step 1: Write the failing test**

Create `scripts/enrich/build-main-line.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWayGraph, nearestGraphNode, shortestPath, mainLine } from "./build-main-line.js";
import type { Position } from "../ways/types.js";

/** 0.01° at the equator on the R = 6,371,000 m sphere. */
const LEG = 1111.949;

/**
 * A main line from (0,0) east to (0.03,0), with a longer alternative between
 * (0.01,0) and (0.02,0) — the exact shape OSM bundles into a route relation
 * with no role to tell the two apart.
 */
const WAYS: Position[][] = [
  [[0, 0], [0.005, 0], [0.01, 0]],
  [[0.01, 0], [0.015, 0], [0.02, 0]],
  [[0.01, 0], [0.015, 0.005], [0.02, 0]],
  [[0.02, 0], [0.025, 0], [0.03, 0]],
];

test("buildWayGraph joins ways at coordinates they share exactly", () => {
  const graph = buildWayGraph(WAYS);
  // (0,0), (0.01,0), (0.02,0), (0.03,0) — the four way endpoints.
  assert.equal(graph.nodes.length, 4);
  assert.equal(graph.adjacency.get(1)!.length, 3);
});

test("buildWayGraph splits a way at a coordinate another way meets in its middle", () => {
  const graph = buildWayGraph([
    [[0, 0], [0.01, 0], [0.02, 0]],
    [[0.01, 0], [0.01, 0.01]],
  ]);
  const junction = nearestGraphNode(graph, [0.01, 0]);
  assert.ok(junction.meters < 1e-6);
  assert.equal(graph.adjacency.get(junction.node)!.length, 3);
});

test("nearestGraphNode reports the node and how far off it was", () => {
  const graph = buildWayGraph(WAYS);
  const found = nearestGraphNode(graph, [0.0201, 0]);
  assert.deepEqual(graph.nodes[found.node], [0.02, 0]);
  assert.ok(Math.abs(found.meters - 11.1) < 0.2);
});

test("shortestPath takes the main line and leaves the longer alternative behind", () => {
  const graph = buildWayGraph(WAYS);
  const from = nearestGraphNode(graph, [0, 0]).node;
  const to = nearestGraphNode(graph, [0.03, 0]).node;
  const path = shortestPath(graph, from, to)!;

  assert.ok(Math.abs(path.meters - 3 * LEG) < 1, `${path.meters}`);
  assert.equal(path.line.some((p) => p[1] !== 0), false, "the alternative's detour leaked in");
  assert.deepEqual(path.line[0], [0, 0]);
  assert.deepEqual(path.line.at(-1), [0.03, 0]);
});

test("shortestPath returns null when the two nodes are not connected", () => {
  const graph = buildWayGraph([
    [[0, 0], [0.01, 0]],
    [[1, 1], [1.01, 1]],
  ]);
  const from = nearestGraphNode(graph, [0, 0]).node;
  const to = nearestGraphNode(graph, [1.01, 1]).node;
  assert.equal(shortestPath(graph, from, to), null);
});

test("mainLine walks the anchors in order and reports each leg", () => {
  const result = mainLine(WAYS, [[0, 0], [0.02, 0], [0.03, 0]]);
  assert.equal(result.missing.length, 0);
  assert.equal(result.legs.length, 2);
  assert.ok(Math.abs(result.legs[0] - 2 * LEG) < 1);
  assert.ok(Math.abs(result.legs[1] - LEG) < 1);
  assert.deepEqual(result.line[0], [0, 0]);
  assert.deepEqual(result.line.at(-1), [0.03, 0]);
});

test("mainLine names the legs it could not connect rather than silently skipping them", () => {
  const result = mainLine(
    [
      [[0, 0], [0.01, 0]],
      [[1, 1], [1.01, 1]],
    ],
    [[0, 0], [0.01, 0], [1.01, 1]],
  );
  assert.equal(result.missing.length, 1);
  assert.match(result.missing[0], /leg 1/);
});

test("mainLine never repeats the point where one leg ends and the next begins", () => {
  const result = mainLine(WAYS, [[0, 0], [0.01, 0], [0.02, 0], [0.03, 0]]);
  for (let i = 1; i < result.line.length; i++) {
    assert.notDeepEqual(result.line[i], result.line[i - 1]);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx --test scripts/enrich/build-main-line.test.ts`
Expected: FAIL — `Cannot find module './build-main-line.js'`

- [ ] **Step 3: Write `scripts/enrich/build-main-line.ts`**

```ts
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { queryOverpass, buildRelationGeomQuery, type OsmRelation } from "./osm.js";
import { haversineMeters, lineLengthMeters } from "../ways/geo.js";
import type { Position } from "../ways/types.js";

const ROOT = join(import.meta.dirname, "../..");

export interface GraphEdge {
  to: number;
  meters: number;
  /** The edge's own geometry, already oriented from this node to `to`. */
  line: Position[];
}

export interface WayGraph {
  nodes: Position[];
  adjacency: Map<number, GraphEdge[]>;
}

const key = (p: Position): string => `${p[0]},${p[1]}`;

/**
 * Connectivity by exact coordinate identity, not by a radius. Overpass emits
 * a way's shared node with the same seven decimals in every way that carries
 * it, so identity is the true topology — and a fuzzy radius is what made the
 * first attempt at this cut corners wherever the route passes near itself in
 * a town (633 km instead of 764).
 */
export function buildWayGraph(ways: Position[][]): WayGraph {
  const occurrences = new Map<string, number>();
  for (const way of ways) {
    for (const point of way) occurrences.set(key(point), (occurrences.get(key(point)) ?? 0) + 1);
  }

  const nodes: Position[] = [];
  const nodeIds = new Map<string, number>();
  const nodeId = (p: Position): number => {
    const k = key(p);
    let id = nodeIds.get(k);
    if (id === undefined) {
      id = nodes.length;
      nodeIds.set(k, id);
      nodes.push(p);
    }
    return id;
  };

  const adjacency = new Map<number, GraphEdge[]>();
  const link = (from: number, to: number, line: Position[]): void => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    if (!adjacency.has(to)) adjacency.set(to, []);
    const meters = lineLengthMeters(line);
    adjacency.get(from)!.push({ to, meters, line });
    adjacency.get(to)!.push({ to: from, meters, line: [...line].reverse() });
  };

  for (const way of ways) {
    if (way.length < 2) continue;
    let start = 0;
    for (let i = 1; i < way.length; i++) {
      // A coordinate another way also carries is a real junction, even in the
      // middle of this one; without splitting there, a side path that meets
      // this way mid-block would be unreachable.
      const isJunction = (occurrences.get(key(way[i])) ?? 0) > 1;
      if (isJunction || i === way.length - 1) {
        const segment = way.slice(start, i + 1);
        if (segment.length >= 2) link(nodeId(segment[0]), nodeId(segment[segment.length - 1]), segment);
        start = i;
      }
    }
  }

  return { nodes, adjacency };
}

export function nearestGraphNode(graph: WayGraph, p: Position): { node: number; meters: number } {
  let node = 0;
  let meters = Infinity;
  for (let i = 0; i < graph.nodes.length; i++) {
    const d = haversineMeters(graph.nodes[i], p);
    if (d < meters) {
      meters = d;
      node = i;
    }
  }
  return { node, meters };
}

export function shortestPath(
  graph: WayGraph,
  from: number,
  to: number,
): { meters: number; line: Position[] } | null {
  const count = graph.nodes.length;
  const distance = new Float64Array(count).fill(Infinity);
  const previous = new Int32Array(count).fill(-1);
  const previousLine: Array<Position[] | undefined> = new Array(count);
  const settled = new Uint8Array(count);
  distance[from] = 0;

  // A binary heap, not a linear scan: the Camino's graph has ~3,000 nodes and
  // this runs 33 times, once per stage leg.
  const heap: Array<[number, number]> = [[0, from]];
  const push = (item: [number, number]): void => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
        if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
        i = smallest;
      }
    }
    return top;
  };

  while (heap.length > 0) {
    const [d, u] = pop();
    if (settled[u] === 1) continue;
    settled[u] = 1;
    if (u === to) break;
    for (const edge of graph.adjacency.get(u) ?? []) {
      if (d + edge.meters < distance[edge.to]) {
        distance[edge.to] = d + edge.meters;
        previous[edge.to] = u;
        previousLine[edge.to] = edge.line;
        push([distance[edge.to], edge.to]);
      }
    }
  }

  if (!Number.isFinite(distance[to])) return null;

  const chunks: Position[][] = [];
  for (let u = to; previous[u] !== -1; u = previous[u]) chunks.push(previousLine[u]!);
  chunks.reverse();

  const line: Position[] = [];
  for (const chunk of chunks) {
    for (const point of chunk) {
      const last = line[line.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) line.push(point);
    }
  }
  if (line.length === 0) line.push(graph.nodes[from]);

  return { meters: distance[to], line };
}

export function mainLine(
  ways: Position[][],
  anchors: Position[],
): { line: Position[]; legs: number[]; missing: string[] } {
  const graph = buildWayGraph(ways);
  const nodes = anchors.map((anchor) => nearestGraphNode(graph, anchor));

  const line: Position[] = [];
  const legs: number[] = [];
  const missing: string[] = [];

  const append = (points: Position[]): void => {
    for (const point of points) {
      const last = line[line.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) line.push(point);
    }
  };

  for (let i = 0; i < nodes.length - 1; i++) {
    if (nodes[i].node === nodes[i + 1].node) {
      legs.push(0);
      continue;
    }
    const path = shortestPath(graph, nodes[i].node, nodes[i + 1].node);
    if (!path) {
      missing.push(
        `leg ${i} (${anchors[i].join(",")} → ${anchors[i + 1].join(",")}) has no connected path`,
      );
      legs.push(0);
      continue;
    }
    legs.push(path.meters);
    append(path.line);
  }

  return { line, legs, missing };
}

function loadJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function extractWays(relations: OsmRelation[]): Position[][] {
  const ways: Position[][] = [];
  for (const relation of relations) {
    for (const member of relation.members) {
      if (member.type !== "way" || !member.geometry || member.role === "alternative") continue;
      ways.push(member.geometry.map((point) => [point.lon, point.lat] as Position));
    }
  }
  return ways;
}

async function main(): Promise<void> {
  const routeId = process.argv[2];
  if (!routeId) {
    console.error("Usage: tsx scripts/enrich/build-main-line.ts <route-id>");
    process.exit(1);
  }

  const routeDir = join(ROOT, "routes", routeId);
  const metadata = loadJson(join(routeDir, "metadata.json"));
  const stagesPath = join(routeDir, "stages.json");
  if (!existsSync(stagesPath)) {
    console.error(`${routeId} has no stages.json, so there is nothing to anchor a walked line to.`);
    process.exit(1);
  }
  const stages = loadJson(stagesPath).stages as Array<{
    index: number;
    name: { en: string };
    distanceKm: number;
    start: { coordinates: Position };
    end: { coordinates: Position };
  }>;

  const relationIds: number[] | undefined = metadata.osm?.relations;
  const query = relationIds ? buildRelationGeomQuery(relationIds) : metadata.osm?.query;
  if (!query) {
    console.error(`${routeId}'s metadata.json has no osm.relations or osm.query.`);
    process.exit(1);
  }

  console.log(`Fetching member way geometry for ${routeId}…`);
  const data = (await queryOverpass(query, `main-line-${routeId}`)) as { elements: OsmRelation[] };
  const relations = data.elements.filter((e): e is OsmRelation => e.type === "relation");
  if (relations.length === 0) {
    console.error("Overpass returned no relations. Aborting to preserve existing data.");
    process.exit(1);
  }

  const ways = extractWays(relations);
  console.log(`${relations.length} relation(s), ${ways.length} member way(s)`);

  const anchors: Position[] = stages.map((s) => s.start.coordinates);
  anchors.push(stages[stages.length - 1].end.coordinates);

  const result = mainLine(ways, anchors);
  for (const gap of result.missing) console.warn(`  ⚠ ${gap}`);

  const geojson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: `${routeId}-main-line`,
        geometry: { type: "LineString", coordinates: result.line },
        properties: {
          routeId,
          name: metadata.name.en,
          type: "main",
          source:
            `OpenStreetMap (${relations.length} relations, member ways only, shortest connected ` +
            `path between stage boundaries, fetched ${new Date().toISOString().split("T")[0]})`,
          notes:
            "The walked line: the route's main line with optional variants and detours left out. " +
            "Stage geometry is cut from this, never from route.geojson.",
        },
      },
    ],
  };

  writeFileSync(join(routeDir, "route.main.geojson"), JSON.stringify(geojson, null, 2) + "\n");

  const totalKm = lineLengthMeters(result.line) / 1000;
  const declaredKm = stages.reduce((sum, s) => sum + s.distanceKm, 0);
  console.log(
    `\nWrote route.main.geojson: ${result.line.length} points, ${totalKm.toFixed(1)} km ` +
      `against ${declaredKm.toFixed(1)} km of stages\n`,
  );
  for (const stage of stages) {
    const km = result.legs[stage.index] / 1000;
    const ratio = km / stage.distanceKm;
    const verdict = Math.abs(ratio - 1) <= 0.1 ? "ok  " : "GATE";
    console.log(
      `  ${verdict} ${String(stage.index).padStart(2)} ${stage.name.en.slice(0, 44).padEnd(46)} ` +
        `${km.toFixed(2)} km vs ${stage.distanceKm} km (${ratio.toFixed(3)})`,
    );
  }
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  await main();
}
```

`resolveInvokedPath` comes from `../cli.js` — add it to the imports at the top of the file:

```ts
import { resolveInvokedPath } from "../cli.js";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test scripts/enrich/build-main-line.test.ts`
Expected: PASS — `ℹ pass 8`, `ℹ fail 0`

- [ ] **Step 5: Build the Camino Francés' walked line**

Run: `npx tsx scripts/enrich/build-main-line.ts camino-frances`

Expected (numbers will move slightly as OSM changes; the shape must not):

```
Fetching member way geometry for camino-frances…
6 relation(s), 2982 member way(s)

Wrote route.main.geojson: ~32800 points, ~767.5 km against 763.7 km of stages

  ok   0 Saint-Jean-Pied-de-Port to Roncesvalles       24.02 km vs 24.2 km (0.992)
  …
  GATE 16 Carrión de los Condes to Terradillos de los  23.30 km vs 26.3 km (0.886)
  GATE 17 Terradillos de los Templarios to Bercianos   26.13 km vs 23.2 km (1.126)
  …
```

**Stop and reassess if:** more than four stages report `GATE`, or the line's total is more than 5 % away from 763.7 km, or any leg reports "no connected path". Those mean OSM's relations changed shape, not that the stage data needs correcting.

- [ ] **Step 6: Rebuild the package and read the report**

Run: `npm run build-ways`
Expected: `camino-frances: no package — 2 stage(s) outside the gate`, naming stages 16 and 17 with both figures.

Run: `node -e "const r=require('./routes/camino-frances/ways/report.json'); console.log(r.gate.failing.map(i=>[i, r.stages[i].sliceKm, r.stages[i].distanceKm]))"`
Expected: the two rows, e.g. `[ [ 16, 23.3, 26.3 ], [ 17, 26.04, 23.2 ] ]`

- [ ] **Step 7: Apply the two compensating corrections to `routes/camino-frances/stages.json`**

Set stage 16's `distanceKm` to the reported `sliceKm` rounded to one decimal (≈ `23.3`) and stage 17's to its own (≈ `26.0`), and add a note to each — `stages.schema.json` allows additional properties on a stage:

```json
      "distanceKm": 23.3,
      "distanceNote": "Brierley splits this day at a different albergue in Terradillos de los Templarios than the point on the OSM main line nearest the village. The 3 km this stage loses, stage 17 gains; the route total is unchanged.",
```

and on stage 17:

```json
      "distanceKm": 26.0,
      "distanceNote": "See stage 16: this stage carries the 3 km that Brierley's split point places on the other side of Terradillos de los Templarios. The route total is unchanged.",
```

- [ ] **Step 8: Assert the guardrail — the route total did not move**

Run:
```bash
node -e "const s=require('./routes/camino-frances/stages.json').stages, m=require('./routes/camino-frances/metadata.json'); const sum=s.reduce((a,x)=>a+x.distanceKm,0); console.log(sum.toFixed(1), Math.round(sum), m.overview.distanceKm);"
```
Expected: `763.5 764 764` — the sum moved by 0.2 km and still rounds to the published 764, so `metadata.overview.distanceKm` and `index.json` need no edit.

If the printed rounded sum does **not** equal `m.overview.distanceKm`, revert the corrections and stop: the discrepancy is larger than a split-point disagreement and belongs in an issue, not in this plan.

- [ ] **Step 9: Rebuild everything and confirm the package appears**

Run: `npm run build-ways && npm run build-index && npm run validate`
Expected:
```
camino-frances: 33 stage(s), listed, sparse (0.2 places per stage — only 7 of 33 stages carry a place beyond their own start and end; the app's card will say "few places marked yet")
camino-ingles: no package — …
…
Generated index.json with 7 route(s)
…
Validation passed (0 warning(s))
```

Then confirm the shape on disk:
```bash
ls routes/camino-frances/ways | head -4
node -e "const i=require('./index.json'); const w=i.routes.find(r=>r.ways); console.log(i.release, JSON.stringify(w.ways))"
du -sh routes/camino-frances/ways
```
Expected: `report.json  route.json  stage-00.json  stage-01.json`; `v1.6.0 {"stageCount":33,"bytes":…,"placesPerStage":0.2,"sparse":true}`; a `ways` directory of roughly **0.5–1.2 MB**. `writeJson` pretty-prints with a two-space indent, so the ~200 KB of measured route-array data becomes several times that on disk once every `{ "lat": …, "lon": …, "t": … }` is on its own indented lines, before moments, marks, stage blocks and the report are added.

The Camino Francés is now the one listed route, flagged sparse. That flag is the honest answer to spec open question 2, and curating more sacred sites, viewpoints and cultural sites onto its stages is what clears it.

- [ ] **Step 10: Try Shikoku 88, and record that it cannot pass**

Run: `npx tsx scripts/enrich/build-main-line.ts shikoku-88`
Expected: a line around 1,100 km against 907 km of declared stages, with all ten stages reporting `GATE`.

Then **delete the file it wrote** — Shikoku's stage distances are round estimates for a route whose own `elevationNote` and this repo's `CHANGELOG.md` already say the 10-stage breakdown omits 293 km of coastal road. A walked line it cannot be measured against is worse than none, because the gate would then be arguing with the wrong number:

```bash
rm routes/shikoku-88/route.main.geojson
```

Record the attempt in the commit message; Task 8 records it in `CHANGELOG.md`.

- [ ] **Step 11: Run the full suite and type-check**

Run: `npm test && npx tsc --noEmit`
Expected: `ℹ fail 0`, then no tsc output

- [ ] **Step 12: Commit**

```bash
git add scripts/enrich/build-main-line.ts scripts/enrich/build-main-line.test.ts \
  routes/camino-frances/route.main.geojson routes/camino-frances/stages.json routes/camino-frances/ways \
  routes/*/ways index.json
git commit -m "$(cat <<'EOF'
feat(ways): give the Camino Frances a walked line, and cut its stages from it

route.geojson bundles the optional variants: 994 km of geometry against 764 km
of stages, which hands a 27 km day a 63 km slice. OSM offers nothing to filter
on — every member role in all six sub-relations is empty — so the walked line
is built instead: a graph over the member ways, joined at exactly shared
coordinates, with the shortest connected path between consecutive stage
boundaries. 767.5 km over ~32,800 points, and 31 of 33 stages inside the gate.

The remaining two are a compensating pair around Terradillos de los
Templarios, where Brierley's split point and the OSM line's nearest point
disagree by 3 km in opposite directions. Both are corrected to what the line
measures, with a note; the route total still rounds to the published 764 km.

Shikoku 88 was tried and left without a walked line: its ten stage distances
sum to 907 km for a ~1,200 km circuit, so there is nothing honest to measure
a line against yet.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Release — publish the ref the catalog actually reads

**Files:**
- Modify: `.claude/commands/release.md`
- Modify: `scripts/build-index.test.ts`
- Modify: `scripts/site/cdn.ts`
- Modify: `scripts/site/cdn.test.ts:102-104`
- Modify: `scripts/site/check-site.test.ts:2131-2149`

**Interfaces:**
- Consumes: `releaseTag` from `scripts/build-index.ts` (Task 5).
- Produces: `isRecognizedCdnRef` additionally accepts `main`. No other new code surface — a guard test and a corrected release procedure.

**The `v1` tag is healthy in git and useless on the CDN.** Spec 1.1 says "As of this review the `v1` tag is stale: it points at a March 2026 build with three routes." In git that is false:

```
$ git rev-parse v1^{commit} v1.6.0^{commit}
c1f6de525a991ddb646aa5c72b92b85298a88aca
c1f6de525a991ddb646aa5c72b92b85298a88aca
$ git ls-remote --tags origin | grep -E 'v1\^|v1\.6\.0\^'
c1f6de52…  refs/tags/v1^{}
c1f6de52…  refs/tags/v1.6.0^{}
```

But the symptom the spec describes is real, one layer out — jsDelivr caches a tag URL permanently, so a force-moved tag keeps serving the bytes it first resolved:

```
$ curl -s https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json      | wc -c   # 1725, 3 routes, generatedAt 2026-03-26
$ curl -s https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1.6.0/index.json  | wc -c   # 5071, 7 routes, generatedAt 2026-08-19
$ curl -s https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@main/index.json    | wc -c   # 5071, 7 routes, generatedAt 2026-08-19
```

**The decision, then:** the app reads the catalog from `@main/index.json` — jsDelivr refreshes a branch ref on a ~12 h cycle — and fetches every package file pinned at the exact `release` tag the index names, so a route's stages always come from one build. Moving `v1` buys nothing the app uses, so the release procedure stops doing it.

**And the thing that genuinely breaks without a fix:** `index.json`'s new `release` field is generated from `package.json`'s version, and nothing in the release procedure regenerates `index.json` after Phase 2 bumps that version. A release cut today would publish `"release": "v1.6.0"` inside the `v1.7.0` tree, and every package download would pin to the *previous* release — silently, since both tags resolve.

- [ ] **Step 1: Write the failing guard test**

Append to `scripts/build-index.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and confirm it passes, then prove it bites**

Run: `node --import tsx --test scripts/build-index.test.ts`
Expected: PASS — `index.json` was regenerated in Task 5, so `release` is already `v1.6.0`.

```bash
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); p.version='1.7.0'; fs.writeFileSync('package.json', JSON.stringify(p,null,2)+'\n');"
node --import tsx --test scripts/build-index.test.ts 2>&1 | tail -20
git checkout package.json
```
Expected: FAIL with `index.json is stale — run npm run build-index and commit the result`, then a clean `package.json` again.

- [ ] **Step 3: Teach the CDN guard that `main` is a ref this project publishes against**

`scripts/site/cdn.ts`'s `isRecognizedCdnRef` accepts only the moving major tag and `vX.Y.Z`; its own doc comment calls `@main` "a ref this project has never published against". That is no longer true — it is the ref the Pilgrim app reads its catalog from — and without this change `npm run check-site` fails on the URL Task 8 documents.

Replace the doc comment and body:

```ts
/**
 * Three refs this project actually publishes against:
 *
 * - `@main` — the catalog ref. jsDelivr caches a *tag* URL permanently, so a
 *   force-moved `v1` keeps serving whatever it first resolved (measured: `@v1`
 *   still returns the March 2026 index, three routes, while the tag itself
 *   points at the August commit). A branch ref refreshes on jsDelivr's own
 *   ~12 h cycle, so `@main/index.json` is the only URL that reliably names the
 *   current release. Only `index.json` is fetched this way; everything a
 *   consumer downloads afterwards is pinned to the exact tag it named.
 * - `@vX.Y.Z` — one specific release, and what every package file is pinned to.
 * - `@v{currentMajorVersion()}` — the historical moving major tag. Still
 *   recognised because README and schema `$id`s carry it, but the release
 *   procedure no longer moves it: see .claude/commands/release.md.
 *
 * Anything else — `@latest`, another branch name — is a ref this project has
 * never published against.
 *
 * `currentMajor` defaults to the real package.json-derived value but can be
 * overridden — the same DI shape as fetch-roads.ts's fetchImpl/sleepImpl — so
 * a test can simulate "the next major version bump" without editing
 * package.json.
 */
export function isRecognizedCdnRef(ref: string, currentMajor: string = currentMajorVersion()): boolean {
  return ref === "main" || ref === `v${currentMajor}` || RELEASED_VERSION_REF_PATTERN.test(ref);
}
```

Two existing tests use `@main` as their example of an unrecognised ref and must move to one that still is. In `scripts/site/cdn.test.ts`, replace the test at lines 102–104:

```ts
test("isRecognizedCdnRef accepts main — the ref the app reads its catalog from", () => {
  assert.ok(isRecognizedCdnRef("main"));
});

test("isRecognizedCdnRef rejects any other branch name", () => {
  assert.ok(!isRecognizedCdnRef("feat/ways-build"));
  assert.ok(!isRecognizedCdnRef("latest"));
});
```

In `scripts/site/check-site.test.ts`, the test at lines 2131–2149 pins `@main` as the reported-unrecognised case. Change its three `main` occurrences to `latest` — the URL, the `#given` comment, and the `'"@main"'` assertion:

```ts
test("checkSite reports a CDN link using an unrecognized version ref (synthetic readmeMd)", () => {
  // #given a CDN URL pinned to a ref this project never publishes against —
  // `main` is now the catalog ref, but `latest` still names nothing
  const readmeMd =
    "See https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@latest/index.json for details.";

  // #when checkSite checks that URL's ref
  const problems = checkSite(ROOT, { readmeMd });

  // #then it's reported as unrecognized, against README.md
  assert.ok(
    problems.some(
      (p) =>
        p.file === "README.md" &&
        p.message.includes('"@latest"') &&
        p.message.includes("isn't one this project uses"),
    ),
  );
});
```

Run: `node --import tsx --test scripts/site/cdn.test.ts scripts/site/check-site.test.ts`
Expected: PASS, `ℹ fail 0`

- [ ] **Step 4: Add the regeneration phase to `.claude/commands/release.md`**

Insert a new phase between Phase 2 (Bump `package.json`) and Phase 3 (Update `README.md`):

```markdown
## Phase 2b: Regenerate the ways packages and the index

`index.json` carries a `release` field naming the tag this build will be
published under, and the Pilgrim app pins every package download to it. That
field is generated from `package.json`'s version, so it is wrong until the
index is regenerated *after* Phase 2's bump:

```bash
npm run build-ways
npm run build-index
grep '"release"' index.json
```

The grep must show `"release": "v$VERSION"`. If it shows the previous version,
Phase 2's bump did not land — fix that before going on.

`npm run build-ways` also rewrites every `routes/*/ways/` directory. Review the
diff: a route gaining or losing a `ways` entry in `index.json`, or flipping
`sparse`, is a change to what the app offers its walkers and belongs in the
CHANGELOG.

**Halt the release** if `npm run build-ways` exits non-zero — that is a schema
failure, not a coverage one, and it means a package on its way to the CDN does
not match the contract the app decodes.
```

In Phase 6, change the `git add` line to include the regenerated files:

```bash
git add package.json README.md CHANGELOG.md index.json routes
```

- [ ] **Step 5: Delete the moving-tag phase and record why**

Replace the whole of Phase 8 ("Move the `v1` (or current major) moving tag") with:

```markdown
## Phase 8: The `v1` alias is not maintained

Earlier releases force-moved a `v1` tag onto each release commit. That has
stopped, and this phase exists to say so rather than leave the omission
looking like a mistake.

jsDelivr caches a tag URL permanently. `v1` was moved onto the v1.6.0 commit
in August 2026 and `https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json`
still serves the March 2026 index — three routes, 1,725 bytes — while
`@v1.6.0` and `@main` both serve the current seven-route index. A moving tag
whose CDN never moves is a promise this project cannot keep.

So: the Pilgrim app reads the catalog from `@main/index.json`, which jsDelivr
refreshes on its own ~12 h cycle, and pins every package file to the exact
`release` tag that index names.

`@v1` URLs in the README and in the schemas' `$id` fields still resolve — to
the bytes jsDelivr cached. If anyone ever needs one refreshed, the only lever
is a purge:

```bash
curl "https://purge.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json"
```

Do not re-add a `git tag -fa v1` step without also purging every `@v1` path
the site and README reference; a moved tag alone changes nothing a consumer
sees.
```

In Phase 9, drop the `v1` push so only the release tag goes out:

```bash
git push origin main
git push origin v$VERSION
```

and delete the sentence beneath it about `--force` being required for the
moving tag.

In Phase 11's verification list, replace "Both `v$VERSION` and `v1` tags point
at HEAD" with "`v$VERSION` points at HEAD".

- [ ] **Step 6: Finish the deprecation everywhere the doc still promises `@v1`**

Five places still tell a releaser, or a consumer reading the release notes, that `@v1` is the ref to use. Rewrite each.

**Phase 10 — the GitHub Release body template.** Replace its CDN section:

```markdown
## 📦 CDN

\`\`\`
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@main/index.json
\`\`\`

Read the catalog from \`@main\` — jsDelivr refreshes a branch ref on its own
cycle — then pin every file you download to the tag that index's \`release\`
field names:

\`\`\`
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v$VERSION/routes/camino-frances/ways/route.json
\`\`\`

The \`@v1\` alias is no longer maintained: jsDelivr caches tag URLs
permanently, so it still serves a March 2026 build. Purge manually via
\`https://purge.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/\` if you
depend on it.
```

**Phase 13 — the purge rationale.** Replace the paragraph beginning "No longer optional: Phase 14 depends on it. `v1` is a moving tag…" with:

```markdown
No longer optional: Phase 14 depends on it. jsDelivr caches by ref, and `@main`
is the ref the catalog is read from, so until it is purged Phase 14 can fail on
`@main` URLs that are actually fine — just still serving the previous release
out of cache.
```

Replace the two `curl` commands beneath it with:

```bash
curl "https://purge.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@main/index.json"
curl "https://purge.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v$VERSION/index.json"
```

Also replace the sentence after them — "This purges `index.json` at both refs, which is normally enough to make jsDelivr re-resolve `@v1` to the new commit…" — with:

```markdown
This purges `index.json` at both refs, which is normally enough to make
jsDelivr re-resolve `@main` to the new commit for every other path too. If
Phase 14 still reports a stale-looking failure on some other URL afterward,
purge that specific URL the same way (swap `cdn.jsdelivr.net` for
`purge.jsdelivr.net`, keep the path) and re-run it.
```

**Phase 14 — the triage bullet.** Replace "Confirm `v1` actually moved: `git tag --points-at HEAD` should list both `v1` and `v$VERSION`. If it doesn't, Phase 8/9 didn't complete — fix that first." with:

```markdown
- Confirm the tag actually landed: `git tag --points-at HEAD` should list
  `v$VERSION`. If it doesn't, Phase 7/9 didn't complete — fix that first.
  There is no moving tag to check any more; see Phase 8.
```

and add the ways bullet:

```markdown
- **Ways URLs 404 until Phase 9 pushes the tag.** `routes/<route-id>/ways/*` is
  new in a release, so `@v$VERSION` cannot serve it until the tag exists, and
  `@main` cannot until the push lands. That is why `npm run check-cdn` runs at
  Phase 14 and not before; a ways-path failure here, after the purge, is a real
  one.
```

**The closing Notes list.** Delete both of these bullets outright — neither describes anything this workflow still does:

```markdown
- **The `git push --force` on v1 is intentional** — it is the only acceptable force-push in this workflow
- **The `v1` moving tag may need to be replaced with `v2` etc.** when bumping a major version. The moving tag always tracks the latest release on the current major line.
```

Replace the "Never skip Phase 8 (move v1 tag)" bullet with these two:

```markdown
- **Never skip Phase 2b** — `index.json`'s `release` field is what the Pilgrim
  app pins its package downloads to. A stale one points every download at the
  previous release, and because that tag also resolves, nothing 404s to tell
  you. `scripts/build-index.test.ts` guards it in CI; do not "fix" a failure
  there by editing `index.json` by hand.
- **Do not re-introduce the moving `v1` tag** — see Phase 8. jsDelivr's tag
  cache made it a promise this project could not keep, and the app reads
  `@main` instead.
```

Finally, grep the doc to prove nothing was missed:

```bash
grep -n "v1" .claude/commands/release.md
```
Expected: only Phase 8's deprecation notice and its purge example mention `v1` at all.

- [ ] **Step 7: Run the full suite**

Run: `npm test && npx tsc --noEmit && npm run check-site`
Expected: `ℹ fail 0`, no tsc output, and check-site's usual all-clear.

- [ ] **Step 8: Commit**

```bash
git add .claude/commands/release.md scripts/build-index.test.ts scripts/site/cdn.ts scripts/site/cdn.test.ts
git commit -m "$(cat <<'EOF'
fix(release): publish the ref the catalog actually reads, and stop moving v1

Two findings, one measured each way. The v1 tag is healthy in git — it and
v1.6.0 are the same commit on the remote — but jsDelivr caches a tag URL
permanently, so @v1/index.json still serves the March 2026 index with three
routes while @v1.6.0 and @main both serve August's seven. A moving tag whose
CDN never moves is a promise this repo cannot keep, so the release stops
moving it and the app reads its catalog from @main, pinning every package
file to the exact release tag that index names.

The genuine break: index.json's new release field comes from package.json's
version, and nothing regenerated the index after the bump, so a release cut
today would have shipped v1.6.0's tag inside the v1.7.0 tree — and because
both tags resolve, nothing would have 404'd to give it away. A new Phase 2b
regenerates and greps, and a test pins the committed index to the committed
version so CI catches a forgotten regeneration.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Documentation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `schema/CHANGELOG.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/usage.html`
- Modify: `docs/schema.html`

**Interfaces:**
- Consumes: everything. Produces no code.

- [ ] **Step 1: Correct the intro, then add an Unreleased section to `CHANGELOG.md`**

The file's third intro paragraph still promises the moving tag. Replace it:

```markdown
Consumers read the catalog from `https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@main/index.json` and pin every file they then download to the tag that index's `release` field names. The `v1` alias is no longer maintained — jsDelivr caches tag URLs permanently, so moving it changed nothing a consumer saw.
```

Then insert, immediately after the intro paragraphs and before `## [1.6.0] — 2026-08-21`:

```markdown
## [Unreleased]

The "a stage is a Way" release. Turns each route's stages into ready-to-walk
Way files the Pilgrim app decodes unchanged, and publishes an honest report of
what each route can and cannot yet promise a walker.

### Added

- **`routes/<route-id>/ways/`** — one `stage-NN.json` per stage in the exact
  JSON the Pilgrim iOS app's `Way` type decodes, plus `route.json` (the route's
  card data) and `report.json` (the coverage report). Built by
  `npm run build-ways`, which `npm run pipeline` now runs before
  `build-index`. Every file is validated against its schema before it is
  written, and again by `npm run validate` afterwards.
- **`schema/way.schema.json`, `schema/way-route.schema.json`,
  `schema/way-report.schema.json`** — the contract. A change to
  `way.schema.json` is a change to the app.
- **`routes/camino-frances/route.main.geojson`** — the *walked line*: the main
  route with the optional variants and detours left out. `route.geojson`
  measures 994.4 km against 763.7 km of stages, so slicing stages from it
  handed a 27 km day a 63 km geometry. OSM offers nothing to filter on — every
  member role in all six sub-relations is empty — so the line is derived
  instead, by `npm run build-main-line camino-frances`: a graph over the
  relations' member ways, joined at exactly shared coordinates, walked by
  shortest connected path between consecutive stage boundaries. 767.5 km over
  ~32,800 points.
- **`index.json` gains `release`** (the git tag this build will be published
  under, which the app pins every package download to) and, per route, **`ways`
  `{ stageCount, bytes, placesPerStage, sparse }`** for a route whose every
  stage cleared the length gate. `sparse` is true when fewer than half the
  route's stages carry a place beyond the day's own start and end; apps say so
  on the card rather than hiding the route.
- **`npm run build-ways`** and **`npm run build-main-line <route-id>`**.

### Changed

- **The `v1` moving tag is no longer maintained, and the catalog moved to
  `@main`.** jsDelivr caches a tag URL permanently: `v1` was force-moved onto
  the v1.6.0 commit in August 2026, and `@v1/index.json` still serves the March
  2026 index — three routes, 1,725 bytes — while `@v1.6.0` and `@main` both
  serve the current seven-route index. Consumers should read
  `@main/index.json` for the catalog and pin every file they then download to
  the exact tag its `release` field names. Existing `@v1` URLs keep resolving
  to the bytes jsDelivr cached; `https://purge.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/<path>`
  is the only way to refresh one.
- **`interior.reflection` is now required** in `stages.schema.json`. All 109
  stages across all seven routes already carry one; requiring it means the
  closing line a walker reads at the end of a stage can never quietly fall back
  to a narrative's last sentence for committed data.
- **Camino Francés stages 16 and 17** have their `distanceKm` corrected to what
  the walked line measures — 26.3 → 23.3 km and 23.2 → 26.0 km — with a
  `distanceNote` on each. Brierley splits that day at a different albergue in
  Terradillos de los Templarios than the point on the OSM line nearest the
  village, so one stage borrows what the other lends. The route total is
  unchanged at 764 km.

### Coverage, honestly

One route is listed, and its own report says what it can and cannot promise:

- **Camino Francés** clears the length gate on all 33 stages and ships a
  complete, validating package — listed, and flagged `sparse`. Only **7 of its
  33 stages** carry a curated place beyond their own start and end towns, about
  **0.2 per stage**: it has 52 sacred sites, viewpoints, cultural sites, towns
  and stamp spots for 33 days of walking. It needs more curated places, not
  more code, and until it has them the app's card says "few places marked yet".
- **Shikoku 88** is the mirror image: **9 of its 10 stages** would clear the
  coverage bar on the strength of its 88 temples, but its ten stage distances
  sum to 907 km for a ~1,200 km circuit, so no walked line can be measured
  against them. It is deliberately left without a `route.main.geojson`, and so
  is not listed.
- **Kumano Kodo** would clear the coverage bar on all four stages and fails the
  length gate on all four, even sliced from the Nakahechi feature alone.
- **Camino Inglés, Norte, Portugués and Primitivo** carry service waypoints
  only — no curated places at all.
```

Add the link reference at the bottom of the file, above the `[1.6.0]` line:

```markdown
[Unreleased]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.6.0...HEAD
```

- [ ] **Step 2: Document the ways package in `README.md`**

Add a section immediately after the repository-layout block:

```markdown
### Stage packages (`ways/`)

Each route can carry a ready-to-walk package: one file per stage, in the exact
JSON the [Pilgrim](https://pilgrimapp.org) iOS app decodes, plus the route's
card data and a coverage report.

```
routes/{route-id}/
  route.main.geojson    # the walked line: the main route, variants removed
  ways/
    stage-00.json       # one stage, one Way — geometry, moments, marks, words
    stage-01.json
    route.json          # name, country, distance, stage list — the catalog card
    report.json         # what this route can and cannot promise a walker
```

Regenerate with `npm run build-ways` (part of `npm run pipeline`). One bar
decides what ships, and one flag describes it:

- **The length gate.** Every stage's slice of the walked line must measure
  within 10 % of that stage's `distanceKm`. One failing stage means no package
  and no `ways` entry in `index.json`, so apps hide the route.
- **The coverage flag.** `index.json`'s `ways` entry carries `placesPerStage`
  and `sparse`. A route is sparse when fewer than half its stages carry a
  meaningful place beyond their own start and end towns — it is still listed,
  and apps say so on its card.

`report.json` is written either way — a route that fails the gate is exactly
the one whose report you want to read.

**Fetching this from the CDN.** Read the catalog from `@main`, then pin every
file you download to the exact tag its `release` field names:

```
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@main/index.json
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1.6.0/routes/camino-frances/ways/route.json
```

Not `@v1`: jsDelivr caches a tag URL permanently, so that alias still serves a
March 2026 build. It is no longer moved on release.
```

In the **"What's In the Box"** table's introduction, add one sentence noting
that the published route-point totals count `route.geojson` only —
`route.main.geojson` is a derived view of the same OSM data, not new coverage,
and counting it would double the Camino Francés.

In the README's **Versioning** note, replace the advice to pin to `@v1` with
the two-ref rule above, and say plainly that `@v1` is frozen at whatever
jsDelivr cached.

- [ ] **Step 3: Document the build in `CLAUDE.md`**

In the Project Structure block, add the two new paths:

```
routes/{route-id}/
  route.main.geojson        # Walked line: main route with variants removed (npm run build-main-line)
  ways/                     # Stage packages for the Pilgrim app (npm run build-ways)
```

In the Commands block, add:

```bash
npm run build-ways            # Build routes/{route-id}/ways/ from the walked line + stages + waypoints
npm run build-main-line <id>  # Derive route.main.geojson from OSM member ways (network)
```

And add a short section after "Consumers":

```markdown
## Stage Packages

`ways/` holds one Way file per stage, in the wire format the Pilgrim iOS app's
`PilgrimageWayImporter` reads — **not** what Swift's synthesized `Codable`
would write. A moment is flat (`"kind": "waypoint"` with `label` and `icon` as
siblings), a stage file carries no `source` field, and every field of the
`stage` block is required. `schema/way.schema.json` is that contract; changing
it changes the app.

Stages are cut from `route.main.geojson` when a route has one, never from
`route.geojson`, which bundles optional variants: the Camino Francés' committed
geometry is 994 km against 764 km of stages.

Everything the build writes is deterministic — `departedAt` and the report's
`generatedAt` come from the route's own `metadata.json` `lastUpdated`, not from
wall-clock time, so CI's drift check has something stable to diff.

Consumers read `index.json` from `@main` and pin every file they then download
to the tag its `release` field names. The `v1` alias is not maintained:
jsDelivr caches tag URLs permanently, so moving it changes nothing anyone
sees.
```

- [ ] **Step 4: Add the ways files to the site's usage page**

In `docs/usage.html`, replace the line `<p>Pin to a major version for stability. Files are cached globally.</p>` (line 51) and the `index.json` URL directly beneath it with the two-ref rule:

```html
    <p>Read the catalog from <code>@main</code> &mdash; jsDelivr refreshes a branch
    ref on its own cycle &mdash; then pin every file you download to the tag that
    index&rsquo;s <code>release</code> field names. The <code>@v1</code> alias is no
    longer maintained: jsDelivr caches tag URLs permanently, so it still serves a
    March 2026 build.</p>
    <pre><code>https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@main/index.json
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1.7.0/routes/camino-frances/route.geojson
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1.7.0/routes/camino-frances/stages.json
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1.7.0/routes/camino-frances/metadata.json
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1.7.0/routes/camino-frances/waypoints.geojson
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1.7.0/routes/camino-frances/stats.json
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1.7.0/routes/camino-frances/ways/route.json
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1.7.0/routes/camino-frances/ways/stage-00.json</code></pre>
    <p>A route with no <code>ways</code> entry in <code>index.json</code> has not
    cleared the length gate &mdash; its stages are not walkable yet, and apps hide
    it. A route whose entry says <code>"sparse": true</code> is walkable but thinly
    curated: fewer than half its stages carry a place beyond the day&rsquo;s own
    start and end.</p>
```

Write real version numbers, not a `@vX.Y.Z` placeholder: `isRecognizedCdnRef` matches `^v\d+\.\d+\.\d+$`, so a placeholder would fail `npm run check-site`. Use the version this work will ship in — `v1.7.0` if `package.json` still reads `1.6.0` when you get here; otherwise the next minor from whatever it reads.

- [ ] **Step 5: List the three new schemas where the project lists schemas**

In `docs/schema.html`, add three rows to the schema table, immediately after the `waypoints.schema.json` row (line 70) and before the `stats.json` "None yet" row:

```html
        <tr><td><code>way.schema.json</code></td><td><code>ways/stage-NN.json</code></td><td><a href="https://github.com/walktalkmeditate/open-pilgrimages/blob/main/schema/way.schema.json">View</a></td></tr>
        <tr><td><code>way-route.schema.json</code></td><td><code>ways/route.json</code></td><td><a href="https://github.com/walktalkmeditate/open-pilgrimages/blob/main/schema/way-route.schema.json">View</a></td></tr>
        <tr><td><code>way-report.schema.json</code></td><td><code>ways/report.json</code></td><td><a href="https://github.com/walktalkmeditate/open-pilgrimages/blob/main/schema/way-report.schema.json">View</a></td></tr>
```

In `schema/CHANGELOG.md`, add a new section immediately after the `# Schema Changelog` heading and before `## 1.0.0 (2026-03-26)`:

```markdown
## 1.1.0 (unreleased)

### Files
- `way.schema.json` — one stage of a pilgrimage route as `routes/{route-id}/ways/stage-NN.json`, in the wire format the Pilgrim iOS app's importer reads. Flat moments (`"kind": "waypoint"` with `label` and `icon` as siblings), no `source` field, every field of the `stage` block required. A change to this file is a change to that app.
- `way-route.schema.json` — `routes/{route-id}/ways/route.json`, the route's card data.
- `way-report.schema.json` — `routes/{route-id}/ways/report.json`, the coverage report: per stage, the slice length against the declared distance, the moment and mark counts, and what was dropped; per route, the length-gate verdict and how thinly curated it is.

### Breaking
- **`stages.schema.json`: `interior.reflection` is now required** when a stage carries an `interior` block. All 109 stages in the dataset already have one; a contribution that omits it now fails validation instead of silently losing the line a walker reads at the end of the stage.
- **`index.schema.json`: `release` is now required** at the top level, matching `^v\d+\.\d+\.\d+$`. It names the git tag the build will be published under, and consumers pin every package download to it.

### Added, non-breaking
- `index.schema.json`: an optional per-route `ways` object — `stageCount`, `bytes`, `placesPerStage`, `sparse`. Present only for a route whose every stage cleared the length gate; absent means apps hide the route.
```

- [ ] **Step 6: Verify the site guard and the CDN link scanner still pass**

Run: `npm run check-site`
Expected: the same all-clear it gives today. The new README and usage-page CDN
URLs point at `routes/…`, which `isPublishedCdnPath` already allows, and the
files they name exist on disk.

Note: `npm run check-cdn` is **not** run here. It is networked and belongs to
Phase 14 of the release, after the tags move — the new `ways/` paths cannot
resolve on jsDelivr until then.

- [ ] **Step 7: Run everything one last time**

Run: `npm test && npx tsc --noEmit && npm run pipeline`
Expected: `ℹ fail 0`; no tsc output; the pipeline's fetch, build-ways, build-index and validate all complete, with `camino-frances: 33 stage(s), listed, sparse (0.2 places per stage — only 7 of 33 stages carry a place beyond their own start and end; the app's card will say "few places marked yet")` and `Validation passed (0 warning(s))`.

- [ ] **Step 8: Commit**

```bash
git add CHANGELOG.md schema/CHANGELOG.md README.md CLAUDE.md docs/usage.html docs/schema.html
git commit -m "$(cat <<'EOF'
docs: describe the ways packages, and say plainly what they cannot yet promise

The CHANGELOG entry leads with what shipped and then names the coverage
honestly: the Camino Frances clears the length gate on all 33 stages and is
listed, flagged sparse, because only 7 of them carry a place beyond their own
start and end towns. Shikoku 88 is the mirror image — 9 of 10 stages well
curated, and no stage distances a walked line can be measured against.

Also documents the CDN rule the app follows: catalog from @main, packages
pinned to the tag the index names, and @v1 frozen at whatever jsDelivr cached.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Spec coverage

Every requirement in §1 of `2026-09-03-honor-slice-two-pilgrimage-stages-design.md`, and where it lands:

| Spec | Task |
|---|---|
| 1.1 build step reading walked line + stages + waypoints, writing `stage-NN.json` / `route.json` / `report.json`, regenerating `index.json`, validating every output | 5 |
| 1.1 the walked line, `route.main.geojson` preferred over `route.geojson` | 2 (preference), 6 (production) |
| 1.1 length gate, ±10 %, failing message naming the stage and both figures | 2 (rule), 5 (message) |
| 1.1 release tag moved onto each release commit | 7, **changed**: `v1` is no longer moved — jsDelivr caches tag URLs permanently, so the app reads `@main` and pins packages to the `release` tag |
| 1.2 route slice at nearest vertices, `MultiLineString` parts concatenated in order | 2 |
| 1.2 RDP at 8 m, then a 1,000-point stride cap | 2 |
| 1.2 clock from the midpoint of `estimatedHours`; `theirActiveSeconds` the same total | 2, 4 |
| 1.2 altitude from the line's third ordinate, else absent | 2 |
| 1.2 `departedAt`, `tzIdentifier`, `weather`, `expires` | 5 (deviations 3 and 7) |
| The wire format `PilgrimageWayImporter` reads — flat moments, no `source`, every stage field required | 1 (contract), 3–5 (emitters) |
| 1.2 title from the stage's English name; id `pilgrimage:<route-id>:<stage-index>` | 5 |
| 1.3 moment selection by type, plus stage ends when no town is within 150 m | 3 |
| 1.3 label, icon table, the `seal` override, `text` and its composed fallback, `names`, `sitMinutes`, `at` vs `pin`, `place` absent | 3 |
| 1.3 moment ids `wp-<waypoint id>`, ordering by `frac`, 300 m drop with a warning | 3 |
| 1.4 marks, the six kinds, `frac`, `offLineMeters`, 300 m drop, 80-character name cap | 4 |
| 1.4 the `stage` block, its string caps, `closing` from `reflection` with the narrative fallback, no elevation loss | 4 |
| 1.5 `route.json` and its `distanceKm` being the stage sum | 5 |
| 1.5 `report.json` per-stage and per-route contents | 5 |
| 1.5 the coverage floor | 5, **changed**: the length gate governs listing and the floor became `sparse` + `placesPerStage` on the entry (deviation 12) |
| 1.5 `index.json` gaining `release` and per-route `ways` | 5 (`{ stageCount, bytes, placesPerStage, sparse }`) |
| 1.6 CDN paths | 7 (catalog moved from `@v1` to `@main`), 8 (documented in `README.md` and `docs/usage.html`) |
| 1.7 `schema/way.schema.json` as the contract | 1 |
| 1.7 fixture route: three stages, waypoints of every type, a temple with structured fields and no description, an off-line waypoint, a `MultiLineString`, a deliberately long stage | 1 |
| 1.7 the assertions that fixture must support | 2, 3, 4, 5 |
| Open question 2 — which routes at launch | 6 (measurement), 8 (recorded) |
| Open question 3 — the walked line | 6 |
| Open question 4 — `reflection` required in `schema/` | 4 |

Spec open question 1 (cover images, Mapbox static renders under ODbL) is **out of scope** by the task brief; `route.json` names a `cover` only when `routes/<route-id>/cover.jpg` exists, and none does.

## What this plan does not promise

- **Only one route becomes listable, and it is thinly curated.** The Camino Francés ships a complete, validating, committed package and a `ways` entry — with `sparse: true`, because 7 of its 33 stages carry a place beyond their own ends and 17 would be half. Enriching `waypoints.geojson` is a curation job, not a code job, and it is the honest answer to spec open question 2.
- **Shikoku 88 gets no walked line.** Its ten stage distances sum to 907 km for a ~1,200 km circuit, so there is nothing trustworthy to measure a line against.
- **The Camino's two corrected stage distances are the only data edit.** They are a compensating pair with a documented guardrail (Task 6, Step 8). If more stages fail, the plan says stop.
- **Existing `@v1` CDN links are not repaired.** They keep serving whatever jsDelivr cached; a purge is the only lever, and the plan documents it rather than firing it.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-04-ways-build.md`. Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
