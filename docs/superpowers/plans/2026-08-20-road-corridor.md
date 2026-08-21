# Road Corridor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Draw each pilgrimage route against a faint corridor of the real road network it passes through, so the path reads as a thread through a landscape rather than a line in a void.

**Architecture:** A three-stage pipeline with a hard boundary at the network. `fetch-roads` calls Overpass and writes a gitignored cache. `build-roads` renders committed SVGs from that cache alone. `build-assets` and CI never touch the network. Route detail pages reference the SVG lazily rather than inlining it, because a single road layer costs more than every existing glyph combined.

**Tech Stack:** TypeScript, `tsx`, Node's built-in `node:test`, hand-written SVG. No new dependencies.

## What this is, and what it is not

This revives the untracked `2026-05-02-route-atlas` spec, which was never built. That spec proposed the full [anvaka/city-roads](https://github.com/anvaka/city-roads) aesthetic — every road in a region — and listed "web rendering inside the docs site" as a non-goal.

**Measured evidence says that non-goal was correct.** For `kumano-kodo`, the *smallest* route bbox, major roads only:

| Approach | Path data |
|---|---|
| Full bbox | 47 KB |
| ~5 km corridor | 30 KB |
| ~3 km corridor | 21 KB |
| *Its entire current glyph* | *3.6 KB* |

The whole of `docs/assets/glyphs.js` is 24.5 KB for eight routes. `camino-frances`'s bbox is 27× kumano's area. Inlining a regional road network is not viable, and at the homepage constellation's 200×200 slots roads are sub-pixel noise regardless.

So this plan builds the **corridor** interpretation: roads within a few kilometres of the path, on detail pages only, lazily loaded.

## Global Constraints

- **No new npm dependencies.** Reuse `mercator`, `simplify`, `fitToBox`, `toPathData` from `scripts/site/project.ts` and `segmentsOf` from `glyphs.ts`.
- **CI must never call the network.** `npm run build-assets` and every CI step read only committed files.
- **`npm run check-site` must reach zero problems**, with a failing test for every new assertion.
- Rendered output must be byte-stable — CI runs a drift check against it.
- Relative imports use `.js`; `npx tsc --noEmit` clean; explicit return types; no `any`.
- Guard `main()` with `resolveInvokedPath` from `scripts/cli.ts`; sort with `byCodepoint`.
- **Never inline the road SVG into HTML.** Reference it.
- WCAG AA both themes; the roads layer is decorative and must not defeat contrast on anything above it.
- Everything works with JavaScript disabled.
- ODbL attribution: this is OSM-derived data and must be credited wherever it renders.

---

### Task 1: Fetch, render, and guard

**Files:**
- Create: `scripts/fetch-roads.ts`, `scripts/site/roads.ts`, `scripts/site/roads.test.ts`
- Modify: `scripts/site/build-assets.ts`, `scripts/site/check-site.ts` + test, `package.json`, `.gitignore`
- Create (generated, committed): `docs/assets/roads/{route-id}.svg` × 8

**The network boundary — the point of the design**

- `npm run fetch-roads` is the **only** thing that calls Overpass. It writes `.cache/roads/{route-id}.json`, which is **gitignored**.
- `build-roads` renders from that cache and writes committed SVGs. If the cache is absent it **skips that route and says so** — it must never fail, and must never silently emit an empty file.
- CI runs neither. It only checks the committed SVGs.

**Corridor selection**

Keep a road way if any of its points falls within ~3 km of the route polyline. Use a coarse grid index keyed on rounded coordinates rather than computing true point-to-polyline distance for millions of pairs — a prototype confirmed a ~0.01° grid is both fast enough and accurate enough at this scale.

Overpass query: `highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)$"`, bbox-limited, `out geom`. Exclude `construction`, `proposed`, `raceway`, `busway`, and anything `access=private`.

**Rendering**

- Project with `mercator`, fit into the **same box as the route glyph** so the two overlay exactly — `GLYPH_BOX` from `glyphs.ts`.
- Simplify with the same epsilon fraction the glyphs use.
- Roads render as one `<path>` with `stroke="currentColor"` so CSS themes them, `fill="none"`, hairline width.
- `<metadata>` records the OSM extract date and ODbL attribution.

**The staleness problem, and its solution**

Because CI cannot re-fetch, it cannot detect that a roads SVG was rendered against *older route geometry*. Solve it by embedding a hash of the route's coordinates in the SVG's `<metadata>`, and having `check-site` recompute that hash from `route.geojson` and compare.

This is what makes an offline-fetched artifact guardable, and it is the crux of this task. Get it right.

**Guard assertions:** every route has a roads SVG; it parses as XML; it is non-empty; its embedded geometry hash matches the current `route.geojson`. Each needs a failing test.

**Verification:** report per route the ways kept vs fetched, output KB, and total added weight. If any single route exceeds ~150 KB, report it rather than shipping it — that is a signal the corridor or simplification needs tightening.

---

### Task 2: Detail page integration

**Files:**
- Modify: `docs/{route-id}.html` × 7, `docs/styles.css`, `scripts/site/check-site.ts` + test

**Requirements:**

- The roads layer sits **behind** the route glyph in each detail page's hero, in the same coordinate box so they align exactly.
- Reference it — `<img>`, `<object>`, or CSS background. **Do not inline it.** Add `loading="lazy"` where applicable so it never blocks first paint.
- It is decorative: `aria-hidden`, `alt=""`, and it must not appear in the accessibility tree or be announced.
- Roads render in `--fog` (or fainter). The route must remain unmistakably dominant — if the roads compete with the path, the corridor is too dense or the stroke too strong.
- Credit OSM/ODbL in the hero's caption or nearby. This is OSM-derived data and the licence requires attribution wherever it appears.
- Must degrade gracefully: if the SVG 404s, the hero still shows the route glyph and the page is unharmed.
- No layout shift — reserve the hero's dimensions so a lazily-loaded layer cannot reflow the page. CLS is 0 site-wide and stays there.
- Verify in **both themes** that the roads read as background texture and never as foreground clutter.

**Guard:** `check-site` asserts each detail page references its own roads SVG. Add a failing test.

---

## Acceptance Criteria

- [ ] `npm test` passes; `npx tsc --noEmit` clean
- [ ] `npm run check-site` zero problems, with failing tests proving each new assertion fires — including the geometry-hash mismatch
- [ ] `npm run build-assets` touches no network and leaves no drift
- [ ] All 8 roads SVGs present, valid XML, hashes matching
- [ ] Total added page weight reported per route; nothing lazily loaded blocks first paint
- [ ] Roads visibly subordinate to the route in both themes
- [ ] OSM/ODbL credited wherever roads render
- [ ] CLS remains 0; pages work with JS disabled
- [ ] CI green on a real run

## Deliberately Out of Scope

- The homepage constellation — roads are sub-pixel at 200×200 and would multiply page weight by seven.
- The full city-roads tag set (`service`, `track`, `path`, `footway`) — measured as far too heavy for web delivery.
- Standalone large-format atlas artifacts. Still a reasonable future project; this plan does not build them.
- A water/hydrography layer, as the original spec also deferred.

## Decisions

### Keeping all eight corridors despite sub-pixel width on the longest routes

A final review before merge measured that the 3 km corridor half-width
renders as **0.88 glyph units** on `camino-frances` — the longest route in
the dataset — against the route's own **1.9-unit stroke** (see
`glyphSvg`/`.route-hero svg` `stroke-width`). The corridor is narrower than
the line it sits behind. `camino-frances` and `camino-norte`, the two
largest committed SVGs, are together **285 KB — 45% of the total 636 KB**
this feature adds, for a texture that is, on those two routes specifically,
thinner than the path drawn on top of it.

