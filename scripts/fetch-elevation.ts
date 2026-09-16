import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { resolveInvokedPath } from "./cli.js";
import { readJson, targets } from "./site/build-assets.js";
import { walkedLine } from "./ways/geo.js";
import type { Position } from "./ways/types.js";

const ROOT = join(import.meta.dirname, "..");
const CACHE_DIR = join(ROOT, ".cache", "elevation");

/**
 * NASA SRTM 1-arc-second, void-filled, served by OpenTopoData's free public
 * instance. The source is a US Government work in the public domain: it
 * carries no copyright and no attribution obligation at all, which is the
 * whole reason its readings can be mixed into this ODbL dataset without
 * changing the licence. That is also why Mapbox's Terrain-RGB is not an
 * option here however convenient the token would be — its terms bar deriving
 * a redistributable dataset, and ODbL's share-alike obliges exactly that
 * redistribution downstream.
 *
 * If the public instance ever refuses this workload, the escape hatch is
 * OpenTopoData's own Docker image run locally against downloaded SRTM HGT
 * tiles. Same dataset, same interpolation, no rate limit — the method stays
 * byte-identical, which matters more than where the server lives.
 */
const OPENTOPODATA_URL = "https://api.opentopodata.org/v1/srtm30m";
const USER_AGENT =
  "open-pilgrimages-elevation/1.0 (+https://github.com/walktalkmeditate/open-pilgrimages)";

/** The dataset name this script asks for, and expects echoed back in every result. */
export const DATASET = "srtm30m";

/**
 * OpenTopoData's published limits for the free public instance, confirmed
 * against opentopodata.org before this run: 100 locations per request, one
 * call per second, 1,000 calls per day. All three are exported so the test
 * suite asserts the real values rather than the shape of a call.
 */
export const MAX_LOCATIONS_PER_REQUEST = 100;
export const REQUEST_DELAY_MS = 1000;

/**
 * The daily cap, spent as a per-run ceiling. This script cannot know what
 * yesterday cost or what another process on the same address is spending, so
 * it does not pretend to: it refuses to make more than a day's worth of
 * requests in one run, reports how far it got, and leaves everything it did
 * fetch cached for the next one. The whole corpus is roughly 454 requests, so
 * a complete pass fits inside one day with headroom — the ceiling is there for
 * the run that goes wrong, not the run that goes right.
 */
export const DAILY_REQUEST_LIMIT = 1000;

/**
 * A single request carries at most 100 locations and the server answers from
 * a local file, so nothing here should take thirty seconds. A socket that
 * stalls before the server starts, or on the way back, would otherwise hang a
 * run that is already pacing itself at one request a second.
 */
export const CLIENT_TIMEOUT_MS = 30000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * OpenTopoData takes `lat,lon`; GeoJSON stores `[lon, lat]`. The swap is the
 * single most consequential line in this file — transposed, every request
 * still succeeds, every response still parses, and every figure is measured
 * somewhere else entirely — so it lives in its own named, tested function
 * rather than inside a template literal in the middle of a fetch.
 */
export function locationsParam(vertices: Position[]): string {
  return vertices.map(([lon, lat]) => `${lat},${lon}`).join("|");
}

/**
 * Splits a line into consecutive, non-overlapping runs of at most `size`
 * vertices. Unlike the road corridor's chunking there is no overlap: each
 * vertex is sampled exactly once and the chunks concatenate back into the
 * line in order, so an overlap would be duplicate readings to strip rather
 * than a seam to cover.
 */
export function chunkVertices(
  vertices: Position[],
  size: number = MAX_LOCATIONS_PER_REQUEST,
): Position[][] {
  const chunks: Position[][] = [];
  for (let start = 0; start < vertices.length; start += size) {
    chunks.push(vertices.slice(start, start + size));
  }
  return chunks;
}

