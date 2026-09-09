import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildWayGraph,
  nearestGraphNode,
  shortestPath,
  mainLine,
  refuseIncompleteLine,
  refuseDistantAnchors,
  anchorsFrom,
  relationsFrom,
  requireRelations,
} from "./build-main-line.js";
import { SNAP_METERS } from "../ways/geo.js";
import type { Position } from "../ways/types.js";

/** 0.01° at the equator on the R = 6,371,000 m sphere. */
const LEG = 1111.949;

/**
 * A main line from (0,0) east to (0.03,0), with a longer alternative between
 * (0.01,0) and (0.02,0) — the exact shape OSM bundles into a route relation
 * with no role to tell the two apart.
 */
const WAYS: Position[][] = [
  [[0, 0], [0.005, 0], [0.01, 0]],
  [[0.01, 0], [0.015, 0], [0.02, 0]],
  [[0.01, 0], [0.015, 0.005], [0.02, 0]],
  [[0.02, 0], [0.025, 0], [0.03, 0]],
];

test("buildWayGraph joins ways at coordinates they share exactly", () => {
  const graph = buildWayGraph(WAYS);
  // (0,0), (0.01,0), (0.02,0), (0.03,0) — the four way endpoints.
  assert.equal(graph.nodes.length, 4);
  assert.equal(graph.adjacency.get(1)!.length, 3);
});

test("buildWayGraph splits a way at a coordinate another way meets in its middle", () => {
  const graph = buildWayGraph([
    [[0, 0], [0.01, 0], [0.02, 0]],
    [[0.01, 0], [0.01, 0.01]],
  ]);
  const junction = nearestGraphNode(graph, [0.01, 0]);
  assert.ok(junction.meters < 1e-6);
  assert.equal(graph.adjacency.get(junction.node)!.length, 3);
});

test("nearestGraphNode reports the node and how far off it was", () => {
  const graph = buildWayGraph(WAYS);
  const found = nearestGraphNode(graph, [0.0201, 0]);
  assert.deepEqual(graph.nodes[found.node], [0.02, 0]);
  assert.ok(Math.abs(found.meters - 11.1) < 0.2);
});

test("shortestPath takes the main line and leaves the longer alternative behind", () => {
  const graph = buildWayGraph(WAYS);
  const from = nearestGraphNode(graph, [0, 0]).node;
  const to = nearestGraphNode(graph, [0.03, 0]).node;
  const path = shortestPath(graph, from, to)!;

  assert.ok(Math.abs(path.meters - 3 * LEG) < 1, `${path.meters}`);
  assert.equal(path.line.some((p) => p[1] !== 0), false, "the alternative's detour leaked in");
  assert.deepEqual(path.line[0], [0, 0]);
  assert.deepEqual(path.line.at(-1), [0.03, 0]);
});

test("shortestPath returns null when the two nodes are not connected", () => {
  const graph = buildWayGraph([
    [[0, 0], [0.01, 0]],
    [[1, 1], [1.01, 1]],
  ]);
  const from = nearestGraphNode(graph, [0, 0]).node;
  const to = nearestGraphNode(graph, [1.01, 1]).node;
  assert.equal(shortestPath(graph, from, to), null);
});

test("mainLine walks the anchors in order and reports each leg", () => {
  const result = mainLine(WAYS, [[0, 0], [0.02, 0], [0.03, 0]]);
  assert.equal(result.missing.length, 0);
  assert.equal(result.legs.length, 2);
  assert.ok(Math.abs(result.legs[0] - 2 * LEG) < 1);
  assert.ok(Math.abs(result.legs[1] - LEG) < 1);
  assert.deepEqual(result.line[0], [0, 0]);
  assert.deepEqual(result.line.at(-1), [0.03, 0]);
});

test("mainLine names the legs it could not connect rather than silently skipping them", () => {
  const result = mainLine(
    [
      [[0, 0], [0.01, 0]],
      [[1, 1], [1.01, 1]],
    ],
    [[0, 0], [0.01, 0], [1.01, 1]],
  );
  assert.equal(result.missing.length, 1);
  assert.match(result.missing[0], /leg 1/);
});

