# Camino del Norte Implementation Plan (PR B, release 1.7.1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Camino del Norte ships a complete, validating `ways/` package whose card does not say "few places marked yet".

**Architecture:** Three movements. First the tools are sharpened — issue #9's open items, and a CI check that closes the drafted-text gate's last fail-open path before PR C needs it. Then the route is measured: every stage anchor pinned to an OSM place node, a walked line derived from the four pinned relations, and the gate run until it clears. Then the places: the POI fetcher today queries only service amenities, so no curated place can exist for any route — extending it is what makes curation possible here and in PRs C and D.

**Tech Stack:** TypeScript run under `tsx`, `node:test` + `node:assert/strict`, Ajv against `schema/*.json`, Overpass via `scripts/enrich/osm.ts`. No new runtime dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-05-pilgrimages-and-sections-design.md`. Where plan and spec disagree, the spec wins.
- Branch `feat/camino-norte`, worktree `.worktrees/camino-norte`. Never commit to `main`; never use `git stash` — the stash stack is shared across worktrees.
- Every commit message ends with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Comments explain why, never what.
- `npm test` green and `npx tsc --noEmit` clean before every commit.
- Committed `routes/`, `index.json` and `docs/` must equal what the generators emit. CI fails on any drift, including untracked files under `docs/`.
- Nothing renames a route directory or changes an existing route id. `camino-norte` keeps its id.
- **Stage text already exists on all 34 stages and is kept.** This PR drafts nothing. Do not add, rewrite, or reflow any `interior` block.
- Green beats scope: when a change turns an earlier test red, fix the cause in the same task, never the assertion.
- Release is **1.7.1**. `v1.7.0` is already tagged and published; jsDelivr caches tag URLs permanently, so the tag must follow the merge immediately (`.claude/commands/release.md` Phase 2b).

## Constants this plan depends on

Read from the code, not restated from memory:

| Constant | Value | Where |
|---|---|---|
| `SNAP_METERS` | 500 | `scripts/ways/geo.ts:23` |
| `GATE_TOLERANCE` | 0.1 | `scripts/ways/geo.ts:25` |
| `MOMENT_DROP_METERS` | 300 | `scripts/ways/moments.ts:66` |
| `PLACE_MATCH_METERS` | 150 | `scripts/ways/moments.ts` |
| `MOMENT_TYPES` | `sacred_site`, `cultural_site`, `viewpoint`, `town`, `credential_stamp` | `scripts/ways/moments.ts:49` |
| `sparse` | `stagesWithMomentBeyondEnds < Math.ceil(stageCount / 2)` | `scripts/ways/catalog.ts:21,135` |

For 34 stages, `halfOfStages` is **17**. The route stops being `sparse` when **at least 17 stages each carry at least one place that is neither their own start nor their own end**, within `MOMENT_DROP_METERS` of the walked line.

## Starting state

- `routes/camino-norte/metadata.json` already declares `osm.relations: [1116809, 360167, 2201058, 1554697]` and the `pilgrimage` block (`camino-de-santiago`, `alternatives`, order 2).
- 34 stages, all chaining. `overview.topology` is `linear`, `overview.distanceKm` is 784.
- **No `route.main.geojson`** — stages are being cut from raw `route.geojson`.
- The gate fails with exactly one reason: stage 23, `Soto de Luiña` → `Cadavedo`, both anchors landing on vertex 31648 of 38639. Soto de Luiña is 43 m off the line and snapped; Cadavedo is 1247 m off and placed proportionally.
- 3,634 waypoints, every one a service type. Zero `MOMENT_TYPES` waypoints.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `.github/workflows/validate.yml` | gains a base-ref diff step | 1 |
| `scripts/check-drafted-diff.ts` (new) | errors when `"drafted": true` is removed with no checklist entry added | 1 |
| `scripts/check-drafted-diff.test.ts` (new) | its tests | 1 |
| `scripts/ways/geo.ts` | `Boundary.offMeters` doc comment | 2 |
| `scripts/ways/types.ts` | `ChainStage.coordinates` uses the existing `Position` | 2 |
| `scripts/build-ways.ts` | one stall predicate, not two | 2 |
| `scripts/validate.ts` | `validatePinnedRelations` message; one `file` field | 2 |
| `docs/routes.html`, `scripts/site/build-assets.ts` | heading level; named entities | 3 |
| `routes/camino-norte/stages.json` | anchors pinned, with notes | 4 |
| `routes/camino-norte/route.main.geojson` (new) | the walked line | 5 |
| `routes/camino-norte/ways/**` | the emitted package | 6 |
| `scripts/enrich/osm.ts` | POI query and tag map reach the moment types | 7 |
| `schema/waypoints.schema.json` | declares `source` and `osmId` | 7 |
| `routes/camino-norte/waypoints.geojson` | curated places | 8 |
| `package.json`, `CHANGELOG.md`, `README.md` | the 1.7.1 release | 9 |

---

## Stage 1 — Sharpen the tools

### Task 1: The drafted-text gate learns to read the diff

`validateDraftedText` closed six of seven fail-open paths in PR A. The seventh is out of reach of a single-tree validator: a section shipping text nobody ever marked `"drafted": true`, with no `docs/review/` file, passes. A "text implies a checklist" rule cannot be adopted — all seven committed sections carry text across 108 stages and the repo has no `docs/review/` directory, so the rule would fail `npm run validate` outright.

The missing check is a *diff* against the PR's base ref: if a stage stopped being drafted in this PR, a checklist entry for it must have appeared in this PR.

**Files:**
- Create: `scripts/check-drafted-diff.ts`
- Test: `scripts/check-drafted-diff.test.ts`
- Modify: `.github/workflows/validate.yml`, `package.json` (scripts)

**Interfaces:**
- Produces: `export function checkDraftedDiff(before: string, after: string, checklistAfter: string, routeId: string): string[]` — returns error strings, empty when clean. `before`/`after` are the two versions of one `stages.json` as text; `checklistAfter` is the concatenated `docs/review/*.md` content at the head commit, or `""`.

- [ ] **Step 1: Write the failing test**

Create `scripts/check-drafted-diff.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDraftedDiff } from "./check-drafted-diff.js";

const drafted = JSON.stringify({ stages: [{ index: 0, drafted: true }, { index: 1 }] });
const cleared = JSON.stringify({ stages: [{ index: 0 }, { index: 1 }] });

test("clearing a drafted flag with no checklist entry is an error", () => {
  // #given stage 0 was drafted at the base ref and is not at the head
  // #when no checklist mentions it
  const errors = checkDraftedDiff(drafted, cleared, "", "camino-norte");
  // #then the stage is named, along with the file that has to record the review
  assert.equal(errors.length, 1);
  assert.match(errors[0], /camino-norte/);
  assert.match(errors[0], /stage 0/);
  assert.match(errors[0], /docs\/review\/camino-norte\.md/);
});

test("clearing a drafted flag with a ticked entry is allowed", () => {
  const errors = checkDraftedDiff(drafted, cleared, "- [x] stage 0\n", "camino-norte");
  assert.deepEqual(errors, []);
});

test("a section-qualified tick in a shared checklist counts", () => {
  const errors = checkDraftedDiff(drafted, cleared, "- [x] camino-norte stage 0\n", "camino-norte");
  assert.deepEqual(errors, []);
});

test("an unticked entry does not clear the flag", () => {
  const errors = checkDraftedDiff(drafted, cleared, "- [ ] stage 0\n", "camino-norte");
  assert.equal(errors.length, 1);
});

test("a stage that was never drafted is not policed", () => {
  // #given stage 1 carried no flag at either ref
  const errors = checkDraftedDiff(drafted, drafted, "", "camino-norte");
  // #then nothing is reported — this check only watches flags that disappeared
  assert.deepEqual(errors, []);
});

test("a stage still drafted at the head is left to validate", () => {
  const errors = checkDraftedDiff(drafted, drafted, "", "camino-norte");
  assert.deepEqual(errors, []);
});

test("an unparseable base ref is reported, not thrown", () => {
  const errors = checkDraftedDiff("{not json", cleared, "", "camino-norte");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /could not be read/);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --import tsx --test scripts/check-drafted-diff.test.ts 2>&1 | tail -6
```
Expected: a file-level `SyntaxError` — `check-drafted-diff.js` does not exist.

- [ ] **Step 3: Write the checker**

Create `scripts/check-drafted-diff.ts`:

```ts
/**
 * `validate` sees one tree, so it cannot tell a stage that was never drafted
 * from one whose flag was deleted in the same commit that deleted its review.
 * Only a diff against the base ref can, which is why this is a CI step rather
 * than another validator.
 */