/**
 * Identifies the exact vertices a cached reading was taken at. Stored beside
 * every chunk and beside the merged file, and recomputed from the current line
 * on every run: if the walked line is rebuilt, or the chunk size changes what
 * vertices slot N carries, the hash changes and the cache stops being treated
 * as an answer to the question now being asked.
 *
 * Deliberately not shared with roads.ts's hashChunkAnchors, which computes the
 * same thing for the road corridor. One function would mean a change made for
 * the corridor's reasons silently invalidates every elevation cache in the
 * project, and the two have no reason to move together.
 */
export function hashVertices(vertices: Position[]): string {
  return createHash("sha256").update(JSON.stringify(vertices)).digest("hex");
}

/** What a completed run leaves in .cache/elevation/{route-id}.json. */
export interface ElevationCacheFile {
  fetchedAt: string;
  routeId: string;
  dataset: string;
  /** Which geometry file the vertices were read from — the same choice build-ways makes. */
  source: string;
  /** hashVertices over the whole walked line, so a consumer can tell samples from a rebuilt line. */
  lineHash: string;
  /**
   * One reading per vertex, in line order. `null` is what the model said, not
   * a gap this script introduced: SRTM has voids, and recording them honestly
   * lets the pure side refuse to publish a figure measured across one rather
   * than quietly interpolating over it.
   */
  elevations: Array<number | null>;
}

/** What each chunk is persisted as the moment it succeeds, before the next request goes out. */
export interface ElevationChunkCacheFile {
  routeId: string;
  chunkIndex: number;
  anchorHash: string;
  fetchedAt: string;
  elevations: Array<number | null>;
}

export function cachePathFor(root: string, id: string): string {
  return join(root, ".cache", "elevation", `${id}.json`);
}

export function chunkCacheDir(root: string, routeId: string): string {
  return join(root, ".cache", "elevation", "chunks", routeId);
}

export function chunkCachePathFor(root: string, routeId: string, index: number): string {
  return join(chunkCacheDir(root, routeId), `${index}.json`);
}

