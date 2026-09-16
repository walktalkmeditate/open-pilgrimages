import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Position } from "./ways/types.js";
import {
  CLIENT_TIMEOUT_MS,
  DATASET,
  MAX_LOCATIONS_PER_REQUEST,
  REQUEST_DELAY_MS,
  cachePathFor,
  chunkCacheDir,
  chunkCachePathFor,
  chunkVertices,
  classifyElevationBody,
  describeRateLimitError,
  fetchElevations,
  fetchRouteElevation,
  hashVertices,
  locationsParam,
  readElevationCache,
  runFetchElevation,
} from "./fetch-elevation.js";

// This suite never touches the network: every test injects a fake `fetch`
// (and, where pacing matters, a fake `sleep`) via FetchElevationRuntime, and
// writes into a mkdtemp root so it can never read or overwrite this project's
// real .cache/elevation/. See fetchRouteElevation's own doc comment.

function lineStringGeojson(coordinates: Position[]): unknown {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "LineString", coordinates } }],
  };
}

/** A climbing line of `count` vertices, each ~90 m further east and 3 m higher. */
function risingLine(count: number): Position[] {
  return Array.from({ length: count }, (_, i) => [135.5 + i / 1000, 33.77] as Position);
}

function elevationOf([lon]: Position): number {
  return Math.round((lon - 135.5) * 3000);
}

interface RouteFixture {
  root: string;
  dir: string;
}

function routeFixture(id: string, line: Position[] = risingLine(3)): RouteFixture {
  const root = mkdtempSync(join(tmpdir(), "fetch-elevation-test-"));
  const dir = join(root, "routes", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "route.main.geojson"), JSON.stringify(lineStringGeojson(line)));
  return { root, dir };
}

/**
 * Answers exactly what was asked, in the order it was asked, by parsing the
 * request URL — so the lat/lon order this script sends is the lat/lon order
 * every assertion below is measured against, rather than a fake that happens
 * to agree with whichever order the code used.
 */
function requestedLocations(url: string): Array<{ lat: number; lng: number }> {
  const param = new URL(url).searchParams.get("locations") ?? "";
  return param.split("|").map((pair) => {
    const [lat, lng] = pair.split(",").map(Number);
    return { lat, lng };
  });
}

function echoingFetch(elevation: (lat: number, lng: number) => number | null = (_, lng) =>
  elevationOf([lng, 0] as Position)): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const results = requestedLocations(String(url)).map((location) => ({
      dataset: DATASET,
      elevation: elevation(location.lat, location.lng),
      location,
    }));
    return new Response(JSON.stringify({ status: "OK", results }), { status: 200 });
  }) as unknown as typeof fetch;
}

function countingFetch(impl: typeof fetch): { fetchImpl: typeof fetch; callCount: () => number } {
  let calls = 0;
  const fetchImpl = (async (...args: Parameters<typeof fetch>) => {
    calls++;
    return impl(...args);
  }) as unknown as typeof fetch;
  return { fetchImpl, callCount: () => calls };
}

// --- locationsParam ---

test("locationsParam sends lat,lon — OpenTopoData's order, not GeoJSON's", () => {
  assert.equal(locationsParam([[135.582004, 34.212105]]), "34.212105,135.582004");
});

test("locationsParam joins several locations with a pipe, in line order", () => {
  assert.equal(
    locationsParam([
      [135.5, 33.7],
      [135.6, 33.8],
    ]),
    "33.7,135.5|33.8,135.6",
  );
});

// --- chunkVertices ---

test("chunkVertices splits a line into consecutive runs that concatenate back into it", () => {
  const line = risingLine(250);
  const chunks = chunkVertices(line);

  assert.equal(chunks.length, 3);
  assert.deepEqual(
    chunks.map((c) => c.length),
    [100, 100, 50],
  );
  assert.deepEqual(chunks.flat(), line);
});

test("chunkVertices never sends more than OpenTopoData's documented 100 locations per request", () => {
  for (const chunk of chunkVertices(risingLine(1000))) {
    assert.ok(chunk.length <= MAX_LOCATIONS_PER_REQUEST);
  }
});

test("a line that fits in one request comes back as one chunk", () => {
  assert.deepEqual(chunkVertices(risingLine(4)), [risingLine(4)]);
});

// --- classifyElevationBody ---

const ASKED: Position[] = [
  [135.5, 33.77],
  [135.6, 33.88],
];

function okBody(elevations: Array<number | null>, overrides: Array<Record<string, unknown>> = []): unknown {
  return {
    status: "OK",
    results: elevations.map((elevation, i) => ({
      dataset: DATASET,
      elevation,
      location: { lat: ASKED[i][1], lng: ASKED[i][0] },
      ...overrides[i],
    })),
  };
}

