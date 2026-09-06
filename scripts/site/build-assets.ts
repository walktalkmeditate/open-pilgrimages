import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { byCodepoint, resolveInvokedPath } from "../cli.js";
import { GLYPH_BOX, glyphFrom } from "./glyphs.js";
import { gpxFrom, type GpxMeta } from "./gpx.js";
import { profileSvg, stagesOf } from "./profiles.js";
import { sparklineSvg, trendOf } from "./sparklines.js";

const ROOT = join(import.meta.dirname, "..", "..");

// The coastal variant has no detail page of its own — see check-site.ts's
// COASTAL_VARIANT_ASSET_ID — so its GPX <link> points at the parent Camino
// Portugués page, where its content actually lives on the site.
const COASTAL_VARIANT_KEY = "camino-portugues-coastal";
const COASTAL_VARIANT_PARENT_ID = "camino-portugues";

interface Target {
  key: string;
  dir: string;
}

/** Every top-level route, plus the coastal variant, which is a full route. */
export function targets(root: string): Target[] {
  const routesDir = join(root, "routes");
  const list: Target[] = [];

  for (const entry of readdirSync(routesDir)) {
    const dir = join(routesDir, entry);
    if (!statSync(dir).isDirectory()) continue;
    if (!existsSync(join(dir, "metadata.json"))) continue;
    list.push({ key: entry, dir });
  }

  const coastal = join(routesDir, "camino-portugues", "variants", "coastal");
  if (existsSync(join(coastal, "route.geojson"))) {
    list.push({ key: "camino-portugues-coastal", dir: coastal });
  }

  // Sorted so glyphs.js is byte-stable regardless of filesystem ordering.
  return list.sort((a, b) => byCodepoint(a.key, b.key));
}

export function readJson(path: string): unknown | null {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;
}

interface MetadataLike {
  name?: { en?: string };
  description?: { en?: string };
}

function gpxMetaFor(key: string, meta: MetadataLike | null): GpxMeta {
  return {
    id: key === COASTAL_VARIANT_KEY ? COASTAL_VARIANT_PARENT_ID : key,
    name: meta?.name?.en ?? "",
    description: meta?.description?.en ?? "",
  };
}

/** Inline SVG from the generators has no xmlns; standalone files need one. */
function standalone(svg: string): string {
  return svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ') + "\n";
}