test("mainLine never repeats the point where one leg ends and the next begins", () => {
  const result = mainLine(WAYS, [[0, 0], [0.01, 0], [0.02, 0], [0.03, 0]]);
  for (let i = 1; i < result.line.length; i++) {
    assert.notDeepEqual(result.line[i], result.line[i - 1]);
  }
});

test("mainLine reports how far each anchor sat from the graph it snapped to", () => {
  const result = mainLine(WAYS, [[0, 0], [0.02, 0.001], [0.03, 0]]);
  assert.equal(result.snaps.length, 3);
  assert.ok(result.snaps[0] < 1e-6);
  assert.ok(Math.abs(result.snaps[1] - 111.2) < 1, `${result.snaps[1]}`);
  assert.ok(result.snaps[2] < 1e-6);
});

test("relationsFrom keeps the relations and leaves every other element behind", () => {
  const relations = relationsFrom(
    { elements: [{ type: "way", id: 1 }, { type: "relation", id: 2 }, { type: "node", id: 3 }] },
    "camino-frances",
  );
  assert.deepEqual(relations.map((r) => r.id), [2]);
});

test("relationsFrom names the route when Overpass sent back no elements array", () => {
  // What a soft timeout, an error document, or a rewritten cache actually
  // hands this — each of which satisfied the old cast and died on .filter.
  for (const body of [{}, { remark: "runtime error" }, { elements: "not an array" }, null, "nonsense"]) {
    assert.throws(
      () => relationsFrom(body, "camino-frances"),
      /camino-frances: Overpass returned no elements array/,
      `${JSON.stringify(body)} should have been refused`,
    );
  }
});

/** Runs `body` with process.exit and console.error captured rather than real. */
function capture(body: () => void): { exitCode: number | undefined; errors: string[] } {
  const realExit = process.exit;
  const realError = console.error;
  const errors: string[] = [];
  let exitCode: number | undefined;
  // process.exit is typed `never`, so the stub throws to reproduce the way the
  // real one stops the caller — otherwise execution would fall through to the
  // write this guard exists to prevent.
  process.exit = ((code?: number) => {
    exitCode = code;
    throw new Error("process.exit");
  }) as typeof process.exit;
  console.error = (...args: unknown[]) => void errors.push(args.join(" "));
  try {
    body();
  } catch (error) {
    if ((error as Error).message !== "process.exit") throw error;
  } finally {
    process.exit = realExit;
    console.error = realError;
  }
  return { exitCode, errors };
}

test("refuseIncompleteLine exits non-zero and names every gap it found", () => {
  const gaps = mainLine(
    [
      [[0, 0], [0.01, 0]],
      [[1, 1], [1.01, 1]],
    ],
    [[0, 0], [0.01, 0], [1.01, 1]],
  ).missing;

  const { exitCode, errors } = capture(() => refuseIncompleteLine(gaps));

  assert.equal(exitCode, 1);
  assert.ok(
    errors.some((line) => /leg 1/.test(line)),
    `the gap itself was never printed: ${JSON.stringify(errors)}`,
  );
  assert.ok(
    errors.some((line) => /Refusing to write/.test(line)),
    `nothing said the line would not be written: ${JSON.stringify(errors)}`,
  );
});

test("refuseIncompleteLine lets a fully connected line through", () => {
  const gaps = mainLine(WAYS, [[0, 0], [0.02, 0], [0.03, 0]]).missing;
  assert.equal(gaps.length, 0);

  const { exitCode, errors } = capture(() => refuseIncompleteLine(gaps));

  assert.equal(exitCode, undefined);
  assert.deepEqual(errors, []);
});

/**
 * The case that makes this gate worth having: withhold a route's *terminal*
 * relation and the remaining graph is still perfectly connected, so
 * refuseIncompleteLine sees nothing. Measured on Awa with 22→23 withheld, the
 * line lost 21.6 km without a word and Temple 23 landed 13,454 m off it.
 */
