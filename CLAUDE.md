# Open Pilgrimages

Canonical open-source pilgrimage route dataset. Three-layer schema: geometry, logistics, cultural/spiritual.

## Project Structure

```
routes/{route-id}/          # One directory per pilgrimage
  metadata.json             # Overview, tradition, culture, logistics
  route.geojson             # GeoJSON FeatureCollection (LineString/MultiLineString)
  route.gpx                 # GPX 1.1 track, generated from route.geojson (npm run build-assets)
  stages.json               # Stage breakdowns with interior journey
  waypoints.geojson         # GeoJSON FeatureCollection (Point features)
  route.main.geojson        # Walked line: main route with variants removed (npm run build-main-line)
  ways/                     # Stage packages for the Pilgrim app (npm run build-ways)
  variants/{variant-id}/    # Sub-routes with same file structure
schema/                     # JSON Schema definitions
scripts/                    # Data pipeline (fetch, process, validate)
docs/                       # GitHub Pages documentation site
index.json                  # Route registry (auto-generated)
```

## Licenses

- Data (routes/, index.json): ODbL 1.0
- Code (schemas, scripts, docs): MIT

## Data Conventions

- Coordinates: `[longitude, latitude]`, optionally `[longitude, latitude, altitude]` (GeoJSON standard). Route geometry in `route.geojson` is currently 2D; per-stage elevation lives in `stages.json`.
- Altitude: meters
- Distance: kilometers
- Localized strings: `{ "en": "...", "es": "...", "ja": "..." }` — `en` always required
- Schema version: SemVer in every file (`"schemaVersion": "1.0.0"`)
- Route IDs: kebab-case (`camino-frances`, `shikoku-88`, `kumano-kodo`)

## Commands

```bash
npm run validate      # Validate all data against schemas
npm run pipeline      # Fetch + process + validate + build index
npm run fetch         # Fetch route geometry from OSM
npm run build-index   # Regenerate index.json
npm run build-ways            # Build routes/{route-id}/ways/ from the walked line + stages + waypoints
npm run build-main-line <id>  # Derive route.main.geojson from OSM member ways (network)
npm run fetch-roads   # Fetch road-corridor data from Overpass into .cache/ (gitignored) — the only command that touches the network
npm run build-roads   # Render docs/assets/roads/{route-id}.svg from the .cache/ fetched above; no network access
```

## Consumers

- pilgrim-ios: Decodes route.geojson and waypoints.geojson via GeoJSONFeatureCollection Codable type
- jsDelivr CDN: `https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@main/index.json` for the catalog, then `@{release}/routes/{routeId}/` for packages — see Stage Packages below

## Stage Packages

`ways/` holds one Way file per stage, in the wire format the Pilgrim iOS app's
`PilgrimageWayImporter` reads — **not** what Swift's synthesized `Codable`
would write. A moment is flat (`"kind": "waypoint"` with `label` and `icon` as
siblings), a stage file carries no `source` field, and every field of the
`stage` block is required. `schema/way.schema.json` is that contract; changing
it changes the app.

Stages are cut from `route.main.geojson` when a route has one, never from
`route.geojson`, which bundles optional variants: the Camino Francés' committed
geometry is 994 km against 764 km of stages.

Everything the build writes is deterministic — `departedAt` and the report's
`generatedAt` come from the route's own `metadata.json` `lastUpdated`, not from
wall-clock time, so CI's drift check has something stable to diff.

Consumers read `index.json` from `@main` and pin every file they then download
to the tag its `release` field names. The `v1` alias is not maintained:
jsDelivr caches tag URLs permanently, so moving it changes nothing anyone
sees.

## Interior Journey Content

The `interior` field in stages.json is editorial content (not sourced from OSM). It contains stage themes, narratives about the pilgrim experience, common emotional/spiritual experiences, and reflection prompts. This content is clearly separated from factual data.
