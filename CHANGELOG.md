# Changelog

All notable changes to the open-pilgrimages dataset are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The data file `schemaVersion` field tracks the JSON schema separately from the package version (currently `1.0.0`).

Consumers read the catalog from `https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@main/index.json` and pin every file they then download to the tag that index's `release` field names. The `v1` alias is no longer maintained — jsDelivr caches tag URLs permanently, so moving it changed nothing a consumer saw.

## [1.9.0] — 2026-09-09

The Shikoku 88 stops being ten stages that do not touch and becomes what a
walker does: forty days around one island, in four legs, ending where it
began. It is the corpus's first `legs` pilgrimage — sections walked in
sequence rather than chosen between — and its first circular one.

**This release renames a route id, and nothing forwards.** `shikoku-88` is
gone as a route: the directory, its `index.json` entry and every file beneath
it. The walk ships instead as four sections — `shikoku-88-awa`,
`shikoku-88-tosa`, `shikoku-88-iyo` and `shikoku-88-sanuki`, the four dōjō the
circuit crosses. `shikoku-88` survives only as the *pilgrimage's* id, in
`index.json`'s `pilgrimages[]` and in each section's `pilgrimage.id`, where it
names a grouping rather than anything you can download. Anything pinning the
old id — a directory path, a jsDelivr URL, a string hard-coded in an app — has
to follow it to one of the four or it will 404. This is the same break
`kumano-kodo` took in 1.8.0, for the same reason.

### What was wrong with the ten stages

They were temple *groups*, not days, and they did not chain. Stage 0 ran
Temples 1–12 and stage 1 began at Temple 13; stage 1 ended at Temple 23 and
stage 2 began at Temple 24; and so on through all ten. Nothing in the dataset
recorded the walking between one group's last temple and the next group's
first.

Measured on the four walked lines this release publishes, the ten groups span
**812.3 km** of the circuit. The nine gaps between them, plus the closing
return from Ōkubo-ji (Temple 88) to Ryōzen-ji (Temple 1) that the ten stages
did not carry either, come to **328.6 km** — from 3.8 km at the narrowest
(Zentsū-ji to Konzō-ji) to 77.5 km at the widest (Yakuō-ji to Hotsumisaki-ji,
around Cape Muroto). 812.3 plus 328.6 is the 1,140.9 km the four sections now
publish end to end, with no gap left anywhere in it.

That unrecorded walking is also why the old figures never reconciled: ten
declared stage distances summing to **907.3 km**, against a declared circuit
of **1,200 km**.

### Added

- **`routes/shikoku-88-awa/`, `routes/shikoku-88-tosa/`,
  `routes/shikoku-88-iyo/` and `routes/shikoku-88-sanuki/`** — the four dōjō,
  Temples 1–23, 23–39, 39–65 and 65–88, at 154.5 / 418.5 / 365.7 / 202.2 km
  and 5 / 15 / 14 / 6 stages. Each is cut from its own `route.main.geojson`,
  built by `npm run build-main-line` from that section's pinned OSM relations.
  The four chain on identical anchor coordinates at Yakuō-ji (Temple 23),
  Enkō-ji (39) and Sankaku-ji (65), and Sanuki's last stage ends on the exact
  coordinate Awa's first begins from, which is what makes the circuit close.
- **A `shikoku-88` pilgrimage in `index.json`**, `kind: "legs"`, its four
  sections in `order`, with `distanceKm` 1140.9 and `stageCount` 40. It
  declares both, where the two `alternatives` pilgrimages declare neither: a
  sum across alternatives describes no walk anyone takes, but legs are walked
  in sequence and their sum is the walk. `pilgrimage.circular: true` is
  declared on all four sections' `metadata.json` — each dōjō is linear and
  only the circuit they add up to closes — and `validate` checks that the four
  agree and that the last section's final stage lands back on the first
  section's first start.
- **Forty day stages, cut by a rule that can be re-run**, and recorded in full
  in each section's `provenance.sources` rather than summarised beside it. A
  day ends at a temple whenever one falls between 25 and 30 km along the
  section's walked line; where none does, it ends at the nearest named
  accommodation or town waypoint on that line. Both arms take the candidate
  nearest 27.5 km and, on a tie, the earlier one. **The spec's rule was
  temples alone, and the spacing does not carry it.** Of the 88
  temple-to-temple legs, measured on these same lines, only **4 fall inside
  25–30 km**, while **ten exceed 30 km and carry 552.3 km — 48% of the
  circuit** — the longest Temple 37 to Temple 38 at **82.7 km**. Across those
  ten there is no temple to end a day at in either direction, which is what
  the second arm is for. **The count came out 40 rather than the spec's about
  45**, and is reported rather than tuned: the realised cut ends 17 of its 40
  days at a temple and 23 at a lodging or town (19 accommodation, 4 town), 18
  of the 40 inside the band, from 13.0 km to 59.6 km. The two longest days are
  the rule meeting OpenStreetMap's lodging coverage rather than a fault in it,
  and each carries the fact as a stage warning.
- **`docs/shikoku-88.html`**, generated by `build-assets` like the Camino's
  and the Kumano Kodō's pilgrimage pages, plus a detail page for each of the
  four sections. The catalog's own title and meta descriptions said "ten
  pilgrimage routes"; the corpus holds thirteen.

### Changed

- **The declared circuit, 1,200 km → 1,140.9 km**, and it is now a sum of
  measurements rather than a tradition. The four sections declare 154.5,
  418.5, 365.7 and 202.2 km; their walked lines measure 154.482, 418.501,
  365.677 and 202.234. The traditional ~1,200 km was never measured against
  any line in this dataset, and each section's `distanceNote` keeps it beside
  the new figure rather than dropping it — modern walked totals run from about
  1,140 km at their most direct to about 1,400 km with every variant.
- **The ten stage distances are gone with the stages** — 53, 100, 200, 140,
  140, 35, 60, 19.3, 50 and 110 km. None of the forty that replace them maps
  onto one of the ten, so there is no pair of figures to give: a group of
  twelve temples and a day's walk are not the same kind of thing.
- **No other route's declared distance moved.** `distanceKm` is unchanged
  across every Camino and every Kumano Kodō section in this release.
- **The corpus's waypoint count falls, 11,863 → 10,800**, because Shikoku's
  falls **2,980 → 1,917**. A consumer will see the total drop by 1,063 and
  should read it as a correction. The old `route.geojson` was a
  MultiLineString of 77 separate lines, and the enrichment corridor flattens a
  route into one array of coordinates — so the 76 joins became segments,
  chords drawn straight across the island, and the 300 m corridor bulged
  around geometry no walker follows. **1,351 of those 2,980 waypoints — 45% —
  sit more than 300 m from any of the four walked lines the sections publish
  now.** The four sections were re-enriched against their own lines, and the
  88 temples are all present, split 23 / 16 / 26 / 23 between the dōjō.
- **The twenty-one years of completion data moved off `stats.json` and onto
  the pilgrimage.** What the Omotenashi Network publishes — 2005 to 2025,
  walking and cycling, with per-year foreign counts — is measured over the
  whole circuit, not per province, so it lives in the `pilgrimage.stats` block
  repeated identically on all four sections' `metadata.json`, and `validate`
  checks the four agree. **`index.json`'s `pilgrimages[]` entry carries a
  summary only**: when the figures were last checked, the year they reach, how
  they were counted, and the single most recent number. The full series, the
  demographics and the infrastructure figures stay on the sections, because
  `index.json` is the one file every consumer downloads before anything else
  and a twenty-one-year series is not what it is for.