test("refuseDistantAnchors catches the short line refuseIncompleteLine cannot see", () => {
  const truncated: Position[][] = [
    [[0, 0], [0.005, 0], [0.01, 0]],
    [[0.01, 0], [0.015, 0], [0.02, 0]],
  ];
  const result = mainLine(truncated, [[0, 0], [0.02, 0], [0.03, 0]]);
  assert.deepEqual(result.missing, [], "the connectivity gate should see nothing wrong here");

  const snaps = [
    { label: "start", meters: result.snaps[0] },
    { label: "middle", meters: result.snaps[1] },
    { label: "Yakuō-ji", meters: result.snaps[2] },
  ];
  assert.ok(snaps[2].meters > SNAP_METERS, `${snaps[2].meters} m should be past ${SNAP_METERS}`);

  const { exitCode, errors } = capture(() => refuseDistantAnchors(snaps));

  assert.equal(exitCode, 1);
  assert.ok(
    errors.some((line) => /Yakuō-ji/.test(line)),
    `the anchor the line never reached was not named: ${JSON.stringify(errors)}`,
  );
  assert.ok(
    errors.some((line) => /Refusing to write/.test(line)),
    `nothing said the line would not be written: ${JSON.stringify(errors)}`,
  );
});

test("refuseDistantAnchors lets anchors the line reaches through", () => {
  const result = mainLine(WAYS, [[0, 0], [0.02, 0], [0.03, 0]]);
  const { exitCode, errors } = capture(() =>
    refuseDistantAnchors(result.snaps.map((meters, i) => ({ label: `anchor ${i}`, meters }))),
  );

  assert.equal(exitCode, undefined);
  assert.deepEqual(errors, []);
});

/**
 * main() is not exported and its ROOT is fixed to the repo, so the only way to
 * pin "a gap stops the write" is to check the wiring: the guard is called, and
 * it is called before the write it exists to prevent.
 */
