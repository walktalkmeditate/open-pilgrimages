# Open Pilgrimages

Canonical open-source pilgrimage route dataset. Three-layer schema: geometry, logistics, cultural/spiritual.

## Project Structure

```
routes/{route-id}/          # One directory per pilgrimage
  metadata.json             # Overview, tradition, culture, logistics
  route.geojson             # GeoJSON FeatureCollection (LineString/MultiLineString)
  stages.json               # Stage breakdowns with interior journey
  waypoints.geojson         # GeoJSON FeatureCollection (Point features)
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

- Coordinates: `[longitude, latitude, altitude]` (GeoJSON standard)
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
```

## Consumers

- pilgrim-ios: Decodes route.geojson and waypoints.geojson via GeoJSONFeatureCollection Codable type
- jsDelivr CDN: `https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/{routeId}/`

## Interior Journey Content

The `interior` field in stages.json is editorial content (not sourced from OSM). It contains stage themes, narratives about the pilgrim experience, common emotional/spiritual experiences, and reflection prompts. This content is clearly separated from factual data.
