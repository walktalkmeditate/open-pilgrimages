import { readFileSync, existsSync, readdirSync, statSync, realpathSync } from "fs";
import { join } from "path";
import { segmentsOf } from "./site/glyphs.js";

const ROOT = join(import.meta.dirname, "..");

function loadJson(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function byCodepoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

interface MetadataLike {
  id?: string;
  name?: { en?: string };
  overview?: {
    topology?: string;
    distanceKm?: number;
    countries?: string[];
    estimatedDays?: { typical?: number };
  };
  tradition?: { type?: string };
}

interface StageLike {
  distanceKm?: number;
  interior?: unknown;
}

interface StagesLike {
  stages?: StageLike[];
}

interface WaypointsLike {
  features?: unknown[];
}

export interface RouteStats {
  id: string;
  name: string;
  topology: string;
  tradition: string;
  distanceKm: number;
  estimatedDaysTypical: number;
  stageSumKm: number;
  stages: number;
  waypoints: number;
  routePoints: number;
  countries: string[];
  interiorDone: number;
  interiorTotal: number;
  variants: string[];
}

export interface DatasetStats {
  routes: RouteStats[];
  totals: {
    routes: number;
    stages: number;
    waypoints: number;
    routePoints: number;
    distanceKm: number;
  };
}

function scanVariants(routeDir: string): string[] {
  const variantsDir = join(routeDir, "variants");
  if (!existsSync(variantsDir) || !statSync(variantsDir).isDirectory()) {
    return [];
  }

  return readdirSync(variantsDir)
    .filter((v) => existsSync(join(variantsDir, v, "metadata.json")))
    .sort(byCodepoint);
}

function readRoute(routeDir: string, entry: string): RouteStats | null {
  const meta = loadJson(join(routeDir, "metadata.json")) as MetadataLike | null;
  if (meta === null) return null;

  const stagesData = loadJson(join(routeDir, "stages.json")) as StagesLike | null;
  const waypointsData = loadJson(join(routeDir, "waypoints.geojson")) as WaypointsLike | null;
  const routeData = loadJson(join(routeDir, "route.geojson"));

  // Shape-check rather than just nullish-check: these files are schema-validated
  // upstream, but a malformed one should degrade to an empty list rather than
  // throw several calls deeper. One Array.isArray per level is the bound here.
  const stagesList = Array.isArray(stagesData?.stages) ? stagesData.stages : [];
  const waypointsList = Array.isArray(waypointsData?.features) ? waypointsData.features : [];
  const countries = Array.isArray(meta.overview?.countries) ? meta.overview.countries : [];

  // Use segmentsOf rather than summing feature.geometry.coordinates.length: that
  // naive count is correct for LineString but silently undercounts MultiLineString
  // (it counts line segments, not points) — segmentsOf flattens both correctly.
  const routePoints = segmentsOf(routeData).reduce((sum, segment) => sum + segment.length, 0);

  const stageDistSum = stagesList.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);
  const interiorDone = stagesList.filter((s) => s.interior).length;

  return {
    id: meta.id ?? entry,
    name: meta.name?.en ?? "",
    topology: meta.overview?.topology ?? "",
    tradition: meta.tradition?.type ?? "",
    distanceKm: meta.overview?.distanceKm ?? 0,
    estimatedDaysTypical: meta.overview?.estimatedDays?.typical ?? 0,
    stageSumKm: Math.round(stageDistSum * 10) / 10,
    stages: stagesList.length,
    waypoints: waypointsList.length,
    routePoints,
    countries,
    interiorDone,
    interiorTotal: stagesList.length,
    variants: scanVariants(routeDir),
  };
}

export function computeStats(root: string): DatasetStats {
  const routesDir = join(root, "routes");
  const routes: RouteStats[] = [];

  for (const entry of readdirSync(routesDir).sort(byCodepoint)) {
    const routeDir = join(routesDir, entry);
    if (!statSync(routeDir).isDirectory()) continue;

    const route = readRoute(routeDir, entry);
    if (route !== null) routes.push(route);
  }

  const totals = routes.reduce(
    (acc, r) => ({
      routes: acc.routes + 1,
      stages: acc.stages + r.stages,
      waypoints: acc.waypoints + r.waypoints,
      routePoints: acc.routePoints + r.routePoints,
      distanceKm: acc.distanceKm + r.distanceKm,
    }),
    { routes: 0, stages: 0, waypoints: 0, routePoints: 0, distanceKm: 0 },
  );

  return { routes, totals };
}

function printRoute(route: RouteStats): void {
  console.log(`\n${route.name}`);
  console.log("-".repeat(40));
  console.log(`  Route ID:     ${route.id}`);
  console.log(`  Topology:     ${route.topology}`);
  console.log(`  Tradition:    ${route.tradition}`);
  console.log(`  Distance:     ${route.distanceKm} km (metadata)`);
  console.log(`  Stage sum:    ${route.stageSumKm.toFixed(1)} km`);
  console.log(`  Stages:       ${route.stages}`);
  console.log(`  Waypoints:    ${route.waypoints}`);
  console.log(`  Route points: ${route.routePoints}`);
  console.log(`  Countries:    ${route.countries.length > 0 ? route.countries.join(", ") : "?"}`);

  if (route.interiorTotal > 0) {
    console.log(
      `  Interior:     ${route.interiorDone}/${route.interiorTotal} stages have interior journey content`,
    );
  }

  if (route.variants.length > 0) {
    console.log(`  Variants:     ${route.variants.join(", ")}`);
  }
}

function main(): void {
  const stats = computeStats(ROOT);

  console.log("Open Pilgrimages — Dataset Statistics\n");
  console.log("=".repeat(60));

  for (const route of stats.routes) {
    printRoute(route);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`\nTotals:`);
  console.log(`  Routes:       ${stats.totals.routes}`);
  console.log(`  Stages:       ${stats.totals.stages}`);
  console.log(`  Waypoints:    ${stats.totals.waypoints}`);
  console.log(`  Distance:     ${stats.totals.distanceKm.toLocaleString()} km`);
}

export function resolveInvokedPath(argv1: string | undefined): string | null {
  if (!argv1) return null;
  try {
    return realpathSync(argv1);
  } catch {
    return null;
  }
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
