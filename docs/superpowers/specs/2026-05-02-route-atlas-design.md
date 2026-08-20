# Open Pilgrimages — Route Atlas

**Date:** 2026-05-02
**Status:** Approved

## Problem

`open-pilgrimages` ships rich GeoJSON for 7 routes but no visual artifact. Consumers (websites, apps, social, print) each re-implement their own rendering, with inconsistent aesthetics and no canonical look. There is no contemplative, print-ready visualization of any route in this repo.

Inspired by [anvaka/city-roads](https://github.com/anvaka/city-roads): every road of a region rendered as line-art. We want the same energy, but route-aware: faded road network as ground, the pilgrimage path as ink on top.

## Goal

Produce a small, canonical set of static SVGs — one per route — generated from this repo's existing GeoJSON plus a fresh OSM road extract. SVGs become the visual signature of `open-pilgrimages`, reusable by every downstream consumer (Pilgrim app, `pilgrimages` site, anchor reels, future print zine).

## Scope (v1)

Three routes:

| Route ID | Topology | Why first |
|----------|----------|-----------|
| `shikoku-88` | Circular (island-wide) | Visually iconic loop. Stress-tests bbox handling for non-linear topology. |
| `camino-frances` | Linear (~764 km) | Long-corridor stress test. Most-walked route, highest external value. |
| `kumano-kodo` | Network | Stress-tests multi-segment rendering. Compact bbox, rich UNESCO context. |

Three routes covers the three topologies in the dataset (linear, circular, network). If the pipeline survives all three, it generalizes to the rest.

## Non-Goals

- Interactive maps (zoom, pan, tile servers)
- Web rendering inside the docs site
- Shipping atlas-aware features in any consumer (Pilgrim app, `pilgrimages` site, anchor reels). Atlas SVGs are produced as a standalone artifact in v1; consumer integrations are downstream work.
- Print/riso/PDF physical output
- Stipple, watercolor, or photographic styles
- Rendering all 7 routes in v1
- Adding a water/hydrography layer (deferred to v2 — current palette has no blue token)

## Tool Decision

**Custom Node + TypeScript pipeline. No Python.**

Considered:

| Option | Verdict |
|--------|---------|
| Fork `anvaka/city-roads` | Reject. Vue 2 SPA, browser-only, hits Overpass live, canvas not SVG. ~80% mismatch with our use case. |
| `prettymaps` (Python) | Reject for v1. Capable but adds Python dep to a Node-only repo, hurts reproducibility and contributor onboarding. Reconsider for v2 if richer aesthetics become a goal. |
| Custom Node + `d3-geo` + SVG strings | **Accept.** Matches existing stack (`tsx`, TS, `scripts/`). ~300 LOC. Simple aesthetic matches Pilgrim/WTM brand voice. Contributors can read every line. |

What we lift from `anvaka/city-roads`: aesthetic inspiration only. Their MIT license permits reuse of code if needed; in practice we write our own.

## Output Contract

One SVG per route at `atlas/{route-id}.svg`, plus an index `atlas/index.json` listing what was generated.

### SVG specifications

- **Format:** SVG 1.1, hand-written via template (no headless browser, no canvas)
- **Dimensions:** Per-route, declared in `scripts/atlas/config.ts`. Square (2000 × 2000) for `shikoku-88` and `kumano-kodo`; 2:1 (4000 × 2000) for `camino-frances`. The route bbox is padded to the configured aspect.
- **Coordinate system:** GeoJSON WGS84 reprojected via `d3-geo`'s `geoMercator` (or `geoTransverseMercator` for high-latitude routes; not relevant for v1's three routes).
- **No raster:** PNG/PDF derivation is out of scope for v1; SVG is the canonical format.
- **Embedded metadata:** Every SVG includes a `<metadata>` block with route ID, generation timestamp, OSM extract date, and license attribution.
- **Visible attribution:** Footer text element near bottom edge: `© OpenStreetMap contributors · open-pilgrimages (ODbL/CC-BY-SA)`.

### Layer order (bottom to top)

