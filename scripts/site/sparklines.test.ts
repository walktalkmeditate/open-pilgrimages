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

test("trendOf gracefully degrades on null input", () => {
  assert.deepEqual(trendOf(null), []);
});

test("trendOf gracefully degrades when the annualPilgrims key is missing", () => {
  assert.deepEqual(trendOf({ schemaVersion: "1.0.0" }), []);
});

test("trendOf gracefully degrades when trend is not an array", () => {
  assert.deepEqual(trendOf({ annualPilgrims: { trend: "not-an-array" } }), []);
});

test("trendOf tolerates a null entry inside the trend array", () => {
  assert.deepEqual(trendOf({ annualPilgrims: { trend: [null] } }), [{ year: 0, count: 0 }]);
});

test("trendOf fills sensible defaults for an entry missing year or count", () => {
  assert.deepEqual(trendOf({ annualPilgrims: { trend: [{ count: 500 }, { year: 1999 }] } }), [
    { year: 0, count: 500 },
    { year: 1999, count: 0 },
  ]);
});

const SAMPLE: TrendPoint[] = [
  { year: 2000, count: 100 },
  { year: 2001, count: 200 },
  { year: 2002, count: 300 },
];

test("sparklineSvg spans the full width and inverts the y axis", () => {
  const svg = sparklineSvg(SAMPLE, 120, 30);

  assert.match(svg, /viewBox="0 0 120 30"/);
  assert.match(svg, /M0\.0,30\.0/); // lowest count sits on the baseline
  assert.match(svg, /120\.0,0\.0/); // highest count sits at the top
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

test("sparklineSvg says rising when the series ends above where it began", () => {
  assert.match(
    sparklineSvg(SAMPLE, 120, 30),
    /aria-label="Pilgrims per year, 2000 to 2002: 100 rising to 300"/,
  );
});

// Shikoku 88's walking completions: 1,740 in 2005 to 1,622 in 2025, the first
// falling series this dataset has held. The word was the literal "rising"
// until it arrived, so nothing had ever caught the difference.
test("sparklineSvg says falling when the series ends below where it began", () => {
  const falling: TrendPoint[] = [
    { year: 2005, count: 1740 },
    { year: 2015, count: 2200 },
    { year: 2025, count: 1622 },
  ];

  assert.match(
    sparklineSvg(falling, 120, 30),
    /aria-label="Pilgrims per year, 2005 to 2025: 1,740 falling to 1,622"/,
  );
});

test("sparklineSvg says unchanged when the series ends where it began", () => {
  const returned: TrendPoint[] = [
    { year: 2000, count: 50 },
    { year: 2001, count: 90 },
    { year: 2002, count: 50 },
  ];

  assert.match(
    sparklineSvg(returned, 120, 30),
    /aria-label="Pilgrims per year, 2000 to 2002: 50 unchanged at 50"/,
  );
});

// The word describes the two ends and not the shape between them, which is
// what the hard-coded one claimed too — the Inglés collapses in 2020 and its
// label has always said rising.
test("a dip inside a rising series does not change the word", () => {
  const dipped: TrendPoint[] = [
    { year: 2019, count: 100 },
    { year: 2020, count: 5 },
    { year: 2021, count: 400 },
  ];

  assert.match(sparklineSvg(dipped, 120, 30), / 100 rising to 400"/);
});

// The real block, not a fixture: the four dōjō carry it in metadata.json
// rather than a stats.json, so trendOf's walkingCompletions fallback is the
// path a Shikoku sparkline would take the day a page renders one.
test("the committed Shikoku 88 series reads as falling end to end", () => {
  const metadata = JSON.parse(
    readFileSync(join(ROOT, "routes", "shikoku-88-awa", "metadata.json"), "utf-8"),
  ) as { pilgrimage: { stats: unknown } };
  const trend = trendOf(metadata.pilgrimage.stats);

  assert.deepEqual(trend[0], { year: 2005, count: 1740 });
  assert.deepEqual(trend[trend.length - 1], { year: 2025, count: 1622 });
  assert.match(sparklineSvg(trend, 120, 30), / 1,740 falling to 1,622"/);
});

test("sparklineSvg returns an empty string for fewer than two points", () => {
  assert.equal(sparklineSvg([], 120, 30), "");
  assert.equal(sparklineSvg([{ year: 2000, count: 1 }], 120, 30), "");
});

// The shape routes/shikoku-88/stats.json carried before that route became the
// four dōjō sections: no top-level annualPilgrims.trend, only the Omotenashi
// Network's walking-completion series beneath it. No committed stats.json has
// the shape today, so the fallback is pinned on the shape rather than on a file.
test("trendOf falls back to walkingCompletions.trend when there is no top-level trend", () => {
  const trend = trendOf({
    annualPilgrims: {
      latest: { year: 2025, count: 150000 },
      walkingCompletions: {
        trend: [
          { year: 2005, count: 1740, foreign: 10 },
          { year: 2006, count: 1990, foreign: 34 },
        ],
      },
    },
  });

  assert.deepEqual(trend, [
    { year: 2005, count: 1740 },
    { year: 2006, count: 1990 },
  ]);
});

test("trendOf still reads camino-frances's real stats.json with the fallback in place", () => {
  const trend = trendOf(statsJson("camino-frances"));

  assert.equal(trend.length, 41);
  assert.deepEqual(trend[0], { year: 1985, count: 690 });
});

test("trendOf prefers the top-level trend over walkingCompletions.trend when both are present", () => {
  const trend = trendOf({
    annualPilgrims: {
      trend: [{ year: 2000, count: 1 }],
      walkingCompletions: { trend: [{ year: 1999, count: 999 }] },
    },
  });

  assert.deepEqual(trend, [{ year: 2000, count: 1 }]);
});

test("trendOf gracefully degrades when walkingCompletions.trend is not an array", () => {
  assert.deepEqual(
    trendOf({ annualPilgrims: { walkingCompletions: { trend: "not-an-array" } } }),
    [],
  );
});
