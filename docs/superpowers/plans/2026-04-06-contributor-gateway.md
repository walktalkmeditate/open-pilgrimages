# Contributor Gateway Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform open.pilgrimag.es from a data-consumer docs site into a contributor gateway for pilgrims and route researchers.

**Architecture:** Static HTML/CSS site (GitHub Pages). No build step for docs — edit files directly. One new page (`contribute.html`), modifications to all existing pages (nav + GitHub link), homepage restructure (stats hero, narrative route cards). All new styles use existing CSS custom properties.

**Tech Stack:** HTML, CSS (vanilla, no frameworks). GitHub Pages hosting.

**Spec:** `docs/superpowers/specs/2026-04-06-contributor-gateway-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `docs/styles.css` | All new CSS: nav layout, stat counters, CTAs, route card status lines, contribute page styles |
| Modify | `docs/index.html` | Homepage: stats hero, redesigned route cards, updated nav/footer |
| Modify | `docs/routes.html` | Nav update only |
| Modify | `docs/schema.html` | Nav update only |
| Modify | `docs/usage.html` | Nav update only |
| Create | `docs/contribute.html` | New contribute page with sequential funnel |

---

### Task 1: Add All New CSS Styles

**Files:**
- Modify: `docs/styles.css`

- [ ] **Step 1: Add nav layout styles**

Add after the existing `nav a.active` block (after line 115 in `styles.css`):

```css
nav {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

nav .nav-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

nav .nav-links a {
  margin-right: var(--space-lg);
}

nav .nav-contribute {
  color: var(--rust) !important;
}

nav .nav-contribute:hover,
nav .nav-contribute.active {
  color: var(--rust) !important;
  border-bottom-color: var(--rust) !important;
}

nav .nav-github {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--stone);
}

nav .nav-github:hover {
  color: var(--ink);
  border-bottom-color: var(--stone);
}

nav .nav-github svg {
  flex-shrink: 0;
}
```

Note: The existing `nav a` rule already sets `margin-right`, `font-size`, `text-transform`, `letter-spacing`, and `color`. The new rules extend the nav with flexbox layout. The `nav .nav-links a` selector ensures page links still get right margin inside the wrapper div.

- [ ] **Step 2: Add hero stat counter styles**

Add after the nav styles:

```css
.hero-stats {
  display: flex;
  gap: var(--space-xl);
  margin: var(--space-xl) 0;
}

.stat {
  text-align: center;
}

.stat-number {
  display: block;
  font-family: var(--font-serif);
  font-size: 2.2rem;
  font-weight: 500;
  color: var(--rust);
  line-height: 1.2;
}

