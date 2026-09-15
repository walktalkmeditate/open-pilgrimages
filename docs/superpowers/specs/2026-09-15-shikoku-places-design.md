# Shikoku's places, and the text every route's moments were missing

**Status:** design, awaiting the plan
**Sections touched:** `shikoku-88-{awa,tosa,iyo,sanuki}` by data; every shipping section by builder change
**Consumer:** pilgrim-ios 2.0.0, which shipped Honor's pilgrimage walk on 2026-09-15 and draws these moments on the walk screen

---

## 1. What is wrong, measured

`ways/stage-NN.json` carries `moments`, the pins a walker meets on a day. Across the corpus as it ships at `v1.9.2`:

| section | stages | moments | per stage | carrying text |
|---|---|---|---|---|
| camino-frances | 33 | 80 | 2.4 | 56% |
| camino-norte | 34 | 208 | 6.1 | **0%** |
| kumano-kodo-kohechi | 4 | 11 | 2.8 | **0%** |
| kumano-kodo-nakahechi | 4 | 22 | 5.5 | 68% |
| shikoku-88-awa | 5 | 64 | **12.8** | 36% |
| shikoku-88-iyo | 14 | 187 | **13.4** | 14% |
| shikoku-88-sanuki | 6 | 71 | **11.8** | 32% |
| shikoku-88-tosa | 15 | 85 | 5.7 | 19% |

Two separate faults, and the table shows both. **Text is missing corpus-wide** — Norte ships 208 moments and not one of them has a word on it. **Shikoku is twice the density of anything else**, and the excess is one class of pin.

Of Shikoku's 298 sacred sites, 88 are the fudasho and 210 are ordinary roadside shrines the Overpass query swept in (`subtype: church` ×163, `wayside_shrine` ×47). In Iyo they are 125 of 187 moments. The 26 numbered temples that are the entire reason the section exists compete with them for the walker's attention, and lose.

This is the failure PR B already met and named: *the first run gave 21.8 places a stage against a spec asking 2–3.* Its fix was to drop hamlets. Shikoku needs the same judgement applied to shrines.

## 2. Root causes, each verified in source

1. **A description hides a temple's number.** `scripts/ways/moments.ts:257` is `cap(properties.description, …) ?? composedText(properties)`. The `??` means a hand-written description *replaces* the composed `Temple N · school · stamp available` line. Twelve temples carry a description, so exactly those twelve lose their number — 12, 23, 24, 38, 45, 51, 66, 68, 69, 75, 84 and 88. Zentsū-ji, where Kūkai was born, and Ōkubo-ji, which closes the circuit, are anonymous *because* somebody wrote about them.

2. **Nothing composes text for a place that is not a temple.** `composedText` (`moments.ts:111-130`) reads only `templeNumber`, `denomination`, `tradition` and `credentialStamp`. The enricher writes none of those for an OSM waypoint, and no OSM waypoint in the corpus carries a `description`. `placeMoment` (`moments.ts:189-208`) has no text branch at all. That is the whole of the 0% columns.

3. **Japanese names are discarded.** `extractNameLocalized` (`scripts/enrich/osm.ts:211-220`) matches `^name:(\w+)$` only. In Japan the Japanese name lives in the bare `name` tag, so it is never mapped to `ja` and is dropped whenever `name:en` exists. The same `\w` admits junk keys — `ja_rm` ×29, `signed` ×2 — as if they were languages.

4. **The duplicate gate cannot fire.** Dedup is coordinate-only at 50 m (`enrich/waypoints.ts:21, 334-341`), and 87 of 88 curated temple coordinates are stored at three decimal places. Rounding to ~110 m puts every OSM twin at 50 m or further; measured nearest-twin distances run 50–107 m with a minimum of exactly 50. Twenty-nine curated/OSM twins survive as separate pins.

5. **Anchor suppression is too narrow.** A stage's start and end anchors are suppressed against a real waypoint only when `type === "town"` (`moments.ts:236-239, 269-270`). Shikoku's days end at temples, so 17 anchor/temple pairs ship as two pins at zero metres apart.

## 3. The design

### 3.1 The cut belongs to the builder, not to the data

`waypoints.geojson` keeps every place OSM offered. `build-ways` decides which of them becomes a moment. Nothing is destroyed and the decision is reversible by editing one rule.

It also means **the cut moves no waypoint count**. `check-site` reads those totals back out of README and the section pages as prose, and 168 shrines disappearing from the dataset would have rewritten all of it. They do not disappear; they simply stop being drawn. The only counts that move in this work are the duplicates §3.5 merges.

### 3.2 Which sacred sites become moments

A sacred site is promoted when any of these holds:

- it carries `templeNumber` — the 88 fudasho, always, without exception;
- it carries `bangaiNumber` — the three bangai of §3.4;
- OSM gave it a name in more than one language, i.e. `nameLocalized` is present.

Everything else stays in `waypoints.geojson` and is not drawn.

