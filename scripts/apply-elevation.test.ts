import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import {
  NAISMITH_MAX_ASCENT_MPH,
  NAISMITH_MAX_KMH,
  NAISMITH_MIN_ASCENT_MPH,
  NAISMITH_MIN_KMH,
  measureStages,
  naismithHours,
  sectionTotals,
  stageWithFigures,
  type StageFigures,
} from "./apply-elevation.js";
import type { DatasetStage } from "./ways/stage.js";
import type { Position } from "./ways/types.js";

const ROOT = join(import.meta.dirname, "..");

// --- naismithHours ---

test("Naismith's own rule is the fast end of the window: five kilometres an hour, 600 m of ascent", () => {
  assert.equal(NAISMITH_MIN_KMH, 5);
  assert.equal(NAISMITH_MIN_ASCENT_MPH, 600);
  // #given a flat 20 km day
  assert.equal(naismithHours(20, 0).min, 4);
  // #then 600 m of climbing adds exactly one hour to it
  assert.equal(naismithHours(20, 600).min, 5);
});

test("the slow end is this corpus's own pace: 3.5 km/h and 500 m of ascent an hour", () => {
  assert.equal(NAISMITH_MAX_KMH, 3.5);
  assert.equal(NAISMITH_MAX_ASCENT_MPH, 500);
  assert.equal(naismithHours(21, 0).max, 6);
  assert.equal(naismithHours(21, 500).max, 7);
});

test("a window is whole hours, and never opens at zero", () => {
  // #given a stage short enough that both paces round below an hour
  const hours = naismithHours(1.2, 0);

  assert.deepEqual(hours, { min: 1, max: 1 });
});

test("min never exceeds max, however the two roundings fall", () => {
  for (let km = 0.5; km < 60; km += 0.5) {
    for (let gain = 0; gain < 2000; gain += 50) {
      const { min, max } = naismithHours(km, gain);
      assert.ok(min <= max, `${km} km / ${gain} m gives ${min}–${max}`);
    }
  }
});

/**
 * The reason this window is what it is. The Camino stages were authored by
 * hand years before any of this code existed, so they are the only independent
 * check on it this repository holds — and the only argument that these two
 * paces describe walking rather than a preference.
 *
 * Measured over the committed files rather than restated as a sentence, so a
 * future edit to either constant has to come back and say what it did to the
 * agreement.
 */
interface AuthoredStage {
  distanceKm: number;
  elevationGainMeters?: number;
  estimatedHours?: { min?: number; max?: number };
}

function authoredStages(id: string): AuthoredStage[] {
  const file = JSON.parse(readFileSync(join(ROOT, "routes", id, "stages.json"), "utf-8")) as {
    stages: AuthoredStage[];
  };
  return file.stages;
}

function midpointsInsideWindow(id: string): { inside: number; total: number } {
  let inside = 0;
  let total = 0;
  for (const stage of authoredStages(id)) {
    const authored = stage.estimatedHours;
    if (typeof authored?.min !== "number" || typeof authored?.max !== "number") continue;
    total++;
    const midpoint = (authored.min + authored.max) / 2;
    const window = naismithHours(stage.distanceKm, stage.elevationGainMeters ?? 0);
    if (window.min <= midpoint && midpoint <= window.max) inside++;
  }
  return { inside, total };
}

test("the window contains the Camino stages' own authored midpoints", () => {
  assert.deepEqual(midpointsInsideWindow("camino-frances"), { inside: 33, total: 33 });
  assert.deepEqual(midpointsInsideWindow("camino-norte"), { inside: 33, total: 34 });
  assert.deepEqual(midpointsInsideWindow("camino-portugues"), { inside: 11, total: 11 });
  assert.deepEqual(midpointsInsideWindow("camino-primitivo"), { inside: 10, total: 11 });
  assert.deepEqual(midpointsInsideWindow("camino-ingles"), { inside: 5, total: 6 });
});

/**
 * And the disagreement, pinned rather than smoothed over. Neither Kumano
 * section's days fit between these two paces: the Nakahechi's hours are
 * authored and the Kohechi's are Naismith times a roughness factor fitted on
 * the Nakahechi, and both are slower than the unfitted slow end. That is a
 * fact about a Japanese mountain trail, fitted from the only times this
 * repository holds for one — which is why Shikoku, holding none, does not
 * borrow it, and why this window is published as unfitted.
 */