**Decision: keep all eight committed corridors, including these two, and
accept the sub-pixel width as texture rather than trim or drop them.**

Why this is the right call rather than an oversight:

- The corridor was never meant to be legible as individual roads — see
  "What this is, and what it is not" above: at homepage-constellation scale
  it's already conceded to be "sub-pixel noise regardless." On the longest
  detail-page routes it is fainter still, but it is not invisible — opacity
  0.28 (light) / 0.2 inverted (dark) against `--fog` still reads as ambient
  texture around the route, which is the effect this feature set out to
  produce, just weaker on the two most sprawling routes than on the other
  six.
- Every route in the dataset shares one fixed rendering box (`GLYPH_BOX`,
  200×200) and one fixed corridor radius (3 km). A route's corridor width
  in glyph units is a function of how much of that fixed box the route's
  own length consumes — long, sprawling routes fill more of the box, so a
  fixed real-world radius necessarily projects to fewer of its units.
  Fixing this for `camino-frances`/`camino-norte` specifically would mean
  either a per-route corridor radius (breaking the "3 km" the plan and
  every doc comment states as a flat constant) or a per-route rendering
  scale (breaking alignment with the route glyph, the entire point of
  `fitToRouteBounds`). Both cures are worse than the disease for a
  decorative background layer.
- Dropping just these two files would leave six of eight routes with a
  corridor and two without, for reasons invisible to a site visitor —
  an inconsistency worse than a faint texture.

This is recorded here, rather than left implicit, so a future reviewer
re-measuring the same numbers finds a decision, not an accident.
