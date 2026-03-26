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
