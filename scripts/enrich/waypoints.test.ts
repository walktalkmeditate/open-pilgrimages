import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import Ajv2020 from "ajv/dist/2020.js";
import { classifyNode, OSM_TAG_MAP, type OsmNode } from "./osm.js";
import { keepsNode } from "./waypoints.js";
import { MOMENT_TYPES } from "../ways/moments.js";

// waypoints.ts only runs its enrichment when it is the invoked script, so
// importing it here reaches keepsNode without touching the network, the
// Overpass cache, or any route file on disk.

const ROOT = join(import.meta.dirname, "..", "..");

function loadJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function validateWaypoint(feature: unknown): boolean {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schema = loadJson(join(ROOT, "schema", "waypoints.schema.json"));
  const collection = { type: "FeatureCollection", features: [feature] };
  return ajv.validate(schema, collection) as boolean;
}

function classify(tags: Record<string, string>): string {
  const node: OsmNode = { type: "node", id: 1, lat: 43, lon: -2, tags };
  const classification = classifyNode(node);
  assert.ok(classification, `${JSON.stringify(tags)} must classify, or the test proves nothing`);
  return classification.type;
}

function kept(tags: Record<string, string>): boolean {
  return keepsNode(classify(tags), tags);
}

test("a nameless place is skipped while a nameless service is kept", () => {
  // #given two nodes OpenStreetMap never named
  const viewpoint = { tourism: "viewpoint" };
  const fountain = { amenity: "drinking_water" };

  // #when each is put to the enricher's filter
  // #then the viewpoint is dropped — its only label would be the "Unnamed"
  // placeholder, which tells a walker standing there nothing at all
  assert.equal(kept(viewpoint), false);
  // #and the fountain is kept — it is water whether or not anyone named it
  assert.equal(kept(fountain), true);
});

test("the same viewpoint is kept once OSM gives it a name", () => {
  // #given the node that was just dropped, now carrying a name
  // #then it is admitted, so the filter turns on the name and not on the type
  assert.equal(kept({ tourism: "viewpoint", name: "Mirador de San Roque" }), true);
});

test("a localized-only name is a name", () => {
  // #given a church named in Spanish but not in English
  // #then it is kept — extractName reads name:es, so the card has a label
  assert.equal(kept({ amenity: "place_of_worship", "name:es": "Iglesia de Santa María" }), true);
});

const TYPE_FIXTURES: Record<string, Record<string, string>> = {
  sacred_site: { amenity: "place_of_worship" },
  cultural_site: { historic: "ruins" },
  viewpoint: { tourism: "viewpoint" },
  town: { place: "village" },
  water_source: { amenity: "drinking_water" },
  medical: { amenity: "pharmacy" },
  accommodation: { tourism: "hostel" },
  food: { amenity: "cafe" },
  supply: { shop: "convenience" },
  transport: { highway: "bus_stop" },
};

test("every place type demands a name, and no service type does", () => {
  // #given one classified node per type the enricher can produce, all nameless
  // #then the split follows MOMENT_TYPES exactly, with nothing hand-listed twice
  for (const [type, tags] of Object.entries(TYPE_FIXTURES)) {
    assert.equal(classify(tags), type, `${type} fixture must classify as itself`);
    assert.equal(keepsNode(type, tags), !MOMENT_TYPES.includes(type), `${type} nameless`);
  }
});

test("the sweep follows OSM_TAG_MAP rather than a hand-written list", () => {
  // #given every distinct type the tag map can produce
  const produced = new Set(Object.values(OSM_TAG_MAP).map((c) => c.type));
  // #then the fixture covers exactly those, so a new type cannot slip out silently
  assert.deepEqual(new Set(Object.keys(TYPE_FIXTURES)), produced);
});

test("a waypoint sourced from an OSM way validates", () => {
  // #given a place mapped as a way, which ōji shrines and temple precincts often are
  const feature = {
    type: "Feature",
    geometry: { type: "Point", coordinates: [135.7, 33.9] },
    properties: { routeId: "r", name: "n", type: "sacred_site", source: "osm", osmId: "way/12345" },
  };
  // #then the schema accepts it — the node-only pattern would have refused
  assert.equal(validateWaypoint(feature), true);
});
