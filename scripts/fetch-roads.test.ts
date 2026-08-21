import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Point } from "./site/project.js";
import {
  classifyOverpassBody,
  describeRateLimitError,
  fetchOverpass,
  fetchRoute,
  runFetchRoads,
} from "./fetch-roads.js";

// This suite never touches the network: every test injects a fake `fetch`
// (and, where pacing matters, a fake `sleep`) via fetch-roads.ts's
// FetchRoadsRuntime. See fetchRoute/runFetchRoads's own doc comments for why
// that shape exists.

function lineStringGeojson(coordinates: Point[]): unknown {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "LineString", coordinates } }],
  };
}

/** A minimal two-point route — enough for segmentsOf/decimateRoutePoints/chunkTrace to produce exactly one chunk. */
const SIMPLE_ROUTE_GEOJSON = lineStringGeojson([
  [135.5, 33.77],
  [135.52, 33.78],
]);

interface RouteFixture {
  root: string;
  dir: string;
}

/**
 * A temp `root` (for `.cache/roads/`) plus a temp route directory holding a
 * minimal `route.geojson` — isolated from this project's real `.cache/`, so
 * a test can never read a real cached route (every real route already has
 * one committed locally — see fetch-roads.ts's own module-level ROOT) or
 * leave stray files behind in it.
 */
function routeFixture(id: string, geo: unknown = SIMPLE_ROUTE_GEOJSON): RouteFixture {
  const root = mkdtempSync(join(tmpdir(), "fetch-roads-test-"));
  const dir = join(root, "routes", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "route.geojson"), JSON.stringify(geo));
  return { root, dir };
}

function fakeFetchJson(status: number, body: unknown, headers: Record<string, string> = {}): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers })) as unknown as typeof fetch;
}

function countingFetch(impl: typeof fetch): { fetchImpl: typeof fetch; callCount: () => number } {
  let calls = 0;
  const fetchImpl = (async (...args: Parameters<typeof fetch>) => {
    calls++;
    return impl(...args);
  }) as unknown as typeof fetch;
  return { fetchImpl, callCount: () => calls };
}

// --- classifyOverpassBody ---

test("classifyOverpassBody treats a 200 body carrying a remark as a failure, not success", () => {
  const outcome = classifyOverpassBody({ elements: [{ type: "way", id: 1 }], remark: "runtime error: Query timed out" });
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && outcome.reason.includes("runtime error: Query timed out"));
});

test("classifyOverpassBody treats an empty elements array with no remark as success (current behaviour: zero ways, not a failure)", () => {
  const outcome = classifyOverpassBody({ elements: [] });
  assert.deepEqual(outcome, { ok: true, elements: [] });
});

test("classifyOverpassBody treats a populated elements array as success", () => {
  const elements = [{ type: "way", id: 1 }];
  const outcome = classifyOverpassBody({ elements });
  assert.deepEqual(outcome, { ok: true, elements });
});

test("classifyOverpassBody treats a missing elements field as success with zero elements", () => {
  const outcome = classifyOverpassBody({});
  assert.deepEqual(outcome, { ok: true, elements: [] });
});

test("classifyOverpassBody rejects a body that isn't an object at all", () => {
  const outcome = classifyOverpassBody("not an object");
  assert.equal(outcome.ok, false);
});

// --- describeRateLimitError ---

test("describeRateLimitError includes the suggested wait when Retry-After is present", () => {
  const message = describeRateLimitError("Too Many Requests", "30");
  assert.match(message, /429/);
  assert.match(message, /suggested wait: 30s/);
});

test("describeRateLimitError still reports the 429, without a wait suggestion, when Retry-After is absent", () => {
  const message = describeRateLimitError("Too Many Requests", null);
  assert.match(message, /429/);
  assert.ok(!message.includes("suggested wait"));
});

// --- fetchOverpass ---

test("fetchOverpass rejects with the Retry-After-aware message on a 429", async () => {
  const fetchImpl = fakeFetchJson(429, {}, { "retry-after": "20" });
  await assert.rejects(fetchOverpass("query", fetchImpl), /429.*suggested wait: 20s/);
});

test("fetchOverpass rejects on a 200 response whose body carries a remark", async () => {
  const fetchImpl = fakeFetchJson(200, { elements: [], remark: "runtime error: Query timed out" });
  await assert.rejects(fetchOverpass("query", fetchImpl), /Overpass API reported: runtime error/);
});

