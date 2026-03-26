# `/enrich` Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code slash command (`/enrich`) that enriches pilgrimage route data with full-resolution OSM geometry, infrastructure waypoints, and statistics.

**Architecture:** A skill markdown file at `.claude/commands/enrich.md` that instructs Claude to run 5 phases (audit, geometry, waypoints, stats, validate). The heavy lifting (Overpass API queries, point-to-line distance filtering, GeoJSON construction) happens in TypeScript utility scripts under `scripts/enrich/`. The skill orchestrates them and handles the stats research phase conversationally.

**Tech Stack:** Claude Code skill (markdown), TypeScript (tsx), Overpass API, WebSearch/WebFetch, existing validate.ts

---

## File Structure

```
.claude/commands/enrich.md          # The skill prompt (orchestrator)
scripts/enrich/audit.ts             # Phase 1: read current data, report gaps
scripts/enrich/geometry.ts          # Phase 2: fetch + build full-res GeoJSON from OSM
scripts/enrich/waypoints.ts         # Phase 3: fetch POIs, filter, assign stages, merge
scripts/enrich/osm.ts               # Shared: Overpass API client with caching
scripts/enrich/geo-utils.ts         # Shared: point-to-line distance, projection, haversine
```

Each script is a standalone CLI (`tsx scripts/enrich/audit.ts camino-frances`) that the skill invokes via Bash. This keeps the skill prompt focused on orchestration and the computational logic testable.

---

### Task 1: Shared Geo Utilities

**Files:**
- Create: `scripts/enrich/geo-utils.ts`

- [ ] **Step 1: Create geo-utils with haversine, point-to-line distance, and projection**

```typescript
// scripts/enrich/geo-utils.ts

type Coord = [number, number] | [number, number, number]; // [lon, lat] or [lon, lat, alt]

export function haversineKm(a: Coord, b: Coord): number {
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinLon * sinLon;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function pointToSegmentDistanceKm(point: Coord, segStart: Coord, segEnd: Coord): number {
  const d1 = haversineKm(point, segStart);
  const d2 = haversineKm(point, segEnd);
  const dSeg = haversineKm(segStart, segEnd);
  if (dSeg < 0.001) return d1;
  const t = Math.max(0, Math.min(1, dotProjection(point, segStart, segEnd, dSeg)));
  const proj: Coord = [
    segStart[0] + t * (segEnd[0] - segStart[0]),
    segStart[1] + t * (segEnd[1] - segStart[1]),
  ];
  return haversineKm(point, proj);
}

function dotProjection(p: Coord, a: Coord, b: Coord, dAB: number): number {
  const dAP = haversineKm(a, p);
  const dBP = haversineKm(b, p);
  return (dAP * dAP + dAB * dAB - dBP * dBP) / (2 * dAB * dAB);
}

export function minDistanceToLineKm(point: Coord, line: Coord[]): number {
  let min = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const d = pointToSegmentDistanceKm(point, line[i], line[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

export function projectOntoLine(point: Coord, line: Coord[]): { segmentIndex: number; kmAlong: number } {
  let bestSeg = 0;
  let bestDist = Infinity;
  let bestT = 0;

  for (let i = 0; i < line.length - 1; i++) {
    const dSeg = haversineKm(line[i], line[i + 1]);
    if (dSeg < 0.001) continue;
    const t = Math.max(0, Math.min(1, dotProjection(point, line[i], line[i + 1], dSeg)));
    const proj: Coord = [
      line[i][0] + t * (line[i + 1][0] - line[i][0]),
      line[i][1] + t * (line[i + 1][1] - line[i][1]),
    ];
    const d = haversineKm(point, proj);
    if (d < bestDist) {
      bestDist = d;
      bestSeg = i;
      bestT = t;
    }
  }

  let kmAlong = 0;
  for (let i = 0; i < bestSeg; i++) {
    kmAlong += haversineKm(line[i], line[i + 1]);
  }
  kmAlong += bestT * haversineKm(line[bestSeg], line[bestSeg + 1]);

  return { segmentIndex: bestSeg, kmAlong };
}

export function findStageIndex(
  kmAlong: number,
  stages: Array<{ start: { coordinates: Coord }; end: { coordinates: Coord }; distanceKm: number }>
): number {
  let cumulative = 0;
  for (let i = 0; i < stages.length; i++) {
    cumulative += stages[i].distanceKm;
    if (kmAlong <= cumulative) return i;
  }
  return stages.length - 1;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add scripts/enrich/geo-utils.ts
git commit -m "feat(enrich): add shared geo utilities — haversine, point-to-line, projection"
```