function parseJsonFile(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function isElevationArray(value: unknown): value is Array<number | null> {
  return Array.isArray(value) && value.every((e) => e === null || typeof e === "number");
}

/**
 * Reads a route's merged cache, or null if it is missing, unparsable, or not
 * this route's. The routeId check is the one thing that catches a hand-copied
 * or mis-named cache belonging to a different route — the readings themselves
 * are bare numbers and would look perfectly reasonable.
 */
export function readElevationCache(root: string, id: string): ElevationCacheFile | null {
  const parsed = parseJsonFile(cachePathFor(root, id));
  if (typeof parsed !== "object" || parsed === null) return null;

  const { fetchedAt, routeId, dataset, source, lineHash, elevations } = parsed as Record<string, unknown>;
  if (
    typeof fetchedAt !== "string" ||
    typeof routeId !== "string" ||
    typeof dataset !== "string" ||
    typeof source !== "string" ||
    typeof lineHash !== "string" ||
    !isElevationArray(elevations)
  ) {
    return null;
  }
  if (routeId !== id) return null;

  return { fetchedAt, routeId, dataset, source, lineHash, elevations };
}

export function readElevationChunkCache(
  root: string,
  routeId: string,
  index: number,
): ElevationChunkCacheFile | null {
  const parsed = parseJsonFile(chunkCachePathFor(root, routeId, index));
  if (typeof parsed !== "object" || parsed === null) return null;

  const { routeId: cachedId, chunkIndex, anchorHash, fetchedAt, elevations } = parsed as Record<string, unknown>;
  if (
    typeof cachedId !== "string" ||
    typeof chunkIndex !== "number" ||
    typeof anchorHash !== "string" ||
    typeof fetchedAt !== "string" ||
    !isElevationArray(elevations)
  ) {
    return null;
  }
  return { routeId: cachedId, chunkIndex, anchorHash, fetchedAt, elevations };
}

export function isFreshChunkCache(
  cache: ElevationChunkCacheFile,
  routeId: string,
  chunkIndex: number,
  anchorHash: string,
): boolean {
  return cache.routeId === routeId && cache.chunkIndex === chunkIndex && cache.anchorHash === anchorHash;
}

/**
 * A merged cache is only an answer to today's question if it was taken at
 * today's vertices. Roads leaves staleness to check-site, because a stale
 * corridor renders a slightly wrong picture; a stale elevation cache would be
 * published as a stage's ascent, so it is checked here, where re-fetching is
 * still an option.
 */
export function isFreshElevationCache(cache: ElevationCacheFile, lineHash: string): boolean {
  return cache.lineHash === lineHash && cache.dataset === DATASET;
}

export type ChunkMergeResult =
  | { status: "complete"; elevations: Array<number | null>; earliestFetchedAt: string }
  | { status: "incomplete"; missingIndices: number[] };

/**
 * Concatenates the per-chunk readings back into one line-ordered array, but
 * only once every chunk is present. A partial set names the missing indices
 * instead of merging around the gap: a line silently missing a slice of its
 * middle would still produce gain, loss and a high point, all of them wrong,
 * and none of them visibly so.
 *
 * `earliestFetchedAt` is the oldest chunk's own fetch time, not the merge's —
 * a route whose chunks span more than one run would otherwise carry a
 * timestamp that has nothing to do with when the readings came from the
 * server. Comparing ISO strings directly is safe: every timestamp written here
 * is UTC, so lexicographic order is chronological order.
 */
export function mergeChunkCaches(
  chunkCount: number,
  caches: ReadonlyArray<ElevationChunkCacheFile | null>,
): ChunkMergeResult {
  const missingIndices: number[] = [];
  for (let i = 0; i < chunkCount; i++) {
    if (!caches[i]) missingIndices.push(i);
  }
  if (missingIndices.length > 0) return { status: "incomplete", missingIndices };

  const present = caches.slice(0, chunkCount) as ElevationChunkCacheFile[];
  const earliestFetchedAt = present.reduce(
    (earliest, cache) => (cache.fetchedAt < earliest ? cache.fetchedAt : earliest),
    present[0].fetchedAt,
  );

  return {
    status: "complete",
    elevations: present.flatMap((cache) => cache.elevations),
    earliestFetchedAt,
  };
}

export type ElevationOutcome =
  | { ok: true; elevations: Array<number | null> }
  | { ok: false; reason: string };

/**
 * 429 is the one status where the server says how long to wait. Nothing in
 * this file retries — surfacing the wait just makes it visible to whoever
 * reruns the command by hand.
 */
export function describeRateLimitError(statusText: string, retryAfterHeader: string | null): string {
  const suggestion = retryAfterHeader ? `, suggested wait: ${retryAfterHeader}s` : "";
  return `OpenTopoData returned 429: ${statusText}${suggestion}`;
}

/**
 * What a failing HTTP status means, with OpenTopoData's own explanation folded
 * in where it sent one. A 400 carries the reason the request was refused in
 * its body — which location it could not parse, which limit was exceeded — and
 * that is worth far more than "Bad Request" to whoever has to fix the run. A
 * 500 usually carries nothing, and then the status line is all there is.
 */
export function describeHttpError(status: number, statusText: string, body: unknown): string {
  const error = typeof body === "object" && body !== null ? (body as Record<string, unknown>).error : undefined;
  const detail = typeof error === "string" && error.length > 0 ? ` — ${error}` : "";
  return `OpenTopoData returned ${status}: ${statusText}${detail}`;
}

/**
 * A response is only usable if it answers the question that was asked, in the
 * order it was asked. Three things are checked beyond `status: "OK"`, and each
 * of them is a way to be given plausible numbers for the wrong places:
 *
 * - a results count that does not match the locations sent, which would shift
 *   every reading after the gap onto a different vertex once the chunks merge;
 * - a `dataset` that is not the one requested, because a server-side fallback
 *   to a coarser model would change what every published figure means without
 *   changing its shape;
 * - an echoed `location` that is not the location sent. OpenTopoData echoes
 *   the request back verbatim, so this catches a transposed lat/lon before it
 *   becomes a committed ascent. The tolerance is loose enough to survive a
 *   server that snaps the echo to its own grid (a 30 m post is ~0.0003°) and
 *   far tighter than any real transposition.
 */
export function classifyElevationBody(body: unknown, requested: Position[]): ElevationOutcome {
  if (typeof body !== "object" || body === null) {
    return { ok: false, reason: "OpenTopoData returned an unrecognized response shape" };
  }

  const { status, error, results } = body as Record<string, unknown>;
  if (status !== "OK") {
    const detail = typeof error === "string" ? `: ${error}` : "";
    return { ok: false, reason: `OpenTopoData reported ${JSON.stringify(status)}${detail}` };
  }
  if (!Array.isArray(results)) {
    return { ok: false, reason: "OpenTopoData returned no results array" };
  }
  if (results.length !== requested.length) {
    return {
      ok: false,
      reason: `OpenTopoData answered ${results.length} of ${requested.length} locations`,
    };
  }

  const elevations: Array<number | null> = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i] as Record<string, unknown> | null;
    if (typeof result !== "object" || result === null) {
      return { ok: false, reason: `OpenTopoData result ${i} is not an object` };
    }
    if (typeof result.dataset === "string" && result.dataset !== DATASET) {
      return {
        ok: false,
        reason: `OpenTopoData answered from "${result.dataset}", not "${DATASET}"`,
      };
    }

    const location = result.location as Record<string, unknown> | undefined;
    if (location && typeof location.lat === "number" && typeof location.lng === "number") {
      const [lon, lat] = requested[i];
      if (Math.abs(location.lat - lat) > 0.002 || Math.abs(location.lng - lon) > 0.002) {
        return {
          ok: false,
          reason:
            `OpenTopoData echoed (${location.lat}, ${location.lng}) for result ${i}, ` +
            `which was asked for (${lat}, ${lon})`,
        };
      }
    }

    const elevation = result.elevation;
    if (elevation === null || elevation === undefined) {
      elevations.push(null);
    } else if (typeof elevation === "number" && Number.isFinite(elevation)) {
      elevations.push(elevation);
    } else {
      return { ok: false, reason: `OpenTopoData result ${i} has a non-numeric elevation` };
    }
  }

  return { ok: true, elevations };
}

