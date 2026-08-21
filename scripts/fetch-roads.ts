import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { resolveInvokedPath } from "./cli.js";
import { readJson, targets } from "./site/build-assets.js";
import { segmentsOf } from "./site/glyphs.js";
import {
  cachePathFor,
  chunkCacheDir,
  chunkCachePathFor,
  chunkTrace,
  decimateRoutePoints,
  hashChunkAnchors,
  isFreshChunkCache,
  mergeChunkCaches,
  OVERPASS_TIMEOUT_SECONDS,
  overpassQueryFor,
  readRoadsCache,
  readRoadsChunkCache,
  type RoadsCacheFile,
  type RoadsChunkCacheFile,
} from "./site/roads.js";

const ROOT = join(import.meta.dirname, "..");
const CACHE_DIR = join(ROOT, ".cache", "roads");
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// A descriptive UA plus a delay between requests, per Overpass's usage
// guidelines for the free public instance — this is the only script in the
// project that calls it for road data. Most routes fit in a single request;
// a route whose decimated trace exceeds MAX_CHUNK_POINTS (see roads.ts) is
// split into several, but the same delay applies between every request this
// script makes, chunk or route, so total request rate never changes. The
// delay is only ever paid before an actual network call — a chunk reused
// from cache costs nothing, so a mostly-resumed rerun is fast, not just
// resumable.
const USER_AGENT =
  "open-pilgrimages-road-corridor/1.0 (+https://github.com/walktalkmeditate/open-pilgrimages)";
// Exported so the test suite can assert on the real pacing/timeout values
// rather than just the shape of the call — see fetch-roads.test.ts.
export const REQUEST_DELAY_MS = 5000;

// The query's own [timeout:280] bounds how long Overpass will spend
// *computing* a response, but not the socket itself — a connection that
// stalls before Overpass even starts (or after it finishes, on the way
// back) would otherwise hang this script forever. Bounded comfortably past
// the server-side timeout so a normal, if slow, response is never aborted
// out from under it.
export const CLIENT_TIMEOUT_MS = (OVERPASS_TIMEOUT_SECONDS + 30) * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface OverpassResponseLike {
  elements?: unknown[];
  remark?: unknown;
}

function isOverpassResponseLike(value: unknown): value is OverpassResponseLike {
  return typeof value === "object" && value !== null;
}

/**
 * 429 is the one status where the server tells us how long to wait.
 * Surfacing that here doesn't retry (nothing in this file loops on
 * failure) — it just makes the wait visible to whoever reruns this by hand.
 * Pulled out as its own function so the message it builds — with and
 * without a Retry-After header present — can be asserted on directly,
 * without a real 429 response to construct.
 */
export function describeRateLimitError(statusText: string, retryAfterHeader: string | null): string {
  const suggestion = retryAfterHeader ? `, suggested wait: ${retryAfterHeader}s` : "";
  return `Overpass API returned 429: ${statusText}${suggestion}`;
}

export type OverpassOutcome = { ok: true; elements: unknown[] } | { ok: false; reason: string };

/**
 * Overpass can return HTTP 200 with a soft-timeout or truncation reported
 * only in a `remark` field, `elements` left empty or partial — a naive
 * !response.ok check treats that as a normal, if boring, result. Trusting it
 * silently overwrote two known-good caches with an empty one during
 * development. A `remark` is treated as a hard failure here, the same as any
 * other fetch error: the caller stops the route rather than caching it.
 *
 * An `elements` array that's merely empty, with no `remark`, is not treated
 * as a failure — Overpass genuinely has nothing to report for some corridors
 * (see roads.ts's own "0 ways kept" guard, which is where an empty result is
 * actually acted on, not here).
 */
export function classifyOverpassBody(body: unknown): OverpassOutcome {
  if (!isOverpassResponseLike(body)) {
    return { ok: false, reason: "Overpass API returned an unrecognized response shape" };
  }
  if (typeof body.remark === "string") {
    return { ok: false, reason: `Overpass API reported: ${body.remark}` };
  }
  return { ok: true, elements: Array.isArray(body.elements) ? body.elements : [] };
}

/**
 * Issues one Overpass request and returns its elements, or throws. Takes its
 * `fetch` implementation as a parameter — defaulting to the real global
 * `fetch` — so the response-handling logic above (429/Retry-After, the
 * remark-as-failure rule, the client-side timeout) can be exercised with a
 * fake response and no network call at all.
 */
export async function fetchOverpass(query: string, fetchImpl: typeof fetch = fetch): Promise<unknown[]> {
  const response = await fetchImpl(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(describeRateLimitError(response.statusText, response.headers.get("retry-after")));
    }
    throw new Error(`Overpass API returned ${response.status}: ${response.statusText}`);
  }

  const body: unknown = await response.json();
  const outcome = classifyOverpassBody(body);
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.elements;
}

