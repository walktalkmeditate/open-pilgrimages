# Changelog

All notable changes to the open-pilgrimages dataset are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The data file `schemaVersion` field tracks the JSON schema separately from the package version (currently `1.0.0`).

Consumers read the catalog from `https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@main/index.json` and pin every file they then download to the tag that index's `release` field names. The `v1` alias is no longer maintained — jsDelivr caches tag URLs permanently, so moving it changed nothing a consumer saw.

## [Unreleased]

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

[Unreleased]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.6.0...HEAD

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

[1.6.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/walktalkmeditate/open-pilgrimages/releases/tag/v1.0.0