/**
 * Issues one request and returns its readings, or throws. Takes its `fetch`
 * implementation as a parameter — defaulting to the real global — so every
 * rule above can be exercised against a fake response with no network call at
 * all.
 */
export async function fetchElevations(
  vertices: Position[],
  fetchImpl: typeof fetch = fetch,
): Promise<Array<number | null>> {
  const url = `${OPENTOPODATA_URL}?locations=${encodeURIComponent(locationsParam(vertices))}`;
  const response = await fetchImpl(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
  });

  if (!response.ok && response.status === 429) {
    throw new Error(describeRateLimitError(response.statusText, response.headers.get("retry-after")));
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new Error(describeHttpError(response.status, response.statusText, body));
  }

  const outcome = classifyElevationBody(body, vertices);
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.elevations;
}

export interface FetchElevationRuntime {
  root?: string;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  /** How many requests this call may still make. See DAILY_REQUEST_LIMIT. */
  requestBudget?: number;
}

export type FetchOutcome =
  | { status: "no-geometry"; networkCallAttempted: false; requestsMade: 0 }
  | { status: "already-cached"; vertexCount: number; networkCallAttempted: false; requestsMade: 0 }
  | {
      status: "complete";
      totalChunks: number;
      fetchedThisRun: number;
      reusedThisRun: number;
      vertexCount: number;
      voids: number;
      bytes: number;
      networkCallAttempted: boolean;
      requestsMade: number;
    }
  | {
      status: "incomplete";
      totalChunks: number;
      fetchedThisRun: number;
      reusedThisRun: number;
      missingIndices: number[];
      budgetExhausted: boolean;
      networkCallAttempted: boolean;
      requestsMade: number;
    };

/**
 * Which geometry file a route's readings are taken from — `route.main.geojson`
 * where one exists, `route.geojson` otherwise. The same choice build-ways
 * makes, and it has to stay the same choice: `route.geojson` bundles optional
 * variants nobody walks in one sitting, so sampling it would measure climbs
 * that belong to a road not taken.
 */
export function walkedLineSourceFor(dir: string): string | null {
  for (const name of ["route.main.geojson", "route.geojson"]) {
    if (existsSync(join(dir, name))) return name;
  }
  return null;
}

