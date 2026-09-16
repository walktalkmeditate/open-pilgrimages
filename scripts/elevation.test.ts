import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { HYSTERESIS_METERS, accumulate, elevationProfile, roundToTen } from "./elevation.js";
import { hashVertices } from "./fetch-elevation.js";
import { cumulativeMeters, stageBoundaries, walkedLine } from "./ways/geo.js";
import type { Position } from "./ways/types.js";

const ROOT = join(import.meta.dirname, "..");

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

// --- the regression: kumano-kodo-kohechi ---

/**
 * kohechi is the only route in this corpus that was measured before any of
 * this code existed, and its own metadata records the method in prose:
 * SRTM 30 m at each of the walked line's 2,986 vertices, 20 m hysteresis,
 * rounded to the nearest 10 m. Reproducing its committed per-stage figures
 * from its own committed line is what says the sentence and the numbers still
 * describe each other — and what would catch a future edit to the threshold,
 * the rounding, or the sampling that nothing else in the project would notice.
 *
 * The readings are a committed fixture rather than the gitignored
 * `.cache/elevation/` a fetch writes, so this runs on a machine that has never
 * called OpenTopoData — which is every CI machine. `lineHash` is checked below
 * so the fixture cannot quietly outlive the line it was taken from.
 */
interface ElevationFixture {
  routeId: string;
  dataset: string;
  source: string;
  lineHash: string;
  elevations: number[];
}

const KOHECHI = join(ROOT, "routes", "kumano-kodo-kohechi");

function kohechiFixture(): ElevationFixture {
  return JSON.parse(
    readFileSync(join(ROOT, "scripts", "fixtures", "kumano-kodo-kohechi-srtm30m.json"), "utf-8"),
  ) as ElevationFixture;
}

function kohechiLine(): Position[] {
  return walkedLine(JSON.parse(readFileSync(join(KOHECHI, "route.main.geojson"), "utf-8")));
}

interface CommittedStage {
  index: number;
  distanceKm: number;
  elevationGainMeters: number;
  elevationLossMeters: number;
  highPointMeters: number;
  lowPointMeters: number;
  start: { coordinates: Position };
  end: { coordinates: Position };
}

function kohechiStages(): CommittedStage[] {
  return (JSON.parse(readFileSync(join(KOHECHI, "stages.json"), "utf-8")) as { stages: CommittedStage[] }).stages;
}

/**
 * The same cut build-ways makes: one boundary per stage edge, anchored on each
 * stage's start plus the last stage's end, snapped forward along the line.
 * build-ways also raises an anchor's snap radius by its declared
 * `offLineMeters`; kohechi declares none on any of its eight anchors, so the
 * plain call is that same cut for this route, and this test is not a second
 * copy of that rule waiting to drift from the first.
 */
function kohechiSpans(line: Position[], stages: CommittedStage[]): Array<[number, number]> {
  const anchors = stages.map((s) => s.start.coordinates);
  anchors.push(stages[stages.length - 1].end.coordinates);
  const boundaries = stageBoundaries(
    line,
    cumulativeMeters(line),
    anchors,
    stages.map((s) => s.distanceKm),
  );
  return stages.map((s) => [boundaries[s.index].index, boundaries[s.index + 1].index]);
}

test("kohechi's walked line is route.main.geojson's 2,986 vertices, the count its own elevation note declares", () => {
  const line = kohechiLine();
  const fixture = kohechiFixture();

  assert.equal(line.length, 2986);
  assert.equal(fixture.elevations.length, 2986);
  assert.equal(fixture.source, "route.main.geojson");
  // #then the fixture was taken at these exact vertices, not at an earlier version of the line
  assert.equal(fixture.lineHash, hashVertices(line));
});

