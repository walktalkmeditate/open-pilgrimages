import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWayGraph, nearestGraphNode, shortestPath, mainLine } from "./build-main-line.js";
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
