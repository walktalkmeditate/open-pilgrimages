import { test } from "node:test";
import assert from "node:assert/strict";
import { HYSTERESIS_METERS, accumulate, elevationProfile, roundToTen } from "./elevation.js";
import type { Position } from "./ways/types.js";

/** A flat run of `count` vertices — the accumulation reads only the elevations. */
function vertices(count: number): Position[] {
  return Array.from({ length: count }, (_, i) => [135 + i / 1000, 34] as Position);
}

// --- roundToTen ---

test("roundToTen rounds to the nearest ten, halves upward", () => {
  assert.equal(roundToTen(0), 0);
  assert.equal(roundToTen(4), 0);
  assert.equal(roundToTen(5), 10);
  assert.equal(roundToTen(14.9), 10);
  assert.equal(roundToTen(955), 960);
});

test("roundToTen never hands back negative zero, which would compare unequal to the 0 it prints as", () => {
  assert.equal(Object.is(roundToTen(-2), 0), true);
  assert.equal(roundToTen(-16), -20);
});

// --- accumulate ---

test("an oscillation inside the threshold never accumulates, however long it runs", () => {
  // #given 200 vertices wobbling ±15 m — well inside the model's own noise band
  const samples: number[] = [];
  for (let i = 0; i < 200; i++) samples.push(i % 2 === 0 ? 500 : 515);

  // #then neither gain nor loss, because the reference never moves off 500
  assert.deepEqual(accumulate(samples), { gainMeters: 0, lossMeters: 0 });
});

test("a difference of exactly the threshold does not commit — the constant means the same thing in prose and in arithmetic", () => {
  assert.deepEqual(accumulate([500, 500 + HYSTERESIS_METERS]), { gainMeters: 0, lossMeters: 0 });
  assert.deepEqual(accumulate([500, 500 - HYSTERESIS_METERS]), { gainMeters: 0, lossMeters: 0 });
});

test("a difference past the threshold commits the whole difference and moves the reference", () => {
  assert.deepEqual(accumulate([500, 521]), { gainMeters: 21, lossMeters: 0 });
  // #then the reference is now 521, so a return to 500 is only 21 m below it and commits too
  assert.deepEqual(accumulate([500, 521, 500]), { gainMeters: 21, lossMeters: 21 });
});

test("a monotone climb is counted in steps, leaving the last part-step under the threshold uncounted", () => {
  // #given 0, 30, 60, 90, then a final 100 that is only 10 m above the reference
  const { gainMeters, lossMeters } = accumulate([0, 30, 60, 90, 100]);

  assert.equal(gainMeters, 90);
  assert.equal(lossMeters, 0);
});

test("gain and loss are counted separately over a climb and a descent", () => {
  assert.deepEqual(accumulate([100, 600, 200]), { gainMeters: 500, lossMeters: 400 });
});

test("accumulate over nothing is zero, not a crash", () => {
  assert.deepEqual(accumulate([]), { gainMeters: 0, lossMeters: 0 });
});

// --- elevationProfile ---

test("high and low points are the raw extremes, including a spike the hysteresis never counts as climbing", () => {
  // #given a 15 m pinnacle — inside the noise band, so it contributes no ascent
  const profile = elevationProfile(vertices(3), [500, 515, 500]);

  assert.equal(profile.gainMeters, 0);
  assert.equal(profile.lossMeters, 0);
  // #then the line still went to 515 and the high point says so
  assert.equal(profile.highPointMeters, 520);
  assert.equal(profile.lowPointMeters, 500);
});

test("every published figure is rounded to the nearest ten", () => {
  const profile = elevationProfile(vertices(3), [104, 1007, 96]);

  assert.deepEqual(profile, {
    gainMeters: 900,
    lossMeters: 910,
    highPointMeters: 1010,
    lowPointMeters: 100,
  });
});

test("a single vertex has no climbing, and is its own high and low point", () => {
  assert.deepEqual(elevationProfile(vertices(1), [742]), {
    gainMeters: 0,
    lossMeters: 0,
    highPointMeters: 740,
    lowPointMeters: 740,
  });
});

test("samples that do not line up with their line are refused, not silently measured against the wrong places", () => {
  assert.throws(
    () => elevationProfile(vertices(3), [500, 600]),
    /3 vertices against 2 elevations/,
  );
});

test("an empty line is refused rather than reported as a flat zero", () => {
  assert.throws(() => elevationProfile([], []), /empty line/);
});

test("a void the model could not fill names the vertex it was asked about", () => {
  assert.throws(
    () => elevationProfile(vertices(3), [500, null, 600]),
    /no elevation at vertex 1 of 3 \(135\.001, 34\)/,
  );
});
