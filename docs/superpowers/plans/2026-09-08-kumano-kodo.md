# Kumano Kodō Implementation Plan (PR C, release 1.8.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Kumano Kodō becomes a pilgrimage of four sections — two that ship walkable packages, two that ship honestly empty and wait for OpenStreetMap.

**Architecture:** Four movements. The tools are sharpened first, closing the follow-ups PR B deferred, because two of them stop being latent the moment a second content PR exists. Then the rename: `kumano-kodo` stops being a route id and becomes a pilgrimage id, which requires moving a hand-authored page out of the way before a generator refuses to overwrite it. Then the two sections whose OSM relations are continuous are cut and gated. Then the two that are not ship metadata-only with `ways: null`, which the spec explicitly permits rather than holding the release open.

**Tech Stack:** TypeScript run under `tsx`, `node:test` + `node:assert/strict`, Ajv against `schema/*.json`, Overpass via `scripts/enrich/osm.ts`. No new runtime dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-05-pilgrimages-and-sections-design.md`. Where plan and spec disagree, the spec wins. §5.2 governs this pilgrimage; §4.3 governs a section that cannot be cut.
- Branch `feat/kumano-kodo`, worktree `.worktrees/kumano`. Never commit to `main`; never use `git stash` — the stash stack is shared across worktrees.
- Every commit message ends with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Comments explain why, never what. Test comments use `// #given` / `// #when` / `// #then`.
- `npm test` green and `npx tsc --noEmit` clean before every commit.
- Committed `routes/`, `index.json` and `docs/` must equal what the generators emit. CI fails on drift, including untracked files under `docs/`.
- Green beats scope: when a change turns an earlier test red, fix the cause in the same task, never the assertion.
- Release is **1.8.0**. `v1.7.1` is tagged and published; jsDelivr caches tag URLs permanently, so the tag must follow the merge immediately (`.claude/commands/release.md` Phase 2b).
- **This PR drafts text.** It is the first to do so, which makes it the first real exercise of the drafted-text gate PR B built. Drafted stage text carries `"drafted": true` and cannot merge; clearing the flag needs a ticked line in `docs/review/<section-id>.md`, or the section-qualified form in `docs/review/kumano-kodo.md`.

## Constants and facts this plan depends on

Measured, not remembered. Re-derive anything you intend to rely on.

| Fact | Value | Source |
|---|---|---|
| `SNAP_METERS` | 500 | `scripts/ways/geo.ts` |
| `GATE_TOLERANCE` | 0.1 | `scripts/ways/geo.ts` |
| `MOMENT_DROP_METERS` | 300 | `scripts/ways/moments.ts` |
| `BUFFER_KM` | 0.3 | `scripts/enrich/waypoints.ts` |
| `OFF_LINE_TOLERANCE_METERS` | 50 | `scripts/ways/geo.ts` |
| `sparse` | `stagesWithMomentBeyondEnds < ceil(stageCount / 2)` | `scripts/ways/catalog.ts` |

### What the OSM research established

Verified live against Overpass before this plan was written; the full report is `.superpowers/sdd/kumano-osm-research.md`.

| Section | Relations | Ways | Length | Continuity | Verdict |
|---|---|---|---|---|---|
| **Nakahechi** | 17094646, 17095001, 17097762, 17097854, 17130940, 17130941 | 337 | 83.8 km all six, 35.9 km main | one component, exactly two dangling ends | **cut it** |
| **Kohechi** | 17131166 **+ 17094646** | 99 | 64.37 km with both pinned | one component | **cut it** |
| **Iseji** | 19693803 | **2** | **2.06 km of a 170 km route**, two components 22.3 km apart | broken | **`ways: null`** |
| **Ōhechi** | **none exists** | — | 0.58 km of loose ways in Tanabe | n/a | **`ways: null`** |

Iseji's relation is unambiguously the right one — `wikidata=Q11379141`, `wikipedia=ja:伊勢路 (熊野古道)`, Mie Prefecture's own Kumano Kodō site. It is nearly empty upstream. Record the id even while shipping `ways: null`, so the next attempt starts from a confirmed fact rather than repeating this research.

**The Kohechi pins a Nakahechi relation deliberately.** 17131166 stops 1.9 km short of Kumano Hongū Taisha; those final metres are tagged into the Nakahechi relation because the two routes converge on the shrine. The join is a shared node at 0 m. The plan owner ruled: pin both, and record why in the metadata. Spec §4.3's "the section's trail and nothing else" yields here to the fact that a Kohechi pilgrim does arrive at the shrine.

### What the Nakahechi's own numbers say

Measured against the derived line, three of four stages fail the gate:

| Stage | Declared | Measured | Ratio |
|---|---|---|---|
| 0 Takijiri-ōji → Takahara | 4 | 3.25 | 0.81 |
| 1 Takahara → Chikatsuyu-ōji | 13 | 9.64 | 0.74 |
| 2 Chikatsuyu-ōji → Hosshinmon-ōji | 14 | 16.12 | 1.15 |
| 3 Hosshinmon-ōji → Hongū Taisha | 7.5 | 6.87 | 0.92 |

