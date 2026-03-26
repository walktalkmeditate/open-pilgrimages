# Schema Changelog

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
16 types: town, accommodation, sacred_site, water_source, credential_stamp, viewpoint, food, medical, transport, waymarker, cultural_site, camping, pass, information, supply
