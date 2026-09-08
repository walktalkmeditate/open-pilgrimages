# Kumano Kodō — drafted text review

Four Kohechi stages carry drafted text. Each entry below holds what the text was written
from, so it can be judged against its evidence rather than read on its own.

This is the checklist spec §6 requires of the Kumano Kodō content PR. `npm run validate`
reads it alongside `routes/*/stages.json`, and `npm run check-drafted-diff` reads it again
against the base ref: a `"drafted": true` that disappears without a ticked line here fails
CI. It covers a whole pilgrimage, so every tick line names its section. Four sections each
have a stage 0, and an unqualified line would clear all four at once — the gate refuses one.

**The text was drafted in Task 6 and declared here in Task 8. Neither wrote a review.** All
four Kohechi flags are still on and all four boxes are still empty. The review is Task 8b's,
by an agent with no part in the drafting, because an author who ticks his own prose records
a review that did not happen.

## What this section does not have

`routes/kumano-kodo-kohechi/waypoints.geojson` is an empty `FeatureCollection`. The section
ships **no curated places at all** — `ways/report.json` reports `places.sparse: true` at 0
places per stage, and the app's card will read "few places marked yet" until the curation
task fills the file. So the per-stage **Places** line below is empty everywhere, and it says
so rather than borrowing the Nakahechi's waypoints, which still hold the whole Kōyasan
cluster under `stageIndex: 3` of a route they no longer belong to.

The OSM features under **Grounding** are therefore not waypoints. They are the features the
drafter measured against the walked line while writing, recorded in the Task 6 report, and
they are what each sentence has to be checked against. Distances are to the nearest vertex
of the committed `route.main.geojson`; along-line positions are on the same line, whose full
length is 64.327 km.

## Before changing any text

`docs/kumano-kodo-kohechi.html` quotes all four narratives and reflections verbatim, because
`checkInteriorJourney` requires the page to carry the stage text. Any wording the review
changes must change on that page in the same commit, or `check-site` fails.

`terrainNotes` sits outside `interior`, so no gate and no line here reaches it. Stage 0's
was already corrected in Task 6's fix pass and its narrative was not, which is why the two
now disagree about the 650 m floor — see that stage's open questions.

---

## kumano-kodo-kohechi stage 0 — Kōyasan to Ōmata

- **Start** Kōyasan — `node/8735601530` (`place=quarter`, `name=高野山`, `name:en=Koyasan`,
  `official_name=大字高野山`, `wikidata=Q535065`), 415 m off the line, at 0.289 km, 830 m
- **End** Ōmata — `node/4432308131` (`place=neighbourhood`, `name=大股`, `name:en=Omata`),
  31 m off the line, at 17.204 km, 700 m
- **Distance** measured 16.69 km (`ways/report.json` `sliceKm`) against 16.7 km declared in
  `stages.json`, ratio 0.9994. Previously declared: **none** — the `variants/kohechi` stub
  this section was promoted from carried no stages, only 70 km for the whole route
- **Places** none — `waypoints.geojson` holds no features
- **Grounding the text cites**
  - Kōyasan's temple lodgings — cited as `node/5092538153` 高室院 (89 m) and
    `node/5092538163` 金剛三昧院 (89 m), plus `way/1363855538` 金剛峯寺 (367 m)
  - Otaki — `node/8735601521` (`place=quarter`, 大滝), 87 m off, at 5.66 km
  - Mizugamine 1,161 m — `node/12310561011` (`natural=peak`, `ele=1161.1`), 382 m off, at
    8.88 km; the line's own height there is 1,033 m in the SRTM model
  - Kitaimanishi — `node/4432308132` (`place=quarter`, 北今西), 142 m off, at 15.82 km
  - "never drop below 650 m" — the stage's model minimum, 648 m
  - 710 m / 840 m — the sampled profile, in `stages.json`'s own `elevationGainMeters` and
    `elevationLossMeters`

