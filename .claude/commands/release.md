---
name: release
description: Cut a new release of the Open Pilgrimages dataset. Usage: /release <version> (e.g., /release 1.5.0). Or /release patch | minor | major to auto-bump from the current version. Walks through every step of the release checklist — bump, changelog, README stats, validate, tag, push, GitHub release, jsDelivr purge.
---

You are cutting a new release of the Open Pilgrimages dataset. Follow this checklist exactly. Do NOT skip steps.

## Arguments

Parse `$ARGUMENTS` for the version:

- Explicit version: `/release 1.5.0` → use `1.5.0`
- Bump keyword: `/release patch`, `/release minor`, `/release major` → read current version from `package.json` and bump appropriately
- No argument: read current `package.json` version, suggest the next minor bump, and ask the user to confirm

Throughout this command, refer to the chosen version as `$VERSION` (e.g., `1.5.0`) and the tag as `v$VERSION` (e.g., `v1.5.0`).

## Phase 0: Pre-flight checks

Run all of these in parallel and report results:

```bash
git status
git log $(git describe --tags --abbrev=0)..HEAD --oneline
npm run validate
npx tsc --noEmit
```

**Halt the release** and report to the user if any of:
- Working tree is not clean (uncommitted changes other than the release commits we're about to make)
- Validation fails
- TypeScript check fails
- There are zero commits since the last tag (nothing to release)

## Phase 1: Compute new dataset stats

Run this Python script to gather current dataset stats for the README:

```bash
python3 << 'PYEOF'
import json, os
ROUTES = sorted(os.listdir('routes'))
ROUTES = [r for r in ROUTES if os.path.isdir(f'routes/{r}') and os.path.exists(f'routes/{r}/metadata.json')]
totals = {'route_points': 0, 'waypoints': 0, 'stages': 0}
per_route = {}
type_counts_per_route = {}
for r in ROUTES:
    base = f'routes/{r}'
    meta = json.load(open(f'{base}/metadata.json'))
    stages_data = json.load(open(f'{base}/stages.json'))
    route = json.load(open(f'{base}/route.geojson'))
    wp = json.load(open(f'{base}/waypoints.geojson'))
    coord_count = 0
    for f in route['features']:
        g = f['geometry']
        if g['type'] == 'LineString':
            coord_count += len(g['coordinates'])
        elif g['type'] == 'MultiLineString':
            for line in g['coordinates']:
                coord_count += len(line)
    per_route[r] = {
        'name': meta['name']['en'],
        'distance_km': meta['overview']['distanceKm'],
        'topology': meta['overview']['topology'],
        'tradition': meta['tradition']['type'],
        'route_points': coord_count,
        'waypoints': len(wp['features']),
        'stages': len(stages_data['stages']),
    }
    types = {}
    for f in wp['features']:
        t = f['properties']['type']
        types[t] = types.get(t, 0) + 1
    type_counts_per_route[r] = types
    totals['route_points'] += coord_count
    totals['waypoints'] += len(wp['features'])
    totals['stages'] += len(stages_data['stages'])
print(json.dumps({'totals': totals, 'per_route': per_route, 'type_counts': type_counts_per_route, 'route_count': len(ROUTES)}, indent=2))
PYEOF
```

Capture the output. You'll use it in Phase 3 (README updates) and Phase 5 (release notes).

## Phase 2: Bump `package.json`

Update `package.json` to set `"version": "$VERSION"`. Verify with:

```bash
grep '"version"' package.json
```

## Phase 3: Update `README.md` with current stats

The README has hardcoded dataset stats that need to be refreshed every release. Use the Phase 1 numbers to update:

1. **Hero line** (line 5): `"X GPS points. Y waypoints. Z stages. N routes across M traditions."`
2. **"What's In the Box" table**: rows for every route with distance, topology, tradition, route points, waypoints, stats years
3. **Layer 2 description**: "X+ waypoints" — update the rounded number
4. **"Waypoint Coverage" table**: per-type counts per route, columns matching the routes in order

If a new route was added since the last release, add a row to both tables and a column to the type-coverage table. If a route was removed, remove its row/column.

Verify the README changes look reasonable by reading the file after editing.

## Phase 4: Update `CHANGELOG.md`

Read `CHANGELOG.md` to see the existing format. Add a new top-level section for `$VERSION` immediately after the intro paragraph and before the previous release. The new section should:

1. Use the format `## [$VERSION] — YYYY-MM-DD` (today's date in ISO format)
2. Have a one-sentence summary line
3. Have subsections in this order, omitting any that don't apply:
   - `### Added` — new routes, new variants, new fields, new tooling
   - `### Fixed` — bug fixes (group by area: Pipeline / Data alignment / Factual corrections)
   - `### Changed` — semantic changes, refactors that affect data, re-enrichments
   - `### Documentation` — new docs, doc updates
4. Use the commit history from `git log $(git describe --tags --abbrev=0)..HEAD --oneline` to ensure nothing is missed

Also update the link references at the bottom of the file:
```markdown
[$VERSION]: https://github.com/walktalkmeditate/open-pilgrimages/compare/v$PREV_VERSION...v$VERSION
```

## Phase 5: Re-validate after edits

```bash
npm run validate
npx tsc --noEmit
```

Both must pass before proceeding.

## Phase 6: Commit version bump

Stage and commit:

```bash
git add package.json README.md CHANGELOG.md
git commit -m "$(cat <<EOF
chore: bump to $VERSION + update README + CHANGELOG

Refresh README dataset stats and add CHANGELOG.md entry for $VERSION.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Phase 7: Create annotated tag

```bash
git tag -a v$VERSION -m "$(cat <<EOF
v$VERSION — <one-line summary>

<2-3 paragraphs of release highlights, written from the CHANGELOG entry>

See CHANGELOG.md for the complete release notes.
EOF
)" HEAD
```

The summary should match the title you'll use for the GitHub Release in Phase 9.

## Phase 8: Move the `v1` (or current major) moving tag

The repo uses a moving major-version tag (`v1`) that always points to the latest release on the v1.x line. CDN consumers using `https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/...` rely on this tag.

Force-update the moving tag to point at the new release:

```bash
git tag -fa v1 -m "Latest v1 release (currently v$VERSION)" HEAD
```

If the new version is a new major (e.g., 2.0.0), create a new moving tag instead (`v2`) and leave `v1` pinned at the last v1.x release.

## Phase 9: Push everything

```bash
git push origin main
git push origin v$VERSION
git push --force origin v1
```

The `--force` is required for the moving `v1` tag (this is the standard pattern for moving tags and is safe — `v1` is intentionally mutable).

## Phase 10: Create the GitHub Release

Use `gh release create` with `--latest` to mark this as the latest release. Use the CHANGELOG entry as the body, formatted for GitHub Markdown. Include sections for ✨ Added, 🐛 Fixed, 🔄 Changed, 📊 Stats, and 📦 CDN.

```bash
gh release create v$VERSION --repo walktalkmeditate/open-pilgrimages \
  --title "v$VERSION: <Title from CHANGELOG>" \
  --latest \
  --notes "$(cat <<'EOF'
<release body>
EOF
)" \
  --verify-tag
