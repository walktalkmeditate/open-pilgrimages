import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync,
  writeFileSync,
} from "fs";
import { spawnSync } from "child_process";
import { join } from "path";
import { tmpdir } from "os";
import Ajv2020 from "ajv/dist/2020.js";
import { classifyNode, OSM_TAG_MAP, type OsmNode } from "./osm.js";
import {
  keepsNode, wholeRouteRange, stageAssignmentRefusal, enforceStageAssignmentRefusal,
  OVERWRITE_FLAG,
} from "./waypoints.js";
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

const REFUSAL = "fixture-route: refusing to assign stages — days cut from another line.";

test("without the override flag the guard stops the run rather than warning about it", () => {
  // #given a composed refusal and a command line that does not waive it
  const printed: string[] = [];

  // #then the guard throws, which is what the script's exit code is made of —
  // a refusal that only prints leaves the overwrite it names to go ahead
  assert.throws(
    () => enforceStageAssignmentRefusal(REFUSAL, [], (m) => printed.push(m)),
    (err: Error) => {
      assert.equal(err.message, REFUSAL);
      return true;
    },
  );
  // #and nothing was written as a mere warning on the way past
  assert.deepEqual(printed, []);
});

test("with the override flag the guard proceeds, and still prints what it waived", () => {
  // #given the same refusal and a command line that passes the flag
  const printed: string[] = [];

  // #when the guard runs
  enforceStageAssignmentRefusal(REFUSAL, [OVERWRITE_FLAG], (m) => printed.push(m));

  // #then it returns — and the waived refusal is still on the record, because a
  // gate that goes quiet when it is waived reads like a gate that found nothing
  assert.equal(printed.length, 1);
  assert.ok(printed[0].includes(REFUSAL), "the waived refusal must still be printed in full");
  assert.match(printed[0], new RegExp(`${OVERWRITE_FLAG} was passed`));
});

test("a route with nothing to refuse passes the guard in silence", () => {
  const printed: string[] = [];
  enforceStageAssignmentRefusal(undefined, [], (m) => printed.push(m));
  assert.deepEqual(printed, []);
});

/**
 * A whole route directory the enricher can be run against end to end, with the
 * Overpass answer already in the cache it reads — a test that needed the
 * network to prove a gate would not be a test of the gate.
 *
 * Nested inside the repo root rather than the system tmpdir: node resolves the
 * "tsx" loader as a bare specifier from cwd, and only walking up to the repo's
 * own node_modules/ can satisfy that.
 */
function scriptRepo(): { dir: string; scriptPath: string; wpPath: string } {
  const dir = mkdtempSync(join(ROOT, ".enrich-waypoints-test-"));
  cpSync(join(ROOT, "scripts"), join(dir, "scripts"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", version: "0.0.0" }));

  const routeDir = join(dir, "routes", "fixture-route");
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(join(routeDir, "metadata.json"),
    JSON.stringify({ overview: { bbox: [0, 0, 0.02, 0.01], distanceKm: 2.2 } }));
  writeFileSync(join(routeDir, "route.geojson"), JSON.stringify(lineFeature([[0, 0], [0.02, 0]])));
  writeFileSync(join(routeDir, "route.main.geojson"), JSON.stringify(lineFeature([[0, 0], [0.01, 0]])));
  writeFileSync(join(routeDir, "stages.json"), JSON.stringify({
    stages: [{ start: { coordinates: [0, 0] }, end: { coordinates: [0.01, 0] }, distanceKm: 1.1 }],
  }));
  const wpPath = join(routeDir, "waypoints.geojson");
  writeFileSync(wpPath, JSON.stringify({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      id: "wp-curated",
      geometry: { type: "Point", coordinates: [0.005, 0] },
      properties: { routeId: "fixture-route", name: "Fixture", type: "town", source: "curated", stageIndex: 0 },
    }],
  }));

  const cacheDir = join(dir, ".cache", "enrich");
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, "pois-fixture-route.json"),
    JSON.stringify({ fetchedAt: new Date().toISOString(), data: { elements: [] } }));

  return { dir, scriptPath: join(dir, "scripts", "enrich", "waypoints.ts"), wpPath };
}

const runEnricher = (dir: string, scriptPath: string, args: string[]) =>
  spawnSync(process.execPath, ["--import", "tsx", scriptPath, "fixture-route", ...args],
    { cwd: dir, encoding: "utf-8" });

test("the script itself refuses: it exits non-zero and writes nothing", () => {
  // #given a route whose days are cut from a line this run does not measure
  const { dir, scriptPath, wpPath } = scriptRepo();
  try {
    const before = readFileSync(wpPath, "utf-8");

    // #when the enricher is run without the flag
    const run = runEnricher(dir, scriptPath, []);

    // #then the run fails, names the route, and the waypoints on disk are as
    // they were — the guard's teeth are the exit code, not the message
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /fixture-route: refusing to assign stages/);
    assert.match(run.stderr, new RegExp(`pass ${OVERWRITE_FLAG}`));
    assert.equal(readFileSync(wpPath, "utf-8"), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the script itself honours the override: it finishes, and says what it waived", () => {
  // #given the same route
  const { dir, scriptPath, wpPath } = scriptRepo();
  try {
    // #when the enricher is run with the flag
    const run = runEnricher(dir, scriptPath, [OVERWRITE_FLAG]);

    // #then it runs to the end
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Total waypoints: 1/);
    // #and the refusal it waived is on the record beside the result
    assert.match(run.stderr, /fixture-route: refusing to assign stages/);
    assert.match(run.stderr, new RegExp(`${OVERWRITE_FLAG} was passed`));
    // #and the assignment really was rewritten over what was on disk
    assert.equal(JSON.parse(readFileSync(wpPath, "utf-8")).features.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
