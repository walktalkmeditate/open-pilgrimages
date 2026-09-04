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

## Phase 2b: Regenerate the ways packages and the index

`index.json` carries a `release` field naming the tag this build will be
published under, and the Pilgrim app pins every package download to it. That
field is generated from `package.json`'s version, so it is wrong until the
index is regenerated *after* Phase 2's bump:

```bash
npm run build-ways
npm run build-index
grep '"release"' index.json
```

The grep must show `"release": "v$VERSION"`. If it shows the previous version,
Phase 2's bump did not land — fix that before going on.

`npm run build-ways` also rewrites every `routes/*/ways/` directory. Review the
diff: a route gaining or losing a `ways` entry in `index.json`, or flipping
`sparse`, is a change to what the app offers its walkers and belongs in the
CHANGELOG.

**Halt the release** if `npm run build-ways` exits non-zero — that is a schema
failure, not a coverage one, and it means a package on its way to the CDN does
not match the contract the app decodes.

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
git add package.json README.md CHANGELOG.md index.json routes
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

## Phase 8: The `v1` alias is not maintained

Earlier releases force-moved a `v1` tag onto each release commit. That has
stopped, and this phase exists to say so rather than leave the omission
looking like a mistake.

jsDelivr caches a tag URL permanently. `v1` was moved onto the v1.6.0 commit
in August 2026 and `https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json`
still serves the March 2026 index — three routes, 1,725 bytes — while
`@v1.6.0` and `@main` both serve the current seven-route index. A moving tag
whose CDN never moves is a promise this project cannot keep.

So: the Pilgrim app reads the catalog from `@main/index.json`, which jsDelivr
refreshes on its own ~12 h cycle, and pins every package file to the exact
`release` tag that index names.

`@v1` URLs in the README and in the schemas' `$id` fields still resolve — to
the bytes jsDelivr cached. If anyone ever needs one refreshed, the only lever
is a purge:

```bash
curl "https://purge.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json"
```

Do not re-add a `git tag -fa v1` step without also purging every `@v1` path
the site and README reference; a moved tag alone changes nothing a consumer
sees.

## Phase 9: Push everything

```bash
git push origin main
git push origin v$VERSION
```

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
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@main/index.json
\`\`\`

Read the catalog from \`@main\` — jsDelivr refreshes a branch ref on its own
cycle — then pin every file you download to the tag that index's \`release\`
field names:

\`\`\`
https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v$VERSION/routes/camino-frances/ways/route.json
\`\`\`

The \`@v1\` alias is no longer maintained: jsDelivr caches tag URLs
permanently, so it still serves a March 2026 build. Purge manually via
\`https://purge.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/\` if you
depend on it.
```

## Phase 11: Verify the release

```bash
gh release list --repo walktalkmeditate/open-pilgrimages | head -3
git tag --points-at HEAD
```

Confirm:
- The new version appears at the top of `gh release list` marked as "Latest"
- `v$VERSION` points at HEAD
- `git status` shows clean working tree

## Phase 12: Optional — update GitHub repo About

The GitHub repo "About" description is meant to be future-proof and should NOT contain hardcoded numbers or specific route names. Verify the current description still applies:

```bash
gh repo view walktalkmeditate/open-pilgrimages --json description --jq .description
```

The current canonical description is:

> Canonical open-source dataset of historical pilgrimage routes worldwide. Full-resolution GPS trails, infrastructure waypoints, stage breakdowns, and historical statistics — structured as GeoJSON + JSON Schema, licensed ODbL.

If the description has drifted, restore it with `gh repo edit walktalkmeditate/open-pilgrimages --description "..."`. Avoid mentioning specific routes or counts.

## Phase 13: Purge jsDelivr cache

No longer optional: Phase 14 depends on it. jsDelivr caches by ref, and `@main`
is the ref the catalog is read from, so until it is purged Phase 14 can fail on
`@main` URLs that are actually fine — just still serving the previous release
out of cache.

```bash
curl "https://purge.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@main/index.json"
curl "https://purge.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v$VERSION/index.json"
```

