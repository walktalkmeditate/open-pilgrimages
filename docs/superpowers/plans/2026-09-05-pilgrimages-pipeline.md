# Pilgrimages Pipeline (PR A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the dataset the pilgrimage → section → stage model and close the boundary, chaining, walked-line, and drafted-text gaps, so the three content PRs that follow have validators that name exactly what is wrong.

**Architecture:** A pilgrimage is index-level only: each section's `metadata.json` declares a `pilgrimage` block, `build-index` derives `pilgrimages[]` from those blocks, and `validate`/`check-site` enforce the invariants. Nothing gains a directory. The one behaviour change to existing output is that stage boundaries now advance along the walked line instead of being min/max-ed, which the Camino Francés is proven to build unchanged under.

**Tech Stack:** TypeScript run through `tsx`, `node:test` + `node:assert/strict`, Ajv against the JSON Schemas in `schema/`, no runtime dependencies added.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-05-pilgrimages-and-sections-design.md`. Where this plan and the spec disagree, the spec wins — stop and ask.
- Branch `feat/pilgrimages` in the worktree `/Users/rubberduck/GitHub/momentmaker/open-pilgrimages/.worktrees/pilgrimages`. Never commit to `main`. Never use `git stash`.
- Every commit message ends with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Comments explain why, never what. No comment restates the line below it.
- `npm test` runs `node --import tsx --test "scripts/**/*.test.ts"`. Every task ends with it green, plus `npx tsc --noEmit` clean.
- The committed `routes/` and `index.json` must equal what `npm run build-ways && npm run build-index` emit. CI checks this with `git status --porcelain`. If a task changes emitted output, regenerate and commit the data in the same task.
- `npm run check-site` must end "Site is in sync with route data" before any task that touched `docs/`, `README.md`, or `index.json` is committed.
- Coordinates are `[longitude, latitude]`. Distances in the dataset are kilometres; `SNAP_METERS` and `offMeters` are metres.
- `schemaVersion` stays `"1.0.0"` in every data file. `index.json`'s own `SCHEMA_VERSION` constant in `scripts/build-index.ts` is not bumped by this plan.
- Do not run `npm run fetch`, `fetch-roads`, or `build-main-line` against the network in any task below. Task 6 tests `build-main-line`'s refusal path with an injected runtime only.
- `pilgrimage.kind` is exactly `"legs"` or `"alternatives"`. Pilgrimage ids in this PR: `camino-de-santiago` (`alternatives`). `kumano-kodo` and `shikoku-88` arrive with PRs C and D.

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `scripts/ways/geo.ts` | `nearestVertex` gains a forward-search window; `stageBoundaries` becomes monotonic | 1 |
| `scripts/build-ways.ts` | Refuses to cut a stage whose boundaries do not advance; reports it as a gate reason | 1 |
| `schema/pilgrimage.schema.json` | Formal `pilgrimage` and `osm` properties on a section's metadata | 2 |
| `scripts/validate.ts` | Pilgrimage consistency, section chaining, pinned relations, the drafted-text gate | 2, 5, 6, 7 |
| `scripts/pilgrimage.ts` (new) | One reader for a section's `pilgrimage` block, shared by `build-index` and `validate` | 2 |
| `scripts/build-index.ts` | Derives `pilgrimages[]`; stamps `pilgrimage` on each route entry | 3 |
| `schema/index.schema.json` | `pilgrimages[]` and the per-route `pilgrimage` string | 3 |
| `routes/camino-*/metadata.json` | The five Camino sections declare their pilgrimage | 4 |
| `scripts/enrich/build-main-line.ts` | Refuses a section with no `osm.relations` | 6 |
| `scripts/site/check-site.ts` | Pilgrimage ids in the page namespace; pilgrimage/section cross-checks | 8 |
| `scripts/site/build-assets.ts` | Emits `docs/<pilgrimage-id>.html` | 9 |
| `docs/routes.html`, `docs/route-filter.js`, `docs/styles.css` | The grouped catalog, and a group heading that hides with its cards | 9 |
| `docs/camino-de-santiago.html`, `docs/camino-*.html` | The first pilgrimage page, and five sections linking back up to it | 9 |
| `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `.claude/commands/release.md` | The model, the commands, the release gate | 10 |

---

## Task 1: Boundaries advance or fail

Closes issue #7. `stageBoundaries` snaps each anchor to the nearest vertex on the whole line, so a line that passes a place twice can put a stage's end behind its start; `buildRouteWays` then min/max-es the pair and cuts a slice anyway. Three unfinished routes have such pairs today (Shikoku 88 has two, Camino del Norte and Kumano Kodō one each); the Camino Francés has none, which is why it must build byte-identically after this change.

**Files:**
- Modify: `scripts/ways/geo.ts:86-97` (`nearestVertex`), `:118-146` (`stageBoundaries`)
- Modify: `scripts/build-ways.ts:113-127` (the caller and the cut), `:191` (the `gateReasons` handed to `buildReport`)
- Test: `scripts/ways/geo.test.ts`, `scripts/build-ways.test.ts`

**Interfaces:**
- Consumes: `Boundary { index: number; offMeters: number; mode: "snap" | "proportional" }`, `SNAP_METERS = 500`, `indexAtMeters(cumulative, meters)`, `haversineMeters(a, b)` — all in `scripts/ways/geo.ts`.
- Produces: `nearestVertex(line: Position[], p: Position, fromIndex = 0): { index: number; meters: number }` — searching only at or after `fromIndex`. `stageBoundaries` returns a non-decreasing `Boundary[]` (unchanged signature). `buildRouteWays` adds a gate reason of the shape `stage N runs from "A" to "B", but both anchors land on the same point of the walked line` and emits nothing for that route.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/ways/geo.test.ts`:

```ts
test("a boundary is searched forward of the one before it", () => {
  // A line that runs east to (0.03,0), doubles back west to (0.01,0), then
  // strikes east again. The middle anchor sits where the line has already
  // been: on the whole line its nearest vertex is index 1, behind the first
  // anchor's index 3, so the stage between them would be cut backwards.
  const line: Position[] = [
    [0, 0], [0.01, 0], [0.02, 0], [0.03, 0], [0.02, 0], [0.01, 0], [0.04, 0],
  ];
  const cumulative = cumulativeMeters(line);
  const anchors: Position[] = [[0.03, 0], [0.01, 0], [0.04, 0]];
  const boundaries = stageBoundaries(line, cumulative, anchors, [1.1, 2.2]);

  assert.deepEqual(
    boundaries.map((b) => b.index),
    [3, 5, 6],
    "the middle anchor must snap to the second time the line passes it",
  );
});

test("nearestVertex ignores everything before fromIndex", () => {
  const line: Position[] = [[0, 0], [0.01, 0], [0.02, 0]];
  assert.equal(nearestVertex(line, [0, 0]).index, 0);
  assert.equal(nearestVertex(line, [0, 0], 2).index, 2);
});

