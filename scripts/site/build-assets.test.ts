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

test("a legs pilgrimage reads as one walk cut into sections, not a set of choices", () => {
  const root = mkdtempSync(join(tmpdir(), "build-assets-test-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "index.json"),
      JSON.stringify({
        pilgrimages: [
          { id: "shikoku-88", name: { en: "Shikoku 88" }, kind: "legs", sections: ["awa", "tosa"] },
        ],
        routes: [
          { id: "awa", name: { en: "Awa" }, distanceKm: 190 },
          { id: "tosa", name: { en: "Tosa" }, distanceKm: 380 },
        ],
      }),
    );

    const html = readFileSync(buildPilgrimagePages(root)[0], "utf8");

    // #then the intro and the description both say sequence, and neither
    // offers the reader a choice of one section over the rest
    assert.match(
      html,
      /The sections below are walked in sequence, each beginning where the one before it ends\./,
    );
    assert.match(
      html,
      /<meta name="description" content="Shikoku 88: 2 sections walked in sequence — Awa, Tosa\. Route geometry, stages, and statistics for each\.">/,
    );
    assert.equal(html.includes("its own way to the same destination"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a kind the page has no copy for is refused, not rendered as alternatives", () => {
  const root = mkdtempSync(join(tmpdir(), "build-assets-test-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "index.json"),
      JSON.stringify({
        pilgrimages: [
          { id: "shikoku-88", name: { en: "Shikoku 88" }, kind: "loop", sections: ["awa"] },
        ],
        routes: [{ id: "awa", name: { en: "Awa" }, distanceKm: 190 }],
      }),
    );

    // #then it fails by name rather than telling a walker to pick one leg
    assert.throws(() => buildPilgrimagePages(root), /loop/);
    assert.equal(existsSync(join(root, "docs", "shikoku-88.html")), false);
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

test("a hostile section id cannot break out of the href it is written into", () => {
  const root = mkdtempSync(join(tmpdir(), "build-assets-test-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    // #given a section id and distance carrying markup — the id is a path
    // segment on the page, and nothing upstream of the template escapes it
    const hostileId = 'hostile" onmouseover="alert(1)';
    writeFileSync(
      join(root, "index.json"),
      JSON.stringify({
        pilgrimages: [
          { id: "kumano-kodo", name: { en: "Kumano Kodō" }, kind: "alternatives", sections: [hostileId] },
        ],
        routes: [{ id: hostileId, name: { en: "Section A" }, distanceKm: '1"><script>' }],
      }),
    );

    // #when the page is generated
    const html = readFileSync(buildPilgrimagePages(root)[0], "utf8");

    // #then both land as text inside the attribute they were written into,
    // opening no attribute and no element of their own
    assert.equal(html.includes('onmouseover="alert(1)"'), false);
    assert.match(html, /href="\/hostile&quot; onmouseover=&quot;alert\(1\)"/);
    assert.match(html, /— 1&quot;&gt;&lt;script&gt; km/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an apostrophe in a section name is escaped like every other delimiter", () => {
  const root = mkdtempSync(join(tmpdir(), "build-assets-test-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "index.json"),
      JSON.stringify({
        pilgrimages: [
          { id: "kumano-kodo", name: { en: "Pilgrim's Way" }, kind: "alternatives", sections: ["a"] },
        ],
        routes: [{ id: "a", name: { en: "Saint's Path" }, distanceKm: 1 }],
      }),
    );

    const html = readFileSync(buildPilgrimagePages(root)[0], "utf8");

    // Every interpolation sits in a double-quoted attribute or element text
    // today, so this changes nothing that renders — it is what keeps the
    // escaping honest the day a single-quoted attribute joins the template.
    assert.equal(html.includes("Saint's Path"), false);
    assert.match(html, /Saint&#39;s Path/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pilgrimage id that is not a bare slug never becomes a path", () => {
  const root = mkdtempSync(join(tmpdir(), "build-assets-test-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "index.json"),
      JSON.stringify({
        pilgrimages: [
          { id: "../pwned", name: { en: "Pwned" }, kind: "alternatives", sections: [] },
        ],
        routes: [],
      }),
    );

    // #when / #then the generator refuses the id by name, and writes nothing
    // outside docs/
    assert.throws(() => buildPilgrimagePages(root), /\.\.\/pwned/);
    assert.equal(existsSync(join(root, "pwned.html")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a page the generator did not write is refused, not overwritten", () => {
  const root = mkdtempSync(join(tmpdir(), "build-assets-test-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    // docs/kumano-kodo.html is hand-authored today and kumano-kodo becomes a
    // pilgrimage id in a later PR — the exact collision this guards.
    const handAuthored = "<!DOCTYPE html>\n<html><body>hand-authored</body></html>\n";
    writeFileSync(join(root, "docs", "kumano-kodo.html"), handAuthored);
    writeFileSync(
      join(root, "index.json"),
      JSON.stringify({
        pilgrimages: [
          { id: "kumano-kodo", name: { en: "Kumano Kodō" }, kind: "alternatives", sections: ["nakahechi"] },
        ],
        routes: [{ id: "nakahechi", name: { en: "Nakahechi" }, distanceKm: 70 }],
      }),
    );

    assert.throws(() => buildPilgrimagePages(root), /kumano-kodo/);
    assert.equal(readFileSync(join(root, "docs", "kumano-kodo.html"), "utf8"), handAuthored);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a page this generator wrote is regenerated over itself", () => {
  const root = mkdtempSync(join(tmpdir(), "build-assets-test-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "index.json"),
      JSON.stringify({
        pilgrimages: [
          { id: "kumano-kodo", name: { en: "Kumano Kodō" }, kind: "alternatives", sections: ["nakahechi"] },
        ],
        routes: [{ id: "nakahechi", name: { en: "Nakahechi" }, distanceKm: 70 }],
      }),
    );

    const first = readFileSync(buildPilgrimagePages(root)[0], "utf8");
    const second = readFileSync(buildPilgrimagePages(root)[0], "utf8");

    assert.equal(first, second);
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
