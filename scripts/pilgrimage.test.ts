import { test } from "node:test";
import assert from "node:assert/strict";
import { readPilgrimage, groupSections, type PilgrimageBlock } from "./pilgrimage.js";

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