The measured values track the Tanabe Tourism Bureau's published figures closely, so `stages.json` is the wrong side of this comparison, not the geometry. Spec §5 step 3: the measured line wins, and the CHANGELOG says so.

The **Takahara** anchor snaps 609 m off the line while every other anchor is within 60 m. 609 exceeds `SNAP_METERS`, so it needs either a re-pin to its OSM place node or an `offLineMeters` declaration — Task 6 decides with the measurement in hand.

### The rename collides with a page

`docs/kumano-kodo.html` is 24 KB of hand-authored route page carrying **no generated marker**. Once `kumano-kodo` is a pilgrimage id, `buildPilgrimagePages` will try to write that exact path and **refuse**, by the guard at `scripts/site/build-assets.ts:221`. The hand-authored page must move to `docs/kumano-kodo-nakahechi.html` before the pilgrimage id exists. This is not a hypothetical — it is the first real firing of a guard added defensively two PRs ago.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `scripts/site/check-site.ts` | polices the km column, per-type tables, `terrainNotes` figures | 1 |
| `.github/workflows/validate.yml` | diffs the merge base, not the branch tip | 1 |
| `schema/waypoints.schema.json`, `schema/CHANGELOG.md` | `osmId` accepts way/relation; schema changes recorded | 2 |
| `scripts/enrich/waypoints.ts`, `scripts/enrich/waypoints.test.ts` | counter scope, self-deriving sweep, dead sort | 2 |
| `routes/kumano-kodo-nakahechi/**` (renamed) | the Nakahechi section | 3,4 |
| `docs/kumano-kodo-nakahechi.html` (renamed) | its detail page | 3 |
| `routes/kumano-kodo-kohechi/**` (new) | the Kohechi section | 5 |
| `routes/kumano-kodo-iseji/**`, `routes/kumano-kodo-ohechi/**` (new) | the two waiting sections | 7 |
| `docs/review/kumano-kodo.md` (new) | the drafted-text checklist | 8 |
| `package.json`, `CHANGELOG.md`, `README.md` | the 1.8.0 release | 10 |

---

## Stage 1 — Sharpen the tools

### Task 1: `check-site` polices the figures that keep going stale, and CI diffs the right ref

Three separate PR B reviews each caught a stale published figure in a file the previous audit had not opened. `check-site` pins only the README totals line, the `docs/index.html` hero stat, and the `docs/routes.html` comparison rows. The km column, the per-type waypoint tables on route detail pages, and `terrainNotes` prose are all unpoliced — and this PR is about to add four sections' worth of each.

Separately, `.github/workflows/validate.yml` fetches the base branch **tip** rather than the merge base, so a `drafted: true` flag landing on `main` after a PR branches gets blamed on that PR. Latent until two content PRs are in flight, which this PR plus PR D makes real.

**Files:**
- Modify: `scripts/site/check-site.ts`, `scripts/site/check-site.test.ts`, `.github/workflows/validate.yml`

**Interfaces:**
- Produces: three new `check-site` checks — a route's README km cell matches `index.json`'s `distanceKm`; a route detail page's per-type waypoint table sums to its own stated total; a stage's `terrainNotes` naming a distance in km agrees with that stage's `distanceKm`.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/site/check-site.test.ts`, following the file's `createFixtureRoot` + `checkSite(root, overrides)` idiom — read two neighbouring tests first:

```ts
test("a README km cell that disagrees with the index is reported", () => {
  // #given a route the index says is 788 km and the README says is 784
  const root = createFixtureRoot({ readme: readmeWithKm(784), indexKm: 788 });
  // #when the site is checked
  const problems = checkSite(root);
  // #then the mismatch is named, with both figures
  assert.ok(problems.some((p) => /README/.test(p) && /784/.test(p) && /788/.test(p)));
});

test("a per-type waypoint table that does not sum to its own total is reported", () => {
  // #given a detail page whose rows total 100 under a stated total of 154
  const root = createFixtureRoot({ detailPageTable: { rows: 100, total: 154 } });
  const problems = checkSite(root);
  // #then the gap is named — this is how 35 viewpoints went missing before
  assert.ok(problems.some((p) => /100/.test(p) && /154/.test(p)));
});

test("terrainNotes naming a distance that contradicts the stage is reported", () => {
  // #given a stage of 18.6 km whose notes say the day is 15.3 km
  const root = createFixtureRoot({ stageKm: 18.6, terrainNotesKm: 15.3 });
  const problems = checkSite(root);
  assert.ok(problems.some((p) => /terrainNotes/.test(p) && /15\.3/.test(p)));
});
```

Extend `createFixtureRoot`'s overrides to carry `readme`, `indexKm`, `detailPageTable`, `stageKm` and `terrainNotesKm`. If the existing helper does not take overrides in that shape, follow whatever shape it does take and say so in your report.