---

### Task 2: Overpass API Client

**Files:**
- Create: `scripts/enrich/osm.ts`

- [ ] **Step 1: Create OSM client with caching and POI queries**

```typescript
// scripts/enrich/osm.ts

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const CACHE_DIR = join(import.meta.dirname, "../../.cache/enrich");

export async function queryOverpass(query: string, cacheKey: string): Promise<unknown> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = join(CACHE_DIR, `${cacheKey}.json`);

  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, "utf-8"));
      const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
      if (ageMs < 7 * 24 * 60 * 60 * 1000) {
        return cached.data;
      }
    } catch { /* stale or corrupt cache, refetch */ }
  }

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  writeFileSync(cachePath, JSON.stringify({ fetchedAt: new Date().toISOString(), data }, null, 2));
  return data;
}

export function buildPoiQuery(bbox: [number, number, number, number]): string {
  const [west, south, east, north] = bbox;
  const bb = `(${south},${west},${north},${east})`;
  return `[out:json][timeout:120];
(
  node["amenity"="drinking_water"]${bb};
  node["amenity"="pharmacy"]${bb};
  node["amenity"="hospital"]${bb};
  node["amenity"="clinic"]${bb};
  node["tourism"="hostel"]${bb};
  node["tourism"="guest_house"]${bb};
  node["tourism"="hotel"]${bb};
  node["amenity"="restaurant"]${bb};
  node["amenity"="cafe"]${bb};
  node["shop"="convenience"]${bb};
  node["amenity"="toilets"]${bb};
  node["amenity"="vending_machine"]${bb};
  node["highway"="bus_stop"]${bb};
  node["railway"="station"]${bb};
  node["railway"="halt"]${bb};
);
out body;`;
}

export function buildRelationGeomQuery(relationIds: number[]): string {
  const ids = relationIds.join(",");
  return `[out:json][timeout:300];
relation(id:${ids});
out geom;`;
}

export interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

export interface OsmRelation {
  type: "relation";
  id: number;
  tags: Record<string, string>;
  members: Array<{
    type: string;
    ref: number;
    role: string;
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
}

export const OSM_TAG_MAP: Record<string, { type: string; subtype: string }> = {
  "amenity=drinking_water": { type: "water_source", subtype: "fountain" },
  "amenity=pharmacy": { type: "medical", subtype: "pharmacy" },
  "amenity=hospital": { type: "medical", subtype: "hospital" },
  "amenity=clinic": { type: "medical", subtype: "clinic" },
  "tourism=hostel": { type: "accommodation", subtype: "hostel" },
  "tourism=guest_house": { type: "accommodation", subtype: "guesthouse" },
  "tourism=hotel": { type: "accommodation", subtype: "hotel" },
  "amenity=restaurant": { type: "food", subtype: "restaurant" },
  "amenity=cafe": { type: "food", subtype: "cafe" },
  "shop=convenience": { type: "supply", subtype: "convenience_store" },
  "amenity=toilets": { type: "supply", subtype: "toilet" },
  "amenity=vending_machine": { type: "supply", subtype: "vending_machine" },
  "highway=bus_stop": { type: "transport", subtype: "bus_stop" },
  "railway=station": { type: "transport", subtype: "train_station" },
  "railway=halt": { type: "transport", subtype: "train_station" },
};

export function classifyNode(node: OsmNode): { type: string; subtype: string } | null {
  for (const [tagCombo, classification] of Object.entries(OSM_TAG_MAP)) {
    const [key, value] = tagCombo.split("=");
    if (node.tags[key] === value) return classification;
  }
  return null;
}

export function extractName(tags: Record<string, string>): string {
  return tags["name:en"] || tags["name"] || tags["name:ja"] || tags["name:es"] || "Unnamed";
}

export function extractNameLocalized(tags: Record<string, string>): Record<string, string> | undefined {
  const localized: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    const match = key.match(/^name:(\w+)$/);
    if (match && match[1] !== "en") {
      localized[match[1]] = value;
    }
  }
  return Object.keys(localized).length > 0 ? localized : undefined;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add scripts/enrich/osm.ts
git commit -m "feat(enrich): add Overpass API client with caching and tag mapping"
```

