import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { GLYPH_BOX, glyphFrom } from "./glyphs.js";
import { profileSvg, stagesOf } from "./profiles.js";
import { sparklineSvg, trendOf } from "./sparklines.js";

const ROOT = join(import.meta.dirname, "..", "..");

interface Target {
  key: string;
  dir: string;
}

function byCodepoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Every top-level route, plus the coastal variant, which is a full route. */
function targets(root: string): Target[] {
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

function readJson(path: string): unknown | null {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;
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
} {
  const out = join(root, "docs", "assets");
  for (const sub of ["routes", "profiles", "sparklines"]) {
    mkdirSync(join(out, sub), { recursive: true });
  }

  const glyphs: Array<[string, string]> = [];
  let profiles = 0;
  let sparklines = 0;

  for (const { key, dir } of targets(root)) {
    // Metadata-only stubs have no geometry, and not every route has stats.
    // Missing inputs are skipped, never thrown on.
    const geo = readJson(join(dir, "route.geojson"));
    if (geo) {
      const { d } = glyphFrom(geo);
      glyphs.push([key, d]);
      writeFileSync(join(out, "routes", `${key}.svg`), glyphSvg(d));
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

  return { glyphs: glyphs.length, profiles, sparklines };
}

function main(): void {
  const counts = buildAssets(ROOT);
  console.log(
    `Wrote ${counts.glyphs} glyph(s), ${counts.profiles} profile(s), ` +
      `${counts.sparklines} sparkline(s)`,
  );
}

export function resolveInvokedPath(argv1: string | undefined): string | null {
  if (!argv1) return null;
  try {
    return realpathSync(argv1);
  } catch {
    return null;
  }
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
