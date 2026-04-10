# Open Pilgrimages

A canonical, open-source dataset of pilgrimage routes worldwide.

159,624 GPS points. 12,576 waypoints. 109 stages. 7 routes across 3 traditions. All structured as JSON and GeoJSON.

## What's In the Box

| Route | Distance | Topology | Tradition | Route Points | Waypoints | Stats |
|-------|----------|----------|-----------|-------------|-----------|-------|
| [Camino Frances](routes/camino-frances/) | 764 km | Linear | Christian | 33,192 | 2,957 | 41 years (1985-2025) |
| [Camino del Norte](routes/camino-norte/) | 784 km | Linear | Christian | 38,640 | 3,634 | 23 years (2003-2025) |
| [Camino Primitivo](routes/camino-primitivo/) | 263 km | Linear | Christian | 13,303 | 732 | 23 years (2003-2025) |
| [Camino Portugués (Central)](routes/camino-portugues/) | 243 km | Linear | Christian | 13,722 | 1,634 | 23 years (2003-2025) |
| [Camino Portugués da Costa (Coastal)](routes/camino-portugues/variants/coastal/) | 110 km | Linear | Christian | 5,546 | 1,043 | 23 years (2003-2025) |
| [Camino Inglés](routes/camino-ingles/) | 112 km | Linear | Christian | 4,823 | 482 | 23 years (2003-2025) |
| [Shikoku 88](routes/shikoku-88/) | 1,200 km | Circular | Buddhist | 49,097 | 2,980 | 21 years (2005-2025) |
| [Kumano Kodo](routes/kumano-kodo/) | 39-170 km | Network | Shinto/Buddhist | 6,847 | 157 | 22 years (2003-2024) |

The Camino Portugués da Costa entry above covers the Portuguese section (Porto → Caminha ferry → A Guarda); the Spanish continuation through Oia/Baiona/Vigo/Redondela is planned for a future release. The Camino Inglés also ships an A Coruña start variant stub, and the Camino Portugués ships Espiritual and Lisboa variant stubs — each with metadata only, full geometry/stages planned for future releases.

### Three Layers of Data

**Layer 1 — Geometry:** Full-resolution GPS trails from OpenStreetMap. Not simplified stage endpoints — actual trail paths with 4k-49k coordinate points per route.

**Layer 2 — Logistics:** 12,500+ waypoints including water sources, pharmacies, hospitals, accommodation, restaurants, convenience stores, bus stops, and train stations. Each tagged with `stageIndex` and `kmFromStart` for route-aware queries.

**Layer 3 — Cultural & Spiritual:** Credential systems (Compostela, nokyocho, Dual Pilgrim), sacred site protocols, cultural practices, associated literature, and interior journey narratives per stage.

### Waypoint Coverage

| Type | Frances | Norte | Primitivo | Portugués | Coastal | Inglés | Shikoku | Kumano |
|------|---------|-------|-----------|-----------|---------|--------|---------|--------|
| Water sources | 788 | 863 | 96 | 177 | 52 | 85 | 13 | 1 |
| Medical (pharmacy/hospital) | 172 | 279 | 63 | 112 | 50 | 44 | 214 | 1 |
| Accommodation | 532 | 301 | 75 | 180 | 92 | 39 | 124 | 31 |
| Food (restaurant/cafe) | 713 | 997 | 265 | 600 | 425 | 152 | 456 | 13 |
| Transport (bus/train) | 511 | 900 | 180 | 431 | 302 | 136 | 1,395 | 39 |
| Supply (convenience/toilet) | 189 | 294 | 53 | 134 | 122 | 26 | 690 | 52 |
| Sacred sites | 9 | — | — | — | — | — | 88 | 18 |
| Towns | 36 | — | — | — | — | — | — | 2 |

### Statistics (`stats.json`)

Each route includes historical statistics sourced from official pilgrimage organizations. See [docs/data-sources.md](docs/data-sources.md) for the canonical source per route and how to refresh annually.

- **Camino Frances:** 41-year pilgrim count series (1985-2025) from the Oficina del Peregrino via Solvitur Ambulando JSON API. 242,179 pilgrims walked the Frances route in 2025 (45.6% of 531,000 total Compostelas). Per-route 2024 demographics (Spain 51.31%, USA 8.34%, Italy 5.44%, etc.).
- **Camino Portugués (Central):** 23-year pilgrim count series (2003-2025) from Solvitur Ambulando. 100,839 pilgrims in 2025 (19.0% of all Compostelas) — the second most-walked Camino.
- **Camino Portugués da Costa (Coastal):** 23-year series. 89,511 pilgrims in 2025 (16.9%) — the fastest-growing major Camino, jumping from 2,600 in 2016 to nearly 90,000 in 2025. Strongest female majority of any major Camino (61.3%).
- **Camino Inglés:** 23-year series. 30,204 pilgrims in 2025 (5.7%) — the shortest major Camino at ~112 km from Ferrol. Historic maritime arrival route for English, Irish, Scandinavian, and Flemish pilgrims.
- **Camino Primitivo:** 23-year series. 27,871 pilgrims in 2025 (5.2%) — the oldest Camino, walked by Alfonso II of Asturias in 814 CE. Most physically demanding with Puerto del Palo at 1,146 m.
- **Camino del Norte:** 23-year series. 21,521 pilgrims in 2025 (4.1%) — the longest non-Frances Camino at ~784 km, along the Bay of Biscay from Irún through the Basque Country, Cantabria, Asturias, and Galicia.
- **Shikoku 88:** 21-year walking completion series (2005-2025) from the Omotenashi Network. Foreign pilgrim share grew from 0.6% to 33%.
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
