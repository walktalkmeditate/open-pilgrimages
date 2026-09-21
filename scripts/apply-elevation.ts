import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { resolveInvokedPath } from "./cli.js";
import { readJson, targets } from "./site/build-assets.js";
import { elevationProfile, roundToTen, type ElevationProfile } from "./elevation.js";
import { hashVertices, readElevationCache, walkedLineSourceFor } from "./fetch-elevation.js";
import { boundariesForStages, cumulativeMeters, walkedLine } from "./ways/geo.js";
import type { DatasetStage } from "./ways/stage.js";
import type { Position } from "./ways/types.js";

const ROOT = join(import.meta.dirname, "..");

/**
 * The apply half of the elevation pass. `fetch-elevation` puts SRTM readings
 * in `.cache/`; `elevation.ts` turns a stretch of line and its readings into
 * figures; this file is what decides which stretch is which stage, and writes
 * the result into `routes/{id}/stages.json`.
 *
 * It touches the network never and the cache read-only. Everything it needs —
 * the walked line, the stage anchors, the readings — is already on disk, and
 * a cache that was taken at different vertices is refused rather than
 * measured against the line it no longer describes.
 */

/**
 * Naismith's rule as published in 1892: an hour for every five kilometres, and
 * another for every 600 m of ascent. This is the fast end of the window —
 * Naismith described a fit hillwalker's pace, and nothing here is walked at it
 * for six weeks with a pack.
 */
export const NAISMITH_MIN_KMH = 5;
export const NAISMITH_MIN_ASCENT_MPH = 600;

/**
 * The slow end: 3.5 km/h and 500 m of ascent an hour. Not a second published
 * rule — it is where this corpus's own authored times sit. The Camino Francés'
 * 33 stages were written by hand, long before any of this code existed, and
 * their midpoints imply an overall pace near 3.5 km/h once the climbing is
 * paid for; the same is true of the Norte's 34, the Primitivo's 11 and the
 * Portugués' 11. Between these two paces the window contains 33 of the
 * Francés' 33 authored midpoints, 33 of the Norte's 34, and 10 of the
 * Primitivo's 11 — see apply-elevation.test.ts, which measures exactly that
 * over the committed files rather than asserting the sentence.
 *
 * It does not contain Kumano's. Both Kumano sections' days are longer than
 * either pace explains: the Nakahechi's are authored and the Kohechi's are
 * Naismith times a roughness factor fitted on the Nakahechi (see that
 * section's `overview.hoursNote`), so what this window misses there is a
 * Japanese mountain trail's own slowness, fitted from times this repository
 * holds for that trail and holds for nowhere else. Shikoku has no such times
 * to fit against, so it gets the unfitted window and says so.
 */
export const NAISMITH_MAX_KMH = 3.5;
export const NAISMITH_MAX_ASCENT_MPH = 500;

export interface EstimatedHours {
  min: number;
  max: number;
}

/**
 * A day's walking window, in whole hours.
 *
 * Whole hours because that is what every authored `estimatedHours` in this
 * corpus already is, and because neither pace is known to a precision that
 * would justify a half. `min` is floored at one: a rounded-down zero would be
 * published as a day that takes no time, and `midpointHours` would then hand
 * the app a stage whose clock never advances.
 */
export function naismithHours(distanceKm: number, gainMeters: number): EstimatedHours {
  const min = Math.max(1, Math.round(distanceKm / NAISMITH_MIN_KMH + gainMeters / NAISMITH_MIN_ASCENT_MPH));
  const max = Math.round(distanceKm / NAISMITH_MAX_KMH + gainMeters / NAISMITH_MAX_ASCENT_MPH);
  return { min, max: Math.max(min, max) };
}

export interface StageFigures {
  index: number;
  profile: ElevationProfile;
  hours: EstimatedHours;
  /** The reading at the vertex where the line is cut for this stage's start anchor. */
  startElevationMeters: number;
  /** The reading at the vertex where the line is cut for this stage's end anchor. */
  endElevationMeters: number;
}

/**
 * Every stage's figures, measured on the same cut of the line `build-ways`
 * packages — `boundariesForStages` is that cut, and it is shared rather than
 * restated here.
 *
 * The anchor heights are the readings at the two boundary vertices, not at the
 * anchors' own coordinates: this pass holds readings along the walked line and
 * nowhere else, and an anchor standing tens of metres off the trail has no
 * reading of its own to give. Taking the boundary vertex has one property
 * worth the difference — a stage's end and the next stage's start are one
 * boundary, so the two coordinates that name the same place are given the same
 * height, and each height lies inside its own stage's low-to-high range.
 */
