# Open Pilgrimages — Site Redesign & CI Repair

**Date:** 2026-08-19
**Status:** Approved

## Problem

Two independent failures, both dating to the v1.0 site build.

**The website describes a dataset that no longer exists.** It covers 3 routes; the repo ships 7 plus 6 variants. Every headline number is stale, and four routes added across v1.2–v1.5 appear nowhere.

| | Site claims | Actual |
|---|---|---|
| Routes | 3 | 7 (+6 variants) |
| GPS points | 89K | 159,624 |
| Waypoints | 6K | 12,576 |
| Stages | 47 | 109 |
| Francés distance | 790 km | 764 km |
| Kumano waypoints | 47 | 157 |

`routes.html` is still headlined *"Three pilgrimages. Three traditions. Three topologies."* `stats.json` shipped in v1.5.0 and is documented nowhere on the site.

**CI has never passed.** Every one of the 20 `Validate` runs on record failed, the most recent at this step:

```
✓ npm run build-index
X Check index.json is up to date   ← git diff --exit-code index.json
```

`scripts/build-index.ts` stamps `generatedAt: new Date().toISOString()` on every run, so the drift check can never succeed. `npm run validate` itself passes clean — it has simply never been reached.

**Underlying cause of the first failure:** route data and page copy have no connection. Nothing detects drift, so the site rots silently with each data release.

## Goals

1. Green CI, with a drift check that still has teeth.
2. Site accurately describes all 7 routes and 6 variants.
3. The site stops being able to go stale without CI noticing.
4. The site looks like what it is — a geodata project — which today it does not.

## Non-Goals

- Migrating off static HTML to a framework or SSG
- Generating page prose from data (numbers are guarded; prose stays hand-written)
- Interactive slippy maps, tile servers, or any runtime map dependency
- Authoring a `stats.json` JSON Schema (documented as a gap; separate work)
- Implementing the full `route-atlas` spec's OSM road-network layer
- Backfilling altitude into `route.geojson`
- Changing any data under `routes/`

---

## Part 1 — CI Repair

### 1.1 Deterministic `generatedAt`

`scripts/build-index.ts` reads the existing `index.json` before writing. It builds the new index carrying the **old** `generatedAt`, then compares full serialized output. Identical → keep the old timestamp and write nothing new. Different → stamp a fresh timestamp.

Re-running `build-index` on unchanged data becomes a true no-op. `generatedAt` stays required by `schema/index.schema.json`, and the drift check keeps working as intended.

### 1.2 Action versions

`actions/checkout@v4` → `@v5` and `actions/setup-node@v4` → `@v5`. Both currently emit Node 20 deprecation warnings; GitHub forced Node 24 in June 2026.

### 1.3 Site staleness guard

New `scripts/check-site.ts`, run as a CI step, with `docs/**` added to the workflow's trigger paths (the workflow ignores `docs/**` today, so site edits get no CI at all).

It asserts:

- every route ID in `index.json` appears in `docs/routes.html`
- every route ID has a detail page and a generated glyph
- the four hero stat numbers in `docs/index.html` match live aggregates
- generated assets are current (re-running the generator produces no diff)

`scripts/stats.ts` is refactored so its aggregation becomes an exported `computeStats()`, called by both `stats.ts` and `check-site.ts`. `stats.ts` keeps its existing console output. This avoids a second copy of the counting logic drifting from the first.

Failures print the expected and actual values, not just a non-zero exit.

---

## Part 2 — Content Accuracy

Pages stay hand-written HTML. The README is already current and is the source of truth for figures; route prose is written from each `metadata.json`'s `description.en`, `tradition.*`, and `overview.*` so site and README cannot disagree.

Hero stats become exact rather than rounded — `7` / `159,624` / `12,576` / `109`. Exact figures suit the project's voice better than `160K`, and give the guard something unambiguous to compare.

| Page | Change |
|---|---|
| `index.html` | Hero stats; 7 route cards; Francés 790→764 km; Kumano 38→39 km; Kumano status line updated (Kohechi/Iseji now exist as stubs); meta description and OG tags name more than 3 routes |
| `routes.html` | "Three pilgrimages" → "Seven"; 4 new route sections; corrected figures; variant sub-tables; `stats.json` in every file listing |
| `schema.html` | "four files" → five; `stats.json` row; note that no schema validates it yet |
| `usage.html` | `stats.json` in the CDN URL list; a stats fetch example matching the README's |
| `contribute.html` | "Needs" tags refreshed against what is actually still missing |

### Variant status — corrected

An earlier reading of this had `coastal` as a stub. It is not.

