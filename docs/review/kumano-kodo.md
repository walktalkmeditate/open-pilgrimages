# Kumano Kodō — drafted text review

Four Kohechi stages carry drafted text. Each entry below holds what the text was written
from, so it can be judged against its evidence rather than read on its own.

This is the checklist spec §6 requires of the Kumano Kodō content PR. `npm run validate`
reads it alongside `routes/*/stages.json`, and `npm run check-drafted-diff` reads it again
against the base ref: a `"drafted": true` that disappears without a ticked line here fails
CI. It covers a whole pilgrimage, so every tick line names its section. Four sections each
have a stage 0, and an unqualified line would clear all four at once — the gate refuses one.

**The text was drafted in Task 6 and declared here in Task 8. Neither wrote a review.** The
review is Task 8b's, by an agent with no part in the drafting, because an author who ticks
his own prose records a review that did not happen. That review is recorded below: stages 0,
1 and 2 are ticked, stage 3 keeps its flag, and each open question carries its verdict.

The same rule is why stage 3 stays drafted. Its reflection had to be **replaced**, not
trimmed, and the reviewer wrote the replacement — so clearing it would be an author ticking
his own line. Stages 0 and 3 were edited by deletion only, which authors nothing; stage 3's
new reflection is the one piece of prose here awaiting a reader who did not write it.

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

Nothing in this repository holds those tags, so a later reviewer has to re-fetch them: every
id below resolves at `https://api.openstreetmap.org/api/0.6/<type>/<id>.json`, or in bulk
through the Overpass API at `https://overpass-api.de/api/interpreter`. Both are public and
read-only. The metre figures are then reproducible from the committed line alone, with
`nearestVertex` and `cumulativeMeters` from `scripts/ways/geo.ts` — which is how every
figure in this file was re-checked in the review below.

Two figures are **not** reproducible that way. The stage minimum of 648 m and the line's
1,033 m at Mizugamine come from the SRTM 30 m sample that `metadata.json`'s
`provenance.sources` declares (NASA SRTM 1 arc-second via OpenTopoData), taken at every
vertex of `route.main.geojson`; that sample lives in gitignored `.cache/`, and both
`route.geojson` and `route.main.geojson` are 2-D, so no committed file carries it. The
per-stage figures those samples were rounded into — `elevationGainMeters`,
`elevationLossMeters`, `highPointMeters`, `lowPointMeters` — **are** committed in
`stages.json`, and every claim in the text that rests on a height rests on one of those.

## Before changing any text

`docs/kumano-kodo-kohechi.html` quotes all four narratives and reflections verbatim, because
`checkInteriorJourney` requires the page to carry the stage text. Any wording the review
changes must change on that page in the same commit, or `check-site` fails.

`terrainNotes` sits outside `interior`, so no gate and no line here reaches it. Stage 0's was
already corrected in Task 6's fix pass and its narrative was not, which is why the two
disagreed about the 650 m floor; the review has now brought the narrative to the wording
`terrainNotes` already used, so no stage's two fields disagree.

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
  - Kōyasan's temple lodgings — **citation replaced in review.** The three features the
    drafter cited carry no lodging tag: `node/5092538153` 高室院 (89 m), `node/5092538163`
    金剛三昧院 (89 m) and `way/1363855538` 金剛峯寺 (367 m) are each
    `amenity=place_of_worship` + `religion=buddhist` and nothing more. What grounds the
    claim, measured from the line's first vertex: 8 `tourism=hotel` within 400 m, all of
    them 院 sub-temples — 普門院 (220 m), 一乗院 (230 m), 無量光院 (288 m), 持明院
    (`name:en="Jimyo-in Shukubo"`, 288 m), 天徳院 (297 m), 本覚院 (319 m), 不動院 (337 m),
    Jokiin (390 m) — of which 天徳院 and 不動院 also carry `amenity=place_of_worship`, plus
    `node/5629787721` `tourism=guest_house` "Koyasan Guesthouse Kiminoya" at 91 m
  - Otaki — `node/8735601521` (`place=quarter`, 大滝), 87 m off, at 5.66 km
  - Mizugamine 1,161 m — `node/12310561011` (`natural=peak`, `ele=1161.1`), 382 m off, at
    8.88 km; the line's own height there is 1,033 m in the SRTM model
  - Kitaimanishi — `node/4432308132` (`place=quarter`, 北今西), 142 m off, at 15.82 km
  - "its low point at 650 m" — `stages.json`'s own `lowPointMeters`. The drafter's SRTM
    sample read 648 m, which is why the text no longer asserts a floor; see the verdicts
  - 710 m / 840 m — the sampled profile, in `stages.json`'s own `elevationGainMeters` and
    `elevationLossMeters`