```
theme:      Onto the ridge
narrative:  The day leaves Koyasan's temple lodgings, climbs to the ridge and stays on it: 16.7 km that never drop below 650 m. It passes the hamlet of Otaki, crosses below the summit of Mizugamine — 1,161 m, with the trail itself at about 1,030 m — and comes down through Kitaimanishi to Omata on the river. Ascent and descent are close to equal, 710 m against 840 m, so the day's weight is in its length rather than in any one climb.
reflection: The climbing here is spread across the whole day rather than gathered into one pass — what does that ask of you?
```

**Open questions for the reviewer.** Four of the six findings Task 6's own reviewer left
land on this stage:

- **"the hamlet of Otaki."** `node/8735601521` is `place=quarter`, `大字大滝`. OSM has a
  `place=hamlet` value and did not use it here, so "hamlet" is the drafter's word, not the
  tag's.
- **"never drop below 650 m."** The model minimum is 648 m. This is a strict bound asserted
  off a rounded `lowPointMeters`, and the walker who reads it is 2 m below it at the low
  point. The same claim in `terrainNotes` was already cut to "its low point 650 m".
- **"close to equal, 710 m against 840 m."** Those are 18% apart.
- **"Koyasan's temple lodgings."** The claim is supportable but its citation is not: neither
  `node/5092538153` nor `node/5092538163` carries a lodging tag. What does support it is 8
  `tourism=hotel` within 400 m of the line's start, two of them also
  `amenity=place_of_worship`, one named "Jimyo-in Shukubo". A citation fix, not a claim to
  cut.

- [ ] kumano-kodo-kohechi stage 0

---

## kumano-kodo-kohechi stage 1 — Ōmata to Miura-guchi

- **Start** Ōmata — `node/4432308131` (`place=neighbourhood`, `name=大股`, `name:en=Omata`),
  31 m off the line, at 17.204 km, 700 m
- **End** Miura-guchi — `node/1426712525` (`place=quarter`, `name=五百瀬`, `name:en=Imoze`),
  148 m off the line, at 30.543 km, 340 m. OSM carries **no node named 三浦口**, the name
  the overnight stop goes by; two nearer nodes were measured and not taken —
  `node/7475989892` (`place=neighbourhood`, 三田谷 / Bitadani) 34 m off at 30.178 km, and
  `node/1426712521` (`place=quarter`, 三浦 / Miura) 31 m off at 31.647 km
- **Distance** measured 13.145 km against 13.1 km declared, ratio 1.0034. Previously
  declared: **none**
- **Places** none — `waypoints.geojson` holds no features
- **Grounding the text cites**
  - Kaya-goya hut — `node/3101640888` (`historic=ruins`, `name="Kaya-Goya Ato Ruin"`), 24 m
    off, at 18.36 km
  - Obako-dake 1,344 m — `node/2454838213` (`natural=peak`, `ele=1344`,
    `wikidata=Q31693430`), **0 m** — the line crosses it
  - Mizugamoto tea house — `node/6846436757` (`historic=monument`, 水ケ元,
    `name:en="Mizugamoto Tea House Remains"`), 108 m off, at 26.47 km
  - Bitadani and Imoze — the two `place` nodes in the endpoint entry above
  - "shortest" — 13.1 km against 14.6 / 16.7 / 18.8; "highest" — 1,344 m against
    1,170 / 1,070 / 1,070

```
theme:      The high point
narrative:  The shortest day on the route is also the highest. From Omata the trail climbs past the site of the Kaya-goya hut to Obako-dake at 1,344 m, the highest ground the Kohechi crosses, then descends past the remains of the Mizugamoto tea house to the river settlements of Bitadani and Imoze. It loses 1,140 m against the 760 m it gains.
reflection: The highest ground on the route comes on its shortest day — is that a gift or a warning?
```

**Open question for the reviewer.**