| Variant | Status |
|---|---|
| `camino-portugues/variants/coastal` | **Full route** — 5 files, 110 km, 5,546 points, 1,043 waypoints |
| `camino-ingles/variants/a-coruna` | Metadata only |
| `camino-portugues/variants/espiritual` | Metadata only |
| `camino-portugues/variants/lisboa` | Metadata only |
| `kumano-kodo/variants/iseji` | Metadata only |
| `kumano-kodo/variants/kohechi` | Metadata only |

---

## Part 3 — URLs

GitHub Pages already resolves extensionless URLs — `/routes` returns 200 on the live site today. This costs no infrastructure change; it is nav `href`s, `<link rel=canonical>`, and `og:url`.

| URL | File |
|---|---|
| `/` | `docs/index.html` |
| `/routes` | `docs/routes.html` |
| `/schema`, `/usage`, `/contribute` | flat siblings |
| `/camino-frances`, `/shikoku-88`, … | `docs/{route-id}.html` |

**Route detail pages sit flat at the site root**, not nested under `/routes/`. Nesting would put `docs/routes.html` and `docs/routes/` side by side, where a trailing-slash request (`/routes/`) finds no `index.html` and 404s. Flat files avoid the collision entirely, keep every page a sibling, and give shorter URLs. The homepage remains the only `index.html` in the project.

Route IDs therefore share a namespace with page names. Given IDs are pilgrimage names (`camino-frances`, `shikoku-88`), collision is not a practical risk; `check-site.ts` asserts no route ID collides with a reserved page name.

Add `docs/404.html` in the site's visual style — Pages currently has `custom_404: false`.

---

## Part 4 — Visual Design

### 4.1 Route glyphs

Every route is projected from its own `route.geojson` into a normalized SVG path. This is the `route-atlas` spec's central idea minus its OSM road layer — which is where that spec's cost lived. No tile server, no API key, no runtime fetch, no external request.

**Generation** (`scripts/site/glyphs.ts`):

1. Read `route.geojson`, flatten LineString / MultiLineString into segments
2. Project WGS84 → Web Mercator
3. Fit to a `200 × 200` viewBox with 12-unit padding, preserving aspect ratio, centered
4. Simplify via Ramer–Douglas–Peucker, epsilon = 0.16% of the fitted span
5. Emit `<path>` data with `pathLength="1"`

Measured output from the prototype:

| Route | Input points | Output | Size |
|---|---|---|---|
| camino-frances | 33,192 | 89 | 1.1 KB |
| camino-norte | 38,640 | 141 | 1.6 KB |
| camino-primitivo | 13,303 | 177 | 2.1 KB |
| camino-portugues | 13,722 | 117 | 1.3 KB |
| camino-ingles | 4,823 | 216 | 2.6 KB |
| kumano-kodo | 6,847 | 305 | 3.6 KB |
| shikoku-88 | 49,097 | 852 | 9.9 KB |
| coastal | 5,546 | 137 | 1.6 KB |

Total ≈ 24 KB for all eight.

**Scale: fit-to-box.** Each route fills its slot regardless of true length, so Inglés (112 km) draws as large as Shikoku (1,200 km). Size therefore carries no meaning — distance is stated in the caption instead. Shared true scale was considered and rejected: it shrinks Inglés and Kumano to illegible stubs and unbalances the composition.

**`pathLength="1"`** normalizes each path to unit length, so `stroke-dasharray` / `stroke-dashoffset` work in 0–1 units with no `getTotalLength()` measurement at runtime.

**Output:**
- `docs/assets/glyphs.js` — `window.OP_GLYPHS = { "<route-id>": "<path d>" }`, loaded by a blocking `<script>` in `<head>`. No fetch, no race, no flash of empty hero.
- `docs/assets/routes/{route-id}.svg` — standalone files for cards, detail headers, and OG images.

### 4.2 Homepage hero — rotating constellation

All seven routes sit in a **fixed** constellation drawn in `--fog`. Nothing moves position. One route at a time is inked, and the ink rotates.

**Motion — "trace".** Each glyph is stacked as two paths: a static `--fog` path always visible, and an `--ink` path above it that animates. With `stroke-dasharray="1 1"`, a single parameter `p` drives the whole cycle:

```
p =  1  → not yet drawn
p =  0  → fully drawn
p = -1  → fully exited past its own end
```

Draw and exit are therefore one continuous motion with no seam between them. The line is walked into being and then continues off its end — a route drawn by travelling it.

| Phase | Duration | `p` |
|---|---|---|
| Draw | 2600 ms | 1 → 0 |
| Hold | 1700 ms | 0 |
| Exit | 900 ms | 0 → −1 |

5.2 s per route, ~37 s for a full lap of seven. Deliberately slow.