/**
 * Samples one route's walked line, one hundred vertices at a time.
 *
 * Resumable, and at a thousand requests a day that is not a nicety: each chunk
 * is written to disk the moment it succeeds, before the next request goes out,
 * and a rerun reuses every chunk whose cache still matches this route, this
 * slot and these exact vertices. A run that dies at request 300 resumes at
 * 300. The merged file is only ever written from a complete set.
 */
export async function fetchRouteElevation(
  id: string,
  dir: string,
  runtime: FetchElevationRuntime = {},
): Promise<FetchOutcome> {
  const root = runtime.root ?? ROOT;
  const fetchImpl = runtime.fetchImpl ?? fetch;
  const sleepImpl = runtime.sleepImpl ?? sleep;
  const budget = runtime.requestBudget ?? DAILY_REQUEST_LIMIT;

  const source = walkedLineSourceFor(dir);
  if (!source) return { status: "no-geometry", networkCallAttempted: false, requestsMade: 0 };

  const geo = readJson(join(dir, source));
  if (!geo) return { status: "no-geometry", networkCallAttempted: false, requestsMade: 0 };

  const line = walkedLine(geo);
  if (line.length === 0) return { status: "no-geometry", networkCallAttempted: false, requestsMade: 0 };

  const lineHash = hashVertices(line);
  const existing = readElevationCache(root, id);
  if (existing && isFreshElevationCache(existing, lineHash)) {
    return {
      status: "already-cached",
      vertexCount: existing.elevations.length,
      networkCallAttempted: false,
      requestsMade: 0,
    };
  }

  const chunks = chunkVertices(line);
  const caches = new Array<ElevationChunkCacheFile | null>(chunks.length).fill(null);
  let fetchedThisRun = 0;
  let reusedThisRun = 0;
  let networkCallAttempted = false;
  let budgetExhausted = false;

  for (let i = 0; i < chunks.length; i++) {
    const anchorHash = hashVertices(chunks[i]);
    const cached = readElevationChunkCache(root, id, i);

    if (cached && isFreshChunkCache(cached, id, i, anchorHash)) {
      caches[i] = cached;
      reusedThisRun++;
      continue;
    }

    if (fetchedThisRun >= budget) {
      console.log(`  ↳ request budget spent after ${fetchedThisRun} request(s) — rerun tomorrow to continue`);
      budgetExhausted = true;
      break;
    }

    if (fetchedThisRun > 0) {
      await sleepImpl(REQUEST_DELAY_MS);
    }

    networkCallAttempted = true;

    let elevations: Array<number | null>;
    try {
      elevations = await fetchElevations(chunks[i], fetchImpl);
    } catch (error) {
      console.error(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`  ↳ Stopping this route — chunk ${i} and later remain, everything before it stays cached`);
      break;
    }

    const chunkCache: ElevationChunkCacheFile = {
      routeId: id,
      chunkIndex: i,
      anchorHash,
      fetchedAt: new Date().toISOString(),
      elevations,
    };
    mkdirSync(chunkCacheDir(root, id), { recursive: true });
    writeFileSync(chunkCachePathFor(root, id, i), JSON.stringify(chunkCache));
    caches[i] = chunkCache;
    fetchedThisRun++;

    if (chunks.length > 1 && (i + 1) % 10 === 0) {
      console.log(`  chunk ${i + 1}/${chunks.length} (${fetchedThisRun} fetched, ${reusedThisRun} reused)`);
    }
  }

  const merged = mergeChunkCaches(chunks.length, caches);

  if (merged.status === "incomplete") {
    return {
      status: "incomplete",
      totalChunks: chunks.length,
      fetchedThisRun,
      reusedThisRun,
      missingIndices: merged.missingIndices,
      budgetExhausted,
      networkCallAttempted,
      requestsMade: fetchedThisRun,
    };
  }

  const cache: ElevationCacheFile = {
    fetchedAt: merged.earliestFetchedAt,
    routeId: id,
    dataset: DATASET,
    source,
    lineHash,
    elevations: merged.elevations,
  };
  const json = JSON.stringify(cache);
  mkdirSync(join(root, ".cache", "elevation"), { recursive: true });
  writeFileSync(cachePathFor(root, id), json);

  // The merged file is the complete, durable result; the per-chunk scratch
  // files that built it up have no further purpose, and for the whole corpus
  // they would otherwise double this pass's disk footprint forever.
  rmSync(chunkCacheDir(root, id), { recursive: true, force: true });

  return {
    status: "complete",
    totalChunks: chunks.length,
    fetchedThisRun,
    reusedThisRun,
    vertexCount: merged.elevations.length,
    voids: merged.elevations.filter((e) => e === null).length,
    bytes: Buffer.byteLength(json, "utf-8"),
    networkCallAttempted,
    requestsMade: fetchedThisRun,
  };
}