test("main calls both guards, and calls them before writing the line", () => {
  const source = readFileSync(new URL("./build-main-line.ts", import.meta.url), "utf-8");
  const guard = source.search(/^\s*refuseIncompleteLine\(/m);
  const anchorGuard = source.search(/^\s*refuseDistantAnchors\(/m);
  const write = source.search(/^\s*writeFileSync\(/m);
  assert.ok(guard > 0, "main() never calls refuseIncompleteLine");
  assert.ok(anchorGuard > 0, "main() never calls refuseDistantAnchors");
  assert.ok(write > 0, "main() never writes route.main.geojson");
  assert.ok(guard < write, "the line is written before the gaps are checked");
  assert.ok(anchorGuard < write, "the line is written before the anchors are checked");
});

test("a section with only an osm.query is refused", () => {
  const root = mkdtempSync(join(tmpdir(), "main-line-test-"));
  try {
    const dir = join(root, "routes", "kumano-kodo-nakahechi");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "metadata.json"),
      JSON.stringify({ id: "kumano-kodo-nakahechi", name: { en: "Kumano Kodō" }, osm: { query: 'relation["name"~"熊野古道"]' } }),
    );
    writeFileSync(join(dir, "stages.json"), JSON.stringify({ stages: [] }));

    assert.throws(() => requireRelations(dir, "kumano-kodo-nakahechi"), /kumano-kodo-nakahechi/);
    assert.throws(() => requireRelations(dir, "kumano-kodo-nakahechi"), /osm\.relations/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a section with pinned relations passes", () => {
  const root = mkdtempSync(join(tmpdir(), "main-line-test-"));
  try {
    const dir = join(root, "routes", "camino-frances");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "metadata.json"),
      JSON.stringify({ id: "camino-frances", name: { en: "Camino Francés" }, osm: { relations: [2163569] } }),
    );
    assert.deepEqual(requireRelations(dir, "camino-frances"), [2163569]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** A route directory holding only the files the test names. */
function routeDir(files: Record<string, unknown>): { dir: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "main-line-test-"));
  const dir = join(root, "routes", "shikoku-88-awa");
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(body));
  }
  return { dir, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const ENDPOINTS = {
  overview: {
    startPoint: { name: { en: "Ryōzen-ji" }, coordinates: [134.503, 34.16] },
    endPoint: { name: { en: "Yakuō-ji" }, coordinates: [134.528, 33.732] },
  },
};

const curatedWaypoint = (name: string, coordinates: number[], kmFromStart: number) => ({
  type: "Feature",
  id: name,
  geometry: { type: "Point", coordinates },
  properties: { routeId: "shikoku-88-awa", name, type: "sacred_site", kmFromStart },
});

test("anchorsFrom takes the stage boundaries when the route has stages", () => {
  const { dir, cleanup } = routeDir({
    "metadata.json": ENDPOINTS,
    "stages.json": {
      stages: [
        { index: 0, name: { en: "Day one" }, distanceKm: 4, start: { coordinates: [0, 0] }, end: { coordinates: [0.04, 0] } },
        { index: 1, name: { en: "Day two" }, distanceKm: 6, start: { coordinates: [0.04, 0] }, end: { coordinates: [0.1, 0] } },
      ],
    },
  });
  try {
    const { anchors, from, declaredLegKm } = anchorsFrom(dir, "shikoku-88-awa");
    assert.equal(from, "stages.json");
    assert.deepEqual(anchors.map((a) => a.coordinates), [[0, 0], [0.04, 0], [0.1, 0]]);
    assert.deepEqual(anchors.map((a) => a.label), ["Day one", "Day two", "end of Day two"]);
    assert.deepEqual(declaredLegKm, [4, 6]);
  } finally {
    cleanup();
  }
});

/**
 * The bootstrap: the days this section will ship are cut from the very line
 * being built here, so there is no stages.json to anchor on.
 */
test("anchorsFrom anchors a section with no stages on its endpoints and its curated waypoints", () => {
  const { dir, cleanup } = routeDir({
    "metadata.json": ENDPOINTS,
    "waypoints.geojson": {
      features: [
        // Out of route order in the file, and one of them machine-derived.
        curatedWaypoint("Kirihata-ji", [134.35, 34.09], 22.1),
        {
          ...curatedWaypoint("A bus stop", [134.4, 34.0], 10),
          properties: { name: "A bus stop", type: "transport", kmFromStart: 10, source: "osm", osmId: "node/1" },
        },
        curatedWaypoint("Gokuraku-ji", [134.49, 34.15], 1.3),
      ],
    },
  });
  try {
    const { anchors, from, declaredLegKm } = anchorsFrom(dir, "shikoku-88-awa");
    assert.equal(from, "overview endpoints and waypoints.geojson");
    assert.equal(declaredLegKm, undefined);
    assert.deepEqual(anchors.map((a) => a.label), [
      "Ryōzen-ji", "Gokuraku-ji", "Kirihata-ji", "Yakuō-ji",
    ]);
  } finally {
    cleanup();
  }
});

test("anchorsFrom does not repeat an endpoint that is also a curated waypoint", () => {
  const { dir, cleanup } = routeDir({
    "metadata.json": ENDPOINTS,
    "waypoints.geojson": {
      features: [
        curatedWaypoint("Ryōzen-ji", [134.503, 34.16], 0),
        curatedWaypoint("Yakuō-ji", [134.528, 33.732], 149.8),
      ],
    },
  });
  try {
    const { anchors } = anchorsFrom(dir, "shikoku-88-awa");
    assert.deepEqual(anchors.map((a) => a.label), ["Ryōzen-ji", "Yakuō-ji"]);
  } finally {
    cleanup();
  }
});

test("anchorsFrom refuses a curated waypoint it cannot put in route order", () => {
  const { dir, cleanup } = routeDir({
    "metadata.json": ENDPOINTS,
    "waypoints.geojson": {
      features: [
        {
          ...curatedWaypoint("Konsen-ji", [134.45, 34.12], 0),
          properties: { name: "Konsen-ji", type: "sacred_site" },
        },
      ],
    },
  });
  try {
    assert.throws(() => anchorsFrom(dir, "shikoku-88-awa"), /Konsen-ji/);
    assert.throws(() => anchorsFrom(dir, "shikoku-88-awa"), /kmFromStart/);
  } finally {
    cleanup();
  }
});

test("anchorsFrom refuses a section whose endpoints have nothing between them", () => {
  const { dir, cleanup } = routeDir({
    "metadata.json": ENDPOINTS,
    "waypoints.geojson": { features: [] },
  });
  try {
    assert.throws(() => anchorsFrom(dir, "shikoku-88-awa"), /no curated waypoints/);
  } finally {
    cleanup();
  }
});