.stat-label {
  display: block;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--stone);
}
```

- [ ] **Step 3: Add CTA button styles**

```css
.hero-cta {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.btn {
  display: inline-block;
  padding: 0.5rem 1.2rem;
  border-radius: 4px;
  font-family: var(--font-sans);
  font-size: 0.9rem;
  font-weight: 700;
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn:hover {
  opacity: 0.85;
  border-bottom-color: transparent;
}

.btn-primary {
  background: var(--rust);
  color: white;
}

.btn-secondary {
  background: transparent;
  border: 1px solid var(--stone);
  color: var(--stone);
}
```

- [ ] **Step 4: Add route card status line styles**

```css
.route-status {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  margin-top: var(--space-sm);
}

.route-status svg {
  flex-shrink: 0;
}

.route-status-complete {
  color: var(--moss);
}

.route-status-needs {
  color: var(--rust);
}

.route-status-needs + .route-status-needs {
  margin-top: 0.25rem;
}
```

- [ ] **Step 5: Add contribute page styles**

```css
.need-tags {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin: var(--space-md) 0 var(--space-xl);
}

.need-tag {
  font-size: 0.8rem;
  background: white;
  border: 1px solid var(--dawn);
  color: var(--rust);
  padding: 0.35rem 0.75rem;
  border-radius: 4px;
  font-family: var(--font-sans);
}

.step-card {
  border: 1px solid var(--fog);
  border-radius: 4px;
  padding: var(--space-lg);
  background: white;
  margin-bottom: var(--space-md);
}

.step-header {
  display: flex;
  gap: var(--space-md);
  align-items: flex-start;
}

.step-number {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.step-number-1 {
  background: var(--rust);
}

.step-number-2 {
  background: var(--stone);
}

.step-body h3 {
  margin-top: 0;
  margin-bottom: var(--space-xs);
}

.step-paths {
  list-style: none;
  padding: 0;
  margin: var(--space-sm) 0 var(--space-md);
  font-size: 0.9rem;
  color: var(--stone);
}

.step-paths li {
  margin-bottom: 0.3rem;
}

.step-paths li::before {
  content: "\2192\00a0";
  color: var(--rust);
}
```

- [ ] **Step 6: Update mobile breakpoint**

Find the existing `@media (max-width: 600px)` block and replace it:

```css
@media (max-width: 600px) {
  html { font-size: 16px; }
  h1 { font-size: 1.8rem; }

  nav { flex-direction: column; align-items: flex-start; gap: var(--space-sm); }
  nav .nav-links { flex-direction: column; align-items: flex-start; }
  nav .nav-links a { margin-right: 0; margin-bottom: var(--space-xs); }
  nav .nav-github { margin-left: 0; margin-top: var(--space-sm); }

  .hero-stats { flex-wrap: wrap; gap: var(--space-lg); }
  .stat-number { font-size: 1.8rem; }

  .hero-cta { flex-direction: column; }
  .hero-cta .btn { text-align: center; }
}
```

- [ ] **Step 7: Commit**

```bash
git add docs/styles.css
git commit -m "styles: add CSS for contributor gateway redesign

Nav layout, stat counters, CTA buttons, route card status lines,
contribute page styles, mobile breakpoint updates."
```

---

### Task 2: Update Navigation Across All Pages

**Files:**
- Modify: `docs/index.html`
- Modify: `docs/routes.html`
- Modify: `docs/schema.html`
- Modify: `docs/usage.html`

The new nav HTML for all pages (the `class="active"` moves per page):

```html
<nav>
  <div class="nav-links">
    <a href="index.html">Home</a>
    <a href="routes.html">Routes</a>
    <a href="schema.html">Schema</a>
    <a href="usage.html">Usage</a>
    <a href="contribute.html" class="nav-contribute">Contribute</a>
  </div>
  <a href="https://github.com/walktalkmeditate/open-pilgrimages" class="nav-github">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
    GitHub
  </a>
</nav>
```

- [ ] **Step 1: Update index.html nav**

In `docs/index.html`, replace the existing `<nav>...</nav>` block (lines 28-33) with the nav HTML above. Set `class="active"` on the Home link:

```html
<a href="index.html" class="active">Home</a>
```

- [ ] **Step 2: Update routes.html nav**

In `docs/routes.html`, replace the existing `<nav>...</nav>` block (lines 28-33) with the nav HTML above. Set `class="active"` on the Routes link:

```html
<a href="routes.html" class="active">Routes</a>
```

- [ ] **Step 3: Update schema.html nav**

In `docs/schema.html`, replace the existing `<nav>...</nav>` block (lines 28-33) with the nav HTML above. Set `class="active"` on the Schema link:

```html
<a href="schema.html" class="active">Schema</a>
```

- [ ] **Step 4: Update usage.html nav**

In `docs/usage.html`, replace the existing `<nav>...</nav>` block (lines 28-33) with the nav HTML above. Set `class="active"` on the Usage link:

```html
<a href="usage.html" class="active">Usage</a>
```

- [ ] **Step 5: Commit**

```bash
git add docs/index.html docs/routes.html docs/schema.html docs/usage.html
git commit -m "docs: add Contribute link and GitHub to nav across all pages"
```

---

### Task 3: Restructure Homepage

**Files:**
- Modify: `docs/index.html`

- [ ] **Step 1: Restructure the hero section**

In `docs/index.html`, replace the existing hero content — from the `<h1>` through the first `<p>` tag after the subtitle (lines 35-38) — with:

```html
    <h1>Open Pilgrimages</h1>
    <p class="subtitle">An open-source pilgrimage dataset, built by pilgrims and researchers worldwide.</p>

    <div class="hero-stats">
      <div class="stat">
        <span class="stat-number">3</span>
        <span class="stat-label">Routes</span>
      </div>
      <div class="stat">
        <span class="stat-number">89K</span>
        <span class="stat-label">GPS Points</span>
      </div>
      <div class="stat">
        <span class="stat-number">6K</span>
        <span class="stat-label">Waypoints</span>
      </div>
      <div class="stat">
        <span class="stat-number">47</span>
        <span class="stat-label">Stages</span>
      </div>
    </div>

    <div class="hero-cta">
      <a href="https://github.com/walktalkmeditate/open-pilgrimages" class="btn btn-primary">&#9733; Star on GitHub</a>
      <a href="contribute.html" class="btn btn-secondary">How to Contribute</a>
    </div>
```

- [ ] **Step 2: Redesign route cards with narrative needs**

Replace the entire `<div class="route-grid">...</div>` block (lines 59-92, though line numbers will have shifted after step 1) with:

```html
    <div class="route-grid">
      <div class="route-card">
        <h3>Camino de Santiago (Frances) <span class="badge badge-christian">Christian</span></h3>
        <div class="meta">
          <span>790 km</span>
          <span>Linear</span>
          <span>France &rarr; Spain</span>
          <span>33 stages</span>
        </div>
        <p>The most popular pilgrimage route to Santiago de Compostela, crossing the Pyrenees and traversing northern Spain. Walked continuously since the 9th century.</p>
        <div class="route-status route-status-complete">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M4 7l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Fully enriched &mdash; geometry, waypoints, stages, interior journey
        </div>
      </div>

      <div class="route-card">
        <h3>Shikoku 88 Temple Pilgrimage <span class="badge badge-buddhist">Buddhist</span></h3>
        <div class="meta">
          <span>1,200 km</span>
          <span>Circular</span>
          <span>Japan</span>
          <span>10 stages</span>
        </div>
        <p>A circular pilgrimage visiting 88 Buddhist temples around the island of Shikoku, following the footsteps of the monk K&#363;kai.</p>
        <div class="route-status route-status-complete">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M4 7l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Fully enriched &mdash; geometry, waypoints, stages, interior journey
        </div>
      </div>

      <div class="route-card">
        <h3>Kumano Kodo <span class="badge badge-mixed">Shinto / Buddhist</span></h3>
        <div class="meta">
          <span>38 km (Nakahechi)</span>
          <span>Network</span>
          <span>Japan</span>
          <span>4 stages</span>
        </div>
        <p>Ancient pilgrimage routes through the mountains of the Kii Peninsula to the three Grand Shrines of Kumano. UNESCO World Heritage since 2004.</p>
        <div class="route-status route-status-needs">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M7 4v3m0 2.5v.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          Needs: Kohechi &amp; Iseji sub-route data, more waypoints
        </div>
        <div class="route-status route-status-needs">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M7 4v3m0 2.5v.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          Walked this route? <a href="contribute.html">Share your experience</a>
        </div>
      </div>
    </div>
```

- [ ] **Step 3: Update the footer**

Replace the existing `<footer>...</footer>` block with:

```html
    <footer>
      <p>Part of the <a href="https://pilgrimapp.org">Pilgrim</a> ecosystem. <a href="https://github.com/walktalkmeditate/open-pilgrimages">GitHub</a></p>
    </footer>
```

- [ ] **Step 4: Commit**

```bash
git add docs/index.html
git commit -m "docs: restructure homepage as contributor gateway

Stats hero with GitHub CTA, narrative route cards showing
completion status and contribution needs."
```

---

### Task 4: Create Contribute Page

**Files:**
- Create: `docs/contribute.html`

- [ ] **Step 1: Create the full contribute.html page**

Create `docs/contribute.html` with this content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Contribute &mdash; Open Pilgrimages</title>
  <meta name="description" content="Help build the world's open pilgrimage dataset. Share your walking experience, propose new routes, or contribute data directly.">
  <link rel="canonical" href="https://open.pilgrimag.es/contribute.html">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Contribute &mdash; Open Pilgrimages">
  <meta property="og:description" content="Help build the world's open pilgrimage dataset. Share walking experience, propose routes, contribute data.">
  <meta property="og:url" content="https://open.pilgrimag.es/contribute.html">
  <meta property="og:image" content="https://open.pilgrimag.es/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Contribute &mdash; Open Pilgrimages">
  <meta name="twitter:image" content="https://open.pilgrimag.es/og-image.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Lato:wght@400;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <nav>
      <div class="nav-links">
        <a href="index.html">Home</a>
        <a href="routes.html">Routes</a>
        <a href="schema.html">Schema</a>
        <a href="usage.html">Usage</a>
        <a href="contribute.html" class="nav-contribute active">Contribute</a>
      </div>
      <a href="https://github.com/walktalkmeditate/open-pilgrimages" class="nav-github">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        GitHub
      </a>
    </nav>

    <h1>Contribute</h1>
    <p class="subtitle">Every pilgrimage tradition deserves to be mapped, understood, and shared openly.</p>

    <h2>What We Need Most</h2>

    <div class="need-tags">
      <span class="need-tag">New routes from other traditions</span>
      <span class="need-tag">Kumano Kodo sub-routes (Kohechi, Iseji)</span>
      <span class="need-tag">Walking experiences &amp; local knowledge</span>
      <span class="need-tag">Data corrections &amp; waypoint additions</span>
    </div>

    <div class="step-card">
      <div class="step-header">
        <div class="step-number step-number-1">1</div>
        <div class="step-body">
          <h3>Tell Us What You Know</h3>
          <p>Open a GitHub issue describing the route, correction, or experience you'd like to share. No technical skills needed &mdash; we'll help shape your knowledge into data.</p>
          <ul class="step-paths">
            <li>Propose a new pilgrimage route</li>
            <li>Report a data error or missing waypoint</li>
            <li>Share your walking experience for interior journey content</li>
          </ul>
          <a href="https://github.com/walktalkmeditate/open-pilgrimages/issues/new" class="btn btn-primary">Open an Issue &rarr;</a>
        </div>
      </div>
    </div>

    <div class="step-card">
      <div class="step-header">
        <div class="step-number step-number-2">2</div>
        <div class="step-body">
          <h3>Or Contribute Directly</h3>
          <p>Fork the repository, edit the data files, and submit a pull request. Our JSON schemas validate your changes automatically.</p>
          <ul class="step-paths">
            <li>Fix waypoint coordinates or metadata</li>
            <li>Add interior journey narratives for stages</li>
            <li>Build out a complete new route</li>
          </ul>
          <pre><code>git clone https://github.com/walktalkmeditate/open-pilgrimages.git
cd open-pilgrimages
npm install
npm run validate    # Check your changes against schemas</code></pre>
          <p>Each route follows a standard four-file structure:</p>
          <pre><code>routes/{route-id}/
  metadata.json        # Overview, tradition, culture, logistics
  route.geojson        # GeoJSON route geometry
  stages.json          # Stage breakdowns with interior journey
  waypoints.geojson    # Points of interest along the route</code></pre>
          <p>See the full <a href="https://github.com/walktalkmeditate/open-pilgrimages/blob/main/CONTRIBUTING.md">contributing guide</a> for detailed instructions.</p>
        </div>
      </div>
    </div>

    <h2>Data Quality</h2>

    <table>
      <thead>
        <tr><th>Convention</th><th>Standard</th></tr>
      </thead>
      <tbody>
        <tr><td>Coordinates</td><td><code>[longitude, latitude, altitude]</code> (GeoJSON standard). Altitude in meters.</td></tr>
        <tr><td>Distances</td><td>Kilometers, measured along the route path.</td></tr>
        <tr><td>Localization</td><td><code>{ "en": "...", "ja": "..." }</code> &mdash; English always required.</td></tr>
        <tr><td>Sources</td><td>Include source URLs and access dates in the <code>provenance</code> section.</td></tr>
      </tbody>
    </table>

    <h2>Code of Conduct</h2>

    <p>This project serves pilgrims and the pilgrimage community worldwide. We welcome contributions from all traditions and backgrounds. Be respectful of sacred sites, cultural practices, and the diverse motivations people bring to pilgrimage.</p>

    <footer>
      <p><a href="https://github.com/walktalkmeditate/open-pilgrimages">GitHub</a></p>
    </footer>
  </div>
</body>
</html>
```

- [ ] **Step 2: Verify the page renders correctly**

Open `docs/contribute.html` in a browser and verify:
- Nav shows all 5 links with "Contribute" highlighted in rust and marked active
- GitHub icon + link appears on the right side of the nav
- "What We Need Most" tags display as wrapped chips with amber border
- Step 1 has rust-colored number circle, step 2 has stone-colored
- "Open an Issue" button is rust/filled, links to GitHub Issues
- Code blocks render correctly with dark background
- Data quality table renders correctly
- Mobile: resize to <600px and verify nav stacks, content remains readable

- [ ] **Step 3: Commit**

```bash
git add docs/contribute.html
git commit -m "docs: add contribute page with sequential funnel

Dual pathway: issue-first on-ramp for pilgrims/researchers,
direct contribution guide for technical contributors."
```

---

### Task 5: Final Verification

**Files:** None (read-only verification)

- [ ] **Step 1: Check all pages in browser**

Open each page and verify the nav is consistent:

- `docs/index.html` — Home active, stats hero visible, route cards have status lines, CTAs link correctly
- `docs/routes.html` — Routes active, content unchanged, nav has Contribute + GitHub
- `docs/schema.html` — Schema active, content unchanged, nav has Contribute + GitHub
- `docs/usage.html` — Usage active, content unchanged, nav has Contribute + GitHub
- `docs/contribute.html` — Contribute active (rust-colored), all sections render

- [ ] **Step 2: Test all links**

Verify these links work:
- "Star on GitHub" button on homepage → GitHub repo
- "How to Contribute" button on homepage → contribute.html
- "Share your experience" on Kumano Kodo card → contribute.html
- "Open an Issue" on contribute page → GitHub Issues new issue page
- "contributing guide" link on contribute page → CONTRIBUTING.md on GitHub
- GitHub nav link on every page → GitHub repo
- "Contribute" nav link on every page → contribute.html

- [ ] **Step 3: Test mobile responsiveness**

Resize browser to <600px width and verify on each page:
- Nav stacks vertically (links column, GitHub link below)
- Hero stats wrap (2x2 grid or single column)
- CTA buttons stack vertically
- Route cards remain single column (already are)
- Contribute page steps remain readable
- Need tags wrap naturally

- [ ] **Step 4: Run data validation**

Run: `npm run validate`
Expected: All data files pass validation (docs changes should not affect data validation, but confirm nothing was accidentally modified).