```
theme:      Onto the ridge
narrative:  The day leaves Koyasan's temple lodgings, climbs to the ridge and stays on it: 16.7 km with its low point at 650 m. It passes Otaki, crosses below the summit of Mizugamine — 1,161 m, with the trail itself at about 1,030 m — and comes down through Kitaimanishi to Omata on the river. It climbs 710 m and descends 840 m, so the day's weight is in its length rather than in any one climb.
reflection: The climbing here is spread across the whole day rather than gathered into one pass — what does that ask of you?
```

**Verdicts.** Four of the six findings Task 6's own reviewer left land on this stage. All
four are **sustained**; three cost the text a phrase, the fourth cost the checklist a
citation. Every id above was re-fetched from OSM and every metre re-measured on the
committed line.

- **"the hamlet of Otaki" — sustained, struck.** `node/8735601521` is `place=quarter`,
  `official_name=大字大滝`; `大字` is an administrative subdivision. OSM's `place=hamlet`
  means a freestanding settlement smaller than a village, and `place=quarter` means a part
  of a larger one — so this is not a loose synonym but the opposite class. Now "It passes
  Otaki", which claims only what the node carries.
- **"never drop below 650 m" — sustained, struck.** `metadata.json`'s `elevationNote` says
  every high and low point is "rounded to the nearest 10 m", so a 10-m-rounded field cannot
  carry a strict floor whichever way the sample fell; the drafter's own sample, 648 m, fell
  the wrong way. Now "16.7 km with its low point at 650 m" — the wording `terrainNotes`
  already uses, so the two no longer disagree.
- **"close to equal, 710 m against 840 m" — sustained, struck.** 840/710 is 1.18; the two
  differ by 130 m. Now "It climbs 710 m and descends 840 m". The 130 m is not noise but the
  day's shape: the anchors declare 830 m at Koyasan and 700 m at Omata, and 710 − 840 =
  −130 = 700 − 830, so the profile closes exactly. The clause that follows survives on
  `terrainNotes` ("A ridge day … then holds high ground") and on 710 m spread over 16.7 km.
- **"Koyasan's temple lodgings" — claim upheld, citation replaced.** Confirmed: none of the
  three cited features carries a lodging tag. Confirmed too that the claim stands without
  them — the eight `tourism=hotel` 院 sub-temples are listed under Grounding above, one of
  them named "Jimyo-in Shukubo" (宿坊, a temple lodging). The sentence is unchanged; the
  citation under Grounding is.

*Not re-derivable:* "the trail itself at about 1,030 m" rests on the SRTM sample described
at the top of this file, which no committed file carries. It is kept: the model is a
declared `provenance.sources` entry, it is the same instrument that set the third ordinate
of all four anchors and every `highPointMeters` here, the figure is hedged, and it sits
inside the stage's committed 650–1,170 m range. It is the one sentence on this stage a
reviewer cannot check from the repository alone.

- [x] kumano-kodo-kohechi stage 0

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

**Verdict.** The open question is **answered, and the text stands unchanged.**