/** `npm run fetch-elevation -- kumano-kodo-kohechi` narrows the run to named routes. */
function selectedTargets(root: string, ids: string[]): ReturnType<typeof targets> {
  const all = targets(root);
  if (ids.length === 0) return all;

  const wanted = new Set(ids);
  return all.filter((t) => wanted.has(t.key));
}

/**
 * Runs fetchRouteElevation across every target in order, carrying one request
 * budget across all of them — the cap is on the address, not on the route — and
 * applying the same one-second delay between routes that fetchRouteElevation
 * applies between chunks.
 *
 * Gated on `networkCallAttempted`, not on success: a route that fails outright
 * on its first request still paces the next one, rather than an offline or
 * rate-limited run firing back-to-back requests as everything fails in
 * sequence.
 */
export async function runFetchElevation(
  list: ReturnType<typeof targets>,
  runtime: FetchElevationRuntime = {},
): Promise<void> {
  const sleepImpl = runtime.sleepImpl ?? sleep;
  let remaining = runtime.requestBudget ?? DAILY_REQUEST_LIMIT;

  for (let i = 0; i < list.length; i++) {
    const { key, dir } = list[i];
    console.log(`${key}:`);

    let madeNetworkCall = false;

    try {
      const outcome = await fetchRouteElevation(key, dir, { ...runtime, requestBudget: remaining });
      madeNetworkCall = outcome.networkCallAttempted;
      remaining -= outcome.requestsMade;

      switch (outcome.status) {
        case "no-geometry":
          console.log("  ↳ no walked line — skipping");
          break;

        case "already-cached":
          console.log(`  ↳ already sampled (${outcome.vertexCount} vertices) — nothing to fetch`);
          break;

        case "complete": {
          const voidNote = outcome.voids > 0 ? `, ${outcome.voids} void(s) the model could not fill` : "";
          console.log(
            `  ↳ sampled ${outcome.vertexCount} vertices across ${outcome.totalChunks} request(s) ` +
              `(${outcome.fetchedThisRun} fetched, ${outcome.reusedThisRun} reused)${voidNote}, ` +
              `cached ${(outcome.bytes / 1024).toFixed(1)} KB`,
          );
          break;
        }

        case "incomplete":
          console.log(
            `  ↳ incomplete: ${outcome.fetchedThisRun} fetched, ${outcome.reusedThisRun} reused this run — ` +
              `${outcome.missingIndices.length} of ${outcome.totalChunks} chunk(s) still missing, rerun to continue`,
          );
          break;
      }
    } catch (error) {
      console.error(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error("  ↳ Skipping (any existing cache for this route is untouched)");
    }

    if (remaining <= 0) {
      console.log(`\nRequest budget of ${runtime.requestBudget ?? DAILY_REQUEST_LIMIT} spent — rerun to continue.`);
      return;
    }

    if (i < list.length - 1 && madeNetworkCall) {
      await sleepImpl(REQUEST_DELAY_MS);
    }
  }
}

async function main(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log("Sampling SRTM 30 m elevations from OpenTopoData\n");

  const list = selectedTargets(ROOT, process.argv.slice(2));
  await runFetchElevation(list);

  console.log("\nFetch complete. The cache is what the elevation pass reads; nothing is written to routes/ here.");
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