### Coverage, honestly

All four sections are flagged `sparse: false`, and that flag is a **section**
bar, not a per-day promise: it asks that half a section's stages carry at
least one place beyond the day's own start and end. Read it as "not empty".

- **Awa, Tosa and Sanuki clear it on every stage** — 5 of 5, 15 of 15 and 6 of
  6.
- **Iyo clears 12 of its 14.** Stage 1, Kanjizai-ji (Temple 40) to Hotel
  Ailin, and stage 13, HOTEL AZ 愛媛土居インター店 to Sankaku-ji (Temple 65),
  carry nothing at all between their two ends. Stage 1's longest unmarked run
  is 9.7 km.
- **`placesPerStage` is a mean of those beyond-ends counts, so read it as
  one.** Awa 9.6, Tosa 3.1, Iyo 10.4, Sanuki 9.3. Iyo's 10.4 is an average
  with two zeroes in it and a 50 at the other end — stage 3 alone carries 28
  numbered wayside shrines inside 1.656 km. Its median is 6.

### Elevation is unmeasured, and must not be read as flat

The four walked lines are 2D, and **`gainMeters` is absent — not zero — from
every one of the forty stage records**, as it is from all 143 stages in the
corpus. The `ways/stage-NN.json` packages do write `gainMeters: 0`, because
`way.schema.json` requires the field where the app's `WayStage` declares it
non-optional and the build writes a zero where the dataset is silent. That
zero means "not measured".

Eighteen temples carry a point height as an OpenStreetMap tag — 3 in Awa, 3 in
Tosa, 5 in Iyo, 7 in Sanuki — among them **Unpen-ji (Temple 66) at 911 m**,
the highest temple on the circuit and the only elevation any of the four
sections declares in `overview` (Sanuki's `maxMeters`, with no ascent or
descent total beside it). A height at a gate is not a profile between gates:
**no elevation profile is published for these four sections**, deliberately,
and the site's key facts carry no elevation row for three of them.

### Fixed

- **`npm run fetch` reached nothing and exited 0.** It sent no `User-Agent`,
  and Overpass answers Node's default with `406 Not Acceptable` — so the sweep
  fetched nothing for any of the seven routes, caught each failure, and
  reported success. `npm run pipeline` runs it first and chains on `&&`, so an
  empty sweep was indistinguishable from a working one and handed months-old
  cache to `build-ways` as if it were the fetch just asked for. It now sends
  the same agent string `scripts/enrich/osm.ts` already sends, continues past
  a route that fails, and exits non-zero naming the ones that did.
- **Sparkline accessibility labels hard-coded the word "rising".** Every
  series committed before this release rises, so the label had never yet been
  wrong — and the first one to fall would have had a screen reader announce
  the opposite of the picture beside it. Shikoku's walking completions are
  that series: 1,740 in 2005 against 1,622 in 2025. The label now compares the
  two ends and says `rising to`, `falling to` or `unchanged at`.
- **`build-ways` reported a stale `stageIndex` as a distance failure.**
  `wp-cruz-de-ferro` read "1568 m from the line" in the Camino Francés report
  when it stands **10 m** from that route's walked line, at 537.7 km, and the
  stage 22 its `stageIndex` names covers 510.3–535.7 km. The 1,568 m was the
  distance to a different stretch of the same line. The reason now says which
  stage the waypoint's index names, where the waypoint actually falls, and
  what the old figure was measuring. Six routes' `ways/report.json` carry the
  corrected sentence — 68 lines, and the whole of what changed under
  `routes/camino-*/` and `routes/kumano-kodo-*/` in this release.
- **`enrich-waypoints` would silently overwrite a stage assignment derived
  from the walked line.** It measures along `route.geojson` while `build-ways`
  cuts days from `route.main.geojson`, so a re-run replaced every `stageIndex`
  and `kmFromStart` with one measured along a line no package is cut from.
  Neither field records where it came from, so the re-run left no trace and
  coverage collapsed at the next build in a report naming no cause. It now
  refuses where a section has both files and any stages, prints both lines'
  lengths and how many assignments are at stake, and takes
  `--overwrite-stage-index` for the caller who means it. A section being
  enriched before it has any days — which is how Shikoku's day rule got the
  lodging waypoints it reads — has no cut to disagree with, and is not
  refused.

### Known, and not fixed here

- **The enrichment corridor still measures against the wrong line, on
  purpose.** It admits an OSM node within 300 m of `route.geojson` while
  stages are cut from `route.main.geojson`, and on these four sections the two
  run **1.74× to 2.26× apart** — Awa's 349.7 km route file against a 154.5 km
  walked line is the widest. Measuring against the walked line is the more
  honest corridor, and moving it there was still refused: it would newly
  exclude **105 waypoints corpus-wide, and all 105 are already named in a
  committed `ways/report.json` dropped list**, so it would change no package
  on any route and only shrink published data. **Kumano Nakahechi alone would
  pay 46 of the 105**, 49% of its enriched set, because its route file carries
  the whole Kumano network against a 35.9 km walked line. The refusal above
  carries the risk in the meantime.
- **662 of the Camino Francés' 2,904 OSM waypoints already sit beyond 300 m of
  its own committed `route.geojson`.** That corridor is not reproducible from
  the geometry in this repository today. It predates this branch and nothing
  here touched it.
- **A `description` can quote a relation's length rather than the walked
  one.** Iyo's says Temple 43 to Temple 44 is 70.3 km; the walked line
  measures 70.442. Sanuki's four such figures land within 34 m. Nothing checks
  the prose against the line.
- **Temple 72 → Temple 73 is declared a forward step and reads backwards.**
  `temple-73` records 59.7 km from Sanuki's start and `temple-72` records
  60.1 — an inversion of 0.457 km, the only one among the pilgrimage's 88
  legs, and no check sees it. The cause is a genuine tie rather than a
  backwards line: the walked line passes Mandara-ji twice, 0.914 km apart, at
  **17.705 m on both passes**, and the projection keeps the second. Every
  figure derived from that projection inherits the choice.

## [1.8.0] — 2026-09-08

The Kumano Kodō stops being one route and becomes what it is on the ground: a
pilgrimage of four separate ways to the same shrines, of which a walker picks
one. Two of them can now be walked from this data. The other two cannot yet be
drawn at all, and say so in the data rather than holding the release open.

**This release renames a route id, and nothing forwards.** `kumano-kodo` is
gone; the route that carried it is now `kumano-kodo-nakahechi`, and every file
beneath it moved with it. Anything pinning the old id — a directory path, an
`index.json` lookup, a jsDelivr URL, a string hard-coded in an app — has to
follow it or it will 404. `kumano-kodo` survives only as the *pilgrimage's*
name, in `index.json`'s `pilgrimages[]` and in each section's `pilgrimage.id`,
where it names a grouping rather than anything you can download.

### Added

