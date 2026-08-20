# Site Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Surface the interior journey content the project exists for, ship GPX so the data is usable on a device, and let a visitor answer "which route should I walk?".

**Architecture:** Two of the three are pure additions to existing machinery — a new generator alongside `glyphs`/`profiles`/`sparklines`, and new sections in hand-written HTML. The third is progressive-enhancement JavaScript over markup that already carries the data. No new dependencies, and `check-site` gains assertions for each so none of it can silently rot.

**Tech Stack:** TypeScript, `tsx`, Node's built-in `node:test`, hand-written HTML/CSS, vanilla JS.

## Global Constraints

- **No new npm dependencies.** This is why per-route OG images were dropped from scope — they need a rasterizer.
- Relative imports use the `.js` extension. `.ts` fails typecheck with TS5097.
- `npx tsc --noEmit` must exit clean; CI runs it.
- Explicit return types on exported functions. No `any`; prefer `unknown` for parsed JSON.
- `SCREAMING_SNAKE_CASE` for module constants. Codepoint comparators, never `localeCompare`.
- Guard `main()` with `resolveInvokedPath` from `scripts/cli.ts`.
- **`npm run check-site` must reach zero problems**, and must gain a failing test for every new assertion.
- Generated output must be byte-stable — CI runs `git diff --exit-code` against it.
- WCAG AA on every text pairing in both themes.
- The hero animation contract stands: reduced-motion starts no rAF loop, deltas clamped at 48 ms, ≤2 elements written per frame, CLS 0.
- Everything must work with JavaScript disabled. Progressive enhancement only.

## Scope Decisions Already Made

| Question | Decision |
|---|---|
| GPX fidelity | **Full**, ~7.3 MB committed. Exact trails including switchbacks. |
| GPX location | `routes/{id}/route.gpx` — a consumer-facing data file, belongs beside the route's other data and gets a natural CDN URL. |
| GPX waypoints | **Track only** for v1. Folding in 12,576 waypoints would bloat the files; `waypoints.geojson` already serves that need. |
| Per-route OG images | **Dropped.** Needs a rasterizer; breaks the zero-dependency rule. |
| Interior journey presentation | Native `<details>`/`<summary>` per stage — semantic, keyboard accessible, zero JavaScript, and it keeps a 33-stage page navigable. |

---

### Task 1: GPX generation

~7.3 MB of new committed output, so byte-stability and correctness matter more than usual.

**Files:**
- Create: `scripts/site/gpx.ts`, `scripts/site/gpx.test.ts`
- Modify: `scripts/site/build-assets.ts`, `scripts/site/check-site.ts` + its test
- Create (generated): `routes/{route-id}/route.gpx` × 8 (7 routes + coastal variant)

**Interfaces:**
- Consumes: `segmentsOf` from `./glyphs.js`
- Produces: `export function gpxFrom(geojson: unknown, meta: GpxMeta): string`

**Requirements:**

- GPX 1.1, `xmlns="http://www.topografix.com/GPX/1/1"`, `creator="open-pilgrimages"`.
- One `<trk>` per route, one `<trkseg>` per source segment — so `shikoku-88`'s MultiLineString and `kumano-kodo`'s seven LineStrings each produce multiple segments rather than one implausible continuous line.
- `<metadata>` carries the route name, a description, `<copyright>` naming ODbL, and a `<link>` to the route's page. **No timestamp** — it would break byte-stability and the CI drift check.
- Coordinates to 6 decimal places (~11 cm), which is beyond the data's real precision and keeps files deterministic.
- XML-escape all interpolated text. Route names contain characters like `é` and `ñ`; a name containing `&` or `<` must not produce malformed XML.
- Degrade like every other generator: malformed or missing geometry yields no file rather than throwing.

**Tests:** valid XML structure; segment count matches `segmentsOf`; point count matches the source; coordinate rounding; XML escaping of a name containing `&`/`<`/`"`; byte-stability across two runs; empty/malformed input degrades.

**Guard:** `check-site` must assert every route in `index.json` has a `route.gpx`, that it is non-empty, and that its `<trkpt>` count matches the route's point count from `computeStats()`. Add a failing test.

Wire into `build-assets` so `npm run build-assets` produces it and the existing CI drift check covers it.

---

### Task 2: Interior journey on the route pages

The project's stated reason to exist. ~16,128 words across 109 stages currently render nowhere.

**Files:**
- Modify: `docs/{route-id}.html` × 7, `docs/styles.css`, `scripts/site/check-site.ts` + its test

**Requirements:**

- For every stage on every detail page, render its `interior.theme`, `interior.narrative`, `interior.commonExperiences`, and `interior.reflection` from that route's `stages.json`.
- Use native `<details>`/`<summary>` per stage. `camino-frances` has 33 stages and ~13,000 words; inlining it all expanded would bury the page. Collapsed by default, expanded by the reader.
- The `<summary>` shows the stage number, name, distance, and theme — enough to choose what to open.
- Mark it as editorial. The README distinguishes interior content from OSM-sourced fact, and the site should too: a short note per section explaining that these narratives are written, not derived.
- `commonExperiences` renders as a list, `reflection` as a pull-quote — it is a question posed to the reader, not prose.
- Works with JavaScript disabled — `<details>` is native, which is why it was chosen over a JS accordion.
- Every stage's content must be present in the HTML even when collapsed, so it is findable by in-page search and by crawlers.

**Guard:** `check-site` must assert, per route, that the number of rendered stage narratives equals the stage count in `stages.json`, and that the first stage's narrative text appears verbatim. This is what stops the content silently drifting from the data. Add a failing test.

---

### Task 3: Route chooser

The question a first-time visitor actually arrives with.

**Files:**
- Modify: `docs/routes.html`, `docs/styles.css`
- Create: `docs/route-filter.js`
- Modify: `scripts/site/check-site.ts` + its test

**Requirements:**

- Filter the seven routes by: days available, maximum distance, difficulty, and month walkable.
- Source every value from `metadata.json` — `overview.estimatedDays.typical`, `overview.distanceKm`, `overview.difficulty`, `overview.bestMonths`. Emit them as `data-*` attributes on the existing route cards so the filter reads the DOM rather than a duplicated dataset.
- **Progressive enhancement.** With JavaScript disabled, every route is visible and the controls are hidden — never a filter UI that does nothing.
- Announce results to assistive technology via a live region ("3 of 7 routes match").
- A cleared filter restores all seven. An empty result says so, with a way back.
- Keyboard operable; visible focus; AA contrast in both themes.
- No layout shift when filtering — reserve the results line's height.

**Guard:** `check-site` must assert every route card carries the four `data-*` attributes and that their values match `computeStats()` / metadata. Otherwise the filter silently misfiles a route when its data changes. Add a failing test.

---

## Acceptance Criteria

- [ ] `npm test` passes; `npx tsc --noEmit` clean
- [ ] `npm run check-site` reports zero problems, with new failing tests proving each new assertion fires
- [ ] `npm run build-assets && git diff --exit-code` clean twice in a row, including the new GPX
- [ ] All 8 GPX files present, valid XML, `<trkpt>` counts matching the source data
- [ ] Interior content rendered for all 109 stages, present in HTML when collapsed
- [ ] Route chooser filters correctly and degrades to all-visible with JS off
- [ ] Every page works with JavaScript disabled
- [ ] AA contrast both themes; usable at 375px
- [ ] CI green on a real run

## What Stays The Same

- Zero runtime dependencies; no framework, no bundler
- Hand-written HTML; only assets are generated
- The existing palette, type pairing, and quiet brand voice
- All data and code licenses
