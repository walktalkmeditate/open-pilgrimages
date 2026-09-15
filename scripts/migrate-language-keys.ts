/**
 * One-off, no-network repair for the other half of the fault fixed in
 * enrich/osm.ts: the old key pattern read `name:(\w+)`, which admitted `ja_rm`
 * and `signed` as if they were languages. The committed waypoints predate the
 * narrowed pattern and still carry them, and they are not inert — the
 * notability rule draws an OSM shrine that was named in a language beyond the
 * local one, so one Awa shrine is on the map today for a romanisation. Leaving
 * it would leave the dataset disagreeing with its own rule.
 *
 *   npx tsx scripts/migrate-language-keys.ts routes/shikoku-88-awa/waypoints.geojson
 */
import { readFileSync, writeFileSync } from "node:fs";
import { isLanguageKey } from "./enrich/osm.js";

export interface KeyRemoval {
  id: string;
  keys: string[];
}

/** A feature sits two levels deep in the collection, so four spaces in. */
const FEATURE_INDENT = "    ";

function featureText(feature: unknown): string {
  return JSON.stringify(feature, null, 2)
    .split("\n")
    .map((line, index) => (index === 0 ? line : FEATURE_INDENT + line))
    .join("\n");
}

function replaceOnce(text: string, before: string, after: string, id: string): string {
  const at = text.indexOf(before);
  if (at === -1) {
    throw new Error(`${id}: is not committed in the canonical serialisation of itself`);
  }
  if (text.indexOf(before, at + before.length) !== -1) {
    throw new Error(`${id}: its committed text appears more than once`);
  }
  return text.slice(0, at) + after + text.slice(at + before.length);
}

/**
 * Edits each changed feature's own text in place and leaves every other byte as
 * it was. Re-serialising the whole document would be shorter and would also
 * rewrite numbers nobody asked about — camino-frances stores one kmFromStart as
 * 365.0, which round-trips to 365 — and a data migration whose diff reaches
 * past the features it changed cannot be read.
 */
export function stripNonLanguageKeys(raw: string): { text: string; removals: KeyRemoval[] } {
  const collection = JSON.parse(raw);
  const removals: KeyRemoval[] = [];
  let text = raw;

  for (const feature of collection.features ?? []) {
    const localized = feature.properties?.nameLocalized;
    if (!localized) continue;
    const junk = Object.keys(localized).filter((key) => !isLanguageKey(key));
    if (junk.length === 0) continue;

    const id = feature.id ?? feature.properties?.name ?? "(no id)";
    const before = featureText(feature);
    for (const key of junk) delete localized[key];
    if (Object.keys(localized).length === 0) delete feature.properties.nameLocalized;

    text = replaceOnce(text, before, featureText(feature), id);
    removals.push({ id, keys: junk });
  }

  return { text, removals };
}

if (process.argv[2]) {
  const path = process.argv[2];
  const { text, removals } = stripNonLanguageKeys(readFileSync(path, "utf8"));
  for (const removal of removals) {
    console.log(`${removal.id} drops ${removal.keys.join(", ")}`);
  }
  writeFileSync(path, text);
  console.log(`${path}: ${removals.length} feature(s) cleared`);
}
