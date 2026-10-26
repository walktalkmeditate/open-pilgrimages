# St. Olav Ways Implementation Plan (first section: Gudbrandsdalsleden)

**Goal:** The St. Olav Ways join the dataset as an `alternatives` pilgrimage ending at Nidaros Cathedral, starting with one section — the Gudbrandsdalsleden's main traditional line from Oslo to Trondheim — built the way `camino-norte`, `kumano-kodo-kohechi` and `kumano-kodo-iseji` were.

**Status: stopped at the first network step.** The attempt on 2026-10-26 could not reach `overpass-api.de` from its environment: every connection was reset at the egress proxy after 39 bytes, six times over about a minute, with backoff. Per the task's own rule it did not try another Overpass host, the OpenStreetMap editing API, or any geometry from memory. No `routes/` directory ships from this attempt, for the reason under "Why no metadata-only section yet". This file records what was confirmed, so the next attempt starts from it rather than repeating the research.

## Global Constraints

- `CLAUDE.md` wins over this plan wherever they disagree.
- Geometry and waypoints from OpenStreetMap only, through Overpass. No hand tracing, no stitching loose ways, no drawn lines.
- Facts from Wikidata (CC0) first, then official bodies whose licence can be determined. A source whose licence cannot be determined is read to find primary sources and nothing is taken from it.
- A figure with no open or official source is left out, not estimated.
- `schema/` is not changed.

## The pilgrimage block

`kind: "alternatives"`, confirmed against the Pilgrimage convention in `CLAUDE.md`: each St. Olav way is its own route to the same end, Nidaros Cathedral, so none chains into another and no distance is summed across them. Not `circular`. The block every section will repeat:

```json
"pilgrimage": {
  "id": "st-olav-ways",
  "name": { "en": "St. Olav Ways", "nb": "St. Olavsvegene" },
  "kind": "alternatives",
  "order": 1
}
```

`nb` "St. Olavsvegene" is the term Wikidata's own Norwegian description of Q2095033 uses ("turveier til Nidaros, St. Olavsvegene"). Proposed section id `st-olav-ways-gudbrandsdalsleden`, following `kumano-kodo-kohechi`'s pilgrimage-then-section form; neither id collides with an existing page. With one content section in the PR, its review checklist is `docs/review/st-olav-ways-gudbrandsdalsleden.md`, lines in the bare `- [ ] stage N` form.

## What the research established

### Wikidata (CC0), read 2026-10-26

| Item | What it is | P402 (OSM relation) |
|---|---|---|
| Q2095033 | "Pilgrim's Route" / nb "Pilegrimsleden" — the umbrella: "turveier til Nidaros, St. Olavsvegene". Countries NO, SE. P856 `https://www.pilegrimsleden.no/` | none |
| Q18448597 | St. Olavsleden (Selånger → Nidaros), `P361` Q2095033, destination Q215023 | 10524322 |
| Q116785357 | Romboleden (St Olav Romboway), `P361` Q2095033 | 1151161 |
| Q116785365 | Jämt–Norgevägen, listed in Q2095033 `P527` | 9686095 |
| Q215023 | Nidaros Cathedral / nb Nidarosdomen, P625 10.3969 E, 63.4269 N | — |
| Q585 | Oslo, P625 10.7389 E, 59.9133 N | — |

**There is no Wikidata item for the Gudbrandsdalsleden.** Exact-label lookups for "Gudbrandsdalsleden" in nb, nn, no, en, sv, de and mul return nothing, and full-text search for it, and for "pilegrimsleden Oslo Trondheim", returns no item. Q2095033 is the whole network, not this line, and has no P402. So the P402 path to a relation does not exist for this section; only an Overpass tag search can find it.

The three relation ids above belong to later sections. They were read from Wikidata and **not** confirmed against their own OSM tags, because that needs Overpass. They are listed so a later PR knows where to start, not pinned anywhere.

### Official bodies

- **Nasjonalt pilegrimssenter, `https://www.pilegrimsleden.no/`** — the national pilgrim office, run from Nidarosdomen, and the obvious source for the route's stages, length and pilgrim counts. Its homepage, English page, Gudbrandsdalsleden page, press page and privacy page carry no licence statement of any kind. Nothing was taken from it. Until it publishes terms, or someone obtains them, it can point at primary sources and supply nothing itself — which also means no `stats.json`.
- **regjeringen.no** publishes under NLOD 2.0, but its search answered 403 to this environment (the site's own refusal, not the egress proxy's), so nothing was read there.

## Why no metadata-only section yet

`kumano-kodo-iseji` ships metadata-only, and that is the pattern for a section with no walked line. It cannot be copied here yet, because `schema/pilgrimage.schema.json` requires `overview.distanceKm`, `overview.estimatedDays` and `overview.difficulty`, and for this section none of the three has a source this task may use:

- `distanceKm` — no Wikidata item; the pilgrim office's figure has no licence; the walked line that would measure it is behind Overpass. The Iseji's declared figure came from this repository's own planning spec, which says nothing about Norway.
- `estimatedDays` — the same.
- `difficulty` — `CLAUDE.md` says none is written for a route whose stages were measured rather than graded, and the task says no `difficulty` key; the schema requires one, and every existing section, the Kohechi included, carries one. **This conflict needs the plan owner's ruling before any St. Olav section can validate**, metadata-only or measured.

Writing any of the three without a source is the estimate the rules forbid, and leaving them out fails `validate`. So the attempt stopped here rather than ship either.

## Next attempt

1. From an environment that reaches `overpass-api.de`, find the Gudbrandsdalsleden relation(s) by tag search inside Norway — `route=hiking` or `route=foot` with `name~"Gudbrandsdalsleden|Pilegrimsleden"`, and any `type=superroute` holding them. Confirm each id by its own `name`, `website` and `operator` tags, and pin the main traditional line only, leaving the variants for a later PR. If the main line is a superroute of sub-relations, follow `camino-norte`'s `osm.superroute` / `osm.trimStart` pattern. Record how each id was confirmed in `osm.note`.
2. Confirm Q18448597's 10524322, Q116785357's 1151161 and Q116785365's 9686095 the same way, for the later sections.
3. If no relation covers the walked line, ship metadata-only with `ways: null` as the Iseji does — once the three required overview figures have a source and the `difficulty` ruling is made.
4. Otherwise: `build-main-line`, stage anchors on OSM place nodes, `fetch-elevation` / `apply-elevation`, hours by Naismith stated in `overview.hoursNote` as the Kohechi's are, stage text written fresh with `"drafted": true`, and the checklist above with one open line per stage. Then `build-ways`, `build-index`, `validate`, `build-assets`, `check-site`.