export function measureStages(
  line: Position[],
  elevations: Array<number | null>,
  stages: ReadonlyArray<DatasetStage>,
): StageFigures[] {
  if (line.length !== elevations.length) {
    throw new Error(
      `elevation samples do not line up with the line they were sampled from: ` +
        `${line.length} vertices against ${elevations.length} elevations`,
    );
  }

  const boundaries = boundariesForStages(line, cumulativeMeters(line), stages);

  return stages.map((stage, i) => {
    const from = boundaries[i].index;
    const to = boundaries[i + 1].index;
    const profile = elevationProfile(line.slice(from, to + 1), elevations.slice(from, to + 1));
    return {
      index: stage.index,
      profile,
      hours: naismithHours(stage.distanceKm, profile.gainMeters),
      startElevationMeters: roundToTen(elevations[from] as number),
      endElevationMeters: roundToTen(elevations[to] as number),
    };
  });
}

export interface SectionTotals {
  totalAscentMeters: number;
  totalDescentMeters: number;
  minMeters: number;
  maxMeters: number;
}

/**
 * What a section's `overview.elevationRange` declares, summed from the stages
 * rather than accumulated over the whole line in one pass. The two differ: a
 * climb that straddles a stage boundary is counted from each side's own
 * starting reference. Summing the stages is what `kumano-kodo-kohechi`
 * declares (710 + 760 + 950 + 1,080 = the 3,500 m in its overview), so it is
 * what the corpus means by a section total.
 */
export function sectionTotals(figures: ReadonlyArray<StageFigures>): SectionTotals {
  return {
    totalAscentMeters: figures.reduce((sum, f) => sum + f.profile.gainMeters, 0),
    totalDescentMeters: figures.reduce((sum, f) => sum + f.profile.lossMeters, 0),
    minMeters: Math.min(...figures.map((f) => f.profile.lowPointMeters)),
    maxMeters: Math.max(...figures.map((f) => f.profile.highPointMeters)),
  };
}

/**
 * Where the four measured fields and the estimate go in a stage object. The
 * schema lists them in this order and every stages.json in the corpus that
 * carries them writes them in it, so a stage that gains them should read like
 * one that always had them rather than like one they were appended to.
 */
const FIELD_ORDER = [
  "elevationGainMeters",
  "elevationLossMeters",
  "highPointMeters",
  "lowPointMeters",
  "estimatedHours",
] as const;

type WrittenField = (typeof FIELD_ORDER)[number];

function valuesFor(figures: StageFigures): Record<WrittenField, unknown> {
  return {
    elevationGainMeters: figures.profile.gainMeters,
    elevationLossMeters: figures.profile.lossMeters,
    highPointMeters: figures.profile.highPointMeters,
    lowPointMeters: figures.profile.lowPointMeters,
    estimatedHours: figures.hours,
  };
}

export interface StageWrite {
  stage: Record<string, unknown>;
  /** Fields this stage already declared, which were left exactly as they were. */
  kept: WrittenField[];
}

/**
 * One stage, with whatever it was missing filled in.
 *
 * A field the file already declares is never replaced. Numbers in this
 * repository are published figures — `kumano-kodo-kohechi`'s were measured and
 * committed before any of this code existed, and one of them sits on a
 * rounding tie this method resolves the other way — so re-deriving over the
 * top of a committed figure is a decision for whoever is making it, not a side
 * effect of running a script. `--overwrite` is how you say you mean it.
 *
 * The same rule governs the third ordinate: an anchor that already carries a
 * height keeps it, because the ones that do carry a place's own surveyed
 * height rather than a reading off a digital model.
 */
export function stageWithFigures(
  stage: Record<string, unknown>,
  figures: StageFigures,
  overwrite: boolean,
): StageWrite {
  const values = valuesFor(figures);
  const kept = FIELD_ORDER.filter((field) => !overwrite && stage[field] !== undefined);

  const written: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stage)) {
    // The five are written from FIELD_ORDER below, wherever the file happened
    // to keep them. Copied here as well, a stage that carries one somewhere
    // else would have it written twice and the second copy — the file's own,
    // at the file's own position — would win over the one just derived.
    if ((FIELD_ORDER as readonly string[]).includes(key)) continue;
    written[key] = value;
    if (key !== "distanceKm") continue;
    for (const field of FIELD_ORDER) {
      written[field] = kept.includes(field) ? stage[field] : values[field];
    }
  }

  // A stages.json with no distanceKm never reaches here — build-ways requires
  // it and the schema does too — but a field appended rather than silently
  // dropped is the better failure if one ever does.
  for (const field of FIELD_ORDER) {
    if (written[field] === undefined) written[field] = values[field];
  }

  withElevation(written.start, figures.startElevationMeters, overwrite);
  withElevation(written.end, figures.endElevationMeters, overwrite);

  return { stage: written, kept };
}