// `networkCallAttempted` drives the inter-route delay in runFetchRoads()
// below — it must reflect whether a network *request went out*, not
// whether one succeeded. Deriving it from a success count (fetchedThisRun
// > 0, the original approach) means a route that 429s on its very first
// request reports zero successes, runFetchRoads() skips the pacing delay
// before the next route, and its first request goes out immediately — the
// exact behaviour that escalates rate limiting on a free API that has
// already returned 429s and 504s to this workload.
export type FetchOutcome =
  | { status: "no-geometry"; networkCallAttempted: false }
  | { status: "already-cached"; waysFetched: number; networkCallAttempted: false }
  | {
      status: "complete";
      totalChunks: number;
      fetchedThisRun: number;
      reusedThisRun: number;
      waysFetched: number;
      bytes: number;
      networkCallAttempted: boolean;
    }
  | {
      status: "incomplete";
      totalChunks: number;
      fetchedThisRun: number;
      reusedThisRun: number;
      missingIndices: number[];
      networkCallAttempted: boolean;
    };

/**
 * The dependencies fetchRoute and runFetchRoads need in order to be run
 * against something other than the real network and the real project
 * `.cache/` directory. Every field defaults to the real thing, so calling
 * either function with no runtime at all — what `main()` does — reproduces
 * today's behaviour exactly. Tests supply a temp `root` (so a fake route id
 * can never collide with, or write into, this project's actual
 * `.cache/roads/`), a fake `fetchImpl` (so no request reaches Overpass), and
 * a fake `sleepImpl` (so a pacing test doesn't spend REQUEST_DELAY_MS of
 * real wall-clock time proving a delay happened).
 */
