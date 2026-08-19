# Site Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the docs site so it accurately describes all 7 routes and 6 variants, renders the geometry it owns, and can no longer go stale without CI noticing.

**Architecture:** Page prose stays hand-written static HTML — no framework, no SSG. What gets generated is *assets*, not copy: a build step projects each `route.geojson` into a simplified SVG glyph, each `stages.json` into a stepped elevation profile, and each `stats.json` into a sparkline. A `check-site.ts` guard then asserts the hand-written numbers still match the data. The homepage hero draws all seven glyphs as a fixed constellation and rotates ink through them with a `stroke-dashoffset` trace animation.

**Tech Stack:** TypeScript, `tsx`, Node's built-in `node:test`, hand-written HTML/CSS, vanilla JS (no framework, no chart library, no map library).

**Prerequisite:** `docs/superpowers/plans/2026-08-19-ci-repair.md` must be complete. This plan assumes `npm test` exists and CI is green.

## Global Constraints

- **No new npm dependencies.** No `d3-geo`, no chart library, no map library. Projection and simplification are written here.
- **No runtime network requests** for glyphs, profiles, or sparklines. Everything is generated at build time and committed.
- **Hero stat numbers are exact, not rounded:** `7`, `159,624`, `12,576`, `109`. These are asserted by `check-site.ts`.
- **All internal links extensionless:** `/`, `/routes`, `/schema`, `/usage`, `/contribute`, `/{route-id}`. This applies to nav `href`s, `<link rel="canonical">`, and `og:url`.
- **Route detail pages are flat at the site root:** `docs/camino-frances.html` serves `/camino-frances`. Do not nest under `docs/routes/`.
- **`prefers-reduced-motion: reduce` starts no `requestAnimationFrame` loop at all.** Not a slower animation — none.
- **Per animation frame, write only `stroke-dashoffset` and `opacity`.** No layout reads, no DOM construction, no text changes.
- **Zero layout shift (CLS 0)** at every point in the hero cycle.
- **Dark mode pairings must clear WCAG AA** (4.5:1 body text, 3:1 large text).
- **Palette and type are fixed:** existing tokens in `docs/styles.css`, Cormorant Garamond + Lato. Extend; do not replace.
- **Do not modify anything under `routes/`.** This plan changes no route data.
- Every generated file is committed. `check-site.ts` verifies regenerating produces no diff.

## Source-of-Truth Figures

Verified against `npm run stats`. `check-site.ts` recomputes these rather than trusting the table.

| Route | Distance | Stages | Waypoints | Route points |
|---|---|---|---|---|
| camino-frances | 764 km | 33 | 2,957 | 33,192 |
| camino-norte | 784 km | 34 | 3,634 | 38,640 |
| camino-primitivo | 263 km | 11 | 732 | 13,303 |
| camino-portugues | 243 km | 11 | 1,634 | 13,722 |
| camino-ingles | 112 km | 6 | 482 | 4,823 |
| kumano-kodo | 39 km | 4 | 157 | 6,847 |
| shikoku-88 | 1,200 km | 10 | 2,980 | 49,097 |
| **Totals** | **3,405 km** | **109** | **12,576** | **159,624** |

Variant `camino-portugues/variants/coastal` is a **full** route (5 files, 110 km, 1,043 waypoints, 5,546 points) and is excluded from the totals above. The other five variants are metadata-only stubs.

## File Structure

| File | Responsibility |
|---|---|
| `scripts/site/project.ts` | Mercator projection, RDP simplification, fit-to-box, path serialization |
| `scripts/site/glyphs.ts` | `route.geojson` → glyph path data |
| `scripts/site/profiles.ts` | `stages.json` → stepped elevation SVG |
| `scripts/site/sparklines.ts` | `stats.json` → pilgrim trend SVG |
| `scripts/site/build-assets.ts` | Orchestrator; writes everything under `docs/assets/` |
| `scripts/site/check-site.ts` | Staleness guard |
| `scripts/stats.ts` | Refactored to export `computeStats()` |
| `docs/hero.js` | Constellation trace animation |
| `docs/styles.css` | Design system, dark mode, constellation, charts |
| `docs/{index,routes,schema,usage,contribute,404}.html` | Hand-written pages |
| `docs/{route-id}.html` × 7 | Hand-written detail pages |
| `docs/assets/` | Generated, committed |

---

### Task 1: Projection and simplification

Pure maths, no I/O. Everything downstream depends on these signatures.

**Files:**
- Create: `scripts/site/project.ts`
- Create: `scripts/site/project.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export type Point = [number, number]`
  - `export interface Box { size: number; padding: number }`
  - `export function mercator(lon: number, lat: number): Point`
  - `export function simplify(points: Point[], epsilon: number): Point[]`
  - `export function fitToBox(segments: Point[][], box: Box): Point[][]`
  - `export function toPathData(segments: Point[][], precision?: number): string`

- [ ] **Step 1: Write the failing test**

Create `scripts/site/project.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mercator, simplify, fitToBox, toPathData, type Point } from "./project.js";

test("mercator maps the origin to zero and is monotonic in both axes", () => {
  const [x0, y0] = mercator(0, 0);
  assert.ok(Math.abs(x0) < 1e-12);
  assert.ok(Math.abs(y0) < 1e-12);

  assert.ok(mercator(10, 0)[0] > mercator(0, 0)[0]);
  assert.ok(mercator(0, 10)[1] > mercator(0, 0)[1]);
  assert.ok(mercator(-10, 0)[0] < 0);
});

test("simplify keeps endpoints and drops collinear interior points", () => {
  const line: Point[] = [[0, 0], [1, 0], [2, 0], [3, 0]];
  assert.deepEqual(simplify(line, 0.01), [[0, 0], [3, 0]]);
});

test("simplify keeps a point that deviates beyond epsilon", () => {
  const line: Point[] = [[0, 0], [1, 5], [2, 0]];
  assert.equal(simplify(line, 1).length, 3);
  assert.equal(simplify(line, 10).length, 2);
});

test("simplify passes through lines of fewer than three points", () => {
  assert.deepEqual(simplify([[0, 0], [1, 1]], 1), [[0, 0], [1, 1]]);
  assert.deepEqual(simplify([[0, 0]], 1), [[0, 0]]);
});

test("fitToBox centres content inside the padded box preserving aspect", () => {
  // A wide, flat line: should span the padded width and sit vertically centred.
  const fitted = fitToBox([[[0, 0], [10, 0]]], { size: 200, padding: 20 });
  const [[ax, ay], [bx, by]] = fitted[0];

  assert.equal(ax, 20);
  assert.equal(bx, 180);
  assert.equal(ay, 100);
  assert.equal(by, 100);
});

test("fitToBox scales both axes by the same factor", () => {
  const fitted = fitToBox([[[0, 0], [10, 5]]], { size: 200, padding: 0 });
  const [[ax, ay], [bx, by]] = fitted[0];

  assert.equal(bx - ax, 200);
  assert.equal(ay - by, 100); // y is flipped: larger latitude draws higher
});

test("toPathData emits one moveto per segment at fixed precision", () => {
  const d = toPathData([[[0, 0], [1.23456, 2.5]], [[5, 5], [6, 6]]], 1);
  assert.equal(d, "M0.0,0.0 L1.2,2.5 M5.0,5.0 L6.0,6.0");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL — cannot resolve `./project.ts`.

- [ ] **Step 3: Implement `scripts/site/project.ts`**

```ts
export type Point = [number, number];

export interface Box {
  /** Width and height of the square viewBox. */
  size: number;
  /** Inset on every edge, in viewBox units. */
  padding: number;
}

/** WGS84 to Web Mercator, in radians. Scale is irrelevant — fitToBox normalizes. */
export function mercator(lon: number, lat: number): Point {
  return [
    (lon * Math.PI) / 180,
    Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
  ];
}

