import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildAssets, buildPilgrimagePages } from "./build-assets.js";

const ROOT = join(import.meta.dirname, "..", "..");
const ASSETS = join(ROOT, "docs", "assets");

const IDS = [
  "camino-frances", "camino-ingles", "camino-norte", "camino-portugues",
  "camino-primitivo", "kumano-kodo", "shikoku-88", "camino-portugues-coastal",
];

test("buildAssets writes a glyph for every route and the coastal variant", () => {
  const counts = buildAssets(ROOT);
  assert.equal(counts.glyphs, 8);

  const glyphs = readFileSync(join(ASSETS, "glyphs.js"), "utf-8");
  for (const id of IDS) {
    assert.ok(glyphs.includes(`"${id}"`), `glyphs.js missing ${id}`);
    assert.ok(existsSync(join(ASSETS, "routes", `${id}.svg`)), `missing ${id}.svg`);
  }
});

test("glyphs.js assigns to window.OP_GLYPHS and parses as a script", () => {
  buildAssets(ROOT);
  const source = readFileSync(join(ASSETS, "glyphs.js"), "utf-8");

  assert.match(source, /^window\.OP_GLYPHS = \{/);
  assert.equal(source.includes("NaN"), false);

  // Executing it must define exactly the eight expected keys.
  const fakeWindow: Record<string, unknown> = {};
  new Function("window", source)(fakeWindow);

  const glyphMap = fakeWindow.OP_GLYPHS as Record<string, string>;
  assert.deepEqual(Object.keys(glyphMap).sort(), [...IDS].sort());
  for (const id of IDS) {
    assert.match(glyphMap[id], /^M[\d.]/, `${id} path data is malformed`);
  }
});

test("buildAssets is idempotent", () => {
  buildAssets(ROOT);
  const first = readFileSync(join(ASSETS, "glyphs.js"), "utf-8");
  buildAssets(ROOT);
  const second = readFileSync(join(ASSETS, "glyphs.js"), "utf-8");

  assert.equal(first, second);
});

test("every route with stats gets a sparkline and every route a profile", () => {
  const counts = buildAssets(ROOT);

  assert.equal(counts.profiles >= 7, true);
  assert.equal(counts.sparklines >= 7, true);
  assert.ok(existsSync(join(ASSETS, "profiles", "camino-primitivo.svg")));
  assert.ok(existsSync(join(ASSETS, "sparklines", "camino-frances.svg")));
});

test("a page is written for each pilgrimage, listing its sections in order", () => {
  const root = mkdtempSync(join(tmpdir(), "build-assets-test-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "index.json"),
      JSON.stringify({
        pilgrimages: [
          { id: "kumano-kodo", name: { en: "Kumano Kodō" }, kind: "alternatives", sections: ["kumano-kodo-nakahechi", "kumano-kodo-kohechi"] },
        ],
        routes: [
          { id: "kumano-kodo-nakahechi", name: { en: "Nakahechi" }, distanceKm: 70, pilgrimage: "kumano-kodo" },
          { id: "kumano-kodo-kohechi", name: { en: "Kohechi" }, distanceKm: 70, pilgrimage: "kumano-kodo" },
        ],
      }),
    );

    const written = buildPilgrimagePages(root);

    assert.deepEqual(written, [join(root, "docs", "kumano-kodo.html")]);
    const html = readFileSync(written[0], "utf8");
    assert.match(html, /Kumano Kodō/);
    assert.ok(
      html.indexOf('href="/kumano-kodo-nakahechi"') < html.indexOf('href="/kumano-kodo-kohechi"'),
      "sections appear in the order the index lists them",
    );
    // Pinned as a pair with the no-distance case below: without this, the
    // dash and the unit could drift out of the measured branch unnoticed.
    assert.match(html, /<li><a href="\/kumano-kodo-nakahechi">Nakahechi<\/a> — 70 km<\/li>/);
    // The kind is the only thing that tells a reader whether these two links
    // are choices or legs, so the page has to say which.
    assert.match(html, /Each section below is its own way to the same destination/);
    // No other route's metadata rides along in the head.
    assert.match(html, /<link rel="canonical" href="https:\/\/open\.pilgrimag\.es\/kumano-kodo">/);
    assert.equal(html.includes("camino-frances"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a section with no measured distance renders no distance at all", () => {
  const root = mkdtempSync(join(tmpdir(), "build-assets-test-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "index.json"),
      JSON.stringify({
        pilgrimages: [
          { id: "kumano-kodo", name: { en: "Kumano Kodō" }, kind: "alternatives", sections: ["kumano-kodo-nakahechi"] },
        ],
        routes: [
          { id: "kumano-kodo-nakahechi", name: { en: "Nakahechi" }, pilgrimage: "kumano-kodo" },
        ],
      }),
    );

    const written = buildPilgrimagePages(root);
    const html = readFileSync(written[0], "utf8");

    // Not measured yet reads as "no number", not as a measured zero.
    assert.equal(html.includes("0 km"), false);
    assert.match(html, /<li><a href="\/kumano-kodo-nakahechi">Nakahechi<\/a><\/li>/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no pilgrimages means no pages", () => {
  const root = mkdtempSync(join(tmpdir(), "build-assets-test-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "index.json"), JSON.stringify({ routes: [] }));
    assert.deepEqual(buildPilgrimagePages(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