test("classifyElevationBody returns one reading per location, in order", () => {
  assert.deepEqual(classifyElevationBody(okBody([700, 80]), ASKED), { ok: true, elevations: [700, 80] });
});

test("classifyElevationBody keeps a void as null rather than inventing a height for it", () => {
  assert.deepEqual(classifyElevationBody(okBody([700, null]), ASKED), { ok: true, elevations: [700, null] });
});

test("classifyElevationBody reports the server's own explanation when the status is not OK", () => {
  const outcome = classifyElevationBody(
    { status: "INVALID_REQUEST", error: "Unable to parse location '999,999'" },
    ASKED,
  );
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && outcome.reason.includes("Unable to parse location"));
});

test("classifyElevationBody refuses a short results array, which would shift every later reading onto the wrong vertex", () => {
  const outcome = classifyElevationBody({ status: "OK", results: [{ elevation: 700 }] }, ASKED);
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && outcome.reason.includes("answered 1 of 2 locations"));
});

test("classifyElevationBody refuses a reading that came from a different dataset", () => {
  const outcome = classifyElevationBody(okBody([700, 80], [{}, { dataset: "aster30m" }]), ASKED);
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && outcome.reason.includes("aster30m"));
});

test("classifyElevationBody catches a transposed lat/lon by checking the location the server echoes back", () => {
  const transposed = okBody([700, 80], [{ location: { lat: ASKED[0][0], lng: ASKED[0][1] } }]);
  const outcome = classifyElevationBody(transposed, ASKED);
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok && outcome.reason.includes("echoed"));
});

test("classifyElevationBody rejects a body that isn't an object at all", () => {
  assert.equal(classifyElevationBody("not an object", ASKED).ok, false);
});

// --- describeRateLimitError ---

test("describeRateLimitError includes the suggested wait when Retry-After is present", () => {
  const message = describeRateLimitError("Too Many Requests", "60");
  assert.match(message, /429/);
  assert.match(message, /suggested wait: 60s/);
});

test("describeRateLimitError still reports the 429 without a wait suggestion when Retry-After is absent", () => {
  const message = describeRateLimitError("Too Many Requests", null);
  assert.match(message, /429/);
  assert.ok(!message.includes("suggested wait"));
});

// --- fetchElevations ---

test("fetchElevations asks for the locations it was given, lat first", async () => {
  let asked: string | undefined;
  const fetchImpl = (async (url: RequestInfo | URL) => {
    asked = String(url);
    return new Response(JSON.stringify(okBody([700, 80])), { status: 200 });
  }) as unknown as typeof fetch;

  await fetchElevations(ASKED, fetchImpl);

  assert.equal(new URL(asked!).searchParams.get("locations"), "33.77,135.5|33.88,135.6");
});

test("fetchElevations rejects with the Retry-After-aware message on a 429", async () => {
  const fetchImpl = (async () =>
    new Response("{}", { status: 429, headers: { "retry-after": "60" } })) as unknown as typeof fetch;

  await assert.rejects(fetchElevations(ASKED, fetchImpl), /429.*suggested wait: 60s/);
});

test("fetchElevations surfaces a 400's own message alongside the status line", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ status: "INVALID_REQUEST", error: "Latitude must be between -90 and 90" }), {
      status: 400,
    })) as unknown as typeof fetch;

  await assert.rejects(fetchElevations(ASKED, fetchImpl), /400.*Latitude must be between -90 and 90/);
});

test("fetchElevations falls back to the status line when a failure carries no explanation", async () => {
  const fetchImpl = (async () =>
    new Response("<html>gateway</html>", { status: 502, statusText: "Bad Gateway" })) as unknown as typeof fetch;

  await assert.rejects(fetchElevations(ASKED, fetchImpl), /OpenTopoData returned 502: Bad Gateway/);
});

test("fetchElevations calls AbortSignal.timeout with the real client timeout, and passes its actual signal to fetch", async (t) => {
  const timeoutSpy = t.mock.method(AbortSignal, "timeout");
  let capturedSignal: AbortSignal | undefined;
  const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    capturedSignal = init?.signal ?? undefined;
    return new Response(JSON.stringify(okBody([700, 80])), { status: 200 });
  }) as unknown as typeof fetch;

  await fetchElevations(ASKED, fetchImpl);

  assert.equal(timeoutSpy.mock.calls.length, 1);
  assert.deepEqual(timeoutSpy.mock.calls[0].arguments, [CLIENT_TIMEOUT_MS]);
  assert.equal(capturedSignal, timeoutSpy.mock.calls[0].result);
});