/** Ramer-Douglas-Peucker. Iterative to avoid blowing the stack on long routes. */
export function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    const [ax, ay] = points[lo];
    const [bx, by] = points[hi];
    const dx = bx - ax;
    const dy = by - ay;
    const norm = Math.hypot(dx, dy);

    let bestDistance = -1;
    let bestIndex = -1;

    for (let i = lo + 1; i < hi; i++) {
      const [px, py] = points[i];
      const distance =
        norm === 0
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * px - dx * py + bx * ay - by * ax) / norm;

      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    if (bestIndex !== -1 && bestDistance > epsilon) {
      keep[bestIndex] = true;
      stack.push([lo, bestIndex], [bestIndex, hi]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

/**
 * Scale every segment into a square box by a single shared factor, centred,
 * with the y axis flipped so higher latitudes draw higher on screen.
 */
export function fitToBox(segments: Point[][], box: Box): Point[][] {
  const all = segments.flat();
  if (all.length === 0) return segments;

  // Single pass, not Math.min(...xs): argument spread passes every element as
  // a separate call argument and throws RangeError past roughly 150k of them.
  // fitToBox runs on the *unsimplified* point set, which is the largest array
  // in the pipeline — the same stack-depth hazard simplify avoids by looping.
  // Seeding from all[0] is safe: the empty-input early return above guarantees
  // it exists whenever this loop runs.
  let minX = all[0][0];
  let maxX = minX;
  let minY = all[0][1];
  let maxY = minY;

  for (let i = 1; i < all.length; i++) {
    const [x, y] = all[i];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const inner = box.size - 2 * box.padding;
  const span = Math.max(maxX - minX, maxY - minY) || 1e-9;
  const scale = inner / span;

  const offsetX = box.padding + (inner - (maxX - minX) * scale) / 2;
  const offsetY = box.padding + (inner - (maxY - minY) * scale) / 2;

  return segments.map((segment) =>
    segment.map(([x, y]): Point => [
      (x - minX) * scale + offsetX,
      (maxY - y) * scale + offsetY,
    ]),
  );
}

export function toPathData(segments: Point[][], precision = 1): string {
  return segments
    .filter((segment) => segment.length >= 2)
    .map((segment) =>
      segment
        .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(precision)},${y.toFixed(precision)}`)
        .join(" "),
    )
    .join(" ");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: PASS — 7 new tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/site/project.ts scripts/site/project.test.ts
git commit -m "feat: add mercator projection and RDP simplification for route glyphs"
```

---

### Task 2: Route glyphs

**Files:**
- Create: `scripts/site/glyphs.ts`
- Create: `scripts/site/glyphs.test.ts`

**Interfaces:**
- Consumes: `mercator`, `simplify`, `fitToBox`, `toPathData`, `type Point`, `type Box` from `./project.ts`
- Produces:
  - `export const GLYPH_BOX: Box` — `{ size: 200, padding: 12 }`
  - `export interface Glyph { d: string; pointsIn: number; pointsOut: number }`
  - `export function segmentsOf(geojson: unknown): Point[][]`
  - `export function glyphFrom(geojson: unknown, box?: Box): Glyph`

**Reference measurements** from the validated prototype. Output counts may vary by a few points; orders of magnitude must match.

| Route | In | Out |
|---|---|---|
| camino-frances | 33,192 | ~89 |
| shikoku-88 | 49,097 | ~852 |
| kumano-kodo | 6,847 | ~305 |

- [ ] **Step 1: Write the failing test**

Create `scripts/site/glyphs.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { GLYPH_BOX, glyphFrom, segmentsOf } from "./glyphs.js";

const ROOT = join(import.meta.dirname, "..", "..");

function geojson(routeId: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, "routes", routeId, "route.geojson"), "utf-8"));
}

test("segmentsOf flattens LineString and MultiLineString alike", () => {
  const linear = segmentsOf(geojson("camino-frances"));
  const multi = segmentsOf(geojson("shikoku-88"));

  assert.equal(linear.length, 1);
  assert.ok(multi.length > 1, "shikoku-88 is a MultiLineString");
  assert.equal(linear[0].every((p) => p.length === 2), true);
});

test("glyphFrom simplifies camino-frances by more than two orders of magnitude", () => {
  const glyph = glyphFrom(geojson("camino-frances"));

  assert.equal(glyph.pointsIn, 33192);
  assert.ok(glyph.pointsOut > 40 && glyph.pointsOut < 200, `got ${glyph.pointsOut}`);
});

test("glyphFrom keeps every drawn coordinate inside the padded box", () => {
  for (const id of ["camino-frances", "shikoku-88", "kumano-kodo"]) {
    const d = glyphFrom(geojson(id)).d;
    const numbers = d.match(/-?\d+\.\d+/g)!.map(Number);

    for (const n of numbers) {
      assert.ok(
        n >= GLYPH_BOX.padding - 0.05 && n <= GLYPH_BOX.size - GLYPH_BOX.padding + 0.05,
        `${id}: coordinate ${n} escapes the padded box`,
      );
    }
  }
});

test("glyphFrom emits one moveto per source segment", () => {
  const shikoku = geojson("shikoku-88");
  const expected = segmentsOf(shikoku).filter((s) => s.length >= 2).length;
  const moves = glyphFrom(shikoku).d.match(/M/g)!.length;

  assert.equal(moves, expected);
});

test("glyphFrom is deterministic", () => {
  assert.equal(glyphFrom(geojson("kumano-kodo")).d, glyphFrom(geojson("kumano-kodo")).d);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL — cannot resolve `./glyphs.ts`.

- [ ] **Step 3: Implement `scripts/site/glyphs.ts`**

```ts
import { fitToBox, mercator, simplify, toPathData, type Box, type Point } from "./project.js";

export const GLYPH_BOX: Box = { size: 200, padding: 12 };

/**
 * Simplification tolerance as a fraction of the fitted box span. Tuned so the
 * longest route (shikoku-88, 49k points) stays under 10 KB of path data while
 * the shortest (kumano-kodo) keeps its branching structure legible.
 */
const EPSILON_FRACTION = 0.0016;

export interface Glyph {
  d: string;
  pointsIn: number;
  pointsOut: number;
}

interface GeoJsonLike {
  features?: Array<{ geometry?: { type?: string; coordinates?: unknown } }>;
}

export function segmentsOf(geojson: unknown): Point[][] {
  const features = (geojson as GeoJsonLike).features ?? [];
  const segments: Point[][] = [];

  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    const raw =
      geometry.type === "MultiLineString"
        ? (geometry.coordinates as number[][][])
        : geometry.type === "LineString"
          ? [geometry.coordinates as number[][]]
          : [];

    for (const line of raw) {
      segments.push(line.map(([lon, lat]): Point => [lon, lat]));
    }
  }

  return segments;
}

export function glyphFrom(geojson: unknown, box: Box = GLYPH_BOX): Glyph {
  const source = segmentsOf(geojson);
  const pointsIn = source.reduce((sum, s) => sum + s.length, 0);

  const projected = source.map((segment) =>
    segment.map(([lon, lat]) => mercator(lon, lat)),
  );
  const fitted = fitToBox(projected, box);

  const epsilon = (box.size - 2 * box.padding) * EPSILON_FRACTION;
  const simplified = fitted.map((segment) => simplify(segment, epsilon));
  const pointsOut = simplified.reduce(
    (sum, s) => sum + (s.length >= 2 ? s.length : 0),
    0,
  );

  return { d: toPathData(simplified), pointsIn, pointsOut };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: PASS — 5 new tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/site/glyphs.ts scripts/site/glyphs.test.ts
git commit -m "feat: project route geometry into simplified SVG glyph paths"
```

---

### Task 3: Stage elevation profiles

`route.geojson` coordinates are 2D — there is no altitude anywhere in the route geometry. Profiles come from `stages.json`, which carries `highPointMeters` and `lowPointMeters` per stage, and are drawn **stepped** rather than smoothed so the chart is honest about its resolution.

**Files:**
- Create: `scripts/site/profiles.ts`
- Create: `scripts/site/profiles.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export interface ProfileStage { name: string; distanceKm: number; highPointMeters: number; lowPointMeters: number }`
  - `export function stagesOf(stagesJson: unknown): ProfileStage[]`
  - `export function profileSvg(stages: ProfileStage[], width?: number, height?: number): string`

- [ ] **Step 1: Write the failing test**

Create `scripts/site/profiles.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { profileSvg, stagesOf, type ProfileStage } from "./profiles.js";

const ROOT = join(import.meta.dirname, "..", "..");

function stagesJson(routeId: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, "routes", routeId, "stages.json"), "utf-8"));
}

test("stagesOf reads every stage with its elevation bounds", () => {
  const stages = stagesOf(stagesJson("camino-primitivo"));

  assert.equal(stages.length, 11);
  assert.equal(stages[0].name, "Oviedo to Grado");
  assert.equal(stages[0].distanceKm, 25.2);
  assert.equal(stages[0].highPointMeters, 350);
  assert.equal(stages[0].lowPointMeters, 76);
});

test("stagesOf finds the Puerto del Palo high point on the Primitivo", () => {
  const peak = Math.max(...stagesOf(stagesJson("camino-primitivo")).map((s) => s.highPointMeters));
  assert.equal(peak, 1146);
});

test("stagesOf reads all 33 Frances stages", () => {
  assert.equal(stagesOf(stagesJson("camino-frances")).length, 33);
});

const SAMPLE: ProfileStage[] = [
  { name: "A", distanceKm: 10, highPointMeters: 100, lowPointMeters: 0 },
  { name: "B", distanceKm: 10, highPointMeters: 200, lowPointMeters: 50 },
];

test("profileSvg emits a viewBox sized to the arguments", () => {
  assert.match(profileSvg(SAMPLE, 800, 120), /viewBox="0 0 800 120"/);
});

test("profileSvg widths each step in proportion to its distance", () => {
  const uneven: ProfileStage[] = [
    { name: "short", distanceKm: 10, highPointMeters: 100, lowPointMeters: 0 },
    { name: "long", distanceKm: 30, highPointMeters: 100, lowPointMeters: 0 },
  ];
  // First step spans a quarter of the width, so the first horizontal run ends at 200.
  assert.match(profileSvg(uneven, 800, 100), /H200(\.0)?\b/);
});

test("profileSvg returns an empty string for no stages", () => {
  assert.equal(profileSvg([], 800, 100), "");
});

test("profileSvg never emits NaN", () => {
  const flat: ProfileStage[] = [
    { name: "flat", distanceKm: 5, highPointMeters: 100, lowPointMeters: 100 },
  ];
  assert.equal(profileSvg(flat, 800, 100).includes("NaN"), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL — cannot resolve `./profiles.ts`.

- [ ] **Step 3: Implement `scripts/site/profiles.ts`**

```ts
export interface ProfileStage {
  name: string;
  distanceKm: number;
  highPointMeters: number;
  lowPointMeters: number;
}

interface StagesLike {
  stages?: Array<{
    name?: { en?: string };
    distanceKm?: number;
    highPointMeters?: number;
    lowPointMeters?: number;
  }>;
}

export function stagesOf(stagesJson: unknown): ProfileStage[] {
  return ((stagesJson as StagesLike).stages ?? []).map((stage) => ({
    name: stage.name?.en ?? "",
    distanceKm: stage.distanceKm ?? 0,
    highPointMeters: stage.highPointMeters ?? 0,
    lowPointMeters: stage.lowPointMeters ?? 0,
  }));
}

/**
 * A stepped area chart: one flat run per stage, its height the stage's high
 * point, plotted against cumulative distance. Stepped rather than smoothed
 * because stages.json gives bounds per stage, not a continuous elevation
 * series — a smooth curve would imply resolution the data does not have.
 */
export function profileSvg(stages: ProfileStage[], width = 800, height = 120): string {
  if (stages.length === 0) return "";

  const totalKm = stages.reduce((sum, s) => sum + s.distanceKm, 0) || 1;
  const peak = Math.max(...stages.map((s) => s.highPointMeters), 1);
  const floor = Math.min(...stages.map((s) => s.lowPointMeters), 0);
  const range = peak - floor || 1;

  const y = (metres: number) => height - ((metres - floor) / range) * height;

  let cursor = 0;
  let d = `M0,${height.toFixed(1)}`;

  for (const stage of stages) {
    const top = y(stage.highPointMeters).toFixed(1);
    cursor += (stage.distanceKm / totalKm) * width;
    d += ` V${top} H${cursor.toFixed(1)}`;
  }

  d += ` V${height.toFixed(1)} Z`;

  return [
    `<svg viewBox="0 0 ${width} ${height}" class="profile" role="img"`,
    ` aria-label="Elevation profile: ${stages.length} stages, high point ${peak} m">`,
    `<path d="${d}" class="profile-fill"/>`,
    `</svg>`,
  ].join("");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: PASS — 7 new tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/site/profiles.ts scripts/site/profiles.test.ts
git commit -m "feat: render stepped stage elevation profiles from stages.json"
```

---

### Task 4: Pilgrim sparklines

**Files:**
- Create: `scripts/site/sparklines.ts`
- Create: `scripts/site/sparklines.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export interface TrendPoint { year: number; count: number }`
  - `export function trendOf(statsJson: unknown): TrendPoint[]`
  - `export function sparklineSvg(trend: TrendPoint[], width?: number, height?: number): string`

- [ ] **Step 1: Write the failing test**

Create `scripts/site/sparklines.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { sparklineSvg, trendOf, type TrendPoint } from "./sparklines.js";

const ROOT = join(import.meta.dirname, "..", "..");

function statsJson(routeId: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, "routes", routeId, "stats.json"), "utf-8"));
}

test("trendOf reads the full Frances series", () => {
  const trend = trendOf(statsJson("camino-frances"));

  assert.equal(trend.length, 41);
  assert.deepEqual(trend[0], { year: 1985, count: 690 });
  assert.deepEqual(trend[trend.length - 1], { year: 2025, count: 242179 });
});

test("trendOf returns points sorted by year", () => {
  const years = trendOf(statsJson("camino-norte")).map((p) => p.year);
  assert.deepEqual(years, [...years].sort((a, b) => a - b));
});

const SAMPLE: TrendPoint[] = [
  { year: 2000, count: 100 },
  { year: 2001, count: 200 },
  { year: 2002, count: 300 },
];

test("sparklineSvg spans the full width and inverts the y axis", () => {
  const svg = sparklineSvg(SAMPLE, 120, 30);

  assert.match(svg, /viewBox="0 0 120 30"/);
  assert.match(svg, /M0\.0,30\.0/);   // lowest count sits on the baseline
  assert.match(svg, /120\.0,0\.0/);   // highest count sits at the top
});

test("sparklineSvg handles a flat series without dividing by zero", () => {
  const flat: TrendPoint[] = [
    { year: 2000, count: 50 },
    { year: 2001, count: 50 },
  ];
  const svg = sparklineSvg(flat, 120, 30);

  assert.equal(svg.includes("NaN"), false);
  assert.equal(svg.includes("Infinity"), false);
});

test("sparklineSvg returns an empty string for fewer than two points", () => {
  assert.equal(sparklineSvg([], 120, 30), "");
  assert.equal(sparklineSvg([{ year: 2000, count: 1 }], 120, 30), "");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL — cannot resolve `./sparklines.ts`.

- [ ] **Step 3: Implement `scripts/site/sparklines.ts`**

```ts
export interface TrendPoint {
  year: number;
  count: number;
}

interface StatsLike {
  annualPilgrims?: { trend?: Array<{ year?: number; count?: number }> };
}

export function trendOf(statsJson: unknown): TrendPoint[] {
  return ((statsJson as StatsLike).annualPilgrims?.trend ?? [])
    .map((p) => ({ year: p.year ?? 0, count: p.count ?? 0 }))
    .sort((a, b) => a.year - b.year);
}

export function sparklineSvg(trend: TrendPoint[], width = 120, height = 30): string {
  if (trend.length < 2) return "";

  const counts = trend.map((p) => p.count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const range = max - min || 1;

  const points = trend.map((point, i) => {
    const x = (i / (trend.length - 1)) * width;
    const y = height - ((point.count - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const first = trend[0];
  const last = trend[trend.length - 1];

  return [
    `<svg viewBox="0 0 ${width} ${height}" class="spark" role="img"`,
    ` aria-label="Pilgrims per year, ${first.year} to ${last.year}:`,
    ` ${first.count.toLocaleString("en-US")} rising to ${last.count.toLocaleString("en-US")}">`,
    `<path d="M${points.join(" L")}" class="spark-line" fill="none"/>`,
    `</svg>`,
  ].join("");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: PASS — 5 new tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/site/sparklines.ts scripts/site/sparklines.test.ts
git commit -m "feat: render pilgrim count sparklines from stats.json"
```

---

### Task 5: Extract `computeStats`

`scripts/stats.ts` currently computes aggregates inside a print loop. `check-site.ts` needs the same numbers, and a second copy would drift. Extract the aggregation; keep the console output identical.

**Files:**
- Modify: `scripts/stats.ts`
- Create: `scripts/stats.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:

```ts
export interface RouteStats {
  id: string;
  name: string;          // metadata.name.en
  topology: string;
  tradition: string;
  distanceKm: number;    // metadata.overview.distanceKm
  stageSumKm: number;    // sum of stages[].distanceKm, rounded to 1dp
  stages: number;
  waypoints: number;
  routePoints: number;
  countries: string[];
  interiorDone: number;  // stages with interior content
  interiorTotal: number;
  variants: string[];
}

export interface DatasetStats {
  routes: RouteStats[];
  totals: {
    routes: number;
    stages: number;
    waypoints: number;
    routePoints: number;
    distanceKm: number;
  };
}

export function computeStats(root: string): DatasetStats;
```

Every field above is already printed by today's `main()`. The refactor must
cover all of them or console output will change, which Step 5 checks.

- [ ] **Step 1: Write the failing test**

Create `scripts/stats.test.ts`. These are the exact numbers the hero and README claim:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "path";
import { computeStats } from "./stats.js";

const ROOT = join(import.meta.dirname, "..");

test("totals match the figures published on the site and README", () => {
  const { totals } = computeStats(ROOT);

  assert.equal(totals.routes, 7);
  assert.equal(totals.routePoints, 159624);
  assert.equal(totals.waypoints, 12576);
  assert.equal(totals.stages, 109);
});

test("per-route figures match npm run stats", () => {
  const byId = new Map(computeStats(ROOT).routes.map((r) => [r.id, r]));

  assert.equal(byId.get("camino-frances")!.routePoints, 33192);
  assert.equal(byId.get("camino-frances")!.waypoints, 2957);
  assert.equal(byId.get("camino-frances")!.stages, 33);
  assert.equal(byId.get("shikoku-88")!.routePoints, 49097);
  assert.equal(byId.get("kumano-kodo")!.waypoints, 157);
  assert.equal(byId.get("camino-ingles")!.distanceKm, 112);
});

test("variants are listed but excluded from totals", () => {
  const stats = computeStats(ROOT);
  const portugues = stats.routes.find((r) => r.id === "camino-portugues")!;

  assert.deepEqual(portugues.variants.sort(), ["coastal", "espiritual", "lisboa"]);
  // 13,722 is the parent route alone — coastal's 5,546 is not folded in.
  assert.equal(portugues.routePoints, 13722);
});

test("importing the module does not print or exit", () => {
  assert.equal(typeof computeStats, "function");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL — `computeStats` is not exported from `./stats.ts`.

- [ ] **Step 3: Refactor `scripts/stats.ts`**

Read the existing file first and preserve its console output verbatim. Restructure so that:

1. The interfaces above are exported.
2. `export function computeStats(root: string): DatasetStats` does all counting — reading `metadata.json`, `stages.json`, `waypoints.geojson`, and `route.geojson` per route directory, counting coordinates across both `LineString` and `MultiLineString` geometries.
3. `main()` calls `computeStats(ROOT)` and prints, producing byte-identical output to today's.
4. The bare `main();` call is replaced with the same guard used in `build-index.ts`:

```ts
if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main();
}
```

Reuse `segmentsOf` from `./site/glyphs.ts` for coordinate counting rather than writing a second geometry walker.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: PASS — 4 new tests.

- [ ] **Step 5: Verify console output is unchanged**

```bash
git stash && npm run stats > /tmp/stats-before.txt 2>&1
git stash pop && npm run stats > /tmp/stats-after.txt 2>&1
diff /tmp/stats-before.txt /tmp/stats-after.txt && echo "IDENTICAL"
```

Expected: `IDENTICAL`.

- [ ] **Step 6: Commit**

```bash
git add scripts/stats.ts scripts/stats.test.ts
git commit -m "refactor: extract computeStats so the site guard can reuse it"
```

---

### Task 6: Asset build orchestrator

**Files:**
- Create: `scripts/site/build-assets.ts`
- Modify: `package.json`
- Modify: `.gitignore` (verify `docs/assets/` is **not** ignored)

**Interfaces:**
- Consumes: `glyphFrom` (Task 2), `profileSvg`/`stagesOf` (Task 3), `sparklineSvg`/`trendOf` (Task 4), `computeStats` (Task 5)
- Produces:
  - `export function buildAssets(root: string): { glyphs: number; profiles: number; sparklines: number }`

**Outputs written:**

| Path | Contents |
|---|---|
| `docs/assets/glyphs.js` | `window.OP_GLYPHS = { "<route-id>": "<path d>" };` |
| `docs/assets/routes/{id}.svg` | Standalone glyph, for cards and detail headers |
| `docs/assets/profiles/{id}.svg` | Stepped elevation profile |
| `docs/assets/sparklines/{id}.svg` | Pilgrim trend |

`glyphs.js` is a plain script, not JSON fetched at runtime: a blocking `<script>` in `<head>` means the hero has its geometry before first paint, with no fetch, no race, and no flash of an empty hero.

Cover all 7 top-level routes plus `camino-portugues/variants/coastal`, keyed `camino-portugues-coastal`.

- [ ] **Step 1: Write the failing test**

Create `scripts/site/build-assets.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { buildAssets } from "./build-assets.js";

const ROOT = join(import.meta.dirname, "..", "..");
const ASSETS = join(ROOT, "docs", "assets");

const IDS = [
  "camino-frances", "camino-ingles", "camino-norte", "camino-portugues",
  "camino-primitivo", "kumano-kodo", "shikoku-88", "camino-portugues-coastal",
];

test("buildAssets writes a glyph for every route and the coastal variant", () => {
  const counts = buildAssets(ROOT);
  assert.equal(counts.glyphs, 8);

  const glyphs = readFileSync(join(ASSETS, "glyphs.js"), "utf-8");
  for (const id of IDS) {
    assert.ok(glyphs.includes(`"${id}"`), `glyphs.js missing ${id}`);
    assert.ok(existsSync(join(ASSETS, "routes", `${id}.svg`)), `missing ${id}.svg`);
  }
});

test("glyphs.js assigns to window.OP_GLYPHS and parses as a script", () => {
  buildAssets(ROOT);
  const source = readFileSync(join(ASSETS, "glyphs.js"), "utf-8");

  assert.match(source, /^window\.OP_GLYPHS = \{/);
  assert.equal(source.includes("NaN"), false);

  // Executing it must define exactly the eight expected keys.
  const fakeWindow: Record<string, unknown> = {};
  new Function("window", source)(fakeWindow);

  const glyphMap = fakeWindow.OP_GLYPHS as Record<string, string>;
  assert.deepEqual(Object.keys(glyphMap).sort(), [...IDS].sort());
  for (const id of IDS) {
    assert.match(glyphMap[id], /^M[\d.]/, `${id} path data is malformed`);
  }
});

test("buildAssets is idempotent", () => {
  buildAssets(ROOT);
  const first = readFileSync(join(ASSETS, "glyphs.js"), "utf-8");
  buildAssets(ROOT);
  const second = readFileSync(join(ASSETS, "glyphs.js"), "utf-8");

  assert.equal(first, second);
});

test("every route with stats gets a sparkline and every route a profile", () => {
  const counts = buildAssets(ROOT);

  assert.equal(counts.profiles >= 7, true);
  assert.equal(counts.sparklines >= 7, true);
  assert.ok(existsSync(join(ASSETS, "profiles", "camino-primitivo.svg")));
  assert.ok(existsSync(join(ASSETS, "sparklines", "camino-frances.svg")));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL — cannot resolve `./build-assets.ts`.

- [ ] **Step 3: Implement `scripts/site/build-assets.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { GLYPH_BOX, glyphFrom } from "./glyphs.js";
import { profileSvg, stagesOf } from "./profiles.js";
import { sparklineSvg, trendOf } from "./sparklines.js";

const ROOT = join(import.meta.dirname, "..", "..");

interface Target {
  key: string;
  dir: string;
}

/** Every top-level route, plus the coastal variant, which is a full route. */
function targets(root: string): Target[] {
  const routesDir = join(root, "routes");
  const list: Target[] = [];

  for (const entry of readdirSync(routesDir)) {
    const dir = join(routesDir, entry);
    if (!statSync(dir).isDirectory()) continue;
    if (!existsSync(join(dir, "metadata.json"))) continue;
    list.push({ key: entry, dir });
  }

  const coastal = join(routesDir, "camino-portugues", "variants", "coastal");
  if (existsSync(join(coastal, "route.geojson"))) {
    list.push({ key: "camino-portugues-coastal", dir: coastal });
  }

  // Sorted so glyphs.js is byte-stable regardless of filesystem ordering.
  return list.sort((a, b) => a.key.localeCompare(b.key));
}

function readJson(path: string): unknown | null {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;
}

/** Inline SVG from the generators has no xmlns; standalone files need one. */
function standalone(svg: string): string {
  return svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ') + "\n";
}

function glyphSvg(d: string): string {
  const s = GLYPH_BOX.size;
  return standalone(
    `<svg viewBox="0 0 ${s} ${s}" fill="none" stroke="currentColor" stroke-width="1.9"` +
      ` stroke-linecap="round" stroke-linejoin="round">` +
      `<path pathLength="1" d="${d}"/></svg>`,
  );
}

export function buildAssets(root: string): {
  glyphs: number;
  profiles: number;
  sparklines: number;
} {
  const out = join(root, "docs", "assets");
  for (const sub of ["routes", "profiles", "sparklines"]) {
    mkdirSync(join(out, sub), { recursive: true });
  }

  const glyphs: Array<[string, string]> = [];
  let profiles = 0;
  let sparklines = 0;

  for (const { key, dir } of targets(root)) {
    // Metadata-only stubs have no geometry, and not every route has stats.
    // Missing inputs are skipped, never thrown on.
    const geo = readJson(join(dir, "route.geojson"));
    if (geo) {
      const { d } = glyphFrom(geo);
      glyphs.push([key, d]);
      writeFileSync(join(out, "routes", `${key}.svg`), glyphSvg(d));
    }

    const stages = readJson(join(dir, "stages.json"));
    if (stages) {
      const svg = profileSvg(stagesOf(stages));
      if (svg) {
        writeFileSync(join(out, "profiles", `${key}.svg`), standalone(svg));
        profiles++;
      }
    }

    const stats = readJson(join(dir, "stats.json"));
    if (stats) {
      const svg = sparklineSvg(trendOf(stats));
      if (svg) {
        writeFileSync(join(out, "sparklines", `${key}.svg`), standalone(svg));
        sparklines++;
      }
    }
  }

  const body = glyphs
    .map(([key, d]) => `  ${JSON.stringify(key)}: ${JSON.stringify(d)}`)
    .join(",\n");
  writeFileSync(join(out, "glyphs.js"), `window.OP_GLYPHS = {\n${body}\n};\n`);

  return { glyphs: glyphs.length, profiles, sparklines };
}

function main() {
  const counts = buildAssets(ROOT);
  console.log(
    `Wrote ${counts.glyphs} glyph(s), ${counts.profiles} profile(s), ` +
      `${counts.sparklines} sparkline(s)`,
  );
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main();
}
```

Note `stroke="currentColor"` on the standalone glyphs — it lets CSS recolour them for dark mode without regenerating anything. `pathLength="1"` is set in markup, both here and in the hero, so `stroke-dasharray` works in 0–1 units with no `getTotalLength()` call at runtime.

Add to `package.json` scripts:

```json
"build-assets": "tsx scripts/site/build-assets.ts",
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: PASS — 4 new tests.

- [ ] **Step 5: Verify sizes are sane**

Run: `npm run build-assets && du -sh docs/assets && wc -c docs/assets/glyphs.js`

Expected: `glyphs.js` roughly 20–30 KB. If it exceeds 60 KB, raise `EPSILON_FRACTION` in `glyphs.ts` and re-run — do not ship an oversized hero payload.

- [ ] **Step 6: Commit**

```bash
git add scripts/site/build-assets.ts scripts/site/build-assets.test.ts package.json docs/assets
git commit -m "feat: generate route glyphs, elevation profiles, and sparklines"
```

---

### Task 7: Site staleness guard

The reason the site rotted for five releases. This must fail loudly when data and copy diverge.

**Files:**
- Create: `scripts/site/check-site.ts`
- Create: `scripts/site/check-site.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `computeStats` (Task 5)
- Produces:
  - `export interface Problem { file: string; message: string }`
  - `export interface PageOverrides { indexHtml?: string; routesHtml?: string }`
  - `export function checkSite(root: string, overrides?: PageOverrides): Problem[]`

**Assertions it must make:**

1. Every route ID in `index.json` appears in `docs/routes.html`.
2. Every route ID has a detail page at `docs/{id}.html`.
3. Every route ID has a glyph in `docs/assets/glyphs.js`.
4. The four hero numbers in `docs/index.html` equal `computeStats` totals, formatted with `toLocaleString("en-US")`.
5. No route ID collides with a reserved page name (`index`, `routes`, `schema`, `usage`, `contribute`, `404`, `styles`, `hero`).
6. No internal `href` in any `docs/*.html` ends in `.html` (extensionless rule), ignoring external URLs and anchors.

- [ ] **Step 1: Write the failing test**

Create `scripts/site/check-site.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "path";
import { checkSite } from "./check-site.js";

const ROOT = join(import.meta.dirname, "..", "..");

test("the committed site passes every check", () => {
  const problems = checkSite(ROOT);
  assert.deepEqual(problems, [], JSON.stringify(problems, null, 2));
});

test("checkSite reports a route missing from the catalog", () => {
  const problems = checkSite(ROOT, {
    routesHtml: "<html>only camino-frances lives here</html>",
  });
  assert.ok(problems.some((p) => p.message.includes("shikoku-88")));
});

test("checkSite reports a stale hero number", () => {
  const problems = checkSite(ROOT, {
    indexHtml: `<span class="stat-number">3</span><span class="stat-label">Routes</span>`,
  });
  assert.ok(problems.some((p) => p.message.includes("Routes")));
});

test("checkSite reports an internal link that kept its .html extension", () => {
  const problems = checkSite(ROOT, {
    indexHtml: `<a href="routes.html">Routes</a>`,
  });
  assert.ok(problems.some((p) => p.message.includes(".html")));
});
```

To keep the guard testable without writing fixture files, `checkSite` takes an
optional second argument overriding page sources:

```ts
export function checkSite(
  root: string,
  overrides?: { indexHtml?: string; routesHtml?: string },
): Problem[]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL — cannot resolve `./check-site.ts`. The first test will also fail until Tasks 8–13 land; that is expected and is the point.

- [ ] **Step 3: Implement `scripts/site/check-site.ts`**

```ts
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { computeStats } from "../stats.js";

const ROOT = join(import.meta.dirname, "..", "..");

const RESERVED = new Set([
  "index", "routes", "schema", "usage", "contribute", "404", "styles", "hero",
]);

export interface Problem {
  file: string;
  message: string;
}

export interface PageOverrides {
  indexHtml?: string;
  routesHtml?: string;
}

/** Hero stat label -> the totals key it must equal. */
const HERO_FIELDS: Record<string, keyof ReturnType<typeof computeStats>["totals"]> = {
  "Routes": "routes",
  "GPS Points": "routePoints",
  "Waypoints": "waypoints",
  "Stages": "stages",
};

export function checkSite(root: string, overrides: PageOverrides = {}): Problem[] {
  const problems: Problem[] = [];
  const docs = join(root, "docs");
  const add = (file: string, message: string) => problems.push({ file, message });

  const read = (name: string) => {
    const path = join(docs, name);
    return existsSync(path) ? readFileSync(path, "utf-8") : "";
  };

  const index = JSON.parse(readFileSync(join(root, "index.json"), "utf-8")) as {
    routes: Array<{ id: string }>;
  };
  const ids = index.routes.map((r) => r.id);

  const indexHtml = overrides.indexHtml ?? read("index.html");
  const routesHtml = overrides.routesHtml ?? read("routes.html");
  const glyphs = existsSync(join(docs, "assets", "glyphs.js"))
    ? readFileSync(join(docs, "assets", "glyphs.js"), "utf-8")
    : "";

  for (const id of ids) {
    if (!routesHtml.includes(id)) {
      add("docs/routes.html", `route "${id}" is in index.json but absent from the catalog`);
    }
    if (!existsSync(join(docs, `${id}.html`))) {
      add(`docs/${id}.html`, `route "${id}" has no detail page`);
    }
    if (!glyphs.includes(`"${id}"`)) {
      add("docs/assets/glyphs.js", `route "${id}" has no generated glyph — run npm run build-assets`);
    }
    if (RESERVED.has(id)) {
      add("index.json", `route id "${id}" collides with a reserved page name`);
    }
  }

  // Hero figures must equal live aggregates, not a number someone typed once.
  const { totals } = computeStats(root);
  const heroPattern =
    /<span class="stat-number">([\d,]+)<\/span>\s*<span class="stat-label">([^<]+)<\/span>/g;
  const seen = new Set<string>();

  for (const match of indexHtml.matchAll(heroPattern)) {
    const [, rendered, label] = match;
    const key = HERO_FIELDS[label.trim()];
    if (!key) continue;

    seen.add(label.trim());
    const expected = totals[key].toLocaleString("en-US");
    if (rendered !== expected) {
      add("docs/index.html", `hero stat "${label.trim()}" reads ${rendered}, data says ${expected}`);
    }
  }

  for (const label of Object.keys(HERO_FIELDS)) {
    if (!seen.has(label)) {
      add("docs/index.html", `hero stat "${label}" is missing`);
    }
  }

  // Every internal link must be extensionless.
  const pages = overrides.indexHtml || overrides.routesHtml
    ? [["docs/index.html", indexHtml], ["docs/routes.html", routesHtml]] as const
    : readdirSync(docs)
        .filter((f) => f.endsWith(".html"))
        .map((f) => [`docs/${f}`, readFileSync(join(docs, f), "utf-8")] as const);

  for (const [file, html] of pages) {
    for (const match of html.matchAll(/href="([^"]+)"/g)) {
      const href = match[1];
      if (/^(https?:|mailto:|#)/.test(href)) continue;
      if (href.endsWith(".html")) {
        add(file, `internal link "${href}" should be extensionless`);
      }
    }
  }

  return problems;
}

function main() {
  const problems = checkSite(ROOT);

  for (const problem of problems) {
    console.error(`${problem.file}: ${problem.message}`);
  }

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s). Site data is out of sync.`);
    process.exit(1);
  }
  console.log("Site is in sync with route data.");
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main();
}
```

Add to `package.json` scripts:

```json
"check-site": "tsx scripts/site/check-site.ts",
```

- [ ] **Step 4: Run and expect real failures**

Run: `npm run check-site`

Expected: exit code 1, listing the 4 missing routes and the stale hero numbers. **This is success for this task** — the guard correctly detects today's rot. Tasks 8–13 drive it to zero.

- [ ] **Step 5: Commit**

```bash
git add scripts/site/check-site.ts scripts/site/check-site.test.ts package.json
git commit -m "feat: add site staleness guard for route coverage and hero figures"
```

---

### Task 8: Design system and dark mode

**Files:**
- Modify: `docs/styles.css`

Extend the existing stylesheet; do not rewrite the palette or type pairing.

- [ ] **Step 1: Add dark mode tokens**

Wrap the existing `:root` values in a light default and add a dark counterpart, driven by `prefers-color-scheme` and overridable by a `data-theme` attribute on `<html>`:

```css
:root {
  color-scheme: light dark;
  /* existing light tokens stay exactly as they are */
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --parchment: #1C1914;
    --ink: #E8E2D8;
    --stone: #A89477;
    --fog: #4A443C;
    --rust: #C67F63;
    --dawn: #C4956A;
    --moss: #93A487;
  }
}

:root[data-theme="dark"] {
  /* same overrides as the media query block */
}
```

`--rust` lightens to `#C67F63` and `--ink` inverts to `#E8E2D8` specifically to hold contrast on the dark background.

- [ ] **Step 2: Add fluid type and the full-bleed escape hatch**

```css
html { font-size: clamp(16px, 0.9rem + 0.25vw, 19px); }

h1 { font-size: clamp(1.9rem, 1.4rem + 2vw, 3rem); }
h2 { font-size: clamp(1.4rem, 1.2rem + 0.8vw, 1.8rem); }

.full-bleed {
  width: 100vw;
  margin-left: 50%;
  transform: translateX(-50%);
}

.scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }
```

`.scroll-x` wraps the wide waypoint coverage table so it scrolls rather than overflowing.

- [ ] **Step 3: Add constellation, chart, and theme-toggle styles**

Required rules:

- `.constellation` — `position: relative`, fixed height, `overflow: hidden`; child `svg` absolutely positioned.
- `.glyph-fog` — `stroke: var(--fog)`, `fill: none`, `stroke-width: 1.4`.
- `.glyph-ink` — `stroke: var(--ink)`, `fill: none`, `stroke-width: 1.9`, `stroke-dasharray: 1 1`, `stroke-dashoffset: 1`.
- `.constellation-caption` — `position: absolute`, `right`/`bottom` offsets, `font-size: 9.5px`, `text-transform: uppercase`, `letter-spacing: 0.18em`, `color: var(--stone)`, `opacity: 0`, `transition: opacity .5s ease`, `pointer-events: none`. Absolute positioning is what guarantees CLS 0.
- `.profile-fill` — `fill: var(--fog)`, `stroke: var(--stone)`, `stroke-width: 1`.
- `.spark-line` — `stroke: var(--rust)`, `stroke-width: 1.5`, `fill: none`.
- `.theme-toggle` — nav-styled button.
- `@media (max-width: 700px)` — constellation collapses to one centred glyph; hide all but the featured slot.

- [ ] **Step 4: Verify contrast**

Check every text/background pairing in both themes at https://webaim.org/resources/contrastchecker/. Body text needs 4.5:1, large text 3:1. Record the measured ratios in the commit message. If `--stone` on `--parchment` falls short in either theme, darken/lighten it until it passes — do not ship failing contrast.

- [ ] **Step 5: Commit**

```bash
git add docs/styles.css
git commit -m "feat: add dark mode, fluid type, and full-bleed layout to the site"
```

---

### Task 9: Constellation hero animation

The prototype behind this is validated. Reproduce its behavior exactly.

**Files:**
- Create: `docs/hero.js`

**Motion contract:**

| Phase | Duration | `p` (`stroke-dashoffset`) |
|---|---|---|
| Draw | 2600 ms | 1 → 0 |
| Hold | 1700 ms | 0 |
| Exit | 900 ms | 0 → −1 |

With `stroke-dasharray="1 1"` and `pathLength="1"`, a single parameter running 1 → −1 draws the line and then carries it off its own end, with no seam between the two.

- [ ] **Step 1: Implement `docs/hero.js`**

```js
(function () {
  var root = document.querySelector("[data-constellation]");
  if (!root || !window.OP_GLYPHS) return;

  var inks = [].slice.call(root.querySelectorAll(".glyph-ink"));
  var caps = [].slice.call(root.querySelectorAll(".constellation-caption"));
  if (inks.length === 0) return;

  // Reduce Motion: render one route inked and start no loop whatsoever.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    inks[0].style.strokeDashoffset = 0;
    if (caps[0]) caps[0].style.opacity = 1;
    return;
  }

  var DRAW = 2600, HOLD = 1700, EXIT = 900, LAP = DRAW + HOLD + EXIT;
  var index = 0, elapsed = 0, last = 0, paused = false, captioned = -1;

  function caption(n) {
    if (captioned === n) return;
    captioned = n;
    for (var k = 0; k < caps.length; k++) caps[k].style.opacity = k === n ? 1 : 0;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    // A backgrounded tab throttles rAF; without clamping, the first frame back
    // would leap the animation forward. Clamped, returning is seamless.
    var dt = Math.min(now - last, 48);
    last = now;
    if (paused) return;

    elapsed += dt;
    while (elapsed >= LAP) {
      elapsed -= LAP;
      index = (index + 1) % inks.length;
    }

    var p = elapsed < DRAW ? 1 - elapsed / DRAW
          : elapsed < DRAW + HOLD ? 0
          : -(elapsed - DRAW - HOLD) / EXIT;

    for (var i = 0; i < inks.length; i++) {
      inks[i].style.strokeDashoffset = i === index ? p : 1;
    }
    caption(elapsed > DRAW * 0.55 && elapsed < LAP - EXIT * 0.6 ? index : -1);
  }
  requestAnimationFrame(frame);

  function pause() { paused = true; }
  function resume() { paused = false; }
  root.addEventListener("pointerenter", pause);
  root.addEventListener("pointerleave", resume);
  root.addEventListener("focusin", pause);
  root.addEventListener("focusout", resume);
})();
```

- [ ] **Step 2: Add the theme toggle**

Append to `docs/hero.js` — kept in the same file because both are tiny and load together:

```js
(function () {
  var KEY = "op-theme";
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  if (stored) document.documentElement.setAttribute("data-theme", stored);

  var button = document.querySelector(".theme-toggle");
  if (!button) return;

  button.addEventListener("click", function () {
    var dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var current = document.documentElement.getAttribute("data-theme") || (dark ? "dark" : "light");
    var next = current === "dark" ? "light" : "dark";

    document.documentElement.setAttribute("data-theme", next);
    button.setAttribute("aria-pressed", String(next === "dark"));
    try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
  });
})();
```

- [ ] **Step 3: Commit**

```bash
git add docs/hero.js
git commit -m "feat: add constellation trace animation and theme toggle"
```

---

### Task 10: Homepage

**Files:**
- Modify: `docs/index.html`

- [ ] **Step 1: Rewrite the homepage**

Required changes:

- `<head>`: load `assets/glyphs.js` with a **blocking** `<script src="assets/glyphs.js"></script>` before `hero.js` (which is `defer`). Update `og:description` and `<meta name="description">` to describe seven routes across three traditions, not three routes.
- `<link rel="canonical" href="https://open.pilgrimag.es/">`, and every nav `href` extensionless (`/`, `/routes`, `/schema`, `/usage`, `/contribute`).
- Add the `.theme-toggle` button to the nav.
- Hero: a `.constellation` element carrying `data-constellation`, containing for each of the seven routes an absolutely-positioned `<svg viewBox="0 0 200 200">` with two `<path>` children — `.glyph-fog` and `.glyph-ink`, both with `pathLength="1"` and `d` injected from `window.OP_GLYPHS`. Seven `.constellation-caption` elements, one per route, in the same order.
- Hero stats become exactly `7`, `159,624`, `12,576`, `109`. Delete the "Stats are hardcoded" comment and replace it with a pointer to `npm run check-site`.
- Route grid: seven `.route-card` entries, each with its glyph, correct distance/topology/country/stage count from the Source-of-Truth table, and a tradition badge. Francés is **764 km**, not 790. Kumano is **39 km**, not 38.
- Kumano's status line no longer says Kohechi and Iseji are missing — they exist as metadata-only stubs. Say that instead.

Slot positions validated in the prototype, as percentages of the constellation box:

| Route | left | top | size |
|---|---|---|---|
| camino-norte | 36.3% | 3.5% | 262 |
| camino-frances | 57.3% | 23% | 262 |
| shikoku-88 | 79.6% | 4.5% | 208 |
| kumano-kodo | 37.7% | 45% | 196 |
| camino-portugues | 53.5% | 49% | 196 |
| camino-primitivo | 67.1% | 52.5% | 184 |
| camino-ingles | 82.5% | 55% | 166 |

- [ ] **Step 2: Verify in a browser**

Serve locally and open it:

```bash
python3 -m http.server 8000 --directory docs
```

Confirm: the constellation renders, ink rotates route to route, the caption fades in and out bottom-right, hovering pauses, and no layout shifts during a full 37-second lap.

- [ ] **Step 3: Verify Reduce Motion**

Enable macOS Settings → Accessibility → Display → Reduce Motion, reload, and confirm one route renders inked and **nothing animates**. Confirm in DevTools that no `requestAnimationFrame` loop is running.

- [ ] **Step 4: Verify the tab-away behavior**

Switch to another tab for two minutes, return, and confirm the animation continues from where it was with no visible jump.

- [ ] **Step 5: Commit**

```bash
git add docs/index.html
git commit -m "feat: rebuild homepage with rotating route constellation and current figures"
```

---

### Task 11: Route catalog and comparison table

**Files:**
- Modify: `docs/routes.html`

- [ ] **Step 1: Rewrite the catalog**

- Subtitle: "Three pilgrimages" → **"Seven pilgrimages. Three traditions. Three topologies."**
- Replace the three long inline sections with seven `.route-card` entries linking to `/{route-id}`, each showing its glyph, distance, topology, stages, and waypoints from the Source-of-Truth table.
- Add a sortable comparison table of all seven: distance, typical days (`overview.estimatedDays.typical`), difficulty (`overview.difficulty`), stages, waypoints, best months (`overview.bestMonths`).
- Add the waypoint coverage table from the README, wrapped in `.full-bleed` and `.scroll-x`.
- Add a variants table: `coastal` marked full route; `a-coruna`, `espiritual`, `lisboa`, `iseji`, `kohechi` marked metadata only.
- Update `<title>`, `<meta name="description">`, and OG tags to say seven.

Sorting is progressive enhancement: the table must ship already sorted by distance descending and remain readable with JS disabled. Sort handlers are `<th>` buttons with `aria-sort`.

- [ ] **Step 2: Verify sorting works and degrades**

Load the page, click each sortable header, confirm ordering flips and `aria-sort` updates. Then disable JavaScript and confirm the table still renders sorted by distance.

- [ ] **Step 3: Commit**

```bash
git add docs/routes.html
git commit -m "feat: rebuild route catalog with all seven routes and a comparison table"
```

---

### Task 12: Route detail pages

Seven pages, one per top-level route. Variants are sections inside their parent, not separate pages.

**Files:**
- Create: `docs/camino-frances.html`, `docs/camino-norte.html`, `docs/camino-primitivo.html`, `docs/camino-portugues.html`, `docs/camino-ingles.html`, `docs/kumano-kodo.html`, `docs/shikoku-88.html`

- [ ] **Step 1: Write `docs/camino-primitivo.html` as the exemplar**

Build this one completely first; the remaining six follow its structure exactly. Section order and data source per section:

| Section | Source |
|---|---|
| Glyph header (`.full-bleed`) | `docs/assets/routes/{id}.svg` |
| Title and description | `metadata.json` → `name.en`, `description.en` |
| Key facts table | `overview.*` — distance, days, topology, difficulty, countries, elevation range, start/end points |
| Elevation profile | `docs/assets/profiles/{id}.svg`, captioned with high point and stage count |
| Stage table | `stages.json` — index, name, distance, ascent/descent, difficulty, accommodation density |
| Waypoint breakdown | README's coverage table column for this route |
| Pilgrim trend | `docs/assets/sparklines/{id}.svg` plus the `stats.json` headline and source attribution |
| Tradition and credential | `tradition.*` — saint, origin, UNESCO status, credential system |
| Variants | Parent's `variants/` entries, if any |
| Files and CDN | The five per-route files and their jsDelivr URLs |

Every page needs `<link rel="canonical" href="https://open.pilgrimag.es/{route-id}">`, extensionless nav, matching OG tags, and the ODbL attribution block.

- [ ] **Step 2: Verify the exemplar**

Serve locally, open `http://localhost:8000/camino-primitivo.html`, and confirm the glyph, profile, and sparkline all render, and that Puerto del Palo shows as the 1,146 m peak.

- [ ] **Step 3: Commit the exemplar**

```bash
git add docs/camino-primitivo.html
git commit -m "feat: add Camino Primitivo route detail page"
```

- [ ] **Step 4: Write the remaining six**

Same structure, per-route content from each route's own `metadata.json`, `stages.json`, and `stats.json`. Do not copy prose between routes — each description comes from its own `description.en`.

Note that `camino-portugues.html` carries a full `coastal` section with its own glyph, profile, and sparkline, plus stub rows for `espiritual` and `lisboa`. `kumano-kodo.html` carries stub rows for `iseji` and `kohechi`. `camino-ingles.html` carries a stub row for `a-coruna`.

- [ ] **Step 5: Verify every page**

```bash
for f in camino-frances camino-norte camino-primitivo camino-portugues camino-ingles kumano-kodo shikoku-88; do
  printf "%-20s " "$f"
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8000/$f.html"
done
```

Expected: `200` for all seven.

- [ ] **Step 6: Commit**

```bash
git add docs/*.html
git commit -m "feat: add detail pages for the remaining six routes"
```

---

### Task 13: Remaining pages and URL sweep

**Files:**
- Modify: `docs/schema.html`, `docs/usage.html`, `docs/contribute.html`
- Create: `docs/404.html`

- [ ] **Step 1: Update `docs/schema.html`**

- "Each pilgrimage route is a directory with four files" → **five**; add `stats.json # Historical statistics with sources` to the file-structure block.
- Add a `stats.json` row to the schemas table noting **no schema validates it yet** — an honest known gap, not a broken link.

- [ ] **Step 2: Update `docs/usage.html`**

- Add the `stats.json` CDN URL to the URL list.
- Add a stats fetch example matching the README's:

```js
const stats = await fetch(`${BASE}/routes/camino-frances/stats.json`).then(r => r.json());
const trend = stats.annualPilgrims.trend; // [{year: 1985, count: 690}, ...]
```

- Add a live CDN preview panel that fetches `index.json` from jsDelivr and renders the real response, falling back to a static example on error or when offline.

- [ ] **Step 3: Update `docs/contribute.html`**

Refresh the `.need-tag` list against what is actually still missing. "Kumano Kodo sub-routes (Kohechi, Iseji)" stays accurate — both are metadata-only. Add the metadata-only Camino stubs (`a-coruna`, `espiritual`, `lisboa`) and the Camino Portugués da Costa Spanish continuation, which the README flags as planned.

- [ ] **Step 4: Create `docs/404.html`**

Site-styled, with nav and a link back to `/routes`. GitHub Pages currently has `custom_404: false`.

- [ ] **Step 5: Sweep all internal links extensionless**

```bash
grep -rn 'href="[a-z0-9-]*\.html"' docs/*.html
```

Expected: **no output**. Every internal `href` must be `/`, `/routes`, `/schema`, `/usage`, `/contribute`, or `/{route-id}`. Update `<link rel="canonical">` and `og:url` on every page to match.

- [ ] **Step 6: Run the guard**

Run: `npm run check-site`

Expected: exit 0, no problems. This is the first time it passes.

- [ ] **Step 7: Commit**

```bash
git add docs
git commit -m "feat: document stats.json, add 404, and move all links extensionless"
```

---

### Task 14: Wire the guard into CI

**Files:**
- Modify: `.github/workflows/validate.yml`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add `docs/**` to the trigger paths and the guard to the job**

Add `- 'docs/**'` to both the `push` and `pull_request` `paths` lists, and add after the `npm run validate` step:

```yaml
      - run: npm run build-assets
      - name: Check generated assets are up to date
        run: git diff --exit-code docs/assets
      - run: npm run check-site
```

- [ ] **Step 2: Correct the coordinate claim in `CLAUDE.md`**

`CLAUDE.md` states coordinates are `[longitude, latitude, altitude]`. Route geometry is 2D throughout — all 159,624 coordinates are `[longitude, latitude]`, which is why elevation profiles come from `stages.json`. Change the Data Conventions line to:

```markdown
- Coordinates: `[longitude, latitude]`, optionally `[longitude, latitude, altitude]` (GeoJSON standard). Route geometry in `route.geojson` is currently 2D; per-stage elevation lives in `stages.json`.
```

- [ ] **Step 3: Verify the full local suite**

```bash
npm test && npm run build-index && git diff --exit-code index.json \
  && npm run validate && npm run build-assets && git diff --exit-code docs/assets \
  && npm run check-site && echo "ALL GREEN"
```

Expected: `ALL GREEN`.

- [ ] **Step 4: Commit, push, and confirm CI**

```bash
git add .github/workflows/validate.yml CLAUDE.md
git commit -m "ci: guard the docs site against route data drift"
git push
sleep 60
gh run list --workflow=validate.yml --limit 1
```

Expected: `completed  success`.

- [ ] **Step 5: Verify the deployed site**

After Pages redeploys:

```bash
for u in / /routes /schema /usage /contribute /camino-frances /shikoku-88 /kumano-kodo /nope; do
  printf "%-20s " "$u"; curl -s -o /dev/null -w "%{http_code}\n" "https://open.pilgrimag.es$u"
done
```

Expected: `200` for everything except `/nope`, which should now serve the styled 404.

---

## Acceptance Criteria

- [ ] `npm test` passes across all suites
- [ ] `npm run check-site` exits 0, and **fails** when a route is deleted from `routes.html` or a hero number is edited
- [ ] `npm run build-assets && git diff --exit-code docs/assets` passes twice
- [ ] All 7 routes and 6 variants present and accurate; every figure matches `npm run stats`
- [ ] `grep -rn 'href="[a-z0-9-]*\.html"' docs/*.html` returns nothing
- [ ] Every listed URL resolves 200 on the deployed site; `/nope` serves the styled 404
- [ ] Hero holds 60fps; only `stroke-dashoffset` and `opacity` written per frame
- [ ] Reduce Motion starts no rAF loop; one route renders static
- [ ] Two minutes tabbed away produces no visible jump on return
- [ ] CLS is 0 across a full 37-second lap
- [ ] Hover and keyboard focus both pause the cycle
- [ ] Dark mode clears WCAG AA on every text pairing, ratios recorded
- [ ] Site is legible and usable at 375px
- [ ] Comparison table sorts correctly and renders sorted with JS disabled
- [ ] CI green on a real push
