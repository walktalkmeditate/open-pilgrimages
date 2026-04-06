# Open Pilgrimages — Contributor Gateway Redesign

**Date:** 2026-04-06
**Status:** Approved

## Problem

The docs site (open.pilgrimag.es) reads as a documentation site for data consumers. GitHub is buried in footer links. There is no "Contribute" in the nav, no contributor pathway, and no indication this is a living, participatory project. The site needs to become the gateway for people — especially pilgrims and route researchers — to contribute to this open-source pilgrimage dataset.

## Target Audience

- **Pilgrims and cultural contributors** — people who've walked these routes and want to share experience, correct waypoints, add local knowledge
- **Route researchers** — people who want to propose and build out entirely new pilgrimage routes from other traditions (Hindu, Islamic, indigenous, etc.)

These contributors may not be GitHub-fluent. The design must bridge "pilgrim with knowledge" to "open-source contributor."

## Contribution Model

Dual pathway:
1. **Issue-first on-ramp** — open a GitHub Issue describing what you know. No coding required. Maintainers shape it into data.
2. **Direct contribution** — fork, edit JSON/GeoJSON, validate, submit PR. Full guide for those ready to go deeper.

## Design Decisions

| Question | Choice | Rationale |
|----------|--------|-----------|
| Overall approach | Reframe homepage as gateway (Approach B) | Transforms feel without rebuilding everything. Homepage becomes invitation, not catalog. |
| Homepage hero | Stats First | Numbers establish credibility before asking anything. "89K GPS points" earns trust from any visitor. |
| Route cards | Narrative Needs | Speaks to pilgrims in human language. "Walked this route? Share your experience" vs progress bar percentages. |
| Contribute page | Sequential Funnel | Mirrors pilgrimage itself — take the first step, path reveals itself. "What We Need Most" tags create recognition before asking for action. |
| Hero subtitle | Warm up from "canonical dataset" | Current subtitle is clinical. Shift toward "built by pilgrims and researchers worldwide." |
| "Routes We're Looking For" | Contribute page only, not homepage | Homepage should feel abundant. A "missing routes" list undermines the stats hero. On the Contribute page, specificity motivates. |

## Changes by File

### All Pages — Navigation

- Add **"Contribute"** link to nav, after Usage, styled in `--rust` color to draw attention
- Add **GitHub icon + link** to the right side of the nav bar
- Applies to: `index.html`, `routes.html`, `schema.html`, `usage.html`, new `contribute.html`

### index.html — Homepage Restructure

**Hero section (new):**
- Title: "Open Pilgrimages"
- Subtitle: *"An open-source pilgrimage dataset, built by pilgrims and researchers worldwide."*
- Four stat counters in a row: `3 Routes` · `89K GPS Points` · `6K Waypoints` · `47 Stages`
- Two CTAs: "Star on GitHub" (filled button, `--rust` background) + "How to Contribute" (outline button, `--stone` border)

**"Why This Exists" section:** Keep existing content unchanged. The three-layer table stays.

**Route cards (redesigned):**
- Keep route descriptions and metadata line (distance, topology, country, stages)
- Add status line at bottom of each card:
  - Complete routes: green check icon + "Fully enriched — geometry, waypoints, stages, interior journey"
  - Routes with gaps: rust-colored callout icon + specific needs in plain language (e.g., "Needs: Kohechi & Iseji sub-route data, more waypoints") + "Walked this route? Share your experience"
- Status colors: `--moss` (#7A8B6F) for complete, `--rust` (#A0634B) for needs

**Data Sources & License section:** Keep as-is.

**Footer:** Keep "Part of the Pilgrim ecosystem" + add GitHub repo link.

### contribute.html — New Page

**Opening:**
- Title: "Contribute"
- Subtitle: *"Every pilgrimage tradition deserves to be mapped, understood, and shared openly."*

**"What We Need Most" section:**
- Tag chips showing specific current gaps:
  - "New routes from other traditions" (Via Francigena, Char Dham, Camino Portugues, etc.)
  - "Kumano Kodo sub-routes" (Kohechi, Iseji)
  - "Walking experiences and local knowledge"
  - "Data corrections and waypoint additions"

**Step 1 — "Tell us what you know":**
- Numbered step with `--rust` accent
- Description: Open a GitHub issue. No coding required.
- Three paths listed: propose a new route, report a data error, share walking experience
- CTA: "Open an Issue →" linking to GitHub Issues

**Step 2 — "Contribute directly":**
- Numbered step with `--stone` accent
- Description: Fork, edit JSON/GeoJSON, run `npm run validate`, submit PR
- Links to full CONTRIBUTING.md guide on GitHub
- Brief mention of the four-file route structure

**Data Quality Standards section:**
- Brief version of key conventions from CONTRIBUTING.md: coordinates, distances, localization, sources

**Code of Conduct section:**
- Brief statement about respecting sacred sites, cultural practices, and diverse traditions

### routes.html, schema.html, usage.html

- Nav update only (add Contribute link + GitHub icon)
- Content unchanged

### styles.css

- Add nav styles for the GitHub link (right-aligned, icon + text)
- Add nav styles for the Contribute link accent color
- Add stat counter styles for the hero section
- Add styles for route card status lines (complete vs needs)
- Add styles for the contribute page: need tags, numbered steps, CTAs
- All new styles use existing CSS custom properties (no new colors or fonts)
- Mobile responsive: stat counters should wrap (flex-wrap) at the existing 600px breakpoint. Sequential funnel steps are already single-column.

## What Stays the Same

- Color palette: `--parchment`, `--ink`, `--stone`, `--moss`, `--rust`, `--dawn`, `--fog`, `--night`
- Typography: Cormorant Garamond (headings) + Lato (body)
- Favicon, OG image, CNAME
- Routes, Schema, Usage page content
- The contemplative, earth-toned soul of the design

## Out of Scope

- Dynamic content (GitHub API calls for stars, contributor lists)
- GitHub Issue templates (can be added later)
- New OG image for the Contribute page (reuse existing)
- JavaScript interactivity beyond links
