import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { resolveInvokedPath } from "./cli.js";

const ROOT = join(import.meta.dirname, "..");
const CACHE_DIR = join(ROOT, ".cache", "osm");
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/**
 * Overpass answers Node's default User-Agent with 406 Not Acceptable, so
 * every route below fetched nothing until this was set. Deliberately the same
 * string scripts/enrich/osm.ts already sends rather than a fourth identity for
 * the same project against the same endpoint — it is also what the Shikoku
 * cache behind the 1.9.0 plan's Task 1 was fetched under, so this script now
 * reproduces that fetch rather than merely resembling it.
 */
const USER_AGENT =
  "open-pilgrimages-enrich/1.0 (+https://github.com/walktalkmeditate/open-pilgrimages)";

export interface RouteConfig {
  id: string;
  query: string;
  description: string;
}

export const ROUTES: RouteConfig[] = [
  {
    id: "camino-frances",
    description: "Camino de Santiago (Frances) — OSM superroute 2163573",
    query: `[out:json][timeout:300];
relation(id:2163569,2163558,2163560,2163561,2163565,2163559);
out geom;`,
  },
  {
    id: "shikoku-88",
    description: "Shikoku 88 Temple Pilgrimage — 88 segment relations",
    query: `[out:json][timeout:300];
relation["name"~"四国遍路"]["type"="route"](32,132,35,135);
out geom;`,
  },
  {
    id: "kumano-kodo-nakahechi",
    description: "Kumano Kodo — Nakahechi and sub-routes",
    query: `[out:json][timeout:120];
relation["name"~"熊野古道"]["type"="route"];
out geom;`,
  },
  {
    id: "camino-portugues",
    description: "Camino Portugués (Central) — OSM relation 12786090, trimmed to start at Porto",
    query: `[out:json][timeout:300];
relation(id:12786090);
out geom;`,
  },
  {
    id: "camino-ingles",
    description: "Camino Inglés (English Way) — OSM relation 1102966 (Ferrol → Santiago)",
    query: `[out:json][timeout:300];
relation(id:1102966);
out geom;`,
  },
  {
    id: "camino-primitivo",
    description: "Camino Primitivo (Original Way) — 11 sub-relations of superroute 19298101 (Oviedo → Melide)",
    query: `[out:json][timeout:300];
relation(id:2163938,19586861,19586860,19586862,19586859,19586857,19586856,19586855,19586854,19586853,10526092);
out geom;`,
  },
  {
    id: "camino-norte",
    description: "Camino del Norte (Northern Way) — 4 sub-relations of superroute 19001007 (Irún → Arzúa)",
    query: `[out:json][timeout:300];
relation(id:1116809,360167,2201058,1554697);
out geom;`,
  },
];

/**
 * What the sweep needs in order to run against something other than the real
 * network and the real project `.cache/osm/`. Both fields default to the real
 * thing, so calling any of these with no runtime — what main() does —
 * reproduces the behaviour of a hand-run `npm run fetch` exactly. Tests supply
 * a temp `cacheDir` (so no test can overwrite a real route's cache, which is
 * gitignored and expensive to re-obtain) and a fake `fetchImpl` (so a failure
 * path can be proved without a request reaching a shared free API).
 */
export interface FetchOsmRuntime {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

export async function fetchOverpass(query: string, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const response = await fetchImpl(OVERPASS_URL, {
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

  return response.json();
}

function isCacheFresh(path: string, maxAgeMs: number): boolean {
  if (!existsSync(path)) return false;
  try {
    const content = JSON.parse(readFileSync(path, "utf-8"));
    const age = Date.now() - new Date(content.fetchedAt).getTime();
    return age < maxAgeMs;
  } catch {
    return false;
  }
}

export async function fetchRoute(
  config: RouteConfig,
  force: boolean,
  runtime: FetchOsmRuntime = {},
): Promise<void> {
  const cacheDir = runtime.cacheDir ?? CACHE_DIR;
  const cachePath = join(cacheDir, `${config.id}.json`);
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

  if (!force && isCacheFresh(cachePath, maxAge)) {
    console.log(`  ↳ Using cached data (< 7 days old)`);
    return;
  }

  console.log(`  ↳ Fetching from Overpass API...`);
  const data = await fetchOverpass(config.query, runtime.fetchImpl ?? fetch);

  const cached = {
    fetchedAt: new Date().toISOString(),
    routeId: config.id,
    query: config.query,
    data,
  };

  writeFileSync(cachePath, JSON.stringify(cached, null, 2));
  console.log(`  ↳ Cached to ${cachePath}`);
}

/**
 * Returns the ids that failed, in sweep order. One route's failure does not
 * abort the other six: they are independent queries, and a route that fails
 * still has whatever cache it had before, which is why the sweep continues
 * past it. What it must not do is disappear — the ids come back so main() can
 * fail the process on them.
 */
export async function runFetchOsm(
  routes: RouteConfig[],
  force: boolean,
  runtime: FetchOsmRuntime = {},
): Promise<string[]> {
  const failed: string[] = [];

  for (const route of routes) {
    console.log(`${route.id}: ${route.description}`);
    try {
      await fetchRoute(route, force, runtime);
    } catch (err) {
      console.error(`  ✗ Failed: ${err instanceof Error ? err.message : err}`);
      console.error(`  ↳ Continuing (cached data may still be available)`);
      failed.push(route.id);
    }
  }

  return failed;
}

export async function main(runtime: FetchOsmRuntime = {}): Promise<void> {
  const force = process.argv.includes("--force");
  const cacheDir = runtime.cacheDir ?? CACHE_DIR;

  mkdirSync(cacheDir, { recursive: true });

  console.log("Fetching route data from OpenStreetMap\n");

  const failed = await runFetchOsm(ROUTES, force, runtime);

  if (failed.length > 0) {
    // This script exited 0 on every failure until now, so a sweep that
    // reached Overpass for nothing — which is what a missing User-Agent
    // produced, seven times over — was indistinguishable from one that
    // worked. `npm run pipeline` runs this first and chains on &&, so a
    // silent success handed months-old cache to build-ways as if it were the
    // fetch that had just been asked for.
    console.error(
      `\nFetch failed for ${failed.length} of ${ROUTES.length} route(s): ${failed.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("\nFetch complete. Run 'npm run validate' to check data.");
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
