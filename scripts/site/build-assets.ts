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

export function buildAssets(root: string): {
  glyphs: number;
  profiles: number;
  sparklines: number;
  gpx: number;
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

  return { glyphs: glyphs.length, profiles, sparklines, gpx };
}

function main(): void {
  const counts = buildAssets(ROOT);
  console.log(
    `Wrote ${counts.glyphs} glyph(s), ${counts.profiles} profile(s), ` +
      `${counts.sparklines} sparkline(s), ${counts.gpx} GPX track(s)`,
  );
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
