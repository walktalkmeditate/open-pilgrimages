---
name: enrich
description: Enrich a pilgrimage route with full-resolution OSM geometry, infrastructure waypoints, and statistics. Usage: /enrich <route-id> [--skip-geometry] [--skip-waypoints] [--skip-stats] [--only-geometry] [--only-waypoints] [--only-stats]
---

You are enriching pilgrimage route data for the Open Pilgrimages dataset.

## Arguments

The first argument is a route ID (e.g., `camino-frances`, `shikoku-88`, `kumano-kodo`).
Optional flags: `--skip-geometry`, `--skip-waypoints`, `--skip-stats`, `--only-geometry`, `--only-waypoints`, `--only-stats`.

Parse the arguments from `$ARGUMENTS`.

## Phase 1: Audit

Run the audit script and report the results:
```bash
npx tsx scripts/enrich/audit.ts {routeId}
```

Show the output to the user and summarize the gaps.

## Phase 2: Geometry (skip if `--skip-geometry` or `--only-waypoints` or `--only-stats`)

Fetch full-resolution route geometry from OSM:
```bash
npx tsx scripts/enrich/geometry.ts {routeId}
```

Report the before/after point counts.

## Phase 3: Waypoints (skip if `--skip-waypoints` or `--only-geometry` or `--only-stats`)

Fetch and merge OSM infrastructure waypoints:
```bash
npx tsx scripts/enrich/waypoints.ts {routeId}
```

Report what was added by type, what was skipped, and the new total.

## Phase 4: Stats (skip if `--skip-stats` or `--only-geometry` or `--only-waypoints`)

Research current pilgrimage statistics for this route. Use WebSearch and WebFetch to find the latest data from official sources.

**For each route, look for:**
- Annual pilgrim/visitor counts (latest year + historical trend)
- Demographics (top nationalities, gender split, age groups)
- Seasonal distribution (monthly breakdown if available)
- Mode of travel (foot, bicycle, bus, etc.)
- Starting points (where pilgrims begin)
- Motivation (religious, spiritual, cultural)

**Data sources:**
- Camino Frances: Oficina del Peregrino (oficinadelperegrino.com/en/statistics/)
- Shikoku 88: Maeyama Ohenro Salon, prefecture tourism bureaus, shikoku-tourism.com
- Kumano Kodo: Tanabe City Kumano Tourism Bureau (tb-kumano.jp), Wakayama Prefecture tourism stats

Write the results to `routes/{routeId}/stats.json` using this structure:
```json
{
  "schemaVersion": "1.0.0",
  "routeId": "{routeId}",
  "lastUpdated": "{today's date}",
  "dataYear": {latest year with data},
  "annualPilgrims": { "latest": { "year": N, "count": N }, "trend": [...], "source": "url" },
  "demographics": { ... },
  "seasonalDistribution": [...],
  "modeOfTravel": [...],
  "startingPoints": [...],
  "sources": [{ "name": "...", "url": "...", "accessDate": "..." }]
}
```

Fields are nullable — include only what you can verify from official sources.
Every data point must include its source URL.

## Phase 5: Validate

Run validation:
```bash
npm run validate
```

If validation passes, summarize all changes and ask the user if they want to commit.
If validation fails, report the errors and do not commit.
