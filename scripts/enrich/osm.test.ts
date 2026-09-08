import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  CLIENT_TIMEOUT_MS, queryOverpass, buildPoiQuery, classifyNode, extractName, resolveName,
} from "./osm.js";

// This suite never touches the network: every test injects a fake `fetch` and
// a temp cache directory through queryOverpass's OverpassRuntime, so nothing
// here can reach Overpass or read, write, or evict the project's real
// .cache/enrich/. It mirrors fetch-roads.test.ts, which pins the same three
// rules — a client-side timeout, a Retry-After-aware 429, and a `remark` on a
// 200 treated as a hard failure — for the other script that calls this API.

function cacheDir(): string {
  return mkdtempSync(join(tmpdir(), "enrich-osm-test-"));
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

test("queryOverpass returns the body and caches it on an ordinary 200", async () => {
  const dir = cacheDir();
  try {
    const body = { elements: [{ type: "relation", id: 7 }] };
    const data = await queryOverpass("query", "geom-fixture", {
      cacheDir: dir,
      fetchImpl: fakeFetchJson(200, body),
    });

    assert.deepEqual(data, body);
    assert.ok(existsSync(join(dir, "geom-fixture.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a fresh cache entry is served without a network call at all", async () => {
  const dir = cacheDir();
  try {
    const cached = { elements: [{ type: "relation", id: 1 }] };
    writeFileSync(
      join(dir, "geom-fixture.json"),
      JSON.stringify({ fetchedAt: new Date().toISOString(), data: cached }),
    );
    const { fetchImpl, callCount } = countingFetch(fakeFetchJson(200, { elements: [] }));

    const data = await queryOverpass("query", "geom-fixture", { cacheDir: dir, fetchImpl });

    assert.deepEqual(data, cached);
    assert.equal(callCount(), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("queryOverpass rejects with the Retry-After-aware message on a 429", async () => {
  const dir = cacheDir();
  try {
    await assert.rejects(
      queryOverpass("query", "geom-fixture", {
        cacheDir: dir,
        fetchImpl: fakeFetchJson(429, {}, { "retry-after": "20" }),
      }),
      /Overpass API 429.*suggested wait: 20s/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a 429 with no Retry-After still names the status, without inventing a wait", async () => {
  const dir = cacheDir();
  try {
    await assert.rejects(
      queryOverpass("query", "geom-fixture", { cacheDir: dir, fetchImpl: fakeFetchJson(429, {}) }),
      (error: Error) => /Overpass API 429/.test(error.message) && !/suggested wait/.test(error.message),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a non-429 failure still reports its own status", async () => {
  const dir = cacheDir();
  try {
    await assert.rejects(
      queryOverpass("query", "geom-fixture", { cacheDir: dir, fetchImpl: fakeFetchJson(504, {}) }),
      /Overpass API 504/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a 200 body carrying a remark is neither returned nor cached", async () => {
  const dir = cacheDir();
  try {
    // The exact shape that silently overwrote known-good caches during
    // development: HTTP 200, a truncated elements array, and the only sign of
    // trouble in a `remark` field.
    const fetchImpl = fakeFetchJson(200, {
      elements: [{ type: "relation", id: 1 }],
      remark: "runtime error: Query timed out in 'recurse' at line 3",
    });

    await assert.rejects(
      queryOverpass("query", "geom-fixture", { cacheDir: dir, fetchImpl }),
      /Overpass API reported: runtime error: Query timed out/,
    );

    assert.deepEqual(readdirSync(dir), [], "a partial answer must not poison the seven-day cache");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an empty elements array with no remark is a legitimate answer, not a failure", async () => {
  const dir = cacheDir();
  try {
    const data = await queryOverpass("query", "pois-fixture", {
      cacheDir: dir,
      fetchImpl: fakeFetchJson(200, { elements: [] }),
    });

    assert.deepEqual(data, { elements: [] });
    assert.ok(existsSync(join(dir, "pois-fixture.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("queryOverpass bounds the socket with AbortSignal.timeout, and hands fetch that very signal", async (t) => {
  const dir = cacheDir();
  try {
    // A spy on the real factory, so this fails if the client-side timeout is
    // ever replaced with a bare AbortController signal that would never fire.
    const timeoutSpy = t.mock.method(AbortSignal, "timeout");
    let capturedSignal: AbortSignal | undefined;
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Response(JSON.stringify({ elements: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    await queryOverpass("query", "geom-fixture", { cacheDir: dir, fetchImpl });

    assert.equal(timeoutSpy.mock.calls.length, 1);
    assert.deepEqual(timeoutSpy.mock.calls[0].arguments, [CLIENT_TIMEOUT_MS]);
    assert.equal(capturedSignal, timeoutSpy.mock.calls[0].result);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the POI query asks for the places a walk is remembered by", () => {
  const q = buildPoiQuery([-2, 43, -1, 44]);
  // #then every moment type has at least one tag that can produce it
  assert.match(q, /amenity"="place_of_worship/);
  assert.match(q, /historic"="monastery/);
  assert.match(q, /tourism"="viewpoint/);
  assert.match(q, /place"~"\^\(city\|town\|village\)\$/);
});

test("the query does not ask for hamlets, and nothing maps them if one arrives anyway", () => {
  // #given the settlement regex
  const pattern = buildPoiQuery([-2, 43, -1, 44]).match(/node\["place"~"([^"]+)"\]/)?.[1];
  // #then a hamlet is neither asked for
  assert.doesNotMatch("hamlet", new RegExp(pattern!));
  // #nor classified, so a stale cache holding hamlets still yields none
  assert.equal(
    classifyNode({ type: "node", id: 5, lat: 43, lon: -2, tags: { place: "hamlet" } }),
    null,
  );
});

test("the place regex is anchored, so it cannot match a value that merely contains one", () => {
  const q = buildPoiQuery([-2, 43, -1, 44]);
  const pattern = q.match(/node\["place"~"([^"]+)"\]/)?.[1];
  assert.ok(pattern, "the query must still ask for place nodes");
  const places = new RegExp(pattern);
  // #then the three settlement sizes still match
  for (const value of ["city", "town", "village"]) assert.match(value, places);
  // #and a value that merely contains one does not — `city_block` is a real
  // OSM place value, and unanchored it would have come back as a settlement
  for (const value of ["city_block", "township"]) {
    assert.doesNotMatch(value, places);
  }
});

test("a church classifies as a sacred site, not as nothing", () => {
  assert.deepEqual(
    classifyNode({ type: "node", id: 1, lat: 43, lon: -2, tags: { amenity: "place_of_worship", religion: "christian" } }),
    { type: "sacred_site", subtype: "church" },
  );
});

test("a viewpoint and a village classify to their own types", () => {
  assert.deepEqual(
    classifyNode({ type: "node", id: 2, lat: 43, lon: -2, tags: { tourism: "viewpoint" } }),
    { type: "viewpoint", subtype: "viewpoint" },
  );
  assert.deepEqual(
    classifyNode({ type: "node", id: 3, lat: 43, lon: -2, tags: { place: "village" } }),
    { type: "town", subtype: "village" },
  );
});

test("resolveName reports the absence of a name that extractName papers over", () => {
  // #given a node OSM never named
  // #then resolveName says so, while extractName still hands back the
  // placeholder every existing service waypoint is labelled with
  assert.equal(resolveName({}), undefined);
  assert.equal(extractName({}), "Unnamed");
  // #and a name in any of the four accepted keys resolves
  assert.equal(resolveName({ "name:es": "Ermita" }), "Ermita");
  assert.equal(extractName({ "name:es": "Ermita" }), "Ermita");
});

test("a service tag still wins over a place tag on the same node", () => {
  // #given a node tagged both — a village with a shop record on it
  const n = { type: "node" as const, id: 4, lat: 43, lon: -2, tags: { shop: "convenience", place: "village" } };
  // #then the service classification is unchanged, so no existing waypoint moves type
  assert.deepEqual(classifyNode(n), { type: "supply", subtype: "convenience_store" });
});
