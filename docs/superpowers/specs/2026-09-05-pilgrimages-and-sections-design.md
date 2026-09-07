# Pilgrimages and sections: completing Norte, Kumano, and Shikoku

**Status:** approved design, 2026-09-05
**Branch:** `feat/pilgrimages` (stacked on `feat/ways-build`, PR #6; rebase onto `main` once #6 merges)
**Depends on:** the ways build (PR #6) and its issue #7

## 1. Why

Only the Camino Francés passes the ways gate today. Camino del Norte, Kumano Kodō, and Shikoku 88 are cut from their raw `route.geojson` (variants and spurs folded in), their anchors have never been checked against OpenStreetMap, and Shikoku's ten stages do not chain at all. Issue #7 (out-of-order anchor snaps silently min/max-ed) is a symptom of exactly those routes.

A pilgrim also does not think in routes. They walk *the Kumano Kodō*, on *the Nakahechi*, on *day three*. The dataset should say the same: a pilgrimage is made of sections, a section is made of stages, a stage is one Way.

## 2. The model

| Level | What it is | Where it lives |
|---|---|---|
| Pilgrimage | A grouping with an id and a name, whose sections carry a walking order (`legs`) or a listing order (`alternatives`) | `index.json` `pilgrimages[]`, declared by each section's `metadata.json` |
| Section | A route directory: line, stages, waypoints, ways package | `routes/<section-id>/` |
| Stage | One day, one Way, cut from the section's walked line | `routes/<section-id>/ways/stage-NN.json` |

A pilgrimage is index-level only; it has no directory. Every route directory is a section. Pilgrimage ids and section ids share the docs site's flat page namespace — `open.pilgrimag.es/<id>` — and `check-site` enforces that no id is claimed twice.

### 2.1 Ids and directories

| Pilgrimage id | Name | Sections, in order |
|---|---|---|
| `camino-de-santiago` | Camino de Santiago | `camino-frances`, `camino-norte`, `camino-primitivo`, `camino-ingles`, `camino-portugues` (existing; tag only, unordered — they are alternatives, not legs) |
| `kumano-kodo` | Kumano Kodō | `kumano-kodo-nakahechi` (renamed from `kumano-kodo`), `kumano-kodo-kohechi`, `kumano-kodo-iseji`, `kumano-kodo-ohechi` (new) |
| `shikoku-88` | Shikoku 88 Temple Pilgrimage | `shikoku-88-awa` (temples 1–23), `shikoku-88-tosa` (24–39), `shikoku-88-iyo` (40–65), `shikoku-88-sanuki` (66–88) — the four dōjō; replaces `routes/shikoku-88` |

A pilgrimage declares its `kind`: `legs` when the sections are walked one after another (Shikoku), or `alternatives` when each section is its own way to the same end (the Caminos to Santiago; the Kumano routes to the Kumano Sanzan shrines). Only `legs` sections must chain (§4.2); `order` is walking order for `legs` and listing order for `alternatives`.

PR A adds the `pilgrimage` block to all five Camino sections' `metadata.json` — `camino-frances`, `camino-norte`, `camino-primitivo`, `camino-ingles`, `camino-portugues` — and regenerates `index.json`; nothing else about those five changes there.

Renames are safe now: no package has shipped for `kumano-kodo` or `shikoku-88` (`ways: null` in `index.json` since 1.7.0), and the app has never listed them. The docs site's route table groups sections under their pilgrimage. `CHANGELOG.md` records both renames under "Renamed". The `kumano-kodo/variants/{kohechi,iseji}` metadata stubs are deleted and their rows leave `docs/routes.html`'s Variants table, since both become sections with pages of their own; the Portugués `variants/coastal` package and the Inglés/Portugués stubs are out of scope and stay nested as they are.

The old ids are also written into places no check reads, and each moves with the rename: the README's Python quickstart (`routes/shikoku-88/waypoints.geojson`) and its route-ID convention line, `package.json`'s `kumano-kodo` keyword, the two `stats.json` paths in `docs/data-sources.md`, `CLAUDE.md`'s route-ID line, and `.claude/commands/enrich.md`'s example ids.

### 2.2 `metadata.json`

Each section gains:

```json
"pilgrimage": { "id": "kumano-kodo", "name": { "en": "Kumano Kodō", "ja": "熊野古道" }, "kind": "alternatives", "order": 1 },
"osm": { "relations": [17131166] }
```

`pilgrimage.order` is the section's position in the pilgrimage's walking order (`legs`) or listing order (`alternatives`). Every section of one pilgrimage repeats the same `kind` and `name`; `validate` rejects sections that declare conflicting values for either, so the pilgrimage entry `build-index` derives has one unambiguous source (§2.3). `osm.relations` becomes required for any section that has a `ways/` package; `osm.query` alone is no longer enough to build a walked line (§4.3). `parentRouteId` stays for the coastal variant only.

### 2.3 `index.json`

Additive. `routes[]` and each route's `ways` block are unchanged, so the iOS catalog parser from pilgrim-ios PR #84 keeps working. New:

```json
"pilgrimages": [
  { "id": "shikoku-88", "name": {"en": "…", "ja": "…"}, "kind": "legs",
    "sections": ["shikoku-88-awa", "shikoku-88-tosa", "shikoku-88-iyo", "shikoku-88-sanuki"],
    "distanceKm": 1142.3, "stageCount": 45 }
],
"routes": [ { "id": "shikoku-88-awa", "pilgrimage": "shikoku-88", … } ]
```

`build-index` derives `pilgrimages[]` from the sections' metadata (ordered by `pilgrimage.order`), and `check-site` verifies every section's pilgrimage exists and every pilgrimage has at least one section. `distanceKm` and `stageCount` are sums over the sections and are emitted only when `kind` is `legs`; for `alternatives` they are omitted, since a walker walks one section and a total across the alternatives describes no walk anyone takes. `schema/index.schema.json` gains `pilgrimages` and the per-route `pilgrimage` string.

## 3. What the app needs

Nothing for these releases. Each section is a route the catalog from pilgrim-ios PR #84 already lists and downloads. The pilgrimage-level catalog card, whole-pilgrimage download (all sections' packages, one transaction), section list above the stage list, and pilgrimage-level Replace/Update/Remove are the next iOS slice; `pilgrimages[]` is the shape it will read. Ledgers stay per section.

The dataset lands before its consumer deliberately. The sections have to exist and be correct before any app surface can group them, and settling the index shape now means the content PRs are cut once rather than re-cut around a shape the iOS slice discovers later. No release is dead weight in the meantime: every section is individually walkable in today's catalog the day it ships.

Whole-pilgrimage download reverses a standing principle — the app's own design doc calls one route at a time "a philosophical choice and a technical safeguard (tile pack budget)" — so it goes through the same design process before the next slice commits to it. For `alternatives` pilgrimages the section stays the unit of download regardless: a walker picks one Camino, not five.

## 4. Pipeline changes (landed first, PR A)

### 4.1 Issue #7: boundaries advance or fail

`stageBoundaries` in `scripts/build-ways.ts` searches for anchor i+1 only forward of boundary i. When a boundary does not advance (`index <= previous`), the route's gate fails with a reason naming both anchors, in the style of the chain-break reason. An empty slice is a gate failure, never a cut; `routePoints` is never reached with an empty slice. Tests: a reversed pair; a line that passes near an anchor twice; the Camino builds byte-identically.

### 4.2 Sections chain

`validate` checks, for each `legs` pilgrimage, that section N's last stage `end` is within `SNAP_METERS` of section N+1's first stage `start`, naming both sections on failure. For a circular `legs` pilgrimage the last section's final stage `end` must close the same way against the first section's first stage `start`, or the circuit the route claims is never walked. A boundary stage therefore ends and starts at the boundary place itself, never at a nearby lodging town (§5.3). `alternatives` pilgrimages are exempt.

A circuit is claimed by the pilgrimage, with an optional `"circular": true` in the `pilgrimage` block that every section of it repeats — `validate` rejects sections that disagree, as it does for `kind` and `name` (§2.2). It is not read off any section's `overview.topology`, which keeps its own meaning: Shikoku's four dōjō are each individually linear (Awa runs Temple 1 to 23 and does not return), and only the circuit they add up to closes, so no honest section-level topology could arm this check.

### 4.3 Walked line from pinned relations

`build-main-line` refuses a route whose `metadata.json` has no `osm.relations` (an Overpass name query pulls in every spur and variant; the 4,020 km Shikoku line came from 89 relations). The relation list is the section's trail and nothing else. The existing `refuseIncompleteLine` stays: a gap between two anchors in the way graph is a data error to fix (a wrong anchor or a missing relation), never spliced. Its non-zero exit has one recovery, and it is not a splice: when the gap cannot be closed — a relation that does not exist, or a trail OSM has not mapped through — the section ships metadata-only with `ways: null` and waits for a later release (§5.2).

### 4.4 Emitters and site

`build-index` emits `pilgrimages[]` and per-route `pilgrimage`; `check-site` learns the grouping and drops the coastal-only special cases where the generic check covers them; `docs/routes.html` groups by pilgrimage. `validate` accepts the new metadata fields via `schema/pilgrimage.schema.json`.

Every section keeps a detail page of its own, exactly as every route has one today. `check-site` runs in CI and requires, per route id, a `docs/<id>.html` that identifies itself, inlined glyph, elevation-profile and sparkline assets matching `docs/assets/`, an `assets/roads/<id>.svg` hero, a `route.gpx` link, a README row linking `](routes/<id>/)`, and a catalog link plus a comparison-table row in `docs/routes.html`. Folding sections onto one page per pilgrimage would mean rewriting that contract, so it does not change: each of the eight new and renamed section ids under Kumano Kodō and Shikoku 88 needs its own detail page and its own generated assets, and that work is part of each content PR (§5).

`build-assets` additionally emits `docs/<pilgrimage-id>.html` for each pilgrimage, listing its sections in `order`. That is what keeps the published `https://open.pilgrimag.es/kumano-kodo` and `https://open.pilgrimag.es/shikoku-88` resolving once those ids are no longer routes. `check-site`'s reverse orphan scan over `docs/*.html` and its `RESERVED_PAGE_NAMES` collision check both accept pilgrimage ids alongside route ids, so a pilgrimage page is not reported as an orphaned detail page and no section may take a pilgrimage's name.

## 5. Content, per pilgrimage

One PR per pilgrimage, except where a pilgrimage's content work is one section of it: PR B covers `camino-norte` alone, one of the five sections of `camino-de-santiago`. The recipe is the one the Camino Francés went through in PR #6:

1. Pin every stage anchor to an OSM place node or the temple/shrine node itself, recorded in the anchor's `note` as the Camino's corrections were.
2. Build the walked line from the section's pinned relations.
3. Run the gate; fix the anchor or the declared distance it names. Measured distances from the line replace guidebook figures when they disagree by more than the gate's tolerance, and the CHANGELOG says so.
4. Curate places so the section is not `sparse`.
5. Draft stage text where none exists (§6).
6. Ship each section's site surface: its `docs/<section-id>.html` detail page, its generated glyph, profile, sparkline and roads corridor, its `route.gpx` link, its README row, and its catalog link and comparison-table row (§4.4).

### 5.1 Camino del Norte (PR B, release 1.7.1)

One section of `camino-de-santiago`; the other four Caminos are tag-only (§2.1). 34 stages that already chain; four OSM relations plus a superroute are pinned; 3,634 waypoints, all services. Work: anchors, walked line, gate, and 2–3 curated places per stage pulled from OSM within the corridor — churches, monasteries, hermitages, viewpoints, and the stage towns — as `sacred_site` / `cultural_site` / `viewpoint` / `town` with `source: "osm"` and `osmId`. Stage text exists and is kept.

### 5.2 Kumano Kodō (PR C, release 1.8.0)

Four sections. Nakahechi: rename, rebuild on a walked line from its Nakahechi relations only (the Kohechi relation currently folded into `route.geojson` moves to its own section), keep its four curated stages. Kohechi (Kōyasan → Hongū, ~70 km, 4 stages), Iseji (Ise → Hongū/Shingū/Nachi, ~170 km, ~9 stages), Ohechi (Tanabe → Nachi via Kushimoto, ~90 km, ~4 stages): new sections with relations pinned from OSM, stages at the traditional overnight villages, places from the ōji shrines, temples, and passes along each, text drafted (§6). Nachi Taisha and Hayatama Taisha get the stage indices they lack today.

Precondition: only Kohechi's relation is known. The `熊野古道` query returned six Nakahechi sub-relations plus Kohechi (17131166), and the repo holds no Iseji or Ohechi geometry at all. Both relation ids must be confirmed against OSM and recorded in this spec before those two sections are cut. A section whose relation turns out to be absent, or whose way graph is discontinuous, ships metadata-only with `ways: null` and moves to a later release rather than holding 1.8.0 open (§4.3).

### 5.3 Shikoku 88 (PR D, release 1.9.0)

Four dōjō sections replacing the ten non-chaining stages. About 45 day stages, each ending at a temple: from the previous day's temple, the day runs to the next temple in sequence that puts it between 25 and 30 km along the walked line, or at that temple's town where the temple has no lodging. The division is mechanical, and so reproducible from `waypoints.geojson` and the measured line rather than lifted from a guidebook whose pacing this repo could neither cite nor relicense; each section's `provenance.sources` carries an entry with `dataTypes: ["stages", "distances"]` naming that derivation and the line it was measured on. The four sections chain (Awa ends at Temple 23, Tosa begins there), and a boundary stage ends at the boundary temple itself, never at its town — the lodging fallback does not apply there (§4.2). Sanuki's final stage runs Ōkubo-ji (88) → Ryōzen-ji (1), the closing return the 1,200 km figure already counts and the `circular` topology already claims. Distances are measured from the walked line, which is built from the henro trail relations only. The 88 temples are the places (they already carry coordinates and `stageIndex`, which is re-assigned to the new days); bangai temples and notable henro huts may be added as `cultural_site`. Text drafted (§6).

## 6. Drafted text and the review checklist

Where a stage has no `interior`, the agent drafts `theme` (2–4 words), `narrative` (2–3 sentences), and `reflection` (one closing line) grounded only in what the stage contains: its temples, shrines, passes, towns, distance, and climb. No legends, dates, or claims not present in the section's own `metadata.json`, `waypoints.geojson`, or OSM tags. The same rule governs where a stage begins and ends: where no citable source gives the day division, it is derived from the section's own data and the derivation is recorded in `provenance.sources` (§5.3). Every drafted field is marked `"drafted": true` on the stage so it is greppable, and the mark is removed when the text is reviewed.

Each content PR carries `docs/review/<id>.md` — the pilgrimage id, or the section id where the PR's content work is scoped to a single section (`docs/review/camino-norte.md` for PR B) — listing, per stage: endpoints with their OSM nodes, measured versus previously declared distance, the drafted text verbatim, and each curated place with its OSM id.

The gate is at merge, not at tagging. `validate` fails when any stage in `routes/*/stages.json` carries `"drafted": true`, so drafted text never reaches `main` and review happens on the content PR against its checklist, before merge. A release-runbook gate cannot do this job: `release.md` Phase 2b requires the tag to follow the merge immediately, so a slow review would leave `@main/index.json` naming a release tag that does not exist — and because `PilgrimageCatalogService.packageURL` builds every route's package URL from that one global `release` field, the whole catalog, the Camino included, would stop downloading.

Clearing the flag is checked too. The same gate reads `docs/review/<id>.md` alongside the stage files: a stage the checklist lists whose `"drafted": true` is gone must carry a recorded reviewed mark there, so the flag cannot be stripped in one pass without a review being recorded. For each section the gate looks for `docs/review/<section-id>.md` first and falls back to `docs/review/<pilgrimage-id>.md`, so a whole-pilgrimage PR is covered by the file it actually carries. Only a line at the top level of the checklist counts as that mark: a checkbox inside a code fence or a blockquote does not, because the checklist quotes the drafted text verbatim and the guarded prose must not be able to satisfy its own gate.

The two files take different line forms, and each file counts only its own:

| File | Line | Why |
|---|---|---|
| `docs/review/<section-id>.md` | `- [x] stage 0` | The file names the section already. |
| `docs/review/<pilgrimage-id>.md` | `- [x] kumano-kodo-kohechi stage 0` | Four sections each have a stage 0; unqualified, one tick would clear all four. |

So an unqualified line in a pilgrimage-level file records nothing, and a qualified line in a section-level file is not the form that file uses.

## 7. Testing

- Unit: boundary advance/fail cases; section chaining, including the circular close; `build-main-line` refusing a relation-less route; `build-index` pilgrimages derivation and ordering; schema acceptance of the new fields.
- Unit: `check-site` rejecting a section whose `pilgrimage` names no pilgrimage in `index.json`, and a pilgrimage with zero sections.
- Data: every content PR ends with `build-ways && build-index && validate` deterministic and `check-site` in sync; the gate passes for every section it adds; `validate` fails on any `"drafted": true`, so no content PR can merge with drafted text in it.
- App: none required. The device pass for iOS slice two covers the Camino; each new section is exercised the same way once released.

## 8. Out of scope

Pilgrimage-level download and catalog in the app (next iOS slice). Offline tiles (slice three). The Portugués coastal variant's promotion to a section. Curating Primitivo, Inglés, and Portugués places. Iseji's Magose/Matsumoto pass sub-variants beyond the main line.

## 9. Order of work

PR A (pipeline, plus the `pilgrimage` block added to the five Camino sections' `metadata.json` and the regenerated `index.json` and reports) → PR B Norte → PR C Kumano → PR D Shikoku. Each PR is its own release immediately after merge, with the tag following the merge per `release.md` Phase 2b — which is why the drafted-text gate sits at merge and not at tagging (§6). PR B–D each depend on PR A; they do not depend on each other.

## 10. Review decisions

Two review findings were considered and not taken. Shipping only the Nakahechi section now and deferring Kohechi, Iseji, and Ohechi to a later PR: all four are in scope for 1.8.0, and §5.2's precondition already covers the risk that finding was raised against by moving any unconfirmable section to a later release on its own. Gating PR B–D on user demand or on the iOS slice merging: the dataset lands before its consumer by design, for the reasons in §3.