test("a proportional boundary never falls behind its predecessor", () => {
  const line: Position[] = [[0, 0], [0.01, 0], [0.02, 0], [0.03, 0]];
  const cumulative = cumulativeMeters(line);
  // The second anchor is 200 km off the line, so it takes the proportional
  // branch; its declared share puts it behind the first boundary.
  const anchors: Position[] = [[0.03, 0], [2, 0]];
  const boundaries = stageBoundaries(line, cumulative, anchors, [100]);
  assert.ok(boundaries[1].index >= boundaries[0].index);
});
```

No imports to add: `nearestVertex`, `cumulativeMeters` and `stageBoundaries` are all already in the `from "./geo.js"` list at the top of that file, and the `Position` type comes in from `./types.js` on the line below it.

Append to `scripts/build-ways.test.ts`. The file's own `build({ stages })` helper (line 25) is typed `{ stages?: DatasetStage[] }` and fills the rest of the fixture route in, and `DatasetStage` (`scripts/ways/stage.ts`) types `name`, `start.name` and `end.name` as `LocalizedString` — so every name is an object with an `en`, not a bare string:

```ts
test("a stage whose anchors land on one point fails the gate and emits nothing", () => {
  const result = build({
    stages: [
      {
        index: 0,
        name: { en: "There and back" },
        start: { name: { en: "Ryōzen-ji" }, coordinates: [0, 0] },
        end: { name: { en: "Ryōzen-ji again" }, coordinates: [0, 0] },
        distanceKm: 1.1,
      },
    ],
  });

  assert.equal(result.emitted, false);
  assert.equal(result.report.gate.passed, false);
  assert.match(
    (result.report.gate.reasons ?? []).join("\n"),
    /both anchors land on the same point of the walked line/,
  );
  assert.match((result.report.gate.reasons ?? []).join("\n"), /Ryōzen-ji/);
  assert.equal(result.ways.length, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)|not ok"
```
Expected: `# fail 3`.

- `geo.test.ts`, forward search: `stageBoundaries` returns indices `[3, 1, 6]` against the asserted `[3, 5, 6]` — the middle anchor snapped to the first time the line passed it.
- `geo.test.ts`, `nearestVertex` window: the third argument is ignored, so `nearestVertex(line, [0, 0], 2).index` is `0` where `2` is asserted.
- `build-ways.test.ts`: not on `emitted` — a one-vertex slice already measures 0 km against the declared 1.1 km, so the length gate fails the route today and `emitted` is already `false`. It fails on the `gate.reasons` match: a single stage has no chain break, so `reasons` is absent and the joined string is empty.

The third `geo.test.ts` case, the proportional clamp, passes today. It is a regression pin, not a red step — the proportional branch already floors at the boundary before it because its `along` distance runs forward.

- [ ] **Step 3: Give `nearestVertex` a forward window**

In `scripts/ways/geo.ts`, replace lines 86-97 with:

```ts
export function nearestVertex(
  line: Position[],
  p: Position,
  fromIndex = 0,
): { index: number; meters: number } {
  const start = Math.max(0, Math.min(fromIndex, line.length - 1));
  let index = start;
  let meters = Infinity;
  for (let i = start; i < line.length; i++) {
    const d = haversineMeters(line[i], p);
    if (d < meters) {
      meters = d;
      index = i;
    }
  }
  return { index, meters };
}
```

- [ ] **Step 4: Make `stageBoundaries` monotonic**

In `scripts/ways/geo.ts`, replace the loop of `stageBoundaries` (lines 130-143) with:

```ts
  for (let i = 0; i < anchors.length; i++) {
    // Each boundary is searched forward of the one before it. A line that
    // passes a place twice would otherwise snap a stage's end behind its
    // start, and the slice between them would be empty or reversed.
    const searchFrom = i === 0 ? 0 : boundaries[i - 1].index;
    const found = nearestVertex(line, anchors[i], searchFrom);
    if (found.meters <= snapMeters || totalDeclaredMeters === 0) {
      boundaries.push({ index: found.index, offMeters: found.meters, mode: "snap" });
    } else {
      const along = (declaredSoFar / totalDeclaredMeters) * totalLineMeters;
      boundaries.push({
        index: Math.max(indexAtMeters(cumulative, along), searchFrom),
        offMeters: found.meters,
        mode: "proportional",
      });
    }
    if (i < declaredKm.length) declaredSoFar += declaredKm[i] * 1000;
  }
```

- [ ] **Step 5: Refuse to cut a stalled stage**

In `scripts/build-ways.ts`, immediately after the `stageBoundaries(...)` call that ends at line 120, insert:

```ts
  // A boundary that does not advance means an empty slice: the anchors
  // resolved to one point of the line. Report it and cut nothing, rather
  // than handing routePoints a slice with no vertices.
  const boundaryStalls = input.stages
    .filter((stage) => boundaries[stage.index + 1].index <= boundaries[stage.index].index)
    .map(
      (stage) =>
        `stage ${stage.index} runs from "${stage.start.name.en}" to "${stage.end.name.en}", ` +
        `but both anchors land on the same point of the walked line`,
    );
```

`DatasetStage.start.name` is a `LocalizedString`, not a string — interpolating the object itself would print `[object Object]`. The `chainBreaks` computation at lines 100-108 already reads `.name.en` for the same reason; match it.

Then concatenate the two lists at the `buildReport({ … })` call, whose `gateReasons: chainBreaks` sits at line 191: `gateReasons: [...chainBreaks, ...boundaryStalls]`.

Guard the cut loop at lines 125-127 so it does not run when a stall was found:

```ts
  for (const stage of input.stages) {
    // A stalled pair is skipped, not the whole route: the other stages still
    // get measured, so the coverage report still says what to fix.
    if (boundaries[stage.index + 1].index <= boundaries[stage.index].index) continue;
    const from = boundaries[stage.index].index;
    const to = boundaries[stage.index + 1].index;
```

The `Math.min`/`Math.max` wrappers go away — boundaries are non-decreasing now, and a pair that is not strictly increasing has already been caught.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)"
npx tsc --noEmit
```
Expected: `# fail 0`, `tsc` silent.

- [ ] **Step 7: Prove the Camino is untouched**

```bash
npm run build-ways && npm run build-index && git status --porcelain routes index.json
```
Expected: `build-ways` prints its usual per-route summary; `git status` shows no change under `routes/camino-frances/`, and may show `gate.reasons` updates to `shikoku-88`, `camino-norte`, and `kumano-kodo`'s `report.json` — nothing else. If `routes/camino-frances/ways/` changed, stop — the forward search altered a route the spec says builds byte-identically, and the cause needs understanding before continuing.

Three routes may legitimately gain `gate.reasons` entries in their `ways/report.json`: `shikoku-88`, `camino-norte`, `kumano-kodo`. All three already fail the gate, so no package appears or disappears. Commit any such report changes with this task.

- [ ] **Step 8: Commit**

```bash
git add scripts/ways/geo.ts scripts/ways/geo.test.ts scripts/build-ways.ts scripts/build-ways.test.ts routes
git commit -m "$(cat <<'EOF'
fix(ways): a stage boundary advances along the line or fails the gate

Snapping each anchor against the whole line let a route that passes a
place twice put a stage's end behind its start; the min/max cut then
produced a slice the report never mentioned. Boundaries are now searched
forward of their predecessor, and a pair that does not advance is a named
gate reason with nothing emitted.

Closes #7

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: The `pilgrimage` block, and one reader for it

A section declares its pilgrimage in `metadata.json`. Today `schema/pilgrimage.schema.json` has no `osm` property either — `additionalProperties: true` is the only reason the existing `osm.relations` validates. Both get formalised here, and one reader is extracted so `build-index` (Task 3) and `validate` (Task 5, 7) cannot drift apart on how a block is read.

**Files:**
- Modify: `schema/pilgrimage.schema.json` (properties block; root `required` is unchanged — `pilgrimage` is optional so ungrouped routes stay valid)
- Create: `scripts/pilgrimage.ts`, `scripts/pilgrimage.test.ts`
- Modify: `scripts/validate.ts` (a new `validatePilgrimages`, called from `main`; `validateFile` at line 65 becomes exported)
- Test: `scripts/validate.test.ts`

**Interfaces:**
- Produces:
  - `export interface PilgrimageBlock { id: string; name: Record<string, string>; kind: "legs" | "alternatives"; order: number }`
  - `export function readPilgrimage(metadata: unknown): PilgrimageBlock | undefined` — returns `undefined` when the block is absent, throws `Error` naming the offending field when present and malformed.
  - `export function groupSections(sections: { routeId: string; block: PilgrimageBlock }[]): Map<string, { block: PilgrimageBlock; routeIds: string[] }>` — grouped by pilgrimage id, `routeIds` sorted by `order` then id.
  - `validatePilgrimages(root: string, dirs: string[], errors: ValidationError[]): void` in `scripts/validate.ts`. Tasks 5, 6, and 7 add three more validators with the same `(root, dirs, errors)` signature, so the four read alike at the call site in `main()`.
  - `validateFile(ajv, schemaName, filePath, errors)` in `scripts/validate.ts` becomes exported — unchanged otherwise — so a test can put a fixture file through the same Ajv path `main()` uses.

- [ ] **Step 1: Write the failing tests**

Create `scripts/pilgrimage.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readPilgrimage, groupSections } from "./pilgrimage.js";

const block = { id: "kumano-kodo", name: { en: "Kumano Kodō" }, kind: "alternatives", order: 1 };

test("a metadata file with no pilgrimage block reads as undefined", () => {
  assert.equal(readPilgrimage({ id: "camino-frances" }), undefined);
});

test("a well-formed block reads back whole", () => {
  assert.deepEqual(readPilgrimage({ pilgrimage: block }), block);
});

test("a block missing a field names that field", () => {
  assert.throws(
    () => readPilgrimage({ pilgrimage: { ...block, kind: undefined } }),
    /pilgrimage\.kind/,
  );
});

test("a kind outside the two values is refused", () => {
  assert.throws(() => readPilgrimage({ pilgrimage: { ...block, kind: "chain" } }), /pilgrimage\.kind/);
});

