import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildAssets, buildPilgrimagePages } from "./build-assets.js";

const REPO = join(import.meta.dirname, "..", "..");

/**
 * buildAssets writes docs/assets/**, docs/<pilgrimage>.html and — the one that
 * makes this more than an untidiness — routes/<id>/route.gpx. Handed the
 * repository, `npm test` regenerates committed dataset files: a stale
 * committed tree is silently repaired by running the tests, and the check that
 * would have reported it (CI's regeneration diff) never sees anything to
 * report. Every other test in this file already raises its own root with
 * mkdtempSync; these need real routes to assert against, so they get a mirror
 * of the repository rather than the repository.
 */
const ROOT = mkdtempSync(join(tmpdir(), "build-assets-mirror-"));
cpSync(join(REPO, "routes"), join(ROOT, "routes"), { recursive: true });
cpSync(join(REPO, "docs"), join(ROOT, "docs"), { recursive: true });
cpSync(join(REPO, "index.json"), join(ROOT, "index.json"));

const ASSETS = join(ROOT, "docs", "assets");

/**
 * The tripwire for the mirror above. A build pointed back at the repository
 * rewrites these two files — glyphs.js unconditionally, route.gpx for every
 * route with geometry — and the rewrite is invisible to `git status` whenever
 * the bytes come out identical, which is the ordinary case and the reason this
 * went unnoticed. Timestamps see it anyway.
 */
const REPO_WRITE_TRIPWIRES = ["docs/assets/glyphs.js", "routes/camino-ingles/route.gpx"];
const untouchedSince = REPO_WRITE_TRIPWIRES.map((path) => statSync(join(REPO, path)).mtimeMs);

after(() => {
  rmSync(ROOT, { recursive: true, force: true });
  REPO_WRITE_TRIPWIRES.forEach((path, i) => {
    assert.equal(
      statSync(join(REPO, path)).mtimeMs,
      untouchedSince[i],
      `${path} was rewritten while the tests ran — a buildAssets call is pointed at the repository, not at the mirror`,
    );
  });
});

// Every route that has a route.geojson, plus the coastal variant. The Iseji
// and the Ōhechi are absent, shipping metadata-only.
const IDS = [
  "camino-frances", "camino-ingles", "camino-norte", "camino-portugues",
  "camino-primitivo", "kumano-kodo-kohechi", "kumano-kodo-nakahechi",
  "shikoku-88-awa", "shikoku-88-iyo", "shikoku-88-sanuki", "shikoku-88-tosa",
  "camino-portugues-coastal",
];

test("buildAssets writes a glyph for every route and the coastal variant", () => {
  const counts = buildAssets(ROOT);
  assert.equal(counts.glyphs, 12);

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

  // Executing it must define exactly the expected keys and no others.
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

test("every route with stats gets a sparkline, and every route with elevation a profile", () => {
  const counts = buildAssets(ROOT);

  assert.equal(counts.profiles >= 7, true);
  assert.equal(counts.sparklines >= 7, true);
  assert.ok(existsSync(join(ASSETS, "profiles", "camino-primitivo.svg")));
  assert.ok(existsSync(join(ASSETS, "sparklines", "camino-frances.svg")));

  // The four dōjō have stages.json and no elevation in it, so profileSvg
  // returns "" and no file is written — see its own comment. A profile here
  // would be the flat "high point 1 m" one this replaced.
  for (const dojo of ["awa", "tosa", "iyo", "sanuki"]) {
    assert.equal(
      existsSync(join(ASSETS, "profiles", `shikoku-88-${dojo}.svg`)),
      false,
      `shikoku-88-${dojo} should have no elevation profile`,
    );
  }
});

/**
 * A sparkline is keyed by the id of the thing it describes, and the page it is
 * inlined into is that id's page — so a whole-circuit series drawn under
 * `shikoku-88-awa` would tell a reader of the Awa page that 1,622 people
 * finished Awa. Nobody has ever finished Awa: the Omotenashi Network issues one
 * certificate for the circuit. The four dōjō carry the series in their
 * `pilgrimage.stats` block and no `stats.json`, and this is the shape that keeps
 * `build-assets` from drawing it four times over.
 *
 * The pilgrimage's own page is where such a figure would belong, and it does not
 * render one today. `sparklineSvg` now reads its own verb off the data, so the
 * falling series would be labelled correctly; its noun would not. "Pilgrims per
 * year" is right for the six arrival series and wrong for a count of completed
 * circuits, and `trendOf` discards which key it read the series from, so the
 * noun has to come from whoever builds that page.
 */
test("a section carrying pilgrimage-level stats gets no sparkline of its own", () => {
  buildAssets(ROOT);

  for (const dojo of ["awa", "tosa", "iyo", "sanuki"]) {
    const id = `shikoku-88-${dojo}`;
    assert.equal(existsSync(join(ROOT, "routes", id, "stats.json")), false, `${id} stats.json`);
    assert.equal(existsSync(join(ASSETS, "sparklines", `${id}.svg`)), false, `${id} sparkline`);
  }
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

test("a generated page carries the OSM attribution every OSM-derived page carries", () => {
  const root = mkdtempSync(join(tmpdir(), "build-assets-test-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "index.json"),
      JSON.stringify({
        pilgrimages: [
          { id: "kumano-kodo", name: { en: "Kumano Kodō" }, kind: "alternatives", sections: ["a"] },
        ],
        routes: [{ id: "a", name: { en: "Nakahechi" }, distanceKm: 70 }],
      }),
    );

    const html = readFileSync(buildPilgrimagePages(root)[0], "utf8");

    // #then the ODbL notice and the contributors credit are both on the page —
    // it lists distances derived from OpenStreetMap, so it owes the same
    // attribution as every hand-authored page that does
    assert.match(html, /<div class="attribution">/);
    assert.match(
      html,
      /Contains information from OpenStreetMap, which is made available under the ODbL by the OpenStreetMap Foundation\./,
    );
    assert.match(
      html,
      /<a href="https:\/\/www\.openstreetmap\.org\/copyright">OpenStreetMap contributors<\/a>/,
    );
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
    // The collision this guards is a real one: docs/kumano-kodo.html was
    // hand-authored, and kumano-kodo is becoming a pilgrimage id — which is
    // why that page moved to docs/kumano-kodo-nakahechi.html first.
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

test("a section name with an accent is written as a named entity", () => {
  const root = mkdtempSync(join(tmpdir(), "build-assets-test-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(
      join(root, "index.json"),
      JSON.stringify({
        pilgrimages: [
          { id: "p", name: { en: "P" }, kind: "alternatives", sections: ["a"] },
        ],
        routes: [{ id: "a", name: { en: "Camino Inglés" }, distanceKm: 112 }],
      }),
    );

    const html = readFileSync(buildPilgrimagePages(root)[0], "utf8");

    // #then the entity form the hand-authored pages use, not the raw codepoint
    assert.match(html, /Camino Ingl&eacute;s/);
    assert.equal(html.includes("Camino Inglés"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
