import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fitToBox, mercator, type Point } from "./project.js";
import { GLYPH_BOX } from "./glyphs.js";
import {
  buildRoads,
  cachePathFor,
  corridorCellSet,
  decimateRoutePoints,
  fitToRouteBounds,
  hashRouteGeometry,
  isAllowedWay,
  isWellFormedXml,
  mergeConnectedWays,
  overpassQueryFor,
  readRoadsCache,
  roadsSvgFrom,
  selectCorridor,
  waysFromCache,
  wayInCorridor,
  type OverpassWay,
  type RoadsCacheFile,
} from "./roads.js";

const ROOT = join(import.meta.dirname, "..", "..");

function way(id: number, highway: string, points: Point[], extraTags: Record<string, string> = {}): OverpassWay {
  return {
    type: "way",
    id,
    tags: { highway, ...extraTags },
    geometry: points.map(([lon, lat]) => ({ lon, lat })),
  };
}

function lineStringGeojson(coordinates: Point[]): unknown {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "LineString", coordinates } }],
  };
}

// --- decimateRoutePoints ---

test("decimateRoutePoints keeps the first and last point of every segment", () => {
  const segment: Point[] = [
    [135.5, 33.77],
    [135.5001, 33.7701],
    [135.51, 33.78],
  ];
  const kept = decimateRoutePoints([segment], 1.5);

  assert.deepEqual(kept[0], segment[0]);
  assert.deepEqual(kept[kept.length - 1], segment[segment.length - 1]);
});

test("decimateRoutePoints drops points closer together than the spacing, but keeps ones far enough apart", () => {
  // #given two points ~11 m apart (well under 1.5 km) and a third ~1.7 km further on
  const dense: Point[] = [
    [135.5, 33.77],
    [135.50005, 33.77005],
  ];
  const far: Point = [135.52, 33.77];

  const kept = decimateRoutePoints([[...dense, far]], 1.5);

  // #then the middle point is dropped, but the distant one survives
  assert.equal(kept.length, 2);
  assert.deepEqual(kept[0], dense[0]);
  assert.deepEqual(kept[1], far);
});

test("decimateRoutePoints handles an empty segment list without throwing", () => {
  assert.deepEqual(decimateRoutePoints([]), []);
});

// --- overpassQueryFor ---

test("overpassQueryFor requests only the seven allowed highway values, excludes private access, and asks for geometry around the given points", () => {
  const query = overpassQueryFor([
    [135.5, 33.77],
    [135.51, 33.78],
  ]);

  assert.match(query, /highway.*~.*motorway\|trunk\|primary\|secondary\|tertiary\|unclassified\|residential/);
  assert.match(query, /access.*!=.*private/);
  assert.match(query, /out geom;/);
  assert.match(query, /\[timeout:\d+\]/);
  assert.match(query, /way\(around:\d+,33\.77000,135\.50000,33\.78000,135\.51000\)/);
});

// --- isAllowedWay ---

test("isAllowedWay accepts every 'major road' value", () => {
  for (const highway of ["motorway", "trunk", "primary", "secondary", "tertiary"]) {
    assert.equal(isAllowedWay(way(1, highway, [[0, 0]])), true, highway);
  }
});

test("isAllowedWay rejects highway values outside the major-roads set, including lifecycle/non-road tags and unclassified/residential", () => {
  // unclassified/residential are deliberately excluded here even though the
  // Overpass query fetches them — see MAJOR_HIGHWAY_VALUES's comment: they
  // dominate a corridor's way count and pushed several routes' rendered
  // output past the plan's ~150 KB ceiling.
  for (const highway of [
    "construction",
    "proposed",
    "raceway",
    "busway",
    "footway",
    "motorway_link",
    "path",
    "unclassified",
    "residential",
  ]) {
    assert.equal(isAllowedWay(way(1, highway, [[0, 0]])), false, highway);
  }
});