test("sections group by id and sort by order", () => {
  const grouped = groupSections([
    { routeId: "b", block: { ...block, order: 2 } },
    { routeId: "a", block: { ...block, order: 1 } },
  ]);
  assert.deepEqual(grouped.get("kumano-kodo")?.routeIds, ["a", "b"]);
});
```

Append to `scripts/validate.test.ts` (follow the file's existing `makeFixtureRoute()` / `writeJson` / `rmSync` idiom):

```ts
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
```

`readPilgrimage` and Step 5's JSON Schema state the same invariant twice, and nothing above makes them agree. Pin them together with the file's own Ajv idiom — `createValidator()` is already imported there, and `validateFile` is the module-private function `main()` uses to check a `metadata.json` against `pilgrimage.schema.json` (`scripts/validate.ts:65`, called at `:425`). Export it — change `function validateFile(` to `export function validateFile(`; nothing else about it moves. Then append:

```ts
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
```

Add `validatePilgrimages` and `validateFile` to the `from "./validate.js"` import at the top of `scripts/validate.test.ts` — `createValidator` and the `ValidationError` type are already on that line — and `readFileSync` to its `from "fs"` import. `ROOT`, `writeJson`, `mkdtempSync`, `mkdirSync`, `tmpdir` and `rmSync` are already in that file.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)|not ok"
```
Expected: failures for `Cannot find module './pilgrimage.js'`, `validatePilgrimages is not a function`, and `validateFile is not a function`. Once `validateFile` is exported, the second schema test still fails until Step 5 lands the properties — `additionalProperties: true` is what lets today's schema wave both fixtures through.

- [ ] **Step 3: Write the reader**

Create `scripts/pilgrimage.ts`:

```ts
export interface PilgrimageBlock {
  id: string;
  name: Record<string, string>;
  kind: "legs" | "alternatives";
  order: number;
}

const KINDS = new Set(["legs", "alternatives"]);

/**
 * A section's declaration of the pilgrimage it belongs to. `build-index`
 * derives `pilgrimages[]` from these and `validate` checks them against each
 * other, so both read the block through here and cannot drift.
 */
export function readPilgrimage(metadata: unknown): PilgrimageBlock | undefined {
  const raw = (metadata as { pilgrimage?: unknown } | null)?.pilgrimage;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") throw new Error("pilgrimage must be an object");
  const block = raw as Record<string, unknown>;

  if (typeof block.id !== "string" || !/^[a-z0-9-]+$/.test(block.id)) {
    throw new Error("pilgrimage.id must be a kebab-case string");
  }
  if (typeof block.name !== "object" || block.name === null || typeof (block.name as Record<string, unknown>).en !== "string") {
    throw new Error("pilgrimage.name must be a localized object with en");
  }
  if (typeof block.kind !== "string" || !KINDS.has(block.kind)) {
    throw new Error(`pilgrimage.kind must be "legs" or "alternatives"`);
  }
  if (typeof block.order !== "number" || !Number.isInteger(block.order) || block.order < 1) {
    throw new Error("pilgrimage.order must be a positive integer");
  }

  return {
    id: block.id,
    name: block.name as Record<string, string>,
    kind: block.kind as "legs" | "alternatives",
    order: block.order,
  };
}

export function groupSections(
  sections: { routeId: string; block: PilgrimageBlock }[],
): Map<string, { block: PilgrimageBlock; routeIds: string[] }> {
  const grouped = new Map<string, { block: PilgrimageBlock; routeIds: string[] }>();
  for (const { routeId, block } of [...sections].sort(
    (a, b) => a.block.order - b.block.order || a.routeId.localeCompare(b.routeId),
  )) {
    const existing = grouped.get(block.id);
    if (existing) existing.routeIds.push(routeId);
    else grouped.set(block.id, { block, routeIds: [routeId] });
  }
  return grouped;
}
```

- [ ] **Step 4: Check sections against each other**

In `scripts/validate.ts`, add next to the other validators:

```ts
export function validatePilgrimages(root: string, dirs: string[], errors: ValidationError[]): void {
  const declared: { routeId: string; dir: string; block: PilgrimageBlock }[] = [];

  for (const dir of dirs) {
    const metaPath = join(dir, "metadata.json");
    if (!existsSync(metaPath)) continue;
    const meta = loadJson(metaPath) as { id?: string };
    try {
      const block = readPilgrimage(meta);
      if (block) declared.push({ routeId: meta.id ?? basename(dir), dir, block });
    } catch (error) {
      errors.push({
        file: relative(root, metaPath),
        message: error instanceof Error ? error.message : String(error),
        severity: "error",
      });
    }
  }

  for (const id of groupSections(declared.map(({ routeId, block }) => ({ routeId, block }))).keys()) {
    const members = declared.filter((d) => d.block.id === id);
    // One pilgrimage, one identity: build-index derives a single entry from
    // whichever section it reads first, so disagreement would be silent.
    for (const field of ["kind", "name"] as const) {
      const values = new Set(members.map((m) => JSON.stringify(m.block[field])));
      if (values.size > 1) {
        errors.push({
          file: `pilgrimage:${id}`,
          message: `sections of "${id}" declare conflicting ${field}: ${[...values].join(" vs ")}`,
          severity: "error",
        });
      }
    }
    const orders = members.map((m) => m.block.order);
    const duplicate = orders.find((o, i) => orders.indexOf(o) !== i);
    if (duplicate !== undefined) {
      errors.push({
        file: `pilgrimage:${id}`,
        message: `two sections of "${id}" claim order ${duplicate}`,
        severity: "error",
      });
    }
  }
}
```

Import `readPilgrimage`, `groupSections`, and the `PilgrimageBlock` type from `./pilgrimage.js`, and `basename`/`relative` from `node:path` if not already imported. Call it from `main()` after the per-directory loop, before the error tally at line 436:

```ts
  validatePilgrimages(ROOT, dirs, errors);
```

(`dirs` is `findRouteDirectories()`'s result; check the local variable's name at the top of `main()` and use it.)

- [ ] **Step 5: Formalise the schema**

In `schema/pilgrimage.schema.json`, add to the root `properties` object (leave root `required` alone — a route without a pilgrimage stays valid):

```json
"pilgrimage": {
  "type": "object",
  "required": ["id", "name", "kind", "order"],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "name": { "$ref": "#/$defs/LocalizedString" },
    "kind": { "type": "string", "enum": ["legs", "alternatives"] },
    "order": { "type": "integer", "minimum": 1 }
  },
  "description": "The pilgrimage this section belongs to. Index-level only; a pilgrimage has no directory."
},
"osm": {
  "type": "object",
  "properties": {
    "relations": { "type": "array", "items": { "type": "integer" }, "minItems": 1 },
    "superroute": { "type": "integer" },
    "query": { "type": "string" }
  },
  "description": "Relations are required for any section with a ways/ package; a name query alone pulls in spurs and variants."
}
```

`schema/pilgrimage.schema.json`'s `$defs` names the localized-string definition `LocalizedString`, so the `$ref` above is correct as written.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)"
npx tsc --noEmit
npm run validate 2>&1 | tail -2
```
Expected: `# fail 0`, `tsc` silent, `Validation passed (0 warning(s))` — no route declares a pilgrimage yet, so the new check finds nothing.

- [ ] **Step 7: Commit**

```bash
git add scripts/pilgrimage.ts scripts/pilgrimage.test.ts scripts/validate.ts scripts/validate.test.ts schema/pilgrimage.schema.json
git commit -m "$(cat <<'EOF'
feat(schema): a section declares the pilgrimage it belongs to

One reader for the block, so build-index and validate cannot disagree
about what it means, and a validator that refuses sections of one
pilgrimage declaring different kinds, names, or the same order.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `pilgrimages[]` in the index

**Files:**
- Modify: `scripts/build-index.ts` (`scanRoutes` at 132-168, and the `buildIndex` assembly at 172-203)
- Modify: `schema/index.schema.json` (root `properties`, `RouteEntry`)
- Test: `scripts/build-index.test.ts`

**Interfaces:**
- Consumes: `readPilgrimage`, `groupSections` from `scripts/pilgrimage.ts` (Task 2).
- Produces: `index.json` gains a root `pilgrimages` array of `{ id, name, kind, sections, distanceKm?, stageCount? }`, and every grouped route entry gains `pilgrimage: string`. `distanceKm` and `stageCount` are emitted only when `kind === "legs"`.

- [ ] **Step 1: Write the failing tests**

`tempRepo`/`addRoute` belong to `scripts/build-ways.test.ts`, not this file. `scripts/build-index.test.ts`'s own idiom is `createTempRoutesDir(fixtures: RouteFixture[]): { root, routesDir }`, which writes one `minimalMetadata(id)` per `RouteFixture { dirName, id }`, and `buildIndex` takes five arguments: `buildIndex(routesDir, previous, now, root, release)`. `NEW` and `RELEASE` are already declared in the file.

There is no metadata-patch mechanism today, so add one: give `RouteFixture` an optional `metadata?: Record<string, unknown>` and have `writeRouteFixtures` merge it over the minimal object. Every existing call site passes no `metadata` and is unaffected.

```ts
interface RouteFixture {
  dirName: string;
  id: string;
  /** Merged over minimalMetadata(id) — what a section's pilgrimage block rides in on. */
  metadata?: Record<string, unknown>;
}

function writeRouteFixtures(routesDir: string, fixtures: RouteFixture[]): void {
  for (const fixture of fixtures) {
    const routeDir = join(routesDir, fixture.dirName);
    mkdirSync(routeDir);
    writeFileSync(
      join(routeDir, "metadata.json"),
      JSON.stringify({ ...minimalMetadata(fixture.id), ...fixture.metadata }),
    );
  }
}
```

Then append:

```ts
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
```

Then pin the schema against the same two new fields, the way Task 2 pinned `pilgrimage.schema.json` — `index.schema.json`'s root and its `RouteEntry` are both `additionalProperties: true`, so nothing today would notice if Step 4 were skipped:

```ts
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
```

Add `import { createValidator, validateFile, type ValidationError } from "./validate.js";` to `scripts/build-index.test.ts` — Task 2 exported `validateFile`. `ROOT`, `readFileSync`, `writeFileSync`, `mkdtempSync`, `tmpdir`, `rmSync`, `join` and the `RouteIndex` type are already imported there.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)|not ok"
```
Expected: `# fail 3` — the two derivation tests that assert a `pilgrimages[]` (`index.pilgrimages` is `undefined`), plus the schema test that expects `kind: "chain"` and an empty `sections` to be refused. The other two pass already and are regression pins, not red steps: an ungrouped dataset genuinely produces no `pilgrimages[]` today, and `additionalProperties: true` waves the valid fixture through before Step 4 as well as after.

- [ ] **Step 3: Derive the pilgrimages**

In `scripts/build-index.ts`, add to the route entry built at lines 143-152, right after `path`:

```ts
    const pilgrimage = readPilgrimage(meta);
    if (pilgrimage) routeEntry.pilgrimage = pilgrimage.id;
```

`routeEntry` and the return value are typed against `RouteEntry` and `RouteIndex` in this same file, so declare the two new fields there first or `tsc` rejects both assignments: add `pilgrimage?: string;` to `RouteEntry` and `pilgrimages?: PilgrimageEntry[];` to `RouteIndex`.

Add the `PilgrimageEntry` type and the derivation next to `scanRoutes`:

```ts
export interface PilgrimageEntry {
  id: string;
  name: Record<string, string>;
  kind: "legs" | "alternatives";
  sections: string[];
  distanceKm?: number;
  stageCount?: number;
}

export function scanPilgrimages(routesDir: string): PilgrimageEntry[] {
  const declared: { routeId: string; block: PilgrimageBlock; distanceKm: number; stageCount: number }[] = [];

  for (const entry of readdirSync(routesDir)) {
    const routeDir = join(routesDir, entry);
    const metaPath = join(routeDir, "metadata.json");
    if (!statSync(routeDir).isDirectory() || !existsSync(metaPath)) continue;
    const meta = loadJson(metaPath);
    const block = readPilgrimage(meta);
    if (!block) continue;
    const ways = waysEntry(routeDir);
    declared.push({
      routeId: meta.id,
      block,
      distanceKm: meta.overview?.distanceKm ?? 0,
      stageCount: ways?.stageCount ?? 0,
    });
  }

  const grouped = groupSections(declared.map(({ routeId, block }) => ({ routeId, block })));
  return [...grouped.entries()]
    .map(([id, { block, routeIds }]) => {
      const members = declared.filter((d) => d.block.id === id);
      const entry: PilgrimageEntry = { id, name: block.name, kind: block.kind, sections: routeIds };
      // A walker walks one alternative, so a total across them describes no
      // walk anyone takes; only a chained pilgrimage has a meaningful sum.
      if (block.kind === "legs") {
        entry.distanceKm = Number(members.reduce((sum, m) => sum + m.distanceKm, 0).toFixed(1));
        entry.stageCount = members.reduce((sum, m) => sum + m.stageCount, 0);
      }
      return entry;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
```

In `buildIndex` (lines 172-203), call it and attach the result only when non-empty, so an ungrouped dataset produces the same `index.json` it does today:

```ts
  const pilgrimages = scanPilgrimages(routesDir);
  if (pilgrimages.length > 0) index.pilgrimages = pilgrimages;
```

Place the assignment so `pilgrimages` sits before `routes` in the emitted object, and leave the `generatedAt` idempotency logic untouched.

- [ ] **Step 4: Extend the index schema**

In `schema/index.schema.json`, add to the root `properties`:

```json
"pilgrimages": {
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id", "name", "kind", "sections"],
    "properties": {
      "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
      "name": { "$ref": "#/$defs/LocalizedString" },
      "kind": { "type": "string", "enum": ["legs", "alternatives"] },
      "sections": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
      "distanceKm": { "type": "number", "minimum": 0 },
      "stageCount": { "type": "integer", "minimum": 0 }
    }
  }
}
```

and to `RouteEntry`'s `properties`:

```json
"pilgrimage": { "type": "string", "pattern": "^[a-z0-9-]+$" }
```

`index.schema.json`'s `$defs` names the localized-string definition `LocalizedString`, so the `$ref` above is correct as written.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)"
npx tsc --noEmit
npm run build-index && npm run validate 2>&1 | tail -2 && git status --porcelain index.json
```
Expected: `# fail 0`; validation passes; `git status` prints nothing, because no route declares a pilgrimage yet.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-index.ts scripts/build-index.test.ts schema/index.schema.json
git commit -m "$(cat <<'EOF'
feat(index): pilgrimages derived from the sections that declare them

Additive: routes[] and every ways block are untouched, so the iOS catalog
parser keeps working. Totals are summed only for a legs pilgrimage — a
walker walks one alternative, not all five.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: The five Caminos declare their pilgrimage

The first data change, and the proof that Tasks 2 and 3 work on the real dataset.

**Files:**
- Modify: `routes/camino-frances/metadata.json`, `routes/camino-norte/metadata.json`, `routes/camino-primitivo/metadata.json`, `routes/camino-ingles/metadata.json`, `routes/camino-portugues/metadata.json`
- Modify: `index.json` (regenerated)

**Interfaces:**
- Consumes: the `pilgrimage` block from Task 2, the derivation from Task 3.
- Produces: `index.json` carries one `camino-de-santiago` pilgrimage with five sections.

- [ ] **Step 1: Add the block to each of the five**

In each file, insert after the `"name"` property, with `order` as given: `camino-frances` 1, `camino-norte` 2, `camino-primitivo` 3, `camino-ingles` 4, `camino-portugues` 5. Read each file first — the `name` property's exact position varies.

```json
"pilgrimage": {
  "id": "camino-de-santiago",
  "name": { "en": "Camino de Santiago", "es": "Camino de Santiago" },
  "kind": "alternatives",
  "order": 1
},
```

The `name` object must be byte-identical in all five files — Task 2's validator refuses disagreement.

- [ ] **Step 2: Regenerate and check**

```bash
npm run build-index && npm run validate 2>&1 | tail -2
```
Expected: `Validation passed (0 warning(s))`.

```bash
node -e 'const i=require("./index.json"); const p=i.pilgrimages.find(p=>p.id==="camino-de-santiago"); console.log(JSON.stringify(p)); console.log(i.routes.filter(r=>r.pilgrimage).length)'
```
Expected: the entry lists all five sections in `order`, carries no `distanceKm` or `stageCount` (it is `alternatives`), and five routes are tagged.

- [ ] **Step 3: Confirm the pipeline is deterministic**

```bash
npm run build-ways && npm run build-index && npm run validate && git status --porcelain routes index.json
```
Expected: `git status` lists the five edited `metadata.json` files (from Step 1) and `index.json` (from Step 2) as modified; `build-ways` adds nothing further under `routes/`.

- [ ] **Step 4: Commit**

```bash
git add routes/camino-*/metadata.json index.json
git commit -m "$(cat <<'EOF'
data(camino): the five Caminos name the pilgrimage they belong to

Tag only — nothing else about these five changes. index.json gains the
camino-de-santiago entry with its five alternatives.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Sections chain

**Files:**
- Modify: `scripts/validate.ts` (a new `validateSectionChain`, called from `main`)
- Test: `scripts/validate.test.ts`

**Interfaces:**
- Consumes: `readPilgrimage`, `groupSections`; `SNAP_METERS` and `haversineMeters` from `scripts/ways/geo.ts`; each section's `stages.json`.
- Produces: `validateSectionChain(root: string, dirs: string[], errors: ValidationError[]): void` — the same shape as Task 2's validator. For a `legs` pilgrimage, section N's last stage `end` must lie within `SNAP_METERS` of section N+1's first stage `start`. When the pilgrimage's sections are all `topology: "circular"` in their metadata, the last section's final `end` must also close against the first section's first `start`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/validate.test.ts`:

```ts
function sectionWithStages(root: string, id: string, block: object, stages: object[], topology = "linear") {
  const dir = join(root, "routes", id);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, "metadata.json"), { id, overview: { topology }, pilgrimage: block });
  writeJson(join(dir, "stages.json"), { schemaVersion: "1.0.0", routeId: id, stageCount: stages.length, stages });
  return dir;
}

const legs = (order: number) => ({ id: "shikoku-88", name: { en: "Shikoku" }, kind: "legs", order });

test("a gap between two legs sections is an error naming both", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    const a = sectionWithStages(root, "awa", legs(1), [
      { index: 0, name: "d1", start: { name: "T1", coordinates: [0, 0] }, end: { name: "T23", coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    const b = sectionWithStages(root, "tosa", legs(2), [
      { index: 0, name: "d1", start: { name: "T24", coordinates: [0.5, 0] }, end: { name: "T39", coordinates: [0.6, 0] }, distanceKm: 11 },
    ]);

    const errors: ValidationError[] = [];
    validateSectionChain(root, [a, b], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /awa/);
    assert.match(errors[0].message, /tosa/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sections that meet within the snap distance chain cleanly", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    const a = sectionWithStages(root, "awa", legs(1), [
      { index: 0, name: "d1", start: { name: "T1", coordinates: [0, 0] }, end: { name: "T23", coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    const b = sectionWithStages(root, "tosa", legs(2), [
      { index: 0, name: "d1", start: { name: "T23", coordinates: [0.1, 0] }, end: { name: "T39", coordinates: [0.2, 0] }, distanceKm: 11 },
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
    const a = sectionWithStages(root, "awa", legs(1), [
      { index: 0, name: "d1", start: { name: "T1", coordinates: [0, 0] }, end: { name: "T23", coordinates: [0.1, 0] }, distanceKm: 11 },
    ], "circular");
    const b = sectionWithStages(root, "sanuki", legs(2), [
      { index: 0, name: "d1", start: { name: "T23", coordinates: [0.1, 0] }, end: { name: "T88", coordinates: [0.2, 0] }, distanceKm: 11 },
    ], "circular");

    const errors: ValidationError[] = [];
    validateSectionChain(root, [a, b], errors);

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /circuit/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("alternatives sections are exempt from chaining", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-chain-test-"));
  try {
    const block = (order: number) => ({ id: "camino-de-santiago", name: { en: "Camino" }, kind: "alternatives", order });
    const a = sectionWithStages(root, "frances", block(1), [
      { index: 0, name: "d1", start: { name: "SJPP", coordinates: [0, 0] }, end: { name: "Zubiri", coordinates: [0.1, 0] }, distanceKm: 11 },
    ]);
    const b = sectionWithStages(root, "norte", block(2), [
      { index: 0, name: "d1", start: { name: "Irún", coordinates: [9, 9] }, end: { name: "San Sebastián", coordinates: [9.1, 9] }, distanceKm: 11 },
    ]);
    const errors: ValidationError[] = [];
    validateSectionChain(root, [a, b], errors);
    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)|not ok"
```
Expected: four failures — `validateSectionChain is not a function`.

- [ ] **Step 3: Write the chain check**

In `scripts/validate.ts`:

```ts
export function validateSectionChain(root: string, dirs: string[], errors: ValidationError[]): void {
  const declared: { routeId: string; dir: string; block: PilgrimageBlock; circular: boolean }[] = [];

  for (const dir of dirs) {
    const metaPath = join(dir, "metadata.json");
    if (!existsSync(metaPath) || !existsSync(join(dir, "stages.json"))) continue;
    const meta = loadJson(metaPath) as { id?: string; overview?: { topology?: string } };
    let block: PilgrimageBlock | undefined;
    try {
      block = readPilgrimage(meta);
    } catch {
      // validatePilgrimages already reported this block; skip the section
      // rather than the run, so one bad file cannot hide every other gap.
      continue;
    }
    if (!block || block.kind !== "legs") continue;
    declared.push({
      routeId: meta.id ?? basename(dir),
      dir,
      block,
      circular: meta.overview?.topology === "circular",
    });
  }

  for (const [id, { routeIds }] of groupSections(declared.map(({ routeId, block }) => ({ routeId, block })))) {
    const ordered = routeIds.map((routeId) => declared.find((d) => d.routeId === routeId)!);
    const ends = ordered.map((section) => {
      const stages = (loadJson(join(section.dir, "stages.json")) as { stages: Stage[] }).stages;
      const sorted = [...stages].sort((a, b) => a.index - b.index);
      return { section, first: sorted[0], last: sorted[sorted.length - 1] };
    });

    for (let i = 0; i < ends.length - 1; i++) {
      const gap = haversineMeters(ends[i].last.end.coordinates, ends[i + 1].first.start.coordinates);
      if (gap > SNAP_METERS) {
        errors.push({
          file: relative(root, ends[i].section.dir),
          message:
            `section "${ends[i].section.routeId}" ends at "${ends[i].last.end.name}" but ` +
            `"${ends[i + 1].section.routeId}" begins at "${ends[i + 1].first.start.name}", ${Math.round(gap)} m away`,
          severity: "error",
        });
      }
    }

    // A circuit the route claims but never walks is the gap this catches.
    if (ends.length > 0 && ends.every((e) => e.section.circular)) {
      const closing = haversineMeters(ends[ends.length - 1].last.end.coordinates, ends[0].first.start.coordinates);
      if (closing > SNAP_METERS) {
        errors.push({
          file: relative(root, ends[0].section.dir),
          message:
            `the circuit does not close: "${ends[ends.length - 1].last.end.name}" is ` +
            `${Math.round(closing)} m from "${ends[0].first.start.name}"`,
          severity: "error",
        });
      }
    }
  }
}
```

Import `SNAP_METERS` and `haversineMeters` from `./ways/geo.js`, and `relative` from `node:path` if not already imported. Use the file's existing stage type for `Stage`; if none is exported, inline `{ index: number; start: { name: string; coordinates: [number, number] }; end: { name: string; coordinates: [number, number] } }`.

Call it from `main()` directly after `validatePilgrimages(ROOT, dirs, errors);`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)"
npx tsc --noEmit
npm run validate 2>&1 | tail -2
```
Expected: `# fail 0`; `Validation passed (0 warning(s))` — the only pilgrimage today is `alternatives`, which is exempt.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate.ts scripts/validate.test.ts
git commit -m "$(cat <<'EOF'
feat(validate): the sections of a legs pilgrimage must meet

Section N's last stage has to end where N+1's first begins, and a
circular pilgrimage has to close back to where it started — the leg a
four-section Shikoku would otherwise drop without a word.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: A walked line comes from pinned relations

**Files:**
- Modify: `scripts/enrich/build-main-line.ts:267-289`
- Modify: `scripts/validate.ts` (a new `validatePinnedRelations`, called from `main`)
- Test: `scripts/enrich/build-main-line.test.ts`, `scripts/validate.test.ts`

**Interfaces:**
- Produces: `requireRelations(routeDir: string, routeId: string): number[]` in `scripts/enrich/build-main-line.ts`, throwing when `osm.relations` is absent or empty, so `build-main-line <route-id>` exits 1 naming the route whether or not `osm.query` is present. Also `validatePinnedRelations(root: string, dirs: string[], errors: ValidationError[]): void` in `scripts/validate.ts` — the same requirement enforced for any section that already has a `ways/` package, without running the enrichment step.

- [ ] **Step 1: Write the failing test**

Append to `scripts/enrich/build-main-line.test.ts`. Its existing tests are all pure-function tests over in-memory `Position[][]` fixtures — there is no temp-directory idiom to follow, so these two bring their own. Add `mkdtempSync, mkdirSync, writeFileSync, rmSync` to its `node:fs` import (it imports only `readFileSync` today), and `join` from `node:path` and `tmpdir` from `node:os`:

```ts
test("a section with only an osm.query is refused", () => {
  const root = mkdtempSync(join(tmpdir(), "main-line-test-"));
  try {
    const dir = join(root, "routes", "kumano-kodo");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "metadata.json"),
      JSON.stringify({ id: "kumano-kodo", name: { en: "Kumano Kodō" }, osm: { query: 'relation["name"~"熊野古道"]' } }),
    );
    writeFileSync(join(dir, "stages.json"), JSON.stringify({ stages: [] }));

    assert.throws(() => requireRelations(dir, "kumano-kodo"), /kumano-kodo/);
    assert.throws(() => requireRelations(dir, "kumano-kodo"), /osm\.relations/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a section with pinned relations passes", () => {
  const root = mkdtempSync(join(tmpdir(), "main-line-test-"));
  try {
    const dir = join(root, "routes", "camino-frances");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "metadata.json"),
      JSON.stringify({ id: "camino-frances", name: { en: "Camino Francés" }, osm: { relations: [2163569] } }),
    );
    assert.deepEqual(requireRelations(dir, "camino-frances"), [2163569]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

Add `requireRelations` to the imports from `./build-main-line.js`.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)|not ok"
```
Expected: two failures — `requireRelations is not a function`.

- [ ] **Step 3: Extract and tighten the check**

In `scripts/enrich/build-main-line.ts`, add above `main()`:

```ts
/**
 * A name query pulls in every spur and variant that shares the trail's name —
 * Shikoku's 4,020 km line came from 89 such relations. The walked line is cut
 * from the section's own trail, so the relations are pinned or nothing runs.
 */
export function requireRelations(routeDir: string, routeId: string): number[] {
  const metadata = loadJson(join(routeDir, "metadata.json")) as {
    osm?: { relations?: number[] };
  };
  const relations = metadata.osm?.relations;
  if (!Array.isArray(relations) || relations.length === 0) {
    throw new Error(
      `${routeId}: metadata.json needs osm.relations to build a walked line. ` +
        `A section whose relations cannot be pinned ships metadata-only with ways: null.`,
    );
  }
  return relations;
}
```

Replace the relation/query resolution at lines 284-289 with:

```ts
  const relationIds = requireRelations(routeDir, routeId);
  const query = buildRelationGeomQuery(relationIds);
```

and delete the `metadata.osm?.query` fallback and the `if (!query)` block that followed it. Keep `metadata.name.en` being read for the feature's `properties.name`.

- [ ] **Step 4: Require the relations of any section that already has a package**

`build-main-line` only runs when someone runs it. A section that shipped a `ways/` package must carry its relations regardless, or its line can never be rebuilt.

The marker for "shipped a package" is `ways/route.json`, not the `ways/` directory. `build-ways` writes `report.json` for every route it looks at, including the ones it refuses — `routes/shikoku-88/ways/` and `routes/kumano-kodo/ways/` each hold a `report.json` and nothing else today, and neither pins `osm.relations`. Guarding on the directory would fail both and contradict Step 5's expected `Validation passed`. `waysEntry` in `scripts/build-index.ts` (line 98) draws the same line: it returns `undefined` unless both `report.json` and `route.json` exist. Add to `scripts/validate.ts`:

```ts
export function validatePinnedRelations(root: string, dirs: string[], errors: ValidationError[]): void {
  for (const dir of dirs) {
    const metaPath = join(dir, "metadata.json");
    // ways/route.json, not ways/: a refused route still leaves a report.json
    // behind, and a route with no walked line has nothing to pin.
    if (!existsSync(metaPath) || !existsSync(join(dir, "ways", "route.json"))) continue;
    const meta = loadJson(metaPath) as { id?: string; osm?: { relations?: number[] } };
    if (!Array.isArray(meta.osm?.relations) || meta.osm.relations.length === 0) {
      errors.push({
        file: relative(root, metaPath),
        message: `"${meta.id ?? basename(dir)}" has a ways/ package but no osm.relations to rebuild its walked line from`,
        severity: "error",
      });
    }
  }
}
```

Call it from `main()` after `validateSectionChain(ROOT, dirs, errors);` as `validatePinnedRelations(ROOT, dirs, errors);` — that is the last validator wired in at this point in the sequence; Task 7 adds its own after this one. Add three tests to `scripts/validate.test.ts` in Task 7's idiom, all built on `makeFixtureRoute()`, which already creates the `ways/` directory: writing a `ways/route.json` and metadata carrying `osm.query` but no `relations` yields one error naming the route; the same route with `osm: { relations: [123] }` yields none; and a route whose `ways/` holds a `report.json` only — the shape `shikoku-88` and `kumano-kodo` are in today — yields none either.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)"
npx tsc --noEmit
npm run validate 2>&1 | tail -2
```
Expected: `# fail 0`, `tsc` silent, `Validation passed (0 warning(s))` — `camino-frances` is the only route with a `ways/` package and it already pins six relations. Do not run `npm run build-main-line`; it hits Overpass.

- [ ] **Step 6: Commit**

```bash
git add scripts/enrich/build-main-line.ts scripts/enrich/build-main-line.test.ts scripts/validate.ts scripts/validate.test.ts
git commit -m "$(cat <<'EOF'
fix(enrich): a walked line is built from pinned relations only

A name query pulls in every spur that shares the trail's name; the
Shikoku line came back 4,020 km long from 89 relations. Without
osm.relations the build now stops and says so.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: The drafted-text gate, at merge

**Files:**
- Modify: `scripts/validate.ts` (a new `validateDraftedText`, called from `main`)
- Test: `scripts/validate.test.ts`

**Interfaces:**
- Produces: `validateDraftedText(root: string, dirs: string[], errors: ValidationError[]): void` — the same shape as Tasks 2, 5, and 6. Any stage carrying `"drafted": true` is an error, so drafted text cannot reach `main`. A stage listed in `docs/review/<id>.md` whose flag is gone must carry a reviewed mark — the line `- [x] stage N` — in that checklist, so the flag cannot be stripped without a review being recorded.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/validate.test.ts`:

```ts
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

    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /stage 0/);
    assert.match(errors[0].message, /drafted/);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)|not ok"
```
Expected: three failures — `validateDraftedText is not a function`.

- [ ] **Step 3: Write the gate**

In `scripts/validate.ts`:

```ts
/**
 * The gate is at merge, not at tagging: release.md Phase 2b requires the tag
 * to follow the merge immediately, so a slow review would leave @main naming
 * a release tag that does not exist and every package URL 404ing.
 */
export function validateDraftedText(root: string, dirs: string[], errors: ValidationError[]): void {
  for (const dir of dirs) {
    const stagesPath = join(dir, "stages.json");
    const metaPath = join(dir, "metadata.json");
    if (!existsSync(stagesPath) || !existsSync(metaPath)) continue;
    const routeId = (loadJson(metaPath) as { id?: string }).id ?? basename(dir);
    const stages = (loadJson(stagesPath) as { stages?: { index: number; drafted?: boolean }[] }).stages ?? [];

    for (const stage of stages) {
      if (stage.drafted === true) {
        errors.push({
          file: relative(root, stagesPath),
          message: `stage ${stage.index} is still marked drafted; review it before this merges`,
          severity: "error",
        });
      }
    }

    const checklistPath = join(root, "docs", "review", `${routeId}.md`);
    if (!existsSync(checklistPath)) continue;
    const checklist = readFileSync(checklistPath, "utf8");
    for (const stage of stages) {
      if (stage.drafted === true) continue;
      const mentioned = new RegExp(`^\\s*- \\[[ x]\\] stage ${stage.index}\\b`, "m").test(checklist);
      const reviewed = new RegExp(`^\\s*- \\[x\\] stage ${stage.index}\\b`, "m").test(checklist);
      if (mentioned && !reviewed) {
        errors.push({
          file: `docs/review/${routeId}.md`,
          message: `stage ${stage.index} carries no drafted flag but is unticked in docs/review/${routeId}.md`,
          severity: "error",
        });
      }
    }
  }
}
```

Import `readFileSync` from `node:fs` if not already imported. Call it from `main()` after `validatePinnedRelations(ROOT, dirs, errors);`:

```ts
  validateDraftedText(ROOT, dirs, errors);
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)"
npx tsc --noEmit
npm run validate 2>&1 | tail -2
```
Expected: `# fail 0`; `Validation passed (0 warning(s))` — no stage carries the flag and no checklist exists yet.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate.ts scripts/validate.test.ts
git commit -m "$(cat <<'EOF'
feat(validate): drafted stage text cannot reach main

The gate sits at merge because the tag has to follow the merge
immediately — a release-time gate would strand every package URL,
the Camino's included. Clearing a flag needs a ticked line in the
section's review checklist, so it cannot be stripped in one pass.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `check-site` learns pilgrimages

**Files:**
- Modify: `scripts/site/check-site.ts` — `IndexRoute` and `readIndexRoutes` (410-443), the id set at 482-483, the orphaned-detail-page check (1092-1101), and three new loops after the per-route loop closes at 1074. `RESERVED_PAGE_NAMES` (18-27) and the reserved-name collision check inside the per-route loop (1071-1073) are read, not changed.
- Test: `scripts/site/check-site.test.ts`

**Interfaces:**
- Consumes: `index.json`'s `pilgrimages[]` and per-route `pilgrimage` (Task 3).
- Produces: `check-site` accepts `docs/<pilgrimage-id>.html` as a page rather than an orphan; refuses a pilgrimage id that collides with a reserved page name or a route id; refuses a route whose `pilgrimage` names no entry in `pilgrimages[]`; refuses a pilgrimage with no sections.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/site/check-site.test.ts` (the paragraph after the block says what `fixtureSite` stands in for):

```ts
test("a route naming a pilgrimage that does not exist is a problem", () => {
  const site = fixtureSite({
    index: { pilgrimages: [], routes: [{ id: "awa", pilgrimage: "shikoku-88" }] },
  });
  const problems = checkSite(site);
  assert.ok(problems.some((p) => /shikoku-88/.test(p.message) && /awa/.test(p.message)));
});

test("a pilgrimage with no sections is a problem", () => {
  const site = fixtureSite({
    index: { pilgrimages: [{ id: "shikoku-88", sections: [] }], routes: [] },
  });
  const problems = checkSite(site);
  assert.ok(problems.some((p) => /shikoku-88/.test(p.message) && /no sections/.test(p.message)));
});

test("a pilgrimage page is not an orphaned detail page", () => {
  const site = fixtureSite({
    index: { pilgrimages: [{ id: "shikoku-88", sections: ["awa"] }], routes: [{ id: "awa", pilgrimage: "shikoku-88" }] },
    pages: ["awa", "shikoku-88"],
  });
  const problems = checkSite(site);
  assert.equal(problems.filter((p) => /orphaned detail page/.test(p.message)).length, 0);
});

test("a pilgrimage id may not collide with a route id", () => {
  const site = fixtureSite({
    index: { pilgrimages: [{ id: "awa", sections: ["awa"] }], routes: [{ id: "awa", pilgrimage: "awa" }] },
  });
  const problems = checkSite(site);
  assert.ok(problems.some((p) => /awa/.test(p.message) && /claimed twice/.test(p.message)));
});
```

`fixtureSite` above is shorthand for what the file already does. Its real helper is `createFixtureRoot(indexRoutes: FixtureRoute[]): string` (line 21), which makes `routes/` and `docs/`, writes `{ routes: indexRoutes }` to `index.json`, and returns the root — `checkSite(root)` then takes that root, since `checkSite(root: string, overrides: PageOverrides = {})` reads `index.json` off disk and only accepts HTML/README text through `overrides`. Extend it to `createFixtureRoot(indexRoutes, indexExtras: Record<string, unknown> = {})`, spreading `indexExtras` into the written index so a fixture can carry `pilgrimages[]`; every existing call site passes one argument and is unaffected. Read each `fixtureSite({ index, pages })` above as: call that helper with the index's `routes` and `pilgrimages`, `writeFileSync` an empty `docs/<id>.html` for each `pages` entry, then `checkSite(root)`.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)|not ok"
```
Expected: four failures.

- [ ] **Step 3: Teach the checks**

`checkSite` has no whole-index object in scope: `readIndexRoutes(indexPath)` (line 421) narrows the file down to `IndexRoute { id, variants }` at line 442 and drops everything else. Two small changes give the checks what they need.

First, carry a route's pilgrimage through the reader. Add `pilgrimage?: string;` to `IndexRoute` (line 410) and include it in the map at line 442:

```ts
  return routes.map((route) => ({
    id: route.id,
    pilgrimage: route.pilgrimage,
    variants: route.variants ?? [],
  }));
```

Second, add a sibling reader next to it. `readIndexRoutes` has already thrown on a missing or malformed file by the time this runs, so it can parse without repeating those guards:

```ts
interface IndexPilgrimage {
  id: string;
  sections: string[];
}

function readIndexPilgrimages(indexPath: string): IndexPilgrimage[] {
  const parsed = JSON.parse(readFileSync(indexPath, "utf-8")) as { pilgrimages?: unknown };
  if (!Array.isArray(parsed.pilgrimages)) return [];
  return parsed.pilgrimages.map((p) => ({
    id: String(p.id),
    sections: Array.isArray(p.sections) ? p.sections : [],
  }));
}
```

Then, at line 483 — where `const ids = indexRoutes.map((route) => route.id);` builds the route-id **array** the page checks use — name the index path once and add the pilgrimage ids beside it:

```ts
  const indexPath = join(root, "index.json");
  const indexRoutes = readIndexRoutes(indexPath);
  const ids = indexRoutes.map((route) => route.id);
  const routeIdSet = new Set(ids);
  const pilgrimages = readIndexPilgrimages(indexPath);
  const pilgrimageIds = new Set(pilgrimages.map((p) => p.id));
  // A pilgrimage has no directory but does have a page, and both live in the
  // same flat namespace under open.pilgrimag.es.
  const pageIds = new Set([...routeIdSet, ...pilgrimageIds]);
```

(Line 482 already reads `const indexRoutes = readIndexRoutes(join(root, "index.json"));` — this splits the path out so both readers share it.)

Change the orphaned-detail-page check at 1092-1101 to test `pageIds`: `if (RESERVED_PAGE_NAMES.has(stem) || pageIds.has(stem)) continue;`.

Leave the reserved-name collision check at 1071-1073 exactly where it is. It sits inside `for (const id of ids)` (line 1007), the loop that also checks a route's catalog link, README row, detail page, glyph, GPX, roads asset and filter attributes — none of which a pilgrimage has — so that loop keeps iterating `ids` and only `ids`. A pilgrimage's two id checks get their own loop instead. Add it after the per-route loop closes at 1074, alongside the other two loops below:

```ts
  for (const id of pilgrimageIds) {
    if (RESERVED_PAGE_NAMES.has(id)) {
      add("index.json", `pilgrimage id "${id}" collides with a reserved page name`);
    }
    if (routeIdSet.has(id)) {
      add("index.json", `"${id}" is claimed twice — it is both a pilgrimage and a route id`);
    }
  }
  for (const pilgrimage of pilgrimages) {
    if (pilgrimage.sections.length === 0) {
      add("index.json", `pilgrimage "${pilgrimage.id}" has no sections`);
    }
  }
  for (const route of indexRoutes) {
    if (route.pilgrimage && !pilgrimageIds.has(route.pilgrimage)) {
      add("index.json", `route "${route.id}" names pilgrimage "${route.pilgrimage}", which is not in pilgrimages[]`);
    }
  }
```

`add(file, message)` is `checkSite`'s own closure at line 472; `Problem` is `{ file, message }`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)"
npx tsc --noEmit
npm run check-site 2>&1 | tail -2
```
Expected: `# fail 0`; `Site is in sync with route data.` — `camino-de-santiago` has five sections and no page yet, which Task 9 adds; the orphan check only fires on pages that exist.

- [ ] **Step 5: Commit**

```bash
git add scripts/site/check-site.ts scripts/site/check-site.test.ts
git commit -m "$(cat <<'EOF'
feat(site): pilgrimage ids share the page namespace with routes

A pilgrimage page is a page, not an orphan, and no id may be claimed by
both a pilgrimage and a route. check-site also refuses a route naming a
pilgrimage that is not in the index and a pilgrimage with no sections.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: The pilgrimage page and the grouped catalog

`docs/<id>.html` pages are hand-authored today; `build-assets` generates the glyph, profile, sparkline, and GPX a page inlines. This task adds page *generation* for pilgrimages only — a pilgrimage has no geometry of its own, so its page is a short index of its sections and can be emitted whole. Section pages stay hand-authored, as they are now; the five Camino ones gain a single line linking back up.

**Files:**
- Modify: `scripts/site/build-assets.ts` (`buildAssets` at 81-139, `main` at 141-147)
- Create: `docs/camino-de-santiago.html` (generated by the step below, then committed)
- Modify: `docs/routes.html` (group the catalog by pilgrimage), `docs/route-filter.js` (hide a group whose cards are all hidden), `docs/styles.css` (one rule for the group container)
- Modify: `docs/camino-frances.html`, `docs/camino-norte.html`, `docs/camino-primitivo.html`, `docs/camino-ingles.html`, `docs/camino-portugues.html` (each links up to `/camino-de-santiago`)
- Test: `scripts/site/build-assets.test.ts`

**Interfaces:**
- Consumes: `index.json`'s `pilgrimages[]`, including each entry's `kind`.
- Produces: `buildPilgrimagePages(root: string): string[]` — writes `docs/<pilgrimage-id>.html` for every entry in `pilgrimages[]`, returns the paths written. Called from `buildAssets`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/site/build-assets.test.ts`. It imports only `{ existsSync, readFileSync }` from `"fs"` and `{ join }` from `"path"` today, so add `mkdtempSync`, `mkdirSync`, `writeFileSync` and `rmSync` to the `"fs"` import, `tmpdir` from `"os"`, and `buildPilgrimagePages` to the `from "./build-assets.js"` import:

```ts
test("a page is written for each pilgrimage, listing its sections in order", () => {
  const root = mkdtempSync(join(tmpdir(), "build-assets-test-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "index.json"),
      JSON.stringify({
        pilgrimages: [
          { id: "kumano-kodo", name: { en: "Kumano Kodō" }, kind: "alternatives", sections: ["kumano-kodo-nakahechi", "kumano-kodo-kohechi"] },
        ],
        routes: [
          { id: "kumano-kodo-nakahechi", name: { en: "Nakahechi" }, distanceKm: 70, pilgrimage: "kumano-kodo" },
          { id: "kumano-kodo-kohechi", name: { en: "Kohechi" }, distanceKm: 70, pilgrimage: "kumano-kodo" },
        ],
      }),
    );

    const written = buildPilgrimagePages(root);

    assert.deepEqual(written, [join(root, "docs", "kumano-kodo.html")]);
    const html = readFileSync(written[0], "utf8");
    assert.match(html, /Kumano Kodō/);
    assert.ok(
      html.indexOf('href="/kumano-kodo-nakahechi"') < html.indexOf('href="/kumano-kodo-kohechi"'),
      "sections appear in the order the index lists them",
    );
    // The kind is the only thing that tells a reader whether these two links
    // are choices or legs, so the page has to say which.
    assert.match(html, /Each section below is its own way to the same destination/);
    // No other route's metadata rides along in the head.
    assert.match(html, /<link rel="canonical" href="https:\/\/open\.pilgrimag\.es\/kumano-kodo">/);
    assert.equal(html.includes("camino-frances"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no pilgrimages means no pages", () => {
  const root = mkdtempSync(join(tmpdir(), "build-assets-test-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "index.json"), JSON.stringify({ routes: [] }));
    assert.deepEqual(buildPilgrimagePages(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)|not ok"
```
Expected: two failures — `buildPilgrimagePages is not a function`.

- [ ] **Step 3: Emit the pages**

Before writing the generator, read an existing hand-authored page — `docs/camino-frances.html` — and copy its `<head>`, header, and footer markup exactly, so a generated pilgrimage page is indistinguishable in styling from its neighbours. Then add to `scripts/site/build-assets.ts`:

```ts
/**
 * A pilgrimage has no geometry of its own, so unlike a section page there is
 * nothing here to hand-author: the page is the list of its sections, and it
 * keeps open.pilgrimag.es/<pilgrimage-id> resolving once that id is no longer
 * a route.
 */
export function buildPilgrimagePages(root: string): string[] {
  const index = JSON.parse(readFileSync(join(root, "index.json"), "utf8")) as {
    pilgrimages?: { id: string; name: Record<string, string>; kind: string; sections: string[] }[];
    routes: { id: string; name: Record<string, string>; distanceKm?: number }[];
  };
  const written: string[] = [];

  for (const pilgrimage of index.pilgrimages ?? []) {
    const sections = pilgrimage.sections
      .map((id) => index.routes.find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined);
    const items = sections
      .map(
        (s) =>
          `      <li><a href="/${s.id}">${escapeHtml(s.name.en)}</a> — ${s.distanceKm ?? 0} km</li>`,
      )
      .join("\n");

    // Five same-weight links say nothing about how they relate. The kind is
    // the only thing that distinguishes a set of choices from a sequence, so
    // it is what the page opens with and what its description is built from.
    const name = pilgrimage.name.en;
    const sectionNames = sections.map((s) => s.name.en).join(", ");
    const intro =
      pilgrimage.kind === "legs"
        ? "The sections below are walked in sequence, each beginning where the one before it ends."
        : "Each section below is its own way to the same destination. Walk one, not all of them.";
    const description =
      pilgrimage.kind === "legs"
        ? `${name}: ${sections.length} sections walked in sequence — ${sectionNames}. Route geometry, stages, and statistics for each.`
        : `${name}: ${sections.length} alternative ways to the same destination — ${sectionNames}. Route geometry, stages, and statistics for each.`;

    const path = join(root, "docs", `${pilgrimage.id}.html`);
    writeFileSync(path, pilgrimagePage(pilgrimage.id, name, description, intro, items));
    written.push(path);
  }

  return written;
}
```

Write `pilgrimagePage(id: string, name: string, description: string, intro: string, items: string): string` as a template literal returning the full document, reusing the markup you copied from `docs/camino-frances.html`. Every head field there that names a specific route has to take an argument, or the generated page ships the Camino Francés's metadata under its own canonical URL:

| Head field | Value |
|---|---|
| `<title>` | `${name} &mdash; Open Pilgrimages` |
| `<meta name="description">` | `${description}` |
| `<link rel="canonical">` | `https://open.pilgrimag.es/${id}` |
| `<meta property="og:title">` | `${name} &mdash; Open Pilgrimages` |
| `<meta property="og:description">` | `${description}` |
| `<meta property="og:url">` | `https://open.pilgrimag.es/${id}` |
| `<meta name="twitter:title">` | `${name} &mdash; Open Pilgrimages` |

The remaining head lines — charset, viewport, favicon, `og:type`, `og:image`, `twitter:card`, `twitter:image`, the font preconnects, the theme script, `styles.css`, `hero.js` — name no route and are copied verbatim. The description copy is not hand-written: it is generated above from the pilgrimage's own `name`, `kind`, and section names, so it stays true when PRs C and D add their pilgrimages and nobody is left editing prose in a generator.

The body is the nav copied verbatim, then:

```
    <h1>${name}</h1>
    <p class="subtitle">${intro}</p>
    <ul>
${items}
    </ul>
```

Run `name`, `description` and `intro` through `escapeHtml`. `scripts/site/build-assets.ts` has no `escapeHtml` today, so add a four-replacement one (`&`, `<`, `>`, `"`) — `&` first.

Call it from `buildAssets` and report it the way the other emitters there report their counts: add `pilgrimagePages: number` to `buildAssets`'s return type (line 81-86), return `written.length`, and extend `main()`'s single `console.log` (143-146) with `, ${counts.pilgrimagePages} pilgrimage page(s)`.

- [ ] **Step 4: Generate, then group the catalog**

```bash
npm run build-assets && ls docs/camino-de-santiago.html
```

Then edit `docs/routes.html` so the route table is grouped under a heading per pilgrimage, keeping every existing `href="/<route-id>"` catalog link and every comparison-table row intact — `check-site`'s `COMPARE_ROW_PATTERN` (lines 195-196, consumed at 1217-1240) and its catalog-link check (1007-1010) both still have to pass. Leave the ungrouped routes — `kumano-kodo` and `shikoku-88` — where they are, as direct children of `.route-grid`.

The five Camino cards are already contiguous, the first five children of `<div class="route-grid">` (line 100). Wrap them, with a heading, in one container:

```html
      <div class="route-group">
        <h3><a href="/camino-de-santiago">Camino de Santiago</a></h3>
        <!-- the five existing <div class="route-card" …> blocks, unchanged -->
      </div>
```

Do not touch the card tags themselves: `check-site`'s `findRouteCardOpenTag` (line 310) locates a card by `lastIndexOf('<div class="route-card"')` before the route's `href`, and `checkRouteFilterAttrs` reads the `data-*` attributes off exactly that tag.

`.route-grid` is a one-column grid whose `gap` spaces the cards (`docs/styles.css:372-377`); once they are nested, the container is the grid item and the gap no longer falls between them. Add beside it:

```css
.route-group {
  display: grid;
  gap: var(--space-lg);
}
```

Then teach the filter about the group. `docs/route-filter.js` collects `.route-card[data-days]` and sets `card.hidden` per card; it knows nothing about headings, so filtering to a narrow range would leave "Camino de Santiago" floating over nothing. Collect the groups next to the cards, after the `cards` line:

```js
  var groups = [].slice.call(grid.querySelectorAll(".route-group"));
```

and hide an empty one at the end of `applyFilters`, before `renderStatus(visible)`:

```js
    // A group heading with every card under it hidden announces a section
    // that is not there. The heading is not a card and has no data-days, so
    // nothing above would have hidden it.
    groups.forEach(function (group) {
      var cardsInGroup = [].slice.call(group.querySelectorAll(".route-card[data-days]"));
      group.hidden = cardsInGroup.every(function (card) {
        return card.hidden;
      });
    });
```

`grid.querySelectorAll` matches descendants, so the existing `cards` list still picks up every card inside a group and `total` is unchanged.

- [ ] **Step 5: Link each section back up**

The relationship is currently one-way: the pilgrimage page lists its five sections and no section page says it belongs to one. All five `docs/camino-*.html` pages are identically structured — `<h1>` on line 53, `<p class="subtitle">` on line 54. Insert one line after the subtitle in each of `docs/camino-frances.html`, `docs/camino-norte.html`, `docs/camino-primitivo.html`, `docs/camino-ingles.html`, and `docs/camino-portugues.html`:

```html
    <p class="subtitle">Part of the <a href="/camino-de-santiago">Camino de Santiago</a>.</p>
```

`.subtitle` is an existing rule, so no CSS changes and the line reads as a second sub-title under the route's own. Do not touch the `<h1>` or the paragraph below it.

- [ ] **Step 6: Run the tests and the site check**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)"
npx tsc --noEmit
npm run build-assets && npm run check-site 2>&1 | tail -2 && git status --porcelain docs
```
Expected: `# fail 0`; `Site is in sync with route data.`; `git status` lists `docs/camino-de-santiago.html`, `docs/routes.html`, `docs/route-filter.js`, `docs/styles.css`, and the five `docs/camino-*.html` section pages — nothing else.

