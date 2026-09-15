/**
 * One-off, no-network repair for the fault fixed in enrich/osm.ts: a place
 * whose Japanese name lives in the bare `name` tag never got a `ja` entry.
 * The bare name is already committed, so this reads no network.
 *
 *   npx tsx scripts/migrate-japanese-names.ts routes/shikoku-88-awa/waypoints.geojson
 */
import { readFileSync, writeFileSync } from "node:fs";

const CJK = /[぀-ヿ㐀-䶿一-鿿]/;

export function repair(collection: any): number {
  let changed = 0;
  for (const feature of collection.features ?? []) {
    const p = feature.properties ?? {};
    if (!p.name || !CJK.test(p.name)) continue;
    const localized = p.nameLocalized ?? {};
    if (localized.ja) continue;
    localized.ja = p.name;
    p.nameLocalized = localized;
    changed += 1;
  }
  return changed;
}

if (process.argv[2]) {
  const path = process.argv[2];
  const collection = JSON.parse(readFileSync(path, "utf8"));
  const changed = repair(collection);
  writeFileSync(path, `${JSON.stringify(collection, null, 2)}\n`);
  console.log(`${path}: ${changed} names recovered`);
}