- [ ] **Step 2: Run them and watch them fail**

```bash
node --import tsx --test scripts/site/check-site.test.ts 2>&1 | grep -E "^ℹ (tests|pass|fail)"
```
Expected: three failures — no such checks exist.

- [ ] **Step 3: Add the three checks**

Follow the file's established shape: a loop per check, `add(file, message)`, a message naming what to change rather than only what is wrong. The `terrainNotes` check must only fire when the prose actually names a km figure — prose with no number is not a mismatch. Extract the figure with a narrow pattern and say in a comment why a loose one would produce false positives on elevations and altitudes.

- [ ] **Step 4: Fix the merge-base fetch**

In `.github/workflows/validate.yml`, the drafted-text step currently fetches the base branch tip. Fetch enough history to compute the merge base and diff against that instead, so a flag that landed on `main` after this branch forked is not attributed to this PR. Say in your report which ref you ended up passing and why it is the merge base and not the tip.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
npm run check-site 2>&1 | tail -3
```

`check-site` must still pass on the real tree — if any of the three new checks fires on committed data, that is a real stale figure and you should fix the figure, not weaken the check. Report it either way.

```bash
git add scripts/site/check-site.ts scripts/site/check-site.test.ts .github/workflows/validate.yml
git commit -m "$(cat <<'EOF'
feat(check-site): the figures that kept going stale are now checked

Three reviews each found a wrong number in a file the last audit had
not opened — a km column, a per-type table missing 35 rows, a stage's
notes describing a distance it no longer had. Four sections arrive in
this PR, each with all three.

And the drafted-text gate diffs the merge base rather than the branch
tip, so a flag landing on main after a PR forks is not that PR's fault.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The enricher's remaining sharp edges

Four small items PR B's whole-branch review triaged as follow-ups, plus one that stops being cosmetic here: `osmId`'s pattern is `^node/[0-9]+$`, and the Kumano's ōji shrines may well be mapped as ways rather than nodes.

**Files:**
- Modify: `scripts/enrich/waypoints.ts`, `scripts/enrich/waypoints.test.ts`, `schema/waypoints.schema.json`, `schema/CHANGELOG.md`

- [ ] **Step 1: Write the failing tests**

```ts
test("the sweep follows OSM_TAG_MAP rather than a hand-written list", () => {
  // #given every distinct type the tag map can produce
  const produced = new Set(Object.values(OSM_TAG_MAP).map((c) => c.type));
  // #then the fixture covers exactly those, so a new type cannot slip out silently
  assert.deepEqual(new Set(Object.keys(TYPE_FIXTURES)), produced);
});

test("a waypoint sourced from an OSM way validates", () => {
  // #given a place mapped as a way, which ōji shrines and temple precincts often are
  const feature = { properties: { routeId: "r", name: "n", type: "sacred_site", source: "osm", osmId: "way/12345" } };
  // #then the schema accepts it — the node-only pattern would have refused
  assert.equal(validateWaypoint(feature), true);
});
```

Write `TYPE_FIXTURES` as the existing hand-maintained fixture map, renamed so the first test can reach it. For the second, use whatever the file's existing schema-validation helper is; if there is none, validate with Ajv against `schema/waypoints.schema.json` directly.

- [ ] **Step 2: Run them and watch them fail**

```bash
node --import tsx --test scripts/enrich/waypoints.test.ts 2>&1 | tail -8
```
Expected: the sweep test fails only if the fixture has drifted (it may pass — say so); the way-sourced test fails on the `^node/` pattern.

- [ ] **Step 3: Apply the five fixes**

1. `schema/waypoints.schema.json` — widen `osmId` to `^(node|way|relation)/[0-9]+$`.
2. `scripts/enrich/waypoints.ts` — move the "place with no name" counter so it counts the same population as its siblings. It currently increments before the distance filter and so counts bbox-wide, overstating the name filter roughly tenfold in the console summary.
3. `scripts/enrich/waypoints.ts` — delete the first of the two sorts on `newWaypoints`; the concatenation is re-sorted with the same comparator immediately after, and both sorts are stable, so the first cannot change the result.
4. `scripts/enrich/waypoints.test.ts` — derive the type sweep from `OSM_TAG_MAP` as the test above requires.
5. `schema/CHANGELOG.md` — record `offLineMeters`, `source`, `osmId` and the widened pattern under its unreleased heading, and `pilgrimages[]` and the `pilgrimage` block, which PR A never recorded.

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)" && npm run validate 2>&1 | tail -2
```

```bash
git add scripts/enrich/waypoints.ts scripts/enrich/waypoints.test.ts schema/waypoints.schema.json schema/CHANGELOG.md
git commit -m "$(cat <<'EOF'
fix(enrich): a place may be a way, and the counters count what they claim

