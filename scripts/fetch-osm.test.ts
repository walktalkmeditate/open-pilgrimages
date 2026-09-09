import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ROUTES, fetchOverpass, main, runFetchOsm, type RouteConfig } from "./fetch-osm.js";

// This suite never touches the network. Every test injects a fake `fetch` and
// a temp cache directory through fetch-osm.ts's FetchOsmRuntime — a live sweep
// of seven routes is slow, and rude to a shared free API that has no interest
// in this project's test runs.

function fakeFetch(respond: (query: string) => Response): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    return respond(decodeURIComponent(body.replace(/^data=/, "")));
  }) as unknown as typeof fetch;
}

function overpassOk(): Response {
  return new Response(JSON.stringify({ elements: [] }), { status: 200 });
}

/** What Overpass actually answers a client that sends no User-Agent. */
function notAcceptable(): Response {
  return new Response("", { status: 406, statusText: "Not Acceptable" });
}

function tempCacheDir(): string {
  return mkdtempSync(join(tmpdir(), "fetch-osm-test-"));
}

/**
 * main() reports failure by setting process.exitCode rather than calling
 * process.exit, so the sweep's own exit path can be asserted in-process, with
 * no subprocess and no request. The runner's own exit code is put back either
 * way — a fixture leaving it at 1 would fail the whole suite from the outside.
 */
async function exitCodeOf(run: () => Promise<void>): Promise<typeof process.exitCode> {
  const before = process.exitCode;
  process.exitCode = 0;
  try {
    await run();
    return process.exitCode;
  } finally {
    process.exitCode = before;
  }
}

// --- fetchOverpass ---

test("fetchOverpass identifies this project to Overpass — sending no User-Agent is what 406'd every route", async () => {
  let headers: Record<string, string> = {};
  const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    headers = (init?.headers ?? {}) as Record<string, string>;
    return overpassOk();
  }) as unknown as typeof fetch;

  await fetchOverpass("[out:json];out;", fetchImpl);

  const userAgent = headers["User-Agent"];
  assert.ok(userAgent, "no User-Agent header was sent; Overpass answers that with 406");
  assert.match(userAgent, /^open-pilgrimages-/);
  assert.match(userAgent, /github\.com\/walktalkmeditate\/open-pilgrimages/);
});

test("fetchOverpass rejects on a 406, carrying the status into the message", async () => {
  const fetchImpl = fakeFetch(notAcceptable);
  await assert.rejects(fetchOverpass("[out:json];out;", fetchImpl), /406/);
});

// --- runFetchOsm ---

const TWO_ROUTES: RouteConfig[] = [
  { id: "route-a", description: "the one that fails", query: "QUERY-A" },
  { id: "route-b", description: "the one that succeeds", query: "QUERY-B" },
];

test("runFetchOsm sweeps past a failed route and returns the id that failed", async (t) => {
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  const cacheDir = tempCacheDir();
  const fetchImpl = fakeFetch((query) =>
    query === "QUERY-A" ? new Response("", { status: 504, statusText: "Gateway Timeout" }) : overpassOk(),
  );

  try {
    const failed = await runFetchOsm(TWO_ROUTES, true, { cacheDir, fetchImpl });

    // #then route-a's failure neither stopped route-b nor vanished
    assert.deepEqual(failed, ["route-a"]);
    assert.equal(existsSync(join(cacheDir, "route-b.json")), true);
    assert.equal(existsSync(join(cacheDir, "route-a.json")), false);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

// --- main: the exit code ---

test("main exits non-zero and names the route when one fails, while the rest still fetch", async (t) => {
  t.mock.method(console, "log", () => {});
  const errors: string[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
  const cacheDir = tempCacheDir();
  // Only the Shikoku sweep fails, by its own committed query — so this asserts
  // against the real ROUTES list rather than a fixture shaped to pass.
  const fetchImpl = fakeFetch((query) => (query.includes("四国遍路") ? notAcceptable() : overpassOk()));

  try {
    const code = await exitCodeOf(() => main({ cacheDir, fetchImpl }));

    assert.notEqual(code, 0);
    assert.ok(
      errors.some((line) => line.includes("shikoku-88")),
      `the failing route was not named in stderr: ${JSON.stringify(errors)}`,
    );
    assert.deepEqual(readdirSync(cacheDir).sort(), [
      "camino-frances.json",
      "camino-ingles.json",
      "camino-norte.json",
      "camino-portugues.json",
      "camino-primitivo.json",
      "kumano-kodo-nakahechi.json",
    ]);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("main leaves the exit code at zero when every route fetched", async (t) => {
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  const cacheDir = tempCacheDir();

  try {
    const code = await exitCodeOf(() => main({ cacheDir, fetchImpl: fakeFetch(overpassOk) }));

    assert.equal(code, 0);
    assert.equal(readdirSync(cacheDir).length, ROUTES.length);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
