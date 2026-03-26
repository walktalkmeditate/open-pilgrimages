# Open Pilgrimages

A canonical, open-source dataset of pilgrimage routes worldwide.

Route geometry, stage breakdowns, waypoints, logistics, cultural context, and interior journey narratives — structured as JSON and GeoJSON for developers, researchers, and pilgrimage organizations to build upon.

## Why This Exists

There is no comprehensive, structured, open dataset of pilgrimage routes. Trail databases capture geometry and elevation but miss what makes a pilgrimage a *pilgrimage* — the credential systems, sacred sites, cultural practices, seasonal ceremonies, and the interior transformation that unfolds over weeks of walking.

Open Pilgrimages captures three layers of data:

1. **Geometry** — Route paths and waypoints as standard GeoJSON
2. **Logistics** — Stages, accommodation, water sources, services, seasonal availability
3. **Cultural & Spiritual** — Traditions, credential systems, associated literature, sacred site protocols, and interior journey narratives per stage

## Routes

| Route | Region | Distance | Topology | Tradition |
|-------|--------|----------|----------|-----------|
| [Camino Frances](routes/camino-frances/) | Spain | 790 km | Linear | Christian |
| [Shikoku 88](routes/shikoku-88/) | Japan | 1,200 km | Circular | Buddhist |
| [Kumano Kodo](routes/kumano-kodo/) | Japan | 70-160 km | Network | Shinto/Buddhist |

## Using the Data

### Via jsDelivr CDN

Pin to a major version for stability:

```
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-frances/route.geojson
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-frances/stages.json
```

### File Structure Per Route

```
routes/{route-id}/
  metadata.json        # Overview, tradition, culture, logistics
  route.geojson        # GeoJSON FeatureCollection (LineString)
  stages.json          # Stage-by-stage breakdown
  waypoints.geojson    # GeoJSON FeatureCollection (Points)
```

### JavaScript

```js
const res = await fetch(
  'https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-frances/route.geojson'
);
const route = await res.json();
// Standard GeoJSON — use with Mapbox GL JS, Leaflet, deck.gl, etc.
map.addSource('camino', { type: 'geojson', data: route });
```

### Swift

```swift
let url = URL(string: "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-frances/route.geojson")!
let (data, _) = try await URLSession.shared.data(from: url)
let features = try MKGeoJSONDecoder().decode(data)
```

### Python

```python
import json, urllib.request

url = "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-frances/stages.json"
stages = json.loads(urllib.request.urlopen(url).read())
for stage in stages["stages"]:
    print(f"Stage {stage['index']}: {stage['name']['en']} — {stage['distanceKm']} km")
```

## Schema

All data files conform to JSON Schema definitions in the [`schema/`](schema/) directory. See the [documentation site](https://walktalkmeditate.github.io/open-pilgrimages/) for full schema reference and usage guide.

- `schemaVersion` field in every file tracks the data format version (SemVer)
- MAJOR version = breaking changes, MINOR = new optional fields, PATCH = content fixes
- CDN URLs pin to major version (`@v1`) for stability

## Data Sources & Attribution

Route geometry is sourced from [OpenStreetMap](https://www.openstreetmap.org) via the [Overpass API](https://overpass-api.de/). Additional data comes from official pilgrimage organizations and published sources.

**Required attribution when using this data:**

> Contains information from [Open Pilgrimages](https://github.com/walktalkmeditate/open-pilgrimages), made available under the [ODbL](https://opendatacommons.org/licenses/odbl/1-0/).
> Route data &copy; [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).

Interior journey narratives are editorial content by the project maintainers, clearly marked as such within the data.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding routes, improving data quality, and submitting corrections.

## License

- **Data** (everything under `routes/` and `index.json`): [Open Database License (ODbL) 1.0](LICENSE-DATA)
- **Code** (schemas, scripts, documentation): [MIT](LICENSE)

## Part of the Pilgrim Ecosystem

Open Pilgrimages provides the data layer for:

- [Pilgrim](https://pilgrimapp.org) — A walking companion app for pilgrims (iOS)
- [pilgrimag.es](https://pilgrimag.es) — Route guides, cultural context, and pilgrimage planning (coming soon)