- [ ] **Step 7: Commit**

```bash
git add scripts/site/build-assets.ts scripts/site/build-assets.test.ts docs/camino-de-santiago.html docs/routes.html docs/route-filter.js docs/styles.css docs/camino-frances.html docs/camino-norte.html docs/camino-primitivo.html docs/camino-ingles.html docs/camino-portugues.html
git commit -m "$(cat <<'EOF'
feat(site): a pilgrimage gets a page of its sections

Generated rather than hand-authored, because a pilgrimage has no
geometry to draw: the page is its section list, opening with a line
that says whether those sections are choices or legs. This is what will
keep /kumano-kodo and /shikoku-88 resolving once those ids stop being
routes. The catalog groups the five Caminos under one heading, the
filter hides that heading when its cards are all filtered out, and each
section page links back up.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Say it in the docs

**Files:**
- Modify: `CLAUDE.md` (Project Structure, Data Conventions), `README.md` (the route table's grouping and the Key Conventions), `.claude/commands/release.md` (the drafted-text gate's location), `CHANGELOG.md` (`[Unreleased]`)

**Interfaces:**
- Consumes: everything Tasks 1-9 built.
- Produces: no code. The repo's own documentation describes the model a contributor now has to follow.

- [ ] **Step 1: Describe the model in CLAUDE.md**

Under Project Structure, add above the `routes/{route-id}/` block:

```
A pilgrimage is a grouping in index.json, not a directory: every route
directory is a section, and a section's metadata.json names the pilgrimage
it belongs to. Pilgrimage ids and section ids share the docs site's page
namespace and may not collide.
```

Under Data Conventions, add:

```
- Pilgrimage: `pilgrimage: { id, name, kind, order }` in a section's metadata.
  `kind` is `legs` (walked one after another; the sections must chain, and a
  circular pilgrimage must close) or `alternatives` (each section its own way
  to the same end; exempt from chaining, and no summed distance).