- **"The measured 13.1 km is an outlier against every published figure."** The observation
  is right and the anchor is correctly acquitted — re-measured, cutting the day at Miura,
  the farthest candidate, gives 14.443 km, still nowhere near 18.7. But the implication the
  question leaves — that the measurement is therefore untrustworthy, and the "shortest day"
  framing with it — does not survive checking the line against OSM itself:
  - Sampled at eight points across the descent, every metre of this stage's line lies on
    `highway=path`, `name=Kohechi` (`name:ja=熊野参詣道小辺路`). It is not a road shortcut.
  - Every way named Kohechi in the Ōmata–Imoze corridor was fetched and measured. The chain
    `way/558483794` → `way/1244801381` → `way/1244801380` → `way/126889269` runs Ōmata to
    just short of Imoze in **14.324 km**. There is no 18.7 km of Kohechi path here to find.
  - Of the named-Kohechi path in the corridor, the line follows 13.337 km — its whole slice
    — and leaves 2.509 km unfollowed. That remainder is the low bypass around Obako-dake,
    which `way/126955827` and `way/1501444299` (`name="Kohechi (summit detour)"`) replace.
    The line crosses `node/2454838213` at **0 m**, so it takes the summit; a walker does not
    walk both. Skipping it is correct, not a shortfall.

  So 13.1 km is a faithful measurement of the OSM Kohechi over the summit, and the
  divergence is between OSM and a tour operator, not inside this dataset — which
  `metadata.json`'s `distanceNote` already declares in as many words ("this repository holds
  no guidebook figure for these four days"). Spec §6 makes the section's own data the
  standard, so striking "shortest" because a guidebook disagrees would import exactly the
  outside claim §6 exists to keep out. The margin is 1.5 km to the next day (13.1 against
  14.6), and OSM's generalisation applies to all four days alike, so the ordering the
  sentence rests on is stable. **Both the narrative and the reflection stand as drafted.**

- [x] kumano-kodo-kohechi stage 1

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
  - "about 700 m" from the valley floor — 356 m at Imoze to 1,067 m at the pass. The 340 m
    in the endpoint entry above is not a second reading of the same thing: that is the SRTM
    height **at the Imoze node**, which sits 148 m off the route, and this is the height of
    **the line** where the day starts. The climb is "about 700 m" either way — 711 m from
    the line, 727 m from the node, and 730 m off the committed `highPointMeters` of 1,070
    against the anchor's own declared 340 m, which is the only one of the three a reader can
    check from the repository
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

**Verdict.** No open question was raised against this stage, and the review found none. Every
id re-fetched and every metre re-measured: the pass attestation holds (`amenity=toilets`
三浦峠公衆トイレ and `amenity=bench` 熊野古道小辺路三浦峠休息所 — 休息所 is "rest place", which is
what the text says, and both names carry 三浦峠, so the pass's name is in the tags even though
no pass node is); Nishinaka, Kawai-jinja, Tamagaito, Nagai and Shigesato all fall inside the
stage and in the order the sentence puts them; 49.600 − 41.558 = 8.04 km for the river road;
and the onsen is where the text says, 1,042 m east of the trailhead across the river.

Two corrections to this entry's own figures, neither reaching the text:

- `node/4483811891`, the bench, measures 11 m off at **34.686 km**, not the 34.710 km given
  for both — 24 m from the toilets, not at the same point. Immaterial to "a rest place and a
  public toilet", which claims no position.
- `node/1707260812`, the bus station, measures **1,033 m** to the nearest vertex, not the
  1,042 m stated for it and the bath alike. The bath is 1,042 m. Both round to the "kilometre
  east" the narrative claims. The same 1,042-for-both appears in the anchor note in
  `stages.json`, which this review left alone as out of scope.

*Noted, not struck:* "down the Totsukawa" names as a river what OSM here names 熊野川
(`name:en="Kumanogawa River"`); no `waterway=river` in this valley carries 十津川. Totsukawa
**is** grounded, as a place — `node/1425804021` `place=village` `name:en=Totsukawa`,
`relation/3253735` `boundary=administrative`, and the toilets' own `operator=十津川村` — and
the stage's committed `terrainNotes` already reads "the Totsukawa valley", which is the
sense the sentence carries. Left standing on that reading; a future edit should not tighten
it into a river name.

