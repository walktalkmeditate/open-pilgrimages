# Changelog

All notable changes to the open-pilgrimages dataset are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The data file `schemaVersion` field tracks the JSON schema separately from the package version (currently `1.0.0`).

The moving tag `v1` always points to the latest `v1.x.x` release. CDN consumers using `https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/...` automatically receive the latest minor/patch on the v1 line.

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

[1.4.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/walktalkmeditate/open-pilgrimages/releases/tag/v1.0.0
