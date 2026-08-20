import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { resolveInvokedPath } from "./cli.js";
import { readJson, targets } from "./site/build-assets.js";
import { segmentsOf } from "./site/glyphs.js";
import { cachePathFor, decimateRoutePoints, overpassQueryFor, type RoadsCacheFile } from "./site/roads.js";

const ROOT = join(import.meta.dirname, "..");
const CACHE_DIR = join(ROOT, ".cache", "roads");
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// A descriptive UA plus a delay between requests, per Overpass's usage
// guidelines for the free public instance — this is the only script in the
// project that calls it for road data, and it calls it once per route.
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
 * development. A `remark` is treated as a hard failure here so the existing
 * cache is left untouched instead, the same as any other fetch error.
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

interface FetchOutcome {
  waysFetched: number;
  bytes: number;
}

async function fetchRoute(id: string, dir: string): Promise<FetchOutcome | null> {
  const geo = readJson(join(dir, "route.geojson"));
  if (!geo) return null;

  const segments = segmentsOf(geo);
  if (segments.length === 0) return null;

  const decimated = decimateRoutePoints(segments);
  const query = overpassQueryFor(decimated);
  const elements = await fetchOverpass(query);

  const cache: RoadsCacheFile = {
    fetchedAt: new Date().toISOString(),
    routeId: id,
    query,
    elements,
  };

  const json = JSON.stringify(cache);
  writeFileSync(cachePathFor(ROOT, id), json);

  return { waysFetched: elements.length, bytes: Buffer.byteLength(json, "utf-8") };
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

    try {
      const outcome = await fetchRoute(key, dir);
      if (!outcome) {
        console.log("  ↳ no route geometry — skipping");
      } else {
        console.log(
          `  ↳ fetched ${outcome.waysFetched} way(s), cached ${(outcome.bytes / 1024).toFixed(1)} KB`,
        );
      }
    } catch (error) {
      console.error(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error("  ↳ Skipping (any existing cache for this route is untouched)");
    }

    if (i < list.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log("\nFetch complete. Run 'npm run build-roads' to render SVGs from the cache.");
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
