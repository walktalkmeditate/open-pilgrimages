# Site Status-Drift Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `check-site` police the class of bug that drifted five times in the 1.8.0 release — a published sentence asserting a status or figure the data already knows — starting with three wrong numbers live on `main` today.

**Architecture:** Four narrow checks added to `scripts/site/check-site.ts` in the house style (a nested closure per bug, a doc comment naming the bug it exists for, anchored patterns rather than keyword lists), plus one markup convention added to `docs/contribute.html` where prose genuinely cannot carry the key. No framework, no registry, no page generation.

**Tech Stack:** TypeScript under `tsx`, `node:test` + `node:assert/strict`, no runtime dependencies.

## Why these four, and not others

Every candidate below was replayed over the ~200 commits of history that touch `docs/`, `routes/`, `README.md` and `index.json`. The counts are true positives and false positives that the check *would have produced*, and they are the reason for the ordering and for two rejected designs.

| check | historical TP | historical FP | live on `main` |
|---|---|---|---|
| Key Facts figures vs `metadata.json` | 5 distinct drifts, 92–106 commits live | **0 / 197** | **3 wrong numbers** |
| `<h2>Variants</h2>` with empty `variants[]` | 16 commits | 0 / 197 once scoped to route ids | none |
| Unqualified-plural-claim guard | 4 commits | 0 / 185 | none |
| README `###` heading vs pilgrimage | 10 commits | 6 commits of a shape we deliberately exclude | none |
| contribute need-tags | needs markup first | 4 FP of 6 name-matches without markup | none |

**Two designs are rejected on evidence, and must not be reintroduced:**

- **Keying "sibling-as-variant" on the word `variant`.** It appears legitimately 34 times across `docs/` — `camino-primitivo.html:110,168,186` (the Hospitales walking alternative), `camino-norte.html:173,177,494`, `contribute.html:58`, `routes.html:347,399-425`, and `kumano-kodo-nakahechi.html:63`, which is the page *denying* the relationship. Key on structure.
  - *As-of note, added when the check shipped.* The "34" above is a planning figure and matches no commit: measured, the word stood at **32 occurrences on 29 lines** from `b11701e` through `860a9df`, and at **36 on 31 lines** from `047a1ae`, which gave three of `contribute.html`'s asks a `data-needs` ref naming a variant. The line list above is likewise partial (`camino-primitivo` has five lines, not three). The ruling is unaffected — every occurrence is still a legitimate one, which is the whole argument for keying on structure. The census kept current lives beside the check it justifies, at `VARIANTS_SECTION_HEADING_PATTERN` in `scripts/site/check-site.ts`; read that one, not this.
- **"Page says drafted ⇒ some stage is drafted."** Produces **0 reports across 202 commits** and would not have caught the drift that motivated this plan: when `docs/index.html` said "the stage text is drafted and awaiting review", one of four stages genuinely was still drafted. The claim that was false was the *unqualified plural*, not the existence.

## Global Constraints

- Never commit to `main`. This work is on branch `feat/site-drift-gates` in `.worktrees/site-gates`.
- Commit trailer, exactly: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- Comments explain **why**, never what. Every new check carries a doc comment naming the specific bug it exists for and the false-positive shapes it was narrowed to avoid — the file's own standard is `TERRAIN_NOTES_DISTANCE_PATTERNS` at `check-site.ts:230-285`, 55 lines of comment for 4 regexes.
- No new runtime dependencies. No new abstraction layer: `checkSite` is one function (`check-site.ts:684`) with ~20 nested closures and no registry, and it stays that way.
- Never use bare `git stash` — the stash stack is shared across worktrees.
- Every task ends with `npx tsc --noEmit` clean, `npm test` green, and `npm run validate`, `npm run check-site`, `npm run check-drafted-diff -- origin/main` all passing, and `git status --porcelain --untracked-files=all` empty.
- This Node's test reporter prints `ℹ tests` / `ℹ pass` / `ℹ fail`, **not** `#`.

## What you are working inside

`scripts/site/check-site.ts`, 1,756 lines:

