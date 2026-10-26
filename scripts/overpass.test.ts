import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_OVERPASS_URL, overpassUrl } from "./overpass.js";

test("overpassUrl: the public instance when OVERPASS_URL is unset", () => {
  assert.equal(overpassUrl({}), DEFAULT_OVERPASS_URL);
  assert.equal(DEFAULT_OVERPASS_URL, "https://overpass-api.de/api/interpreter");
});

test("overpassUrl: a blank OVERPASS_URL is the same as none", () => {
  assert.equal(overpassUrl({ OVERPASS_URL: "" }), DEFAULT_OVERPASS_URL);
  assert.equal(overpassUrl({ OVERPASS_URL: "   " }), DEFAULT_OVERPASS_URL);
});

test("overpassUrl: OVERPASS_URL replaces the instance, trimmed", () => {
  assert.equal(
    overpassUrl({ OVERPASS_URL: " https://maps.mail.ru/osm/tools/overpass/api/interpreter\n" }),
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  );
});