test("isAllowedWay rejects access=private but not other restricted access values", () => {
  assert.equal(isAllowedWay(way(1, "primary", [[0, 0]], { access: "private" })), false);
  assert.equal(isAllowedWay(way(2, "primary", [[0, 0]], { access: "no" })), true);
  assert.equal(isAllowedWay(way(3, "primary", [[0, 0]])), true);
});

// --- corridor selection ---

const ROUTE_LINE: Point[] = [
  [135.5, 33.77],
  [135.51, 33.78],
];

test("wayInCorridor keeps a way with a point close to the route", () => {
  const cells = corridorCellSet(ROUTE_LINE);
  const nearby = way(1, "primary", [[135.503, 33.773]]);

  assert.equal(wayInCorridor(nearby, cells), true);
});

test("wayInCorridor excludes a way whose points are all far from the route", () => {
  const cells = corridorCellSet(ROUTE_LINE);
  const distant = way(1, "primary", [[136.5, 34.77]]);

  assert.equal(wayInCorridor(distant, cells), false);
});

test("selectCorridor reports fetched vs kept counts and keeps only the nearby way", () => {
  const nearby = way(1, "primary", [[135.503, 33.773]]);
  const distant = way(2, "primary", [[136.5, 34.77]]);

  const result = selectCorridor(ROUTE_LINE, [nearby, distant]);

  assert.equal(result.waysFetched, 2);
  assert.equal(result.waysKept, 1);
  assert.deepEqual(result.kept.map((w) => w.id), [1]);
});

// --- waysFromCache ---

test("waysFromCache coerces raw cache elements and drops anything that isn't a well-formed way", () => {
  const cache: RoadsCacheFile = {
    fetchedAt: "2026-08-01T00:00:00.000Z",
    routeId: "test",
    query: "",
    elements: [
      { type: "way", id: 1, tags: { highway: "primary" }, geometry: [{ lat: 1, lon: 2 }] },
      { type: "node", id: 2 },
      "not an object",
      null,
      { type: "way", id: 3 }, // missing tags/geometry — should still coerce with empty defaults
    ],
  };

  const ways = waysFromCache(cache);
  assert.deepEqual(
    ways.map((w) => w.id),
    [1, 3],
  );
  assert.deepEqual(ways[1].tags, {});
  assert.deepEqual(ways[1].geometry, []);
});

// --- mergeConnectedWays ---

function lonLat(points: OverpassWay["geometry"]): Point[] {
  return points.map((p) => [p.lon, p.lat]);
}