- `export function checkSite(root, overrides = {}): Problem[]` — `:684`. One function. A check is a nested `function check…()` closed over its scope, or an inline loop.
- `Problem` is `{ file: string; message: string }` — `:529-532`. Reported through the closure `add(file, message)` — `:686-688`. `main()` prints `${file}: ${message}` and exits 1 if any exist — `:1731-1751`.
- **Loaded once up front and available to every check** — `:690-713`: `index.json` routes via `readIndexRoutes` (`:583-616`, shape `IndexRoute` at `:576-581` — note it carries `id`, `pilgrimage?`, `distanceKm?`, `variants[]` and **not** `name`); `index.json` pilgrimages via `readIndexPilgrimages` (`:618-657`); `computeStats(root)` (`:705-706`, `scripts/stats.ts:122`) indexed by id at `:706` and by name at `:1676`; and the four page strings, each overridable through `PageOverrides` (`:534-538`).
- **Per-route JSON is re-read lazily by each check that needs it**, with its own try/catch degrading to "skip — that is `npm run validate`'s job". See `readRouteFilterOverview` (`:339`), `declaresMetadataOnly` (`:385`), `checkTerrainNotesDistance` (`:1148`), `checkInteriorJourney` (`:1238`). That is the house style; follow it rather than widening `computeStats`.
- Checks are invoked from the per-route loop (`:1390-1485`), the pilgrimage loops (`:1487-1535`), and a tail of one-shot calls (`:1537-1544`).
- **`check-site` does not know generated from hand-maintained.** `GENERATED_MARKER` (`build-assets.ts:35`) is enforced only by `pageTarget` (`build-assets.ts:211-229`). Every check below must therefore be scoped to **route ids**, never to all of `docs/*.html`, or it will fire on `docs/kumano-kodo.html` and `docs/camino-de-santiago.html`, which are generated link lists with no Key Facts table and no variants section.

Closest existing checks, to copy the shape from:

- `COMPARE_ROW_PATTERN` `:184-188` + `FIGURE_FIELDS` `:190-195` + driver `:1676-1701` — a page cell compared to data, reporting both values.
- `checkReadmeDistanceKm` `:1094-1117` + `readmeDistanceKmPattern` `:205-214` — a per-id regex over markdown, with a doc comment justifying which source it trusts.
- `checkWaypointTypeTables` `:1119-1145` — a per-detail-page table walk.
- `checkPilgrimageGrouping` `:1072-1092` + `pilgrimageGroupOf` `:454-474` + `routeGroupEnd` `:434-452` — "which heading does this row sit under", done by scanning outward from a known anchor rather than parsing HTML.
- `checkRouteFilterAttrs` `:1014-1052` + `findRouteCardOpenTag` `:424-432` — locate one route's card among identical cards, then read its attributes.

`scripts/site/check-site.test.ts`, 3,071 lines, 132 tests. Two modes:

- **Synthetic fixture root** — `createFixtureRoot(indexRoutes, indexExtras)` at `:22-34`, `mkdtempSync` into `tmpdir()`, write only the files the check needs, call `checkSite(root)`, filter, `rmSync` in a `finally`.
- **Real repo** — `checkSite(ROOT)` (`ROOT` at `:9`), usually a positive control asserting the filtered problem list is empty; or `checkSite(ROOT, { routesHtml })` to swap one page for a synthetic string.
- Representative pair to imitate: `:589-621` (fires, asserting all four parts of the message) and `:653-664` (a one-line markdown override), with the positive control at `:981-987`.
- For anything prose-shaped the convention is a three-test set — fires / does not fire on the real prose it was narrowed against / accepts the correct wording — see `:749-783`, `:785-820`, `:822-850`, then four tests built from verbatim committed corpus strings at `:852-961` with helpers at `:877-892`.

---

## Task 1: The Key Facts elevation cell, and the three wrong numbers it finds

The highest-value check and the only one with live drift. Both current errors were introduced by `1bffcda` **"data: correct elevation ranges that contradicted their own stages"** — the commit fixed `metadata.json` and left the pages. The Kumano instance had the identical cause (`00a6be9` "data: correct Kumano Kodo's elevation minimum from 50 m to 80 m", stale for 92 commits across a rename). That is empirically how every one of these drifts starts.

**Files:**
- Modify: `scripts/site/check-site.ts`, `scripts/site/check-site.test.ts`, `docs/camino-portugues.html`