- **`routes/kumano-kodo-kohechi/`** — the mountain route from Kōyasan to
  Kumano Hongū Taisha, promoted out of the variant stub it had been since
  March 2026 into a section of its own. Four stages (16.7 / 13.1 / 18.8 /
  14.6 km), every one clearing the length gate, cut from a 64.327 km walked
  line built by `npm run build-main-line` from two pinned OSM relations.
  35 waypoints. All four stages' text was drafted and then read against its
  own evidence by a reviewer who wrote none of it, before any `drafted` flag
  came off; the record is `docs/review/kumano-kodo.md`.
- **`routes/kumano-kodo-iseji/` and `routes/kumano-kodo-ohechi/`** — two
  sections that ship metadata and nothing else: no walked line, no stages, no
  waypoints, no `ways` package, and so no `ways` entry in `index.json`. Each
  carries a `metadataOnly` string saying so in one sentence and an `osm` block
  recording what the search actually found, so the next attempt starts from
  the research instead of repeating it. Why neither could be cut is below.
- **A `kumano-kodo` pilgrimage in `index.json`**, `kind: "alternatives"`, its
  four sections in `order`. It declares no distance, and that is deliberate: a
  sum across alternatives describes no walk anyone takes.
- **`routes/kumano-kodo-nakahechi/route.main.geojson`** — the walked line,
  35.877 km over 1,592 points, derived from six pinned OSM relations that
  replace the name-matching Overpass query this section used to carry. The six
  together reach Nachi rather than stopping at Hongū Taisha — 83.8 km of
  member-way geometry against the ~35.9 km the four stages span — so a later
  release extending this section past Hongū can pin the same six.