- **The measured 13.1 km is an outlier against every published figure for this day**, and
  the anchor choice does not explain it. Published: 18.7 km (kumanokodo.com.au) and ~15 km
  (Japan Web Magazine). No candidate anchor reaches either — cutting the day at Miura, the
  farthest of the three, gives 14.45 km. The other three days agree with their published
  figures to within 0.6 km. Whatever the discrepancy is, it is not the anchor, and both the
  narrative and the reflection are built on the "shortest day" framing the outlier produces.

- [ ] kumano-kodo-kohechi stage 1

---

## kumano-kodo-kohechi stage 2 — Miura-guchi to Totsukawa Onsen

- **Start** Miura-guchi — `node/1426712525` (`place=quarter`, `name=五百瀬`,
  `name:en=Imoze`), 148 m off the line, at 30.543 km, 340 m
- **End** Totsukawa Onsen — `node/5702160126` (`tourism=attraction`,
  `name=小辺路 果無集落登山口`, the Kohechi's Hatenashi settlement trailhead), 3 m off the
  line, at 49.600 km, 170 m. The onsen village itself is **1,042 m** east across the
  Totsukawa and the line does not enter it: `node/2970208333` (`amenity=public_bath`,
  十津川温泉 庵の湯) and `node/1707260812` (`amenity=bus_station`, 十津川バスセンター) each
  measure 1,042 m, twice the 500 m the build snaps across
- **Distance** measured 18.769 km against 18.8 km declared, ratio 0.9983. Previously
  declared: **none**
- **Places** none — `waypoints.geojson` holds no features
- **Grounding the text cites**
  - Miura-tōge — OSM has **no pass node** here. The crossing is attested by
    `node/4483811890` (`amenity=toilets`, 三浦峠公衆トイレ) 33 m off and `node/4483811891`
    (`amenity=bench`, 熊野古道小辺路三浦峠休息所) 11 m off, both at 34.71 km — which is what
    "a rest place and a public toilet" is stating. Model height 1,067 m, written as "about
    1,070 m" to agree with the declared `highPointMeters`
  - "about 700 m" from the valley floor — 356 m at Imoze to 1,067 m at the pass
  - Nishinaka `node/8592442760` (56 m, 41.56 km); Kawai-jinja `node/5705929359`
    (`amenity=place_of_worship`, `religion=shinto`, 川合神社) 20 m off at 42.78 km;
    Tamagaito `node/1426712559` (101 m); Nagai `node/1426712553` (96 m); Shigesato
    `node/8592442759` (108 m)
  - "some 8 km" of river road — 49.60 − 41.56 = 8.04 km
  - "a kilometre east across the river" — the 1,042 m in the endpoint entry above

```
theme:      Pass and river
narrative:  The longest day: 18.8 km from Imoze over Miura-toge and then down the Totsukawa. The climb gains about 700 m from the valley floor to the pass at about 1,070 m, where there is a rest place and a public toilet; the descent runs through Nishinaka, past Kawai-jinja, and then some 8 km along the river road through Tamagaito, Nagai and Shigesato. It ends at the Hatenashi settlement trailhead, where the climb to the last pass begins, with Totsukawa Onsen a kilometre east across the river.
reflection: Half of this day is mountain path and half is river road — does the walking change when the surface does?
```

No open question was raised against this stage.

- [ ] kumano-kodo-kohechi stage 2

---

## kumano-kodo-kohechi stage 3 — Totsukawa Onsen to Kumano Hongū Taisha

- **Start** Totsukawa Onsen — `node/5702160126` (`tourism=attraction`,
  `name=小辺路 果無集落登山口`), 3 m off the line, at 49.600 km, 170 m
- **End** Kumano Hongū Taisha — `way/797748245` (`amenity=place_of_worship`,
  `religion=shinto`, `name=熊野本宮大社`, `wikidata=Q705035`, `ref:whc=1142-07bis`), centre
  51 m off the line's last vertex, at 64.327 km, 80 m. The Nakahechi's own final anchor for
  the same shrine sits 3 m from that vertex; this section pins the shrine's OSM way instead
- **Distance** measured 14.559 km against 14.6 km declared, ratio 0.9972. Previously
  declared: **none**
- **Places** none — `waypoints.geojson` holds no features
- **Grounding the text cites**
  - Hatenashi — `node/5162307640` (`place=neighbourhood`, `name=Hatenashi`, `name:ja=果無`),
    18 m off, at 50.36 km
  - two World Heritage stone markers — `node/5702235622` and `node/5702227121`, both
    `historic=memorial` / `tourism=attraction`, 世界遺産熊野参詣道小辺路の石碑, 3 m and 2 m off
  - stone Buddha — `node/9961089145` (石仏), 3 m off, at 50.41 km
  - Yamaguchi tea-house remains — `node/6405914885` (`name="Yamaguchi Teahouse Remains"`),
    11 m off, at 51.96 km
  - Kannon temple — `node/6405914985` (`amenity=place_of_worship`, `religion=buddhist`,
    `name="Kannon Temple"`), 10 m off, at 52.98 km
  - Yagio — `node/6919889946` (`place=neighbourhood`, 八木尾), 78 m off, at 57.99 km
  - Haraido-ōji — `node/3210797191` (`historic=wayside_shrine`, `name="Haraido Oji"`), 47 m
    off, at 64.00 km
  - "2.2 km shared with the Nakahechi" — measured, 2.186 km, from the Kohechi relation's own
    southern terminus at 62.140 km to the shrine
  - "biggest climb of the four days" — 1,080 m against 950 / 760 / 710

```
theme:      The last pass
narrative:  The biggest climb of the four days: 1,080 m of ascent in 14.6 km, from the Totsukawa up to Hatenashi-toge at about 1,070 m. The way up goes through the hamlet of Hatenashi, past two World Heritage stone markers and a stone Buddha, then the Yamaguchi tea-house remains and a Kannon temple, before the long drop to Yagio. The last 2.2 km are shared with the Nakahechi, past Haraido-oji, into Kumano Hongu Taisha.
reflection: Three days ended at a village and this one ends at the shrine — what changes in the arriving?
```

**Open question for the reviewer.**

- **"Three days ended at a village."** Only two did. Stage 2's own anchor note ends day 3 at
  the Hatenashi settlement trailhead, 1,042 m short of Totsukawa Onsen, and says the walker's
  kilometre to the lodging is a detour off the measured line. The reflection turns the
  contrast between village and shrine into its whole question, so the miscount is the
  sentence's hinge rather than a detail inside it.

- [ ] kumano-kodo-kohechi stage 3

---

## The Nakahechi's four lines, and what they do not claim

The four lines below are **not a review**, and nothing in this PR drafted, rewrote or read
the text they name. They are here because the gate requires them: once a pilgrimage-level
checklist exists, `validate` asks every stage of every section under that pilgrimage for a
line, ticked where the stage carries no `"drafted": true`. Without them the four Nakahechi
stages fail as "not listed", which would assert something false — that a stage is waiting on
a review — rather than nothing.

What a ticked line asserts here is only what the gate reads off it: **no drafted text on this
stage is awaiting review.** For the Nakahechi that is verifiable in one command —
`grep drafted routes/kumano-kodo-nakahechi/stages.json` returns nothing, and returned nothing
at the base ref too. Its four stages' `interior` text shipped on `main` before this branch
existed and is untouched by it. `check-drafted-diff`, the gate that actually polices whether
a review happened, compares two refs, sees no flag coming off here, and so never reads these
four lines at all.

The Iseji and the Ōhechi have no lines because they have no `stages.json` — both ship
metadata-only under spec §4.3, with `ways: null`.

- [x] kumano-kodo-nakahechi stage 0
- [x] kumano-kodo-nakahechi stage 1
- [x] kumano-kodo-nakahechi stage 2
- [x] kumano-kodo-nakahechi stage 3