- Walked line: `osm.relations` is required for any section with a ways/
  package. A name query pulls in spurs and variants.
- Drafted stage text carries `"drafted": true` and cannot be merged; clearing
  the flag needs a ticked line in `docs/review/<id>.md`.
```

- [ ] **Step 2: Note the gate in the release runbook**

In `.claude/commands/release.md`, in Phase 2b — the phase that already explains why the tag has to follow the merge — add one sentence:

```
`validate` also refuses any stage still marked `"drafted": true`, so drafted
text is stopped at merge rather than here — a gate at tagging would strand
every package URL in the window Phase 2b forbids.
```

- [ ] **Step 3: Update the README**

Group the route table by pilgrimage the same way `docs/routes.html` now is, keeping every `](routes/<id>/)` link intact — `check-site`'s README check at lines 1012-1014 tests for exactly that substring per route id. Add one line to Key Conventions naming the pilgrimage/section/stage model and pointing at CLAUDE.md.

- [ ] **Step 4: Write the changelog entry**

Under `## [Unreleased]`, add:

```markdown
### Added
- `pilgrimages[]` in `index.json`: a pilgrimage groups the sections that name it, with `kind` distinguishing sections walked in sequence from alternative ways to the same end. Additive — `routes[]` is unchanged.
- `validate` checks that the sections of a `legs` pilgrimage meet, that a circular pilgrimage closes, and that no stage still carries drafted text.
- A generated page per pilgrimage, listing its sections and saying whether they are choices or legs. The catalog groups them under one heading, and each section page links back up.

### Fixed
- Stage boundaries advance along the walked line. A route that passes a place twice could put a stage's end behind its start; the slice was cut anyway and the report never said so. Such a pair is now a named gate reason with nothing emitted (#7).
- `build-main-line` requires `osm.relations`. A name query pulled in every spur sharing the trail's name.
```