- **Four new optional metadata fields**, all recorded in
  [`schema/CHANGELOG.md`](schema/CHANGELOG.md): a top-level `metadataOnly`
  string (present only on a section that deliberately ships without a walked
  line, which is what lets `check-site` tell that apart from a section that
  simply never had `fetch-osm` run over it), `osm.note` (why a relation list
  is what it is, where the choice is not obvious), `overview.hoursNote` (how a
  stage's `estimatedHours` was arrived at), and a widened `osmId` pattern that
  admits `way/` and `relation/` rather than `node/` alone.
- **`docs/kumano-kodo.html`**, generated by `build-assets` like the Camino's
  pilgrimage page, plus a detail page for each of the four sections.

### Changed

Five declared figures moved. Each is now measured on a walked line rather than
carried from a guidebook, and each old value is what a consumer would have
read before this release:

- **Nakahechi `overview.distanceKm` 39 → 36 km.** The 39 stood for the
  Nakahechi with the Kohechi and the Iseji gestured at in a note beside it;
  36 is this section alone, Takijiri-oji to Kumano Hongū Taisha, and the
  walked line beneath its four stages measures 35.877 km.
- **Nakahechi stage 0, Takijiri-oji → Takahara: 4 → 3.6 km.**
- **Nakahechi stage 1, Takahara → Chikatsuyu-oji: 13 → 9 km.**
- **Nakahechi stage 2, Chikatsuyu-oji → Hosshinmon-oji: 14 → 15.9 km.**
- **Kohechi `overview.distanceKm` 70 → 63 km.** The 70 came from the March
  2026 variant stub and was never measured against a line; 63 is the rounded
  sum of the four stages, which `ways/route.json` carries unrounded as 63.2,
  the same way `camino-frances` reads 763.7 against its declared 764.

Nakahechi stage 3, Hosshinmon-oji → Kumano Hongū Taisha, is unchanged at
7.5 km. The Iseji's 170 km is unchanged from the stub it was promoted from and
the Ōhechi's 90 km is new, but neither is a measurement — see below.

- **The Nakahechi's waypoints: 157 → 115.** 42 were removed, every one of them
  filed under its stage 3, and every one a Kōyasan-area or Kohechi-corridor
  feature that only ever qualified because the Kohechi was folded into this
  directory and admitted by this bbox. The bbox's north bound moved with them,
  34.22 → 33.90, so re-running `enrich-waypoints` cannot quietly re-add them.
  A consumer will see this count fall; nothing was lost in the fall, because
  the features that belong to the Kohechi are in the Kohechi's own file.
  Sharing an `osmId` with the Kohechi is not by itself grounds for removal:
  the Kohechi's final stretch *is* this section's own line, so a feature
  standing on it is walked by both and belongs in both files. Of the features
  the two sections share, only the four that also stood beyond this section's
  own corridor went on that ground; `node/10936209205`, 9 m off the line,
  stays.
- **The Nakahechi's `lastUpdated` moves 2026-08-20 → 2026-09-08**, which is
  what every `departedAt` in its `ways/` package is built from. Its id, three
  of its stage distances, its bbox and 42 of its waypoints all changed here;
  a package stamped August would date the stages earlier than the line they
  were cut from.

### Coverage, honestly

Two sections ship a package, both are listed, and both are flagged
`sparse: false` — but the flag is earned differently on each, and on one of
them it promises more than the section has:

- **The Nakahechi** carries 2.5 places a stage beyond each day's own start and
  end, out of 21 hand-curated waypoints — 18 of them sacred sites, thirteen of
  those the *oji* wayside shrines the route is strung along. All four stages
  clear the coverage bar.
- **The Kohechi clears the gate but not the convention.** Three of its four
  stages carry a moment beyond their own endpoints, which is all
  `sparse: false` measures — but **none of its 35 waypoints is hand-curated**,
  only 6 are of a type that becomes a moment, none of its moments carries
  text, and it averages **0.8 places a stage** against the 2–3 curated places
  a stage this pilgrimage's own design spec asks for. Its longest day, stage
  2's 18.8 km from Miura-guchi to Totsukawa Onsen, has nothing at all between
  its two endpoints. What the Kohechi got this release is enrichment, not
  curation. Read its `sparse: false` as "not empty", not as "covered".
- **Three curated waypoints deliberately carry no stage.** Kumano Nachi
  Taisha, Nachi Falls and Kumano Hayatama Taisha stand beyond Hongū, where the
  Nakahechi's four stages end. The sections that do reach them — the Ōhechi
  ends at Nachi, the Iseji at Hayatama — ship stageless this release, so there
  is no stage for them to belong to yet. Assigning them to the Nakahechi's
  stage 3 would claim a walker passes Nachi Falls on the way into Hongū, about
  30 km wrong. `validate` passes with them unassigned and `ways/report.json`
  lists all three as dropped; they wait for the section that reaches them,
  and their absence from any stage is a decision rather than an oversight.

### Why two sections ship without geometry

- **The Iseji's relation is confirmed, and nearly empty.** OpenStreetMap
  relation `19693803` is the Iseji: `wikidata=Q11379141`, `wikipedia=ja:伊勢路
  (熊野古道)`, and Mie Prefecture's own Kumano Kodō site as its `website`. It
  holds two ways totalling 2.06 km of a roughly 170 km route, one in the hills
  above Owase and one above Kumano-shi, whose nearest ends are 22.3 km apart.
  A corridor-wide sweep for the classic Iseji pass names turned up about 10 km
  more of loose, unrelated ways — nowhere near enough to bridge that. This is
  an upstream OpenStreetMap gap, not a wrong id, which is exactly why the id
  is pinned anyway: the next attempt should not spend a day re-confirming it.
- **The Ōhechi has no relation at all.** A sweep of every route, hiking, foot
  and pilgrimage relation in the Tanabe → Kushimoto → Nachi corridor returned
  seven relations, and all seven are Nakahechi or Kohechi. The trail exists in
  OpenStreetMap only as five loose, unrelated ways clustered inside Tanabe,
  0.58 km in total. No relation id is recorded, because there is none;
  inventing one, or pinning a neighbouring route's, would misrepresent what
  OSM holds.
- **So their 170 km and 90 km are planning estimates, not measurements.** Both
  come from this pilgrimage's own design spec (§5.2), and the Iseji's is the
  same figure its March 2026 variant stub already carried with no source of
  its own. Each carries a `distanceNote` saying so, and both should be
  expected to change once there is a line to measure them against. The Iseji's
  sea-level-to-647 m elevation range is declared on the same terms; its stub's
  cumulative ascent and descent were removed rather than annotated, because
  those are quantities you derive from a line and this section has none.
  Neither section is abandoned — both carry forward everything that was
  learned about them.
- **The Kohechi's line borrows a Nakahechi relation for its last 1.9 km, on
  purpose.** Relation `17131166` ends 1.9 km short of Kumano Hongū Taisha,
  because the final approach is tagged into the Nakahechi where the two routes
  converge on the shrine. Pinned alone it yields a 62.19 km line stopping
  short of the shrine this section is named for arriving at; pinned together
  with `17094646` it yields 64.33 km, Kōyasan to Hongū Taisha, one connected
  path — the join is a shared node, exact coordinate identity, 0 m. Both ids
  and the reasoning are in the section's `osm.note`.

### Known, and not fixed here

`scripts/enrich/waypoints.ts` builds its search corridor out of
`route.geojson`, while stages are cut from `route.main.geojson`. For the
Kohechi the two part company at the end: 1.780 km of walked line falls outside
the searched corridor, and 16 candidate features fall outside it too — among
them Haraido Oji, 6 m off the line and named in this section's own stage-3
text. Re-running the enrichment against the main line would be a net **+8**
waypoints (+10 gained, −2 lost), taking the Kohechi from 35 to 43.

Two corrections have to travel with that fix, or it gets scoped to the wrong
problem:

- **The 14 Kōyasan waypoints dropped from stage 0 at 310–572 m are not this
  bug.** The two lines agree to about 10 m there — a mean of 2.6 m over 318
  vertices. Those distances are measured against the simplified,
  boundary-snapped stage-0 slice, whose first vertex sits 266 m along from
  `route.main`'s own start. Only 2 of the 14 turn on the line mismatch.
- **Co-presence on the shared final 2.2 km is expected, and is not grounds for
  removal.** Eight Nakahechi waypoints already stand within 300 m of the
  Kohechi's line, two of them curated. A naive "same `osmId` in two sections"
  duplicate rule would strip the Hongū approach out of the section that walks
  it. Settle that before re-enriching, not after.

## [1.7.1] — 2026-09-07

The Camino del Norte gets the same treatment the Francés got in 1.7.0: a
`ways/` package cut from a line the route actually walks, and curated places
instead of none. It also adds the pilgrimage layer to `index.json` —
`pilgrimages[]`, `pilgrimage.circular`, four new `validate` checks, and a
generated page per pilgrimage — the first release to carry any of it.

### Added

- `pilgrimages[]` in `index.json`: a pilgrimage groups the sections that name it, with `kind` distinguishing sections walked in sequence from alternative ways to the same end. Additive — every `routes[]` entry keeps every field it had, and gains an optional `pilgrimage` naming the one it belongs to.
- **`pilgrimage.circular`** in a section's `metadata.json`: the walk returns to where it began, so the last section's final stage must close back against the first section's first stage. It is the whole pilgrimage's claim rather than each section's — Shikoku's four dōjō are each linear, and only the circuit they add up to closes — so every section of one pilgrimage has to declare it the same way.
- `validate` checks that the sections of a `legs` pilgrimage meet, that a circular pilgrimage closes, that no directory under `variants/` declares itself a section, and that no stage still carries drafted text.
- A generated page per pilgrimage, listing its sections and saying whether they are choices or legs. The catalog groups them under one heading, and each section page links back up.
- **`routes/camino-norte/ways/`** — 34 stages, all clearing the length gate.
  Cut from `route.main.geojson`, the walked line derived from the route's
  four pinned OSM relations and joined at shared coordinates by
  `npm run build-main-line camino-norte`. `route.geojson` could not serve as
  the source: it is those same four relations concatenated raw, variants and
  detours included — 1,367 km of geometry, where the walked line cut from
  them measures 799.9 km against the 788 km the route declares. Every stage
  boundary now snaps to a real point on the walked line; no boundary is
  placed by interpolating declared distances.
- **The POI fetcher asks for sacred sites, cultural sites, viewpoints and
  settlements**, not only water, beds, shops and transport. It could not
  return a `sacred_site`, `cultural_site`, `viewpoint` or `town` before this
  release, which is why every route's curated places were empty. Camino del
  Norte is the first route re-fetched under the wider query; the other six
  keep their existing waypoints and gain places in their own releases.
- **A stage anchor may declare `offLineMeters`** — a village or landmark the
  trail passes near but does not reach — checked against the walked line on
  every rebuild rather than assumed once and forgotten. Güemes and Cadavedo
  declare it (see below).
- **A CI check refuses a pull request that clears a stage's `drafted: true`
  flag without a matching entry in that route's review checklist**, closing
  the last way stage text could reach `main` unreviewed, ahead of the first
  PR that will draft any.

### Changed

- **A section that ships metadata-only warns instead of holding the release.** A section whose way graph cannot yet be closed may ship with `ways: null` and wait for a later release; the chain check was refusing exactly that, so one unbuildable section would have made its whole pilgrimage unshippable. A section `index.json` says shipped a package — or does not list at all — is still an error.
- **The drafted-text gate asks for the review, not only for the absence of an unticked one.** Where a section has a review checklist, every one of its stages needs a recognised line there, and a stage listed nowhere is named; a section that ships drafted text with no checklist anywhere is told which file to create and what to put in it. Deleting the flag and the checklist entry in one pass used to clear a stage more quietly than leaving the flag on.
- **Camino del Norte is no longer `sparse`.** 152 named places — sacred
  sites, viewpoints, ruins, villages and towns — now clear the ways
  builder's 300 m corridor; a chapel and a church sit just past it and are
  dropped. Measured the other way — what a stage passes beyond its own start
  and end towns — the route averages 4.1 places a stage, and 29 of its 34
  stages carry at least one, against a bar of 17. The route's card stops
  saying "few places marked yet".
- **Waypoints are enriched within 300 m of the route, not 500 m** — matching
  the radius the ways builder already used to decide what a stage keeps. The
  looser radius had let 913 waypoints get written to `waypoints.geojson` and
  then silently discarded by every stage that touched them.
- **Stage 11, Güemes → Santander: declared distance 15.3 km → 18.6 km.** The
  walked line measures the stage as the OSM relation actually carries it,
  including the Somo–Santander passenger ferry — the route's real crossing
  of the Bay of Santander — and the measured line wins past the length
  gate's tolerance. The old figure counted only the walk to the ferry slip.
  `terrainNotes` now says so: about 1.8 km of the 18.6 is the crossing, so
  roughly 16.8 km is on foot; walking around the bay instead is about 35 km
  of industrial road. No other stage's `distanceKm` changed.
- **`overview.distanceKm` 784 → 788**, following the corrected stage sum.
- **No Camino del Norte anchor moved.** Güemes and Cadavedo, the route's two
  anchors sitting beyond the walked line's snap radius, were checked against
  their OSM place nodes and found already correct: Güemes already sits 1 m
  from `node/288260848`, and moving Cadavedo onto `node/108478808` would put
  it 1,354 m off the line — 107 m worse than where it already stands. Both
  anchors now carry a `note` naming their node and both distances, and a
  declared `offLineMeters` the build checks on every run.

### Fixed

- Stage boundaries advance along the walked line. A route that passes a place twice could put a stage's end behind its start; the slice was cut anyway and the report never said so. Such a pair is now a named gate reason with nothing emitted (#7), and the reason names both anchors, the vertex they landed on together, and how far each is from the line — so the one to re-pin can be found.
- A route's `ways/report.json` counts every stage the route declares. A stage the cut skipped was left out of the coverage figures too, so the Camino del Norte's report read "only 0 of 33 stages" for a route of 34.
- `build-main-line` requires `osm.relations`. A name query pulled in every spur sharing the trail's name.
- **Stages 23 and 24 (Soto de Luiña → Cadavedo → Luarca) cut at the right
  vertex.** The stage boundary builder placed an anchor beyond its 500 m
  snap radius by interpolating between declared distances instead of
  snapping to a declared off-line anchor, landing both boundaries 3.7 km
  early — long enough that stage 23's geometry stopped short of the town it
  is named for. Their declared distances (18.5 km, 15.3 km) are unchanged;
  only where the walked line is sliced moved.

An earlier report on this branch, and the commit message for `63f4bc7`,
claimed the feedback loop between a proportionally-placed stage's declared
distance and its measured slice diverges. It does not: run to a fixed point,
it converges to 14.9 km in four rounds. The conclusion stands regardless —
converging there would have shipped a fabricated distance matching neither
the guidebook's 18.5 km nor any real distance between the two towns, on a
stage whose geometry still stopped 3.7 km short of Cadavedo. That commit
message cannot be corrected after the fact; this entry does not repeat it.

## [1.7.0] — 2026-09-05

The "a stage is a Way" release. Turns each route's stages into ready-to-walk
Way files the Pilgrim app decodes unchanged, and publishes an honest report of
what each route can and cannot yet promise a walker.

### Added

- **`routes/<route-id>/ways/`** — one `stage-NN.json` per stage in the exact
  JSON the Pilgrim iOS app's `Way` type decodes, plus `route.json` (the route's
  card data) and `report.json` (the coverage report). Built by
  `npm run build-ways`, which `npm run pipeline` now runs before
  `build-index`. Every file is validated against its schema before it is
  written, and again by `npm run validate` afterwards.
