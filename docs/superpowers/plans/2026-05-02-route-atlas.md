# Route Atlas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce static, on-brand SVG atlases for `shikoku-88`, `camino-frances`, and `kumano-kodo`. Each SVG: faded OSM road network as ground, the route polyline in ink on top, with embedded OSM/ODbL attribution.

**Architecture:** Node + TypeScript pipeline (`tsx`) matching existing `scripts/enrich/` pattern. Inputs are this repo's `route.geojson` files plus a fresh OSM road extract via Overpass. Output: hand-templated SVG strings, no headless browser, no canvas, no UI. New top-level `atlas/` directory holds outputs. New `scripts/atlas/` directory holds the pipeline. New `schema/atlas-index.schema.json` validates the manifest.

**Tech Stack:** Node, TypeScript, `tsx`, `d3-geo` (new dep), Overpass API, plain SVG.

**Spec:** `docs/superpowers/specs/2026-05-02-route-atlas-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `scripts/atlas/config.ts` | Per-route render config (route id, aspect ratio, road weights, Overpass query/strategy) |
| Create | `scripts/atlas/bbox.ts` | Compute route bbox from `route.geojson`, pad to configured aspect |
| Create | `scripts/atlas/project.ts` | WGS84 → SVG coords via `d3-geo` `geoMercator` |
| Create | `scripts/atlas/fetch-osm-roads.ts` | Overpass road extract per route, cached to `.cache/atlas/{id}.osm.json` |
| Create | `scripts/atlas/render.ts` | Combine route geojson + OSM extract → SVG string → `atlas/{id}.svg` and update `atlas/index.json` |
| Create | `schema/atlas-index.schema.json` | JSON Schema for `atlas/index.json` (Draft 2020-12, matching repo convention; `$id` under jsDelivr CDN) |
| Create | `atlas/.gitkeep` | Hold the directory in git before first SVG lands |
| Create | `LICENSE-ATLAS` | CC-BY-SA 4.0 declaration for `atlas/*.svg` and `atlas/index.json` |
| Create | `atlas/shikoku-88.svg` | Atlas output (generated, committed) |
| Create | `atlas/camino-frances.svg` | Atlas output (generated, committed) |
| Create | `atlas/kumano-kodo.svg` | Atlas output (generated, committed) |
| Create | `atlas/index.json` | Generation manifest (generated, committed) |
| Modify | `package.json` | Add `d3-geo` and `@types/d3-geo` to `devDependencies` (atlas is build-time tooling, matching repo pattern). Add `atlas:fetch`/`atlas:render`/`atlas` scripts. |
| Modify | `.gitignore` | Add `.cache/atlas/` |
| Modify | `scripts/validate.ts` | Validate `atlas/index.json` against new schema as part of `npm run validate` |
| Modify | `docs/usage.html` | Atlas section: how to embed, license note |
| Modify | `CLAUDE.md` | Add atlas command + brief description in Commands section |

---

### Task 1: Project setup — deps, gitignore, license, atlas dir

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `LICENSE-ATLAS`
- Create: `atlas/.gitkeep`

- [ ] **Step 1: Add dependencies to `package.json`**

Add both `d3-geo` and `@types/d3-geo` to `devDependencies`. The repo currently has no `dependencies` block — atlas is build-time tooling like every other script here, so it follows the same pattern. Add three new scripts under the existing `scripts` block:

```json
"atlas:fetch": "tsx scripts/atlas/fetch-osm-roads.ts",
"atlas:render": "tsx scripts/atlas/render.ts",
"atlas": "npm run atlas:fetch && npm run atlas:render"
```

Run `npm install` and verify no audit issues.

- [ ] **Step 2: Add `.cache/atlas/` to `.gitignore`**

Append a single line:

```
.cache/atlas/
```

- [ ] **Step 3: Create `LICENSE-ATLAS`**

Single file at repo root declaring CC-BY-SA 4.0 for all of `atlas/*.svg` and `atlas/index.json`. Header should explicitly note OSM/ODbL upstream attribution. Use the standard CC-BY-SA 4.0 legal text (or the short summary + link to creativecommons.org/licenses/by-sa/4.0/). Mirror the structure of the existing `LICENSE-DATA` for tone.

- [ ] **Step 4: Create `atlas/` directory**

```bash
mkdir -p atlas
touch atlas/.gitkeep
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore LICENSE-ATLAS atlas/.gitkeep
git commit -m "atlas: scaffold deps, license, output dir

Add d3-geo runtime dep, atlas npm scripts, .gitignore for cache,
CC-BY-SA 4.0 license file, and empty atlas/ output directory."
```

---

### Task 2: Per-route config

**Files:**
- Create: `scripts/atlas/config.ts`

- [ ] **Step 1: Define the config type and per-route entries**

Export a typed config keyed by route id. Each entry declares:

- `routeId` — must match a directory under `routes/`
- `aspectRatio` — `"1:1"` or `"2:1"` (only two needed for v1)
- `viewBox` — `{ width, height }` derived from aspectRatio (square = 2000×2000, 2:1 = 4000×2000)
- `bboxPaddingKm` — kilometres of padding to add around the route geometry before rendering (e.g. 5 km)
- `corridor` — optional `{ bufferKm: number }` for long routes; when set, OSM is fetched only within a buffered route corridor instead of the full bbox
- `roadClasses` — array of `highway=` values to include; long-route entries can drop minor classes
- `title` — display title baked into SVG (`"Shikoku 88"`, `"Camino Frances"`, `"Kumano Kodo"`)

v1 entries:

| Route | aspectRatio | corridor | roadClasses |
|-------|-------------|----------|-------------|
| `shikoku-88` | 1:1 | none (full bbox) | full set (motorway → pedestrian) |
| `kumano-kodo` | 1:1 | none (full bbox) | full set |
| `camino-frances` | 2:1 | `bufferKm: 5` | reduced set (drop `service`, `track`, `footway`) |

- [ ] **Step 2: Export a list of v1 route ids**

Export `V1_ROUTE_IDS = ["shikoku-88", "kumano-kodo", "camino-frances"]` as a single source of truth used by both fetch and render scripts.

- [ ] **Step 3: Commit**

```bash
git add scripts/atlas/config.ts
git commit -m "atlas: add per-route render config

Aspect ratio, bbox padding, road class filter, optional corridor
buffer for long routes. v1 routes: shikoku-88, kumano-kodo,
camino-frances."
```

---

### Task 3: Bounding-box and projection helpers

**Files:**
- Create: `scripts/atlas/bbox.ts`
- Create: `scripts/atlas/project.ts`

- [ ] **Step 1: Implement `bbox.ts`**

Functions:

- `routeBbox(routeGeojson)` — return `[minLon, minLat, maxLon, maxLat]` from a FeatureCollection of LineString/MultiLineString.
- `padBbox(bbox, paddingKm)` — expand by N km converted to degrees (use a simple latitude-aware approximation; full accuracy not required at this scale).
- `enforceAspect(bbox, aspectRatio)` — given `"W:H"`, expand the smaller axis symmetrically until the bbox matches the requested aspect.
- `bufferedCorridorBbox(routeGeojson, bufferKm)` — return a bbox that just encloses the route polyline buffered by N km. For v1 this can be implemented as: compute the bbox of the polyline, pad uniformly by `bufferKm` (degree-converted). True corridor (Turf-style line buffer) is not required for v1 — the simple padded bbox is acceptable since `--route-only` filtering will happen at the Overpass query, not the bbox level.

- [ ] **Step 2: Implement `project.ts`**

Single export: `makeProjector(bbox, viewBox)` returning a function `(lon, lat) => [x, y]`. Use `d3-geo`'s `geoMercator()` fitted to bbox and viewBox via `fitExtent`. Return both the projector and the underlying d3 projection so callers can also access `path` if needed.

- [ ] **Step 3: Commit**

```bash
git add scripts/atlas/bbox.ts scripts/atlas/project.ts
git commit -m "atlas: add bbox and projection helpers

Route bbox + km padding + aspect-ratio expansion. d3-geo Mercator
projection fit to viewBox."
```

---

### Task 4: OSM road fetch

**Files:**
- Create: `scripts/atlas/fetch-osm-roads.ts`

- [ ] **Step 1: Build the Overpass query per route**

Inputs: `routeId`. Steps inside the script:

1. Read `routes/{routeId}/route.geojson`.
2. Look up config from `scripts/atlas/config.ts`.
3. Compute bbox: padded route bbox or buffered corridor bbox depending on config.
4. Build Overpass query string using the configured `roadClasses`. Single `way[highway~"^(class1|class2|...)$"](south,west,north,east);` followed by `out geom;`.
5. POST to Overpass (`https://overpass-api.de/api/interpreter`), reusing the structure of the existing `scripts/fetch-osm.ts` (Overpass `[timeout:N]` directive in the query, single POST, throw on non-2xx). No retry loop is required for v1; on transient failures the operator re-runs the script.
6. Write JSON to `.cache/atlas/{routeId}.osm.json`.

- [ ] **Step 2: CLI behaviour**

- Default: fetch all routes in `V1_ROUTE_IDS`.
- `--route <id>`: fetch only that route.
- `--use-cache`: skip fetch if cache file exists (dev convenience).

Print a one-line summary per route: route id, bbox, way count, byte size.

- [ ] **Step 3: Run and sanity-check the cache**

```bash
npm run atlas:fetch
```

Expected: three JSON files in `.cache/atlas/`. Camino Frances ~10–50 MB given the corridor + reduced classes. Shikoku and Kumano substantially smaller. None of these files should be committed.

- [ ] **Step 4: Commit**

```bash
git add scripts/atlas/fetch-osm-roads.ts
git commit -m "atlas: fetch OSM road extracts via Overpass

Per-route bbox or corridor query, cached to .cache/atlas/.
CLI: --route, --use-cache."
```

---

### Task 5: SVG renderer

**Files:**
- Create: `scripts/atlas/render.ts`

- [ ] **Step 1: Read inputs**

For a given route id:

1. Load `routes/{routeId}/route.geojson`.
2. Load `.cache/atlas/{routeId}.osm.json`.
3. Look up config.

- [ ] **Step 2: Compose the SVG string**

Layer order, written as nested `<g>` groups in this exact order so z-index is correct:

1. **Background rect** — full viewBox, `fill="#F5F0E8"` (`--parchment`).
2. **Roads** — convert each Overpass `way` with a `geometry` array to an SVG `<polyline>` with `points` attribute. Stroke depends on the way's `highway` tag:
   - Major (`motorway`, `trunk`, `primary`, `secondary`): stroke `#8B7355` (`--stone`), width 1.0
   - Minor (everything else): stroke `#B8AFA2` (`--fog`), width 0.4
   - `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`
3. **Route polyline** — flatten LineString/MultiLineString features into one or more `<polyline>` elements. Stroke `#2C241E` (`--ink`), width 3.0, round caps and joins, `fill="none"`.
4. **Title** — `<text>` near top-left, `font-family="Cormorant Garamond, serif"`, `font-size="60"`, `fill="#2C241E"`. Content: `config.title`.
5. **Attribution** — `<text>` near bottom edge, `font-family="Lato, sans-serif"`, `font-size="14"`, `fill="#8B7355"`. Content: `© OpenStreetMap contributors · open-pilgrimages (ODbL/CC-BY-SA)`.
6. **`<metadata>`** — child of root `<svg>`, contains a JSON blob with `routeId`, `generatedAt` (ISO 8601), `osmExtractDate` (date the cache file was written), `bbox`, and `license: "CC-BY-SA-4.0"`.

The waypoint layer is intentionally not rendered in v1 (per spec). Leave a clearly commented placeholder where layer 5 (waypoints) would slot in between layers 3 and 4 of the spec — useful as a hook for v2 but should not produce output now.

- [ ] **Step 3: Write outputs**

- Write the SVG string to `atlas/{routeId}.svg`.
- Update `atlas/index.json`: read existing if present, set/replace the entry for this route id, write back.
  - Preserve `schemaVersion: "1.0.0"`.
  - Set the top-level `generatedAt` to the current ISO 8601 timestamp on every run (it represents "last touched", not first generation).
  - Within each entry, `osmExtractDate` is the date the corresponding `.cache/atlas/{routeId}.osm.json` file was written (mtime → `YYYY-MM-DD`).

- [ ] **Step 4: CLI behaviour**

- Default: render all routes in `V1_ROUTE_IDS`.
- `--route <id>`: render only that route.
- `--waypoints`: reserved flag for v2; in v1, accept it but print `"--waypoints is reserved for v2; ignored in v1"` and continue.

Print a one-line summary per route: route id, viewBox, byte size of SVG.

- [ ] **Step 5: Run end-to-end**

```bash
npm run atlas
```

Expected:

- Three SVGs in `atlas/`
- `atlas/index.json` with three entries
- Each SVG opens in browser, Figma, and Inkscape without errors
- Visible attribution text in each
- No render errors in the terminal

- [ ] **Step 6: Commit code only (not generated SVGs yet)**

After step 5, `atlas/` contains generated SVGs and `atlas/index.json`. **Do not stage them yet.** Only the renderer code is committed in this task; Task 7 commits the artifacts after a final clean re-run.

```bash
git add scripts/atlas/render.ts
git commit -m "atlas: render route SVGs from geojson + OSM extract

Layer order: parchment bg, roads (stone/fog), route polyline (ink),
title, attribution, embedded metadata. Per-route viewBox per
config aspect ratio."
```

Confirm with `git status` that `atlas/*.svg` and `atlas/index.json` are present in the working tree but unstaged.

---

### Task 6: Schema for `atlas/index.json`

**Files:**
- Create: `schema/atlas-index.schema.json`
- Modify: `scripts/validate.ts`

- [ ] **Step 1: Write the JSON Schema**

Match the structure produced by `render.ts`:

```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "<ISO 8601 string>",
  "atlases": [
    {
      "routeId": "<string, kebab-case>",
      "osmExtractDate": "<YYYY-MM-DD>",
      "bbox": [<minLon>, <minLat>, <maxLon>, <maxLat>],
      "viewBox": "<string, e.g. '0 0 2000 2000'>",
      "fileSizeBytes": <integer>
    }
  ]
}
```

Match repo convention exactly:

- `$schema: "https://json-schema.org/draft/2020-12/schema"`
- `$id: "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/schema/atlas-index.schema.json"`
- `title`, `description` filled in to match the tone of existing schemas

Verify Ajv in this repo is configured for Draft 2020-12 (the existing schemas already use this draft, so it should already work via `ajv` + `ajv-formats`).

- [ ] **Step 2: Wire into `npm run validate`**

Extend `scripts/validate.ts` so that, after existing validations, it loads `atlas/index.json` (if it exists) and validates it against `schema/atlas-index.schema.json`. Missing file is not a failure (atlas may not have been generated on this clone), but invalid file is.

- [ ] **Step 3: Run**

```bash
npm run validate
```

Expected: passes, including the new atlas check.

- [ ] **Step 4: Commit**

```bash
git add schema/atlas-index.json scripts/validate.ts
git commit -m "atlas: schema and validation for atlas/index.json

Validate manifest as part of npm run validate. Missing file
is tolerated; invalid file fails."
```

---

### Task 7: Commit generated atlas SVGs

**Files:**
- Add: `atlas/shikoku-88.svg`
- Add: `atlas/camino-frances.svg`
- Add: `atlas/kumano-kodo.svg`
- Add: `atlas/index.json`

- [ ] **Step 1: Re-run the pipeline cleanly**

```bash
rm -rf .cache/atlas
npm run atlas
```

This produces fresh SVGs from a fresh OSM extract. The cache is not committed.

- [ ] **Step 2: Visual review**

Open each SVG in a browser. Confirm against the spec's "on-brand quiet" criterion:

- Background is parchment (warm tan), not white
- Roads are faint (stone for major, fog for minor) — not loud
- Route polyline is clearly the visual lead, in ink
- Title and attribution are present and legible
- No accidental missing geometry or mis-projected segments

- [ ] **Step 3: Remove the placeholder `.gitkeep`**

The `atlas/.gitkeep` from Task 1 is no longer needed once real artifacts land:

```bash
git rm atlas/.gitkeep
```

- [ ] **Step 4: Commit the artifacts**

```bash
git add atlas/shikoku-88.svg atlas/camino-frances.svg atlas/kumano-kodo.svg atlas/index.json
git commit -m "atlas: generate v1 SVGs for shikoku-88, camino-frances, kumano-kodo

First atlas batch. ODbL upstream, CC-BY-SA 4.0 atlas output.
Generated with scripts/atlas/render.ts. Removes atlas/.gitkeep."
```

---

### Task 8: Documentation

**Files:**
- Modify: `docs/usage.html`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Atlas section to `docs/usage.html`**

Append a new `<h2>Atlas</h2>` section after the existing usage content. Cover:

- What the atlas is (a small set of canonical SVG renders)
- Where files live (`atlas/{route-id}.svg` + `atlas/index.json`)
- A one-line embed snippet:
  ```html
  <img src="https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/atlas/shikoku-88.svg" alt="Shikoku 88 route map">
  ```
- License note: SVGs are CC-BY-SA 4.0; OSM/ODbL attribution is baked in and must be preserved.
- Pointer to `LICENSE-ATLAS` for the full text.

Use existing CSS classes only (no new styles).

- [ ] **Step 2: Update `CLAUDE.md` Commands section**

Add a single line under the existing commands block:

```bash
npm run atlas         # Render route atlases (SVG) for v1 routes
```

Add one paragraph at the bottom describing the atlas as a separate, optional pipeline that produces visual artifacts in `atlas/` from existing route data plus a fresh OSM extract.

- [ ] **Step 3: Commit**

```bash
git add docs/usage.html CLAUDE.md
git commit -m "atlas: document usage and embed snippet

Atlas section in usage docs. CLAUDE.md command and brief
description of the optional atlas pipeline."
```

---

### Task 9: Final verification

**Files:** None (read-only verification)

- [ ] **Step 1: Clean-clone reproducibility check**

In a scratch directory:

```bash
git clone <repo> open-pilgrimages-clean
cd open-pilgrimages-clean
npm install
npm run atlas
git status
```

Expected: pipeline completes successfully and produces three SVGs plus `atlas/index.json`. The regenerated files will differ from the committed ones because Overpass returns evolving OSM data and timestamps update — that is normal, not a failure. Geometry-level reproducibility is anchored to the *cached* OSM extract: re-running `npm run atlas:render -- --use-cache` against the same `.cache/atlas/*.json` should produce byte-identical SVGs apart from `generatedAt` / `osmExtractDate` / `fileSizeBytes` fields. (`--use-cache` belongs to the fetch step; render reads whatever cache exists and is deterministic given identical inputs.)

- [ ] **Step 2: Validation still passes**

```bash
npm run validate
```

Expected: passes for all routes plus the new `atlas/index.json` check. No regressions.

- [ ] **Step 3: Open each SVG in three tools**

- Browser (Chrome or Safari): render correct, attribution visible
- Figma: imports cleanly, layers selectable
- Inkscape: opens without warning dialogs, geometry intact

- [ ] **Step 4: Confirm acceptance criteria from spec**

Walk down the spec's Acceptance Criteria list and check each item:

- [ ] `npm install && npm run atlas` from clean clone exits 0
- [ ] Three SVGs in `atlas/` matching the layer/color spec
- [ ] Each SVG opens cleanly in browser, Figma, and Inkscape
- [ ] Visible OSM/ODbL attribution in all three
- [ ] `atlas/index.json` validates against `schema/atlas-index.schema.json`
- [ ] `npm run validate` passes
- [ ] Reviewer confirms each SVG is "on-brand quiet" — no neon, no noise, no Strava aesthetic
- [ ] Atlas section present in `docs/usage.html` with embed snippet and license note

- [ ] **Step 5: Open a PR**

Single PR titled `atlas: v1 — shikoku-88, camino-frances, kumano-kodo`. Body: link the spec and this plan; paste the three SVGs as preview images; include the embed snippet and license note.

---

## Out of Scope (Reiterated from Spec)

Do not implement in this plan, even if tempted:

- Waypoint layer (the `--waypoints` flag is reserved but ignored)
- Water/hydrography layer
- Variant route renders
- PNG/PDF/raster export
- Animated or interactive SVG
- Webfont embedding
- Auto-publishing to a CDN beyond what jsDelivr already provides
- Pilgrim app / `pilgrimages` site / anchor-reel integration
- Renders for the four other routes (`camino-norte`, `camino-primitivo`, `camino-portugues`, `camino-ingles`)

These are explicitly v2+ work.