test("fetchOverpass resolves with elements on an ordinary 200 response", async () => {
  const elements = [{ type: "way", id: 42 }];
  const fetchImpl = fakeFetchJson(200, { elements });
  assert.deepEqual(await fetchOverpass("query", fetchImpl), elements);
});

test("fetchOverpass passes a client-side AbortSignal on every request", async () => {
  let capturedSignal: AbortSignal | undefined;
  const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    capturedSignal = init?.signal ?? undefined;
    return new Response(JSON.stringify({ elements: [] }), { status: 200 });
  }) as unknown as typeof fetch;

  await fetchOverpass("query", fetchImpl);

  assert.ok(capturedSignal instanceof AbortSignal);
});

// --- fetchRoute: no retry loop ---

test("fetchRoute does not retry a failed request — exactly one fetch call, then it stops that route", async () => {
  const { root, dir } = routeFixture("camino-frances");
  const { fetchImpl, callCount } = countingFetch(fakeFetchJson(504, {}));

  try {
    const outcome = await fetchRoute("camino-frances", dir, {
      root,
      fetchImpl,
      sleepImpl: async () => {},
    });

    assert.equal(callCount(), 1);
    assert.equal(outcome.status, "incomplete");
    assert.equal(outcome.networkCallAttempted, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- runFetchRoads: pacing after a first-request failure ---

test("runFetchRoads paces the next route even when the previous route's very first request failed (not only after a success)", async () => {
  const a = routeFixture("route-a");
  const b = routeFixture("route-b");
  const sleeps: number[] = [];

  let call = 0;
  const fetchImpl = (async () => {
    call++;
    // route-a's only request fails outright; route-b's succeeds.
    return call === 1
      ? new Response(JSON.stringify({}), { status: 504 })
      : new Response(JSON.stringify({ elements: [] }), { status: 200 });
  }) as unknown as typeof fetch;

  try {
    await runFetchRoads(
      [
        { key: "route-a", dir: a.dir },
        { key: "route-b", dir: b.dir },
      ],
      {
        root: a.root, // shared cache root; route-a and route-b are distinct ids so no collision
        fetchImpl,
        sleepImpl: async (ms: number) => {
          sleeps.push(ms);
        },
      },
    );

    // #then a pacing delay fired between route-a (0 successes, 1 failed attempt) and route-b,
    // proving the gate is "a request went out", not "a request succeeded"
    assert.equal(sleeps.length, 1);
  } finally {
    rmSync(a.root, { recursive: true, force: true });
    if (b.root !== a.root) rmSync(b.root, { recursive: true, force: true });
  }
});

test("runFetchRoads does not pace after the last route, even on failure", async () => {
  const a = routeFixture("route-a");
  const sleeps: number[] = [];
  const fetchImpl = fakeFetchJson(504, {});

  try {
    await runFetchRoads([{ key: "route-a", dir: a.dir }], {
      root: a.root,
      fetchImpl,
      sleepImpl: async (ms: number) => {
        sleeps.push(ms);
      },
    });

    assert.equal(sleeps.length, 0);
  } finally {
    rmSync(a.root, { recursive: true, force: true });
  }
});

// --- fetchRoute: empty geometry / no route.geojson ---

test("fetchRoute reports no-geometry, with no network call, when route.geojson is missing", async () => {
  const root = mkdtempSync(join(tmpdir(), "fetch-roads-test-"));
  const dir = join(root, "routes", "no-geometry-route");
  mkdirSync(dir, { recursive: true });
  const { fetchImpl, callCount } = countingFetch(fakeFetchJson(200, { elements: [] }));

  try {
    const outcome = await fetchRoute("no-geometry-route", dir, { root, fetchImpl });

    assert.deepEqual(outcome, { status: "no-geometry", networkCallAttempted: false });
    assert.equal(callCount(), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fetchRoute completes successfully with zero ways when Overpass returns an empty elements array (current behaviour)", async () => {
  const { root, dir } = routeFixture("camino-frances");
  const fetchImpl = fakeFetchJson(200, { elements: [] });

  try {
    const outcome = await fetchRoute("camino-frances", dir, { root, fetchImpl, sleepImpl: async () => {} });

    assert.equal(outcome.status, "complete");
    assert.ok(outcome.status === "complete" && outcome.waysFetched === 0);
    assert.ok(existsSync(join(root, ".cache", "roads", "camino-frances.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
