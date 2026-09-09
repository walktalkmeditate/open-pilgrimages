# Shikoku 88 — drafted text review

Five stages of `shikoku-88-awa` carry drafted text. Each entry below holds what the text was
written from, so it can be judged against its evidence rather than on its own.

This is the checklist spec §6 requires of the Shikoku 88 content work. `npm run validate`
reads it alongside `routes/shikoku-88-*/stages.json`, and `npm run check-drafted-diff` reads
it again against the base ref: a `"drafted": true` that disappears without a ticked line here
fails CI. It covers a whole pilgrimage, so **every line names its section**. The four dōjō
each have a stage 0, and one unqualified `- [x] stage 0` would clear all four at once — the
gate refuses that form, and this file must never contain it.

**The Awa text was drafted in Task 6a and declared here in the same task. Nothing in this
file is a review.** All five Awa lines are open, and clearing one is a later task's work, by
an agent that had no part in the drafting: an author who ticks his own prose records a review
that did not happen.

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

Tosa, Iyo and Sanuki hold ticked lines at the foot of this file and nothing else, because the
gate wants a line per stage whether or not there is text behind it. A drafter taking one of
those sections **lifts that section's block out of the closing list and replaces it with a
`## <section-id> — <name>` heading and one `### <section-id> stage N` entry per stage**, in
the shape Awa uses. Nothing above needs to move: the top matter is pilgrimage-wide and the
sections are independent of each other. Keep the section headings in walking order — awa,
tosa, iyo, sanuki — so the file reads in the order the circuit is walked.

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

## Sections with no drafted text yet

The lines below are **not a review**, and nothing in this task drafted, rewrote or read the
text they name — there is none. They are here because the gate requires them: once a
pilgrimage-level checklist exists, `validate` asks every stage of every section under that
pilgrimage for a line, ticked where the stage carries no `"drafted": true`. Without them
these 35 stages fail as "not listed", which would assert something false — that a stage is
waiting on a review — rather than nothing.

What a ticked line asserts here is only what the gate reads off it: **no drafted text on this
stage is awaiting review.** For all three sections that is verifiable in one command —
`grep drafted routes/shikoku-88-tosa/stages.json` and its two siblings return nothing. When a
drafter takes one of these sections, its block is replaced by full entries; see "Appending a
section" above.

### shikoku-88-tosa — Tosa (Temples 23-39), 15 stages

- [x] shikoku-88-tosa stage 0
- [x] shikoku-88-tosa stage 1
- [x] shikoku-88-tosa stage 2
- [x] shikoku-88-tosa stage 3
- [x] shikoku-88-tosa stage 4
- [x] shikoku-88-tosa stage 5
- [x] shikoku-88-tosa stage 6
- [x] shikoku-88-tosa stage 7
- [x] shikoku-88-tosa stage 8
- [x] shikoku-88-tosa stage 9
- [x] shikoku-88-tosa stage 10
- [x] shikoku-88-tosa stage 11
- [x] shikoku-88-tosa stage 12
- [x] shikoku-88-tosa stage 13
- [x] shikoku-88-tosa stage 14

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
