import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");
const CACHE_DIR = join(ROOT, ".cache", "osm");
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

interface RouteConfig {
  id: string;
  query: string;
  description: string;
}

const ROUTES: RouteConfig[] = [
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
    id: "kumano-kodo",
    description: "Kumano Kodo — Nakahechi and sub-routes",
    query: `[out:json][timeout:120];
relation["name"~"熊野古道"]["type"="route"];
out geom;`,
  },
];

async function fetchOverpass(query: string): Promise<unknown> {
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API returned ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

function getCachePath(routeId: string): string {
  return join(CACHE_DIR, `${routeId}.json`);
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

async function fetchRoute(config: RouteConfig, force: boolean): Promise<void> {
  const cachePath = getCachePath(config.id);
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

  if (!force && isCacheFresh(cachePath, maxAge)) {
    console.log(`  ↳ Using cached data (< 7 days old)`);
    return;
  }

  console.log(`  ↳ Fetching from Overpass API...`);
  const data = await fetchOverpass(config.query);

  const cached = {
    fetchedAt: new Date().toISOString(),
    routeId: config.id,
    query: config.query,
    data,
  };

  writeFileSync(cachePath, JSON.stringify(cached, null, 2));
  console.log(`  ↳ Cached to ${cachePath}`);
}

async function main() {
  const force = process.argv.includes("--force");

  mkdirSync(CACHE_DIR, { recursive: true });

  console.log("Fetching route data from OpenStreetMap\n");

  for (const route of ROUTES) {
    console.log(`${route.id}: ${route.description}`);
    try {
      await fetchRoute(route, force);
    } catch (err) {
      console.error(`  ✗ Failed: ${err instanceof Error ? err.message : err}`);
      console.error(`  ↳ Skipping (cached data may still be available)`);
    }
  }

  console.log("\nFetch complete. Run 'npm run validate' to check data.");
}

main();