test("the window does not contain Kumano's, and Kumano's hours are fitted where these are not", () => {
  assert.deepEqual(midpointsInsideWindow("kumano-kodo-kohechi"), { inside: 0, total: 4 });
  assert.deepEqual(midpointsInsideWindow("kumano-kodo-nakahechi"), { inside: 1, total: 4 });

  const note = (
    JSON.parse(readFileSync(join(ROOT, "routes", "kumano-kodo-kohechi", "metadata.json"), "utf-8")) as {
      overview: { hoursNote: { en: string } };
    }
  ).overview.hoursNote.en;
  assert.match(note, /roughness factor this repository fitted empirically for the Nakahechi/);
});

// --- measureStages ---

/** A straight run of `count` vertices, 1/1000° apart — about 92 m at this latitude. */
function line(count: number): Position[] {
  return Array.from({ length: count }, (_, i) => [134 + i / 1000, 34] as Position);
}

function stageBetween(index: number, start: Position, end: Position, distanceKm: number): DatasetStage {
  return {
    index,
    name: { en: `Stage ${index}` },
    start: { name: { en: "start" }, coordinates: start },
    end: { name: { en: "end" }, coordinates: end },
    distanceKm,
  };
}

test("each stage is measured on its own stretch of the line, cut where build-ways cuts it", () => {
  const vertices = line(5);
  // #given a line that climbs 0 → 100 → 50 → 400 → 380
  const elevations = [0, 100, 50, 400, 380];
  const stages = [
    stageBetween(0, vertices[0], vertices[2], 0.2),
    stageBetween(1, vertices[2], vertices[4], 0.2),
  ];

  const figures = measureStages(vertices, elevations, stages);

  assert.deepEqual(figures[0].profile, {
    gainMeters: 100,
    lossMeters: 50,
    highPointMeters: 100,
    lowPointMeters: 0,
  });
  assert.deepEqual(figures[1].profile, {
    gainMeters: 350,
    lossMeters: 0,
    highPointMeters: 400,
    lowPointMeters: 50,
  });
});

test("the place two stages share is given one height, because it is one boundary", () => {
  const vertices = line(5);
  const elevations = [0, 100, 54, 400, 380];
  const stages = [
    stageBetween(0, vertices[0], vertices[2], 0.2),
    stageBetween(1, vertices[2], vertices[4], 0.2),
  ];

  const figures = measureStages(vertices, elevations, stages);

  assert.equal(figures[0].endElevationMeters, 50);
  assert.equal(figures[1].startElevationMeters, 50);
});

test("samples that do not line up with the line are refused before anything is measured", () => {
  const vertices = line(4);
  assert.throws(
    () => measureStages(vertices, [0, 10, 20], [stageBetween(0, vertices[0], vertices[3], 0.3)]),
    /4 vertices against 3 elevations/,
  );
});

// --- sectionTotals ---

test("a section's totals are the sum of its stages, the way kohechi's overview declares them", () => {
  const figures: StageFigures[] = [
    { index: 0, profile: { gainMeters: 710, lossMeters: 840, highPointMeters: 1170, lowPointMeters: 650 }, hours: { min: 3, max: 5 }, startElevationMeters: 830, endElevationMeters: 700 },
    { index: 1, profile: { gainMeters: 760, lossMeters: 1140, highPointMeters: 1330, lowPointMeters: 330 }, hours: { min: 3, max: 5 }, startElevationMeters: 700, endElevationMeters: 340 },
  ];

  assert.deepEqual(sectionTotals(figures), {
    totalAscentMeters: 1470,
    totalDescentMeters: 1980,
    minMeters: 330,
    maxMeters: 1330,
  });
});

// --- stageWithFigures ---

const FIGURES: StageFigures = {
  index: 0,
  profile: { gainMeters: 290, lossMeters: 170, highPointMeters: 160, lowPointMeters: 0 },
  hours: { min: 6, max: 9 },
  startElevationMeters: 30,
  endElevationMeters: 10,
};

function bareStage(): Record<string, unknown> {
  return {
    index: 0,
    name: { en: "Stage 1" },
    start: { name: { en: "start" }, coordinates: [134.5, 34.1] },
    end: { name: { en: "end" }, coordinates: [134.3, 34.1] },
    distanceKm: 28.3,
    interior: { reflection: { en: "…" } },
  };
}

