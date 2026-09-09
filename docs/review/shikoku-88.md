# Shikoku 88 — drafted text review

Twenty stages carry drafted text: five of `shikoku-88-awa` and fifteen of `shikoku-88-tosa`.
Each entry below holds what the text was written from, so it can be judged against its
evidence rather than on its own.

This is the checklist spec §6 requires of the Shikoku 88 content work. `npm run validate`
reads it alongside `routes/shikoku-88-*/stages.json`, and `npm run check-drafted-diff` reads
it again against the base ref: a `"drafted": true` that disappears without a ticked line here
fails CI. It covers a whole pilgrimage, so **every line names its section**. The four dōjō
each have a stage 0, and one unqualified `- [x] stage 0` would clear all four at once — the
gate refuses that form, and this file must never contain it.

**The Awa text was drafted in Task 6a and the Tosa text in Task 6b, each declared here by the
task that wrote it. Nothing in this file is a review.** All twenty of those lines are open,
and clearing one is a later task's work, by an agent that had no part in the drafting: an
author who ticks his own prose records a review that did not happen.

## What the drafter did not have

Two absences shaped every sentence below, and a reader checking the text should know they
were chosen rather than overlooked.

**No elevation, anywhere in this pilgrimage.** All four sections' `route.main.geojson` are
2-D; no stage in any of them declares `elevationGainMeters`, `elevationLossMeters`,
`highPointMeters` or `lowPointMeters`; every `ways/stage-NN.json` therefore ships
`gainMeters: 0`; and `routes/shikoku-88-awa/metadata.json` has no `overview.elevationRange`
to read. §6 lists climb among the permitted grounds, and here there is none to permit. So no
drafted sentence describes ascent, descent, a pass, or a day as hard for its terrain.

The text also asserts no *flatness*. Silence about height is not a claim that the ground is
level, and nothing below says a day is easy, gentle, level or downhill. Where a day's shape
would ordinarily be explained by climbing, these narratives explain it by spacing — the
measured distance from one temple to the next — because spacing is what the files hold.
`gainMeters: 0` in the shipped packages means *unknown*, not *none*, and a reviewer should
read any future edit that leans on it as an error.

**No per-stage terrain, difficulty or hours.** An Awa stage carries `index`, `name`, `start`,
`end`, `distanceKm`, and on stage 3 a `warnings` array. Nothing else. `overview.terrainTypes`
(`paved`, `mountain`, `forest`, `coastal`, `urban`), `overview.difficulty` (`hard`) and
`overview.estimatedDays` describe the whole 154.5 km section and not any one day of it, so no
entry below cites them and no narrative calls a day coastal, mountainous or urban.

## What was refused

Shikoku carries more legend than any route in this corpus, and some of it sits in this
section's own `metadata.json`. §6 grounds stage text in the section's temples, shrines,
passes, towns, distance and climb. A fact being *in* `metadata.json` is not the same as its
being one of those things. The list below is what the drafter wanted to write and did not,
and it is the line the other three dōjō should hold to.

- **Kūkai walking beside the pilgrim.** `tradition.saint`, `tradition.origin` and
  `cultural.practices[0]` (Dōgyō Ninin) all carry it. Refused: it is a pilgrimage-wide
  devotional claim, attached to no stage, no temple and no measurement.
- **"Awakening" as what Awa means.** This section's own `description` and
  `cultural.historicalSignificance` both say it in as many words. Refused all the same: it is
  the meaning of the dōjō's name, it belongs to the section rather than to any day of it, and
  a narrative that opened by announcing it would be reciting the route's self-description
  back at the walker. **The same refusal covers `discipline` for Tosa, `enlightenment` for
  Iyo and `nirvana` for Sanuki** — three drafters will each find the sentence waiting in
  their own metadata, and it is the same sentence.
- **Every date.** 774–835, 815, the Edo period, the 1200th anniversary in the 2015 stats row.
  §6 forbids dates outright.
- **Osettai, the nōkyōchō, the sedge hat, the staff, the Heart Sutra, the 20–30 minutes a
  temple visit takes.** All in `cultural.practices` and `tradition.credentialSystem`.
  Refused: pilgrimage-wide practice, and the last of them is an hours figure, which no stage
  here has.
- **Temple 12 Shōzan-ji as a *nansho*, a hard temple.** Nowhere in the data, and it would be
  a terrain claim standing on no profile.
- **Season and weather.** `bestMonths`, `peakMonths` and `logistics.seasonalAvailability`
  are section-level. No day below has a season.
- **"The day crosses Tokushima's centre"** (stage 3, cut). No waypoint names Tokushima as a
  place; only business, hospital and station names contain 徳島, and `terrainTypes: urban`
  is a section-level field. The sentence became a count of what the file actually holds.
- **"Coastal"** (stage 4, cut). Station names on that day (Tainohama, 田井ノ浜) and the
  section's `terrainTypes` both suggest it. Nothing per-stage says it.
- **Kitagawachi station and a Lawson** (stage 4, cut). Both are filed on the stage, and both
  are beyond the 300 m the way build carries — 963 m and 554 m off the line. A narrative
  saying the day passes them would have been wrong on the section's own measurements, so the
  sentence dropped from four stations to three. **`stageIndex` alone does not put a place on
  the walk**; the drop lists in `ways/report.json` are the check, and the other three
  drafters should run them before naming anything.
- **A reason for the 52.94 km day beyond the one the data gives.** Stage 3 is long because
  `waypoints.geojson` holds no accommodation and no town between Ido-ji and its end. The
  narrative says that and stops. It does not call the day a trial, a test or a crossing.
- **Any context for the Bandō POW camp.** Its name is a waypoint on stage 0 and the narrative
  gives the name, unembroidered. Everything a reader might want to know next — who, when,
  from where — is outside this repository, so it is outside the sentence.

## How the figures below were measured

Every along-line kilometre and off-line metre is the perpendicular projection of the place's
own coordinate onto the committed `routes/shikoku-88-awa/route.main.geojson`, computed with
`projectOnLine` from `scripts/ways/geo.ts`. That line is 7,054 points and **154.482 km**
(`ways/report.json` `walkedLine`). Stage-boundary vertices come from `stageBoundaries` in the
same file, on the same line. Two figures for one place can therefore differ by a few metres:
`stages.json`'s anchor notes report the nearest *vertex*, this file reports the nearest point
on the line, and Sudachi-an is 46 m from one and 43 m from the other.

Each stage's **Distance** line carries two measurements, because they answer different
questions. The span between the two boundary vertices on the full line is what the cut
declared. `ways/report.json` `sliceKm` is the length of the slice the package actually ships,
after `simplify`, `strideCap` and `roundLine`, and so runs a little under the span; `ratio`
and `passedGate` are the report's own.

**Place counts** are of features in `waypoints.geojson` carrying that `stageIndex` — 203
across the section — and the **dropped** lines are `ways/report.json`'s, for places beyond
the 300 m the build carries onto a stage.

The 23 temple waypoints carry no OSM id: they come from the Shikoku 88 official-site source
`metadata.json` declares under `provenance.sources`, and are cited here by their feature id,
`temple-1` … `temple-23`. Every other id below is an OpenStreetMap node and resolves at
`https://api.openstreetmap.org/api/0.6/node/<id>.json`, or in bulk through
`https://overpass-api.de/api/interpreter`. Nothing in this repository holds their tags, so a
later reviewer re-fetches them; the metre and kilometre figures are reproducible from the
committed line alone.

## Where the day-ends are filed

`metadata.json`'s `provenance` records that 12 of the pilgrimage's 36 mid-route day-end
places are filed on the day that *begins* there rather than the one that arrives, because a
day-end projects within metres of the vertex its boundary snapped to and can land either
side of it. **None of the twelve is in Awa**, checked on the committed line:

| day-end | projects at | boundary vertex | filed on |
| --- | --- | --- | --- |
| `temple-10` Kirihata-ji | 28.26289 km | 28.26289 km (vertex 1344) | stage 0, the arriving day |
| `node/11544133369` Sudachi-an | 52.54307 km | 52.56002 km (vertex 2484) | stage 1, the arriving day |
| `temple-17` Ido-ji | 79.44752 km | 79.44752 km (vertex 3630) | stage 2, the arriving day |
| `node/11342795169` Green House | 132.38810 km | 132.39459 km (vertex 5837) | stage 3, the arriving day |

So each stage's endpoints below are read from `stages.json`, and each agrees with the
`stageIndex` its own waypoint carries. All six boundaries snapped; none went proportional.

## Appending a section

Iyo and Sanuki hold ticked lines at the foot of this file and nothing else, because the
gate wants a line per stage whether or not there is text behind it. A drafter taking one of
those sections **lifts that section's block out of the closing list and replaces it with a
`## <section-id> — <name>` heading and one `### <section-id> stage N` entry per stage**, in
the shape Awa uses. Nothing above needs to move: the top matter is pilgrimage-wide and the
sections are independent of each other. Keep the section headings in walking order — awa,
tosa, iyo, sanuki — so the file reads in the order the circuit is walked.

Tosa was lifted out of that list in Task 6b, and the lift is the whole of the move: its
fifteen ticked lines were **deleted**, not left standing beside the fifteen open ones its
entries carry. `validate` now refuses a second line for the same section-and-stage and names
both line numbers, so leaving them would fail rather than quietly pre-tick a review.

---

## shikoku-88-awa — Awa (Temples 1-23)

Temple 1 Ryōzen-ji to Temple 23 Yakuō-ji, 154.482 km of walked line, cut into five days.
Twenty-three temples stand on it, and the day cut ends three of the five at one. The two
that do not are stage 1, which stops at a guesthouse because no temple falls where the band
looks, and stage 3, which runs 52.94 km for the same reason over a far longer stretch.

Temple positions on the line, which most of the text below is arithmetic on:

`temple-1` 0.000 · `temple-2` 1.317 · `temple-3` 3.966 · `temple-4` 9.138 · `temple-5` 10.962
· `temple-6` 16.296 · `temple-7` 17.454 · `temple-8` 21.679 · `temple-9` 24.115 ·
`temple-10` 28.263 · `temple-11` 37.916 · `temple-12` 49.485 · `temple-13` 71.306 ·
`temple-14` 73.837 · `temple-15` 74.948 · `temple-16` 76.540 · `temple-17` 79.448 ·
`temple-18` 97.563 · `temple-19` 101.958 · `temple-20` 115.047 · `temple-21` 120.586 ·
`temple-22` 131.787 · `temple-23` 154.482 km.

The steps between them, in the same order: 1.317, 2.649, 5.172, 1.824, 5.334, 1.158, 4.225,
2.436, 4.148, 9.653, 11.569, 21.821, 2.531, 1.111, 1.592, 2.908, 18.115, 4.395, 13.089,
5.539, 11.201, 22.695 km. The widest is Temple 22 → 23 at 22.695, which is the 22.7 km
`metadata.json`'s `description` already declares; the narrowest is Temple 14 → 15 at 1.111.

---

### shikoku-88-awa stage 0 — Ryōzen-ji (Temple 1) to Kirihata-ji (Temple 10)

- **Start** Ryōzen-ji (Temple 1) — `temple-1`, 64 m off the line, at 0.000 km. Section
  boundary; the anchor's coordinates are `metadata.json`'s `overview.startPoint`, and the
  waypoint stands on the same point
- **End** Kirihata-ji (Temple 10) — `temple-10`, 49 m off the line, at 28.263 km
- **Distance** 28.263 km between the boundary vertices against **28.3 km** declared in
  `stages.json`. Shipped slice 27.939 km (`ways/report.json` `sliceKm`), ratio 0.9872,
  `passedGate: true`. Previously declared: **none** — this section's stages were cut in Task
  5b and have never carried another figure
