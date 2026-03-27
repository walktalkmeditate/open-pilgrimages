# Open Pilgrimages

A canonical, open-source dataset of pilgrimage routes worldwide.

89,136 GPS points. 5,976 waypoints. 47 stages. 3 traditions. All structured as JSON and GeoJSON.

## What's In the Box

| Route | Distance | Topology | Tradition | Route Points | Waypoints | Stats |
|-------|----------|----------|-----------|-------------|-----------|-------|
| [Camino Frances](routes/camino-frances/) | 790 km | Linear | Christian | 33,192 | 2,953 | 41 years (1985-2025) |
| [Shikoku 88](routes/shikoku-88/) | 1,200 km | Circular | Buddhist | 49,097 | 2,976 | 21 years (2005-2025) |
| [Kumano Kodo](routes/kumano-kodo/) | 38-170 km | Network | Shinto/Buddhist | 6,847 | 47 | 22 years (2003-2024) |

### Three Layers of Data

**Layer 1 — Geometry:** Full-resolution GPS trails from OpenStreetMap. Not simplified stage endpoints — actual trail paths with 33k-49k coordinate points per route.

**Layer 2 — Logistics:** 5,900+ waypoints including water sources, pharmacies, hospitals, accommodation, restaurants, convenience stores, bus stops, and train stations. Each tagged with `stageIndex` and `kmFromStart` for route-aware queries.

**Layer 3 — Cultural & Spiritual:** Credential systems (Compostela, nokyocho, Dual Pilgrim), sacred site protocols, cultural practices, associated literature, and interior journey narratives per stage.

### Waypoint Coverage

| Type | Camino | Shikoku | Kumano |
|------|--------|---------|--------|
| Water sources | 786 | 13 | 1 |
| Medical (pharmacy/hospital) | 172 | 214 | 2 |
| Accommodation | 529 | 124 | 1 |
| Food (restaurant/cafe) | 712 | 453 | 17 |
| Transport (bus/train) | 513 | 1,395 | — |
| Supply (convenience/toilet) | 189 | 689 | 6 |
| Sacred sites | 9 | 88 | 18 |
| Towns | 36 | — | 2 |

### Statistics (`stats.json`)

Each route includes historical statistics sourced from official pilgrimage organizations:

- **Camino:** 41-year pilgrim count series (1985-2025) from the Oficina del Peregrino. 530,919 pilgrims in 2025. Demographics, monthly distribution, starting points, route breakdown, mode of travel.
- **Shikoku:** 21-year walking completion series (2005-2025) from the Omotenashi Network. Foreign pilgrim share grew from 0.6% to 33%.
- **Kumano Kodo:** 22-year foreign visitor series (2003-2024) from Tanabe City. Dual Pilgrim program data (14,238 registered from 78 countries).

## Quick Start

### Via jsDelivr CDN

```
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-frances/route.geojson
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-frances/waypoints.geojson
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-frances/stages.json
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-frances/metadata.json
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-frances/stats.json
```

### File Structure

```
routes/{route-id}/
  metadata.json        # Overview, tradition, culture, logistics, provenance
  route.geojson        # GeoJSON FeatureCollection — full-resolution LineString(s)
  stages.json          # Stage-by-stage breakdown with interior journey narratives
  waypoints.geojson    # GeoJSON FeatureCollection — curated + OSM-sourced Points
  stats.json           # Historical statistics with sources
```

### JavaScript

```js
const BASE = 'https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1';

// Route discovery
const index = await fetch(`${BASE}/index.json`).then(r => r.json());

// Full-resolution route on a map
const route = await fetch(`${BASE}/routes/camino-frances/route.geojson`).then(r => r.json());
map.addSource('camino', { type: 'geojson', data: route });

// Find water sources near stage 14
const waypoints = await fetch(`${BASE}/routes/camino-frances/waypoints.geojson`).then(r => r.json());
const water = waypoints.features.filter(f =>
  f.properties.type === 'water_source' && f.properties.stageIndex === 14
);

// Historical pilgrim counts
const stats = await fetch(`${BASE}/routes/camino-frances/stats.json`).then(r => r.json());
const trend = stats.annualPilgrims.trend; // [{year: 1985, count: 690}, ...]
```

### Swift

```swift
let base = "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1"
let url = URL(string: "\(base)/routes/camino-frances/route.geojson")!
let (data, _) = try await URLSession.shared.data(from: url)
let features = try MKGeoJSONDecoder().decode(data)
```

### Python