**Naming — plate caption.** Bottom-right of the hero: 9.5px, uppercase, `0.18em` letterspacing, `--stone`, with distance dropped to `--fog` behind a middot — `SHIKOKU 88 · 1,200 KM`. It fades in at 55% of the draw and out during exit. **Absolutely positioned**, so no name length can shift a single pixel. Rejected alternative: anchoring the caption under each glyph — livelier, but the text wanders the panel and the collapsed mobile layout needs a separate answer.

**Flawlessness requirements.** These are acceptance criteria, not nice-to-haves:

- **`prefers-reduced-motion: reduce` → no animation whatsoever.** No `requestAnimationFrame` loop is started at all; one route renders inked and static. Not merely a faster or subtler animation.
- **Frame deltas clamped at 48 ms.** A backgrounded tab throttles rAF; without clamping, the first frame back leaps the animation forward visibly. With it, returning to the tab is seamless.
- **Pause on `pointerenter` and on keyboard focus**, resume on leave/blur.
- **Per frame, only `stroke-dashoffset` and `opacity` are written**, on at most two paths. No layout, no reflow, no per-frame DOM construction. The caption's text changes once per route, not once per frame.
- **No layout shift**, anywhere in the cycle.

**Known limitation, accepted:** `shikoku-88` and `kumano-kodo` are MultiLineStrings, so the trace draws them subpath by subpath and the pen jumps between disconnected segments. On the Camino routes the walk is continuous. Reviewed in the prototype and accepted as-is. If it later grates, the fallbacks are simultaneous per-segment draw, or bloom (fade in place) for network topologies only.

**Mobile:** below 700px the constellation collapses to a single centered glyph, still cycling with trace, caption beneath it.

### 4.3 Per-route detail pages

One page per route: glyph header, key facts, stage elevation profile, stage table, waypoint breakdown, pilgrim-count sparkline, variants, and CDN/file links. `routes.html` becomes a catalog of cards plus the comparison table, instead of one scroll holding 7 routes and 6 variants.

**Seven detail pages — one per top-level route.** Variants do not get their own pages; each is a section within its parent's page. `coastal` is a full route by file count and gets a full section with its own glyph, profile, and sparkline; the five metadata-only stubs get a row in a variants table. Revisit if a stub is ever enriched to full.

### 4.4 Stage elevation profiles

`route.geojson` coordinates are **2D only** — all 159,624 are `[lon, lat]`, with no altitude, despite `CLAUDE.md` documenting `[lon, lat, altitude]`. Full-resolution elevation profiles are therefore impossible.

`stages.json` does carry `highPointMeters`, `lowPointMeters`, and `elevationGainMeters` per stage. Profiles are drawn as a **stepped** area chart from those, plotted against cumulative distance — honest about its resolution rather than faking a smooth curve. Francés gets 33 steps, Norte 34, and Primitivo's Puerto del Palo finally becomes visible at 1,146 m instead of sitting in a table cell.

Generated by `scripts/site/profiles.ts` to `docs/assets/profiles/{route-id}.svg`.

**Also fix `CLAUDE.md`** to describe altitude as optional and absent from current route data.

### 4.5 Pilgrim sparklines

`stats.json` carries `annualPilgrims.trend` as `[{year, count}]` — 41 years for Francés (690 in 1985 → 242,179 in 2025), 23 for the newer Caminos, 21 for Shikoku, 22 for Kumano. Drawn as small inline SVG line charts, no chart library.

Generated by `scripts/site/sparklines.ts` to `docs/assets/sparklines/{route-id}.svg`.

### 4.6 Comparison table

All seven on `routes.html`, sortable by distance, typical days, difficulty, stage count, waypoint count, and best months. Progressive enhancement: renders as a plain sorted table with JS disabled.

### 4.7 Dark mode

`--night: #1C1914` is already defined in `styles.css` and unused. Add a `prefers-color-scheme: dark` block plus a manual toggle persisted to `localStorage`, defaulting to system.

Dark palette: `--night` background, `--parchment` text, `--fog` darkened for the constellation's resting state, `--rust` lightened to hold contrast on dark. Every pairing must clear WCAG AA.

### 4.8 Layout system

Fluid type via `clamp()`. Prose column stays ~48rem, with a full-bleed escape hatch for the hero, glyphs, profiles, and wide tables — the README's 8-column waypoint coverage table has nowhere to live today.

### 4.9 Live CDN preview

On `usage.html`, a panel that fetches from jsDelivr and renders the real response, proving the documented URLs work. Fails to a static example if the request errors or is blocked.

---

## Script Architecture

```
scripts/site/
  glyphs.ts         # route.geojson → simplified SVG path
  profiles.ts       # stages.json  → stepped elevation SVG
  sparklines.ts     # stats.json   → pilgrim trend SVG
  build-assets.ts   # orchestrator
  check-site.ts     # staleness guard
```