- [x] kumano-kodo-kohechi stage 2

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
  - Hatenashi-tōge — added in review; the drafter recorded no grounding for the name. OSM
    has no pass node, as at Miura-tōge, but `node/5702262721` (`tourism=information`,
    `name=小辺路 果無峠登山口` — the Kohechi's Hatenashi-tōge trailhead) sits **6 m** off the
    line at 50.723 km, so 果無峠 is in the tags. The height is committed twice over:
    `highPointMeters: 1070` here, and `metadata.json`'s `elevationNote`, which reports the
    model reading "1,070 m at the Hatenashi-toge crossing"
  - Hatenashi — `node/5162307640` (`place=neighbourhood`, `name=Hatenashi`, `name:ja=果無`),
    18 m off, at 50.36 km
  - two World Heritage stone markers — `node/5702235622` and `node/5702227121`, both named
    世界遺産熊野参詣道小辺路の石碑, 3 m and 2 m off. Corrected in review: they do **not** both
    carry both tags. `node/5702235622` is `historic=memorial` + `memorial=stele`;
    `node/5702227121` is `tourism=attraction`. One tag each. 世界遺産 is "World Heritage" and
    石碑 is "stone monument", so the sentence's own two words are in both names
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
narrative:  The biggest climb of the four days: 1,080 m of ascent in 14.6 km, from the Totsukawa up to Hatenashi-toge at about 1,070 m. The way up goes through Hatenashi, past two World Heritage stone markers and a stone Buddha, then the Yamaguchi tea-house remains and a Kannon temple, before the long drop to Yagio. The last 2.2 km are shared with the Nakahechi, past Haraido-oji, into Kumano Hongu Taisha.
reflection: The other three days ended at a place to sleep; this one ends where the route was going — what changes in the arriving?
```

**Verdicts.** The narrative's places all check out: Hatenashi at 50.36 km, the two markers at
50.34 and 50.61, the stone Buddha (石仏) at 50.41, the Yamaguchi teahouse at 51.96, the Kannon
temple at 52.98, Yagio at 57.99 and Haraido-ōji at 64.00, each within 78 m of the line and in
the order the sentence puts them. The shared tail was re-measured independently of the
relation terminus: the first Kohechi vertex within 25 m of the Nakahechi's own
`route.main.geojson` is at 62.129 km, leaving **2.198 km** — the drafter's 2.186 km, to 12 m.
`1080 > 950 > 760 > 710` makes "the biggest climb of the four days" true off `stages.json`.

- **"the hamlet of Hatenashi" — struck**, on the reviewer's own finding; the drafter's
  reviewer caught this at Otaki and not here. `node/5162307640` is `place=neighbourhood`,
  the same class problem as `place=quarter` at Otaki. Now "goes through Hatenashi". (The
  word the data would support is "settlement" — `node/5702160126` is named 果無**集落**登山口,
  and stage 2's narrative already says "the Hatenashi settlement trailhead" — but deleting
  claims nothing new, and this reviewer's replacements are what keep this stage drafted.)
- **"Three days ended at a village" — sustained, replaced.** Two faults, not one. The count:
  stage 2's own narrative ends that day at the Hatenashi settlement trailhead with the onsen
  "a kilometre east across the river", so within this very file the third day does not end
  at a settlement. And the class: no endpoint is a village — Ōmata is `place=neighbourhood`,
  Imoze `place=quarter`, the day-3 anchor `tourism=attraction`. The nearest `place=village`
  is 十津川村 itself, 6 km north of the onsen. `metadata.json` says "the nights at the
  river-valley settlements of Omata, Miura-guchi and Totsukawa Onsen" — three nights, and
  "settlements", never villages.

  The replacement — "The other three days ended at a place to sleep; this one ends where the
  route was going" — takes both halves from committed data: the three nights' stops from
  that `description`, and the destination from `overview.endPoint`. It says nothing about
  settlement class, and nothing that stage 2's narrative contradicts, because a walker does
  sleep at Totsukawa Onsen even though the measured line stops a kilometre short of it.

**This stage keeps `"drafted": true`.** The reflection above was written by the reviewer, and
the reviewer cannot tick his own prose — that is the failure this checklist exists to catch,
and it does not stop applying because the author happens to be the reviewer. Everything else
on the stage has been checked and stands; what the next round is being asked for is one
reading of one new sentence, by someone who did not write it.

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