```python
import json, urllib.request

BASE = "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1"

# Load waypoints and filter by type
url = f"{BASE}/routes/shikoku-88/waypoints.geojson"
wp = json.loads(urllib.request.urlopen(url).read())
temples = [f for f in wp["features"] if f["properties"].get("templeNumber")]
print(f"{len(temples)} temples")  # 88

# Load stats
url = f"{BASE}/routes/camino-frances/stats.json"
stats = json.loads(urllib.request.urlopen(url).read())
for year in stats["annualPilgrims"]["trend"][-5:]:
    print(f"  {year['year']}: {year['count']:,} pilgrims")
```

## Schema

All data files conform to [JSON Schema 2020-12](schema/) definitions. See the [documentation site](https://open.pilgrimag.es/) for the full reference.

### Key Conventions

- **Coordinates:** `[longitude, latitude]` or `[longitude, latitude, altitude]` (GeoJSON standard)
- **Distances:** kilometers
- **Localized strings:** `{ "en": "...", "es": "...", "ja": "..." }` — English always required
- **Route IDs:** kebab-case (`camino-frances`, `shikoku-88`, `kumano-kodo`)
- **Schema version:** SemVer in every file (`"schemaVersion": "1.0.0"`)
- **Versioning:** CDN URLs pin to major version (`@v1`). MINOR adds optional fields. MAJOR = breaking.

### Waypoint Types

15 types covering diverse pilgrimage traditions:

`town` `accommodation` `sacred_site` `water_source` `credential_stamp` `viewpoint` `food` `medical` `transport` `waymarker` `cultural_site` `camping` `pass` `information` `supply`

### Data Sources

Hand-curated waypoints have no `source` field. OSM-sourced waypoints are tagged with `"source": "osm"` and `"osmId": "node/12345678"` for traceability. Every statistic includes its source URL.

## For AI Agents

This dataset is structured for programmatic consumption. If you're an AI agent or LLM building pilgrimage-related features:

- **Route discovery:** Fetch `index.json` for the list of all routes with IDs, distances, and topologies.
- **Route geometry:** Each `route.geojson` is a standard RFC 7946 GeoJSON FeatureCollection with LineString geometry. Coordinates are `[lon, lat]`.
- **Waypoint queries:** Filter `waypoints.geojson` features by `properties.type` (e.g., `water_source`, `medical`, `accommodation`), `properties.stageIndex`, or `properties.kmFromStart`.
- **Stage data:** `stages.json` has `stageCount` and a `stages` array. Each stage has `distanceKm`, `elevationGainMeters`, `elevationLossMeters`, `difficulty`, `start`/`end` coordinates, and optional `interior` (editorial narrative).
- **Statistics:** `stats.json` has `annualPilgrims.trend` (array of `{year, count}`), `demographics`, `seasonalDistribution`, and `sources` with URLs.
- **Schema validation:** JSON Schema 2020-12 definitions are in `schema/`. Use `npm run validate` to check all data.

### OSM-sourced vs curated waypoints

- **Curated** waypoints (no `source` field) are hand-verified sacred sites, towns, and landmarks. Higher quality, fewer quantity.
- **OSM** waypoints (`"source": "osm"`) are automatically enriched from OpenStreetMap within 500m of the route. Higher quantity, OSM quality. Each has an `osmId` for provenance.

## Data Sources & Attribution

Route geometry and infrastructure waypoints sourced from [OpenStreetMap](https://www.openstreetmap.org) via the [Overpass API](https://overpass-api.de/). Statistics from official pilgrimage organizations. Interior journey narratives are editorial content.

**Required attribution:**

> Contains information from [Open Pilgrimages](https://github.com/walktalkmeditate/open-pilgrimages), made available under the [ODbL](https://opendatacommons.org/licenses/odbl/1-0/).
> Route data &copy; [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).

## Development

```bash
git clone https://github.com/walktalkmeditate/open-pilgrimages.git
cd open-pilgrimages
npm install
npm run validate      # Validate all data against schemas
npm run build-index   # Regenerate index.json from route metadata
npm run stats         # Dataset statistics report
npm run pipeline      # Full pipeline: fetch + build-index + validate
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding routes, improving data quality, and contributing interior journey content.

## License

- **Data** (everything under `routes/` and `index.json`): [Open Database License (ODbL) 1.0](LICENSE-DATA)
- **Code** (schemas, scripts, documentation): [MIT](LICENSE)

## Part of the Pilgrim Ecosystem

- [Pilgrim](https://pilgrimapp.org) — A walking companion app for pilgrims (iOS)
- [open.pilgrimag.es](https://open.pilgrimag.es) — Documentation and schema reference
