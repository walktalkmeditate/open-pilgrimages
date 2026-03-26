# Contributing to Open Pilgrimages

Thank you for helping build the world's open pilgrimage dataset.

## Ways to Contribute

### Report Data Issues

Found an incorrect coordinate, a closed albergue listed as open, or a missing waypoint? [Open an issue](https://github.com/momentmaker/open-pilgrimages/issues/new) with:

- The route and stage affected
- What's wrong
- What the correct data should be (with source if possible)

### Improve Existing Routes

Submit a pull request with corrections to any data file. Please:

1. Run `npm run validate` before submitting to ensure your changes conform to the schema
2. Include your data source in the PR description
3. Keep changes focused — one route or one type of correction per PR

### Add a New Route

Adding a new pilgrimage route is a larger undertaking. Before starting:

1. [Open an issue](https://github.com/momentmaker/open-pilgrimages/issues/new) proposing the route
2. Include: route name, region, approximate distance, topology (linear/circular/network), tradition, and available data sources
3. Wait for approval before investing significant effort

Once approved, create the standard four-file structure under `routes/{route-id}/`:

```
routes/{route-id}/
  metadata.json
  route.geojson
  stages.json
  waypoints.geojson
```

All files must validate against the schemas in `schema/`.

### Interior Journey Content

The interior journey layer (stage themes, narratives, common experiences, reflection prompts) is editorial content. If you've walked a pilgrimage and want to contribute to this layer:

1. Your contributions should be grounded in direct experience or published accounts
2. Be respectful of the traditions and cultures involved
3. Note that interior journey content is clearly marked as editorial, distinct from factual data

## Data Quality Standards

- **Coordinates**: GeoJSON standard `[longitude, latitude, altitude]`. Altitude in meters.
- **Distances**: Kilometers, measured along the route path (not straight-line).
- **Localization**: All human-readable strings use the `LocalizedString` pattern: `{ "en": "...", "ja": "..." }`. English (`en`) is always required.
- **Sources**: Every data contribution should be traceable. Include source URLs, access dates, and license information in the `provenance` section.

## Development Setup

```bash
git clone https://github.com/momentmaker/open-pilgrimages.git
cd open-pilgrimages
npm install
npm run validate    # Validate all data against schemas
npm run pipeline    # Fetch and rebuild route data from sources
```

> **Note:** The tooling pipeline is under development. Until it ships, you can validate JSON files manually against the schemas in `schema/` using any JSON Schema validator.

## Code of Conduct

This project exists to serve pilgrims and the pilgrimage community worldwide. We welcome contributions from all traditions and backgrounds. Be respectful of sacred sites, cultural practices, and the diverse motivations people bring to pilgrimage.
