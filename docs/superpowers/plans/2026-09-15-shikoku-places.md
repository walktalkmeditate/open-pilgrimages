# Shikoku's Places, and the Text Every Route Lacked — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every fudasho keeps its number, every place moment carries a line worth reading, and Shikoku's 26 Iyo temples stop competing with 125 unnamed roadside shrines.

**Architecture:** The cut is a decision in the moment builder, not a deletion from the waypoint data — `waypoints.geojson` keeps what OSM offered and `build-ways` chooses what a walker sees. Text is composed from fields the enricher already retains, and drafted only where the type alone says nothing. Two enricher faults are fixed both in code (so a future run is right) and by a no-network migration over the committed data (so today's data is right).

**Tech Stack:** TypeScript on Node, `node --test` via `npm test`, JSON Schema validation, jsDelivr-published data.

## Global Constraints

- **No network, anywhere in this work.** No Overpass, no re-fetch. Every fix reads data already committed.
- Baseline is **808 tests passing** (`npm test`). Never let it drop.
- Runner is `node --test`, **not vitest**. Tests live beside their source as `<name>.test.ts`.
- `stages.json` must stay **byte-identical outside `interior`** — this work re-cuts no day.
- `schema/way.schema.json` does not change. The app reads what it already reads.
- Localized strings keep `en` as the required key (`CLAUDE.md`); `names` in a way file is the **non-English** set by design (`text.ts` strips `en`).
- Drafted text carries `"drafted": true` and needs a ticked, section-qualified line in `docs/review/shikoku-88.md` (`- [x] shikoku-88-awa stage 0`). **All forty Shikoku stages already have one**, and `validate.ts` treats a second line for a stage as an error — honour the existing line, never add a duplicate.
- CI diffs the whole of `routes/` and `docs/`, so every regenerated file is committed.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Work in `/Users/rubberduck/GitHub/momentmaker/open-pilgrimages/.worktrees/shikoku-places` on branch `feat/shikoku-places`. Never commit to `main`; never use bare `git stash`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `scripts/ways/moments.ts` | Text composition, the notability rule, anchor suppression | 1, 2, 3, 6 |
| `scripts/ways/moments.test.ts` | Tests for all of the above | 1, 2, 3, 6 |
| `scripts/enrich/osm.ts` | `extractNameLocalized` | 4 |
| `scripts/enrich/osm.test.ts` | Its tests | 4 |
| `scripts/enrich/waypoints.ts` | Dedup precision | 5 |
| `scripts/enrich/waypoints.test.ts` | Its tests | 5 |
| `scripts/migrate-japanese-names.ts` | One-off, no-network data repair | 4 |
| `scripts/migrate-twin-waypoints.ts` | One-off, no-network dedup repair | 5 |
| `routes/shikoku-88-*/waypoints.geojson` | Three bangai named, ~29 twins merged, `ja` names recovered | 4, 5, 7 |
| `docs/review/shikoku-88.md` | Existing ticks honoured | 8 |
| `routes/*/ways/**`, `docs/**`, `README.md`, `index.json` | Regenerated outputs | 9 |

---

### Task 1: A description stops hiding a temple's number

**Files:**
- Modify: `scripts/ways/moments.ts:257`
- Test: `scripts/ways/moments.test.ts`

**Interfaces:**
- Produces: `composedText(properties)` unchanged in signature; the call site joins its result with the description.

**Why:** `cap(description) ?? composedText(properties)` means a hand-written description *replaces* the composed line. Twelve temples carry a description, so exactly those twelve lose their number — including Zentsū-ji (75) and Ōkubo-ji (88).

- [ ] **Step 1: Write the failing test**

Add to `scripts/ways/moments.test.ts`:

```ts
test("a temple with a description keeps its number and its school", () => {
  const properties = {
    type: "sacred_site",
    name: "Zentsū-ji",
    templeNumber: 75,
    denomination: "Shingon",
    credentialStamp: true,
    stampFee: { currency: "JPY", amount: 500 },
    description: "Kūkai was born here",
  };
  const feature = {
    id: "temple-75",
    geometry: { type: "Point", coordinates: [133.79, 34.22] },
    properties,
  };
  const result = buildMoments({
    line: [[133.78, 34.22], [133.80, 34.22]],
    cumulative: [0, 184],
    waypoints: [feature],
    start: { name: "A", at: [133.78, 34.22] },
    end: { name: "B", at: [133.80, 34.22] },
    section: { line: [[133.78, 34.22], [133.80, 34.22]], cumulative: [0, 184], stageIndex: 0, fromMeters: 0, toMeters: 184 },
  });
  const temple = result.moments.find((m) => m.id === "temple-75");
  assert.equal(temple?.text, "Temple 75 · Shingon · stamp available (¥500) · Kūkai was born here");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test scripts/ways/moments.test.ts`
Expected: FAIL — actual is `"Kūkai was born here"`, the composed line missing.

- [ ] **Step 3: Join instead of choosing**

Replace `scripts/ways/moments.ts:257`:

```ts
    const composed = composedText(properties);
    const described = cap(properties.description, MOMENT_TEXT_MAX);
    // A description used to replace the composed line rather than follow it,
    // so the twelve temples somebody wrote about were the twelve that lost
    // their number. Identity first, then the words.
    const text = [composed, described].filter(Boolean).join(" · ") || undefined;
    if (text) moment.text = cap(text, MOMENT_TEXT_MAX);
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx tsx --test scripts/ways/moments.test.ts`
Expected: PASS.

- [ ] **Step 5: Whole suite, then commit**

```bash
npm test
git add scripts/ways/moments.ts scripts/ways/moments.test.ts
git commit
```

Message: `fix(ways): a description follows a temple's number instead of replacing it`

---

### Task 2: Ordinary places get a line

**Files:**
- Modify: `scripts/ways/moments.ts:5-18` (properties interface), `scripts/ways/moments.ts:111-130` (`composedText`)
- Test: `scripts/ways/moments.test.ts`

**Interfaces:**
- Consumes: Task 1's join at the call site.
- Produces: `composedText` handles `subtype`, `elevation`, `hours` for non-temple types.

**Why:** `composedText` reads only temple fields, and `placeMoment` has no text branch at all. Camino Norte ships 208 moments with 152 textless places among them. The Camino Francés proves the standard is reachable: it has **zero** textless place moments.

**Scope note for the reviewer:** stage anchors (`stage-start`, `stage-end`) stay textless on purpose. All 35 of the Francés' blanks are anchors, and their label is the information. Do not give them text.

- [ ] **Step 1: Write the failing tests**

```ts
test("a viewpoint carries its height", () => {
  assert.equal(
    composedText({ type: "viewpoint", subtype: "viewpoint", elevation: 320 }),
    "Viewpoint · 320 m",
  );
});

test("a town reads as its kind", () => {
  assert.equal(composedText({ type: "town", subtype: "village" }), "Village");
});

test("a shrine that is not a fudasho still says what it is", () => {
  assert.equal(composedText({ type: "sacred_site", subtype: "wayside_shrine" }), "Wayside shrine");
});

test("hours are appended when the dataset has them", () => {
  assert.equal(
    composedText({ type: "cultural_site", subtype: "museum", hours: "09:00-17:00" }),
    "Museum · 09:00-17:00",
  );
});

test("a temple's line is unchanged by the new branches", () => {
  assert.equal(
    composedText({ type: "sacred_site", subtype: "temple", templeNumber: 1, denomination: "Shingon" }),
    "Temple 1 · Shingon",
  );
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx tsx --test scripts/ways/moments.test.ts`
Expected: four FAIL (undefined returned), the temple one PASS.

- [ ] **Step 3: Widen the properties interface**

In `scripts/ways/moments.ts`, add to `WaypointProperties` (after line 17):

```ts
  subtype?: string;
  elevation?: number;
  hours?: string;
  bangaiNumber?: number;
```

- [ ] **Step 4: Teach `composedText` the ordinary places**

Replace the body of `composedText` (`scripts/ways/moments.ts:111-130`):

```ts
const SUBTYPE_WORDS: Record<string, string> = {
  temple: "Temple",
  church: "Church",
  wayside_shrine: "Wayside shrine",
  monastery: "Monastery",
  village: "Village",
  town: "Town",
  city: "City",
  hamlet: "Hamlet",
  viewpoint: "Viewpoint",
  museum: "Museum",
  ruins: "Ruins",
  castle: "Castle",
  spring: "Spring",
  fountain: "Fountain",
};

/** `wayside_shrine` → `Wayside shrine`, for a subtype the table has not met. */
function subtypeWord(subtype: string): string {
  const spaced = subtype.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function composedText(properties: WaypointProperties): string | undefined {
  const parts: string[] = [];

  if (typeof properties.templeNumber === "number") {
    parts.push(`Temple ${properties.templeNumber}`);
  } else if (typeof properties.bangaiNumber === "number") {
    parts.push(`Bangai ${properties.bangaiNumber}`);
  } else if (properties.subtype) {
    // A numbered temple is named by its number; everything else is named by
    // what it is. Without this branch a place that is not a fudasho gets no
    // line at all, which is the whole of Camino Norte's 0%.
    parts.push(SUBTYPE_WORDS[properties.subtype] ?? subtypeWord(properties.subtype));
  }

  const school =
    cap(properties.denomination, 80) ??
    (properties.tradition
      ? properties.tradition.charAt(0).toUpperCase() + properties.tradition.slice(1)
      : undefined);
  if (school) parts.push(school);

  if (typeof properties.elevation === "number") {
    parts.push(`${Math.round(properties.elevation)} m`);
  }

  if (properties.credentialStamp === true) {
    parts.push(`stamp available${feeText(properties.stampFee)}`);
  }

  const hours = cap(properties.hours, 80);
  if (hours) parts.push(hours);

  return parts.length > 0 ? parts.join(" · ") : undefined;
}
```

- [ ] **Step 5: Run them and watch them pass**

Run: `npx tsx --test scripts/ways/moments.test.ts`
Expected: all PASS.

- [ ] **Step 6: Whole suite, then commit**

```bash
npm test
git add scripts/ways/moments.ts scripts/ways/moments.test.ts
git commit
```

Message: `feat(ways): a place that is not a temple still says what it is`

---

### Task 3: An anchor stops standing beside the place it names

**Files:**
- Modify: `scripts/ways/moments.ts:216-218, 236-239, 269-270`
- Test: `scripts/ways/moments.test.ts`

**Why:** A stage's start and end anchors are suppressed only when a `town` waypoint sits near them. Shikoku's days end at temples, so 17 anchor/temple pairs ship as two pins at zero metres apart.

- [ ] **Step 1: Write the failing test**

```ts
test("a stage that ends at a temple gets one pin, not two", () => {
  const end: Position = [133.80, 34.22];
  const result = buildMoments({
    line: [[133.78, 34.22], [133.80, 34.22]],
    cumulative: [0, 184],
    waypoints: [{
      id: "temple-88",
      geometry: { type: "Point", coordinates: end },
      properties: { type: "sacred_site", subtype: "temple", name: "Ōkubo-ji", templeNumber: 88 },
    }],
    start: { name: "A", at: [133.78, 34.22] },
    end: { name: "Ōkubo-ji", at: end },
    section: { line: [[133.78, 34.22], [133.80, 34.22]], cumulative: [0, 184], stageIndex: 0, fromMeters: 0, toMeters: 184 },
  });
  assert.equal(result.moments.filter((m) => m.id === "stage-end").length, 0);
  assert.ok(result.moments.some((m) => m.id === "temple-88"));
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test scripts/ways/moments.test.ts`
Expected: FAIL — a `stage-end` moment is present alongside `temple-88`.

- [ ] **Step 3: Suppress against any waypoint, not only a town**

Rename the two flags and drop the type condition. Replace lines 216-218:

```ts
  let startHasPlace = false;
  let endHasPlace = false;
```

Replace lines 236-239:

```ts
    // Any real place standing where the anchor would stand replaces it. This
    // used to require `type === "town"`, which is why Shikoku — whose days end
    // at temples — shipped 17 pairs of pins at zero metres apart.
    if (nearStart) startHasPlace = true;
    if (nearEnd) endHasPlace = true;
```

Replace lines 269-270:

```ts
  if (!startHasPlace) moments.push(placeMoment("stage-start", start, line, cumulative));
  if (!endHasPlace) moments.push(placeMoment("stage-end", end, line, cumulative));
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx tsx --test scripts/ways/moments.test.ts`
Expected: PASS.

- [ ] **Step 5: Whole suite, then commit**

The suite may show other moment tests changing count expectations — read each, and where the change is an anchor correctly suppressed, update the expectation and say so in the commit body.

```bash
npm test
git add scripts/ways/moments.ts scripts/ways/moments.test.ts
git commit
```

Message: `fix(ways): any place at a stage's end suppresses its anchor, not only a town`

---

### Task 4: Japanese names stop being thrown away

**Files:**
- Modify: `scripts/enrich/osm.ts:211-220`
- Create: `scripts/migrate-japanese-names.ts`
- Test: `scripts/enrich/osm.test.ts`

**Why:** `extractNameLocalized` matches `^name:(\w+)$` only, so a place whose Japanese lives in the bare `name` tag — the norm in Japan — never gets a `ja` entry. The same `\w` admits `ja_rm` (×29) and `signed` (×2) as if they were languages.

**No-network note:** the bare name is already stored as `name` in every committed `waypoints.geojson`, so the data is repairable without Overpass. The code fix makes future runs right; the migration makes today's data right.

- [ ] **Step 1: Write the failing tests**

```ts
test("a bare Japanese name becomes the ja entry", () => {
  const tags = { name: "霊山寺", "name:en": "Ryōzen-ji" };
  assert.deepEqual(extractNameLocalized(tags), { ja: "霊山寺" });
});

test("a romanisation is not a language", () => {
  const tags = { name: "霊山寺", "name:ja_rm": "Ryōzenji", signed: "no" };
  const out = extractNameLocalized(tags) ?? {};
  assert.equal(out.ja_rm, undefined);
  assert.equal(out.signed, undefined);
});

test("an explicit name:ja still wins over the bare name", () => {
  const tags = { name: "Ryōzen-ji", "name:ja": "霊山寺" };
  assert.deepEqual(extractNameLocalized(tags), { ja: "霊山寺" });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx tsx --test scripts/enrich/osm.test.ts`
Expected: first two FAIL.

- [ ] **Step 3: Narrow the key pattern and read the bare name**

Replace `extractNameLocalized` in `scripts/enrich/osm.ts`:

```ts
/** BCP-47 shapes only: `ja`, `zh-Hans`, `pt-BR`. Not `ja_rm`, not `signed`. */
const LANGUAGE_KEY = /^name:([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/;

const CJK = /[぀-ヿ㐀-䶿一-鿿]/;

export function extractNameLocalized(tags: Record<string, string>): Record<string, string> | undefined {
  const localized: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    const match = key.match(LANGUAGE_KEY);
    if (match && match[1] !== "en") {
      localized[match[1]] = value;
    }
  }
  // In Japan the Japanese name is the bare `name`, and an English name:en
  // beside it meant the Japanese was discarded entirely.
  if (!localized.ja && tags.name && CJK.test(tags.name)) {
    localized.ja = tags.name;
  }
  return Object.keys(localized).length > 0 ? localized : undefined;
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx tsx --test scripts/enrich/osm.test.ts`
Expected: all PASS.

- [ ] **Step 5: Write the migration**

Create `scripts/migrate-japanese-names.ts`:

```ts
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
```

- [ ] **Step 6: Run the migration over the four Shikoku sections**

```bash
for s in awa tosa iyo sanuki; do
  npx tsx scripts/migrate-japanese-names.ts routes/shikoku-88-$s/waypoints.geojson
done
npm run validate
```

Expected: a non-zero count for each section, and `validate` passes.

- [ ] **Step 7: Commit**

```bash
git add scripts/enrich/osm.ts scripts/enrich/osm.test.ts scripts/migrate-japanese-names.ts routes/shikoku-88-*/waypoints.geojson
git commit
```

Message: `fix(enrich): the bare name is the Japanese name, and ja_rm is not a language`

---

### Task 5: The duplicate gate can fire

**Files:**
- Modify: `scripts/enrich/waypoints.ts:21, 334-341`
- Create: `scripts/migrate-twin-waypoints.ts`
- Test: `scripts/enrich/waypoints.test.ts`

**Why:** Dedup is coordinate-only at 50 m, and 87 of 88 curated temple coordinates are stored at three decimal places (~110 m of rounding). Measured nearest-twin distances run 50–107 m with a minimum of exactly 50, so the gate can never fire and 29 curated/OSM twins ship as separate pins.

- [ ] **Step 1: Write the failing test**

```ts
test("a curated point rounded to three decimals still matches its OSM twin", () => {
  const curated = { lon: 134.507, lat: 34.173 };          // three decimals
  const osm = { lon: 134.5074123, lat: 34.1736521 };      // full precision
  assert.equal(isSamePlace(curated, osm), true);
});

test("two genuinely different shrines 200 m apart stay separate", () => {
  assert.equal(isSamePlace({ lon: 134.507, lat: 34.173 }, { lon: 134.5092, lat: 34.173 }), false);
});
```

- [ ] **Step 2: Run them and watch the first fail**

Run: `npx tsx --test scripts/enrich/waypoints.test.ts`
Expected: first FAIL (distance measured as ≥50 m), second PASS.

- [ ] **Step 3: Compare at the coarser of the two precisions**

In `scripts/enrich/waypoints.ts`, add beside the threshold at line 21:

```ts
/**
 * A curated point stored at three decimals is only known to ~110 m, so
 * measuring it against a full-precision OSM twin at 50 m could never match.
 * Both are rounded to the coarser of the two before the distance is taken.
 */
export function decimalsOf(value: number): number {
  const text = String(value);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

export function isSamePlace(a: { lon: number; lat: number }, b: { lon: number; lat: number }): boolean {
  const places = Math.min(
    Math.max(decimalsOf(a.lon), decimalsOf(a.lat)),
    Math.max(decimalsOf(b.lon), decimalsOf(b.lat)),
  );
  const round = (v: number): number => Number(v.toFixed(places));
  const metres = haversineMeters(
    [round(a.lon), round(a.lat)],
    [round(b.lon), round(b.lat)],
  );
  return metres <= DEDUP_METERS;
}
```

Then use `isSamePlace` at the existing dedup site (lines 334-341) in place of the raw distance comparison.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx tsx --test scripts/enrich/waypoints.test.ts`
Expected: both PASS.

- [ ] **Step 5: Write the migration**

Create `scripts/migrate-twin-waypoints.ts`, which loads one `waypoints.geojson`, finds pairs where one feature has `source: "curated"` (or no `source`) and the other has `source: "osm"` and `isSamePlace` holds, keeps the curated one, and merges the OSM one's `osmId` and any `nameLocalized` keys the curated one lacks onto it before dropping it. Print one line per merge: `kept temple-3, dropped node/314747849 (52 m)`.

- [ ] **Step 6: Run it and record the count**

```bash
for s in awa tosa iyo sanuki; do
  npx tsx scripts/migrate-twin-waypoints.ts routes/shikoku-88-$s/waypoints.geojson
done
npm run validate
```

Expected: about 29 merges across the four sections, and `validate` passes. Record the exact number — Task 9's page regeneration depends on it.

- [ ] **Step 7: Commit**

```bash
git add scripts/enrich/waypoints.ts scripts/enrich/waypoints.test.ts scripts/migrate-twin-waypoints.ts routes/shikoku-88-*/waypoints.geojson
git commit
```

Message: `fix(enrich): a three-decimal coordinate can match its full-precision twin`

---

### Task 6: The notability rule

**Files:**
- Modify: `scripts/ways/moments.ts` (new exported predicate, used in `buildMoments`)
- Test: `scripts/ways/moments.test.ts`

**Why:** Of Shikoku's 298 sacred sites, 88 are fudasho and 210 are ordinary roadside shrines. In Iyo they are 125 of 187 moments and they bury the 26 numbered temples the section exists for. All 88 fudasho carry `nameLocalized`; only 42 of the 210 do.

- [ ] **Step 1: Write the failing tests**

```ts
test("a fudasho is always drawn", () => {
  assert.equal(isNotableSacredSite({ type: "sacred_site", templeNumber: 12 }), true);
});

test("a bangai is always drawn", () => {
  assert.equal(isNotableSacredSite({ type: "sacred_site", bangaiNumber: 3 }), true);
});

test("a shrine somebody named twice is drawn", () => {
  assert.equal(
    isNotableSacredSite({ type: "sacred_site", subtype: "church", nameLocalized: { ja: "椙尾神社" } }),
    true,
  );
});

test("a shrine nobody named twice is not drawn", () => {
  assert.equal(isNotableSacredSite({ type: "sacred_site", subtype: "church" }), false);
});

test("the rule only judges sacred sites", () => {
  assert.equal(isNotableSacredSite({ type: "town" }), true);
  assert.equal(isNotableSacredSite({ type: "viewpoint" }), true);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx tsx --test scripts/ways/moments.test.ts`
Expected: FAIL — `isNotableSacredSite` is not defined.

- [ ] **Step 3: Add the predicate and apply it**

In `scripts/ways/moments.ts`, after `iconFor`:

```ts
/**
 * Which sacred sites a walker sees. Every fudasho and every bangai, always —
 * they are the route's structure, not places of interest. Beyond them, a
 * shrine is drawn when OSM gave it a name in a second language: somebody took
 * the trouble, which is a recorded judgement rather than our taste. Measured
 * on the shipped data that is all 88 fudasho and 42 of 210 shrines, which puts
 * Shikoku at 3.8 sacred moments a stage against a corpus range of 2.4–6.1.
 *
 * Nothing is deleted: the 168 that go stay in waypoints.geojson, and this
 * decision can be reversed by editing this function alone.
 */
export function isNotableSacredSite(properties: WaypointProperties): boolean {
  if (properties.type !== "sacred_site") return true;
  if (typeof properties.templeNumber === "number") return true;
  if (typeof properties.bangaiNumber === "number") return true;
  return Boolean(properties.nameLocalized && Object.keys(properties.nameLocalized).length > 0);
}
```

Then in `buildMoments`, immediately after the `MOMENT_TYPES` check at line 221:

```ts
    if (!isNotableSacredSite(properties)) continue;
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx tsx --test scripts/ways/moments.test.ts`
Expected: all PASS.

- [ ] **Step 5: Whole suite, then commit**

```bash
npm test
git add scripts/ways/moments.ts scripts/ways/moments.test.ts
git commit
```

Message: `feat(ways): the fudasho stop competing with 168 unnamed shrines`

---

### Task 7: The three bangai OSM knows about

**Files:**
- Modify: `routes/shikoku-88-{awa,tosa,iyo,sanuki}/waypoints.geojson`
- Test: `scripts/ways/contract.test.ts` (a count assertion), `npm run validate`

**Why:** The bangai (番外) are twenty side temples many walkers visit alongside the 88. **Three of them are in the data; seventeen are not, and this task does not invent them.**

A survey of the four sections' committed waypoints found exactly three carrying OSM's own `Bekkaku` / `別格` designation: number 9 (Monju-in, Iyo), number 12 (Enmei-ji, Iyo) and number 14 (Tsubaki-dō, Sanuki). The other seventeen appear nowhere in the corridor. Hand-authoring their coordinates would be inventing data, which this repo has refused since PR B established that places are machine-derived and never hand-authored. It is also largely moot: a bangai is a *side* temple by definition, and a place more than `MOMENT_DROP_METERS` (300 m) off the walked line is dropped from moments anyway, so most of the seventeen could not render even with perfect coordinates.

- [ ] **Step 1: Promote the three**

For each of the three features found by

```bash
node -e "
const fs=require('fs');
for (const s of ['awa','tosa','iyo','sanuki']) {
  const g=JSON.parse(fs.readFileSync('routes/shikoku-88-'+s+'/waypoints.geojson'));
  for (const f of g.features) {
    const p=f.properties, t=(p.name||'')+((p.nameLocalized||{}).ja||'');
    const m=t.match(/(?:Bekkaku|別格)\s*(\d{1,2})/);
    if (m) console.log(s, f.id, m[1], p.name);
  }
}
"
```

set `bangaiNumber` to the matched integer and `source` to `"curated"`, keeping the existing coordinate, `osmId`, `stageIndex` and `kmFromStart` exactly as they are. Do not change the feature's `id` — it is already referenced by the built packages.

- [ ] **Step 2: Record the seventeen as absent**

Add to each of the four sections' `metadata.json` under `provenance.notes` a single sentence naming what was searched and what was found: that OSM's `Bekkaku` / `別格` designation yielded three bangai inside the 300 m corridor, and that the remaining seventeen are absent from the corridor rather than omitted by choice. This is the sentence a future contributor needs so nobody re-runs this survey.

- [ ] **Step 3: Validate**

Run: `npm run validate`
Expected: PASS, including `schema/waypoints.schema.json`'s `source` enum accepting `curated`.

- [ ] **Step 4: Confirm they become moments**

```bash
npm run build-ways
node -e "
const fs=require('fs'),g=require('glob');
let n=0;
for (const f of require('glob').sync('routes/shikoku-88-*/ways/stage-*.json'))
  n += JSON.parse(fs.readFileSync(f)).moments.filter(m=>/^Bangai /.test(m.text||'')).length;
console.log('bangai moments:', n);
"
```

Expected: the count equals the number added in Step 2.

- [ ] **Step 5: Commit**

```bash
git add routes/shikoku-88-*/waypoints.geojson
git commit
```

Message: `feat(shikoku): the three bangai OSM knows about are named as bangai`

---

### Task 8: Drafted text where the type alone says nothing

**Files:**
- Modify: `routes/shikoku-88-*/waypoints.geojson` (a `description` on selected features)
- Modify: `docs/review/shikoku-88.md` only if a stage lacks a line

**Why:** After Task 2 every place carries at least its kind. The 42 notable shrines and the 3 bangai deserve better than `Church`, and they are a small enough set for a human to actually read.

**Budget:** 45 entries — the 42 shrines and the 3 bangai. Facts only, no legend — the repo's standing rule, and the lesson v1.9.1 paid for.

- [ ] **Step 1: List the 45**

```bash
node -e "
const fs=require('fs');
for (const s of ['awa','tosa','iyo','sanuki']) {
  const g=JSON.parse(fs.readFileSync('routes/shikoku-88-'+s+'/waypoints.geojson'));
  for (const f of g.features) {
    const p=f.properties;
    if (p.type!=='sacred_site') continue;
    if (typeof p.templeNumber==='number') continue;
    if (typeof p.bangaiNumber!=='number' && !(p.nameLocalized&&Object.keys(p.nameLocalized).length)) continue;
    if (p.description) continue;
    console.log(s, f.id, p.name, JSON.stringify(p.nameLocalized||{}));
  }
}
"
```

- [ ] **Step 2: Draft one line each**

Each `description` states what is verifiable from the feature itself and its section's `provenance.sources` — what the place is, what it is called in Japanese, and where on the day it falls. No history that is not in the data. No superlatives. Set `"drafted": true` on any stage whose text changed.

- [ ] **Step 3: Honour the existing review lines**

`docs/review/shikoku-88.md` already carries a ticked, section-qualified line for all forty stages. **Do not add a second line for any stage** — `validate.ts` errors on a duplicate. Only add a line if the script in Step 1 names a stage that has none.

- [ ] **Step 4: Validate and commit**

```bash
npm run validate
git add routes/shikoku-88-*/waypoints.geojson docs/review/shikoku-88.md
git commit
```

Message: `content(shikoku): a line for the forty-two shrines and the three bangai`

---

### Task 9: Rebuild, regenerate, and prove the day did not move

**Files:**
- Modify: `routes/*/ways/**`, `docs/**`, `README.md`, `index.json`

- [ ] **Step 1: Prove no stage was re-cut**

```bash
node -e "
const fs=require('fs'), cp=require('child_process');
const strip = o => { for (const s of o.stages||[]) delete s.interior; return o; };
for (const s of ['awa','tosa','iyo','sanuki']) {
  const p='routes/shikoku-88-'+s+'/stages.json';
  const now=strip(JSON.parse(fs.readFileSync(p)));
  const base=strip(JSON.parse(cp.execSync('git show origin/main:'+p)));
  console.log(s, JSON.stringify(now)===JSON.stringify(base) ? 'identical' : 'MOVED');
}
"
```

Expected: `identical` for all four. If any says `MOVED`, stop and find out why before going further.

- [ ] **Step 2: Rebuild every package and page**

```bash
npm run build-ways
npm run build-index
npm run build-assets
npm run check-site
```

`check-site` reads waypoint totals back out of `README.md` and the section pages, so it fails until `build-assets` has rewritten them with the new counts (bangai added, twins merged). If it still fails after `build-assets`, the failure is real — read it.

- [ ] **Step 3: Measure the result**

```bash
node -e "
const fs=require('fs'),glob=require('glob');
for (const d of glob.sync('routes/*/ways')) {
  const fs2=glob.sync(d+'/stage-*.json'); if(!fs2.length) continue;
  let t=0,x=0;
  for (const f of fs2){ const ms=JSON.parse(fs.readFileSync(f)).moments; t+=ms.length; x+=ms.filter(m=>(m.text||'').trim()).length; }
  console.log(d.split('/')[1].padEnd(24), fs2.length, 'stages', t, 'moments', (t/fs2.length).toFixed(1), 'per stage', Math.round(x/t*100)+'% with text');
}
"
```

Expected: Shikoku sections land near 4–6 moments a stage, and every section's text percentage is high with the remainder being stage anchors only.

- [ ] **Step 4: Full suite and validate**

```bash
npm test
npm run validate
```

Expected: 808 or more passing, zero failures; validate clean.

- [ ] **Step 5: Commit the regenerated outputs**

```bash
git add routes docs README.md index.json
git commit
```

Message: `build(shikoku): rebuild every package and page against the new rules`

---

### Task 10: The PR

- [ ] **Step 1: Push and open it**

```bash
git push -u origin feat/shikoku-places
gh pr create --repo walktalkmeditate/open-pilgrimages --base main --head feat/shikoku-places --title "fix(shikoku): the places that matter, and the text every route lacked" --body-file <path>
```

The body carries: the before/after density and text table from Task 9 Step 3, the six root causes with their file:line, the notability rule and the 88/42-of-210 measurement behind it, which bangai were promoted from OSM and which authored, the byte-identical `stages.json` proof, and the count of merged twins.

- [ ] **Step 2: Stop**

Do not merge, do not tag, do not release. The merge is by **fast-forward push** when `main` sits exactly at the branch point — the repo's linear history depends on it — and that, the tag, and the jsDelivr purge are the human's to run.

---

## Self-Review

**Spec coverage.** §1 measured faults → Tasks 1, 2, 3, 6. §2.1 the `??` → Task 1. §2.2 no composer → Task 2. §2.3 Japanese names → Task 4. §2.4 dedup precision → Task 5. §2.5 anchor suppression → Task 3. §3.1 cut in the builder → Task 6. §3.2 notability rule → Task 6. §3.3 what a moment says → Tasks 1, 2, 8. §3.4 bangai → Task 7. §3.5 three repairs → Tasks 3, 4, 5. §4 non-goals → Task 9 Step 1 proves the stages did not move. §5 consequences → Task 9. §6 no network → Global Constraints.

**Placeholders.** Task 7 Step 1 and Task 8 Step 2 are the two places carrying judgement rather than literal code, because the content is the deliverable there; both name the exact fields, the exact id convention, and the rule for what may be said. Task 5 Step 5 describes the migration's behaviour rather than its source — the implementer writes it against the `isSamePlace` signature fixed in Step 3.

**Type consistency.** `isNotableSacredSite(properties: WaypointProperties): boolean` and `isSamePlace(a, b): boolean` are the two new exported names, used in Task 6 and Task 5 respectively. `composedText` keeps its signature. `bangaiNumber`, `subtype`, `elevation`, `hours` are added to `WaypointProperties` in Task 2 and consumed in Tasks 6, 7, 8.