```

The body should end with a CDN section:

```markdown
## 📦 CDN

\`\`\`
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v$VERSION/index.json
\`\`\`

Or pin to \`@v1\` for the latest v1.x release. CDN cache may take ~24h to refresh; you can purge manually via \`https://purge.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/\`.
```

## Phase 11: Verify the release

```bash
gh release list --repo walktalkmeditate/open-pilgrimages | head -3
git tag --points-at HEAD
```

Confirm:
- The new version appears at the top of `gh release list` marked as "Latest"
- Both `v$VERSION` and `v1` tags point at HEAD
- `git status` shows clean working tree

## Phase 12: Optional — update GitHub repo About

The GitHub repo "About" description is meant to be future-proof and should NOT contain hardcoded numbers or specific route names. Verify the current description still applies:

```bash
gh repo view walktalkmeditate/open-pilgrimages --json description --jq .description
```

The current canonical description is:

> Canonical open-source dataset of historical pilgrimage routes worldwide. Full-resolution GPS trails, infrastructure waypoints, stage breakdowns, and historical statistics — structured as GeoJSON + JSON Schema, licensed ODbL.

If the description has drifted, restore it with `gh repo edit walktalkmeditate/open-pilgrimages --description "..."`. Avoid mentioning specific routes or counts.

## Phase 13: Optional — purge jsDelivr cache

If consumers need to see the new data immediately (rather than waiting ~24h for natural cache expiration), purge the jsDelivr cache:

```bash
curl "https://purge.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json"
curl "https://purge.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v$VERSION/index.json"
```

## Phase 14: Report to user

Summarize:
- Version released: `v$VERSION`
- Tag commit hash
- GitHub release URL
- Short summary of what changed (from the CHANGELOG entry)
- Anything that needs follow-up (downstream consumers to notify, jsDelivr purge if not done, etc.)

## Notes

- **Never skip Phase 4 (CHANGELOG)** — this is the canonical record of changes for downstream consumers
- **Never skip Phase 8 (move v1 tag)** — CDN consumers on `@v1` rely on it
- **Never use `--no-verify`** to bypass commit hooks
- **The `git push --force` on v1 is intentional** — it is the only acceptable force-push in this workflow
- **If anything fails partway through**, do not "retry" from the beginning. Diagnose, fix, and resume from the failed phase. Tags can be deleted with `git tag -d v$VERSION && git push origin :refs/tags/v$VERSION` if a tag was created prematurely.
- **The `v1` moving tag may need to be replaced with `v2` etc.** when bumping a major version. The moving tag always tracks the latest release on the current major line.