---

### Task 3: Audit Script

**Files:**
- Create: `scripts/enrich/audit.ts`

- [ ] **Step 1: Create audit script**

```typescript
// scripts/enrich/audit.ts

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "../..");

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function main() {
  const routeId = process.argv[2];
  if (!routeId) {
    console.error("Usage: tsx scripts/enrich/audit.ts <route-id>");
    process.exit(1);
  }

  const routeDir = join(ROOT, "routes", routeId);
  if (!existsSync(join(routeDir, "metadata.json"))) {
    console.error(`Route not found: ${routeId}`);
    process.exit(1);
  }

  const meta = loadJson(join(routeDir, "metadata.json"));
  const stages = existsSync(join(routeDir, "stages.json"))
    ? loadJson(join(routeDir, "stages.json"))
    : null;
  const wp = existsSync(join(routeDir, "waypoints.geojson"))
    ? loadJson(join(routeDir, "waypoints.geojson"))
    : null;
  const route = existsSync(join(routeDir, "route.geojson"))
    ? loadJson(join(routeDir, "route.geojson"))
    : null;
  const hasStats = existsSync(join(routeDir, "stats.json"));

  console.log(`\nAudit: ${meta.name.en} (${routeId})`);
  console.log("=".repeat(50));

  // Route geometry
  const coordCount = route?.features?.reduce(
    (sum: number, f: { geometry: { coordinates: unknown[] } }) =>
      sum + (f.geometry?.coordinates?.length ?? 0), 0) ?? 0;
  const geoStatus = coordCount > 100 ? "full-resolution" : "simplified";
  console.log(`\nGeometry: ${coordCount} points (${geoStatus})`);

  // Stages
  console.log(`Stages: ${stages?.stages?.length ?? 0}`);

  // Waypoints by type
  const typeCounts: Record<string, number> = {};
  let osmCount = 0;
  let curatedCount = 0;
  for (const f of wp?.features ?? []) {
    const t = f.properties.type;
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
    if (f.properties.source === "osm") osmCount++;
    else curatedCount++;
  }
  console.log(`\nWaypoints: ${wp?.features?.length ?? 0} total (${curatedCount} curated, ${osmCount} OSM)`);
  for (const [type, count] of Object.entries(typeCounts).sort()) {
    console.log(`  ${type}: ${count}`);
  }

  // Gaps
  const allTypes = ["water_source", "medical", "accommodation", "food", "supply", "transport",
                    "town", "sacred_site", "credential_stamp", "viewpoint", "cultural_site"];
  const missing = allTypes.filter(t => !typeCounts[t]);
  if (missing.length > 0) {
    console.log(`\nMissing waypoint types: ${missing.join(", ")}`);
  }

  // Stats
  console.log(`\nStats: ${hasStats ? "exists" : "NOT FOUND"}`);

  // OSM config
  const osmConfig = meta.osm;
  if (osmConfig) {
    console.log(`OSM relations: ${osmConfig.relations?.length ?? 0} configured`);
  } else {
    console.log("OSM relations: NOT CONFIGURED in metadata.json");
  }

  // Bbox
  console.log(`Bbox: ${meta.overview?.bbox ?? "NOT SET"}`);
}

main();
```

