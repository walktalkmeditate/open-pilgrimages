import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readPilgrimage,
  groupSections,
  firstDifferingPath,
  type PilgrimageBlock,
} from "./pilgrimage.js";

// Annotated (not inferred) so the "alternatives" literal survives being spread
// into groupSections' typed input below — inference alone widens it to string.
const block: PilgrimageBlock = { id: "kumano-kodo", name: { en: "Kumano Kodō" }, kind: "alternatives", order: 1 };

test("a metadata file with no pilgrimage block reads as undefined", () => {
  assert.equal(readPilgrimage({ id: "camino-frances" }), undefined);
});

test("a well-formed block reads back whole", () => {
  assert.deepEqual(readPilgrimage({ pilgrimage: block }), block);
});

test("a block missing a field names that field", () => {
  assert.throws(
    () => readPilgrimage({ pilgrimage: { ...block, kind: undefined } }),
    /pilgrimage\.kind/,
  );
});

test("a kind outside the two values is refused", () => {
  assert.throws(() => readPilgrimage({ pilgrimage: { ...block, kind: "chain" } }), /pilgrimage\.kind/);
});

test("sections group by id and sort by order", () => {
  const grouped = groupSections([
    { routeId: "b", block: { ...block, order: 2 } },
    { routeId: "a", block: { ...block, order: 1 } },
  ]);
  assert.deepEqual(grouped.get("kumano-kodo")?.routeIds, ["a", "b"]);
});

test("an optional circular flag reads back with the block", () => {
  assert.deepEqual(readPilgrimage({ pilgrimage: { ...block, kind: "legs", circular: true } }), {
    ...block,
    kind: "legs",
    circular: true,
  });
});

test("a circular that is not a boolean is refused", () => {
  assert.throws(
    () => readPilgrimage({ pilgrimage: { ...block, circular: "yes" } }),
    /pilgrimage\.circular/,
  );
});

const stats = {
  lastUpdated: "2026-03-27",
  dataYear: 2025,
  dataNote: "Shikoku has no central pilgrim office.",
  annualPilgrims: { walkingCompletions: { trend: [{ year: 2005, count: 1740, foreign: 10 }] } },
};

test("an optional stats block reads back with the block", () => {
  assert.deepEqual(readPilgrimage({ pilgrimage: { ...block, stats } }), { ...block, stats });
});

test("a stats that is not an object is refused", () => {
  assert.throws(
    () => readPilgrimage({ pilgrimage: { ...block, stats: "1,622" } }),
    /pilgrimage\.stats/,
  );
});

test("an array is not an object either", () => {
  assert.throws(
    () => readPilgrimage({ pilgrimage: { ...block, stats: [] } }),
    /pilgrimage\.stats/,
  );
});

test("the same block written in a different key order agrees with itself", () => {
  assert.equal(
    firstDifferingPath(
      { dataYear: 2025, dataNote: "no central office" },
      { dataNote: "no central office", dataYear: 2025 },
      "stats",
    ),
    undefined,
  );
});

test("a leaf that differs is named down to the year it sits in", () => {
  assert.equal(
    firstDifferingPath(
      { annualPilgrims: { trend: [{ year: 2021, count: 899 }] } },
      { annualPilgrims: { trend: [{ year: 2021, count: 1119 }] } },
      "stats",
    ),
    "stats.annualPilgrims.trend[0].count",
  );
});

test("a key one side leaves out is a difference, named where it is missing", () => {
  assert.equal(
    firstDifferingPath({ trend: [{ year: 2015, count: 3447, note: "1200th anniversary" }] }, { trend: [{ year: 2015, count: 3447 }] }, "stats"),
    "stats.trend[0].note",
  );
});

test("two series of different lengths are reported at the series, not inside it", () => {
  assert.equal(
    firstDifferingPath({ trend: [{ year: 2024 }, { year: 2025 }] }, { trend: [{ year: 2024 }] }, "stats"),
    "stats.trend",
  );
});

test("a block one section carries and another does not differs at the root", () => {
  assert.equal(firstDifferingPath(stats, undefined, "stats"), "stats");
});

test("two sections that both carry nothing agree", () => {
  assert.equal(firstDifferingPath(undefined, undefined, "stats"), undefined);
});