- [ ] **Step 5: Verify everything together**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)"
npx tsc --noEmit
npm run build-ways && npm run build-index && npm run validate 2>&1 | tail -2
npm run build-assets && npm run check-site 2>&1 | tail -1
git status --porcelain routes index.json docs
```
Expected: `# fail 0`; `tsc` silent; `Validation passed (0 warning(s))`; `Site is in sync with route data.`; `git status` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md README.md CHANGELOG.md .claude/commands/release.md
git commit -m "$(cat <<'EOF'
docs: the pilgrimage, the section, and where the drafted gate sits

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Done when

- `npm test`, `npx tsc --noEmit`, `npm run validate`, and `npm run check-site` are all clean.
- `npm run build-ways && npm run build-index && npm run build-assets` leaves `routes/`, `index.json`, and `docs/` unchanged.
- `index.json` carries one `camino-de-santiago` pilgrimage with five sections and no summed distance.
- `docs/camino-de-santiago.html` exists, opens with the `alternatives` sentence, carries its own head metadata, and each of the five section pages links back to it.
- `routes/camino-frances/ways/` is byte-identical to what it was before Task 1.
- Issue #7 is closed by Task 1's commit.

## What this plan does not do

PRs B, C, and D — the content work for Camino del Norte, Kumano Kodō, and Shikoku 88 — each get their own plan, written against this one's validators once it has merged. Nothing here renames a directory or adds a section; the renames land with the pilgrimage whose sections they belong to (spec §2.1, §9).

Spec §4.4 also lets `check-site` drop its coastal-only special cases "where the generic check covers them". Nothing in PR A turns a variant into a section, so the generic checks do not yet cover what those special cases cover, and removing them here would delete working checks with nothing in their place. It belongs to whichever PR first promotes a variant.