The osmId pattern admitted only nodes, which would have refused the
Kumano's oji shrines the moment one is mapped as a way. The skipped
counter measured a different population from its siblings, and one of
two identical sorts was dead.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Stage 2 — The rename

### Task 3: `kumano-kodo` stops being a route

The pilgrimage takes the id `kumano-kodo`; the section that holds today's four stages becomes `kumano-kodo-nakahechi`. Spec §2.1 governs. Nothing may be lost in the move, and the hand-authored page must go first.

**Files:**
- Rename: `routes/kumano-kodo/` → `routes/kumano-kodo-nakahechi/`, `docs/kumano-kodo.html` → `docs/kumano-kodo-nakahechi.html`
- Modify: the renamed `metadata.json` (`id`), `README.md`, `docs/routes.html`, `docs/index.html`, any page linking the old id

- [ ] **Step 1: Move the page first, and say why in the commit**

```bash
git mv docs/kumano-kodo.html docs/kumano-kodo-nakahechi.html
```

`buildPilgrimagePages` refuses to overwrite a page carrying no generated marker (`scripts/site/build-assets.ts:221`). If the route directory is renamed while the hand-authored page still occupies `docs/kumano-kodo.html`, the generator will refuse and the build will fail — correctly, but confusingly. Moving the page first makes the sequence obvious to the next reader.

- [ ] **Step 2: Rename the route directory and its id**

```bash
git mv routes/kumano-kodo routes/kumano-kodo-nakahechi
```

Set `id` to `kumano-kodo-nakahechi` in the renamed `metadata.json`. Leave `variants/iseji` and `variants/kohechi` where they are for now — Task 7 promotes them, and moving them here would mix two changes in one diff.

- [ ] **Step 3: Follow every reference**

```bash
grep -rn "kumano-kodo" --include=*.html --include=*.md --include=*.json --include=*.ts . \
  | grep -v node_modules | grep -v "^./routes/kumano-kodo-nakahechi/" | grep -v .superpowers
```

Every hit is either a reference that must become `kumano-kodo-nakahechi`, or a genuine reference to the pilgrimage that Task 8 will create, or a historical CHANGELOG entry that must **not** change. Decide each one and list your decisions in your report. The `waypoints.geojson` features each carry `routeId`, and `route.geojson`'s features carry `routeId` and `segment` — those are data and must follow the rename.

- [ ] **Step 4: Rebuild and verify nothing was lost**

```bash
npm run build-ways && npm run build-index && npm run build-assets
npm run validate 2>&1 | tail -3
npm run check-site 2>&1 | tail -3
node -e "
const i=require('./index.json');
const r=i.routes.find(x=>x.id==='kumano-kodo-nakahechi');
console.log('found:', !!r, '| km:', r&&r.distanceKm, '| ways:', JSON.stringify(r&&r.ways));
console.log('old id still present:', i.routes.some(x=>x.id==='kumano-kodo'));
"
```

Expected: the section is present under its new id, the old id is gone, `validate` and `check-site` pass. The route still has no `ways` package — Task 4 cuts it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(kumano): the route becomes a section, so the pilgrimage can have the name

kumano-kodo is about to name the pilgrimage that holds all four routes,
so the one that holds today's four stages becomes
kumano-kodo-nakahechi. Its hand-authored page moves first: the
generator refuses to write over a page it did not create, which is
exactly what it would have found sitting at docs/kumano-kodo.html.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The Nakahechi's walked line

**Files:**
- Modify: `routes/kumano-kodo-nakahechi/metadata.json` (pin `osm.relations`)
- Create: `routes/kumano-kodo-nakahechi/route.main.geojson`

- [ ] **Step 1: Pin the six relations**

In `metadata.json`, set:

```json
"osm": { "relations": [17094646, 17095001, 17097762, 17097854, 17130940, 17130941] }
```

These were verified live: 337 member ways, one connected component with exactly two dangling ends. Add a `note` recording that the six together reach Nachi, not only Hongū, so a later PR extending the section past its four stages knows the geometry is already there.

- [ ] **Step 2: Build the line**

```bash
npm run build-main-line kumano-kodo-nakahechi
```

- [ ] **Step 3: Check its length**

```bash
node --import tsx -e "
import { readFileSync } from 'fs';
import { walkedLine } from './scripts/ways/geo.ts';
import { haversineMeters } from './scripts/ways/geo.ts';
const line = walkedLine(JSON.parse(readFileSync('routes/kumano-kodo-nakahechi/route.main.geojson','utf8')));
let m = 0; for (let i = 1; i < line.length; i++) m += haversineMeters(line[i-1], line[i]);
console.log('main line km:', (m/1000).toFixed(2), '| points:', line.length);
"
```

Expected: near 35.9 km, the figure the research measured for the main relation between the section's own endpoints. **Halt and report** if it is under 30 or over 90 — 83.8 km would mean the line is following all six relations to Nachi rather than the four stages' span, which is a different section than this task is cutting.