test("the method reproduces kohechi's committed per-stage figures from kohechi's own line", () => {
  const line = kohechiLine();
  const { elevations } = kohechiFixture();
  const stages = kohechiStages();
  const spans = kohechiSpans(line, stages);

  const measured = spans.map(([from, to]) =>
    elevationProfile(line.slice(from, to + 1), elevations.slice(from, to + 1)),
  );

  // Fifteen of these sixteen figures are what stages.json carries today; the
  // two exceptions have their own tests below, and are the only places this
  // method and kohechi's committed data are allowed to disagree.
  assert.deepEqual(measured, [
    { gainMeters: 710, lossMeters: 840, highPointMeters: 1170, lowPointMeters: 650 },
    { gainMeters: 760, lossMeters: 1140, highPointMeters: 1330, lowPointMeters: 330 },
    { gainMeters: 960, lossMeters: 1150, highPointMeters: 1070, lowPointMeters: 150 },
    { gainMeters: 1080, lossMeters: 1150, highPointMeters: 1070, lowPointMeters: 70 },
  ]);

  for (const stage of stages) {
    const m = measured[stage.index];
    assert.equal(m.lossMeters, stage.elevationLossMeters, `stage ${stage.index} descent`);
    assert.equal(m.lowPointMeters, stage.lowPointMeters, `stage ${stage.index} low point`);
    if (stage.index !== 2) {
      assert.equal(m.gainMeters, stage.elevationGainMeters, `stage ${stage.index} ascent`);
    }
    if (stage.index !== 1) {
      assert.equal(m.highPointMeters, stage.highPointMeters, `stage ${stage.index} high point`);
    }
  }
});

/**
 * The first documented disagreement, and it is not a disagreement about
 * arithmetic. kohechi's note says the model "reads 1,329 m where the line
 * crosses Obako-dake, against the 1,344 m OpenStreetMap node/2454838213
 * carries for that summit (the maximum declared here)" — so the committed
 * 1,344 is the OSM summit node's own figure, deliberately declared in place of
 * the sampled maximum, and 1,330 is what sampling alone produces. Every other
 * high point in the route is the sampled one.
 *
 * Pinned here because a later pass writing figures for another route has to
 * know that this one number was a judgement, not an output — and because it
 * confirms the sampling is the same sampling: 1,329 raw is exactly what the
 * note said the model read.
 */
test("kohechi's stage 1 high point is a declared OSM summit, not the sampled maximum", () => {
  const line = kohechiLine();
  const { elevations } = kohechiFixture();
  const [from, to] = kohechiSpans(line, kohechiStages())[1];
  const slice = elevations.slice(from, to + 1);

  assert.equal(Math.max(...slice), 1329);
  assert.equal(elevationProfile(line.slice(from, to + 1), slice).highPointMeters, 1330);
  assert.equal(kohechiStages()[1].highPointMeters, 1344);

  const note = (
    JSON.parse(readFileSync(join(KOHECHI, "metadata.json"), "utf-8")) as {
      overview: { elevationRange: { elevationNote: string } };
    }
  ).overview.elevationRange.elevationNote;
  assert.match(note, /1,329 m where the line crosses Obako-dake/);
  assert.match(note, /1,344 m OpenStreetMap node\/2454838213/);
});

/**
 * The second, and the whole of it: stage 2's accumulated ascent is 955 m,
 * which sits exactly on the boundary between 950 and 960. `Math.round` takes
 * the half upward and this method publishes 960; the committed figure is 950.
 * Ten metres on a 19 km mountain day, decided by a coin-flip nobody wrote
 * down, and the only lever that would close it is a rounding rule that breaks
 * ties downward — a stranger rule, applied to every future figure in the
 * corpus, to agree with one number. Left as it is, and pinned, so the next
 * reader finds the explanation instead of the surprise.
 */
test("kohechi's stage 2 ascent lands exactly on a rounding tie, and this method takes the half upward", () => {
  const line = kohechiLine();
  const { elevations } = kohechiFixture();
  const [from, to] = kohechiSpans(line, kohechiStages())[2];

  assert.equal(accumulate(elevations.slice(from, to + 1)).gainMeters, 955);
  assert.equal(roundToTen(955), 960);
  assert.equal(kohechiStages()[2].elevationGainMeters, 950);
});

/**
 * The note's other independent check: 1,070 m at the Hatenashi-toge crossing,
 * which stages 2 and 3 share as a boundary. It reproducing exactly is what
 * says the interpolation this fetch asks for is the interpolation the original
 * pass got.
 */
test("the model still reads the Hatenashi-toge crossing at the 1,070 m kohechi's note cites", () => {
  const line = kohechiLine();
  const { elevations } = kohechiFixture();
  const spans = kohechiSpans(line, kohechiStages());

  for (const index of [2, 3]) {
    const [from, to] = spans[index];
    assert.equal(
      elevationProfile(line.slice(from, to + 1), elevations.slice(from, to + 1)).highPointMeters,
      1070,
    );
  }
});