1. **Background:** `--parchment` fill rectangle
2. **Roads:** OSM `highway=*` (tagged subset, see below). Stroke `--fog` (faintest) for minor classes, stepping up to `--stone` for major classes. Width 0.3–1.0 scaled by class.
3. **Route polyline:** `route.geojson` from this repo. Stroke `--ink` at 3.0 width. Round joins, round caps.
4. **Waypoints (optional v1):** `waypoints.geojson` filtered to `category=sacred`. Filled circles, `--rust` fill, radius 4. v1 may ship without waypoints; flag controlled.
5. **Attribution + title:** Title in Cormorant Garamond serif, attribution in Lato sans, both as SVG `<text>` (no font embedding; system serif/sans fallback always acceptable).

Water layer deferred to v2 (see Non-Goals).

### OSM road tag filter

Include: `highway=motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track|path|footway|pedestrian`.
Exclude: `highway=construction|proposed|raceway|escape|bus_guideway|busway`, anything with `access=private` (when present).

### Color palette

Reuse the existing site palette in `docs/styles.css`. No new tokens.

| Token | Hex | Use |
|-------|-----|-----|
| `--parchment` | #F5F0E8 | Background |
| `--ink` | #2C241E | Route polyline |
| `--stone` | #8B7355 | Major roads |
| `--fog` | #B8AFA2 | Minor roads |
| `--rust` | #A0634B | Sacred-site dots |
| `--moss` | #7A8B6F | Reserved (future waypoint subtypes) |
| `--dawn`, `--night` | — | Reserved (future variants, dark mode) |

## Pipeline

New scripts in `scripts/atlas/` matching the existing `scripts/enrich/` pattern:

```
scripts/atlas/
  config.ts             # Per-route render config (bbox aspect, road weights, flags)
  fetch-osm-roads.ts    # Overpass query for roads within a route's bbox
  render.ts             # GeoJSON + OSM extract → SVG
  bbox.ts               # Compute padded bbox from route.geojson (square or per-config aspect)
  project.ts            # WGS84 → SVG coords via d3-geo
```

### New dependencies

- `d3-geo` (runtime, projection)
- `@types/d3-geo` (devDep)

No other new deps. SVG is hand-templated; no headless browser, no canvas runtime.

### Inputs

- `routes/{route-id}/route.geojson` — already in repo
- `routes/{route-id}/waypoints.geojson` — already in repo
- OSM road extract — fetched fresh per atlas regen, cached to `.cache/atlas/{route-id}.osm.json`

### OSM extract size considerations

Camino Frances spans ~764 km west-east. A naive bbox Overpass query for all `highway=*` features covers a large fraction of northern Spain and may return tens of thousands of ways. Mitigations, applied in order until acceptable:

1. Restrict the bbox to a corridor (route polyline buffered by N km, e.g. 5 km), not a rectangle covering the whole bbox.
2. Filter the road tag list to its smaller subset (drop `service`, `track`, `footway` for long routes).
3. Chunk the Overpass query along the route's stages (precedent: existing `fetch-geometry-chunked.ts`).

Shikoku 88 and Kumano Kodo are compact and should not need mitigations.

### Outputs

- `atlas/{route-id}.svg` — committed to repo (text, diff-able, small)
- `atlas/index.json` — generation manifest:
  ```json
  {
    "schemaVersion": "1.0.0",
    "generatedAt": "2026-05-02T00:00:00Z",
    "atlases": [
      {
        "routeId": "shikoku-88",
        "osmExtractDate": "2026-05-02",
        "bbox": [132.5, 32.7, 134.8, 34.5],
        "viewBox": "0 0 2000 2000",
        "fileSizeBytes": 184293
      }
    ]
  }
  ```

### Reproducibility

- Render is deterministic given identical inputs (`route.geojson` hash + OSM extract).
- `.cache/atlas/` is gitignored. Re-running fetches fresh OSM unless `--use-cache` flag is passed.
- Atlas regeneration cadence: yearly, or on demand when `route.geojson` changes materially.

### CLI

```bash
npm run atlas                           # Render all v1 routes
npm run atlas -- --route shikoku-88     # Render one route
npm run atlas -- --skip-fetch           # Use cached OSM (dev only)
npm run atlas -- --waypoints            # Include sacred-site dots
```

Add to `package.json` scripts:

```json
"atlas:fetch": "tsx scripts/atlas/fetch-osm-roads.ts",
"atlas:render": "tsx scripts/atlas/render.ts",
"atlas": "npm run atlas:fetch && npm run atlas:render"
```

The `pipeline` script remains untouched. Atlas is a separate, optional pipeline.