- [ ] **Step 4: Commit**

```bash
git add routes/kumano-kodo-nakahechi/metadata.json routes/kumano-kodo-nakahechi/route.main.geojson
git commit -m "$(cat <<'EOF'
feat(nakahechi): the walked line, from six pinned relations

route.geojson carries all six sub-routes at once, so a stage sliced
from it measures a walk nobody takes in a day.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The Nakahechi clears its gate

Three of four stages fail today, and the measured figures track the Tanabe Tourism Bureau's published distances — so the declarations are the wrong side of the comparison.

**Files:**
- Modify: `routes/kumano-kodo-nakahechi/stages.json`, `routes/kumano-kodo-nakahechi/ways/**`

- [ ] **Step 1: Build and read the gate**

```bash
npm run build-ways && node -e "
const r=JSON.parse(require('fs').readFileSync('routes/kumano-kodo-nakahechi/ways/report.json','utf8'));
console.log('passed:',r.gate.passed,'| failing:',JSON.stringify(r.gate.failing));
r.stages.forEach(s=>console.log(' stage',s.index,'sliceKm',s.sliceKm,'declared',s.distanceKm,'ratio',s.ratio,'mode',s.boundaryMode));
for(const x of r.gate.reasons) console.log(' -',x);
"
```

- [ ] **Step 2: Deal with Takahara**

The Takahara anchor sits 609 m off the line where every other anchor is within 60 m — beyond `SNAP_METERS`, so it will fall to the proportional fallback and drag the stages either side of it.

Query OSM for the place node, exactly as the Camino del Norte's anchors were checked:

```
[out:json][timeout:60];
node["place"~"^(city|town|village|hamlet)$"]["name"~"高原|Takahara"](33.75,135.45,33.95,135.65);
out body;
```

Then apply the same rule the Norte used: **move the anchor only if the OSM node is closer to the line than the declared coordinates.** If it is not, the village genuinely sits off the trail and the anchor declares `offLineMeters` instead, with a `note` in the established form. Record both distances either way.

- [ ] **Step 3: Let the line win on the distances**

For every stage still failing on length alone, set `distanceKm` to the measured slice rounded to one decimal — spec §5 step 3. List every change with both figures in your report; Task 10's CHANGELOG needs them.

Do **not** paper over a stall or a boundary that will not advance with a distance change. If one appears, stop and report: that is a geometry problem and this task may not move an anchor except by the rule in Step 2.

- [ ] **Step 4: Re-run until the gate passes**

```bash
npm run build-ways && node -e "
const r=JSON.parse(require('fs').readFileSync('routes/kumano-kodo-nakahechi/ways/report.json','utf8'));
if(!r.gate.passed){console.error('still failing:',r.gate.failing);process.exit(1)}
console.log('gate passed,',r.stages.length,'stages | places:',JSON.stringify(r.places));
"
```

Note whether `sparse` is already false — this route carries 18 `sacred_site` and 2 `town` waypoints today, unlike the Norte, so it may clear the bar without re-enrichment. If it does, say so and do not enrich; if it does not, Task 9 handles it.

- [ ] **Step 5: Reconcile the site surface and commit**

`overview.distanceKm` must equal the rounded stage sum, as it does for every linear route in the repo. Update `README.md`, `docs/routes.html` and `docs/kumano-kodo-nakahechi.html` for any figure that moved — and note that Task 1 made `check-site` police the km column and the per-type tables, so it will now tell you.

```bash
npm run build-index && npm run build-assets && npm run validate 2>&1 | tail -2 && npm run check-site 2>&1 | tail -2
git add -A
git commit -m "$(cat <<'EOF'
feat(nakahechi): four stages clear the gate on the measured line

Three of the four declared distances were a guidebook's; the walked
line disagreed with all three and agrees with the Tanabe Tourism
Bureau's own figures, so the line wins.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Stage 3 — The Kohechi

### Task 6: A section of its own

Kōyasan → Hongū Taisha, ~70 km declared, four stages at the traditional overnight villages. Its metadata exists today as `routes/kumano-kodo/variants/kohechi/metadata.json` and holds nothing but a name and a distance.

**Files:**
- Create: `routes/kumano-kodo-kohechi/{metadata.json,stages.json,route.main.geojson,ways/**}`
- Delete: `routes/kumano-kodo-nakahechi/variants/kohechi/`

- [ ] **Step 1: Promote the variant into a section**

```bash
git mv routes/kumano-kodo-nakahechi/variants/kohechi routes/kumano-kodo-kohechi
```

Set `id` to `kumano-kodo-kohechi`. A variant carries less than a section needs — read `schema/pilgrimage.schema.json` for what a section's `metadata.json` requires, and read `routes/camino-primitivo/metadata.json` as a worked example of a short linear route.

- [ ] **Step 2: Pin both relations, and record why**

```json
"osm": { "relations": [17131166, 17094646] }
```

17131166 is the Kohechi. 17094646 is a **Nakahechi** relation, pinned deliberately: the Kohechi's own relation stops 1.9 km short of Kumano Hongū Taisha, and the final approach is tagged into the Nakahechi because the two routes converge there. The join is a shared node at 0 m, and the pair yields a connected 64.37 km path. Put that reasoning in a `note` on the `osm` block — a bare second id looks like a mistake to anyone who has not read this plan.

- [ ] **Step 3: Write the four stages**

Kōyasan → Ōmata → Miura-guchi → Totsukawa Onsen → Hongū Taisha are the traditional overnight stops. Anchor each to its OSM place node, following Task 5 Step 2's rule and note format. Distances come from the measured line — this section has no guidebook figure in the repo to defer to, so measure first and declare what you measured.

Each stage takes the shape every other stage in the repo has. Read `routes/camino-primitivo/stages.json` for a complete worked example; the required fields are enforced by `schema/stages.schema.json`, and `interior.reflection` is required. The anchor and drafted-flag shape:

```json
{
  "index": 0,
  "name": { "en": "Kōyasan to Ōmata", "ja": "高野山から大股" },
  "start": {
    "name": { "en": "Kōyasan", "ja": "高野山" },
    "coordinates": [135.5847, 34.2131, 815],
    "note": "Pinned to OpenStreetMap place node/<id> (place=town)."
  },
  "end": { "name": { "en": "Ōmata", "ja": "大股" }, "coordinates": [135.66, 34.11, 655] },
  "distanceKm": 15.8,
  "drafted": true,
  "interior": { "theme": { "en": "…" }, "reflection": { "en": "…" } }
}
```

`interior` text for these stages is **drafted** and carries `"drafted": true`. Write it facts-only per spec §6: what the day crosses, where it climbs, what stands along it. **No invented history and no atmosphere.** A day you cannot describe from the geometry and the waypoints gets a shorter entry, not a richer one. Coordinates above are illustrative — measure and pin your own.

- [ ] **Step 4: Build and gate**

```bash
npm run build-main-line kumano-kodo-kohechi
npm run build-ways && node -e "
const r=JSON.parse(require('fs').readFileSync('routes/kumano-kodo-kohechi/ways/report.json','utf8'));
console.log('passed:',r.gate.passed,'| failing:',JSON.stringify(r.gate.failing));
r.stages.forEach(s=>console.log(' stage',s.index,'sliceKm',s.sliceKm,'declared',s.distanceKm,'ratio',s.ratio));
"
```

Expected: a line near 64.37 km. **Halt and report** if it comes out near 62.19 — that is the Kohechi relation alone, meaning the second relation did not take.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(kohechi): the mountain route becomes a section of its own

Its relation stops 1.9 km short of the shrine it ends at, because the
last approach is tagged into the Nakahechi where the two routes meet.
Pinning both is what makes the walk the pilgrim actually takes.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Stage 4 — The two that wait, and the pilgrimage

### Task 7: Iseji and Ōhechi ship honestly empty

Spec §4.3: a section whose relation is absent, or whose way graph is discontinuous, ships metadata-only with `ways: null` and moves to a later release rather than holding this one open.

**Files:**
- Create: `routes/kumano-kodo-iseji/metadata.json`, `routes/kumano-kodo-ohechi/metadata.json`
- Delete: `routes/kumano-kodo-nakahechi/variants/iseji/`

- [ ] **Step 1: Promote Iseji, and record the relation that is not ready**

```bash
git mv routes/kumano-kodo-nakahechi/variants/iseji routes/kumano-kodo-iseji
```

Set `id` to `kumano-kodo-iseji`. Pin `"osm": { "relations": [19693803] }` **even though the section ships `ways: null`** — the id is confirmed (`wikidata=Q11379141`, `wikipedia=ja:伊勢路 (熊野古道)`, Mie Prefecture's own site), and recording it means the next attempt starts from a fact rather than repeating a day of research.

Add a `note` on the `osm` block saying what is actually wrong: the relation holds two ways totalling 2.06 km of a 170 km route, in two components 22.3 km apart. That is an upstream OpenStreetMap gap, not a wrong id.

- [ ] **Step 2: Create Ōhechi**

There is no relation to pin. A sweep of the entire Tanabe → Kushimoto → Nachi corridor returned only Nakahechi and Kohechi relations; the trail exists in OSM as 0.58 km of loose named ways clustered in Tanabe.

Write `metadata.json` with `osm: { relations: [] }` and a `note` saying so plainly. Do not invent a relation id and do not pin a neighbouring route's.

- [ ] **Step 3: Confirm both validate as metadata-only**

```bash
npm run build-index && npm run validate 2>&1 | tail -3
node -e "
const i=require('./index.json');
for (const id of ['kumano-kodo-iseji','kumano-kodo-ohechi']) {
  const r=i.routes.find(x=>x.id===id);
  console.log(id, '| present:', !!r, '| ways:', r ? JSON.stringify(r.ways ?? null) : '—');
}"
```

Expected: both present, both with no `ways` entry, `validate` passing. `validatePinnedRelations` must not fire — it errors only for a section that **ships a package** without pinned relations, and these ship none.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(kumano): the Iseji and the Ohechi ship without geometry, and say why

The Iseji's relation is the right one and holds 2 km of a 170 km route.
The Ohechi has no relation at all — 0.58 km of loose ways in Tanabe and
nothing else in the corridor. Both are recorded rather than guessed at,
so the next attempt starts from a fact.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The pilgrimage, and the review checklist

**Files:**
- Modify: all four sections' `metadata.json` (the `pilgrimage` block)
- Create: `docs/review/kumano-kodo.md`, `docs/kumano-kodo.html` (generated)

- [ ] **Step 1: Declare the pilgrimage on all four sections**

Each section's `metadata.json` gains a byte-identical block except for `order`:

```json
"pilgrimage": {
  "id": "kumano-kodo",
  "name": { "en": "Kumano Kodō", "ja": "熊野古道" },
  "kind": "alternatives",
  "order": 1
}
```

`alternatives`, because the four are distinct ways to the same shrines rather than legs of one walk — a walker takes one. Orders: Nakahechi 1, Kohechi 2, Iseji 3, Ōhechi 4.

`validatePilgrimages` requires the `name` to be identical across sections and compares per key, so a differing key order is fine but a differing value is not.

- [ ] **Step 2: Write the review checklist**

`docs/review/kumano-kodo.md` is the pilgrimage-level checklist, so **every line must be section-qualified** — four sections each have a stage 0, and an unqualified tick would clear all four. The gate errors on an unqualified line in this file, which is the protection working.

One line per drafted stage, unticked:

```markdown
# Kumano Kodō — drafted text review

- [ ] kumano-kodo-kohechi stage 0
- [ ] kumano-kodo-kohechi stage 1
- [ ] kumano-kodo-kohechi stage 2
- [ ] kumano-kodo-kohechi stage 3
```

- [ ] **Step 3: Confirm the gate holds the drafted text**

```bash
npm run validate 2>&1 | tail -5
```

Expected: **errors**, naming each drafted Kohechi stage. That is correct and is the first real proof the gate works. The text cannot merge until a human reviews it and the lines are ticked — which is Step 5.

- [ ] **Step 4: Generate the pilgrimage page**

```bash
npm run build-assets && npm run check-site 2>&1 | tail -3
```

`docs/kumano-kodo.html` is now generated. It will carry the `alternatives` copy — "Each section below is its own way to the same destination" — and list four sections. Confirm the page exists, that `check-site` accepts it, and that the hand-authored page really did move to `docs/kumano-kodo-nakahechi.html` in Task 3 rather than being overwritten.

- [ ] **Step 5: Review the drafted text, then tick**

Read each drafted stage's `interior` against its geometry and waypoints. Anything you cannot support from the data comes out. Then remove `"drafted": true` from the reviewed stages **and** tick their checklist lines in the same commit — the CI check added in PR B requires the review to arrive with the clearing.

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
npm run validate 2>&1 | tail -2
npm run check-drafted-diff -- origin/main
```

Expected: `Validation passed`, and the drafted-diff check clean.

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(kumano): four ways to the same shrines, under one name

The Kumano Kodo becomes a pilgrimage of four alternatives. The Kohechi's
stage text was drafted and reviewed against its own geometry before the
flag came off; the checklist records which stages that covered.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Stage 5 — Places, site, release

### Task 9: Places, if the sections need them

The Nakahechi already carries 18 `sacred_site` and 2 `town` waypoints — it may clear the coverage bar without any enrichment. The Kohechi has none.

**Files:**
- Modify: `routes/kumano-kodo-*/waypoints.geojson`, `ways/**`, `index.json`, `docs/**`

- [ ] **Step 1: Measure before enriching**

```bash
for r in kumano-kodo-nakahechi kumano-kodo-kohechi; do
  node -e "
  const p=JSON.parse(require('fs').readFileSync('routes/$r/ways/report.json','utf8')).places;
  console.log('$r', JSON.stringify(p));"
done
```

A section already below its `halfOfStages` bar needs nothing. Enrich only what needs it.

- [ ] **Step 2: Enrich what needs it**

```bash
npm run enrich-waypoints -- <section-id>
```

The filters PR B settled apply unchanged: place types must carry a name, `hamlet` is not queried, and the corridor is `BUFFER_KM` = 0.3 to match the ways builder's drop radius. Do not re-tune them for this route without saying why — they were chosen against 800 km of Spanish coast and should be tested, not assumed, against 65 km of Japanese mountain.

Report the type breakdown. If the result is dominated by one type the way the Norte's first run was by hamlets, say so before committing rather than after.

- [ ] **Step 3: The three shrines with no stage**

Spec §5.2 says "Nachi Taisha and Hayatama Taisha get the stage indices they lack today". Exactly three waypoints have no `stageIndex`:

```bash
node -e "
const w=JSON.parse(require('fs').readFileSync('routes/kumano-kodo-nakahechi/waypoints.geojson','utf8'));
w.features.filter(f=>f.properties.stageIndex==null).forEach(f=>console.log(' -',f.properties.name,'('+f.properties.type+')'));"
```

They are Kumano Nachi Taisha, Nachi Falls and Kumano Hayatama Taisha — the two other Grand Shrines and the waterfall.

**The spec's instruction assumed four cut sections, and this release has two.** The Nakahechi's four stages end at Hongū; Nachi and Shingū lie beyond it. The sections that do reach them — the Iseji and the Ōhechi — ship without stages this release, so there is no stage for these three to belong to.

Do **not** invent one. Assigning them to the Nakahechi's stage 3 would say a walker passes Nachi Falls on the way into Hongū, which is 30 km wrong. Leave them without a `stageIndex`, and record in your report and in Task 10's CHANGELOG that they wait for the section that reaches them. `validate` passes with them unassigned today, so nothing forces the issue — which is why it needs saying out loud rather than leaving as an absence someone later reads as an oversight.

If a section that reaches Nachi *is* cut in this PR after all — because the Nakahechi was extended, or an Iseji relation turned out usable — assign them then, and say so.

- [ ] **Step 4: Rebuild, verify, commit**

```bash
npm run build-ways && npm run build-index && npm run build-assets
npm run validate 2>&1 | tail -2 && npm run check-site 2>&1 | tail -2
git status --porcelain --untracked-files=all
```

---

### Task 10: Ship 1.8.0

**Files:**
- Modify: `package.json`, `CHANGELOG.md`, `README.md`, `index.json` (regenerated)

- [ ] **Step 1: Bump, then regenerate**

```bash
npm version 1.8.0 --no-git-tag-version
npm run build-ways && npm run build-index
grep '"release"' index.json
```

Expected `"release": "v1.8.0"`. `index.json`'s `release` is generated from `package.json`, so it is wrong until the index is rebuilt **after** the bump.

- [ ] **Step 2: README stats**

```bash
npm run stats
```

Apply what it prints. Task 1 made `check-site` police the km column and the per-type tables, so run it and believe it.

- [ ] **Step 3: The changelog**

`## [1.8.0] — <today>`, above `[1.7.1]`, in the project's voice. It must name: the Kumano Kodō becoming a pilgrimage of four sections; the rename of `kumano-kodo` to `kumano-kodo-nakahechi` and that consumers pinning the old id must follow it; every declared distance that changed with both figures; that the Iseji and Ōhechi ship without geometry and exactly why; and that the Kohechi pins a Nakahechi relation for its final 1.9 km.

**A rename is the one change here that breaks a consumer.** Say it plainly and early.

Add the `[1.8.0]` link-reference definition; the convention has held for nine releases.

- [ ] **Step 4: Verify everything**

```bash
npx tsc --noEmit
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
npm run build-ways && npm run build-index && npm run validate 2>&1 | tail -2
npm run build-assets && npm run check-site 2>&1 | tail -2
npm run check-drafted-diff -- origin/main
git status --porcelain --untracked-files=all
```

Expected: `ℹ fail 0`; `Validation passed`; `Site is in sync with route data.`; the drafted gate clean; `git status` silent.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(release): 1.8.0 — the Kumano Kodo is four ways, and two of them can be walked

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Done when

- `npm test`, `npx tsc --noEmit`, `npm run validate`, `npm run check-site` and `npm run check-drafted-diff -- origin/main` are all clean.
- A full pipeline rebuild leaves `routes/`, `index.json` and `docs/` unchanged.
- `index.json` carries a `kumano-kodo` pilgrimage of kind `alternatives` with four sections and no summed distance.
- `kumano-kodo-nakahechi` and `kumano-kodo-kohechi` each have a `ways` entry with a passing gate; `kumano-kodo-iseji` and `kumano-kodo-ohechi` have none.
- No route id `kumano-kodo` remains, and `docs/kumano-kodo.html` is generated rather than hand-authored.
- Every drafted flag that came off has a ticked, section-qualified line in `docs/review/kumano-kodo.md`.
- `routes/camino-frances/**` and `routes/camino-norte/**` are byte-identical to `main`.

## What this plan does not do

- **It does not extend the Nakahechi past its four stages**, though the six pinned relations reach Nachi. Spec §5.2 says keep the four curated stages; a longer Nakahechi is its own decision with its own text to draft.
- **It does not wait for OpenStreetMap.** The Iseji and Ōhechi ship without geometry because §4.3 says a section that cannot be cut moves to a later release rather than holding this one open. Neither is abandoned: both carry what was learned.
- **It does not touch Shikoku.** That is PR D, and it is the first `legs` pilgrimage and the first `circular` one.