This purges `index.json` at both refs, which is normally enough to make
jsDelivr re-resolve `@main` to the new commit for every other path too. If
Phase 14 still reports a stale-looking failure on some other URL afterward,
purge that specific URL the same way (swap `cdn.jsdelivr.net` for
`purge.jsdelivr.net`, keep the path) and re-run it.

## Phase 14: Verify every CDN link resolves

**Do not skip this phase, and do not mark the release done until it's green.** This is the check that would have caught the v1.5.0 GPX regression: seven detail pages linked `route.gpx` at `@v1` while `v1` still pointed at the release before GPX generation existed, and every one of those links 404'd in production. Nothing before this phase ever actually fetches a CDN URL — Phase 5's `npm run validate` and check-site's own CI guard both work entirely offline, by design (see check-cdn.ts's own doc comment for why that split exists) — so this is the only point in the whole release where a link is confirmed to resolve, not just to look plausible.

```bash
npm run check-cdn
```

Every URL must report `ok`. If any fail:
- **Triage how the failure is reported first.** `check-cdn`'s output distinguishes an HTTP response from a thrown error: `FAIL <url> — HTTP <status>` means jsDelivr itself answered with a non-200 — a real broken link. `FAIL <url> — <message>` (e.g. `The operation was aborted`, a connection reset, a DNS failure) means the request never got a response at all — a client-side or network failure, not evidence the link is broken. Re-run `npm run check-cdn` before treating the latter as a real failure; only an `HTTP <status>` failure that survives a re-run is the bug this phase exists to catch.
- Confirm the tag actually landed: `git tag --points-at HEAD` should list
  `v$VERSION`. If it doesn't, Phase 7/9 didn't complete — fix that first.
  There is no moving tag to check any more; see Phase 8.
- Re-run the Phase 13 purge (jsDelivr's cache can take a short time to catch up even after a purge request is accepted) and re-run `npm run check-cdn`.
- If a URL fails and its path is new in this release (added in the commits since the last tag), that's the exact bug this phase exists to catch — do not report the release as done until it resolves.
- **Ways URLs 404 until Phase 9 pushes the tag.** `routes/<route-id>/ways/*` is
  new in a release, so `@v$VERSION` cannot serve it until the tag exists, and
  `@main` cannot until the push lands. That is why `npm run check-cdn` runs at
  Phase 14 and not before; a ways-path failure here, after the purge, is a real
  one.

## Phase 15: Report to user

Summarize:
- Version released: `v$VERSION`
- Tag commit hash
- GitHub release URL
- Short summary of what changed (from the CHANGELOG entry)
- Confirmation that Phase 14's `npm run check-cdn` came back all-green
- Anything that needs follow-up (downstream consumers to notify, etc.)

## Notes

- **Never skip Phase 4 (CHANGELOG)** — this is the canonical record of changes for downstream consumers
- **Never skip Phase 2b** — `index.json`'s `release` field is what the Pilgrim
  app pins its package downloads to. A stale one points every download at the
  previous release, and because that tag also resolves, nothing 404s to tell
  you. `scripts/build-index.test.ts` guards it in CI; do not "fix" a failure
  there by editing `index.json` by hand.
- **Do not re-introduce the moving `v1` tag** — see Phase 8. jsDelivr's tag
  cache made it a promise this project could not keep, and the app reads
  `@main` instead.
- **Never skip Phase 13 (purge) or Phase 14 (`npm run check-cdn`)** — this is the pair that would have caught the v1.5.0 GPX-link regression (every CDN link the site references 404ing because `v1` hadn't advanced yet); a release isn't done until Phase 14 is green
- **`check-cdn` is deliberately not part of CI** (`.github/workflows/validate.yml` never runs it) — CI stays offline and deterministic, so this phase is the only place it runs
- **Never use `--no-verify`** to bypass commit hooks
- **If anything fails partway through**, do not "retry" from the beginning. Diagnose, fix, and resume from the failed phase. Tags can be deleted with `git tag -d v$VERSION && git push origin :refs/tags/v$VERSION` if a tag was created prematurely.
