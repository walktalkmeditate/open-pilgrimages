import type { Position } from "./ways/types.js";

/**
 * The rule this module implements is not new. `kumano-kodo-kohechi` shipped it
 * in September and wrote it down in its own
 * `overview.elevationRange.elevationNote`: every vertex of the walked line
 * sampled from SRTM 30 m, a 20 m hysteresis threshold so the model's own noise
 * is not counted as climbing, then rounded to the nearest 10 m. No code was
 * committed for that pass, so this file is both the executable form of the
 * method and — through the regression in elevation.test.ts, which reproduces
 * kohechi's committed per-stage figures from its own line — the record that the
 * sentence and the numbers still describe each other.
 *
 * Nothing here touches the network or the filesystem. The samples come from
 * fetch-elevation.ts's cache; this module only turns them into figures.
 */

/**
 * How far a sample must sit from the running reference before that difference
 * is counted as climbing or descending. SRTM 1-arc-second carries roughly
 * 6–10 m of vertical RMSE, worse under the steep forest canopy both Kumano and
 * Shikoku are covered in, and it is a reflective-surface model — it reads
 * canopy top, not ground. Summing every positive step over a line whose
 * vertices are ~15 m apart (against the model's 30 m posts) therefore adds
 * metres of fabricated ascent per step; over the corpus's 45,000-odd Shikoku
 * vertices that is tens of thousands of metres of climbing nobody walks.
 *
 * 20 m is what kohechi's totals were chosen against: they land near the
 * 3,320 m of ascent published for that route, where a naive per-vertex sum
 * lands nowhere near it. Changing this number changes what every figure in the
 * corpus means, and breaks method-identity with the one route that was
 * measured before this file existed — the regression test is what says so.
 */
export const HYSTERESIS_METERS = 20;

/**
 * Every published figure is rounded to this. SRTM cannot support a one-metre
 * claim and the dataset should not print one. (The Camino stage figures are
 * *not* rounded this way — they are guidebook-derived, a different provenance
 * entirely. This rounding belongs to the sampled routes.)
 */
export const ROUNDING_METERS = 10;

export interface ElevationProfile {
  gainMeters: number;
  lossMeters: number;
  highPointMeters: number;
  lowPointMeters: number;
}

/**
 * Nearest ten, halves away from zero's side of the number line the same way
 * `Math.round` goes — up. The `=== 0` clause exists because `Math.round(-0.4)`
 * is `-0`, which `JSON.stringify` prints as `0` but `assert.strictEqual`
 * distinguishes from it: a below-sea-level low point would round to a value
 * that compares unequal to the one written to disk.
 */
export function roundToTen(meters: number): number {
  const rounded = Math.round(meters / ROUNDING_METERS) * ROUNDING_METERS;
  return rounded === 0 ? 0 : rounded;
}

export interface Accumulation {
  gainMeters: number;
  lossMeters: number;
}

/**
 * Gain and loss with hysteresis, unrounded.
 *
 * A single reference elevation is carried forward. A sample that differs from
 * it by more than `threshold` commits that whole difference — as gain if it is
 * above, as loss if below — and becomes the new reference. A sample that does
 * not commits nothing and leaves the reference where it was, so an oscillation
 * inside the threshold can repeat forever without accumulating: the reference
 * never moves, so the next comparison is against the same place, not against
 * the wobble.
 *
 * Strictly greater than, not greater-or-equal: a difference of exactly the
 * threshold is the noise band's own edge, and counting it would make the
 * constant mean one thing in prose and another in arithmetic.
 *
 * A monotone climb is therefore counted in steps of at least `threshold`, and
 * the last part-step before a summit — under the threshold, never committed —
 * is left out. That undercount is the price of not counting noise, it is
 * bounded by the threshold once per turning point rather than once per vertex,
 * and it is what kohechi's totals were measured with.
 */
export function accumulate(samples: number[], threshold: number = HYSTERESIS_METERS): Accumulation {
  if (samples.length === 0) return { gainMeters: 0, lossMeters: 0 };

  let reference = samples[0];
  let gainMeters = 0;
  let lossMeters = 0;

  for (let i = 1; i < samples.length; i++) {
    const delta = samples[i] - reference;
    if (delta > threshold) {
      gainMeters += delta;
      reference = samples[i];
    } else if (delta < -threshold) {
      lossMeters -= delta;
      reference = samples[i];
    }
  }

  return { gainMeters, lossMeters };
}

/**
 * The published figures for one stretch of line: its `vertices` and the
 * elevation sampled at each of them, in the same order.
 *
 * `vertices` is not arithmetic — the accumulation reads only `elevations` —
 * but it is what makes the two failures below nameable. A sample array that
 * has drifted out of step with its line (a chunk merged into the wrong slot, a
 * stage sliced against a line that has since been rebuilt) produces figures
 * that look entirely plausible and are measured from somewhere else, and the
 * only cheap signal that it happened is the count not matching. A void the
 * model could not fill reads as a bare number in an array and as a coordinate
 * worth going to look at.
 *
 * High and low points are the raw extremes, not the hysteresis's turning
 * points: a summit is where the line actually goes highest, whether or not the
 * climb to it was large enough to be counted as climbing.
 */
export function elevationProfile(
  vertices: Position[],
  elevations: Array<number | null>,
  threshold: number = HYSTERESIS_METERS,
): ElevationProfile {
  if (vertices.length !== elevations.length) {
    throw new Error(
      `elevation samples do not line up with the line they were sampled from: ` +
        `${vertices.length} vertices against ${elevations.length} elevations`,
    );
  }
  if (vertices.length === 0) {
    throw new Error("cannot profile an empty line — there is nothing to sample");
  }

  const samples: number[] = [];
  // Highest and lowest are tracked in this same pass rather than with
  // Math.max(...samples): a section's whole line runs to fifteen thousand
  // vertices, and spreading an array that size into a call is an argument
  // count, not a loop.
  let highest = -Infinity;
  let lowest = Infinity;

  for (let i = 0; i < elevations.length; i++) {
    const elevation = elevations[i];
    if (elevation === null || !Number.isFinite(elevation)) {
      const [lon, lat] = vertices[i];
      throw new Error(
        `no elevation at vertex ${i} of ${vertices.length} (${lon}, ${lat}): ` +
          `the model returned ${JSON.stringify(elevation)}`,
      );
    }
    samples.push(elevation);
    if (elevation > highest) highest = elevation;
    if (elevation < lowest) lowest = elevation;
  }

  const { gainMeters, lossMeters } = accumulate(samples, threshold);

  return {
    gainMeters: roundToTen(gainMeters),
    lossMeters: roundToTen(lossMeters),
    highPointMeters: roundToTen(highest),
    lowPointMeters: roundToTen(lowest),
  };
}