export interface FetchRoadsRuntime {
  root?: string;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * Fetches one route's road data, chunking the request when the decimated
 * trace is too large for Overpass to handle in one `around:` clause (see
 * MAX_CHUNK_POINTS in roads.ts). Chunks are requested strictly one at a
 * time, with the same courtesy delay between them as between routes — never
 * in parallel, never retried in a loop on failure.
 *
 * Resumable: each chunk is cached to disk (see chunkCachePathFor) the moment
 * it succeeds, before the next chunk is even requested. A rerun reuses any
 * chunk whose cache matches the current chunking (same route, same slot,
 * same anchor points — see isFreshChunkCache) without touching the network,
 * and only fetches what's still missing. If a chunk fails, the route stops
 * right there — whatever succeeded stays cached for next time, and the
 * merged .cache/roads/{route-id}.json is only ever written once every chunk
 * is present, never from a partial set.
 *
 * A route that already has a merged cache is skipped entirely — that file
 * *is* the completed result, and re-deriving it from (possibly since
 * cleaned-up) chunk files would cost a rerun nothing but time. Staleness
 * against a route's current geometry is check-site's job (its embedded
 * geometry-hash guard), not fetch-roads'.
 */
export async function fetchRoute(id: string, dir: string, runtime: FetchRoadsRuntime = {}): Promise<FetchOutcome> {
  const root = runtime.root ?? ROOT;
  const fetchImpl = runtime.fetchImpl ?? fetch;
  const sleepImpl = runtime.sleepImpl ?? sleep;

  const geo = readJson(join(dir, "route.geojson"));
  if (!geo) return { status: "no-geometry", networkCallAttempted: false };

  const segments = segmentsOf(geo);
  if (segments.length === 0) return { status: "no-geometry", networkCallAttempted: false };

  const existingMerged = readRoadsCache(root, id);
  if (existingMerged) {
    return {
      status: "already-cached",
      waysFetched: existingMerged.elements.length,
      networkCallAttempted: false,
    };
  }

  const decimated = decimateRoutePoints(segments);
  const chunks = chunkTrace(decimated);
  if (chunks.length === 0) return { status: "no-geometry", networkCallAttempted: false };

  const queries = chunks.map((chunk) => overpassQueryFor(chunk));
  const caches = new Array<RoadsChunkCacheFile | null>(chunks.length).fill(null);
  let fetchedThisRun = 0;
  let reusedThisRun = 0;
  let networkCallAttempted = false;

  for (let i = 0; i < chunks.length; i++) {
    const anchorHash = hashChunkAnchors(chunks[i]);
    const cached = readRoadsChunkCache(root, id, i);

    if (cached && isFreshChunkCache(cached, id, i, anchorHash)) {
      caches[i] = cached;
      reusedThisRun++;
      if (chunks.length > 1) {
        console.log(`  chunk ${i + 1}/${chunks.length}: cached — reused, no network call`);
      }
      continue;
    }

    if (chunks.length > 1) {
      console.log(`  chunk ${i + 1}/${chunks.length} (${chunks[i].length} anchors)...`);
    }

    if (fetchedThisRun > 0) {
      await sleepImpl(REQUEST_DELAY_MS);
    }

    networkCallAttempted = true;

    let elements: unknown[];
    try {
      elements = await fetchOverpass(queries[i], fetchImpl);
    } catch (error) {
      console.error(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error(
        `  ↳ Stopping this route — chunks fetched so far stay cached, chunk ${i} and later remain`,
      );
      break;
    }

    if (chunks.length > 1) {
      console.log(`    ↳ ${elements.length} way(s)`);
    }

    const chunkCache: RoadsChunkCacheFile = {
      routeId: id,
      chunkIndex: i,
      anchorHash,
      fetchedAt: new Date().toISOString(),
      elements,
    };
    mkdirSync(chunkCacheDir(root, id), { recursive: true });
    writeFileSync(chunkCachePathFor(root, id, i), JSON.stringify(chunkCache));
    caches[i] = chunkCache;
    fetchedThisRun++;
  }

  const merged = mergeChunkCaches(chunks.length, caches);

  if (merged.status === "incomplete") {
    return {
      status: "incomplete",
      totalChunks: chunks.length,
      fetchedThisRun,
      reusedThisRun,
      missingIndices: merged.missingIndices,
      networkCallAttempted,
    };
  }

  // fetchedAt is the earliest chunk's own fetch time, not "now" — a route
  // whose chunks span more than one run (see isFreshChunkCache) would
  // otherwise carry a merge timestamp that has nothing to do with when its
  // road data actually came from Overpass. See mergeChunkCaches' own doc
  // comment in roads.ts.
  const cache: RoadsCacheFile = {
    fetchedAt: merged.earliestFetchedAt,
    routeId: id,
    query: queries.join("\n\n"),
    elements: merged.elements,
  };
  const json = JSON.stringify(cache);
  writeFileSync(cachePathFor(root, id), json);

  // The merged file is now the complete, durable result — the per-chunk
  // scratch files that built it up across possibly several runs have no
  // further purpose, and for a busy corridor (many chunks, tens of
  // thousands of ways each) leaving them in place would roughly double this
  // route's disk footprint under .cache/ forever.
  rmSync(chunkCacheDir(root, id), { recursive: true, force: true });

  return {
    status: "complete",
    totalChunks: chunks.length,
    fetchedThisRun,
    reusedThisRun,
    waysFetched: merged.elements.length,
    bytes: Buffer.byteLength(json, "utf-8"),
    networkCallAttempted,
  };
}

/**
 * Optional route-id args (e.g. `npm run fetch-roads -- camino-frances
 * shikoku-88`) narrow the run to just those routes — useful for retrying a
 * route that timed out without re-fetching seven others that already
 * succeeded, which is both slower and less considerate of a shared free API
 * than it needs to be.
 */
function selectedTargets(root: string, ids: string[]): ReturnType<typeof targets> {
  const all = targets(root);
  if (ids.length === 0) return all;

  const wanted = new Set(ids);
  return all.filter((t) => wanted.has(t.key));
}

/**
 * Runs fetchRoute across every target in order, applying the same courtesy
 * delay between routes that fetchRoute applies between chunks within one
 * route. Gated on `networkCallAttempted`, not on success — see FetchOutcome's
 * own doc comment above — so a route that fails outright on its first
 * request still paces the next one, rather than a rate-limited or offline
 * run hammering Overpass with back-to-back requests as everything fails in
 * sequence.
 */
export async function runFetchRoads(
  list: ReturnType<typeof targets>,
  runtime: FetchRoadsRuntime = {},
): Promise<void> {
  const sleepImpl = runtime.sleepImpl ?? sleep;

  for (let i = 0; i < list.length; i++) {
    const { key, dir } = list[i];
    console.log(`${key}:`);

    let madeNetworkCall = false;

    try {
      const outcome = await fetchRoute(key, dir, runtime);
      madeNetworkCall = outcome.networkCallAttempted;

      switch (outcome.status) {
        case "no-geometry":
          console.log("  ↳ no route geometry — skipping");
          break;

        case "already-cached":
          console.log(`  ↳ already cached (${outcome.waysFetched} way(s)) — nothing to fetch`);
          break;

        case "complete": {
          const chunkNote =
            outcome.totalChunks > 1
              ? ` across ${outcome.totalChunks} chunks (${outcome.fetchedThisRun} fetched, ${outcome.reusedThisRun} reused)`
              : "";
          console.log(
            `  ↳ fetched ${outcome.waysFetched} way(s)${chunkNote}, cached ${(outcome.bytes / 1024).toFixed(1)} KB`,
          );
          break;
        }

        case "incomplete":
          console.log(
            `  ↳ incomplete: ${outcome.fetchedThisRun} fetched, ${outcome.reusedThisRun} reused this run — ` +
              `chunk(s) ${outcome.missingIndices.join(", ")} of ${outcome.totalChunks} still missing, rerun to continue`,
          );
          break;
      }
    } catch (error) {
      console.error(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error("  ↳ Skipping (any existing cache for this route is untouched)");
    }

    if (i < list.length - 1 && madeNetworkCall) {
      await sleepImpl(REQUEST_DELAY_MS);
    }
  }
}

async function main(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log("Fetching road corridor data from Overpass\n");

  const list = selectedTargets(ROOT, process.argv.slice(2));
  await runFetchRoads(list);

  console.log("\nFetch complete. Run 'npm run build-roads' to render SVGs from the cache.");
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
