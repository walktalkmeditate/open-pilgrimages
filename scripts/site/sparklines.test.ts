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

test("sparklineSvg returns an empty string for fewer than two points", () => {
  assert.equal(sparklineSvg([], 120, 30), "");
  assert.equal(sparklineSvg([{ year: 2000, count: 1 }], 120, 30), "");
});