The third clause is the whole of the cut, and it is a recorded judgement rather than our taste: somebody in the mapping community took the trouble to write this place's name in a second language. Measured against the shipped data it is exactly the right sieve — all 88 fudasho carry `nameLocalized`, and of the 210 ordinary shrines only **42** do (40 `church`, 2 `wayside_shrine`). The 168 that go are the ones nobody has named twice.

| | sacred moments | per stage |
|---|---|---|
| today | 298 | 7.5 |
| under the rule (88 fudasho + 42 named shrines, 3 of them bangai) | 130 | **3.3** |

That lands Shikoku inside the corpus range of 2.4–6.1 without touching a single non-sacred pin.

**The rule needs nothing the data does not already carry.** `wikidata` and `heritage` would be the stronger signals, but the Overpass cache holds 21 places of worship across all seven routes and no `heritage` tag at all, so reading them would mean a live re-fetch — and OSM has moved since April, so that re-fetch would silently add and drop places in a diff meant to be about text. `nameLocalized` is already in every section's `waypoints.geojson`. No network, no drift, no enricher change for this rule.

### 3.3 What a moment says

`text` becomes the join of everything known, not the first thing found:

- A description and a composed line now **both** appear, description last, joined by `·`. Temple 75 reads `Temple 75 · Shingon · stamp available (¥500) · Kūkai was born here`, not one or the other.
- `composedText` learns the ordinary places from what the enricher already retains — `subtype`, `elevation`, `hours` — so a lodge reads as a lodge, a viewpoint carries its height, and a water point says whether it is drinkable. This is the corpus-wide half of the work: it is what gives Norte's 208 blank moments and Kohechi's 11 a line, and it needs no new tags.
- Where the retained fields yield nothing, text is **drafted** — facts only, no legend — flagged `"drafted": true` and cleared through `docs/review/`, per the repo's standing convention. §3.2's cut is what keeps that tail small enough for a human to actually read.

### 3.4 The bangai

The bangai (番外) are twenty side temples walked alongside the 88. **Three of them are in the corridor and three is what ships.** A survey of the four sections' waypoints for OSM's own `Bekkaku` / `別格` designation found number 9 (Monju-in), number 12 (Enmei-ji) and number 14 (Tsubaki-dō); the other seventeen are absent. They are promoted in place — `bangaiNumber` set, `source: "curated"`, coordinate and `osmId` untouched — so this work adds **no new waypoint at all**.

Hand-authoring the seventeen was rejected: it would invent coordinates, which the corpus has refused since PR B settled that places are machine-derived. A live Overpass query was rejected too, for the reason §6 gives. And it is largely moot — a bangai is a side temple, and anything beyond the 300 m corridor is dropped from moments regardless of how well it is mapped. Each section's `provenance.notes` records what was searched and what was found, so nobody repeats the survey.

Because nothing is added, the only waypoint counts that move are the ones §3.5's dedup merges.

### 3.5 The three repairs

- `extractNameLocalized` maps the bare `name` tag to `ja` when the section's country is Japan and the value is not Latin script, and narrows its key pattern to real language subtags so `ja_rm` and `signed` stop arriving as languages.
- Dedup rounds both coordinates to the coarser of the two precisions before measuring, so a curated point at three decimals is compared against its OSM twin at the scale it was actually stored.
- Anchor suppression drops the `type === "town"` condition and suppresses against any waypoint within the existing threshold.

## 4. What this does not do

- It does not re-cut stages. The forty days stand exactly as v1.9.1 shipped them, and the proof that no route data moved is that `stages.json` stays byte-identical outside `interior`.
- It does not touch the walked line, the relations, or any distance.
- It does not add bangai to the 88's numbering or to any stage's start or end.
- It does not change `schema/way.schema.json`. The app reads what it already reads.

## 5. Consequences to plan for

- **`check-site` will fail until the pages are regenerated.** It reads waypoint totals from `README.md:5` and per-section figures out of `docs/shikoku-88-{iyo,tosa,sanuki}.html`. Merging the duplicate twins of §3.5 moves those numbers.
- **CI diffs the whole of `routes/` and `docs/`**, so regenerated `ways/` and pages must be committed.
- **All forty Shikoku stages are already ticked** in `docs/review/shikoku-88.md`, and `validate.ts:887-1010` treats a second line for a stage as an error. Any stage whose text is newly drafted needs its existing line honoured, not duplicated.
- **Eight sections change output**, not four. Norte's 208 moments and Kohechi's 11 gain text from the same builder fix, and every section's `ways/` must be rebuilt and re-verified.
- The test runner is `node --test`, not vitest. Baseline is 808 passing.

## 6. Resolved: no re-fetch

The earlier draft of this spec asked whether the notability tags could be re-derived from `.cache/` or needed a live Overpass run. Neither. The cache carries 21 places of worship across all seven routes and no `heritage` tag anywhere, so it cannot serve the rule — and a live re-fetch would move which places exist, mixing OSM's four months of drift into a diff that is supposed to be about text. §3.2's rule reads `nameLocalized`, which every section already ships. **This work touches the network nowhere, and adds no waypoint at all** — §3.4's three bangai are promoted in place.