**Interfaces:**
- Produces: `checkKeyFactsElevation(id: string, detailHtml: string): void` — a nested closure calling `add()`, invoked from the per-route loop near `:1443` where `checkWaypointTypeTables` is called.

- [ ] **Step 1: Learn the table's real shape before writing a pattern**

Every route detail page has `<h2>Key Facts</h2>` then `<table><caption>Overview of …</caption><tbody>` of `<tr><th scope="row">Label</th><td>…</td></tr>`, labels in fixed order: `Distance`, `Typical duration`, `Topology`, `Difficulty`, `Countries`, `Elevation range`, `Start`, `End`.

Eleven such tables exist, not ten: `docs/camino-portugues.html:336-347` carries a second one for the coastal variant, under an `<h3>` inside `<h2>Variants</h2>` rather than under a Key Facts heading. **Anchor on `<caption>Overview of …`, not on the `<h2>`**, or you miss it — and it is one of the two live bugs.

Read all eleven before writing the regex:

```bash
grep -n "Elevation range" docs/*.html
```

- [ ] **Step 2: Write the failing tests**

Three tests. Add them beside the existing detail-page table tests.

```ts
test("checkSite reports a Key Facts elevation range that disagrees with metadata", () => {
  const root = createFixtureRoot([{ id: "r", name: "R", distanceKm: 10 }]);
  try {
    writeFileSync(join(root, "routes/r/metadata.json"), JSON.stringify({
      overview: { elevationRange: { minMeters: 5, maxMeters: 410 } },
    }));
    writeFileSync(join(root, "docs/r.html"),
      `<table><caption>Overview of R</caption><tbody>` +
      `<tr><th scope="row">Elevation range</th><td>10&ndash;420 m</td></tr>` +
      `</tbody></table>`);
    const problems = checkSite(root).filter((p) => /elevation/i.test(p.message));
    equal(problems.length, 1);
    match(problems[0].message, /10/);
    match(problems[0].message, /420/);
    match(problems[0].message, /5/);
    match(problems[0].message, /410/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

```ts
test("a Key Facts elevation range that matches metadata is accepted", () => {
  // Same fixture, cell reads 5&ndash;410 m. Expect zero problems.
});
```

```ts
test("a section with elevation data but no Elevation range row is not reported", () => {
  // routes/kumano-kodo-iseji declares an elevationRange (0-647 m, with a note
  // saying it is declared rather than measured) and its page deliberately
  // carries no row. Demanding the row when data exists is the one guaranteed
  // false positive this check can produce. Fixture: metadata with an
  // elevationRange, a Key Facts table with no Elevation range row, expect none.
});
```

- [ ] **Step 3: Run them and watch the first two fail**

```bash
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
```

- [ ] **Step 4: Implement the check**

Two independently anchored patterns, because `shikoku-88` splits the cell:

- the range: `(\d[\d,]*)\s*&ndash;\s*(\d[\d,]*)\s*m` — first occurrence in the cell
- the totals: `total ascent\s+([\d,]+)\s*m,?\s*descent\s+([\d,]+)\s*m`

Do **not** write a rule over every number in the cell: `shikoku-88`'s reads `a–b m (aside); total ascent X m, descent Y m — …~18,000 m each`, and a naive scan flags `66`, `10` and `18,000`.

Compare against `routes/<id>/metadata.json`'s `overview.elevationRange.{min,max,totalAscent,totalDescent}Meters`, read by the check itself in the house style. **Key on `metadata.json`, not on `stages.json`'s per-stage high/low points** — the two agree everywhere except `shikoku-88` (metadata min 0, stages min 5), and the tables were written from metadata. Say so in the doc comment.

The row is **optional**: absent row, or absent `elevationRange`, is not a problem. Strip `,` from rendered figures before comparing.

Report both values in the message, the way `:1691-1700` does.

- [ ] **Step 5: Run the tests — they pass, and `check-site` now fails on the real tree**

```bash
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
npm run check-site
```

Expected: tests green, and `check-site` reporting **3 wrong numbers in 2 cells**, both on `docs/camino-portugues.html`.

- [ ] **Step 6: Fix the live drift**

- `docs/camino-portugues.html:68` — `10&ndash;420 m` → the figures in `routes/camino-portugues/metadata.json` (`minMeters: 5`, `maxMeters: 410`). The page's own figcaption at `:77` and the generated profile SVG's `aria-label` both already say 410 and 5.
- `docs/camino-portugues.html:344` — `0&ndash;100 m` → `routes/camino-portugues/variants/coastal/metadata.json`'s `maxMeters: 95`; the figcaption at `:351` already says 95.

Ascent and descent figures in both cells are correct — do not touch them.

- [ ] **Step 7: Add the positive control and verify**

```ts
test("no route page's Key Facts elevation disagrees with its metadata", () => {
  const problems = checkSite(ROOT).filter((p) => /elevation/i.test(p.message));
  deepEqual(problems, []);
});
```

```bash
npx tsc --noEmit && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
npm run check-site && npm run validate 2>&1 | tail -2
git status --porcelain --untracked-files=all
```

- [ ] **Step 8: Commit**

```
fix(site): the elevation cells that went stale when the data was corrected