test("the figures land between distanceKm and everything after it, in the schema's own order", () => {
  const { stage } = stageWithFigures(bareStage(), FIGURES, false);

  assert.deepEqual(Object.keys(stage), [
    "index",
    "name",
    "start",
    "end",
    "distanceKm",
    "elevationGainMeters",
    "elevationLossMeters",
    "highPointMeters",
    "lowPointMeters",
    "estimatedHours",
    "interior",
  ]);
  assert.equal(stage.elevationGainMeters, 290);
  assert.deepEqual(stage.estimatedHours, { min: 6, max: 9 });
});

test("a two-dimensional anchor gains its sampled height; a three-dimensional one keeps the one it has", () => {
  const stage = bareStage();
  (stage.end as { coordinates: number[] }).coordinates = [134.3, 34.1, 15];

  const written = stageWithFigures(stage, FIGURES, false).stage;

  assert.deepEqual((written.start as { coordinates: number[] }).coordinates, [134.5, 34.1, 30]);
  assert.deepEqual((written.end as { coordinates: number[] }).coordinates, [134.3, 34.1, 15]);
});

test("a figure the file already declares is never replaced, and is named as kept", () => {
  const stage = bareStage();
  stage.elevationGainMeters = 950;

  const { stage: written, kept } = stageWithFigures(stage, FIGURES, false);

  assert.equal(written.elevationGainMeters, 950);
  assert.equal(written.elevationLossMeters, 170);
  assert.deepEqual(kept, ["elevationGainMeters"]);
});

test("--overwrite is what re-derives over a committed figure, including a declared height", () => {
  const stage = bareStage();
  stage.elevationGainMeters = 950;
  (stage.end as { coordinates: number[] }).coordinates = [134.3, 34.1, 15];

  const { stage: written, kept } = stageWithFigures(stage, FIGURES, true);

  assert.equal(written.elevationGainMeters, 290);
  assert.deepEqual((written.end as { coordinates: number[] }).coordinates, [134.3, 34.1, 10]);
  assert.deepEqual(kept, []);
});

// --- what the four dōjō now carry ---

/**
 * The pass's own result, read back off disk. `kumano-kodo-kohechi` is the
 * method's regression (elevation.test.ts); this is its application — that
 * every stage of every Shikoku section carries a full set of figures, and that
 * each section's stages sum to the totals its overview declares.
 */
const DOJO = ["shikoku-88-awa", "shikoku-88-tosa", "shikoku-88-iyo", "shikoku-88-sanuki"];

test("every Shikoku stage carries measured elevation and an estimated window", () => {
  for (const id of DOJO) {
    for (const stage of authoredStages(id) as Array<AuthoredStage & Record<string, unknown>>) {
      for (const field of ["elevationGainMeters", "elevationLossMeters", "highPointMeters", "lowPointMeters"]) {
        assert.equal(typeof stage[field], "number", `${id} ${field}`);
      }
      assert.equal(typeof stage.estimatedHours?.min, "number", `${id} hours`);
      assert.equal(typeof stage.estimatedHours?.max, "number", `${id} hours`);
      // #then no difficulty: the thresholds fitted this corpus at 79% and
      // missed Kumano entirely, so the dataset says nothing rather than a
      // word it cannot stand behind.
      assert.equal(stage.difficulty, undefined, `${id} difficulty`);
    }
  }
});

test("each section's declared ascent and descent are the sum of its own stages", () => {
  for (const id of DOJO) {
    const stages = authoredStages(id) as Array<AuthoredStage & { elevationLossMeters: number }>;
    const declared = (
      JSON.parse(readFileSync(join(ROOT, "routes", id, "metadata.json"), "utf-8")) as {
        overview: { elevationRange: { totalAscentMeters: number; totalDescentMeters: number } };
      }
    ).overview.elevationRange;

    const ascent = stages.reduce((sum, s) => sum + (s.elevationGainMeters ?? 0), 0);
    const descent = stages.reduce((sum, s) => sum + s.elevationLossMeters, 0);

    assert.equal(declared.totalAscentMeters, ascent, `${id} ascent`);
    assert.equal(declared.totalDescentMeters, descent, `${id} descent`);
  }
});