export function checkDraftedDiff(
  before: string,
  after: string,
  checklistAfter: string,
  routeId: string,
): string[] {
  let baseStages: { index: number; drafted?: boolean }[];
  let headStages: { index: number; drafted?: boolean }[];
  try {
    baseStages = JSON.parse(before).stages ?? [];
    headStages = JSON.parse(after).stages ?? [];
  } catch {
    return [`${routeId}: stages.json could not be read at one of the two refs`];
  }

  const stillDrafted = new Set(
    headStages.filter((s) => s.drafted === true).map((s) => s.index),
  );
  const errors: string[] = [];

  for (const stage of baseStages) {
    if (stage.drafted !== true || stillDrafted.has(stage.index)) continue;
    if (hasTick(checklistAfter, routeId, stage.index)) continue;
    errors.push(
      `${routeId}: stage ${stage.index} stopped being drafted in this PR, but no ticked ` +
        `line records the review. Add "- [x] stage ${stage.index}" to ` +
        `docs/review/${routeId}.md, or "- [x] ${routeId} stage ${stage.index}" to the ` +
        `pilgrimage's shared checklist.`,
    );
  }

  return errors;
}

function hasTick(checklist: string, routeId: string, index: number): boolean {
  const bare = new RegExp(`^\\s{0,3}[-*+]\\s+\\[[xX]\\]\\s+stage\\s+${index}\\b`, "m");
  const qualified = new RegExp(
    `^\\s{0,3}[-*+]\\s+\\[[xX]\\]\\s+${routeId}\\s+stage\\s+${index}\\b`,
    "m",
  );
  return bare.test(checklist) || qualified.test(checklist);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
node --import tsx --test scripts/check-drafted-diff.test.ts 2>&1 | grep -E "^ℹ (tests|pass|fail)"
```
Expected: `ℹ fail 0`, 7 tests.

- [ ] **Step 5: Add the CLI entry point**

Append to `scripts/check-drafted-diff.ts`:

```ts
import { execFileSync } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { resolveInvokedPath } from "./cli.js";

const ROOT = join(import.meta.dirname, "..");

function showAtRef(ref: string, path: string): string {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" });
  } catch {
    // A file absent at the base ref is a new section, which has nothing to strip.
    return '{"stages":[]}';
  }
}