- **`schema/way.schema.json`, `schema/way-route.schema.json`,
  `schema/way-report.schema.json`** — the contract. A change to
  `way.schema.json` is a change to the app.
- **`routes/camino-frances/route.main.geojson`** — the *walked line*: the main
  route with the optional variants and detours left out. `route.geojson`
  measures 994.4 km against 763.7 km of stages, so slicing stages from it
  handed a 27 km day a 63 km geometry. OSM offers nothing to filter on — every
  member role in all six sub-relations is empty — so the line is derived
  instead, by `npm run build-main-line camino-frances`: a graph over the
  relations' member ways, joined at exactly shared coordinates, walked by
  shortest connected path between consecutive stage boundaries. 767.5 km over
  ~32,800 points.
- **`index.json` gains `release`** (the git tag this build will be published
  under, which the app pins every package download to) and, per route, **`ways`
  `{ stageCount, bytes, placesPerStage, sparse }`** for a route whose every
  stage cleared the length gate. `sparse` is true when fewer than half the
  route's stages carry a place beyond the day's own start and end towns; apps say so
  on the card rather than hiding the route.
- **`npm run build-ways`** and **`npm run build-main-line <route-id>`**.

### Changed

- **The `v1` moving tag is no longer maintained, and the catalog moved to
  `@main`.** jsDelivr caches a tag URL permanently: `v1` was force-moved onto
  the v1.6.0 commit in August 2026, and `@v1/index.json` still serves the March
  2026 index — three routes, 1,725 bytes — while `@v1.6.0` and `@main` both
  serve the current seven-route index. Consumers should read
  `@main/index.json` for the catalog and pin every file they then download to
  the exact tag its `release` field names. Existing `@v1` URLs keep resolving
  to the bytes jsDelivr cached; `https://purge.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/<path>`
  is the only way to refresh one.
- **`interior.reflection` is now required** in `stages.schema.json`. All 109
  stages across all seven routes already carry one; requiring it means the
  closing line a walker reads at the end of a stage can never quietly fall back
  to a narrative's last sentence for committed data.
- **Six Camino Francés stage anchors corrected to their OSM place nodes** —
  Zubiri, Santo Domingo de la Calzada, Terradillos de los Templarios,
  Bercianos del Real Camino, San Martín del Camino, and Foncebadón. Each sat
  hundreds of meters to several kilometers off the walked line (Bercianos del
  Real Camino by nearly 4 km), which is what made the stages on either side of
  it measure short or long against their declared distance. No `distanceKm`
  changed: the route total is unchanged at 763.7 km → 764.

### Coverage, honestly

One route is listed, and its own report says what it can and cannot promise:

- **Camino Francés** clears the length gate on all 33 stages and ships a
  complete, validating package — listed, and flagged `sparse`. Only **3 of its
  33 stages** carry a curated place beyond their own start and end towns, about
  **0.1 per stage**: it needs more curated places, not more code, and until it
  has them the app's card says "few places marked yet".
- **Shikoku 88** is the mirror image: **9 of its 10 stages** would clear the
  coverage bar on the strength of its 88 temples, but its ten stage distances
  sum to 907 km for a ~1,200 km circuit, so no walked line can be measured
  against them. It is deliberately left without a `route.main.geojson`, and so
  is not listed.
- **Kumano Kodo** would clear the coverage bar on all four stages and fails the
  length gate on all four, even sliced from the Nakahechi feature alone.
- **Camino Inglés, Norte, Portugués and Primitivo** carry service waypoints
  only — no curated places at all.

## [1.6.0] — 2026-08-21

The "make the data usable and keep it honest" release. Ships GPX for every route, surfaces ~16,000 words of already-authored interior journey content that rendered nowhere, rebuilds the documentation site from 3 routes to 7, and adds a CI guard that makes the site structurally unable to drift from the data again. Also corrects four numeric contradictions found by auditing every route against every other source.

No route geometry, waypoints, or stage data changed. Consumers pinning `@v1` gain `route.gpx` and four corrected metadata values.

### Added

