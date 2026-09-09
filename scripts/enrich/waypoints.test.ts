import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import Ajv2020 from "ajv/dist/2020.js";
import { classifyNode, OSM_TAG_MAP, type OsmNode } from "./osm.js";
import { keepsNode, wholeRouteRange, stageAssignmentRefusal, OVERWRITE_FLAG } from "./waypoints.js";
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

test("a section with no stages yet spreads one provisional range over its whole line", () => {
  // #given a line of five points and a section declaring 154.5 km
  const coords: Array<[number, number]> = [[0, 0], [0.01, 0], [0.02, 0], [0.03, 0], [0.04, 0]];

  // #when the days it will be cut into do not exist yet
  const { ranges, useGeographicFallback } = wholeRouteRange(coords, 154.5);

  // #then one range spans the line end to end, and nothing falls off either edge
  assert.equal(ranges.length, 1);
  assert.equal(useGeographicFallback, false);
  assert.equal(ranges[0].startIdx, 0);
  assert.equal(ranges[0].endIdx, coords.length - 1);
  assert.equal(ranges[0].cumulativeStartKm, 0);
  assert.equal(ranges[0].distanceKm, 154.5);
  assert.deepEqual(ranges[0].startCoord, [0, 0]);
  assert.deepEqual(ranges[0].endCoord, [0.04, 0]);
});

const lineFeature = (coordinates: Array<[number, number]>) => ({
  type: "FeatureCollection",
  features: [{ type: "Feature", geometry: { type: "LineString", coordinates }, properties: {} }],
});

/**
 * A route directory carrying only the four files the refusal reads. Each is
 * written separately so a test can leave one out and see the guard's answer
 * turn on that file alone.
 */
function fixtureRoute(files: {
  stages?: boolean;
  main?: Array<[number, number]>;
  route?: Array<[number, number]>;
  stageIndexes?: Array<number | undefined>;
}): string {
  const dir = mkdtempSync(join(tmpdir(), "enrich-waypoints-test-"));
  if (files.stages) writeFileSync(join(dir, "stages.json"), JSON.stringify({ stages: [] }));
  if (files.main) writeFileSync(join(dir, "route.main.geojson"), JSON.stringify(lineFeature(files.main)));
  if (files.route) writeFileSync(join(dir, "route.geojson"), JSON.stringify(lineFeature(files.route)));
  if (files.stageIndexes) {
    writeFileSync(join(dir, "waypoints.geojson"), JSON.stringify({
      type: "FeatureCollection",
      features: files.stageIndexes.map((stageIndex, i) => ({
        type: "Feature",
        id: `wp-${i}`,
        geometry: { type: "Point", coordinates: [0, 0] },
        properties: { ...(stageIndex !== undefined && { stageIndex }) },
      })),
    }));
  }
  return dir;
}

test("a route whose days are cut from a different line refuses the assignment", () => {
  // #given a section whose route.geojson runs twice the length of the walked
  // line its days are cut from, and three waypoints of which two are assigned
  const dir = fixtureRoute({
    stages: true,
    main: [[0, 0], [0.01, 0]],
    route: [[0, 0], [0.02, 0]],
    stageIndexes: [0, undefined, 3],
  });
  try {
    const refusal = stageAssignmentRefusal(dir, "fixture-route");

    // #then the run is refused, and the message names the route, both lines
    // with their measured lengths, how far apart they are, and what would go
    assert.ok(refusal, "a route cut from another line must refuse");
    assert.match(refusal, /^fixture-route: refusing to assign stages/);
    assert.match(refusal, /route\.main\.geojson\s+1\.1 km/);
    assert.match(refusal, /route\.geojson\s+2\.2 km/);
    assert.match(refusal, /2\.00x longer/);
    // #and the count is of waypoints that carry a stageIndex, not of features
    assert.match(refusal, /2 waypoint\(s\) on disk already carry a stageIndex/);
    assert.match(refusal, new RegExp(`pass ${OVERWRITE_FLAG}`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the bootstrap run, before the days are cut, is not refused", () => {
  // #given a section with a walked line but no stages.json — the state Shikoku
  // was enriched in, because its day rule reads the waypoints that run writes
  const dir = fixtureRoute({ main: [[0, 0], [0.01, 0]], route: [[0, 0], [0.02, 0]] });
  try {
    // #then nothing is refused: there is no cut yet for the assignment to disagree with
    assert.equal(stageAssignmentRefusal(dir, "fixture-route"), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a route measured against the only line it has is not refused", () => {
  // #given a section whose days are cut from route.geojson itself
  const dir = fixtureRoute({ stages: true, route: [[0, 0], [0.02, 0]], stageIndexes: [0, 1] });
  try {
    // #then the assignment below measures the same line build-ways does, so it stands
    assert.equal(stageAssignmentRefusal(dir, "fixture-route"), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every route in this dataset whose days are cut from a main line is refused", () => {
  // #given the real corpus rather than a fixture
  const routesDir = join(ROOT, "routes");
  const refused: string[] = [];
  for (const id of readdirSync(routesDir).sort()) {
    const dir = join(routesDir, id);
    if (!statSync(dir).isDirectory()) continue;

    // #when a route has both a day cut and a walked line the cut is measured against
    const cutFromMainLine =
      existsSync(join(dir, "stages.json")) && existsSync(join(dir, "route.main.geojson"));
    const refusal = stageAssignmentRefusal(dir, id);

    // #then it is refused, and a route without both is not
    assert.equal(refusal !== undefined, cutFromMainLine, `${id}`);
    if (refusal) {
      refused.push(id);
      // #and the two lines really do disagree, which is the whole hazard
      assert.match(refusal, /\d+\.\d\dx longer/, `${id} must measure both lines`);
    }
  }

  // #and the four Shikoku sections are among them, so this cannot pass vacuously
  for (const section of ["awa", "iyo", "sanuki", "tosa"]) {
    assert.ok(refused.includes(`shikoku-88-${section}`), `shikoku-88-${section} must be protected`);
  }
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