test("mergeConnectedWays joins two ways that share an endpoint into one continuous chain", () => {
  const a = way(1, "primary", [[0, 0], [1, 0], [2, 0]]);
  const b = way(2, "primary", [[2, 0], [3, 0], [4, 0]]);

  const chains = mergeConnectedWays([a, b]);

  assert.equal(chains.length, 1);
  assert.deepEqual(lonLat(chains[0]), [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
});

test("mergeConnectedWays reverses a way whose end (not start) matches the chain it's joining", () => {
  const a = way(1, "primary", [[0, 0], [1, 0], [2, 0]]);
  const bStoredBackwards = way(2, "primary", [[4, 0], [3, 0], [2, 0]]); // its end, [2,0], matches a's end

  const chains = mergeConnectedWays([a, bStoredBackwards]);

  assert.equal(chains.length, 1);
  assert.deepEqual(lonLat(chains[0]), [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
});

test("mergeConnectedWays does not merge through a real junction where three ways meet", () => {
  const a = way(1, "primary", [[0, 0], [1, 0]]);
  const b = way(2, "primary", [[1, 0], [2, 0]]);
  const c = way(3, "primary", [[1, 0], [1, 1]]); // branches off the same point

  const chains = mergeConnectedWays([a, b, c]);

  assert.equal(chains.length, 3, "a 3-way junction must not be treated as a simple pass-through");
});

test("mergeConnectedWays extends a chain backward, not just forward, when the seed way is in the middle", () => {
  const left = way(1, "primary", [[-2, 0], [-1, 0], [0, 0]]);
  const middle = way(2, "primary", [[0, 0], [1, 0]]);
  const right = way(3, "primary", [[1, 0], [2, 0], [3, 0]]);

  // #given the seed way (first in iteration order) is the middle segment,
  // so the merge must grow the chain in both directions to succeed
  const chains = mergeConnectedWays([middle, left, right]);

  assert.equal(chains.length, 1);
  assert.deepEqual(lonLat(chains[0]), [[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0]]);
});

test("mergeConnectedWays leaves an isolated way as its own single-way chain", () => {
  const isolated = way(1, "primary", [[5, 5], [6, 6]]);
  const chains = mergeConnectedWays([isolated]);

  assert.equal(chains.length, 1);
  assert.deepEqual(lonLat(chains[0]), [[5, 5], [6, 6]]);
});

test("mergeConnectedWays drops a degenerate way with fewer than two geometry points", () => {
  const degenerate = way(1, "primary", [[0, 0]]);
  assert.deepEqual(mergeConnectedWays([degenerate]), []);
});

// --- hashRouteGeometry ---

test("hashRouteGeometry is deterministic for the same geometry", () => {
  const geo = lineStringGeojson([
    [1, 2],
    [3, 4],
  ]);
  assert.equal(hashRouteGeometry(geo), hashRouteGeometry(geo));
});

test("hashRouteGeometry changes when a single coordinate is perturbed", () => {
  const original = lineStringGeojson([
    [1, 2],
    [3, 4],
  ]);
  const mutated = lineStringGeojson([
    [1, 2],
    [3, 4.0000001],
  ]);

  assert.notEqual(hashRouteGeometry(original), hashRouteGeometry(mutated));
});

test("hashRouteGeometry is stable on real route data across repeated reads", () => {
  const geo = JSON.parse(readFileSync(join(ROOT, "routes", "kumano-kodo", "route.geojson"), "utf-8"));
  assert.equal(hashRouteGeometry(geo), hashRouteGeometry(geo));
});

// --- isWellFormedXml ---

test("isWellFormedXml accepts a balanced document with self-closing and nested tags", () => {
  assert.equal(isWellFormedXml('<svg><metadata><foo bar="1"/></metadata><path d="M0,0"/></svg>'), true);
});

test("isWellFormedXml rejects an unclosed tag", () => {
  assert.equal(isWellFormedXml("<svg><path d=\"M0,0\">"), false);
});

test("isWellFormedXml rejects mismatched open/close tags", () => {
  assert.equal(isWellFormedXml("<svg><path></svg></path>"), false);
});

test("isWellFormedXml rejects empty or whitespace-only content", () => {
  assert.equal(isWellFormedXml(""), false);
  assert.equal(isWellFormedXml("   \n  "), false);
});

// --- fitToRouteBounds alignment with fitToBox ---

test("fitToRouteBounds reproduces fitToBox exactly when given the same points as both bounds and content", () => {
  // #given a route's own mercator-projected points, used both to derive
  // bounds (as roads.ts does) and as the segment being fitted
  const routeSegments: Point[][] = [
    [
      [135.5, 33.77],
      [135.55, 33.8],
      [135.49, 33.81],
    ],
  ];
  const projected = routeSegments.map((seg) => seg.map(([lon, lat]) => mercator(lon, lat)));

  // #when fitting through the frozen fitToBox (bounds derived from its own input)
  const viaFitToBox = fitToBox(projected, GLYPH_BOX);

  // #and fitting the same segment through fitToRouteBounds, with bounds
  // explicitly supplied from the same points
  const viaRouteBounds = fitToRouteBounds(projected.flat(), projected, GLYPH_BOX);

  // #then the two are identical — proving the duplicated bounds math is faithful
  assert.deepEqual(viaRouteBounds, viaFitToBox);
});

test("fitToRouteBounds lets a road segment extend past the route's own bbox rather than re-scaling to include it", () => {
  const routeBoundsPoints: Point[] = [
    [0, 0],
    [10, 10],
  ];
  // A road point far outside [0,10]x[0,10] should still map linearly through
  // the route's bounds/scale, landing outside the padded box — not silently
  // absorbed into a larger shared bbox.
  const roadSegments: Point[][] = [[[20, 20]]];

  const fitted = fitToRouteBounds(routeBoundsPoints, roadSegments, GLYPH_BOX);
  const [x, y] = fitted[0][0];

  assert.ok(
    x > GLYPH_BOX.size - GLYPH_BOX.padding || y < GLYPH_BOX.padding,
    "expected the far road point to fall outside the route's padded box",
  );
});

// --- roadsSvgFrom ---

const SYNTHETIC_ROUTE = lineStringGeojson([
  [135.5, 33.77],
  [135.51, 33.78],
]);

function syntheticCache(elements: unknown[], fetchedAt = "2026-08-01T12:00:00.000Z"): RoadsCacheFile {
  return { fetchedAt, routeId: "synthetic", query: "test-query", elements };
}

test("roadsSvgFrom returns null when the route has no geometry to align against", () => {
  const result = roadsSvgFrom({ type: "FeatureCollection", features: [] }, syntheticCache([]));
  assert.equal(result, null);
});

test("roadsSvgFrom renders a well-formed, deterministic SVG carrying stroke/fill, geometry hash, extract date, and ODbL attribution", () => {
  const cache = syntheticCache([
    { type: "way", id: 1, tags: { highway: "primary" }, geometry: [{ lat: 33.773, lon: 135.503 }, { lat: 33.775, lon: 135.505 }] },
  ]);

  const first = roadsSvgFrom(SYNTHETIC_ROUTE, cache);
  const second = roadsSvgFrom(SYNTHETIC_ROUTE, cache);

  assert.ok(first);
  assert.equal(first!.svg, second!.svg, "rendering twice from the same cache must be byte-identical");
  assert.equal(isWellFormedXml(first!.svg), true);
  assert.match(first!.svg, /stroke="currentColor"/);
  assert.match(first!.svg, /fill="none"/);
  assert.match(first!.svg, new RegExp(`geometry-hash="${hashRouteGeometry(SYNTHETIC_ROUTE)}"`));
  assert.match(first!.svg, /extract-date="2026-08-01"/);
  assert.match(first!.svg, /ODbL/);
  assert.equal(first!.waysFetched, 1);
  assert.equal(first!.waysKept, 1);
});

test("roadsSvgFrom drops ways outside the corridor and ways outside the allowed highway set", () => {
  const cache = syntheticCache([
    { type: "way", id: 1, tags: { highway: "primary" }, geometry: [{ lat: 33.773, lon: 135.503 }] },
    { type: "way", id: 2, tags: { highway: "primary" }, geometry: [{ lat: 40, lon: 140 }] }, // far away
    { type: "way", id: 3, tags: { highway: "footway" }, geometry: [{ lat: 33.773, lon: 135.503 }] }, // wrong highway
  ]);

  const result = roadsSvgFrom(SYNTHETIC_ROUTE, cache);
  assert.ok(result);
  assert.equal(result!.waysFetched, 3);
  assert.equal(result!.waysKept, 1);
});

test("roadsSvgFrom sorts ways before rendering, so cache element order never affects output bytes", () => {
  const elements = [
    { type: "way", id: 5, tags: { highway: "primary" }, geometry: [{ lat: 33.773, lon: 135.503 }, { lat: 33.774, lon: 135.504 }] },
    { type: "way", id: 2, tags: { highway: "secondary" }, geometry: [{ lat: 33.775, lon: 135.505 }, { lat: 33.776, lon: 135.506 }] },
  ];

  const inOrder = roadsSvgFrom(SYNTHETIC_ROUTE, syntheticCache(elements));
  const reversed = roadsSvgFrom(SYNTHETIC_ROUTE, syntheticCache([...elements].reverse()));

  assert.equal(inOrder!.svg, reversed!.svg);
});

// --- readRoadsCache ---

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "roads-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("readRoadsCache returns null when the cache file does not exist", () => {
  withTempDir((root) => {
    assert.equal(readRoadsCache(root, "missing-route"), null);
  });
});

test("readRoadsCache returns null when the cache file is not valid JSON", () => {
  withTempDir((root) => {
    mkdirSync(join(root, ".cache", "roads"), { recursive: true });
    writeFileSync(cachePathFor(root, "broken"), "{ not json");
    assert.equal(readRoadsCache(root, "broken"), null);
  });
});

test("readRoadsCache parses a well-formed cache file written at cachePathFor's own path", () => {
  withTempDir((root) => {
    mkdirSync(join(root, ".cache", "roads"), { recursive: true });
    const cache: RoadsCacheFile = { fetchedAt: "2026-08-01T00:00:00.000Z", routeId: "r", query: "q", elements: [] };
    writeFileSync(cachePathFor(root, "r"), JSON.stringify(cache));

    assert.deepEqual(readRoadsCache(root, "r"), cache);
  });
});

// --- buildRoads: the network-boundary contract ---

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "build-roads-test-"));
  const routeDir = join(root, "routes", "test-route");
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(join(routeDir, "metadata.json"), JSON.stringify({}));
  writeFileSync(join(routeDir, "route.geojson"), JSON.stringify(SYNTHETIC_ROUTE));
  return root;
}

