/**
 * One-off, no-network repair for the fault fixed in enrich/waypoints.ts: dedup
 * measured a curated point stored at three decimals against its full-precision
 * OSM twin at a flat 50 m, which it could never be, so the gate never fired and
 * thirty twins shipped as two pins standing on one place. Every coordinate this
 * needs is already committed, so it reads no network.
 *
 *   npx tsx scripts/migrate-twin-waypoints.ts routes/shikoku-88-awa/waypoints.geojson
 */
import { readFileSync, writeFileSync } from "node:fs";
import { isSamePlace } from "./enrich/waypoints.js";
import { haversineMeters } from "./ways/geo.js";

export interface TwinMerge {
  kept: string;
  dropped: string;
  meters: number;
}

/**
 * A twin is one place recorded twice, so only a feature of the same type can be
 * one. Distance alone is not enough to say so at this tolerance: the
 * convenience store beside Temple 13 sits 60 m out, inside the same rounding
 * error as the temple's own OSM node, and a rule that went on distance alone
 * would fold the shop's osmId into the temple and then delete the shop. The
 * enricher's own dedup is type-blind because it is choosing what to *admit*;
 * this is choosing what to *merge*, and the two are not the same question.
 */
function twinOf(osmFeature: any, curated: any[]): { feature: any; meters: number } | undefined {
  const [lon, lat] = osmFeature.geometry.coordinates;
  let best: { feature: any; meters: number } | undefined;
  for (const candidate of curated) {
    if (candidate.properties?.type !== osmFeature.properties?.type) continue;
    const [clon, clat] = candidate.geometry.coordinates;
    if (!isSamePlace({ lon: clon, lat: clat }, { lon, lat })) continue;
    const meters = haversineMeters([clon, clat], [lon, lat]);
    // Nearest wins, because one OSM node can fall inside two curated temples'
    // tolerances: Kannon-ji's node sits 68 m from temple-69 and 77 m from
    // temple-68, and only the first of those is the place it records.
    if (!best || meters < best.meters) best = { feature: candidate, meters };
  }
  return best;
}

/**
 * Keeps the curated feature, carries the OSM twin's `osmId` and any localized
 * names the curated one lacks across to it, and drops the twin. Mutates the
 * collection; returns one record per merge.
 */
export function mergeTwins(collection: any): TwinMerge[] {
  const features: any[] = collection.features ?? [];
  const curated = features.filter((f) => f.properties?.source !== "osm");
  const merges: TwinMerge[] = [];
  const dropped = new Set<any>();

  for (const feature of features) {
    if (feature.properties?.source !== "osm") continue;
    const twin = twinOf(feature, curated);
    if (!twin) continue;

    const keep = twin.feature.properties;
    if (!keep.osmId && feature.properties.osmId) keep.osmId = feature.properties.osmId;
    const incoming = feature.properties.nameLocalized;
    if (incoming) {
      const localized = keep.nameLocalized ?? {};
      for (const [language, value] of Object.entries(incoming)) {
        if (!localized[language]) localized[language] = value;
      }
      keep.nameLocalized = localized;
    }

    dropped.add(feature);
    merges.push({
      kept: twin.feature.id ?? keep.name ?? "(no id)",
      dropped: feature.properties.osmId ?? feature.id ?? "(no id)",
      meters: twin.meters,
    });
  }

  collection.features = features.filter((f) => !dropped.has(f));
  return merges;
}

if (process.argv[2]) {
  const path = process.argv[2];
  const raw = readFileSync(path, "utf8");
  const collection = JSON.parse(raw);
  // A file that does not come back byte-identical from a re-serialisation would
  // carry changes this migration never made into the same diff, where nobody
  // can see past them to the merges.
  if (`${JSON.stringify(collection, null, 2)}\n` !== raw) {
    throw new Error(`${path}: does not round-trip byte-identically — refusing to rewrite it.`);
  }
  const merges = mergeTwins(collection);
  for (const merge of merges) {
    console.log(`kept ${merge.kept}, dropped ${merge.dropped} (${Math.round(merge.meters)} m)`);
  }
  writeFileSync(path, `${JSON.stringify(collection, null, 2)}\n`);
  console.log(`${path}: ${merges.length} twins merged`);
}