check-site said the site was in sync while three published numbers
disagreed with the routes they describe. Both cells were correct when
written and were left behind by 1bffcda, which corrected the metadata
and not the pages.
```

---

## Task 2: The remaining Key Facts rows

Same table, same shape, seven more rows. These produced **zero reports of any kind across 197 commits**, so they catch nothing today — they are insurance against the next `data: correct …` commit, which is how every drift in this plan began.

**Files:**
- Modify: `scripts/site/check-site.ts`, `scripts/site/check-site.test.ts`
- Create: a country-name map (see Step 2)

**Interfaces:**
- Consumes: the caption-anchored table parse from Task 1 — extend it, do not write a second parser.

- [ ] **Step 1: Write one failing test per row, from the real prose**

Lift verbatim `<tr>` strings out of the committed pages, the way `:859-875` lifts corpus strings for the terrain-notes tests. The shapes, all confirmed across the eleven tables:

| Row | Source in `overview` | Shapes |
|---|---|---|
| Distance | `distanceKm` | leading `N km` or `~N km`, then free editorial prose. **Leading figure only** — cells legitimately quote sibling and alternate figures after it (`kumano-kodo-nakahechi.html:63` names both 63 and 170; `camino-ingles` reads "110–116"; `camino-norte` names "~820"). This is the rule `readmeDistanceKmPattern:205-214` already documents. |
| Typical duration | `estimatedDays.{typical,min,max}` | `N days (range a–b)` on nine pages; `a–b days (typical N)` on `kumano-kodo-iseji` and `kumano-kodo-ohechi`. Two patterns. |
| Topology | `topology` | title-cased single word |
| Difficulty | `difficulty` | title-cased single word |
| Countries | `countries` | `Spain`, `France → Spain`, `Japan`, `Portugal → Spain` |
| Start / End | `{start,end}Point.coordinates[2]` | `Name (N m)` on nine pages; `Name, N m` on two |

- [ ] **Step 2: Add the country-name map**

No ISO country-name map exists in the repo — `scripts/region.ts:9`'s `REGION_BY_COUNTRY` maps codes to continents only. Four codes appear in Key Facts: `FR`, `ES`, `PT`, `JP`. Add a minimal map beside it, covering exactly the codes the corpus uses, and make an unknown code a **skip** rather than a failure so a new country does not break CI before anyone has written its page.

- [ ] **Step 3: Implement, and check only the figure on Start/End**

The place *name* is not checkable: six of eleven paraphrase `name.en` — "Saint-Jean-Pied-de-Port, France" against `"Saint-Jean-Pied-de-Port"`, "Kōyasan" against `"Koyasan"`. Compare **only** the elevation figure, and say why in the doc comment so nobody tightens it later.

- [ ] **Step 4: Verify and commit**

All gates, plus a positive control per row asserting the real tree is clean.

```
feat(site): the rest of the Key Facts table is checked against its route
```

---

## Task 3: A Variants heading with no variants

Sixteen commits carried an `<h2>Variants</h2>` on `docs/kumano-kodo-nakahechi.html` after the Iseji moved out from under it — from `44f5543` to `b11701e`, contradicting the premise of the release that renamed the page.

**Files:**
- Modify: `scripts/site/check-site.ts`, `scripts/site/check-site.test.ts`

- [ ] **Step 1: Write the three tests**

Fires: a route page with `<h2>Variants</h2>` whose `index.json` entry has no `variants`. Does not fire: a route page with `<h2>Variants</h2>` whose entry has some — `camino-portugues` has three and `camino-ingles` one, and neither fired across 197 commits. Does not fire: a page merely containing the word "variant" in prose.

- [ ] **Step 2: Implement, scoped to route ids**

Key on the **structure** — an `<h2>Variants</h2>` (or the `<caption>` of the variants table) present while `indexRoutes`' `variants` for that id is empty — never on the word. The doc comment must list the 34 legitimate uses of "variant" the word-based version would have hit, naming `camino-primitivo.html:110,168,186`, `camino-norte.html:173,177,494`, `contribute.html:58`, `routes.html:347,399-425` and `kumano-kodo-nakahechi.html:63`, so nobody replaces it with a keyword grep.

Scope to `ids` (routes), not to every `docs/*.html`: unscoped, `docs/routes.html` fires on 115 commits.

- [ ] **Step 3: Verify and commit**

```
feat(site): a Variants heading has to have variants under it
```

---

## Task 4: Unqualified plural claims

The general rule, and the only one covering two instances. Both drifts were sentences that were true when written and became partly false: *"the stage text is drafted and awaiting review"* when three of four stages had been cleared, and *"115 waypoints … each with `kmFromStart`"* when six had none.

Replayed over history the guard produces **1 report for the drafted case (0 false positives across 185 commits)** and **3 for the `kmFromStart` case (0 across 197)**.

**Files:**
- Modify: `scripts/site/check-site.ts`, `scripts/site/check-site.test.ts`

- [ ] **Step 1: `each with kmFromStart`**

A stable idiom on seven pages — `camino-frances.html:666`, `camino-primitivo.html:293`, `camino-portugues.html:295`, `camino-norte.html:690`, `camino-ingles.html:211`, `shikoku-88.html:271`, and `kumano-kodo-kohechi.html:146` in the variant form "Each has a `stageIndex` and a `kmFromStart`".

The claim is false unless **zero** of that route's `waypoints.geojson` features lack the property. The counted form — `kumano-kodo-nakahechi.html:171`'s "all but six with `kmFromStart`" and `:172`'s "All but three carry a `stageIndex`" — is a second pattern whose number must match exactly. Both figures are correct today.

Read `waypoints.geojson` in the check, in the house style; `computeStats` reduces it to a count (`stats.ts:93`).

- [ ] **Step 2: The drafted claim, and why the obvious rule is wrong**

**Do not implement "page says drafted ⇒ some stage is drafted."** It produces 0 reports over 202 commits and misses the drift this plan exists for. The rule is: bare, unqualified drafted-language on a route's page or its `docs/index.html` card is false unless **every** stage of that route is `drafted: true`.

Scope to `docs/*.html` and `README.md` — `CHANGELOG.md`, `CLAUDE.md`, `docs/review/` and `docs/superpowers/` all use the words heavily and legitimately. Today no `docs/*.html` or `README.md` uses them at all and no stage anywhere is drafted, so the baseline is clean.

- [ ] **Step 3: Identify a route's card on `docs/index.html`**

Index cards carry **no id, no href and no `data-*`**, and there are 8 cards for 10 routes. But every card inlines the route's generated glyph path, and `checkInlinedAsset("routes", id, …)` at `:1435-1439` already proves that `d` is present and unique. So: `indexHtml.indexOf(d)`, then `lastIndexOf('<div class="route-card"')` from there. Same move as `findRouteCardOpenTag:424-432` and `routeGroupEnd:434-452`.

**Degrade silently when a route has no card** — `kumano-kodo-iseji` and `kumano-kodo-ohechi` have none, by design.

Card status prose lives in `<div class="route-status route-status-complete">` / `route-status-needs` (`docs/index.html:151, 226, 230, 245, 249`), a natural scope for the scan.

- [ ] **Step 4: Verify and commit**

The doc comment must record that the existence reading was tried and rejected, with the 0/202 figure, so it is not "simplified" back later.

```
feat(site): an unqualified plural claim has to be true of all of them
```

---

## Task 5: README grouping, and the tags on the contribute page

**Files:**
- Modify: `scripts/site/check-site.ts`, `scripts/site/check-site.test.ts`, `docs/contribute.html`

- [ ] **Step 1: README heading versus pilgrimage membership**

`README.md:11-47` is `### <heading>`, optional prose, then a pipe table whose first cell is `[Display Name](routes/<id>/)`. Three headings today: `### Camino de Santiago` and `### Kumano Kodō` — both matching `pilgrimages[].name.en` exactly, macron included — and `### Other Routes`. Track the last `###` in a linear scan; use the link pattern `\]\(routes\/([a-z0-9-]+)\/\)` that `readmeDistanceKmPattern:212` already uses, which correctly drops the coastal row at `:19` (it links `routes/camino-portugues/variants/coastal/`).

**Flag only a *wrong* heading, never a missing one.** Both real drifts were wrong-heading — four Kumano sections under "Other Routes" for 8 commits, and `shikoku-88`/`kumano-kodo` under "Camino de Santiago" for 2 — and the missing-heading shape fires on 6 historical commits where the README had a single unheaded table, which would have forced a README restructure into `75a92dd`, the unrelated commit that first added `pilgrimage` blocks to the data. Record that reasoning in the doc comment.

- [ ] **Step 2: Give the contribute tags a key**

`docs/contribute.html:52-62` — `<h2>What We Need Most</h2>` then `<div class="need-tags">` holding seven `<span class="need-tag">`. The tags name no route ids, and matching on display names gives **4 false positives against 2 true matches** on today's tree, because four of the seven are about *variants* (`a-coruna`, `espiritual`, `lisboa`) whose completeness is a different question from their parent's — "Camino Inglés from A Coruña (metadata-only stub)" matches the fully-built `Camino Inglés`, and so on.

This is the one instance where prose cannot carry the key, and the repo's own convention is an attribute read by a checker — `docs/routes.html`'s `<td data-value="1200">` read by `COMPARE_ROW_PATTERN:184-188`, and the route cards' `data-days`/`data-distance-km` read by `checkRouteFilterAttrs:1021`.

Add `data-route="<id>"` to each tag that names a specific route or section, and leave the genuinely general ones without it.

- [ ] **Step 3: Check the tags**

A tag carrying `data-route` for a route that has a `ways` block in `index.json` and does not declare `metadataOnly` (`declaresMetadataOnly:385`) is asking for work that is done. Report it.

Note `ways/report.json` is not read by `check-site` at all, and only 4 of the 8 routes with a `ways/` directory carry a `ways` block in `index.json`, because `build-index.ts:101-124` withholds it when the length gate fails. That is the right signal here: a route whose package does not pass the gate genuinely still needs work.

- [ ] **Step 4: Verify and commit**

```
feat(site): the README's groupings and the contribute page's asks answer to the data
```

---

## Done when

- `npm test`, `npx tsc --noEmit`, `npm run validate`, `npm run check-site` and `npm run check-drafted-diff -- origin/main` are all clean.
- `docs/camino-portugues.html`'s two elevation cells agree with their metadata, and `check-site` would fail if they stopped.
- Each of the four checks has a fires / does-not-fire-on-real-prose / accepts-correct-wording test set, plus a positive control against the committed tree.
- Every new check is scoped to route ids, so the two generated pages are never examined for markup they do not have.
- Each rejected design — the word `variant`, and "some stage is drafted" — is recorded in the doc comment of the check that replaced it, with the number that rejected it.

## What this plan does not do

- **It does not build a check registry or an assertion manifest.** Five instances, five different sources; the file's precedent is narrow closures with long doc comments, and a framework would be the first abstraction in it.
- **It does not generate the route detail pages.** They are 24 KB of editorial writing whose narratives are already checked verbatim against `stages.json` by `checkInteriorJourney:1237-1284`; `GENERATED_MARKER` exists precisely to stop a generated page overwriting a hand-authored one.
- **It does not add `data-value` to the Key Facts tables.** The prose parses at 100% across 197 commits with anchored patterns; annotating 86 cells across ten hand-written pages buys nothing.
- **It does not touch `docs/index.html`'s card markup.** The inlined glyph already provides identity, and `checkInlinedAsset` already guarantees it.