function main(): void {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error("Usage: tsx scripts/check-drafted-diff.ts <base-ref>");
    process.exit(2);
  }

  const reviewDir = join(ROOT, "docs", "review");
  const checklist = existsSync(reviewDir)
    ? readdirSync(reviewDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => readFileSync(join(reviewDir, f), "utf8"))
        .join("\n")
    : "";

  const problems: string[] = [];
  for (const entry of readdirSync(join(ROOT, "routes")).sort()) {
    const rel = `routes/${entry}/stages.json`;
    if (!existsSync(join(ROOT, rel))) continue;
    problems.push(
      ...checkDraftedDiff(showAtRef(baseRef, rel), readFileSync(join(ROOT, rel), "utf8"), checklist, entry),
    );
  }

  if (problems.length > 0) {
    console.error("Drafted text was cleared without a recorded review:");
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log("Every cleared drafted flag has a recorded review.");
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
```

Add to `package.json` scripts, after `"validate"`:

```json
"check-drafted-diff": "tsx scripts/check-drafted-diff.ts",
```

- [ ] **Step 6: Wire it into CI**

In `.github/workflows/validate.yml`, add a step after the `npm run validate` step. It only runs for pull requests, because there is no base ref to diff against on a push to `main`:

```yaml
      - name: No drafted text cleared without a review
        if: github.event_name == 'pull_request'
        run: |
          git fetch --no-tags --depth=1 origin "${{ github.base_ref }}"
          npm run check-drafted-diff -- FETCH_HEAD
```

- [ ] **Step 7: Verify against the real tree**

```bash
npm run check-drafted-diff -- main
```
Expected: `Every cleared drafted flag has a recorded review.` — no committed stage is drafted, so nothing is policed.

- [ ] **Step 8: Commit**

```bash
git add scripts/check-drafted-diff.ts scripts/check-drafted-diff.test.ts .github/workflows/validate.yml package.json
git commit -m "$(cat <<'EOF'
feat(validate): a cleared drafted flag must bring its review with it

validate sees one tree, so it cannot tell a stage that was never drafted
from one whose flag was deleted in the same commit that deleted its
review entry. Diffing against the PR's base ref can, which closes the
last way stage text could reach main unreviewed — before the Kumano PR
becomes the first to draft any.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Issue #9's pipeline items

Six items, all in `scripts/`. None is reachable by committed data; each is a trap laid for PRs C and D.

**Files:**
- Modify: `scripts/ways/geo.ts`, `scripts/ways/types.ts`, `scripts/build-ways.ts`, `scripts/validate.ts`
- Test: `scripts/validate.test.ts`

- [ ] **Step 1: Write the failing tests**

Two of the six are behavioural. Append to `scripts/validate.test.ts`, following the neighbouring tests' `createFixtureRoot` idiom:

```ts
test("a pinned-relations failure names the metadata-only way out", () => {
  // #given a section with a ways package and no osm.relations
  const root = fixtureWithWaysButNoRelations();
  // #when validate runs
  const errors = validatePinnedRelations(root, [join(root, "routes", "a")], []);
  // #then the message says what to do, the way build-main-line's does
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /osm\.relations/);
  assert.match(errors[0].message, /ways: null/);
});

test("a still-drafted stage is not also reported as unticked", () => {
  // #given a drafted stage and a checklist that does not list it
  const root = fixtureWithDraftedStage();
  // #when validate runs
  const errors = validateDraftedText(root, [join(root, "routes", "a")], []);
  // #then it is named once, as drafted — not twice
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /still marked drafted/);
});
```

Add both helpers beside the file's existing fixture builders:

```ts
function sectionRoot(extra: { relations?: number[]; ways?: boolean; drafted?: boolean }): string {
  const root = mkdtempSync(join(tmpdir(), "validate-test-"));
  const dir = join(root, "routes", "a");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "metadata.json"),
    JSON.stringify({
      id: "a",
      name: { en: "A" },
      overview: { distanceKm: 10, topology: "linear" },
      ...(extra.relations ? { osm: { relations: extra.relations } } : {}),
    }),
  );
  writeFileSync(
    join(dir, "stages.json"),
    JSON.stringify({
      stages: [
        {
          index: 0,
          name: { en: "One" },
          start: { name: { en: "S" }, coordinates: [0, 0, 0] },
          end: { name: { en: "E" }, coordinates: [0.1, 0, 0] },
          distanceKm: 10,
          ...(extra.drafted ? { drafted: true } : {}),
          interior: { reflection: { en: "r" } },
        },
      ],
    }),
  );
  if (extra.ways) {
    mkdirSync(join(dir, "ways"), { recursive: true });
    writeFileSync(join(dir, "ways", "route.json"), JSON.stringify({ routeId: "a" }));
  }
  return root;
}

const fixtureWithWaysButNoRelations = () => sectionRoot({ ways: true });
const fixtureWithDraftedStage = () => sectionRoot({ drafted: true });
```

- [ ] **Step 2: Run them and watch them fail**

```bash
node --import tsx --test scripts/validate.test.ts 2>&1 | tail -8
```
Expected: the first fails on the missing `ways: null` phrase; the second fails with 2 errors where 1 is expected.

- [ ] **Step 3: Apply all six fixes**

1. `scripts/ways/geo.ts` — document the changed meaning on the `Boundary` interface:

```ts
  /**
   * Distance from the anchor to the whole line, not to the forward remainder
   * the index search was restricted to. The two diverge once a boundary is
   * pinned ahead of where the anchor actually sits.
   */
  offMeters: number;
```

2. `scripts/ways/types.ts` — `ChainStage.coordinates` becomes the union that already exists in that file:

```ts
  coordinates: Position;
```

3. `scripts/build-ways.ts` — the boundary-stall predicate appears twice, eleven lines apart. Compute it once:

```ts
  // Two copies of this test drifted apart once already; one set is the fix.
  const stalled = new Set(
    input.stages
      .filter((s) => boundaries[s.index + 1].index <= boundaries[s.index].index)
      .map((s) => s.index),
  );
```

Use `stalled.has(stage.index)` at both former sites.

4. `scripts/validate.ts` — `validatePinnedRelations`' message gains the recovery `build-main-line` already names:

```ts
        `${relative(root, metaPath)} ships a ways package but pins no osm.relations. ` +
          `Add the relation ids, or ship the section metadata-only with ways: null ` +
          `and pin them in a later release.`,
```

5. `scripts/validate.ts` — the one `file` field built as a template string becomes `relative(root, …)`, matching its sibling.

6. `scripts/validate.ts` — guard the unticked report so a stage already reported as drafted is not reported twice. The `continue` belongs immediately after the drafted error is pushed.

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npx tsc --noEmit && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
```
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/ways/geo.ts scripts/ways/types.ts scripts/build-ways.ts scripts/validate.ts scripts/validate.test.ts
git commit -m "$(cat <<'EOF'
fix(pipeline): the traps issue #9 laid for the next two content PRs

One stall predicate instead of two copies, offMeters says which line it
measures against, ChainStage carries the Position the file already
exports, and the two validators that named a condition now name the edit.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Issue #9's markup items

**Files:**
- Modify: `docs/routes.html`, `scripts/site/build-assets.ts`
- Test: `scripts/site/build-assets.test.ts`

- [ ] **Step 1: Write the failing test**

The generated `<li>` uses raw UTF-8 where every hand-authored page uses named entities. Append to `scripts/site/build-assets.test.ts`:

```ts
test("a section name with an accent is written as a named entity", () => {
  const root = mkdtempSync(join(tmpdir(), "build-assets-test-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "index.json"),
      JSON.stringify({
        pilgrimages: [
          { id: "p", name: { en: "P" }, kind: "alternatives", sections: ["a"] },
        ],
        routes: [{ id: "a", name: { en: "Camino Inglés" }, distanceKm: 112 }],
      }),
    );

    const html = readFileSync(buildPilgrimagePages(root)[0], "utf8");

    // #then the entity form the hand-authored pages use, not the raw codepoint
    assert.match(html, /Camino Ingl&eacute;s/);
    assert.equal(html.includes("Camino Inglés"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --import tsx --test scripts/site/build-assets.test.ts 2>&1 | tail -6
```
Expected: the `&eacute;` assertion fails — the page carries the raw character.

- [ ] **Step 3: Encode the Latin-1 entities, and fix the heading level**

In `scripts/site/build-assets.ts`, extend `escapeHtml` so the characters the hand-authored pages spell as entities are spelled that way here too. Keep the existing four replacements first and in order:

```ts
const NAMED_ENTITIES: Record<string, string> = {
  "á": "&aacute;", "é": "&eacute;", "í": "&iacute;", "ó": "&oacute;", "ú": "&uacute;",
  "ñ": "&ntilde;", "ü": "&uuml;", "ç": "&ccedil;", "Á": "&Aacute;", "É": "&Eacute;",
  "Í": "&Iacute;", "Ó": "&Oacute;", "Ú": "&Uacute;", "Ñ": "&Ntilde;",
};
```

Apply it after the four structural replacements, inside `escapeHtml`. Characters with no named entity — Japanese, the ō macron — stay as UTF-8, which is what the hand-authored `kumano-kodo.html` does.

In `docs/routes.html`, the `.route-group` heading is an `<h3>`, the same level as the `<h3>` inside each card it contains. Make it an `<h2>`, and add the matching rule beside the existing `.route-group` block in `docs/styles.css` so it does not change size:

```css
.route-group > h2 {
  font-size: var(--text-lg);
  margin: 0;
}
```

- [ ] **Step 4: Regenerate and verify**

```bash
npx tsc --noEmit
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
npm run build-assets && npm run check-site 2>&1 | tail -1
git status --porcelain docs
```
Expected: `ℹ fail 0`; `Site is in sync with route data.`; `git status` lists `docs/camino-de-santiago.html`, `docs/routes.html` and `docs/styles.css` and nothing else. The pilgrimage page changes because the Camino Inglés and Portugués names now carry entities.

- [ ] **Step 5: Commit**

```bash
git add scripts/site/build-assets.ts scripts/site/build-assets.test.ts docs/routes.html docs/styles.css docs/camino-de-santiago.html
git commit -m "$(cat <<'EOF'
fix(site): the generated page spells accents the way the rest of the site does

And a pilgrimage heading outranks the cards beneath it instead of
sitting level with them.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Stage 2 — Measure the route

### Task 4: Pin every stage anchor to an OSM place node

The gate names one failure today, but it is measured against `route.geojson`, which includes variants and detours. Anchors have to be right before the walked line is built, or the line will be built between the wrong points.

**Files:**
- Modify: `routes/camino-norte/stages.json`

**Interfaces:**
- Consumes: `queryOverpass`, `OsmNode` from `scripts/enrich/osm.ts`.
- Produces: 34 stages whose `start` and `end` anchors each sit on an OSM place node, each corrected anchor carrying a `note`.

- [ ] **Step 1: List every anchor and its distance from the line**

Run this from the worktree root. It writes nothing:

```bash
node --import tsx -e "
import { readFileSync } from 'fs';
import { nearestVertex, haversineMeters } from './scripts/ways/geo.ts';
const geo = JSON.parse(readFileSync('routes/camino-norte/route.geojson','utf8'));
const line = (geo.features ? geo.features[0].geometry : geo.geometry).coordinates;
const { stages } = JSON.parse(readFileSync('routes/camino-norte/stages.json','utf8'));
const rows = [];
for (const s of stages) {
  for (const side of ['start','end']) {
    const a = s[side];
    const i = nearestVertex(line, a.coordinates);
    rows.push({ stage: s.index, side, name: a.name.en, off: Math.round(haversineMeters(a.coordinates, line[i])), lon: a.coordinates[0], lat: a.coordinates[1] });
  }
}
rows.sort((x,y) => y.off - x.off);
for (const r of rows) console.log(String(r.off).padStart(6), 'm ', 'stage ' + String(r.stage).padStart(2), r.side.padEnd(5), r.name, '[' + r.lon + ',' + r.lat + ']');
console.log('---'); console.log('beyond SNAP_METERS (500):', rows.filter(r => r.off > 500).length, 'of', rows.length);
"
```

Anchors within `SNAP_METERS` (500 m) will snap and are fine. Anchors beyond it are the work. Record the full list in the task report — Task 6 needs it when it decides between re-pinning an anchor and re-declaring a distance.

- [ ] **Step 2: Query OSM for each far anchor's place node**

For each anchor beyond 500 m, query Overpass for the place node by name within a 5 km box around the declared coordinates:

```
[out:json][timeout:60];
(
  node["place"~"city|town|village|hamlet"]["name"="<anchor name>"](<south>,<west>,<north>,<east>);
);
out body;
```

Use `queryOverpass` from `scripts/enrich/osm.ts` rather than a bare fetch, so the shared timeout and pacing apply.

- [ ] **Step 3: Correct the anchor and record why**

Replace the coordinates with the node's, keeping the existing elevation. Add a `note` in the exact form the Camino Francés uses — this is the committed Zubiri note, and the new ones must read the same way:

```
"note": "Longitude and latitude corrected to OpenStreetMap place node/357129888 (place=village). The previous [-1.510, 42.929] sat 540 m off the walked line; this sits 160 m off it. Elevation is unchanged."
```

Every corrected anchor must name the node id, the tag that identifies it, the previous coordinates, both distances, and what happened to the elevation.

**Do not correct an anchor whose OSM node is further from the line than the declared coordinates.** Record it in the task report instead — it means the line is wrong there, not the anchor, and Task 6 will decide between re-pinning and re-declaring the distance.

- [ ] **Step 4: Verify the file still validates**

```bash
npx tsc --noEmit
npm run validate 2>&1 | tail -3
```
Expected: `Validation passed (0 warning(s))`. `stages.json` is schema-checked, so a malformed anchor fails here.

- [ ] **Step 5: Commit**

```bash
git add routes/camino-norte/stages.json
git commit -m "$(cat <<'EOF'
fix(camino-norte): stage anchors sit on their OSM place nodes

Each corrected anchor records the node it moved to and how far it was
from the walked line before and after, so the next person can check the
correction rather than trust it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Build the walked line

`route.geojson` is the route plus its variants and detours. The Camino Francés measured 994.4 km that way against 763.7 km of stages, which handed a 27 km day a 63 km geometry. The Norte has the same problem and the same cure: derive the main line from the pinned relations.

**Files:**
- Create: `routes/camino-norte/route.main.geojson`
- Modify: `routes/camino-norte/metadata.json` (provenance only, if the run reports a source it does not already list)

- [ ] **Step 1: Build it**

```bash
npm run build-main-line camino-norte
```

The four relations are already pinned, so `requireRelations` will not throw. Expect a graph over the relations' member ways, joined at exactly shared coordinates, walked by shortest connected path between consecutive stage boundaries.

- [ ] **Step 2: Check the length against the declared total**

```bash
node -e "
const fs=require('fs');
const g=JSON.parse(fs.readFileSync('routes/camino-norte/route.main.geojson','utf8'));
const line=g.features?g.features[0].geometry.coordinates:g.geometry.coordinates;
const R=6371000,r=x=>x*Math.PI/180;
let m=0;
for(let i=1;i<line.length;i++){const[a,b]=[line[i-1],line[i]];
const dLat=r(b[1]-a[1]),dLon=r(b[0]-a[0]);
const h=Math.sin(dLat/2)**2+Math.cos(r(a[1]))*Math.cos(r(b[1]))*Math.sin(dLon/2)**2;
m+=2*R*Math.asin(Math.sqrt(h));}
console.log('main line km:',(m/1000).toFixed(1),'| declared:',JSON.parse(fs.readFileSync('routes/camino-norte/metadata.json','utf8')).overview.distanceKm);
console.log('points:',line.length);
"
```

Expected: a figure near 784 km. **Halt and report** if it is under 700 or over 900 — the graph has taken a wrong branch, and cutting stages from it would be worse than cutting them from `route.geojson`.

- [ ] **Step 3: Commit**

```bash
git add routes/camino-norte/route.main.geojson routes/camino-norte/metadata.json
git commit -m "$(cat <<'EOF'
feat(camino-norte): the walked line, derived from the pinned relations

route.geojson carries the variants and the detours with it, so slicing a
stage from it measures a day nobody walks.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Clear the gate

**Files:**
- Modify: `routes/camino-norte/stages.json` (declared distances, where the line disagrees), `routes/camino-norte/ways/**` (generated)

- [ ] **Step 1: Run the build and read the report**

```bash
npm run build-ways
node -e "
const r=JSON.parse(require('fs').readFileSync('routes/camino-norte/ways/report.json','utf8'));
console.log('passed:',r.gate.passed,'| failing:',JSON.stringify(r.gate.failing));
for(const x of r.gate.reasons) console.log(' -',x);
console.log('stages emitted:',r.stages.length);
"
```

- [ ] **Step 2: Resolve each failure**

A stage fails when its measured slice differs from its declared `distanceKm` by more than `GATE_TOLERANCE` (10%), or when its boundaries stall.

- **A stall** means two anchors landed on the same vertex. The reason names both anchors and their distances off the line — re-pin the one that is further off, per Task 4's method.
- **A length mismatch** means the guidebook figure and the line disagree. Per spec §5 step 3, **the measured distance wins**: update `distanceKm` to the measured slice, rounded to one decimal. Every such change is listed in the CHANGELOG in Task 9.

Do not widen `GATE_TOLERANCE`. Do not skip a stage.

- [ ] **Step 3: Re-run until the gate passes**

```bash
npm run build-ways && node -e "
const r=JSON.parse(require('fs').readFileSync('routes/camino-norte/ways/report.json','utf8'));
if(!r.gate.passed){console.error('still failing:',r.gate.failing);process.exit(1)}
console.log('gate passed,',r.stages.length,'stages');
"
```
Expected: `gate passed, 34 stages`.

- [ ] **Step 4: Confirm the route is now listed**

```bash
npm run build-index && node -e "
const i=require('./index.json');
const n=i.routes.find(r=>r.id==='camino-norte');
console.log('ways:',JSON.stringify(n.ways));
"
```
Expected: a `ways` object with `stageCount: 34`. `sparse` will still be `true` — Stage 3 fixes that.

- [ ] **Step 5: Reconcile the site surface with the new figures**

Spec §5 step 6 requires the section's site surface to stay true. `docs/routes.html` carries the Norte's card with `data-days` and `data-distance-km` attributes and a comparison-table row, all hand-authored; `check-site`'s `checkRouteFilterAttrs` and `COMPARE_ROW_PATTERN` read them. If Task 6 changed any declared distance, the route total or the day count may no longer match.

```bash
npm run check-site 2>&1 | tail -5
node -e "
const i=require('./index.json'); const n=i.routes.find(r=>r.id==='camino-norte');
console.log('index says — distanceKm:', n.distanceKm, '| stages:', n.ways ? n.ways.stageCount : 'none');
const h=require('fs').readFileSync('docs/routes.html','utf8');
const m=h.match(/<div class=\"route-card\"[^>]*data-days=\"(\d+)\"[^>]*data-distance-km=\"(\d+)\"[^>]*>(?:(?!route-card)[\s\S])*?camino-norte/);
console.log('card says   — days:', m&&m[1], '| distanceKm:', m&&m[2]);
"
```

If they disagree, update the card attributes, the card's visible stats, and the comparison-table row to match `index.json`. Do not touch the `<div class=\"route-card\"` tag's position — `findRouteCardOpenTag` locates a card by the last such tag before the route's href.

Expected: `Site is in sync with route data.` and the two lines agreeing.

- [ ] **Step 6: Commit**

```bash
git add routes/camino-norte/stages.json routes/camino-norte/ways index.json docs/routes.html
git commit -m "$(cat <<'EOF'
feat(camino-norte): 34 stages clear the gate and ship as Way files

Where the walked line and the guidebook disagreed by more than the
gate's tolerance, the line won — a walker's day is the one measured on
the ground, not the one printed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Stage 3 — The places

### Task 7: The POI fetcher reaches the moment types

`buildPoiQuery` queries drinking water, pharmacies, hostels, cafés, shops, toilets, bus stops and stations. `OSM_TAG_MAP` maps those to `water_source`, `medical`, `accommodation`, `food`, `supply` and `transport`. **Not one `MOMENT_TYPES` value can be produced by either.** That is why every one of the Norte's 3,634 waypoints is a service, and why no route can stop being `sparse` without this change.

**Files:**
- Modify: `scripts/enrich/osm.ts`, `schema/waypoints.schema.json`
- Test: `scripts/enrich/osm.test.ts`

**Interfaces:**
- Produces: `classifyNode` returns `sacred_site`, `cultural_site`, `viewpoint` and `town` for the tags below; `buildPoiQuery` requests them.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/enrich/osm.test.ts`:

```ts
test("the POI query asks for the places a walk is remembered by", () => {
  const q = buildPoiQuery([-2, 43, -1, 44]);
  // #then every moment type has at least one tag that can produce it
  assert.match(q, /amenity"="place_of_worship/);
  assert.match(q, /historic"="monastery/);
  assert.match(q, /tourism"="viewpoint/);
  assert.match(q, /place"~"city\|town\|village/);
});

test("a church classifies as a sacred site, not as nothing", () => {
  assert.deepEqual(
    classifyNode({ id: 1, lat: 43, lon: -2, tags: { amenity: "place_of_worship", religion: "christian" } }),
    { type: "sacred_site", subtype: "church" },
  );
});

test("a viewpoint and a village classify to their own types", () => {
  assert.deepEqual(
    classifyNode({ id: 2, lat: 43, lon: -2, tags: { tourism: "viewpoint" } }),
    { type: "viewpoint", subtype: "viewpoint" },
  );
  assert.deepEqual(
    classifyNode({ id: 3, lat: 43, lon: -2, tags: { place: "village" } }),
    { type: "town", subtype: "village" },
  );
});

test("a service tag still wins over a place tag on the same node", () => {
  // #given a node tagged both — a village with a shop record on it
  const n = { id: 4, lat: 43, lon: -2, tags: { shop: "convenience", place: "village" } };
  // #then the service classification is unchanged, so no existing waypoint moves type
  assert.deepEqual(classifyNode(n), { type: "supply", subtype: "convenience_store" });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
node --import tsx --test scripts/enrich/osm.test.ts 2>&1 | tail -8
```
Expected: four failures — the query lacks the tags, and `classifyNode` returns `null` for all three.

- [ ] **Step 3: Extend the query and the map**

In `scripts/enrich/osm.ts`, add to `buildPoiQuery`'s union, after the existing service lines:

```
  node["amenity"="place_of_worship"]${bb};
  node["historic"="monastery"]${bb};
  node["historic"="wayside_cross"]${bb};
  node["historic"="wayside_shrine"]${bb};
  node["historic"="ruins"]${bb};
  node["tourism"="viewpoint"]${bb};
  node["place"~"city|town|village|hamlet"]${bb};
```

Extend `OSM_TAG_MAP`. **Append these entries after the existing ones** — `classifyNode` returns the first match in insertion order, so appending is what keeps a node tagged both `shop=convenience` and `place=village` classifying as it does today:

```ts
  "amenity=place_of_worship": { type: "sacred_site", subtype: "church" },
  "historic=monastery": { type: "sacred_site", subtype: "monastery" },
  "historic=wayside_cross": { type: "sacred_site", subtype: "wayside_cross" },
  "historic=wayside_shrine": { type: "sacred_site", subtype: "wayside_shrine" },
  "historic=ruins": { type: "cultural_site", subtype: "ruins" },
  "tourism=viewpoint": { type: "viewpoint", subtype: "viewpoint" },
  "place=city": { type: "town", subtype: "city" },
  "place=town": { type: "town", subtype: "town" },
  "place=village": { type: "town", subtype: "village" },
  "place=hamlet": { type: "town", subtype: "hamlet" },
```

- [ ] **Step 4: Declare `source` and `osmId` in the schema**

Spec §5.1 requires curated places to carry both. `additionalProperties` is `true` on `WaypointFeature.properties.properties`, so they validate today undeclared — declaring them is what makes them a contract PRs C and D inherit. Add to that object's `properties`:

```json
"source": { "type": "string", "enum": ["osm", "curated"] },
"osmId": { "type": "string", "pattern": "^node/[0-9]+$" }
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
npx tsc --noEmit && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
```
Expected: `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add scripts/enrich/osm.ts scripts/enrich/osm.test.ts schema/waypoints.schema.json
git commit -m "$(cat <<'EOF'
feat(osm): the fetcher can see the places a walk is remembered by

It asked only for water, beds and bus stops, so no route could carry a
sacred site, a viewpoint or a village however long anyone curated it —
which is why every route's card says "few places marked yet".

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Curate the Norte's places

**Files:**
- Modify: `routes/camino-norte/waypoints.geojson`, `routes/camino-norte/ways/**`, `index.json`

- [ ] **Step 1: Fetch**

```bash
npm run fetch -- camino-norte --force
```

- [ ] **Step 2: Select, do not dump**

The fetch returns far more than belongs on a card. Keep a candidate only when **all** hold:

- Its type is one of `sacred_site`, `cultural_site`, `viewpoint`, `town`.
- It has a real `name` — not `Unnamed`.
- It lies within `MOMENT_DROP_METERS` (300 m) of `route.main.geojson`. Further is a detour, and `marks.ts` drops it anyway.
- It is more than `PLACE_MATCH_METERS` (150 m) from its stage's own start and end, or it counts as that place rather than as something passed.

Target **2–3 per stage**, and never more than 4. Prefer, in order: a named church, monastery or hermitage on the day's path; a viewpoint at a pass or a headland; a village between the day's ends.

Each kept feature takes the committed shape — this is the Roncesvalles feature, and the new ones must match it field for field, plus the two the spec requires:

```json
{
  "type": "Feature",
  "id": "wp-<kebab-slug>",
  "geometry": { "type": "Point", "coordinates": [-1.319, 43.01, 945] },
  "properties": {
    "routeId": "camino-norte",
    "name": "Collegiate Church of Roncesvalles",
    "nameLocalized": { "es": "Real Colegiata de Roncesvalles" },
    "type": "sacred_site",
    "subtype": "church",
    "stageIndex": 0,
    "kmFromStart": 24.2,
    "icon": "church",
    "description": "Medieval pilgrim hospital and church. Nightly pilgrim blessing at 20:00.",
    "elevation": 945,
    "source": "osm",
    "osmId": "node/357129888"
  }
}
```

`description` is one or two factual sentences from the node's own tags — what it is, and anything a walker acts on. **No invented history, no atmosphere.** A node whose tags support no honest sentence gets no `description`; that is better than a guess.

- [ ] **Step 3: Rebuild and check the coverage bar**

```bash
npm run build-ways && node -e "
const r=JSON.parse(require('fs').readFileSync('routes/camino-norte/ways/report.json','utf8'));
const p=r.places;
console.log('stages with a place beyond their ends:',p.stagesWithMomentBeyondEnds,'of',r.stages.length);
console.log('half:',p.halfOfStages,'| sparse:',p.sparse,'| per stage:',p.placesPerStage);
if(p.sparse){console.error('still sparse — needs',p.halfOfStages-p.stagesWithMomentBeyondEnds,'more stages covered');process.exit(1)}
"
```
Expected: `sparse: false`, with at least 17 of 34 stages covered.

- [ ] **Step 4: Confirm nothing was dropped for being off the line**

```bash
node -e "
const r=JSON.parse(require('fs').readFileSync('routes/camino-norte/ways/report.json','utf8'));
const dropped=r.stages.flatMap(s=>s.dropped||[]);
console.log('dropped:',dropped.length);
dropped.slice(0,10).forEach(d=>console.log(' -',d));
"
```
A short list is fine. A long one means the selection ignored the 300 m rule — go back to Step 2 rather than leaving them in.

- [ ] **Step 5: Regenerate the site and commit**

```bash
npm run build-index && npm run build-assets && npm run validate 2>&1 | tail -2 && npm run check-site 2>&1 | tail -1
git add routes/camino-norte/waypoints.geojson routes/camino-norte/ways index.json docs
git commit -m "$(cat <<'EOF'
feat(camino-norte): places worth stopping at, so the card stops apologising

Two or three per stage, each within 300 m of the walked line and each
carrying the OSM node it came from, so a walker sees what the day passes
rather than only where to sleep and drink.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Stage 4 — Release

### Task 9: Ship 1.7.1

**Files:**
- Modify: `package.json`, `CHANGELOG.md`, `README.md`, `index.json` (regenerated)

- [ ] **Step 1: Bump and regenerate, in that order**

`index.json`'s `release` is generated from `package.json`'s version, so it is wrong until the index is rebuilt after the bump.

```bash
npm version 1.7.1 --no-git-tag-version
npm run build-ways && npm run build-index
grep '"release"' index.json
```
Expected: `"release": "v1.7.1"`. If it still says `v1.7.0`, the bump did not land — fix that before going on.

- [ ] **Step 2: Update the README stats**

```bash
npm run stats
```

Apply the figures it prints to `README.md`'s stats block and the Camino del Norte row, per Phase 3 of `.claude/commands/release.md`.

- [ ] **Step 3: Write the changelog entry**

Under a new `## [1.7.1] — <today>` heading above `[1.7.0]`, in the project's voice — plain, consumer-facing, no bullet for internal refactors. It must name:

- the walked line and why `route.geojson` could not serve;
- every stage whose `distanceKm` changed, with the old and new figures and the fact that the measured line won;
- every anchor that moved, with its OSM node;
- that the route now ships a `ways` package and is no longer `sparse`;
- that the POI fetcher now returns sacred sites, cultural sites, viewpoints and settlements, which is why places exist at all.

- [ ] **Step 4: Verify everything together**

```bash
npx tsc --noEmit
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
npm run build-ways && npm run build-index && npm run validate 2>&1 | tail -2
npm run build-assets && npm run check-site 2>&1 | tail -1
npm run check-drafted-diff -- main
git status --porcelain --untracked-files=all
```
Expected: `ℹ fail 0`; `Validation passed (0 warning(s))`; `Site is in sync with route data.`; `Every cleared drafted flag has a recorded review.`; `git status` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json CHANGELOG.md README.md index.json routes docs
git commit -m "$(cat <<'EOF'
chore(release): 1.7.1 — the Camino del Norte can be walked from the data

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Done when

- `npm test`, `npx tsc --noEmit`, `npm run validate`, `npm run check-site` and `npm run check-drafted-diff -- main` are all clean.
- A full pipeline rebuild leaves `routes/`, `index.json` and `docs/` unchanged.
- `routes/camino-norte/ways/report.json` has `gate.passed: true` with 34 stages and `places.sparse: false`.
- `index.json` gives `camino-norte` a `ways` entry with `stageCount: 34`, and `release: v1.7.1`.
- Every corrected anchor carries a `note` naming its OSM node and both distances.
- No `interior` block anywhere in the repo differs from `main`.
- `routes/camino-frances/**` is byte-identical to `main` apart from anything the Task 7 fetcher change legitimately regenerates — and if that is non-empty, the CHANGELOG says so.

## What this plan does not do

- **It drafts no text.** Spec §5.1: the Norte's stage text exists and is kept. The drafted-gate work in Task 1 is built here because PR C is the first PR that will draft anything, and the check has to exist before the PR it polices.
- **It does not re-fetch the other six routes.** Task 7 widens the POI query for every route, but only `camino-norte` is re-fetched. The others gain their places in their own PRs, so each change is reviewable against the route it affects.
- **It does not touch the Kumano or Shikoku directories.** Those are PRs C and D, and both need renames this plan is not allowed to make.
- **It does not tag or publish.** The tag follows the merge, immediately, per `.claude/commands/release.md` Phase 2b — but the merge is the human's call.