- [ ] **Step 2: Test it**

Run: `npx tsx scripts/enrich/audit.ts camino-frances`
Expected: Output showing 53 waypoints, simplified geometry, no stats, gaps in water/medical/food/etc.

- [ ] **Step 3: Commit**

```bash
git add scripts/enrich/audit.ts
git commit -m "feat(enrich): add audit script — reports data gaps per route"
```

---

### Task 4: Geometry Script

**Files:**
- Create: `scripts/enrich/geometry.ts`

- [ ] **Step 1: Create geometry fetch and GeoJSON builder**

```typescript
// scripts/enrich/geometry.ts

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { queryOverpass, buildRelationGeomQuery, type OsmRelation } from "./osm.js";

const ROOT = join(import.meta.dirname, "../..");

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function extractLineCoords(relation: OsmRelation): Array<[number, number]> {
  const coords: Array<[number, number]> = [];
  for (const member of relation.members) {
    if (member.type === "way" && member.geometry && member.role !== "alternative") {
      for (const point of member.geometry) {
        coords.push([point.lon, point.lat]);
      }
    }
  }
  return coords;
}

async function main() {
  const routeId = process.argv[2];
  if (!routeId) {
    console.error("Usage: tsx scripts/enrich/geometry.ts <route-id>");
    process.exit(1);
  }

  const routeDir = join(ROOT, "routes", routeId);
  const meta = loadJson(join(routeDir, "metadata.json"));
  const routePath = join(routeDir, "route.geojson");
  const existing = existsSync(routePath) ? loadJson(routePath) : null;
  const oldCount = existing?.features?.[0]?.geometry?.coordinates?.length ?? 0;

  const osmConfig = meta.osm;
  if (!osmConfig?.relations?.length) {
    console.error(`No OSM relations configured in metadata.json for ${routeId}`);
    process.exit(1);
  }

  console.log(`Fetching geometry for ${routeId} (${osmConfig.relations.length} relations)...`);
  const query = buildRelationGeomQuery(osmConfig.relations);
  const data = await queryOverpass(query, `geom-${routeId}`) as { elements: OsmRelation[] };

  const relations = data.elements.filter((e): e is OsmRelation => e.type === "relation");
  console.log(`Received ${relations.length} relations`);

  const isNetwork = meta.overview?.topology === "network";
  const features: object[] = [];

  if (isNetwork) {
    for (const rel of relations) {
      const coords = extractLineCoords(rel);
      const name = rel.tags["name:en"] || rel.tags["name"] || `Segment ${rel.id}`;
      const segment = rel.tags["name:en"]?.toLowerCase().replace(/\s+/g, "-") || `segment-${rel.id}`;
      features.push({
        type: "Feature",
        id: `${routeId}-${segment}`,
        geometry: { type: "LineString", coordinates: coords },
        properties: {
          routeId,
          name,
          type: "main",
          segment,
          source: `OpenStreetMap (relation ${rel.id}, fetched ${new Date().toISOString().split("T")[0]})`,
        },
      });
    }
  } else {
    const allCoords: Array<[number, number]> = [];
    for (const rel of relations) {
      allCoords.push(...extractLineCoords(rel));
    }
    features.push({
      type: "Feature",
      id: `${routeId}-main`,
      geometry: { type: "LineString", coordinates: allCoords },
      properties: {
        routeId,
        name: meta.name.en,
        type: "main",
        source: `OpenStreetMap (${relations.length} relations, fetched ${new Date().toISOString().split("T")[0]})`,
      },
    });
  }

  const geojson = { type: "FeatureCollection", features };
  writeFileSync(routePath, JSON.stringify(geojson, null, 2) + "\n");

  const newCount = features.reduce(
    (sum, f: any) => sum + (f.geometry?.coordinates?.length ?? 0), 0);
  console.log(`Wrote route.geojson: ${oldCount} → ${newCount} points`);
}

main();
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add scripts/enrich/geometry.ts
git commit -m "feat(enrich): add geometry script — fetches full-res route from OSM"
```