- **Places** 39 filed on the stage; `ways/report.json` drops none of them
- **Grounding the text cites**
  - Ten temples — `temple-1` through `temple-10`, at the kilometres listed in the section
    preamble above, 10 to 83 m off the line
  - "Gokuraku-ji comes 1.3 km on" — `temple-2` at 1.317 km
  - "the widest gap between any two of them is 5.3 km" — `temple-5` 10.962 → `temple-6`
    16.296, **5.334 km**, against the day's other steps of 1.317, 2.649, 5.172, 1.824, 1.158,
    4.225, 2.436 and 4.148. Rounded to the one decimal the files use, 5.3
  - "the ruins of the former Bandō POW camp inside the first kilometre" —
    `wp-osm-cultural_site-node5812294761` / `node/5812294761` (`cultural_site` / `ruins`,
    name "The former Bando POW Camp", `ja` 板東俘虜収容所跡, `de` "Das ehemalige
    Kriegsgefangenenlager Bando"), 236 m off, at **0.594 km**. The sentence gives the name
    and nothing else; see "What was refused". A second ruins node 107 m further on,
    `node/13958033489` "The Main Gate" (正門), is not cited
  - "the town of Itano at 4.8 km" — `wp-osm-town-node308115575` / `node/308115575`
    (`town` / `town`, 板野町), 97 m off, at **4.794 km**
  - "Ten of Awa's twenty-three temples" — 23 features in `waypoints.geojson` carry a
    `templeNumber`, running 1 to 23, and 10 of them carry `stageIndex: 0`
  - "the first 28.3 km of a 154.5 km section" — `overview.distanceKm` 154.5, measured
    154.482

```
theme:      Ten temples in twenty-eight kilometres
narrative:  Ten of Awa's twenty-three temples stand on this one day. Ryōzen-ji opens it, Gokuraku-ji comes 1.3 km on, and Konsen-ji, Dainichi-ji, Jizō-ji, Anraku-ji, Jūraku-ji, Kumadani-ji and Hōrin-ji follow before Kirihata-ji closes it at 28.3 km. The widest gap between any two of them is 5.3 km. What else the day passes is ordinary and near at hand — the ruins of the former Bandō POW camp inside the first kilometre, the town of Itano at 4.8 km. Ten arrivals in the first 28.3 km of a 154.5 km section: whatever this day asks of you, it is not patience between temples.
reflection: Ten arrivals in one day, the widest gap between any two of them 5.3 km — how do you meet the tenth as freshly as the first?
```

**Open.** Not reviewed. The final clause — "whatever this day asks of you, it is not patience
between temples" — is the one sentence here that is a reading rather than a measurement, and
a reviewer should decide whether ten temples in 28.263 km carries it.

- [ ] shikoku-88-awa stage 0

---

### shikoku-88-awa stage 1 — Kirihata-ji (Temple 10) to Sudachi-an

- **Start** Kirihata-ji (Temple 10) — `temple-10`, 49 m off the line, at 28.263 km
- **End** Sudachi-an — `wp-osm-accommodation-node11544133369` / `node/11544133369`
  (`accommodation` / `guesthouse`), 43 m off the line, at 52.543 km. The day ends at a
  guesthouse under the cut's second arm: no temple falls 25–30 km past 28.263 km
- **Distance** 24.297 km between the boundary vertices against **24.3 km** declared. Shipped
  slice 24.002 km, ratio 0.9877, `passedGate: true`. Previously declared: **none**
- **Places** 20 filed on the stage. `ways/report.json` drops 2 as off route:
  `node/6992537152` ("7-Eleven", 501 m) and `node/13967883982` (鴨島営業所, 346 m). Neither
  is cited
- **Grounding the text cites**
  - "Fujii-dera comes 9.7 km on from Kirihata-ji" — `temple-11` at 37.916 km, 6 m off;
    37.916 − 28.263 = **9.653 km**
  - "Shōzan-ji 11.6 km after that" — `temple-12` at 49.485 km, 55 m off; **11.569 km** on
  - "the two widest gaps between temples Awa has offered so far, and both are wider than any
    gap in yesterday's ten" — 9.653 and 11.569 against a running maximum of 5.334 through
    Temple 10, from the step list in the section preamble
  - "three more sacred places, Chōdo-an, ishidou-gongen and Ryūsui-an, inside 2.9 km" —
    `wp-osm-sacred_site-node6099934916` / `node/6099934916` (長戸庵, 9 m off, 41.062 km),
    `wp-osm-sacred_site-node11419669334` / `node/11419669334` (7 m off, 42.850 km) and
    `wp-osm-sacred_site-node378075409` / `node/378075409` (柳水庵, 12 m off, 43.924 km).
    41.062 → 43.924 is **2.862 km**. All three are `type: sacred_site`, `subtype: church`,
    which is why the text calls them sacred places and not shrines, temples or halls — the
    subtype is the enrichment's own and `metadata.json`'s `provenance` warns that 163 of this
    pilgrimage's `sacred_site` waypoints carry it
  - "No temple falls where a day of this length would end" — the `end.note` on this stage in
    `stages.json`, which records that no temple falls 25–30 km past 28.26 km
  - "it stops 3.1 km past Shōzan-ji at Sudachi-an, a guesthouse" — 52.543 − 49.485 =
    **3.058 km**; the `subtype` is `guesthouse`

```
theme:      From ten temples to two
narrative:  Yesterday held ten temples; today holds two. Fujii-dera comes 9.7 km on from Kirihata-ji and Shōzan-ji 11.6 km after that — the two widest gaps between temples Awa has offered so far, and both are wider than any gap in yesterday's ten. Between them the data records three more sacred places, Chōdo-an, ishidou-gongen and Ryūsui-an, inside 2.9 km. No temple falls where a day of this length would end, so this one does not end at a gate: it stops 3.1 km past Shōzan-ji at Sudachi-an, a guesthouse.
reflection: The day ends at a guesthouse because no temple fell where the day did — does the walking change when there is nothing at the end of it to arrive at?
```

**Open.** Not reviewed. "Yesterday" and "today" are the only place in the five where a
narrative addresses a neighbouring stage; a reviewer should decide whether a stage package
read on its own can carry that, since the app may show one day without the day before it.

- [ ] shikoku-88-awa stage 1

---

### shikoku-88-awa stage 2 — Sudachi-an to Ido-ji (Temple 17)

- **Start** Sudachi-an — `wp-osm-accommodation-node11544133369` / `node/11544133369`, 43 m
  off the line, at 52.543 km
- **End** Ido-ji (Temple 17) — `temple-17`, 46 m off the line, at 79.448 km
- **Distance** 26.888 km between the boundary vertices against **26.9 km** declared. Shipped
  slice 26.635 km, ratio 0.9902, `passedGate: true`. Previously declared: **none**
- **Places** 36 filed on the stage; `ways/report.json` drops none of them
- **Grounding the text cites**
  - "walks 18.8 km before it reaches a temple" — `temple-13` at 71.306 km less the day's
    start at 52.543 km, **18.763 km**
  - "Shōzan-ji is 21.8 km behind by then, the second-widest step between two temples in this
    section" — `temple-12` 49.485 → `temple-13` 71.306, **21.821 km**, second only to Temple
    22 → 23's 22.695 in the step list above
  - "Dainichi-ji at 71.3 km — the second temple of that name in Awa, after Temple 4 on the
    opening day" — `temple-13` and `temple-4` both carry `name: "Dainichi-ji"`; they are the
    only repeated temple name in the section
  - "Jōraku-ji, Awa Kokubun-ji, Kannon-ji and Ido-ji all fall inside the 8.1 km after it" —
    `temple-14` 73.837, `temple-15` 74.948, `temple-16` 76.540, `temple-17` 79.448;
    79.448 − 71.306 = **8.142 km**
  - "Jōraku-ji to Awa Kokubun-ji is 1.1 km, the shortest step between two temples anywhere in
    Awa" — **1.111 km**, against a next-shortest of 1.158 (Temple 6 → 7)
  - "Hie Shrine, Hachiman Shrine and Jigen-ji stand in that same run" —
    `wp-osm-sacred_site-node12373206418` / `node/12373206418` (37 m off, 73.563 km),
    `wp-osm-sacred_site-node12373206292` / `node/12373206292` (24 m off, 73.970 km) and
    `wp-osm-sacred_site-node12373206293` / `node/12373206293` (55 m off, 74.137 km), all
    three inside 71.306–79.448

```
theme:      Five temples in the last eight kilometres
narrative:  The day walks 18.8 km before it reaches a temple. Shōzan-ji is 21.8 km behind by then, the second-widest step between two temples in this section, and the day's first is Dainichi-ji at 71.3 km — the second temple of that name in Awa, after Temple 4 on the opening day. Then the spacing collapses: Jōraku-ji, Awa Kokubun-ji, Kannon-ji and Ido-ji all fall inside the 8.1 km after it, and Jōraku-ji to Awa Kokubun-ji is 1.1 km, the shortest step between two temples anywhere in Awa. Hie Shrine, Hachiman Shrine and Jigen-ji stand in that same run. One day carries both shapes the section has.
reflection: 18.8 km to the day's first temple, then four more inside the 8.1 km after it — which of the two is the walking you came for?
```

**Open.** Not reviewed. "the spacing collapses" and "both shapes the section has" are
readings of the step list; the theme's "last eight kilometres" is 8.142 of a 26.888 km day
and a reviewer should check the rounding down reads honestly.

- [ ] shikoku-88-awa stage 2

---

### shikoku-88-awa stage 3 — Ido-ji (Temple 17) to GuestHouse & Cafe Green House

- **Start** Ido-ji (Temple 17) — `temple-17`, 46 m off the line, at 79.448 km
- **End** GuestHouse & Cafe Green House — `wp-osm-accommodation-node11342795169` /
  `node/11342795169` (`accommodation` / `guesthouse`), 182 m off the line, at 132.388 km.
  Second arm again: no temple falls 25–30 km past 79.448 km
- **Distance** 52.947 km between the boundary vertices against **52.9 km** declared. Shipped
  slice 52.442 km, ratio 0.9913, `passedGate: true`. Previously declared: **none**. This is
  the longest day of the five and carries a `warnings` entry saying so
- **Places** 89 filed on the stage, the most of any day here (39 / 20 / 36 / 89 / 19 across
  the five). `ways/report.json` drops 2 as off route: `node/12080105513` (ありす調剤薬局,
  317 m) and `node/11083754197` (unnamed vending machine, 315 m). Neither is cited, and
  neither is one of the counted 22
- **Grounding the text cites**
  - "Awa's longest day, 52.9 km" — 132.388 − 79.448 = **52.940 km**, against 28.263, 24.297,
    26.888 and 22.094
  - "between Ido-ji and this day's end the data holds no accommodation and no town anywhere
    on the walked line" — of the 89 features with `stageIndex: 3`, exactly one carries
    `type: accommodation` (the day's own end) and none carries `type: town`. The same fact is
    in the stage's committed `warnings` entry and in `metadata.json`'s `provenance`, which
    records that the rule found nothing for 52.94 km
  - "eighty-nine of Awa's two hundred and three recorded places stand on it, more than on any
    other day" — the `stageIndex` counts above; `waypoints.geojson` holds **203** features.
    Two of the 89 are beyond the 300 m the way build carries, so 87 reach the package
  - "twenty-two of them places to eat" — **22** of the 89 carry `type: food`
    (`subtype` `restaurant` or `cafe`). None of the 22 is named in the narrative, so the claim
    is the count; reproduce it from `waypoints.geojson` on `stageIndex: 3` and `type: food`
  - "Onzan-ji 18.1 km in, then Tatsue-ji, Kakurin-ji, Tairyū-ji and Byōdō-ji" — `temple-18`
    97.563 (8 m off), `temple-19` 101.958 (32 m), `temple-20` 115.047 (9 m), `temple-21`
    120.586 (79 m), `temple-22` 131.787 (62 m); 97.563 − 79.448 = **18.115 km**
  - "Past Byōdō-ji the first bed the record holds is 0.6 km on" — 132.388 − 131.787 =
    **0.601 km**

```
theme:      Fifty-three kilometres between beds
narrative:  Awa's longest day, 52.9 km, and it is long because of an absence rather than a distance: between Ido-ji and this day's end the data holds no accommodation and no town anywhere on the walked line, so the cut had nowhere nearer to stop. The stretch itself is the busiest in the section — eighty-nine of Awa's two hundred and three recorded places stand on it, more than on any other day, twenty-two of them places to eat. Five temples come with it: Onzan-ji 18.1 km in, then Tatsue-ji, Kakurin-ji, Tairyū-ji and Byōdō-ji. Past Byōdō-ji the first bed the record holds is 0.6 km on, at the GuestHouse & Cafe Green House, and the day ends there.
reflection: A day with everything on it but a bed — is it long because the way is, or because of where the record let it end?
```

**Open.** Not reviewed. Two things for the reviewer. The theme rounds 52.940 up to
"fifty-three" where the narrative and `distanceKm` say 52.9 — deliberate, but it is the one
figure in the five that is not the file's own. And the whole entry speaks of what *the
record* holds rather than what exists; a walker may well find a bed here that OpenStreetMap
does not know about, which is why the narrative and the committed warning both name the data
rather than the road.

- [ ] shikoku-88-awa stage 3

---

### shikoku-88-awa stage 4 — GuestHouse & Cafe Green House to Yakuō-ji (Temple 23)

- **Start** GuestHouse & Cafe Green House — `wp-osm-accommodation-node11342795169` /
  `node/11342795169`, 182 m off the line, at 132.388 km
- **End** Yakuō-ji (Temple 23) — `temple-23`, 6 m off the line, at 154.482 km. Section
  boundary; the anchor's coordinates are `metadata.json`'s `overview.endPoint`, and
  `shikoku-88-tosa` begins from the same point
- **Distance** 22.087 km between the boundary vertices against **22.1 km** declared. Shipped
  slice 21.836 km, ratio 0.9881, `passedGate: true`. Previously declared: **none**
- **Places** 19 filed on the stage, the fewest of the five. `ways/report.json` drops 3 as off
  route: `node/369987357` (山神社, 1,242 m), `node/298725358` ("Lawson", 554 m) and
  `node/369987265` (Kitagawachi station, 963 m). **None of the three is cited**, and two of
  them were in an earlier draft of this narrative — see "What was refused"
- **Grounding the text cites**
  - "One temple stands on this day and it is the last thing on it" — one feature with
    `stageIndex: 4` carries a `templeNumber`, `temple-23`, at 154.482 km, the last position
    on the line
  - "Byōdō-ji to Yakuō-ji is 22.7 km, the widest step between two temples in Awa" —
    `temple-22` 131.787 → `temple-23` 154.482, **22.695 km**, the largest in the step list
    above, and the 22.7 km `metadata.json`'s `description` declares
  - "the day walks all but 0.6 km of it" — 22.695 − 22.087 = **0.608 km**, the stretch from
    Byōdō-ji to the day's start
  - "The first 11.2 km carry no recorded place at all — the longest stretch in the section
    with nothing marked on it" — 132.388 → the next feature at 143.548, **11.160 km**;
    the next-longest gap between consecutive places anywhere in the section is 10.610 km
    (120.586 → 131.196). The claim is about the record, not about the road
  - "three stations come one after another, Yuki, Tainohama and Kiki" —
    `wp-osm-transport-node9430425139` / `node/9430425139` (80 m off, 143.548 km),
    `wp-osm-transport-node265017159` / `node/265017159` (11 m off, 144.539 km) and
    `wp-osm-transport-node265017851` / `node/265017851` (163 m off, 146.469 km), all three
    `subtype: train_station` and all three within the build's 300 m
  - "inside the last 1.5 km the day gathers … Hiwasa Hachiman Shrine, the town of Minami, a
    clinic, a restaurant and two places to stay" — `node/5394602633` (日和佐八幡神社, 68 m
    off, 153.103 km), `node/298625630` (`town`, 美波町, 28 m, 153.529),
    `node/5394655856` (`medical` / `clinic`, 美波町国民健康保険日和佐診療所, 215 m, 153.699),
    `node/2875936823` (`food` / `restaurant`, ひわさ屋, 42 m, 153.940),
    `node/5044547321` (`accommodation` / `hotel`, "Hiwasa guest house", 9 m, 153.826) and
    `node/11350962171` (`accommodation` / `guesthouse`, "Guest House Sakura-an", 7 m,
    154.071). The earliest of them is **1.379 km** before the end. The two are called
    "places to stay" and not "guesthouses" because their subtypes differ
  - "Yakuō-ji closes Awa at 154.5 km, and Tosa begins from the same point" —
    `walkedLine.lengthKm` 154.482; `metadata.json`'s `osm.note` records that Awa ends at
    Temple 23 where `shikoku-88-tosa` begins, and both sections take the anchor verbatim from
    this section's `overview`

```
theme:      One temple, at the end of it
narrative:  One temple stands on this day and it is the last thing on it. Byōdō-ji to Yakuō-ji is 22.7 km, the widest step between two temples in Awa, and the day walks all but 0.6 km of it. The first 11.2 km carry no recorded place at all — the longest stretch in the section with nothing marked on it. Then three stations come one after another, Yuki, Tainohama and Kiki, and inside the last 1.5 km the day gathers what the rest of it withheld: Hiwasa Hachiman Shrine, the town of Minami, a clinic, a restaurant and two places to stay. Yakuō-ji closes Awa at 154.5 km, and Tosa begins from the same point.
reflection: Twenty-two kilometres to one gate, and the section ends at it — what do you want to be carrying when you get there?
```

**Open.** Not reviewed. "the longest stretch in the section with nothing marked on it" is a
claim about OpenStreetMap coverage and reads, in a sentence about walking, as a claim about
emptiness; a reviewer should decide whether the qualifier does enough work. The reflection is
the only one of the five that looks past the section boundary, which the endpoint note
supports but the stage package does not itself contain.

- [ ] shikoku-88-awa stage 4

---

---

## shikoku-88-tosa — Tosa (Temples 23-39)

Temple 23 Yakuō-ji to Temple 39 Enkō-ji, **418.501 km** of walked line (`ways/report.json`
`walkedLine`, 15,280 points), cut into fifteen days. Sixteen waypoints here carry a
`templeNumber`, 24 through 39: Temple 23 is this section's start anchor, taken verbatim from
`overview.startPoint`, and its own numbered waypoint belongs to `shikoku-88-awa`. The day cut
ends five of the fifteen days at a temple — stages 2, 3, 5, 9 and 14. The other ten end at a
lodging or a town, because over most of this section no temple falls where the band looks.

Temple positions on the line, which most of the text below is arithmetic on:

`temple-24` 77.547 · `temple-25` 84.233 · `temple-26` 88.082 · `temple-27` 116.629 ·
`temple-28` 154.994 · `temple-29` 164.205 · `temple-30` 171.284 · `temple-31` 177.823 ·
`temple-32` 183.897 · `temple-33` 192.089 · `temple-34` 198.433 · `temple-35` 208.280 ·
`temple-36` 222.809 · `temple-37` 280.878 · `temple-38` 363.590 · `temple-39` 418.501 km.

The sixteen steps, starting from the section's own 0.000 km at Temple 23: 77.547, 6.686,
3.849, 28.547, 38.365, 9.211, 7.079, 6.539, 6.074, 8.192, 6.344, 9.847, 14.529, 58.069,
82.712, 54.911 km. They sum to 418.501, the whole line.

Three properties of that list carry most of the narratives below:

- **Five steps run over 30 km** — 77.547, 38.365, 58.069, 82.712 and 54.911 — and together
  they carry **311.604 km, 74.5%** of the section. `metadata.json`'s `description` declares
  the five and the longest of them, Temple 37 → 38 at 82.7 km.
- **Exactly one step falls inside the 25–30 km band the day cut looks in**, Temple 26 → 27 at
  **28.547 km**. That is why ten of the fifteen days end at a lodging or a town: the second
  arm of the rule is not an exception here, it is the normal case.
- **The narrowest step is Temple 25 → 26 at 3.849 km**, and Temples 24, 25 and 26 stand
  inside 10.535 km — the closest any three consecutive temples come in this section, against
  12.613 km for the next-tightest triple, Temples 30 to 32.

**Places.** `waypoints.geojson` holds **372** features. Per stage, by `stageIndex`: 22, 37,
61, 56, 47, 26, 20, 8, 6, 21, 19, 14, 20, 6, 9. Of the 372, **124 are bus stops** and 108 of
those fall on stages 1, 2 and 3 — which is why those three days are described by their bus
stops and no later day is. 38 are train stations, 39 toilets, 27 convenience stores, 33
accommodation, 16 temples, 8 towns (3 `town`, 4 `city`, 1 `village`), 5 viewpoints, 1
`water_source` and 1 `cultural_site`.

### What Tosa refused, on top of the shared list above

Everything under "What was refused" binds here unchanged, including **"discipline" and
"ascetic training" as what Tosa means** — both sit verbatim in this section's own
`description` and `cultural.historicalSignificance`, and both are refused on the reasoning
that refused "awakening" for Awa. No narrative below names the dōjō or its meaning. Beyond
that list, this section offered five things Awa did not:

- **`description` fields on two temple waypoints.** `temple-24` carries "Cape Muroto — where
  Kukai achieved enlightenment." and `temple-38` "Cape Ashizuri — southernmost point of
  Shikoku." Both are in this section's own `waypoints.geojson`, and both are refused: the
  first is the Kūkai claim the shared list already refuses, the second a geographic
  superlative that is not a temple, shrine, pass, town, distance or climb. Neither cape is
  named below as a place. The words "Cape Ashizuri" appear once, on stage 12, as the **name
  of a bus stop** — `node/9444928826`, `transport`/`bus_stop`, name "Cape Ashizuri", `ja`
  足摺岬 — in the same way Awa named the stations Yuki, Tainohama and Kiki.
- **`tags` on four temple waypoints** — `temple-24` `["temple","cape","historic"]`,
  `temple-27` `["temple","mountain"]`, `temple-38` `["temple","cape","remote"]`, `temple-39`
  `["temple","phase-boundary"]`. Refused. `mountain` and `remote` are terrain and character
  claims with no profile and no measurement behind them, and this is exactly the kind of
  sentence the no-elevation rule exists to stop.
- **`elevation` on three temple waypoints** — `temple-24` 160, `temple-27` 380, `temple-31`
  140. This qualifies the shared paragraph above: **"No elevation, anywhere in this
  pilgrimage" is true of the lines, the stage fields and the shipped packages, but not of
  every waypoint.** Awa has the same three (Temples 12, 20, 21), Iyo five and Sanuki seven,
  and none of the four sections' drafters has used them. They are point heights, not climb —
  a single number says nothing about what the day between two of them does — so nothing below
  cites one, and a reviewer should read any future sentence built on them as an error of the
  same kind as one built on `gainMeters: 0`.
- **The station named Awa.** `node/8383580512`, `train_station`, name "Awa", `ja` 安和, at
  252.730 km on stage 8. It is a real waypoint and it is left unnamed in the narrative,
  which calls it "a station": in a document about a pilgrimage whose first dōjō is Awa, the
  name would read as an error rather than a fact. Recorded here so the omission is visible.
- **Any account of the six waypoints that do not reach the line.** See below.

### The six that passed enrichment and failed the build

Six waypoints filed on stage 12 sit **1.75–2.08 km** from `route.main.geojson` and are
dropped by `build-ways` as off route, yet all six passed the 300 m enrichment corridor —
because that corridor measures against `route.geojson`, which is 727.397 km against the
walked line's 418.501 and carries the variants this section leaves out. Measured against
`route.geojson` the same six are **12 to 137 m** from a line. Three more, on stage 13, behave
the same way: 870, 1,120 and 1,486 m from the walked line, 39, 199 and 102 m from
`route.geojson`. **None of the nine is named in any narrative below**, and stage 13's entry
says in as many words that three of its six places never reach the day.

| waypoint | off `route.main.geojson` | off `route.geojson` |
| --- | --- | --- |
| `node/10819499568` みかんの家 | 1,978 m | 137 m |
| `node/2569457699` (unnamed toilet) | 2,080 m | 27 m |
| `node/1423744372` 足摺病院 | 1,843 m | 40 m |
| `node/1423730740` 修命会土佐清水病院 | 1,937 m | 64 m |
| `node/1498586696` Sea Side Curry House | 1,900 m | 12 m |
| `node/12019776285` Lawson | 1,751 m | 21 m |
| `node/11380474069` Minshuku Tamura | 870 m | 39 m |
| `node/5537156521` Ashizuri Thermae | 1,120 m | 199 m |
| `node/4983997423` 足摺パシフィックホテル花椿 | 1,486 m | 102 m |

Three further drops, one each on stages 4, 7 and 11, are ordinary near-misses of the 300 m
limit — 312, 348 and 331 m — and are named in their own entries.

### Where Tosa's day-ends are filed

`metadata.json`'s `provenance` records that 12 of the pilgrimage's 36 mid-route day-end places
are filed on the day that *begins* there rather than the one that arrives. **Six of the twelve
are in Tosa**, checked on the committed line. Every endpoint below is therefore read from
`stages.json` and not from any waypoint's `stageIndex`:

| day-end | projects at | boundary vertex | Δ | filed on | arriving day |
| --- | --- | --- | --- | --- | --- |
| `node/11535055772` Haryugetu Guesthouse | 32.07937 km | 32.07072 km (vertex 1145) | +8.64 m | stage 1 | **stage 0** |
| `node/10810952434` Tokumasu Minshuku | 62.89075 km | 62.87833 km (vertex 2080) | +12.42 m | stage 2 | **stage 1** |
| `temple-26` Kongōchō-ji | 88.08181 km | 88.10163 km (vertex 2824) | −19.82 m | stage 2 | stage 2 |
| `temple-27` Kōnomine-ji | 116.62895 km | 116.62895 km (vertex 3799) | 0.00 m | stage 3 | stage 3 |
| `node/1762646861` 黒潮温泉ホテル | 152.38904 km | 152.41034 km (vertex 4945) | −21.30 m | stage 4 | stage 4 |
| `temple-31` Chikurin-ji | 177.82276 km | 177.82276 km (vertex 6008) | 0.00 m | stage 5 | stage 5 |
| `node/697489675` Tosa | 205.28657 km | 205.26927 km (vertex 7062) | +17.30 m | stage 7 | **stage 6** |
| `node/11372865970` Ohenro Guest House Lilian | 226.42177 km | 226.42445 km (vertex 8145) | −2.68 m | stage 7 | stage 7 |
| `node/12898846612` 民宿あわの里 | 252.97834 km | 252.97834 km (vertex 9451) | −0.00 m | stage 8 | stage 8 |
| `temple-37` Iwamoto-ji | 280.87768 km | 280.87768 km (vertex 10607) | 0.00 m | stage 9 | stage 9 |
| `node/11377475869` Henro House Maaru | 309.04985 km | 309.04929 km (vertex 11622) | +0.56 m | stage 11 | **stage 10** |
| `node/12908978212` 民宿いさりび | 342.60708 km | 342.60605 km (vertex 12553) | +1.03 m | stage 12 | **stage 11** |
| `node/9444928782` 金剛福寺宿坊 | 363.53099 km | 363.52428 km (vertex 13295) | +6.70 m | stage 13 | **stage 12** |
| `node/11535055771` Ocean, River, Mountain Retreat | 399.32840 km | 399.33987 km (vertex 14635) | −11.47 m | stage 13 | stage 13 |

All sixteen boundaries snapped; none went proportional. The six bolded rows are the
misfilings, and the sign of Δ decides every one of them: a day-end that projects past its own
boundary vertex by any margin lands on the day that begins there. The widest is Tosa at
+17.30 m and the narrowest Henro House Maaru at +0.56 m; on the other side 民宿あわの里 sits on
its vertex to within a floating-point residual and is filed on the arriving day because that
residual is negative. It is the mirror of the Kanjizai-ji (Temple 40) case `metadata.json`'s
`provenance` records, where the residual is positive and the day-end is filed on the day that
begins there.

**Measurement.** As for Awa: every along-line kilometre and off-line metre below is the
perpendicular projection of the place's own coordinate onto the committed
`routes/shikoku-88-tosa/route.main.geojson`, computed with `projectOnLine` from
`scripts/ways/geo.ts`; boundary vertices come from `stageBoundaries` on the same line. The
sixteen temple waypoints carry no OSM id and are cited as `temple-24` … `temple-39`; every
other id is an OpenStreetMap node. Each **Distance** line gives the span between the two
boundary vertices, the figure `stages.json` declares, and `ways/report.json`'s `sliceKm`,
`ratio` and `passedGate` for the slice actually shipped.

---

### shikoku-88-tosa stage 0 — Yakuō-ji (Temple 23) to Haryugetu Guesthouse

- **Start** Yakuō-ji (Temple 23) — section boundary, 6 m off the line, at 0.000 km. The
  anchor's coordinates and name are `metadata.json`'s `overview.startPoint`, and
  `shikoku-88-awa` ends at the same point
- **End** Haryugetu Guesthouse — `wp-osm-accommodation-node11535055772` /
  `node/11535055772` (`accommodation` / `guesthouse`), 19 m off the line, at 32.079 km.
  Second arm: no temple falls 25–30 km past 0.000 km, and the fallback is not confined to the
  band, so the day runs 32.08 km
- **Distance** 32.071 km between the boundary vertices against **32.1 km** declared. Shipped
  slice 31.889 km, ratio 0.9934, `passedGate: true`, `boundaryMode: snap`. Previously
  declared: **none** — this section's stages were cut in Task 5b and have never carried
  another figure
- **Places** 22 filed on the stage; `ways/report.json` drops none of them
- **Grounding the text cites**
  - "Tosa's first temple stands 77.5 km from the section's first step" — `temple-24`
    Hotsumisaki-ji at **77.547 km**, 22 m off the line; the section's own 0.000 km is Temple 23
  - "this day walks 32.1 of them" — the 32.071 km span, 32.1 declared
  - "Nothing on it carries a temple number" — none of the 22 features with `stageIndex: 0`
    carries a `templeNumber`. The feature at 0.000 km is
    `wp-osm-sacred_site-node369741886` (`sacred_site` / `church`, name "23 Yakuo-ji",
    `ja` 第23番札所 薬王寺, 55 m off) — one of the church-subtype twins `metadata.json`'s
    `provenance` warns about, and not counted as a temple by the cut or by this text
  - "six stations, Hiwasa in the first half-kilometre, then Yamagawachi, Hegawa, Mugi, Sabase
    and Kaifu at 28.8 km" — `node/9430425125` Hiwasa (日和佐, 49 m, **0.493 km**),
    `node/9430424224` Yamagawachi (山河内, 159 m, 5.723), `node/9430424226` Hegawa (辺川,
    204 m, 11.402), `node/9430425133` Mugi (牟岐, 90 m, 15.308), `node/9430425132` Sabase
    (鯖瀬, 46 m, 20.550), `node/265018891` Kaifu (海部, 84 m, **28.750**). All six
    `subtype: train_station`, all six inside the build's 300 m
  - "at 8.6 km, a ruined restaurant" — `wp-osm-cultural_site-node13626737001` /
    `node/13626737001` (`cultural_site` / `ruins`, name "Ruined restaurant"), 24 m off, at
    **8.585 km**. The name is given and nothing else, on the Bandō precedent
  - "No temple falls 25 to 30 km ahead of the section's start" — this stage's own committed
    `end.note`
  - "Hotsumisaki-ji is still 45.5 km ahead when this day ends" — 77.547 − 32.079 =
    **45.468 km**

```
theme:      Seventy-seven kilometres to the first temple
narrative:  Tosa's first temple stands 77.5 km from the section's first step, and this day walks 32.1 of them. Nothing on it carries a temple number. What the record holds instead is a railway — six stations, Hiwasa in the first half-kilometre, then Yamagawachi, Hegawa, Mugi, Sabase and Kaifu at 28.8 km — and, at 8.6 km, a ruined restaurant. No temple falls 25 to 30 km ahead of the section's start, so the day ends at a bed rather than a gate: the Haryugetu Guesthouse, 32.1 km on.
reflection: Hotsumisaki-ji is still 45.5 km ahead when this day ends — what does a day hold when nothing on it is a gate?
```

**Open.** Not reviewed. "a bed rather than a gate" carries the vocabulary the rest of this
section leans on: **"gate" stands for a temple in eleven of the fifteen stages** — 0, 2, 3, 5,
7, 9, 10, 11, 12, 13 and 14 — and "bed" for an `accommodation` waypoint in three, 0, 1 and 12.
Neither word is in any file. A reviewer should decide once, for the whole section, whether
that substitution is a reading the data supports or a house metaphor; if it is not, eleven
entries change together and not one.

- [ ] shikoku-88-tosa stage 0

---

### shikoku-88-tosa stage 1 — Haryugetu Guesthouse to Tokumasu Minshuku

- **Start** Haryugetu Guesthouse — `node/11535055772`, 19 m off the line, at 32.079 km
- **End** Tokumasu Minshuku — `wp-osm-accommodation-node10810952434` / `node/10810952434`
  (`accommodation` / `guesthouse`), 14 m off the line, at 62.891 km. Second arm again: no
  temple falls 25–30 km past 32.08 km
- **Distance** 30.808 km between the boundary vertices against **30.8 km** declared. Shipped
  slice 30.691 km, ratio 0.9965, `passedGate: true`. Previously declared: **none**
- **Places** 37 filed on the stage; `ways/report.json` drops none of them
- **Grounding the text cites**
  - "the section's first temple is still 14.7 km beyond where it ends" — `temple-24` 77.547 −
    62.891 = **14.656 km**
  - "Twenty-four of the thirty-seven places recorded here are bus stops" — 24 of the 37
    features with `stageIndex: 1` carry `subtype: bus_stop`, against 4 vending machines, 3
    churches, 2 guesthouses, 1 convenience store, 1 clinic, 1 cafe and 1 toilet
  - "Kumano Shrine and Myōken-gū inside the first 7 km" —
    `wp-osm-sacred_site-node11627123070` / `node/11627123070` (熊野神社, 7 m off, 38.014 km,
    **5.935 km** into the day) and `wp-osm-sacred_site-node11636162358` / `node/11636162358`
    (妙見宮, 50 m, 38.773 km, **6.694 km** in). Both `sacred_site` / `church`; both are
    romanised readings of their own `name` strings, as Awa romanised 長戸庵 and 柳水庵
  - "Meitokuji at 44.0 km" — `wp-osm-sacred_site-node11400122769` / `node/11400122769`
    (`sacred_site` / `church`, name "Meitokuji", `ja` 明徳寺(東洋大師)), 68 m off, at
    **43.968 km**. The Latin name is the file's own
  - "nothing at all is marked for 9.4 km, the longest unrecorded stretch of the day" —
    `node/599413882` (野根, bus stop, 97 m, 44.904 km) to `node/599413881` (水尻, bus stop,
    7 m, 54.266 km) = **9.362 km**, against a next-longest gap on this stage of 2.533 km
  - "It ends where the day before it ended, at a bed" — both days' `end` blocks name an
    `accommodation` waypoint, each under the cut's second arm
  - "Tokumasu Minshuku, 62.9 km into the section" — 62.891 km

```
theme:      Twenty-four bus stops, and still no temple
narrative:  A second day, 30.8 km, and the section's first temple is still 14.7 km beyond where it ends. Twenty-four of the thirty-seven places recorded here are bus stops. Three sacred places break that run early — Kumano Shrine and Myōken-gū inside the first 7 km, Meitokuji at 44.0 km — and then nothing at all is marked for 9.4 km, the longest unrecorded stretch of the day. It ends where the day before it ended, at a bed: Tokumasu Minshuku, 62.9 km into the section.
reflection: Two days, 62.9 km, and no temple yet — what are you walking toward while the thing you are walking toward has not appeared?
```

**Open.** Not reviewed. Two things. "Three sacred places" uses Awa's wording for
church-subtype nodes, but two of the three are then given as "Shrine" and "gū" on the strength
of their own names — a reviewer should decide whether that mixture is honest or fussy. And the
reflection is the one place in the fifteen that asks about the walker's intention rather than
about the day's shape.

- [ ] shikoku-88-tosa stage 1

---

### shikoku-88-tosa stage 2 — Tokumasu Minshuku to Kongocho-ji (Temple 26)

- **Start** Tokumasu Minshuku — `node/10810952434`, 14 m off the line, at 62.891 km
- **End** Kongōchō-ji (Temple 26) — `temple-26`, 5 m off the line, at 88.082 km. First arm:
  25.19 km past the previous day's end, inside the band and nearest 27.5 km of the temples in
  it
- **Distance** 25.223 km between the boundary vertices against **25.2 km** declared. Shipped
  slice 25.106 km, ratio 0.9963, `passedGate: true`. Previously declared: **none**
- **Places** 61 filed on the stage, the most of any day in the section (22 / 37 / 61 / 56 /
  47 / 26 / 20 / 8 / 6 / 21 / 19 / 14 / 20 / 6 / 9). `ways/report.json` drops none of them
- **Grounding the text cites**
  - "Two days and 62.9 km have passed with no temple on them" — no feature with
    `stageIndex: 0` or `stageIndex: 1` carries a `templeNumber`; the day starts at 62.891 km
  - "this day reaches the first 14.7 km in" — `temple-24` 77.547 − 62.891 = **14.656 km**
  - "Hotsumisaki-ji, then Shinshō-ji 6.7 km on, then Kongōchō-ji 3.8 km after that" —
    `temple-24` 77.547 (22 m off), `temple-25` 84.233 (14 m), `temple-26` 88.082 (5 m);
    steps **6.686** and **3.849 km**
  - "the shortest step between any two temples in Tosa" — 3.849 against the full step list in
    the section preamble, whose next-shortest is 6.074 (Temple 31 → 32)
  - "Sixty-one places stand on this day, more than on any other in the section" — the
    per-stage counts above
  - "forty-four of them are bus stops" — 44 of the 61 carry `subtype: bus_stop`
  - "Three temples inside 10.5 km" — 88.082 − 77.547 = **10.535 km**
  - "after seventy-seven and a half kilometres with none" — `temple-24` at 77.547 km, the
    section's first step

```
theme:      The first temple, and then two more
narrative:  Two days and 62.9 km have passed with no temple on them; this day reaches the first 14.7 km in. Hotsumisaki-ji, then Shinshō-ji 6.7 km on, then Kongōchō-ji 3.8 km after that — the shortest step between any two temples in Tosa, and the day ends at its gate. Sixty-one places stand on this day, more than on any other in the section, and forty-four of them are bus stops. Three temples inside 10.5 km, after seventy-seven and a half kilometres with none.
reflection: Seventy-seven kilometres for the first gate and ten and a half for the next two — which of those two rhythms is the pilgrimage?
```

**Open.** Not reviewed. This day's 61 places include the bus stop named "Cape Muroto"
(`node/599495991`, 231 m off, 76.842 km), the hotel `node/1393141616`, the shrines
`node/5549137522` Gosho Shrine and `node/1275277197` 龍宮厳, and 室戸病院 — none of them is
named, because the narrative chose the temple spacing over an inventory. A reviewer may think
a day this dense deserves one place named that is not a temple.

- [ ] shikoku-88-tosa stage 2

---

### shikoku-88-tosa stage 3 — Kongocho-ji (Temple 26) to Konomine-ji (Temple 27)

- **Start** Kongōchō-ji (Temple 26) — `temple-26`, 5 m off the line, at 88.082 km
- **End** Kōnomine-ji (Temple 27) — `temple-27`, 53 m off the line, at 116.629 km. First arm:
  28.55 km past the previous day's end, inside the band
- **Distance** 28.527 km between the boundary vertices against **28.5 km** declared. Shipped
  slice 28.335 km, ratio 0.9942, `passedGate: true`. Previously declared: **none**
- **Places** 56 filed on the stage; `ways/report.json` drops none of them
- **Grounding the text cites**
  - "Kongōchō-ji to Kōnomine-ji is 28.5 km" — 116.629 − 88.082 = **28.547 km**
  - "the only one of Tosa's sixteen temple-to-temple legs that falls inside the 25 to 30 km
    band the day cut looks in" — the sixteen steps in the section preamble; 28.547 is the only
    value in [25, 30]. The next nearest are 14.529 below it and 38.365 above
  - "Nahari comes 18.9 km in, the first town the section records" —
    `wp-osm-town-node3075229968` / `node/3075229968` (`town` / `town`, 奈半利町), 99 m off, at
    **107.019 km**, 18.937 km past the day's start. It is the earliest of the section's eight
    `type: town` features (107.019, 130.193, 153.339, 205.287, 247.552, 280.358, 318.350,
    406.681)
  - "Fifty-six places stand on the day and forty of them are bus stops" — 56 features with
    `stageIndex: 3`, 40 with `subtype: bus_stop`
  - "two more waypoints sit within 15 m of Kōnomine-ji itself — a shrine, and a second entry
    carrying the temple's own name" — `wp-osm-sacred_site-node408839221` / `node/408839221`
    (神峯神社, 135 m off) projects at **116.62895 km**, the same point as `temple-27`; and
    `wp-osm-sacred_site-node408839421` / `node/408839421` (name "27 Kōnomine-ji", `ja`
    第27番札所 神峯寺, 5 m off) projects **14.20 m** earlier. The second is the exact case
    `metadata.json`'s `provenance` cites when it explains why "temple" in the cut's rule means
    a `templeNumber` and not a `sacred_site` named like one

```
theme:      One leg, one day
narrative:  Kongōchō-ji to Kōnomine-ji is 28.5 km, and it is the only one of Tosa's sixteen temple-to-temple legs that falls inside the 25 to 30 km band the day cut looks in. So this day is a leg exactly: one gate to the next, with nothing for the rule to choose between. Nahari comes 18.9 km in, the first town the section records. Fifty-six places stand on the day and forty of them are bus stops, and two more waypoints sit within 15 m of Kōnomine-ji itself — a shrine, and a second entry carrying the temple's own name.
reflection: The one day here that is also a single leg between two gates — does knowing that change how you walk it?
```

**Open.** Not reviewed. "with nothing for the rule to choose between" describes the cut, not
the walk, and it is the most machinery-facing sentence in the fifteen; a reviewer should
decide whether a walker wants to be told how the day was chosen. The last clause is a fact
about the *file* rather than about the road — two waypoints for one place — and is included
because the app will draw both.

- [ ] shikoku-88-tosa stage 3

---

### shikoku-88-tosa stage 4 — Konomine-ji (Temple 27) to 黒潮温泉ホテル

- **Start** Kōnomine-ji (Temple 27) — `temple-27`, 53 m off the line, at 116.629 km
- **End** 黒潮温泉ホテル — `wp-osm-accommodation-node1762646861` / `node/1762646861`
  (`accommodation` / `hotel`), 57 m off the line, at 152.389 km. Second arm: no temple falls
  25–30 km past 116.63 km
- **Distance** 35.781 km between the boundary vertices against **35.8 km** declared. Shipped
  slice 35.579 km, ratio 0.9938, `passedGate: true`. Previously declared: **none**
- **Places** 47 filed on the stage. `ways/report.json` drops 1 as off route:
  `wp-osm-transport-node8543216547` ("Aki General Hospital", あき総合病院前, a
  `train_station`, 312 m). **It is not counted in the eleven stations below**
- **Grounding the text cites**
  - "Kōnomine-ji to Dainichi-ji is 38.4 km and this day takes 35.8 of it" — `temple-28`
    154.994 − `temple-27` 116.629 = **38.365 km**; the day's span is 35.781
  - "no temple stands on it at all" — none of the 47 features with `stageIndex: 4` carries a
    `templeNumber`
  - "eleven railway stations" — 12 of the 47 carry `subtype: train_station` and one of the 12
    is the 312 m drop, leaving **11** inside the build's 300 m: Tōnohama 120.755,
    Shimoyama 123.135, Ioki 127.804, Kyūjōmae 131.825, Ananai 134.458, Akano 138.731,
    Wajiki 140.246, Nishibun 142.024, Yasu 146.483, Kagami 148.356, Akaoka 149.768 km
  - "twelve public toilets and ten convenience stores" — 12 `subtype: toilet` and 10
    `subtype: convenience_store`, all 22 inside 300 m
  - "two bus stops here, against forty on the day before" — 2 of the 47 carry
    `subtype: bus_stop`, against 40 on stage 3, 44 on stage 2 and 24 on stage 1
  - "The city of Aki comes at 130.2 km" — `wp-osm-town-node304660986` / `node/304660986`
    (`town` / `city`, 安芸市), 120 m off, at **130.193 km**
  - "a viewpoint at 137.6" — `wp-osm-viewpoint-node3268703474` / `node/3268703474`
    (`viewpoint`), name 赤野休憩所, 35 m off, at **137.561 km**. Called "a viewpoint" and not
    named, because the name is a rest-area name and the type is the file's
  - "ends at a hotel at 152.4 km, 2.6 km short of the temple it has been walking toward" —
    `node/1762646861` at 152.389 km; 154.994 − 152.389 = **2.605 km**

```
theme:      Thirty-eight kilometres between two temples
narrative:  Kōnomine-ji to Dainichi-ji is 38.4 km and this day takes 35.8 of it, so no temple stands on it at all. What the record holds changes character: eleven railway stations, twelve public toilets and ten convenience stores, against the bus stops that carried the three days before — two bus stops here, against forty on the day before. The city of Aki comes at 130.2 km and a viewpoint at 137.6. The day ends at a hotel at 152.4 km, 2.6 km short of the temple it has been walking toward.
reflection: Two temples thirty-eight kilometres apart, and neither of them on this day — what is a day worth that is only the space between?
```

**Open.** Not reviewed. "What the record holds changes character" is a reading of a type
count, and the counts are of OpenStreetMap coverage rather than of what stands by the road — a
reviewer should decide whether the sentence carries its qualifier. The comparison to "the
three days before" is the sharpest of several cross-stage references here: stages 1, 2, 4, 7,
8, 10, 11 and 14 all measure themselves against other days. Awa's stage 1 note raised the same
question — whether a stage package read on its own can carry a sentence about yesterday — and
it is still open. It should be settled once for the pilgrimage.

- [ ] shikoku-88-tosa stage 4

---

### shikoku-88-tosa stage 5 — 黒潮温泉ホテル to Chikurin-ji (Temple 31)

- **Start** 黒潮温泉ホテル — `node/1762646861`, 57 m off the line, at 152.389 km
- **End** Chikurin-ji (Temple 31) — `temple-31`, 72 m off the line, at 177.823 km. First arm:
  25.43 km past the previous day's end, the only temple in the band
- **Distance** 25.412 km between the boundary vertices against **25.4 km** declared. Shipped
  slice 25.166 km, ratio 0.9908, `passedGate: true`. Previously declared: **none**
- **Places** 26 filed on the stage; `ways/report.json` drops none of them
- **Grounding the text cites**
  - "After 38.4 km with none" — the Temple 27 → 28 step, **38.365 km**
  - "Dainichi-ji stands 2.6 km in" — `temple-28` 154.994 − 152.389 = **2.605 km**
  - "Tosa Kokubun-ji 9.2 km after it, Zenraku-ji 7.1 km after that, and Chikurin-ji 6.5 km
    further" — `temple-29` 164.205 (34 m off), `temple-30` 171.284 (21 m), `temple-31`
    177.823 (72 m); steps **9.211, 7.079, 6.539 km**
  - "closing the day at 177.8 km — 22.8 km from the first of them to the last" —
    177.823 − 154.994 = **22.829 km**
  - "The city of Konan stands at 153.3 km, inside the day's first kilometre" —
    `wp-osm-town-node1760556401` / `node/1760556401` (`town` / `city`, 香南市), 40 m off, at
    **153.339 km**, 0.950 km past the day's start place and 0.929 km past its boundary vertex.
    The sentence gives the absolute position and the containing kilometre rather than a
    rounded distance, because the two readings round differently
  - "five convenience stores stand on the day" — 5 of the 26 carry
    `subtype: convenience_store`
  - "Twenty-six places in all, four of them temples" — 26 features with `stageIndex: 5`, of
    which `temple-28`, `temple-29`, `temple-30` and `temple-31` carry a `templeNumber`

```
theme:      Four temples in twenty-three kilometres
narrative:  After 38.4 km with none, four temples fall inside this one day. Dainichi-ji stands 2.6 km in, Tosa Kokubun-ji 9.2 km after it, Zenraku-ji 7.1 km after that, and Chikurin-ji 6.5 km further, closing the day at 177.8 km — 22.8 km from the first of them to the last. The city of Konan stands at 153.3 km, inside the day's first kilometre, and five convenience stores stand on the day. Twenty-six places in all, four of them temples.
reflection: Four gates in twenty-three kilometres after thirty-eight with none — how quickly can attention change its pace?
```

**Open.** Not reviewed. The theme rounds 22.829 up to "twenty-three" where the narrative says
22.8, on the Awa stage 3 precedent. **Four places in this section take that licence** and a
reviewer should rule on all four together: this theme (22.829 → "twenty-three"), stage 10's
reflection (82.712 → "eighty-three"), stage 11's theme (33.557 → "thirty-four", the loosest)
and stage 13's theme and reflection (35.738 → "thirty-six"). Every one is a spelled-out word
in a theme or reflection, and every one is accompanied by the file's own decimal in the same
stage's narrative.

- [ ] shikoku-88-tosa stage 5

---

### shikoku-88-tosa stage 6 — Chikurin-ji (Temple 31) to Tosa

- **Start** Chikurin-ji (Temple 31) — `temple-31`, 72 m off the line, at 177.823 km
- **End** Tosa — `wp-osm-town-node697489675` / `node/697489675` (`town` / `city`, 土佐市),
  107 m off the line, at 205.287 km. Second arm: no temple falls 25–30 km past 177.82 km
- **Distance** 27.446 km between the boundary vertices against **27.5 km** declared. Shipped
  slice 27.295 km, ratio 0.9926, `passedGate: true`. Previously declared: **none**
- **Places** 20 filed on the stage; `ways/report.json` drops none of them
- **Grounding the text cites**
  - "Zenjibu-ji 6.1 km in, Sekkei-ji 8.2 km after it, Tanema-ji 6.3 km after that" —
    `temple-32` 183.897 (52 m off), `temple-33` 192.089 (35 m), `temple-34` 198.433 (14 m);
    steps **6.074, 8.192, 6.344 km** from 177.823
  - "Kiyotaki-ji, the next one, stands 30.5 km from where this day began: 457 m past the
    30 km edge of the band the cut ends days in" — `temple-35` at 208.280 km;
    208.280 − 177.823 = **30.457 km**, i.e. **457 m** outside [25, 30]. This is why the
    stage's committed `end.note` reads "No temple falls 25-30 km past the previous day's end"
  - "the day ends at Tosa instead, the city, at 205.3 km" — `node/697489675`, `subtype: city`,
    at **205.287 km**
  - "Twenty places are recorded on it, four of them shrines and four of them hospitals" — 20
    features with `stageIndex: 6`; 4 carry `subtype: hospital`
    (`node/1423743295`, `node/1423739867`, `node/1423729699`, `node/1423737330`) and 4 carry
    `subtype: church` with names ending 神社 — `node/5369299652` 妙見宮星神社,
    `node/1085588477` 石土神社, `node/5447091866` 住吉神社, `node/5447091847` 嶋宮神社. The
    word "shrines" is taken from those names, not from the subtype

```
theme:      Four hundred and fifty-seven metres out of the band
narrative:  Three temples come early — Zenjibu-ji 6.1 km in, Sekkei-ji 8.2 km after it, Tanema-ji 6.3 km after that — and then the day has to find somewhere to stop. Kiyotaki-ji, the next one, stands 30.5 km from where this day began: 457 m past the 30 km edge of the band the cut ends days in. So the day ends at Tosa instead, the city, at 205.3 km. Twenty places are recorded on it, four of them shrines and four of them hospitals.
reflection: Four hundred and fifty-seven metres decided where this day ends. How much of any day is decided that finely?
```

**Open.** Not reviewed. This is the entry that most openly narrates the cutting rule rather
than the walk, and the theme is a number from the rule and not from the ground. It is here
because the near-miss is real and re-derivable, and because the alternative was a day
described only by its three temples; a reviewer should weigh that trade directly. Note also
that the day ends at a `town` node 107 m off the line — the walker passes near Tosa, and the
narrative says "ends at Tosa", which is the anchor's own wording in `stages.json`.

- [ ] shikoku-88-tosa stage 6

---

### shikoku-88-tosa stage 7 — Tosa to Ohenro Guest House Lilian

- **Start** Tosa — `node/697489675`, 107 m off the line, at 205.287 km
- **End** Ohenro Guest House Lilian — `wp-osm-accommodation-node11372865970` /
  `node/11372865970` (`accommodation` / `guesthouse`), 18 m off the line, at 226.422 km.
  Second arm: no temple falls 25–30 km past 205.27 km
- **Distance** 21.155 km between the boundary vertices against **21.1 km** declared. Shipped
  slice 20.916 km, ratio 0.9913, `passedGate: true`. Previously declared: **none**
- **Places** 8 filed on the stage. `ways/report.json` drops 1 as off route:
  `wp-osm-accommodation-node12897978736` (民泊汐風, 351 m, at 220.306 km). **It is not
  cited**, and it is the reason the narrative says "one thing reaches the day" rather than
  "the record holds one thing" — the record holds two
- **Grounding the text cites**
  - "Kiyotaki-ji stands 3.0 km into the day" — `temple-35` 208.280 − 205.287 = **2.993 km**
  - "Shōryū-ji 14.5 km beyond it" — `temple-36` 222.809 (7 m off); 222.809 − 208.280 =
    **14.529 km**
  - "one thing reaches the day: Shōnen-ji, 10.3 km after the first gate" —
    `wp-osm-sacred_site-node5459380601` / `node/5459380601` (`sacred_site` / `church`, 正念寺),
    174 m off, at **218.587 km**; 218.587 − 208.280 = **10.307 km**, the third-longest gap
    between two carried places anywhere in the section
  - "Seven places reach it in all, the fewest so far in Tosa" — 8 filed less the 351 m drop =
    **7** within the build's 300 m, against 22 / 37 / 61 / 56 / 46 / 26 / 20 carried on the
    days before
  - "Past Shōryū-ji the next temple is 58.1 km away" — `temple-37` 280.878 − 222.809 =
    **58.069 km**
  - "no temple falls where a day beginning here would end" — this stage's committed `end.note`
  - "21.1 km, the shortest day the section has cut so far" — the spans 32.071, 30.808, 25.223,
    28.527, 35.781, 25.412, 27.446, **21.155**
  - A second church-subtype twin stands on this day: `node/3919866480` (name "35 Kiyotaki-ji",
    第35番札所 清滝寺, 5 m off) projects onto the same point as `temple-35`. It is not cited

```
theme:      Two gates, and almost nothing between them
narrative:  Kiyotaki-ji stands 3.0 km into the day and Shōryū-ji 14.5 km beyond it, and between them one thing reaches the day: Shōnen-ji, 10.3 km after the first gate. Seven places reach it in all, the fewest so far in Tosa. Past Shōryū-ji the next temple is 58.1 km away, and no temple falls where a day beginning here would end, so it stops at the Ohenro Guest House Lilian — 21.1 km, the shortest day the section has cut so far.
reflection: Twenty-one kilometres, two gates, and one marked thing between them — what fills a day the record leaves blank?
```

**Open.** Not reviewed. "reaches the day" is doing careful work — a lodging 351 m off the line
is in the file and not in the package — and a reviewer should decide whether a walker can be
expected to read that distinction, or whether the sentence should have said "within 300 m of
the route" outright.

- [ ] shikoku-88-tosa stage 7

---

### shikoku-88-tosa stage 8 — Ohenro Guest House Lilian to 民宿あわの里

- **Start** Ohenro Guest House Lilian — `node/11372865970`, 18 m off the line, at 226.422 km
- **End** 民宿あわの里 — `wp-osm-accommodation-node12898846612` / `node/12898846612`
  (`accommodation` / `hotel`), 207 m off the line, at 252.978 km. Second arm again
- **Distance** 26.554 km between the boundary vertices against **26.6 km** declared. Shipped
  slice 26.310 km, ratio 0.9891, `passedGate: true`. Previously declared: **none**
- **Places** 6 filed on the stage, tied with stage 13 for the fewest in the section;
  `ways/report.json` drops none of them
- **Grounding the text cites**
  - "walks 19.4 km before the record marks a single place — the longest such opening anywhere
    in Tosa" — the day's first place after its start anchor is
    `wp-osm-supply-node5568013724` / `node/5568013724` ("7-Eleven", 273 m off) at
    **245.827 km**; 245.827 − 226.422 = **19.405 km**. No other day's first place stands more
    than 6.5 km past its start
  - "two convenience stores" — `node/5568013724` and `wp-osm-supply-node13419252122` /
    `node/13419252122` ("Dawson", 151 m off, 247.138 km)
  - "the city of Susaki at 247.6 km" — `wp-osm-town-node697482793` / `node/697482793`
    (`town` / `city`, 須崎市), 44 m off, at **247.552 km**
  - "a station, a toilet" — `wp-osm-transport-node8383580512` / `node/8383580512`
    (`train_station`, 79 m, 252.730 km) and `wp-osm-supply-node12898846611` /
    `node/12898846611` (`toilet`, 53 m, 252.857 km). The station's name is **"Awa"** (安和)
    and is deliberately not given; see "What Tosa refused" above
  - "the day's end at 253.0 km" — `node/12898846612` at **252.978 km**
  - "Six places on 26.6 km, the fewest of any day here so far" — 6 filed and 6 carried,
    against 7 carried on stage 7
  - "the next stands 54.5 km beyond where this one began" — `temple-37` 280.878 − 226.422 =
    **54.456 km**

```
theme:      Nineteen kilometres before anything is marked
narrative:  This day walks 19.4 km before the record marks a single place — the longest such opening anywhere in Tosa. What comes after comes quickly: two convenience stores, the city of Susaki at 247.6 km, a station, a toilet, and the day's end at 253.0 km. Six places on 26.6 km, the fewest of any day here so far, and no temple on it: the next stands 54.5 km beyond where this one began.
reflection: Nineteen kilometres and nothing on the map to mark them — is that an absence, or a kind of quiet?
```

**Open.** Not reviewed. The reflection reads a coverage gap as an experience, which is the
error Awa's stage 4 note warns about; it is written as a question with two answers on purpose,
and a reviewer should decide whether the qualifier "on the map" does enough. The unnamed
station is the only place in the fifteen where a fact is withheld for legibility rather than
for grounding.

- [ ] shikoku-88-tosa stage 8

---

### shikoku-88-tosa stage 9 — 民宿あわの里 to Iwamoto-ji (Temple 37)

- **Start** 民宿あわの里 — `node/12898846612`, 207 m off the line, at 252.978 km
- **End** Iwamoto-ji (Temple 37) — `temple-37`, 21 m off the line, at 280.878 km. First arm:
  27.90 km past the previous day's end, the nearest temple to 27.5 km in the band
- **Distance** 27.899 km between the boundary vertices against **27.9 km** declared. Shipped
  slice 27.698 km, ratio 0.9928, `passedGate: true`. Previously declared: **none**
- **Places** 21 filed on the stage; `ways/report.json` drops none of them
- **Grounding the text cites**
  - "Iwamoto-ji closes this day at 280.9 km, 58.1 km on from Shōryū-ji" — `temple-37` at
    280.878 km; 280.878 − `temple-36` 222.809 = **58.069 km**
  - "the third-widest gap between temples in Tosa" — the step list ranks 82.712, 77.547,
    **58.069**, 54.911, 38.365
  - "the day walks the last 27.9 of it" — the day's span, 27.899 km
  - "six stations, five places to eat" — 6 of the 21 carry `subtype: train_station`
    (Tosa-Kure 260.730, Kageno 271.603, Rokutanji 273.671, Niida 275.801, and the two
    Kubokawa entries below) and 5 carry `subtype: restaurant`
  - "the last 0.6 km takes six of the day's twenty-one places at once — two Kubokawa
    stations, the town of Shimanto, two places to stay, a toilet" —
    `wp-osm-transport-node12190171763` / `node/12190171763` (Kubokawa 窪川, 59 m, 280.231),
    `wp-osm-transport-node8383599017` / `node/8383599017` (Kubokawa 窪川, 96 m, 280.275),
    `wp-osm-town-node697482801` / `node/697482801` (`town` / `town`, 四万十町, 134 m,
    280.358), `wp-osm-accommodation-node6905122286` / `node/6905122286` (まるか旅館,
    `subtype: hotel`, 59 m, 280.393), `wp-osm-accommodation-node12901241596` /
    `node/12901241596` (木のホテル, `subtype: hotel`, 10 m, 280.637) and
    `wp-osm-supply-node13166874401` / `node/13166874401` (`toilet`, 46 m, 280.794). The
    earliest is **0.647 km** before the temple; all six are inside 300 m
  - "and the temple after them" — `temple-37` at 280.878 km, last on the day

```
theme:      The last six hundred metres hold the day
narrative:  Iwamoto-ji closes this day at 280.9 km, 58.1 km on from Shōryū-ji — the third-widest gap between temples in Tosa — and the day walks the last 27.9 of it. For most of that the record runs thin and strung along a railway: six stations, five places to eat. Then the last 0.6 km takes six of the day's twenty-one places at once — two Kubokawa stations, the town of Shimanto, two places to stay, a toilet — and the temple after them.
reflection: Fifty-eight kilometres between two gates, and most of what the day holds arrives in its last six hundred metres. What does nearness do to distance?
```

**Open.** Not reviewed. "most of what the day holds" is six of twenty-one, which is not most;
the sentence means most of what a walker would stop for, and a reviewer should decide whether
that reading survives without the qualifier. "strung along a railway" is a reading of six
station waypoints.

- [ ] shikoku-88-tosa stage 9

---

### shikoku-88-tosa stage 10 — Iwamoto-ji (Temple 37) to Henro House Maaru

- **Start** Iwamoto-ji (Temple 37) — `temple-37`, 21 m off the line, at 280.878 km
- **End** Henro House Maaru — `wp-osm-accommodation-node11377475869` / `node/11377475869`
  (`accommodation` / `guesthouse`), 41 m off the line, at 309.050 km. Second arm: no temple
  falls 25–30 km past 280.88 km — the next is 82.71 km on
- **Distance** 28.172 km between the boundary vertices against **28.2 km** declared. Shipped
  slice 27.982 km, ratio 0.9923, `passedGate: true`. Previously declared: **none**
- **Places** 19 filed on the stage; `ways/report.json` drops none of them
- **Grounding the text cites**
  - "Iwamoto-ji to Kongōfuku-ji is 82.7 km, the widest gap between two temples in this
    section" — `temple-38` 363.590 − `temple-37` 280.878 = **82.712 km**, the largest in the
    step list, and the 82.7 km `metadata.json`'s `description` declares
  - "the cut spends three whole days and the first 59 m of a fourth crossing it" — the
    day-ends at 309.050, 342.607 and 363.531 km all lie inside the gap, and 363.590 − 363.531
    = **58.78 m** separates the last of them from the temple
  - "This is the first of the three, 28.2 km" — the day's span, 28.172 km
  - "five railway stations" — `node/8383599018` Kaina (荷稲, 254 m, 292.169),
    `node/8383599019` Iyoki (伊与喜, 22 m, 297.219), `node/8383599020` Tosa-Saga (土佐佐賀,
    50 m, 300.647), `node/8383599021` Saga-Kōen (佐賀公園, 17 m, 303.009),
    `node/8383599022` Tosa-Shirahama (土佐白浜, 93 m, 304.349)
  - "three shrines" — `node/13044815801` (Iyoki Tenmangu Shrine, 天満宮, 229 m, 290.201),
    `node/10810977710` (八坂神社, 14 m, 291.969), `node/13044816301` (Kumano Shrine, 熊野神社,
    87 m, 297.374). All three `sacred_site` / `church`; "shrines" is taken from their names
  - "three places to eat" — `node/6907495685` (満州軒, 138 m, 281.399), `node/12905484056`
    (ニュー白浜, 14 m, 304.587), `node/11377020569` (Kakegawa Takoyaki, 8 m, 307.264)
  - "at 303.2 km the only water source recorded anywhere in Tosa, a fountain" —
    `wp-osm-water_source-node10810968860` / `node/10810968860` (`water_source` / `fountain`,
    unnamed), 31 m off, at **303.162 km**. It is the section's only `type: water_source`
    feature, 1 of 372
  - "with 54.5 km of the gap still ahead" — 363.590 − 309.050 = **54.540 km**
  - "this day covers a third of it" — 28.172 / 82.712 = **0.341**

```
theme:      The first of three days in one gap
narrative:  Iwamoto-ji to Kongōfuku-ji is 82.7 km, the widest gap between two temples in this section, and the cut spends three whole days and the first 59 m of a fourth crossing it. This is the first of the three, 28.2 km. Nineteen places stand on it — five railway stations, three shrines, three places to eat — and at 303.2 km the only water source recorded anywhere in Tosa, a fountain. It ends at a henro house at 309.0 km, with 54.5 km of the gap still ahead.
reflection: Eighty-three kilometres between one gate and the next, and this day covers a third of it — how do you hold a distance you cannot finish?
```

**Open.** Not reviewed. The reflection rounds 82.712 up to "eighty-three" where the narrative
says 82.7, the same licence stage 5's theme takes. "the only water source recorded anywhere in
Tosa" is a claim about OpenStreetMap coverage in a sentence a thirsty walker will read as a
claim about water; `metadata.json`'s `logistics.waterNotes` says vending machines are
ubiquitous, and this section records nine of them, which is the fact that keeps the sentence
from being dangerous. A reviewer should check that judgement.

- [ ] shikoku-88-tosa stage 10

---

### shikoku-88-tosa stage 11 — Henro House Maaru to 民宿いさりび

- **Start** Henro House Maaru — `node/11377475869`, 41 m off the line, at 309.050 km
- **End** 民宿いさりび — `wp-osm-accommodation-node12908978212` / `node/12908978212`
  (`accommodation` / `hotel`), 13 m off the line, at 342.607 km. Second arm again
- **Distance** 33.557 km between the boundary vertices against **33.6 km** declared. Shipped
  slice 33.440 km, ratio 0.9952, `passedGate: true`. Previously declared: **none**
- **Places** 14 filed on the stage. `ways/report.json` drops 1 as off route:
  `wp-osm-supply-node11377157869` (unnamed `toilet`, 331 m, at 317.063 km). **Not cited**
- **Grounding the text cites**
  - "The middle day of the 82.7 km gap, and the longest of the three at 33.6 km" — spans
    28.172, **33.557**, 20.918 for stages 10, 11 and 12
  - "Thirteen places reach it" — 14 filed less the 331 m drop = **13** inside 300 m
  - "Four railway stations come in the first 7.4 km" — `node/8383599023` Ariigawa (有井川,
    67 m, 309.658), `node/8383599024` Tosa-Kamikawaguchi (土佐上川口, 232 m, 311.161),
    `node/8383599025` Uminoōmukae (海の王迎, 180 m, 312.153), `node/8383599028` Tosa-Irino
    (土佐入野, 276 m, 316.478); the last is **7.428 km** past the day's start
  - "a viewpoint and the town of Kuroshio at 318.4 km" —
    `wp-osm-viewpoint-node6851902953` / `node/6851902953` (`viewpoint`,
    土佐西南大規模公園球技場, 20 m, 317.877) and `wp-osm-town-node697489702` /
    `node/697489702` (`town` / `town`, 黒潮町, 184 m, **318.350 km**)
  - "7.3 km with nothing marked, a convenience store, a café and two toilets, then 7.5 km more
    with nothing marked" — 318.350 → `node/1800676598` (スリーエフ中村竹島店, 61 m, 325.657)
    = **7.307 km**; then `node/10819478831` (`toilet`, 63 m, 329.205),
    `node/10819497798` (Luce Café and Dining, `subtype: cafe`, 59 m, 335.062) and
    `node/10819508925` (`toilet`, 43 m, 335.126); then 335.126 → the day's end boundary at
    342.606 = **7.480 km**. The four are listed by kind rather than in order along the line
  - "the day ends at a minshuku at 342.6 km" — `node/12908978212` at 342.607 km. Its
    `subtype` is `hotel` and its name is 民宿いさりび; the narrative uses the name's own word
  - "No temple has stood on the line for 61.7 km" — 342.607 − `temple-37` 280.878 =
    **61.729 km**
  - "twenty-one still to the next" (reflection) — `temple-38` 363.590 − 342.607 =
    **20.983 km**

```
theme:      Thirteen places over thirty-four kilometres
narrative:  The middle day of the 82.7 km gap, and the longest of the three at 33.6 km. Thirteen places reach it. Four railway stations come in the first 7.4 km, then a viewpoint and the town of Kuroshio at 318.4 km — and after that the record almost stops: 7.3 km with nothing marked, a convenience store, a café and two toilets, then 7.5 km more with nothing marked before the day ends at a minshuku at 342.6 km. No temple has stood on the line for 61.7 km.
reflection: Sixty-two kilometres since the last gate and twenty-one still to the next — what keeps a day like this from being only transit?
```

**Open.** Not reviewed. The theme says "thirty-four kilometres" for a 33.557 km day, rounding
up rather than to the file's 33.6 — one of the four roundings listed under stage 5, and the
loosest of them. "the record almost stops" is a reading. An unnamed bus stop at 318.326 km is
skipped in the run-through of the day's places, which is selection, not error.

- [ ] shikoku-88-tosa stage 11

---

### shikoku-88-tosa stage 12 — 民宿いさりび to 金剛福寺宿坊

- **Start** 民宿いさりび — `node/12908978212`, 13 m off the line, at 342.607 km
- **End** 金剛福寺宿坊 — `wp-osm-accommodation-node9444928782` / `node/9444928782`
  (`accommodation` / `hostel`), 145 m off the line, at 363.531 km. Second arm: Temple 38 lies
  20.98 km past the day's start, **outside** the 25–30 km band, so the temple arm found
  nothing; the fallback arm is not band-confined and took the nearest named
  accommodation-or-town to 27.5 km that is within 500 m of the line
- **Distance** 20.918 km between the boundary vertices against **20.9 km** declared. Shipped
  slice 20.718 km, ratio 0.9913, `passedGate: true`. Previously declared: **none**
- **Places** 20 filed on the stage. `ways/report.json` drops **6** as off route — the
  1,751–2,080 m Ashizuri-area cluster tabled above. **None of the six is cited**, and 14
  reach the day
- **Grounding the text cites**
  - "Five places to stay stand in the first 3.4 km of this day, the tightest run of beds
    anywhere in Tosa" — `node/12908978212` (民宿いさりび, 13 m, 342.607),
    `wp-osm-accommodation-node12911869507` / `node/12911869507` (民宿くもも, 8 m, 343.031),
    `wp-osm-accommodation-node10819508622` / `node/10819508622` (Ōkinohama, 88 m, 344.953),
    `wp-osm-accommodation-node1404095643` / `node/1404095643` (Kaiyu-Inn 海癒, 31 m,
    345.681), `wp-osm-accommodation-node10819478832` / `node/10819478832` (大岐マリン, 18 m,
    345.970). Span **3.363 km**. No other 3.4 km window on this section's line holds five
    carried `accommodation` waypoints, and outside this cluster no such window holds more
    than two
  - "then it goes 17.6 km to its end" — 363.531 − 345.970 = **17.561 km**
  - "Kongōfuku-ji is 21.0 km from where the day began — too near for the 25 to 30 km band" —
    `temple-38` 363.590 − 342.607 = **20.983 km**
  - "the day stops 59 m short of the gate, at a lodging that carries the temple's own name" —
    `node/9444928782` projects at 363,530.99 m and `temple-38` at 363,589.77 m, a difference
    of **58.78 m**. The lodging's `name` is 金剛福寺宿坊 and the temple's `nameLocalized.ja`
    is 金剛福寺; the claim is that one string contains the other, and nothing more
  - "In the last 200 m before it the record gathers two viewpoints, two toilets and a bus stop
    named Cape Ashizuri" — `wp-osm-viewpoint-node1275225550` / `node/1275225550` (天狗の鼻,
    179 m, 363.355), `wp-osm-viewpoint-node4984012722` / `node/4984012722` (足摺岬展望台,
    111 m, 363.422), `wp-osm-supply-node1275225668` / `node/1275225668` (`toilet`, 15 m,
    363.428), `wp-osm-supply-node1275225604` / `node/1275225604` (`toilet`, 15 m, 363.517)
    and `wp-osm-transport-node9444928826` / `node/9444928826` (`bus_stop`, name "Cape
    Ashizuri", `ja` 足摺岬, 69 m, 363.524). The earliest is **176 m** before the day's end.
    Only the bus stop's name is given, and only as a name

```
theme:      Fifty-nine metres short of a gate
narrative:  Five places to stay stand in the first 3.4 km of this day, the tightest run of beds anywhere in Tosa; then it goes 17.6 km to its end. Kongōfuku-ji is 21.0 km from where the day began — too near for the 25 to 30 km band the cut ends days in — so no temple qualified, and the day stops 59 m short of the gate, at a lodging that carries the temple's own name. In the last 200 m before it the record gathers two viewpoints, two toilets and a bus stop named Cape Ashizuri.
reflection: Fifty-nine metres from the gate, and the day ends anyway, because the rule measured from somewhere else. Is arriving a place, or a decision?
```

**Open.** Not reviewed. Three things. The narrative and reflection both explain the day by the
cutting rule, which is the deepest this section goes into its own machinery — but the fact is
extraordinary and wholly re-derivable, and hiding it would leave a 20.9 km day looking
arbitrary. "the tightest run of beds anywhere in Tosa" is a computed superlative over the 28
carried `accommodation` waypoints, not a claim about where beds actually are. And the
narrative says nothing at all about the six dropped waypoints, so a walker reading this day's
package sees no sign of a town 2 km off the line; the table above is the only record of it.

- [ ] shikoku-88-tosa stage 12

---

### shikoku-88-tosa stage 13 — 金剛福寺宿坊 to Ocean, River, Mountain Retreat

- **Start** 金剛福寺宿坊 — `node/9444928782`, 145 m off the line, at 363.531 km
- **End** Ocean, River, Mountain Retreat — `wp-osm-accommodation-node11535055771` /
  `node/11535055771` (`accommodation` / `guesthouse`), 24 m off the line, at 399.328 km.
  Second arm: no temple falls 25–30 km past 363.52 km
- **Distance** 35.816 km between the boundary vertices against **35.8 km** declared — the
  longest day in the section, 34 m longer than stage 4. Shipped slice 35.501 km, ratio 0.9916,
  `passedGate: true`. Previously declared: **none**
- **Places** 6 filed on the stage, tied with stage 8 for the fewest. `ways/report.json` drops
  **3** as off route: `node/11380474069` (Minshuku Tamura, 870 m), `node/5537156521`
  (Ashizuri Thermae, 1,120 m) and `node/4983997423` (足摺パシフィックホテル花椿, 1,486 m).
  All three are tabled above; **none is cited by name in the narrative**
- **Grounding the text cites**
  - "Kongōfuku-ji stands 59 m into this day" — `temple-38` at 363,589.77 m against the day's
    start anchor at 363,530.99 m = **58.78 m**. Measured from the stage's own boundary vertex
    (363,524.28 m) the figure is 65.48 m; the entry uses the anchor, so that stage 12's "59 m
    short" and this stage's "59 m into" are the same measurement read from both sides
  - "past it the record holds nothing for 35.7 km — the longest stretch in Tosa with nothing
    marked on it" — the next waypoint of any kind past 363.590 km is the day's own end at
    **399.328 km**, a span of **35.738 km**. Nothing projects into it, on this stage or any
    other. The section's next-longest such gap is stage 8's 19.405 km
  - "Six places are filed on the day and three of them are lodgings 0.9 to 1.5 km off the
    walked line, which this day never reaches" — the three drops above, at 870, 1,120 and
    1,486 m
  - "what is left is the temple, the lodging the day starts from, and the place it ends" — the
    three carried features are `node/9444928782`, `temple-38` and `node/11535055771`
  - "Kongōfuku-ji to Enkō-ji is 54.9 km, and this day takes 35.8 of them" — `temple-39`
    418.501 − `temple-38` 363.590 = **54.911 km**; the day's span is 35.816

```
theme:      One gate, then thirty-six kilometres unmarked
narrative:  Kongōfuku-ji stands 59 m into this day, and past it the record holds nothing for 35.7 km — the longest stretch in Tosa with nothing marked on it. Six places are filed on the day and three of them are lodgings 0.9 to 1.5 km off the walked line, which this day never reaches; what is left is the temple, the lodging the day starts from, and the place it ends. Kongōfuku-ji to Enkō-ji is 54.9 km, and this day takes 35.8 of them, all of it past the gate.
reflection: Thirty-six kilometres with nothing on the map to mark them — what do you notice when nothing is pointed out to you?
```

**Open.** Not reviewed. This is the entry where the gap between *the record* and *the road* is
widest: 35.7 km with no waypoint is a statement about OpenStreetMap and about this section's
walked line, and a walker will certainly pass things. The narrative says "the record holds"
and the theme says "unmarked", and a reviewer should decide whether that is enough, or whether
a 36 km stage with three places is a data gap that ought to be fixed before any text ships on
it at all. The theme also rounds 35.738 up to "thirty-six" where the narrative says 35.7.

- [ ] shikoku-88-tosa stage 13

---

### shikoku-88-tosa stage 14 — Ocean, River, Mountain Retreat to Enkō-ji (Temple 39)

- **Start** Ocean, River, Mountain Retreat — `node/11535055771`, 24 m off the line, at
  399.328 km
- **End** Enkō-ji (Temple 39) — `temple-39`, 21 m off the line, at 418.501 km. Section
  boundary; the anchor's coordinates and name are `metadata.json`'s `overview.endPoint`, and
  `shikoku-88-iyo` begins from the same point. The stage's committed `end.note` records that
  a boundary day ends at the boundary temple whatever its length, and that the lodging
  fallback does not apply
- **Distance** 19.161 km between the boundary vertices against **19.2 km** declared — the
  shortest day in the section. Shipped slice 19.049 km, ratio 0.9921, `passedGate: true`.
  Previously declared: **none**
- **Places** 9 filed on the stage; `ways/report.json` drops none of them
- **Grounding the text cites**
  - "19.2 km, the shortest day in Tosa" — the spans 32.071, 30.808, 25.223, 28.527, 35.781,
    25.412, 27.446, 21.155, 26.554, 27.899, 28.172, 33.557, 20.918, 35.816, **19.161**
  - "it ends at Enkō-ji — the section's own boundary, where Iyo begins from the same point" —
    `metadata.json`'s `osm.note` records that this section ends at Temple 39 "where
    shikoku-88-iyo begins", and both sections take the anchor verbatim from this section's
    `overview`
  - "a guest house at 402.1 km" — `wp-osm-accommodation-node12912519902` /
    `node/12912519902` (Guest House Kurousagi, `subtype: hotel`, 202 m off, **402.096 km**).
    Called "a guest house" from its name, not its subtype
  - "then Mihara at 406.7, the only village among the section's eight towns" —
    `wp-osm-town-node691562991` / `node/691562991` (`town` / `village`, 三原村), 12 m off, at
    **406.681 km**. Of the eight `type: town` features, one carries `subtype: village`, three
    `town` and four `city`
  - "Yamabiko Cafe just past it" — `wp-osm-food-node11532181369` / `node/11532181369`
    (`food` / `restaurant`, name "Yamabiko Cafe"), 29 m off, at **407.324 km**, 0.643 km past
    Mihara. Named rather than called a café, because its subtype is `restaurant`
  - "two toilets, a station at 415.9, a restaurant" — `node/10821759897` (160 m, 408.426),
    `node/10821758014` (49 m, 411.934), `wp-osm-transport-node9960792085` /
    `node/9960792085` (Hirata 平田, `train_station`, 158 m, **415.875 km**),
    `wp-osm-food-node8506196246` / `node/8506196246` (レストラン スワロー, 222 m, 416.080)
  - "a hospital inside the last kilometre" — `wp-osm-medical-node1423737263` /
    `node/1423737263` (`medical` / `hospital`, 幡多希望の家), 286 m off, at **417.885 km**,
    **0.616 km** before the section's end
  - "Kongōfuku-ji to Enkō-ji is 54.9 km, and this day is its last 19.2" — **54.911 km**, of
    which this day is the final 19.161
  - "Fifteen days, 418.5 km, sixteen gates" (reflection) — `stageCount` 15,
    `walkedLine.lengthKm` 418.501, and the 16 features carrying a `templeNumber`

```
theme:      The shortest day, and the last gate
narrative:  19.2 km, the shortest day in Tosa, and it ends at Enkō-ji — the section's own boundary, where Iyo begins from the same point. Nine places stand on it: a guest house at 402.1 km, then Mihara at 406.7, the only village among the section's eight towns, Yamabiko Cafe just past it, two toilets, a station at 415.9, a restaurant, and a hospital inside the last kilometre. Kongōfuku-ji to Enkō-ji is 54.9 km, and this day is its last 19.2.
reflection: Fifteen days, 418.5 km, sixteen gates — and the last of them is the next section's first. What do you set down here?
```

**Open.** Not reviewed. The reflection sums the whole section from inside one stage package,
and looks past the section boundary — the same thing Awa's stage 4 reflection does, and open
to the same objection that the package a walker reads does not contain the other fourteen
days. "sixteen gates" counts the sixteen `templeNumber` waypoints and so does not count Temple
23, which is where the section starts; a reviewer should decide whether that is the count a
walker would make.

- [ ] shikoku-88-tosa stage 14

---

## Sections with no drafted text yet

The lines below are **not a review**, and nothing in this task drafted, rewrote or read the
text they name — there is none. They are here because the gate requires them: once a
pilgrimage-level checklist exists, `validate` asks every stage of every section under that
pilgrimage for a line, ticked where the stage carries no `"drafted": true`. Without them
these 20 stages fail as "not listed", which would assert something false — that a stage is
waiting on a review — rather than nothing.

What a ticked line asserts here is only what the gate reads off it: **no drafted text on this
stage is awaiting review.** For both sections that is verifiable in one command —
`grep drafted routes/shikoku-88-iyo/stages.json` and its sibling return nothing. When a
drafter takes one of these sections, its block is replaced by full entries; see "Appending a
section" above.

### shikoku-88-iyo — Iyo (Temples 39-65), 14 stages

- [x] shikoku-88-iyo stage 0
- [x] shikoku-88-iyo stage 1
- [x] shikoku-88-iyo stage 2
- [x] shikoku-88-iyo stage 3
- [x] shikoku-88-iyo stage 4
- [x] shikoku-88-iyo stage 5
- [x] shikoku-88-iyo stage 6
- [x] shikoku-88-iyo stage 7
- [x] shikoku-88-iyo stage 8
- [x] shikoku-88-iyo stage 9
- [x] shikoku-88-iyo stage 10
- [x] shikoku-88-iyo stage 11
- [x] shikoku-88-iyo stage 12
- [x] shikoku-88-iyo stage 13

### shikoku-88-sanuki — Sanuki (Temples 65-88, and the return to Temple 1), 6 stages

- [x] shikoku-88-sanuki stage 0
- [x] shikoku-88-sanuki stage 1
- [x] shikoku-88-sanuki stage 2
- [x] shikoku-88-sanuki stage 3
- [x] shikoku-88-sanuki stage 4
- [x] shikoku-88-sanuki stage 5