// --- fetchRouteElevation ---

test("fetchRouteElevation reports no-geometry, with no network call, when the route has no line", async () => {
  const root = mkdtempSync(join(tmpdir(), "fetch-elevation-test-"));
  const dir = join(root, "routes", "no-geometry-route");
  mkdirSync(dir, { recursive: true });
  const { fetchImpl, callCount } = countingFetch(echoingFetch());

  try {
    const outcome = await fetchRouteElevation("no-geometry-route", dir, { root, fetchImpl });

    assert.deepEqual(outcome, { status: "no-geometry", networkCallAttempted: false, requestsMade: 0 });
    assert.equal(callCount(), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a completed route caches one reading per vertex, in line order, and clears its chunk scratch", async () => {
  const line = risingLine(250);
  const { root, dir } = routeFixture("rising-route", line);

  try {
    const outcome = await fetchRouteElevation("rising-route", dir, {
      root,
      fetchImpl: echoingFetch(),
      sleepImpl: async () => {},
    });

    assert.equal(outcome.status, "complete");
    assert.ok(outcome.status === "complete" && outcome.totalChunks === 3 && outcome.vertexCount === 250);

    const cache = readElevationCache(root, "rising-route");
    assert.ok(cache);
    assert.equal(cache.source, "route.main.geojson");
    assert.equal(cache.lineHash, hashVertices(line));
    assert.deepEqual(cache.elevations, line.map(elevationOf));
    assert.equal(existsSync(chunkCacheDir(root, "rising-route")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a void the model could not fill is cached as null and counted, not dropped", async () => {
  const { root, dir } = routeFixture("void-route", risingLine(3));

  try {
    const outcome = await fetchRouteElevation("void-route", dir, {
      root,
      fetchImpl: echoingFetch((_, lng) => (lng > 135.5005 ? null : 0)),
      sleepImpl: async () => {},
    });

    assert.ok(outcome.status === "complete" && outcome.voids === 2);
    assert.deepEqual(readElevationCache(root, "void-route")?.elevations, [0, null, null]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fetchRouteElevation does not retry a failed request — one call, then it stops that route", async () => {
  const { root, dir } = routeFixture("failing-route", risingLine(250));
  const { fetchImpl, callCount } = countingFetch((async () =>
    new Response("{}", { status: 500 })) as unknown as typeof fetch);

  try {
    const outcome = await fetchRouteElevation("failing-route", dir, {
      root,
      fetchImpl,
      sleepImpl: async () => {},
    });

    assert.equal(callCount(), 1);
    assert.equal(outcome.status, "incomplete");
    assert.ok(outcome.status === "incomplete" && outcome.missingIndices.length === 3);
    assert.equal(existsSync(cachePathFor(root, "failing-route")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a rerun resumes from the chunks already on disk instead of re-spending them", async () => {
  const { root, dir } = routeFixture("resuming-route", risingLine(250));
  let calls = 0;
  // The first two chunks succeed, the third fails — then the same route is run
  // again with a fetch that works.
  const failingThird = (async (url: RequestInfo | URL) => {
    calls++;
    return calls === 3 ? new Response("{}", { status: 500 }) : echoingFetch()(url);
  }) as unknown as typeof fetch;

  try {
    const first = await fetchRouteElevation("resuming-route", dir, {
      root,
      fetchImpl: failingThird,
      sleepImpl: async () => {},
    });
    assert.ok(first.status === "incomplete" && first.fetchedThisRun === 2);
    assert.deepEqual(first.status === "incomplete" ? first.missingIndices : [], [2]);
    assert.ok(existsSync(chunkCachePathFor(root, "resuming-route", 0)));

    const { fetchImpl, callCount } = countingFetch(echoingFetch());
    const second = await fetchRouteElevation("resuming-route", dir, {
      root,
      fetchImpl,
      sleepImpl: async () => {},
    });

    // #then only the one missing chunk cost a request; the two already on disk did not
    assert.equal(callCount(), 1);
    assert.ok(second.status === "complete" && second.fetchedThisRun === 1 && second.reusedThisRun === 2);
    assert.deepEqual(readElevationCache(root, "resuming-route")?.elevations, risingLine(250).map(elevationOf));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a route whose merged cache was taken at today's vertices costs nothing to re-run", async () => {
  const { root, dir } = routeFixture("cached-route", risingLine(120));

  try {
    await fetchRouteElevation("cached-route", dir, { root, fetchImpl: echoingFetch(), sleepImpl: async () => {} });

    const { fetchImpl, callCount } = countingFetch(echoingFetch());
    const outcome = await fetchRouteElevation("cached-route", dir, { root, fetchImpl, sleepImpl: async () => {} });

    assert.equal(callCount(), 0);
    assert.ok(outcome.status === "already-cached" && outcome.vertexCount === 120);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a merged cache taken at an older line is re-sampled, not published as this line's ascent", async () => {
  const { root, dir } = routeFixture("rebuilt-route", risingLine(120));

  try {
    await fetchRouteElevation("rebuilt-route", dir, { root, fetchImpl: echoingFetch(), sleepImpl: async () => {} });

    // #given the walked line is rebuilt under the cache that describes it
    const rebuilt = risingLine(140);
    writeFileSync(join(dir, "route.main.geojson"), JSON.stringify(lineStringGeojson(rebuilt)));

    const { fetchImpl, callCount } = countingFetch(echoingFetch());
    const outcome = await fetchRouteElevation("rebuilt-route", dir, { root, fetchImpl, sleepImpl: async () => {} });

    assert.ok(callCount() > 0);
    assert.ok(outcome.status === "complete" && outcome.vertexCount === 140);
    assert.equal(readElevationCache(root, "rebuilt-route")?.lineHash, hashVertices(rebuilt));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fetchRouteElevation paces its requests at the documented one per second", async () => {
  const { root, dir } = routeFixture("paced-route", risingLine(250));
  const sleeps: number[] = [];

  try {
    await fetchRouteElevation("paced-route", dir, {
      root,
      fetchImpl: echoingFetch(),
      sleepImpl: async (ms: number) => {
        sleeps.push(ms);
      },
    });

    // #then two delays for three requests — before the second and the third, never before the first
    assert.deepEqual(sleeps, [REQUEST_DELAY_MS, REQUEST_DELAY_MS]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a spent request budget stops the run and leaves what it fetched cached for the next one", async () => {
  const { root, dir } = routeFixture("budgeted-route", risingLine(250));
  const { fetchImpl, callCount } = countingFetch(echoingFetch());

  try {
    const outcome = await fetchRouteElevation("budgeted-route", dir, {
      root,
      fetchImpl,
      sleepImpl: async () => {},
      requestBudget: 2,
    });

    assert.equal(callCount(), 2);
    assert.ok(outcome.status === "incomplete" && outcome.budgetExhausted);
    assert.deepEqual(outcome.status === "incomplete" ? outcome.missingIndices : [], [2]);
    assert.ok(existsSync(chunkCachePathFor(root, "budgeted-route", 1)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- runFetchElevation ---

test("runFetchElevation paces the next route even when the previous route's very first request failed", async () => {
  const a = routeFixture("route-a");
  const b = routeFixture("route-b");
  const sleeps: number[] = [];

  let call = 0;
  const fetchImpl = (async (url: RequestInfo | URL) => {
    call++;
    return call === 1 ? new Response("{}", { status: 500 }) : echoingFetch()(url);
  }) as unknown as typeof fetch;

  try {
    await runFetchElevation(
      [
        { key: "route-a", dir: a.dir },
        { key: "route-b", dir: b.dir },
      ],
      {
        root: a.root,
        fetchImpl,
        sleepImpl: async (ms: number) => {
          sleeps.push(ms);
        },
      },
    );

    assert.deepEqual(sleeps, [REQUEST_DELAY_MS]);
  } finally {
    rmSync(a.root, { recursive: true, force: true });
    rmSync(b.root, { recursive: true, force: true });
  }
});

test("runFetchElevation does not pace after the last route, even on failure", async () => {
  const a = routeFixture("route-a");
  const sleeps: number[] = [];
  const fetchImpl = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;

  try {
    await runFetchElevation([{ key: "route-a", dir: a.dir }], {
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

test("the request budget is spent across routes, not handed out fresh to each one", async () => {
  const a = routeFixture("route-a", risingLine(250));
  const b = routeFixture("route-b", risingLine(250));
  const { fetchImpl, callCount } = countingFetch(echoingFetch());

  try {
    await runFetchElevation(
      [
        { key: "route-a", dir: a.dir },
        { key: "route-b", dir: b.dir },
      ],
      { root: a.root, fetchImpl, sleepImpl: async () => {}, requestBudget: 3 },
    );

    // #then route-a spent the whole budget on its three chunks and route-b was never reached
    assert.equal(callCount(), 3);
    assert.ok(readElevationCache(a.root, "route-a"));
    assert.equal(readElevationCache(a.root, "route-b"), null);
  } finally {
    rmSync(a.root, { recursive: true, force: true });
    rmSync(b.root, { recursive: true, force: true });
  }
});
