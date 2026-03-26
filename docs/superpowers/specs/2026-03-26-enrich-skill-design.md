# `/enrich` Skill Design

A Claude Code slash command that enriches a pilgrimage route with full-resolution geometry, infrastructure waypoints from OpenStreetMap, and statistics from official sources.

## Invocation

```
/enrich camino-frances              # full enrichment (all phases)
/enrich shikoku-88 --skip-stats     # skip stats phase
/enrich kumano-kodo --only-waypoints  # just waypoint enrichment
```

Argument is a route ID matching a directory under `routes/`. Flags: `--skip-geometry`, `--skip-waypoints`, `--skip-stats`, `--only-geometry`, `--only-waypoints`, `--only-stats`.

## Phases

The skill runs 5 phases in sequence. Each phase reports what it found and what it will do before writing.

### Phase 1: Audit

Read current route data and report:
- Waypoint count by type
- Whether route geometry is simplified or full-resolution
- Whether stats.json exists
- OSM relation IDs available for this route (from route config)
- Gaps: which waypoint types have zero entries

No writes. Status report only.

### Phase 2: Geometry

Fetch full-resolution route geometry from OSM Overpass API.

**Source data:**
- Camino Frances: OSM superroute 2163573 (6 child relations, ~35k coordinate points)
- Shikoku 88: 88 segment relations tagged `四国遍路` (~1,200 km circuit)
- Kumano Kodo: 7 relations tagged `熊野古道` (Nakahechi + sub-routes)

**Processing:**
1. Fetch via Overpass API with `out geom` to get inline coordinates
2. Extract way geometries from each relation member
3. Concatenate ways in order to form continuous LineString(s)
4. Coordinates as `[longitude, latitude]` per GeoJSON spec
5. For network routes (Kumano Kodo), produce multiple LineString features with `segment` property

**Output:** Replace `route.geojson` with full-resolution geometry. Preserve existing `properties` fields. Update `source` with fetch date.

**Report:** "Upgraded from 34 points to 35,247 points"

### Phase 3: Waypoints

Fetch infrastructure POIs from OSM Overpass, filter to route corridor, and merge with existing data.

**OSM tag to waypoint type mapping:**

| OSM Tag | Waypoint Type | Subtype |
|---------|--------------|---------|
| `amenity=drinking_water` | water_source | fountain |
| `amenity=pharmacy` | medical | pharmacy |
| `amenity=hospital` | medical | hospital |
| `amenity=clinic` | medical | clinic |
| `tourism=hostel` | accommodation | hostel |
| `tourism=guest_house` | accommodation | guesthouse |
| `tourism=hotel` | accommodation | hotel |
| `amenity=restaurant` | food | restaurant |
| `amenity=cafe` | food | cafe |
| `shop=convenience` | supply | convenience_store |
| `amenity=toilets` | supply | toilet |
| `amenity=vending_machine` | supply | vending_machine |
| `highway=bus_stop` | transport | bus_stop |
| `railway=station` | transport | train_station |
| `railway=halt` | transport | train_station |

**Filtering:**
- Fetch POIs within the route's bounding box from OSM
- Filter to within 500m of the actual route geometry (point-to-line distance)
- If full-resolution geometry is not yet available, use the simplified route.geojson with a wider 1km buffer
- The 500m buffer captures trailside resources while filtering urban noise

**Enrichment:**
- Assign `stageIndex` by finding the nearest stage segment
- Calculate `kmFromStart` by projecting the POI onto the route line
- Extract `name` from OSM `name` tag (fall back to `name:en`, `name:ja`, etc.)
- Extract `elevation` from OSM `ele` tag if present
- Set `"source": "osm"` and `"osmId": "node/12345678"` for traceability

**Merge rules:**
- Never delete or overwrite existing hand-curated waypoints (those without `source: "osm"`)
- Deduplicate: skip any OSM POI within 50m of an existing waypoint
- On re-run: update existing OSM-sourced waypoints (matched by `osmId`), add new ones, remove ones no longer in OSM
- Sort final waypoints by `kmFromStart`

**ID generation:** `wp-osm-{type}-{osmId}` (e.g., `wp-osm-water-node12345678`)

**Report:** "Added 247 waypoints (83 water, 42 medical, 31 accommodation, 28 food, 22 supply, 19 transport). Skipped 14 duplicates within 50m of existing waypoints."

