# Schema Changelog

## 1.1.0 (unreleased)

### Files
- `way.schema.json` — one stage of a pilgrimage route as `routes/{route-id}/ways/stage-NN.json`, in the wire format the Pilgrim iOS app's importer reads. Flat moments (`"kind": "waypoint"` with `label` and `icon` as siblings), no `source` field, every field of the `stage` block required. A change to this file is a change to that app.
- `way-route.schema.json` — `routes/{route-id}/ways/route.json`, the route's card data.
- `way-report.schema.json` — `routes/{route-id}/ways/report.json`, the coverage report: per stage, the slice length against the declared distance, the moment and mark counts, and what was dropped; per route, the length-gate verdict and how thinly curated it is.

### Breaking
- **`stages.schema.json`: `interior.reflection` is now required** when a stage carries an `interior` block. All 109 stages in the dataset already have one; a contribution that omits it now fails validation instead of silently losing the line a walker reads at the end of the stage.
- **`index.schema.json`: `release` is now required** at the top level, matching `^v\d+\.\d+\.\d+$`. It names the git tag the build will be published under, and consumers pin every package download to it.

### Added, non-breaking
- `index.schema.json`: an optional per-route `ways` object — `stageCount`, `bytes`, `placesPerStage`, `sparse`. Present only for a route whose every stage cleared the length gate; absent means apps hide the route.

## 1.0.0 (2026-03-26)

Initial release.

### Files
- `index.schema.json` — Route registry validation
- `pilgrimage.schema.json` — Route metadata (overview, tradition, cultural, logistics, provenance)
- `stages.schema.json` — Stage breakdowns with interior journey
- `route.schema.json` — Route geometry GeoJSON properties
- `waypoints.schema.json` — Waypoint GeoJSON properties

### Three-layer data model
- **Layer 1 (Geometry)**: GeoJSON LineString/MultiLineString routes, Point waypoints
- **Layer 2 (Logistics)**: Stage distances, elevation, accommodation, water, services, warnings
- **Layer 3 (Cultural/Spiritual)**: Tradition, credential systems, literature, practices, interior journey

### Supported topologies
- Linear (Camino Frances)
- Circular (Shikoku 88)
- Network with variants (Kumano Kodo)

### Localization
- `LocalizedString` pattern: `{ "en": "...", "ja": "..." }` with English always required

### Waypoint taxonomy
15 types: town, accommodation, sacred_site, water_source, credential_stamp, viewpoint, food, medical, transport, waymarker, cultural_site, camping, pass, information, supply