---

### Task 5: Waypoints Script

**Files:**
- Create: `scripts/enrich/waypoints.ts`

- [ ] **Step 1: Create waypoint enrichment script**

```typescript
// scripts/enrich/waypoints.ts

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  queryOverpass, buildPoiQuery, classifyNode, extractName,
  extractNameLocalized, type OsmNode,
} from "./osm.js";
import { minDistanceToLineKm, projectOntoLine, type Coord } from "./geo-utils.js";

const ROOT = join(import.meta.dirname, "../..");
const BUFFER_KM = 0.5;
const DEDUP_KM = 0.05;

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function getRouteCoords(routeDir: string): Coord[] {
  const route = loadJson(join(routeDir, "route.geojson"));
  const feature = route.features[0];
  return feature.geometry.coordinates as Coord[];
}

function getStageRanges(routeDir: string): Array<{ cumulativeKm: number }> {
  const stages = loadJson(join(routeDir, "stages.json"));
  const ranges: Array<{ cumulativeKm: number }> = [];
  let cumulative = 0;
  for (const s of stages.stages) {
    cumulative += s.distanceKm;
    ranges.push({ cumulativeKm: cumulative });
  }
  return ranges;
}

function findStageIndex(kmAlong: number, ranges: Array<{ cumulativeKm: number }>): number {
  for (let i = 0; i < ranges.length; i++) {
    if (kmAlong <= ranges[i].cumulativeKm) return i;
  }
  return ranges.length - 1;
}

async function main() {
  const routeId = process.argv[2];
  if (!routeId) {
    console.error("Usage: tsx scripts/enrich/waypoints.ts <route-id>");
    process.exit(1);
  }

  const routeDir = join(ROOT, "routes", routeId);
  const meta = loadJson(join(routeDir, "metadata.json"));
  const wpPath = join(routeDir, "waypoints.geojson");
  const existing = existsSync(wpPath) ? loadJson(wpPath) : { type: "FeatureCollection", features: [] };

  const routeCoords = getRouteCoords(routeDir);
  const stageRanges = getStageRanges(routeDir);
  const bbox = meta.overview.bbox as [number, number, number, number];

  // Separate curated vs OSM waypoints
  const curated = existing.features.filter((f: any) => f.properties.source !== "osm");
  const curatedCoords = curated.map((f: any) => f.geometry.coordinates as Coord);

  console.log(`Fetching POIs for ${routeId} within bbox ${bbox}...`);
  const query = buildPoiQuery(bbox);
  const data = await queryOverpass(query, `pois-${routeId}`) as { elements: OsmNode[] };
  const nodes = data.elements.filter((e): e is OsmNode => e.type === "node");
  console.log(`Received ${nodes.length} POIs from OSM`);

  // Filter, classify, enrich
  const added: Record<string, number> = {};
  let skippedDistance = 0;
  let skippedDedup = 0;
  const newWaypoints: object[] = [];

  for (const node of nodes) {
    const classification = classifyNode(node);
    if (!classification) continue;

    const coord: Coord = [node.lon, node.lat];
    const dist = minDistanceToLineKm(coord, routeCoords);

    if (dist > BUFFER_KM) {
      skippedDistance++;
      continue;
    }

    // Dedup against curated waypoints
    const tooClose = curatedCoords.some(c => {
      const d = Math.sqrt((c[0] - coord[0]) ** 2 + (c[1] - coord[1]) ** 2) * 111;
      return d < DEDUP_KM * 2;
    });
    if (tooClose) {
      skippedDedup++;
      continue;
    }

    const { kmAlong } = projectOntoLine(coord, routeCoords);
    const stageIndex = findStageIndex(kmAlong, stageRanges);
    const name = extractName(node.tags);
    const nameLocalized = extractNameLocalized(node.tags);

    const feature: Record<string, unknown> = {
      type: "Feature",
      id: `wp-osm-${classification.type}-node${node.id}`,
      geometry: { type: "Point", coordinates: coord },
      properties: {
        routeId,
        name,
        ...(nameLocalized && { nameLocalized }),
        type: classification.type,
        subtype: classification.subtype,
        stageIndex,
        kmFromStart: Math.round(kmAlong * 10) / 10,
        icon: classification.subtype,
        source: "osm",
        osmId: `node/${node.id}`,
        ...(node.tags.ele && { elevation: parseFloat(node.tags.ele) }),
        ...(node.tags.opening_hours && { hours: node.tags.opening_hours }),
      },
    };

    newWaypoints.push(feature);
    added[classification.type] = (added[classification.type] ?? 0) + 1;
  }

  // Merge: curated first, then OSM sorted by kmFromStart
  newWaypoints.sort((a: any, b: any) =>
    (a.properties.kmFromStart ?? 0) - (b.properties.kmFromStart ?? 0));
  const allWaypoints = [...curated, ...newWaypoints];
  allWaypoints.sort((a: any, b: any) =>
    (a.properties.kmFromStart ?? 0) - (b.properties.kmFromStart ?? 0));

  writeFileSync(wpPath, JSON.stringify({ type: "FeatureCollection", features: allWaypoints }, null, 2) + "\n");

  console.log(`\nResults:`);
  console.log(`  Curated waypoints preserved: ${curated.length}`);
  console.log(`  OSM waypoints added: ${newWaypoints.length}`);
  for (const [type, count] of Object.entries(added).sort()) {
    console.log(`    ${type}: ${count}`);
  }
  console.log(`  Skipped (>500m from route): ${skippedDistance}`);
  console.log(`  Skipped (duplicate <50m): ${skippedDedup}`);
  console.log(`  Total waypoints: ${allWaypoints.length}`);
}

main();
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add scripts/enrich/waypoints.ts
git commit -m "feat(enrich): add waypoint enrichment — fetch, filter, assign stages, merge"
```