- **`route.gpx`** for every route and for the Camino Portugués da Costa Coastal variant — GPX 1.1 tracks generated from each `route.geojson`, at full fidelity, for loading directly into GPS apps and devices. One `<trkseg>` per source segment, so multi-segment routes (Shikoku 88's MultiLineString, Kumano Kodo's seven LineStrings) describe their real discontinuous geometry rather than one implausible continuous line. Deliberately carries no `<time>` element so output stays byte-stable and CI can diff it. Linked from every detail page and from the README.
- **Interior journey content on the website.** All 109 stages across all 7 routes already carried an authored theme, narrative, common experiences, and reflection prompt — roughly 16,000 words. The site rendered only the one-word theme. Every stage now renders in full, in native `<details>` disclosures that work without JavaScript and keep the text findable when collapsed. Marked explicitly as editorial so it is never mistaken for measured data.
- **`scripts/site/check-site.ts`** — a CI guard asserting the site matches the dataset: every route has a catalog link, a detail page, a glyph, a README entry and a GPX; the published totals equal live aggregates; per-route figures match; every inlined SVG matches its generated source; interior narratives and reflections match `stages.json` stage by stage; no orphaned pages or assets; no internal link keeps a `.html` extension.
- **Generated visual assets per route** — a simplified SVG glyph projected from `route.geojson`, a stepped elevation profile from `stages.json`, and a pilgrim-count sparkline from `stats.json`. All committed, byte-stable, and diffed in CI.
- **Route chooser** on the catalog page, filtering the seven routes by days available, distance, difficulty, and month.
- **Dark mode** across the site, with every text pairing meeting WCAG AA in both themes.
- **`npm run stats` now reports a route-points total**, so the headline figure the README and site publish is obtainable from the CLI meant to verify it.

### Fixed

**Pipeline**

- **`npm run stats` undercounted route points by 49,020.** It counted `feature.geometry.coordinates.length`, which for a `MultiLineString` counts line segments rather than points. Shikoku 88 reported 77 instead of 49,097, making the dataset total read 110,604 instead of 159,624. `README.md` had always published the correct figures; the error was confined to the script. A regression test now pins both numbers.
- **`npm run build-index` was not idempotent**, stamping a fresh `generatedAt` on every run so the CI drift check could never pass — it had failed on all 20 recorded runs. The timestamp now carries forward when route content is unchanged.
- **Route ordering depended on filesystem iteration order.** `readdirSync` returns entries alphabetically on macOS APFS and in hash order on Linux ext4, so `index.json` generated locally would not match the same file regenerated on the CI runner. Now explicitly sorted with a codepoint comparator.

**Factual corrections**

- **Camino Francés** described itself as 790 km while `overview.distanceKm`, `index.json`, the README, and the sum of its 33 stages all said 764. The 790 was the pre-1.5.0 figure. Its `distanceNote` still cites Brierley's ~790 km published total, which legitimately exceeds our stage sum and is unchanged.
- **Camino Portugués** declared an elevation range of 10–420 m while its 11 stages span 5–410 m. Its stages cover the entire route, so no unstaged section justified the wider range.
- **Camino Portugués da Costa (Coastal)** declared a 100 m maximum against a 95 m stage high point.
- **Kumano Kodo** declared a 50 m minimum against an 80 m stage low point. Its `distanceNote` states the route describes the Nakahechi, whose four stages cover it entirely.
- Shikoku 88 has a superficially similar discrepancy (0 m declared against a 5 m stage minimum) and is deliberately unchanged: its `elevationNote` documents the 10-stage breakdown as a simplification of the full 1,200 km circuit, 293 km of which is unstaged coastal road.

### Changed

- **The documentation site was rebuilt.** It had gone five releases stale, describing 3 routes when the dataset shipped 7 plus 6 variants, with every headline figure wrong. It now covers all seven with per-route detail pages, and the guard above prevents recurrence.
- **All internal site URLs are extensionless** (`/camino-frances` rather than `/camino-frances.html`).
- CI now runs the test suite and `tsc --noEmit` before the drift check, verifies generated assets are current, and runs the site guard.

### Documentation

- `stats.json` is documented on the schema and usage pages, including the honest note that no JSON Schema validates it yet.
- `CLAUDE.md` corrected: coordinates are `[longitude, latitude]`. Route geometry is 2D throughout, which is why elevation profiles derive from `stages.json` rather than the geometry.
- A styled 404 page.

## [1.5.0] — 2026-04-10

The "Top 4 Missing Caminos" release. Adds three new Camino routes (Inglés, Primitivo, Norte) and upgrades the Camino Portugués Coastal stub to a full route for its Portuguese section. Together these cover ~149,000 of the non-Frances/non-Portugués-Central annual Compostelas. Extends the dataset from 4 to 7 routes. Every fact was verified by two independent agent rounds plus 12 deep local checks.

### Added

- **Camino Inglés (English Way)** as the fifth pilgrimage route — 6 stages, ~112 km from Ferrol to Santiago de Compostela, 482 OSM-sourced waypoints, complete editorial interior journey content per stage. The shortest major Camino and the most distinctively maritime; historically walked by English, Irish, Scandinavian, and Flemish pilgrims arriving by sea. 30,204 pilgrims in 2025 (5.7% of all Compostelas). One A Coruña start variant stub.
- **Camino Primitivo (Original Way)** as the sixth pilgrimage route — 11 stages, 263 km from Oviedo to Melide (where it joins the Francés), 732 OSM-sourced waypoints, full editorial content. The oldest Camino — walked by King Alfonso II of Asturias from his capital Oviedo to Santiago in 814 CE — and the most physically demanding, crossing the Asturian mountains via Puerto del Palo (1,146 m, the highest point of any Camino). UNESCO inscribed in the 2015 Northern Spain extension. 27,871 pilgrims in 2025 (5.2%).
- **Camino del Norte (Northern Way)** as the seventh pilgrimage route — 34 stages, ~784 km from Irún on the French border to Arzúa (where it joins the Francés), 3,634 OSM-sourced waypoints, full editorial content. The longest non-Francés Camino and among the oldest, walked when inland Iberia was under Moorish control. Spans four regions: Basque Country, Cantabria, Asturias, and Galicia. UNESCO inscribed 2015. 21,521 pilgrims in 2025 (4.1%).
- **Camino Portugués da Costa (Coastal)** upgraded from stub to full route for the Portuguese section — 5 stages, 110 km from Porto along the Atlantic through Vila do Conde, Esposende, Viana do Castelo, and Caminha to the A Guarda ferry crossing, 1,043 OSM-sourced waypoints, full editorial content. The fastest-growing major Camino by percentage, jumping from 2,600 pilgrims in 2016 to 89,511 in 2025 (16.9% of all Compostelas). The Spanish continuation through Oia/Baiona/Vigo/Redondela is deferred to a future release.
- **New OSM infrastructure**: added `camino-ingles`, `camino-primitivo`, and `camino-norte` entries to `scripts/fetch-osm.ts` (the Coastal upgrade uses the existing Portugués variant path). Primitivo uses 11 sub-relations under OSM superroute 19298101; Norte uses 4 regional sub-relations (one per autonomous community) under superroute 19001007.

### Fixed

#### Pipeline (`scripts/enrich/`)
- **`waypoints.ts` pre-stage-0 geometry handling:** the stage assignment logic was dumping any geometry coordinates before the projected stage 0 start into the last stage as a fallthrough default. Affected routes where the OSM relation has a short prefix before the canonical start point (Camino Inglés: ~50 waypoints around Ferrol were being assigned to stage 5). Fixed by forcing stage 0 to claim from coord index 0.
- **`geometry.ts` relation ordering:** when fetching multi-relation routes, Overpass returns relations in document order rather than the order requested in `osm.relations`. This scrambled the geometry for the Camino Primitivo (11 Etapas). Fixed by reordering returned relations to match the requested `osm.relations` array before concatenation.