## Storage

- **Commit:** `atlas/*.svg`, `atlas/index.json`. SVGs are text and diff cleanly.
- **Gitignore:** `.cache/atlas/` (raw Overpass JSON, large, regen-able).
- **Estimated SVG size:** 100–300 KB per route uncompressed. Acceptable in repo.

If SVG sizes balloon past 1 MB after layer tuning, revisit (reduce road-tag scope, simplify geometry with Douglas–Peucker, or move to LFS).

## Licenses

- **Atlas SVGs:** CC-BY-SA 4.0 (compatible with ODbL upstream and OSM share-alike).
- **Atlas code (`scripts/atlas/`):** MIT, matching repo convention.
- **Embedded attribution:** Required in every SVG (visible footer + `<metadata>` block).
- **Documentation:** Add atlas section to `docs/usage.html` with embed snippet and license summary.

## Downstream Use (Not Part of v1)

Once atlas SVGs exist, any downstream project can embed them. Likely future surfaces:

- **`pilgrimages` Astro site** — hero image per route page
- **Pilgrim apps (iOS/Android)** — share-card / launch asset
- **`thepilgrimage` / anchor reels** — Remotion background layer

None of these is required for v1 acceptance. v1 ships only the SVGs and the pipeline that produces them.

## Deliverables

- `scripts/atlas/{config,fetch-osm-roads,render,bbox,project}.ts`
- `schema/atlas-index.schema.json` — JSON Schema for the manifest (Draft 2020-12, matching repo convention)
- `atlas/{shikoku-88,camino-frances,kumano-kodo}.svg`
- `atlas/index.json`
- `package.json` updates (scripts + d3-geo dep)
- `.gitignore` entry for `.cache/atlas/`
- Atlas section added to `docs/usage.html`

## Acceptance Criteria

- [ ] `npm install && npm run atlas` runs from clean clone and exits 0
- [ ] Three SVGs land in `atlas/` matching the layer/color spec
- [ ] Each SVG opens cleanly in browser, Figma, and Inkscape
- [ ] Visible OSM/ODbL attribution present in all three
- [ ] `atlas/index.json` validates against `schema/atlas-index.schema.json`
- [ ] `npm run validate` still passes (atlas additions don't break existing pipeline)
- [ ] One reviewer (human) confirms each SVG is "on-brand quiet" — no neon, no noise, no Strava aesthetic
- [ ] Atlas section present in `docs/usage.html` with embed snippet and license note

## Resolved Decisions

| Question | Decision |
|----------|----------|
| Waypoints in v1 or v2? | **v2.** v1 ships without waypoints. The `--waypoints` CLI flag is reserved for v2; the layer is fully designed but not implemented in v1. |
| Title text baked into SVG? | **Yes.** Title in Cormorant Garamond serif, attribution in Lato sans, both with system `serif` / `sans-serif` fallbacks. SVG remains usable when the webfont is unavailable. |
| Atlas license shape? | **Single repo-level `LICENSE-ATLAS`** at the repo root, declaring CC-BY-SA 4.0 for all of `atlas/*.svg` and `atlas/index.json`. Each SVG carries a `<metadata>` block pointing at this file. |
| Variant routes? | **v2.** v1 only renders the three primary routes listed under Scope. Variants under `routes/{id}/variants/` are not rendered in v1. |
| Long-route bbox handling? | **Per-route `aspectRatio` in `scripts/atlas/config.ts`.** Each route declares its own aspect (e.g. `shikoku-88: 1:1`, `kumano-kodo: 1:1`, `camino-frances: 2:1`). The bbox is computed from `route.geojson`, then padded to the configured aspect. ViewBox dimensions scale: 2000 × 2000 for square, 4000 × 2000 for 2:1, etc. |

## Out of Scope (Reiterated)

- Interactive UIs
- Webfont embedding in SVG (system fallbacks only)
- Animated SVG
- 3D, isometric, or perspective renders
- Auto-publishing atlas to CDN (jsDelivr already serves repo files; no extra step)
- Riso, PDF, raster export
- Atlas for routes outside v1 set

## What Stays The Same

- Existing `scripts/`, `routes/`, `schema/`, `docs/` structure
- Existing `pipeline` command
- Existing schemas and validation
- All data licenses
- Brand voice: quiet, contemplative, no vanity numbers