`package.json` gains:

```json
"build-assets": "tsx scripts/site/build-assets.ts",
"check-site":   "tsx scripts/site/check-site.ts"
```

`pipeline` is left untouched — site assets are a separate, optional build, consistent with how `route-atlas` scoped itself.

**New dependency:** none required. The prototype's Mercator projection and RDP simplification are ~40 lines of arithmetic; `d3-geo` would be a dependency for maths already written and verified. Reconsider only if a non-Mercator projection becomes necessary.

## Relationship to the `route-atlas` Spec

`docs/superpowers/specs/2026-05-02-route-atlas-design.md` is untracked and unimplemented. This work implements the **route polyline** half of its idea and deliberately leaves the OSM road-network ground layer unbuilt — that layer carried the Overpass fetching, corridor bboxes, chunking, and caching that made the atlas expensive.

That spec listed "web rendering inside the docs site" as a non-goal and consumer integration as deferred downstream work. This design pulls that forward. The atlas spec remains valid for its richer print-oriented output; the two share the projection approach and should share `scripts/site/glyphs.ts` if the atlas is later built.

## Deliverables

- `scripts/build-index.ts` — deterministic `generatedAt`
- `scripts/stats.ts` — exported `computeStats()`
- `scripts/site/{glyphs,profiles,sparklines,build-assets,check-site}.ts`
- `.github/workflows/validate.yml` — action bumps, `docs/**` paths, `check-site` step
- `docs/{index,routes,schema,usage,contribute}.html` — rewritten
- `docs/{route-id}.html` × 7 — new detail pages
- `docs/404.html`
- `docs/styles.css` — dark mode, fluid type, full-bleed, constellation, charts
- `docs/assets/` — generated glyphs, profiles, sparklines
- `package.json` — two scripts
- `CLAUDE.md` — altitude correction

## Acceptance Criteria

- [ ] `npm run build-index && git diff --exit-code index.json` passes, twice in a row
- [ ] `npm run validate` passes
- [ ] `npm run check-site` passes, and **fails** when a route is removed from `routes.html` or a hero number is edited
- [ ] CI green on a real push
- [ ] All 7 routes and 6 variants present and accurate on the site
- [ ] Every figure on the site matches `npm run stats` and the README
- [ ] All nav, canonical, and OG URLs extensionless; every one resolves 200 on the live site
- [ ] Hero constellation runs at 60fps; only `stroke-dashoffset` and `opacity` are written per frame
- [ ] With Reduce Motion enabled, no rAF loop starts and one route renders static
- [ ] Tabbing away for 2+ minutes and returning produces no visible jump
- [ ] No layout shift at any point in the cycle (CLS 0)
- [ ] Hover and keyboard focus both pause the cycle
- [ ] Dark mode passes WCAG AA on all text pairings
- [ ] Site is legible and usable at 375px width
- [ ] Comparison table sorts correctly, and renders sorted with JS disabled

## Resolved Decisions

| Question | Decision |
|---|---|
| Fix the timestamp or weaken the drift check? | **Fix the timestamp.** A drift check that cannot pass is worse than none. |
| Generate `routes.html` from data? | **No.** Prose stays hand-written; `check-site.ts` guards the numbers. Generated assets (glyphs, charts) are separate from generated copy. |
| Hero numbers rounded or exact? | **Exact.** `159,624`, not `160K`. Suits the voice and gives the guard something unambiguous. |
| Hero direction? | **Constellation** (option C), over atlas plate and featured route. |
| Motion? | **Trace**, over cross-draw and bloom. Only one that earns the walking metaphor. |
| Caption placement? | **Corner plate caption**, over anchoring under each glyph. |
| Glyph scale? | **Fit-to-box**, over shared true scale. |
| Detail page URLs? | **Flat at site root** (`/camino-frances`), over nesting under `/routes/`. Avoids the `routes.html` vs `routes/` trailing-slash collision. |
| `d3-geo`? | **No.** The projection maths is ~40 lines and already verified in the prototype. |
| MultiLineString trace jumping? | **Accepted.** Reviewed in prototype. Fallbacks documented if it grates. |
| `stats.json` schema? | **Out of scope.** Documented as a known gap on `schema.html`. |

## What Stays The Same

- Static hand-written HTML; no framework, no SSG
- All data under `routes/` — this design changes none of it
- Existing schemas and `npm run validate`
- The `pipeline` command
- The existing palette and type pairing (Cormorant Garamond + Lato); the design extends it rather than replacing it
- All data and code licenses
- Brand voice: quiet, contemplative, no vanity numbers