#### Factual corrections (Inglés)
- Distance: 123 km → 112 km (matches OSM relation 1102966 distance tag; stages now follow Gronze.com's canonical breakdown).
- Ferrol start coordinate: corrected to the actual Curuxeiras pier (-8.2436, 43.4777).
- Cicerone ISBN corrected: 978-1786310323 → 978-1786310064; missing co-author Laura Perazzoli added.
- Brierley publisher updated: Findhorn Press → Kaminn Media Ltd (correct since 2017).
- Removed incorrect Nikulás Bergsson / Leiðarvísir claim — that itinerary describes pilgrimages to Rome and Jerusalem, not Santiago.
- Removed nonexistent "Punta da Promontoira lighthouse" reference.
- Corrected Santiago de Betanzos church attribution to Fernán Pérez de Andrade "o Mozo" (the Younger, early 15th c.) per Galician Wikipedia dedicated article.
- Celtic Camino rule wording corrected: geography-of-home-route-based, not citizenship-based.
- Os Caneiros festival description: now correctly notes both fixed dates (Aug 18 and Aug 25) rather than "varies year to year".

#### Factual corrections (Primitivo)
- Salas coordinate: longitude 1.87 km off → -6.2569, 43.4082 (OSM town node).
- La Mesa elevation: 950 m → 860 m; Grandas de Salime: 591 m → 557 m.
- Share of all 2025 Compostelas: 5.3% → 5.2% (three places — 27871/531000 = 5.25%).
- Cámara Santa UNESCO inscription: corrected to the 1998 boundary extension (the original 1985 inscription ref 312 covered only three churches — Santa María del Naranco, San Miguel de Lillo, Santa Cristina de Lena; Cámara Santa and San Julián de los Prados were added in the 1998 extension).
- Lugo Roman walls height: 10-15 m → 8-12 m (Wikipedia).
- Madrid → Oviedo AVE timing clarified: the fastest ~3h06-3h15m services apply from May 2024 onwards (not November 2023 opening).

#### Factual corrections (Norte)
- Distance: 820 → 784 km (matches sum of shipped stages Irún → Arzúa; distanceNote explains that the full Irún → Santiago distance of ~820 km per Cicerone includes the shared Francés continuation already documented in `routes/camino-frances/stages.json`).
- **`genderSplit.male` typo: 0.6652 → 0.5652** (12106/21418 = 56.52%; the counts field was already correct, only the decimal had a digit-off typo that made gender percentages sum to 110%).
- Eight stage coordinates corrected to OSM `place=town/village/hamlet` node values (largest correction: Gondán 3.46 km off, in empty countryside; others: Sobrado dos Monxes 2.5 km, Avilés 1.15 km, Güemes 1.07 km, Gernika-Lumo 928 m, Abadín 1.2 km, Muros de Nalón 865 m, A Caridá 759 m, Laredo 700 m, Colunga 505 m).
- Stage 4 Gernika narrative: "thousand-year-old oak tree" rewritten — the current Gernikako Arbola was planted in March 2015; the "father" tree (14th century) lasted 450 years; no tree in the lineage was ever 1,000 years old.
- Stage 4 Colegiata de Zenarruza: "12th-century with Cistercian ties" dropped — the Gothic building fabric is 14th-15th century, and Cistercian monks only arrived in 1988.
- Stage 7 Vizcaya Bridge designer: "student of Eiffel" → Alberto Palacio (the actual Basque architect who designed the bridge).
- Stage 13 Comillas Pontifical University clarified: the university moved to Madrid in 1969; the Comillas building is the former Pontifical Seminary.
- Stage 20 Oscar Niemeyer cultural centre: "only European work" → "only work in Spain" (Niemeyer has several other European works including the French Communist Party HQ).
- Stage 26 Puente de los Santos: "1.5 km road bridge" → "612-metre road bridge" (off by a factor of ~2.5).
- Stage 27 Lourenzá founder: "Oseiro Gutiérrez / Osera family chapel" → "Count Osorio Gutiérrez (the 'Conde Santo' or Holy Count) / chapel of Valdeflores"; founded around 969; 6th-century Paleochristian marble sarcophagus from Aquitaine. The Lourenzá narrative was also moved from stage 27 (which ends at Gondán, before Lourenzá) to stage 28 (which actually passes through Vilanova de Lourenzá).
- Stage 31 Baamonde parish church: "San Pedro Fiz" → "Santiago de Baamonde" (12th-century Romanesque, dedicated to Saint James himself — fitting for a pilgrim church).
- Stage 32 Miraz albergue: "old Templar" connection dropped (unsupported by any source); clarified as Albergue San Martín in the old parsonage, run by the UK Confraternity of Saint James since 2005.

#### Factual corrections (Coastal)
- Distance: 130 → 110 km (matches sum of the 5 shipped stages; Gronze.com confirms).
- Caminha ferry details completely updated: the original municipal ferry Santa Rita de Cássia has been suspended since 2020. Current crossings are operated by two private services — Xacobeo Transfer (~07:30-15:30) and Taxi Boat Peregrinos (~07:00-17:00 every 30 min). Corrected pricing (~€6, not €2-3), crossing time (~10 minutes, not ~20 minutes), and Tui bridge detour distance (~30 km, not ~20 km).
- Ponte Eiffel attribution: "built by a student of Gustave Eiffel" → "built by Eiffel & Cie, the firm Gustave Eiffel co-founded with his partner Théophile Seyrig in 1868" (Wikipedia credits Eiffel alone for the Viana bridge).
- Revival date: "around 2014" → "officially recognized by the Cathedral of Santiago in 2016 and fully marked by 2017" (matches the trend data showing real takeoff in 2017).
- Stage 3 Dólmen da Barrosa location: named explicitly and corrected to near Vila Praia de Âncora (not Afife).

### Changed

- All four new routes' `stats.json` use verified Solvitur Ambulando data for 2003-2025 annual counts and per-route 2024 demographics (gender, age, motivation, top 14-15 nationalities). Every numeric value was re-verified against a live Solvitur API fetch on 2026-04-10 during the final review pass.
- `scripts/fetch-osm.ts` — appended entries for Inglés, Primitivo, and Norte for legacy fetch consistency.
- `index.json` auto-regenerated: now lists 7 routes.

### Documentation
- README hero line and stats refreshed: 159,624 GPS points, 12,576 waypoints, 109 stages across 7 routes and 3 traditions.
- "What's In the Box" table now lists all 7 main routes plus the Coastal upgrade.
- "Waypoint Coverage" table expanded with Norte, Primitivo, Coastal, and Inglés columns.
- Per-route stats section in the README now includes one-line summaries of all 7 routes.

## [1.4.0] — 2026-04-09

The largest release since the initial v1.0. Adds a fourth pilgrimage route, fixes pre-existing pipeline bugs that affected stage assignment in all routes, replaces estimated stats with verified data from an authoritative source, and corrects ~40 factual errors caught across three rounds of fact-checking.

### Added
- **Camino Portugués (Central)** as the fourth pilgrimage route — 11 stages, 243 km, 1,634 OSM-sourced waypoints, complete editorial interior journey content per stage. The second most-walked route to Santiago de Compostela (19% of all 2025 Compostelas).
- Three Camino Portugués sibling variants as metadata stubs (mirroring Kumano iseji/kohechi pattern):
  - **Coastal** (Caminho Português da Costa, ~280 km via Vila do Conde, Viana do Castelo, Caminha)
  - **Espiritual** (Variante Espiritual, ~73 km Pontevedra-Padrón detour through Combarro and Armenteira)
  - **Lisboa** (Caminho Português desde Lisboa, ~620 km full route)
- `osm.trimStart` support in `scripts/enrich/geometry.ts` — when an OSM relation covers a longer corridor than the commonly-walked sub-section, geometry can be trimmed to start at a specified coordinate.
- `docs/data-sources.md` — comprehensive guide documenting where annual pilgrim statistics come from for each route, with refresh procedures, URL patterns, and gotchas.
- Solvitur Ambulando JSON API as the primary source for Camino route statistics (covers 2003-2025 with per-route demographics).
- `totalCaminoContext` field in Frances stats showing the Francés share of all Compostelas declining from 88.1% (2003) to 45.6% (2025).
- `coastalSiblingTrend` field in Portugués stats showing the Coastal route counts 2003-2025 for context.

### Fixed

#### Pipeline (`scripts/enrich/`)
- **`waypoints.ts` MultiLineString crash:** `getRouteCoords` silently broke on MultiLineString geometry, producing NaN distances. Affected Shikoku 88 (kmFromStart values up to 4,019 km on a 1,200 km route). Now correctly handles both LineString and MultiLineString.
- **`waypoints.ts` stage assignment:** previously used cumulative-km projection from concat-inflated geometry, dumping 46% of Portugués and 22% of Frances waypoints into the wrong last stage. Replaced with coordinate-index-based assignment, plus a geographic-nearest-segment fallback for circular (Shikoku) and network (Kumano) topologies.
- **`waypoints.ts` kmFromStart:** now computed from stage cumulative + within-stage fraction instead of inflated projection distance.

#### Data alignment (metadata vs stages)
- **Camino Francés:** `distanceKm` 790 → 764 (Brierley sum); elevation totals 13,331/13,246 → 11,024/10,680; `minMeters` 50 → 172. Added `elevationNote` and `distanceNote` documenting the relationship to canonical published figures.
- **Camino Portugués:** distance and stages already aligned at 243 km — no changes needed.
- **Kumano Kodo:** `distanceKm` 38 → 39; elevation loss 2,290 → 2,100; bbox tightened from 135.40-136.50 to 135.49-135.94.
- **Shikoku 88:** `maxMeters` 1,400 (unjustified — no temple is that high) → 911 (Temple 66 Unpen-ji); elevation totals 18,000/18,000 → 16,780/14,470; bbox west 132.01 → 132.49. Added `maxMetersNote` and `elevationNote`.

#### Factual corrections
- Camino Francés ISBN "The Art of Pilgrimage" `978-1573245654` (fabricated) → `978-1573245937` (verified Conari Press paperback).
- Camino Francés ISBN "The Way Is Made by Walking" `978-0830835065` (off by digits) → `978-0830835072` (verified IVP Books 2007).
- Camino Francés Bayonne→SJPP train time "1h15" → "about 1 hour" (actual SNCF schedule is ~1h01).
- Camino Francés Santiago airport "10 km from city center" → "about 12 km" (actual). Renamed "Santiago de Compostela Airport" → "Santiago–Rosalía de Castro Airport" (official name since 2020).
- Camino Francés Irache Wine Fountain coordinates `[-2.02, 42.66]` (2 decimals) → `[-2.0327, 42.6610]` (4 decimals). Description expanded with build year (1991), founding (1891), daily flow (100L), opening hours.
- Camino Francés San Fermín event date `day: 7` → `day: 6` (festival starts noon July 6).
- Camino Francés "500K medieval pilgrims annually" — softened: historians cite a wide range from ~250K to >500K and no figure is well-documented.
- Camino Francés UNESCO inscription history clarified: 1993 covered the Spanish portion only; the French portion was inscribed 1998 as a separate inscription; the 1993 inscription was renamed and expanded in 2015 with the Northern Spain routes.
- Kumano Kodo UNESCO criteria `["ii", "iv", "vi"]` → `["ii", "iii", "iv", "vi"]` — was missing criterion (iii), the "exceptional testimony to a cultural tradition" criterion. Added the official inscription name field.
- Kumano Kodo "the only two pilgrimage routes in the world with UNESCO designation" → "the only two pilgrimage routes in the world with a formal sister-route relationship through the Dual Pilgrim program (2015)" — more precise.
- Kumano Kodo Tsuboyu "the only bathing facility in the world with UNESCO World Heritage status" → "the only hot spring on a UNESCO World Heritage pilgrimage route".
- Shikoku 88 `hakue` → `hakui` (白衣) — standard romanization for the white pilgrim jacket.
- Shikoku 88 stats 2015 anniversary "1200th anniversary of Kukai's pilgrimage" → "1200th anniversary of the Shikoku 88 pilgrimage's traditional founding (815 CE, attributed to Kūkai)" — Kūkai didn't personally walk all 88; the circuit was formalized later.

### Changed

- **Camino Francés `annualPilgrims`** semantic correction: previously the trend used total all-Camino Compostela counts (530K for 2025). Now uses Frances-only counts (242K for 2025), matching what users expect when querying "how many people walked Frances?". A new `totalCaminoContext` field preserves the all-Camino totals for context.
- **Camino Portugués stats:** all trend years 2003-2025 now from verified Solvitur Ambulando data (replacing earlier estimates for 2022-2025). Per-route 2024 demographics added (Spain 36.78%, Portugal 12.86%, US 7.26%, etc. — these are for Portugués specifically, not the all-Camino aggregate).
- **All four routes' waypoints** re-enriched through the fixed pipeline. Notable improvements:
  - Frances stage 32 dropped from 636 → 265 waypoints (~371 misplaced waypoints redistributed to correct earlier stages).
  - Kumano went from 47 → 157 waypoints (the MultiLineString bug was filtering out 110 valid POIs).
  - Shikoku stage 9 dropped from 2,626 → 692 waypoints; kmFromStart values now max at 907 km (matching stages total) instead of 4,019 km (the previous bug's runaway projection).

### Documentation
- Added `docs/data-sources.md` covering primary and secondary data sources for each route, refresh procedures, the Solvitur API working command (with browser headers + gzip handling), the Oficina del Peregrino PDF URL patterns (2004-2021), and a critical warning about the Solvitur API's variable route index ordering across years.

---

## [1.3.0] — 2026-04-03

Complete interior journey content for all 47 stages across the 3 existing routes (Camino Francés, Kumano Kodo, Shikoku 88).

## [1.2.0] — 2026-04-02

Fix Shikoku 88 MultiLineString geometry artifact.

## [1.1.0] — 2026-03-27

Full enrichment release: ~89,000 route geometry points fetched from OSM, 5,976 OSM-sourced waypoints classified into 11 categories, historical statistics for all routes.

## [1.0.0] — 2026-03-26

Initial release with three pilgrimage routes:
- Camino de Santiago (Frances)
- Kumano Kodo (with Iseji and Kohechi variant stubs)
- Shikoku 88 Temple Pilgrimage

Each route ships with `metadata.json` (overview, tradition, cultural, logistics), `route.geojson` (geometry), `stages.json` (stage breakdown), and `waypoints.geojson` (POIs). Schema version 1.0.0.

---

[1.9.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.7.1...v1.8.0
[1.7.1]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/walktalkmeditate/open-pilgrimages/releases/tag/v1.0.0