function glyphSvg(d: string): string {
  const s = GLYPH_BOX.size;
  return standalone(
    `<svg viewBox="0 0 ${s} ${s}" fill="none" stroke="currentColor" stroke-width="1.9"` +
      ` stroke-linecap="round" stroke-linejoin="round">` +
      `<path pathLength="1" d="${d}"/></svg>`,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pilgrimagePage(
  id: string,
  name: string,
  description: string,
  intro: string,
  items: string,
): string {
  const safeName = escapeHtml(name);
  const safeDescription = escapeHtml(description);
  const safeIntro = escapeHtml(intro);
  const titleTag = `${safeName} &mdash; Open Pilgrimages`;
  const canonicalUrl = `https://open.pilgrimag.es/${id}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${titleTag}</title>
  <meta name="description" content="${safeDescription}">
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${titleTag}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="https://open.pilgrimag.es/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${titleTag}">
  <meta name="twitter:image" content="https://open.pilgrimag.es/og-image.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Lato:wght@400;700&display=swap" rel="stylesheet">
  <script>document.documentElement.classList.add("js");try{var t=localStorage.getItem("op-theme");if(t)document.documentElement.setAttribute("data-theme",t);}catch(e){}</script>
  <link rel="stylesheet" href="styles.css">
  <script src="hero.js" defer></script>
</head>
<body>
  <div class="container">
    <nav>
      <div class="nav-links">
        <a href="/">Home</a>
        <a href="/routes" class="active">Routes</a>
        <a href="/schema">Schema</a>
        <a href="/usage">Usage</a>
        <a href="/contribute" class="nav-contribute">Contribute</a>
      </div>
      <div class="nav-actions">
        <button type="button" class="theme-toggle" aria-label="Toggle colour theme" aria-pressed="false">
          <svg class="icon-moon" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9.3A5.8 5.8 0 0 1 6.7 2a6 6 0 1 0 7.3 7.3z"/></svg>
          <svg class="icon-sun" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3.1"/><path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2L3.1 3.1"/></svg>
        </button>
        <a href="https://github.com/walktalkmeditate/open-pilgrimages" class="nav-github" aria-label="View this project on GitHub">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        </a>
      </div>
    </nav>

    <h1>${safeName}</h1>
    <p class="subtitle">${safeIntro}</p>
    <ul>
${items}
    </ul>

    <footer>
      <p>Part of the <a href="https://pilgrimapp.org">Pilgrim</a> ecosystem. <a href="https://github.com/walktalkmeditate/open-pilgrimages">GitHub</a></p>
    </footer>
  </div>
</body>
</html>
`;
}

/**
 * A pilgrimage has no geometry of its own, so unlike a section page there is
 * nothing here to hand-author: the page is the list of its sections, and it
 * keeps open.pilgrimag.es/<pilgrimage-id> resolving once that id is no longer
 * a route.
 */
export function buildPilgrimagePages(root: string): string[] {
  const index = JSON.parse(readFileSync(join(root, "index.json"), "utf8")) as {
    pilgrimages?: { id: string; name: Record<string, string>; kind: string; sections: string[] }[];
    routes: { id: string; name: Record<string, string>; distanceKm?: number }[];
  };
  const written: string[] = [];

  for (const pilgrimage of index.pilgrimages ?? []) {
    const sections = pilgrimage.sections
      .map((id) => index.routes.find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined);
    const items = sections
      .map(
        (s) =>
          `      <li><a href="/${s.id}">${escapeHtml(s.name.en)}</a> — ${s.distanceKm ?? 0} km</li>`,
      )
      .join("\n");

    // Five same-weight links say nothing about how they relate. The kind is
    // the only thing that distinguishes a set of choices from a sequence, so
    // it is what the page opens with and what its description is built from.
    const name = pilgrimage.name.en;
    const sectionNames = sections.map((s) => s.name.en).join(", ");
    const intro =
      pilgrimage.kind === "legs"
        ? "The sections below are walked in sequence, each beginning where the one before it ends."
        : "Each section below is its own way to the same destination. Walk one, not all of them.";
    const description =
      pilgrimage.kind === "legs"
        ? `${name}: ${sections.length} sections walked in sequence — ${sectionNames}. Route geometry, stages, and statistics for each.`
        : `${name}: ${sections.length} alternative ways to the same destination — ${sectionNames}. Route geometry, stages, and statistics for each.`;

    const path = join(root, "docs", `${pilgrimage.id}.html`);
    writeFileSync(path, pilgrimagePage(pilgrimage.id, name, description, intro, items));
    written.push(path);
  }

  return written;
}

export function buildAssets(root: string): {
  glyphs: number;
  profiles: number;
  sparklines: number;
  gpx: number;
  pilgrimagePages: number;
} {
  const out = join(root, "docs", "assets");
  for (const sub of ["routes", "profiles", "sparklines"]) {
    mkdirSync(join(out, sub), { recursive: true });
  }

  const glyphs: Array<[string, string]> = [];
  let profiles = 0;
  let sparklines = 0;
  let gpx = 0;

  for (const { key, dir } of targets(root)) {
    // Metadata-only stubs have no geometry, and not every route has stats.
    // Missing inputs are skipped, never thrown on.
    const geo = readJson(join(dir, "route.geojson"));
    if (geo) {
      const { d } = glyphFrom(geo);
      glyphs.push([key, d]);
      writeFileSync(join(out, "routes", `${key}.svg`), glyphSvg(d));

      const meta = readJson(join(dir, "metadata.json")) as MetadataLike | null;
      const gpxXml = gpxFrom(geo, gpxMetaFor(key, meta));
      if (gpxXml) {
        writeFileSync(join(dir, "route.gpx"), gpxXml);
        gpx++;
      }
    }

    const stages = readJson(join(dir, "stages.json"));
    if (stages) {
      const svg = profileSvg(stagesOf(stages));
      if (svg) {
        writeFileSync(join(out, "profiles", `${key}.svg`), standalone(svg));
        profiles++;
      }
    }

    const stats = readJson(join(dir, "stats.json"));
    if (stats) {
      const svg = sparklineSvg(trendOf(stats));
      if (svg) {
        writeFileSync(join(out, "sparklines", `${key}.svg`), standalone(svg));
        sparklines++;
      }
    }
  }

  const body = glyphs
    .map(([key, d]) => `  ${JSON.stringify(key)}: ${JSON.stringify(d)}`)
    .join(",\n");
  writeFileSync(join(out, "glyphs.js"), `window.OP_GLYPHS = {\n${body}\n};\n`);

  const pilgrimagePages = buildPilgrimagePages(root).length;

  return { glyphs: glyphs.length, profiles, sparklines, gpx, pilgrimagePages };
}

function main(): void {
  const counts = buildAssets(ROOT);
  console.log(
    `Wrote ${counts.glyphs} glyph(s), ${counts.profiles} profile(s), ` +
      `${counts.sparklines} sparkline(s), ${counts.gpx} GPX track(s), ` +
      `${counts.pilgrimagePages} pilgrimage page(s)`,
  );
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