### Phase 4: Stats

Research current pilgrimage statistics from official sources.

**Data sources by route:**

| Route | Primary Source | Update Frequency |
|-------|---------------|------------------|
| Camino Frances | Oficina del Peregrino (oficinadelperegrino.com) | Annual (January) |
| Shikoku 88 | Maeyama Ohenro Salon, prefecture tourism data | Irregular |
| Kumano Kodo | Tanabe City Kumano Tourism Bureau, Wakayama Prefecture | Annual |

**Stats schema (`stats.json`):**

```json
{
  "schemaVersion": "1.0.0",
  "routeId": "camino-frances",
  "lastUpdated": "2026-03-26",
  "dataYear": 2025,
  "annualPilgrims": {
    "latest": { "year": 2025, "count": 530987 },
    "trend": [
      { "year": 2015, "count": 262444 },
      { "year": 2019, "count": 347578 },
      { "year": 2020, "count": 54144 },
      { "year": 2022, "count": 438323 },
      { "year": 2023, "count": 446039 },
      { "year": 2024, "count": 499241 },
      { "year": 2025, "count": 530987 }
    ],
    "source": "https://oficinadelperegrino.com/en/statistics/"
  },
  "demographics": {
    "topNationalities": [
      { "country": "ES", "name": "Spain", "count": 228527, "percentage": 43.0 },
      { "country": "US", "name": "USA", "count": 43980, "percentage": 8.3 }
    ],
    "genderSplit": { "female": 0.53, "male": 0.47 },
    "source": "https://oficinadelperegrino.com/en/statistics/"
  },
  "seasonalDistribution": [
    { "month": 1, "percentage": 0.5 },
    { "month": 4, "percentage": 9.1 },
    { "month": 9, "percentage": 14.5 }
  ],
  "modeOfTravel": [
    { "mode": "foot", "percentage": 93.8 },
    { "mode": "bicycle", "percentage": 4.0 }
  ],
  "startingPoints": [
    { "name": "Sarria", "count": 162040, "percentage": 32 },
    { "name": "Saint-Jean-Pied-de-Port", "count": 54115, "percentage": 10.2 }
  ],
  "routeBreakdown": [
    { "route": "Frances", "percentage": 45.5 },
    { "route": "Portugues Central", "percentage": 19.0 }
  ],
  "sources": [
    { "name": "Oficina del Peregrino", "url": "https://oficinadelperegrino.com/en/statistics/", "accessDate": "2026-03-26" }
  ]
}
```

Fields are nullable. Shikoku and Kumano Kodo will have sparser stats than the Camino due to limited data availability.

**Report:** "Wrote stats.json with 2025 data (7 sources cited)"

### Phase 5: Validate

- Run `npm run validate`
- If errors, report them and do not offer to commit
- If clean, report summary and offer to commit all changes

## Key Principles

- **Non-destructive**: Hand-curated waypoints are never deleted. OSM data merges alongside, marked with `source: "osm"`.
- **Traceable**: Every OSM-sourced waypoint has `source` and `osmId`. Every stat has a `source` URL.
- **Idempotent**: Running `/enrich` twice produces the same result. OSM waypoints matched by `osmId` for updates.
- **Transparent**: Each phase reports what it found and what it will do before writing files.

## File Changes

Per route, the skill may create or modify:
- `route.geojson` — replaced with full-resolution geometry (Phase 2)
- `waypoints.geojson` — existing waypoints preserved, OSM waypoints merged (Phase 3)
- `stats.json` — created or updated (Phase 4)

## Route Configuration

The skill needs to know, per route:
- OSM relation IDs for geometry
- Bounding box for POI queries
- Stage endpoints for stageIndex assignment

This data already exists in `metadata.json` (bbox) and `stages.json` (stage endpoints). The OSM relation IDs are currently hardcoded in `fetch-osm.ts` and should be added to `metadata.json` under a new `osm` field:

```json
"osm": {
  "relations": [2163569, 2163558, 2163560, 2163561, 2163565, 2163559],
  "superroute": 2163573
}
```

## Dependencies

- Overpass API (free, no auth, rate limited to 2 concurrent)
- Open Elevation API (free, no auth) — optional, for altitude enrichment
- WebSearch/WebFetch — for stats research
- `npm run validate` — for final verification