---

### Task 6: Add OSM Config to Metadata Files

**Files:**
- Modify: `routes/camino-frances/metadata.json`
- Modify: `routes/shikoku-88/metadata.json`
- Modify: `routes/kumano-kodo/metadata.json`

- [ ] **Step 1: Add `osm` field to each metadata.json**

Camino Frances — add after the `"bbox"` field inside `"overview"`:
```json
"osm": {
  "relations": [2163569, 2163558, 2163560, 2163561, 2163565, 2163559],
  "superroute": 2163573
}
```

Shikoku 88 — the 88 segment relations are fetched by tag query, not ID list:
```json
"osm": {
  "query": "[out:json][timeout:300];relation[\"name\"~\"四国遍路\"][\"type\"=\"route\"](32,132,35,135);out geom;"
}
```

Kumano Kodo — fetched by tag query:
```json
"osm": {
  "query": "[out:json][timeout:120];relation[\"name\"~\"熊野古道\"][\"type\"=\"route\"];out geom;"
}
```

- [ ] **Step 2: Update geometry.ts to handle query-based config**

In `scripts/enrich/geometry.ts`, update the relation fetching logic to check for `osmConfig.query` as an alternative to `osmConfig.relations`:

```typescript
let query: string;
if (osmConfig.relations) {
  query = buildRelationGeomQuery(osmConfig.relations);
} else if (osmConfig.query) {
  query = osmConfig.query;
} else {
  console.error(`No OSM config in metadata.json for ${routeId}`);
  process.exit(1);
}
```

- [ ] **Step 3: Validate and commit**

Run: `npm run validate`
Expected: All routes pass

```bash
git add routes/*/metadata.json scripts/enrich/geometry.ts
git commit -m "feat(enrich): add OSM relation config to route metadata"
```

---

### Task 7: The Skill File

**Files:**
- Create: `.claude/commands/enrich.md`

- [ ] **Step 1: Create the skill markdown**