function withElevation(anchor: unknown, meters: number, overwrite: boolean): void {
  if (typeof anchor !== "object" || anchor === null) return;
  const coordinates = (anchor as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return;
  if (coordinates.length === 2) coordinates.push(meters);
  else if (overwrite) coordinates[2] = meters;
}

export type ApplyOutcome =
  | { status: "no-cache" }
  | { status: "no-geometry" }
  | { status: "stale-cache"; reason: string }
  | { status: "applied"; figures: StageFigures[]; totals: SectionTotals; kept: number; changed: boolean };

interface StagesFile {
  stages?: unknown;
}

/**
 * Measures one section and rewrites its stages.json, or says why it did not.
 *
 * Every refusal below is a way to publish figures measured somewhere else. A
 * cache whose `lineHash` no longer matches was taken at vertices this line no
 * longer has; a cache taken from `route.geojson` when the section has since
 * grown a `route.main.geojson` was measured across variants nobody walks in
 * one sitting. Both produce a full set of entirely plausible numbers.
 */
export function applyRouteElevation(
  id: string,
  dir: string,
  root: string = ROOT,
  overwrite = false,
): ApplyOutcome {
  const source = walkedLineSourceFor(dir);
  if (!source) return { status: "no-geometry" };

  const geo = readJson(join(dir, source));
  if (!geo) return { status: "no-geometry" };

  const line = walkedLine(geo);
  if (line.length === 0) return { status: "no-geometry" };

  const cache = readElevationCache(root, id);
  if (!cache) return { status: "no-cache" };

  if (cache.source !== source) {
    return {
      status: "stale-cache",
      reason: `sampled from ${cache.source}, but this section's walked line is now ${source}`,
    };
  }
  if (cache.elevations.length !== line.length) {
    return {
      status: "stale-cache",
      reason: `${cache.elevations.length} readings against ${line.length} vertices`,
    };
  }
  if (cache.lineHash !== hashVertices(line)) {
    return {
      status: "stale-cache",
      reason: "taken at different vertices than this line now has — re-run npm run fetch-elevation",
    };
  }

  const stagesPath = join(dir, "stages.json");
  const file = JSON.parse(readFileSync(stagesPath, "utf-8")) as StagesFile;
  const raw = file.stages;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${id}: stages.json has no stages array to measure`);
  }
  const stages = raw as DatasetStage[];

  const figures = measureStages(line, cache.elevations, stages);

  const before = JSON.stringify(file);
  let kept = 0;
  file.stages = raw.map((stage, i) => {
    const write = stageWithFigures(stage as Record<string, unknown>, figures[i], overwrite);
    kept += write.kept.length;
    return write.stage;
  });
  const after = JSON.stringify(file, null, 2) + "\n";
  const changed = before !== JSON.stringify(file);

  if (changed) writeFileSync(stagesPath, after);

  return { status: "applied", figures, totals: sectionTotals(figures), kept, changed };
}

function selectedTargets(root: string, ids: string[]): ReturnType<typeof targets> {
  const all = targets(root);
  if (ids.length === 0) return all;

  const wanted = new Set(ids);
  return all.filter((t) => wanted.has(t.key));
}

function reportRoute(id: string, outcome: ApplyOutcome): void {
  switch (outcome.status) {
    case "no-geometry":
      console.log(`${id}:\n  ↳ no walked line — skipping`);
      return;
    case "no-cache":
      return; // never sampled; npm run fetch-elevation is what changes that
    case "stale-cache":
      console.log(`${id}:\n  ✗ refusing the cache: ${outcome.reason}`);
      return;
    case "applied": {
      console.log(`${id}:`);
      if (!outcome.changed) {
        console.log(`  ↳ every figure already declared — nothing written (--overwrite to re-derive)`);
        return;
      }
      for (const f of outcome.figures) {
        const p = f.profile;
        console.log(
          `  stage ${String(f.index).padStart(2)}: ${p.gainMeters} m up, ${p.lossMeters} m down, ` +
            `${p.lowPointMeters}–${p.highPointMeters} m, ${f.hours.min}–${f.hours.max} h`,
        );
      }
      const t = outcome.totals;
      console.log(
        `  ↳ overview.elevationRange: minMeters ${t.minMeters}, maxMeters ${t.maxMeters}, ` +
          `totalAscentMeters ${t.totalAscentMeters}, totalDescentMeters ${t.totalDescentMeters}`,
      );
      if (outcome.kept > 0) {
        console.log(`  ↳ ${outcome.kept} already-declared figure(s) left as committed`);
      }
      return;
    }
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const overwrite = args.includes("--overwrite");
  const ids = args.filter((arg) => arg !== "--overwrite");

  console.log("Writing stage figures from the sampled elevations in .cache/elevation\n");

  for (const { key, dir } of selectedTargets(ROOT, ids)) {
    try {
      reportRoute(key, applyRouteElevation(key, dir, ROOT, overwrite));
    } catch (error) {
      console.error(`${key}:\n  ✗ ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(
    "\nstages.json is written; overview.elevationRange, elevationNote and hoursNote are prose and are not.",
  );
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
