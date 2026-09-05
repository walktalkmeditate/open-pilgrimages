import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { primaryCountry, regionOf } from "./region.js";

const ROOT = join(import.meta.dirname, "..");
const loadJson = (path: string) => JSON.parse(readFileSync(path, "utf-8"));

test("a route that crosses a border is filed under the country it ends in", () => {
  assert.equal(primaryCountry(["FR", "ES"]), "ES");
});

test("a route inside one country is filed under that one", () => {
  assert.equal(primaryCountry(["JP"]), "JP");
});

test("a route with no countries at all is filed under nothing, not undefined", () => {
  assert.equal(primaryCountry([]), "");
  assert.equal(primaryCountry(undefined), "");
});

test("a country the table has never heard of lands in Other", () => {
  assert.equal(regionOf("ES"), "Europe");
  assert.equal(regionOf("JP"), "Asia");
  assert.equal(regionOf("ZZ"), "Other");
  assert.equal(regionOf(""), "Other");
});

test("every route's ways card and its index.json entry agree on country and region", () => {
  // The two files the app reads. They used to derive this from copies of the
  // same rule, synced by a comment; a drift between them would show one route
  // twice, in two regions, on the same catalog screen.
  const index = loadJson(join(ROOT, "index.json"));
  let checked = 0;

  for (const route of index.routes) {
    const cardPath = join(ROOT, route.path, "ways", "route.json");
    if (!existsSync(cardPath)) continue;

    const card = loadJson(cardPath);
    assert.equal(card.country, route.country, `${route.id}: country`);
    assert.equal(card.region, route.region, `${route.id}: region`);
    checked++;
  }

  assert.ok(checked > 0, "no route in index.json ships a ways/route.json to check against");
});
