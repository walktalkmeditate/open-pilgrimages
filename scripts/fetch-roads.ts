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
const REQUEST_DELAY_MS = 5000;

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
 * Overpass can return HTTP 200 with a soft-timeout or truncation reported
 * only in a `remark` field, `elements` left empty or partial — a naive
 * !response.ok check treats that as a normal, if boring, result. Trusting it
 * silently overwrote two known-good caches with an empty one during
 * development. A `remark` is treated as a hard failure here, the same as any
 * other fetch error: the caller stops the route rather than caching it.
 */
async function fetchOverpass(query: string): Promise<unknown[]> {
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API returned ${response.status}: ${response.statusText}`);
  }

  const body: unknown = await response.json();
  if (!isOverpassResponseLike(body)) {
    throw new Error("Overpass API returned an unrecognized response shape");
  }
  if (typeof body.remark === "string") {
    throw new Error(`Overpass API reported: ${body.remark}`);
  }

  return Array.isArray(body.elements) ? body.elements : [];
}

type FetchOutcome =
  | { status: "no-geometry" }
  | { status: "already-cached"; waysFetched: number }
  | {
      status: "complete";
      totalChunks: number;
      fetchedThisRun: number;
      reusedThisRun: number;
      waysFetched: number;
      bytes: number;
    }
  | {
      status: "incomplete";
      totalChunks: number;
      fetchedThisRun: number;
      reusedThisRun: number;
      missingIndices: number[];
    };

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
async function fetchRoute(id: string, dir: string): Promise<FetchOutcome> {
  const geo = readJson(join(dir, "route.geojson"));
  if (!geo) return { status: "no-geometry" };

  const segments = segmentsOf(geo);
  if (segments.length === 0) return { status: "no-geometry" };

  const existingMerged = readRoadsCache(ROOT, id);
  if (existingMerged) {
    return { status: "already-cached", waysFetched: existingMerged.elements.length };
  }

  const decimated = decimateRoutePoints(segments);
  const chunks = chunkTrace(decimated);
  if (chunks.length === 0) return { status: "no-geometry" };

  const queries = chunks.map((chunk) => overpassQueryFor(chunk));
  const caches = new Array<RoadsChunkCacheFile | null>(chunks.length).fill(null);
  let fetchedThisRun = 0;
  let reusedThisRun = 0;

  for (let i = 0; i < chunks.length; i++) {
    const anchorHash = hashChunkAnchors(chunks[i]);
    const cached = readRoadsChunkCache(ROOT, id, i);

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
      await sleep(REQUEST_DELAY_MS);
    }

    let elements: unknown[];
    try {
      elements = await fetchOverpass(queries[i]);
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
    mkdirSync(chunkCacheDir(ROOT, id), { recursive: true });
    writeFileSync(chunkCachePathFor(ROOT, id, i), JSON.stringify(chunkCache));
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
    };
  }

  const cache: RoadsCacheFile = {
    fetchedAt: new Date().toISOString(),
    routeId: id,
    query: queries.join("\n\n"),
    elements: merged.elements,
  };
  const json = JSON.stringify(cache);
  writeFileSync(cachePathFor(ROOT, id), json);

  // The merged file is now the complete, durable result — the per-chunk
  // scratch files that built it up across possibly several runs have no
  // further purpose, and for a busy corridor (many chunks, tens of
  // thousands of ways each) leaving them in place would roughly double this
  // route's disk footprint under .cache/ forever.
  rmSync(chunkCacheDir(ROOT, id), { recursive: true, force: true });

  return {
    status: "complete",
    totalChunks: chunks.length,
    fetchedThisRun,
    reusedThisRun,
    waysFetched: merged.elements.length,
    bytes: Buffer.byteLength(json, "utf-8"),
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

async function main(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log("Fetching road corridor data from Overpass\n");

  const list = selectedTargets(ROOT, process.argv.slice(2));

  for (let i = 0; i < list.length; i++) {
    const { key, dir } = list[i];
    console.log(`${key}:`);

    let madeNetworkCall = false;

    try {
      const outcome = await fetchRoute(key, dir);
      madeNetworkCall = "fetchedThisRun" in outcome && outcome.fetchedThisRun > 0;

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
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log("\nFetch complete. Run 'npm run build-roads' to render SVGs from the cache.");
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