```markdown
---
name: enrich
description: Enrich a pilgrimage route with full-resolution OSM geometry, infrastructure waypoints, and statistics. Usage: /enrich <route-id> [--skip-geometry] [--skip-waypoints] [--skip-stats] [--only-geometry] [--only-waypoints] [--only-stats]
---

You are enriching pilgrimage route data for the Open Pilgrimages dataset.

## Arguments

The first argument is a route ID (e.g., `camino-frances`, `shikoku-88`, `kumano-kodo`).
Optional flags: `--skip-geometry`, `--skip-waypoints`, `--skip-stats`, `--only-geometry`, `--only-waypoints`, `--only-stats`.

Parse the arguments from `$ARGUMENTS`.

## Phase 1: Audit

Run the audit script and report the results:
```bash
npx tsx scripts/enrich/audit.ts {routeId}
```

Show the output to the user and summarize the gaps.

## Phase 2: Geometry (skip if `--skip-geometry` or `--only-waypoints` or `--only-stats`)

Fetch full-resolution route geometry from OSM:
```bash
npx tsx scripts/enrich/geometry.ts {routeId}
```

Report the before/after point counts.

## Phase 3: Waypoints (skip if `--skip-waypoints` or `--only-geometry` or `--only-stats`)

Fetch and merge OSM infrastructure waypoints:
```bash
npx tsx scripts/enrich/waypoints.ts {routeId}
```

Report what was added by type, what was skipped, and the new total.

## Phase 4: Stats (skip if `--skip-stats` or `--only-geometry` or `--only-waypoints`)

Research current pilgrimage statistics for this route. Use WebSearch and WebFetch to find the latest data from official sources.

**For each route, look for:**
- Annual pilgrim/visitor counts (latest year + historical trend)
- Demographics (top nationalities, gender split, age groups)
- Seasonal distribution (monthly breakdown if available)
- Mode of travel (foot, bicycle, bus, etc.)
- Starting points (where pilgrims begin)
- Motivation (religious, spiritual, cultural)

**Data sources:**
- Camino Frances: Oficina del Peregrino (oficinadelperegrino.com/en/statistics/)
- Shikoku 88: Maeyama Ohenro Salon, prefecture tourism bureaus, shikoku-tourism.com
- Kumano Kodo: Tanabe City Kumano Tourism Bureau (tb-kumano.jp), Wakayama Prefecture tourism stats

Write the results to `routes/{routeId}/stats.json` using this structure:
```json
{
  "schemaVersion": "1.0.0",
  "routeId": "{routeId}",
  "lastUpdated": "{today's date}",
  "dataYear": {latest year with data},
  "annualPilgrims": { "latest": { "year": N, "count": N }, "trend": [...], "source": "url" },
  "demographics": { ... },
  "seasonalDistribution": [...],
  "modeOfTravel": [...],
  "startingPoints": [...],
  "sources": [{ "name": "...", "url": "...", "accessDate": "..." }]
}
```

Fields are nullable — include only what you can verify from official sources.
Every data point must include its source URL.

## Phase 5: Validate

Run validation:
```bash
npm run validate
```

If validation passes, summarize all changes and ask the user if they want to commit.
If validation fails, report the errors and do not commit.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/enrich.md
git commit -m "feat: add /enrich slash command for route data enrichment"
```

---

### Task 8: Integration Test

- [ ] **Step 1: Run audit on all three routes**

```bash
npx tsx scripts/enrich/audit.ts camino-frances
npx tsx scripts/enrich/audit.ts shikoku-88
npx tsx scripts/enrich/audit.ts kumano-kodo
```

Expected: Each route shows its current waypoint counts, identifies missing types, and notes the simplified geometry status.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: Zero errors

- [ ] **Step 3: Verify existing validation still passes**

```bash
npm run validate
```

Expected: All 5 routes pass, 0 warnings

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(enrich): complete /enrich skill — audit, geometry, waypoints, stats"
git push
```

---

Plan complete and saved to `docs/superpowers/plans/2026-03-26-enrich-skill.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?