test("buildRoads skips a route with no cache, reports why, and writes no file at all (never an empty one)", () => {
  const root = fixtureRoot();
  try {
    const results = buildRoads(root);
    const result = results.find((r) => r.id === "test-route");

    assert.ok(result);
    assert.equal(result!.status, "skipped");
    assert.match((result as { reason: string }).reason, /fetch-roads/);
    assert.equal(existsSync(join(root, "docs", "assets", "roads", "test-route.svg")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("buildRoads writes a roads SVG from cache alone, with no network access involved", () => {
  const root = fixtureRoot();
  try {
    mkdirSync(join(root, ".cache", "roads"), { recursive: true });
    const cache: RoadsCacheFile = {
      fetchedAt: "2026-08-01T00:00:00.000Z",
      routeId: "test-route",
      query: "q",
      elements: [
        { type: "way", id: 1, tags: { highway: "primary" }, geometry: [{ lat: 33.773, lon: 135.503 }] },
      ],
    };
    writeFileSync(cachePathFor(root, "test-route"), JSON.stringify(cache));

    const results = buildRoads(root);
    const result = results.find((r) => r.id === "test-route");

    assert.ok(result);
    assert.equal(result!.status, "written");
    const svgPath = join(root, "docs", "assets", "roads", "test-route.svg");
    assert.equal(existsSync(svgPath), true);
    assert.equal(isWellFormedXml(readFileSync(svgPath, "utf-8")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("buildRoads is idempotent — running it twice against the same cache produces byte-identical output", () => {
  const root = fixtureRoot();
  try {
    mkdirSync(join(root, ".cache", "roads"), { recursive: true });
    const cache: RoadsCacheFile = {
      fetchedAt: "2026-08-01T00:00:00.000Z",
      routeId: "test-route",
      query: "q",
      elements: [{ type: "way", id: 1, tags: { highway: "primary" }, geometry: [{ lat: 33.773, lon: 135.503 }] }],
    };
    writeFileSync(cachePathFor(root, "test-route"), JSON.stringify(cache));

    buildRoads(root);
    const svgPath = join(root, "docs", "assets", "roads", "test-route.svg");
    const first = readFileSync(svgPath, "utf-8");
    buildRoads(root);
    const second = readFileSync(svgPath, "utf-8");

    assert.equal(first, second);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
