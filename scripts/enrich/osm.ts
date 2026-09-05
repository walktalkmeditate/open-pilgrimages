import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const CACHE_DIR = join(import.meta.dirname, "../../.cache/enrich");

/**
 * Overpass answers Node's default User-Agent with 406 Not Acceptable, so every
 * script here fetched nothing until this was set. scripts/fetch-roads.ts hits
 * the same endpoint and already identifies itself the same way.
 */
const USER_AGENT =
  "open-pilgrimages-enrich/1.0 (+https://github.com/walktalkmeditate/open-pilgrimages)";

/**
 * The longest server-side budget any query below asks for is [timeout:300],
 * and that bounds only how long Overpass will spend *computing* — not the
 * socket. A connection that stalls before Overpass starts, or on the way
 * back, would otherwise hang the caller forever, and these scripts are run by
 * hand with nothing watching them. Bounded comfortably past the server's own
 * timeout so a slow but genuine answer is never aborted out from under it.
 * scripts/fetch-roads.ts bounds its own requests the same way.
 */
export const CLIENT_TIMEOUT_MS = (300 + 30) * 1000;

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What queryOverpass needs in order to run against something other than the
 * real network and the real project `.cache/enrich/`. Both fields default to
 * the real thing, so calling it with no runtime at all — what every script
 * here does — reproduces today's behaviour exactly.
 */
export interface OverpassRuntime {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

export async function queryOverpass(
  query: string,
  cacheKey: string,
  runtime: OverpassRuntime = {},
): Promise<unknown> {
  const cacheDir = runtime.cacheDir ?? CACHE_DIR;
  const fetchImpl = runtime.fetchImpl ?? fetch;

  mkdirSync(cacheDir, { recursive: true });
  const cachePath = join(cacheDir, `${cacheKey}.json`);

  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, "utf-8"));
      const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
      if (ageMs < CACHE_MAX_AGE_MS) {
        return cached.data;
      }
    } catch { /* stale or corrupt cache, refetch */ }
  }

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
    // 429 is the one status where the server says how long to wait. Nothing
    // here retries — surfacing the header just makes the wait visible to
    // whoever reruns this by hand.
    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      const suggestion = retryAfter ? `, suggested wait: ${retryAfter}s` : "";
      throw new Error(`Overpass API 429: ${response.statusText}${suggestion}`);
    }
    throw new Error(`Overpass API ${response.status}: ${response.statusText}`);
  }

  const data: unknown = await response.json();

  // Overpass reports a soft timeout or a truncated answer in a `remark` field
  // on an otherwise ordinary 200, with `elements` left empty or partial.
  // Thrown before the write, not after: a cached partial answer would be
  // served as the truth for the next seven days, and the caller that asked
  // for it would build a route out of half a relation.
  const remark = (data as { remark?: unknown } | null)?.remark;
  if (typeof remark === "string") {
    throw new Error(`Overpass API reported: ${remark}`);
  }

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
  if (!node.tags) return null;
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
