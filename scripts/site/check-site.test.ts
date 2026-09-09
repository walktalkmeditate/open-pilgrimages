import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { checkSite } from "./check-site.js";
import { hashRouteGeometry } from "./roads.js";

const ROOT = join(import.meta.dirname, "..", "..");

interface FixtureVariant {
  id: string;
  distanceKm: number;
}

interface FixtureRoute {
  id: string;
  distanceKm?: number;
  variants?: FixtureVariant[];
  pilgrimage?: string;
  ways?: Record<string, unknown>;
}

function createFixtureRoot(
  indexRoutes: FixtureRoute[],
  indexExtras: Record<string, unknown> = {},
): string {
  const root = mkdtempSync(join(tmpdir(), "check-site-test-"));
  mkdirSync(join(root, "routes"));
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(
    join(root, "index.json"),
    JSON.stringify({ routes: indexRoutes, ...indexExtras }),
  );
  return root;
}

// Some pages have not been rebuilt yet (that's Tasks 10-13), so the guard is
// expected to report real problems against the committed docs/ and
// README.md today. These tests pin down exactly which ones, so the guard's
// own regression suite doesn't depend on npm run check-site's exit code.

test("the committed docs/routes.html already links to every route (positive control)", () => {
  // #given docs/routes.html was rebuilt in Task 11 to link to every route's detail page
  // #when checkSite compares it against index.json's route list
  const problems = checkSite(ROOT);

  // #then none of the seven routes are reported as missing a catalog link
  assert.deepEqual(
    problems.filter((p) => p.file === "docs/routes.html" && p.message.includes("has no link to")),
    [],
  );
});

test("the committed docs/routes.html already uses extensionless internal links (positive control)", () => {
  // #given docs/routes.html was rebuilt in Task 11 with extensionless nav/canonical/OG links
  // #when / #then checkSite reports no .html-extension problems for that file
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.file === "docs/routes.html" && p.message.includes(".html")),
    [],
  );
});

test("checkSite reports a route missing from the catalog (synthetic routesHtml)", () => {
  const problems = checkSite(ROOT, {
    routesHtml: "<html>only camino-frances lives here</html>",
  });
  assert.ok(problems.some((p) => p.message.includes("shikoku-88")));
});

test("the committed docs/index.html hero stats already match computed totals (positive control)", () => {
  // #given docs/index.html was rebuilt in Task 10 to render the live totals
  // #when checkSite compares it against computeStats' current totals
  const problems = checkSite(ROOT);
  const heroProblems = problems.filter(
    (p) => p.file === "docs/index.html" && p.message.startsWith("hero stat"),
  );

  // #then none of the four hero fields are flagged
  assert.deepEqual(heroProblems, []);
});

test("checkSite reports a stale hero number (synthetic indexHtml)", () => {
  const problems = checkSite(ROOT, {
    indexHtml: `<span class="stat-number">3</span><span class="stat-label">Routes</span>`,
  });
  assert.ok(problems.some((p) => p.message.includes("Routes")));
});

test("the committed docs/ already has a detail page for every route (positive control)", () => {
  // #given all seven detail pages were built in Task 12
  // #when checkSite checks index.json's route list against docs/{id}.html
  const problems = checkSite(ROOT);

  // #then none of the seven routes are reported as missing or unidentified
  assert.deepEqual(
    problems.filter((p) => p.message.includes("no detail page") || p.message.includes("does not identify itself")),
    [],
  );
});

test("checkSite reports a route missing its detail page (fixture)", () => {
  // #given an index.json listing a route with no corresponding docs/{id}.html
  const root = createFixtureRoot([{ id: "camino-frances" }]);

  try {
    // #when / #then checkSite reports it as missing a detail page
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) => p.file === "docs/camino-frances.html" && p.message.includes("no detail page"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a detail page that exists but doesn't identify its own route (fixture)", () => {
  // #given a docs/{id}.html that exists but never mentions its own route id
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  writeFileSync(join(root, "docs", "camino-frances.html"), "<html><body>placeholder</body></html>");

  try {
    // #when checkSite checks that detail page
    const problems = checkSite(root);
    const detailProblems = problems.filter((p) => p.file === "docs/camino-frances.html");

    // #then it is reported as unidentified, and distinctly from a missing page
    assert.ok(
      detailProblems.some((p) => p.message.includes("does not identify itself")),
      "expected a problem about the page not identifying its route",
    );
    assert.ok(
      !detailProblems.some((p) => p.message.includes("has no detail page")),
      "a page that exists on disk should not also be reported as missing",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts a detail page that identifies its own route via <code>", () => {
  // #given a docs/{id}.html containing <code>{id}</code>, matching how routes.html
  // already renders route IDs today, plus a route.gpx link and a roads
  // corridor reference so the unrelated gpx-discoverability and
  // roads-page-reference guards don't also fire here. The linked route.gpx
  // must actually exist on disk too, or the CDN link guard reports it. The
  // route.geojson is what makes those two guards run at all: both are now
  // scoped to routes that have geometry, so without it this fixture would
  // pass by exemption and prove nothing about the link or the <img>.
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "routes", "camino-frances"), { recursive: true });
  writeFileSync(
    join(root, "routes", "camino-frances", "route.geojson"),
    JSON.stringify({ type: "FeatureCollection", features: [] }),
  );
  writeFileSync(join(root, "routes", "camino-frances", "route.gpx"), "<gpx></gpx>");
  writeFileSync(
    join(root, "docs", "camino-frances.html"),
    '<html><body><code>camino-frances</code>' +
      '<a href="https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-frances/route.gpx">route.gpx</a>' +
      '<img class="route-hero-roads" src="assets/roads/camino-frances.svg" alt="">' +
      "</body></html>",
  );

  try {
    // #when / #then checkSite reports no problem for this detail page
    const problems = checkSite(root);
    assert.deepEqual(
      problems.filter((p) => p.file === "docs/camino-frances.html"),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Spec §4.3: a section whose relation is absent, or whose way graph is
// discontinuous, ships metadata-only with no route.geojson at all — a
// section with no geometry, not merely a route awaiting a rebuild.
// build-assets.ts already skips writing a glyph, GPX track, or roads
// corridor for exactly this shape (see its own "missing inputs are
// skipped" comment); check-site must agree, or a section that can never
// honestly produce those files would fail forever. The three tests below
// are the whole boundary: the declared section is exempt, the undeclared
// one is not, and a section with real geometry is not.
const OHECHI_METADATA_ONLY = JSON.stringify({
  metadataOnly: "OpenStreetMap holds no route relation for the Ōhechi at all.",
});

test("checkSite does not require route.gpx, a glyph, or a roads corridor SVG for a section that declares itself metadata-only (fixture)", () => {
  // #given a section with no route.geojson that says so in its own metadata.json
  const root = createFixtureRoot([{ id: "kumano-kodo-ohechi" }]);
  mkdirSync(join(root, "routes", "kumano-kodo-ohechi"), { recursive: true });
  writeFileSync(join(root, "routes", "kumano-kodo-ohechi", "metadata.json"), OHECHI_METADATA_ONLY);
  writeFileSync(
    join(root, "docs", "kumano-kodo-ohechi.html"),
    "<html><body><code>kumano-kodo-ohechi</code></body></html>",
  );

  try {
    // #when checkSite runs over it
    const problems = checkSite(root);
    // Scoped to this route's own files/messages: checkSite always runs the
    // unconditional checkRoadsAsset call for the coastal variant too, which
    // has nothing to do with this route and would otherwise be mistaken for
    // a leak of the exemption below.
    const own = problems.filter(
      (p) => p.file.includes("kumano-kodo-ohechi") || p.message.includes("kumano-kodo-ohechi"),
    );
    const messages = own.map((p) => p.message);

    // #then none of the five geometry-derived files are demanded of it
    assert.ok(!messages.some((m) => m.includes("has no route.gpx")));
    assert.ok(!messages.some((m) => m.includes("has no link to its route.gpx")));
    assert.ok(!messages.some((m) => m.includes("has no generated glyph")));
    assert.ok(!messages.some((m) => m.includes("has no roads corridor SVG")));
    assert.ok(!messages.some((m) => m.includes("has no reference to its roads corridor SVG")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The exemption is granted against the declaration, never against the
// absence of route.geojson on its own. A new section cut without running
// npm run fetch-osm has exactly the same files on disk as the Ōhechi, and
// used to inherit its exemption in silence — no glyph, no GPX, no roads
// corridor, and not one problem reported.
test("checkSite still demands the geometry-derived files of a section with no route.geojson that declares nothing (fixture)", () => {
  // #given the same fixture as above with the metadataOnly declaration removed
  const root = createFixtureRoot([{ id: "kumano-kodo-ohechi" }]);
  mkdirSync(join(root, "routes", "kumano-kodo-ohechi"), { recursive: true });
  writeFileSync(join(root, "routes", "kumano-kodo-ohechi", "metadata.json"), JSON.stringify({}));
  writeFileSync(
    join(root, "docs", "kumano-kodo-ohechi.html"),
    "<html><body><code>kumano-kodo-ohechi</code></body></html>",
  );

  try {
    // #when checkSite runs over it
    const messages = checkSite(root)
      .filter((p) => p.file.includes("kumano-kodo-ohechi") || p.message.includes("kumano-kodo-ohechi"))
      .map((p) => p.message);

    // #then every one of the five is reported again
    assert.ok(messages.some((m) => m.includes("has no route.gpx")));
    assert.ok(messages.some((m) => m.includes("has no link to its route.gpx")));
    assert.ok(messages.some((m) => m.includes("has no generated glyph")));
    assert.ok(messages.some((m) => m.includes("has no roads corridor SVG")));
    assert.ok(messages.some((m) => m.includes("has no reference to its roads corridor SVG")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The exemption is also scoped to routes with no route.geojson — not to
// every route, or a real section's rebuild-pending assets would go
// unpoliced too.
test("checkSite still requires route.gpx for a route that has its own route.geojson (fixture)", () => {
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "routes", "camino-frances"), { recursive: true });
  writeFileSync(
    join(root, "routes", "camino-frances", "route.geojson"),
    JSON.stringify({ type: "FeatureCollection", features: [] }),
  );

  try {
    const problems = checkSite(root);
    assert.ok(problems.some((p) => p.message.includes("has no route.gpx")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The glyph gate is the one geometry-scoped check with no negative test:
// changing `!isMetadataOnly &&` to `false &&` on it would break nothing.
test("checkSite reports a route with its own route.geojson and no glyphs.js entry (fixture)", () => {
  // #given a route with real geometry, and a glyphs.js that never names it
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "routes", "camino-frances"), { recursive: true });
  writeFileSync(
    join(root, "routes", "camino-frances", "route.geojson"),
    JSON.stringify({ type: "FeatureCollection", features: [] }),
  );
  mkdirSync(join(root, "docs", "assets"), { recursive: true });
  writeFileSync(join(root, "docs", "assets", "glyphs.js"), "window.OP_GLYPHS = {\n};\n");

  try {
    // #when / #then the missing glyph is reported against glyphs.js
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === "docs/assets/glyphs.js" && p.message.includes("has no generated glyph"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed docs/index.html already uses extensionless internal links (positive control)", () => {
  // #given docs/index.html was rebuilt in Task 10 with extensionless nav/canonical/OG links
  // #when / #then checkSite reports no .html-extension problems for that file
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.file === "docs/index.html" && p.message.includes(".html")),
    [],
  );
});

test("checkSite reports an internal link that kept its .html extension (synthetic indexHtml)", () => {
  const problems = checkSite(ROOT, {
    indexHtml: `<a href="routes.html">Routes</a>`,
  });
  assert.ok(problems.some((p) => p.message.includes(".html")));
});

test("checkSite ignores external links and anchors when checking for .html extensions", () => {
  const problems = checkSite(ROOT, {
    indexHtml: `<a href="https://github.com/example/example.html">GitHub</a><a href="#section.html">Jump</a>`,
  });
  assert.ok(
    !problems.some((p) => p.message.includes("github.com") || p.message.includes("#section")),
  );
});

test("checkSite reports a route missing from README.md (synthetic readmeMd)", () => {
  const problems = checkSite(ROOT, {
    readmeMd: "# Open Pilgrimages\n\nNo route table here.",
  });
  assert.ok(
    problems.some(
      (p) => p.file === "README.md" && p.message.includes("camino-frances"),
    ),
  );
});

// Reproduces a real false negative a reviewer found: the README's coastal-variant
// row links to routes/camino-portugues/variants/coastal/, which contains the
// substring "camino-portugues". A plain .includes(id) check would treat that as
// proof the main camino-portugues route is documented, even with its own row —
// and its only link to routes/camino-portugues/ — deleted entirely.
test("checkSite reports camino-portugues missing from README when only its coastal variant row remains", () => {
  // #given a README table with every route's own link except camino-portugues',
  // whose only remaining trace is the coastal variant's URL containing it as a substring
  const readmeMd = `# Open Pilgrimages

159,624 GPS points. 12,576 waypoints. 109 stages. 7 routes across 3 traditions.

| Route | Distance |
|-------|----------|
| [Camino Frances](routes/camino-frances/) | 764 km |
| [Camino del Norte](routes/camino-norte/) | 784 km |
| [Camino Primitivo](routes/camino-primitivo/) | 263 km |
| [Camino Portugués da Costa (Coastal)](routes/camino-portugues/variants/coastal/) | 110 km |
| [Camino Inglés](routes/camino-ingles/) | 112 km |
| [Shikoku 88](routes/shikoku-88/) | 1,200 km |
| [Kumano Kodo](routes/kumano-kodo-nakahechi/) | 39-170 km |
`;

  // #when checkSite checks route coverage against this README
  const problems = checkSite(ROOT, { readmeMd });

  // #then camino-portugues is still reported as missing its own link, proving the
  // check requires an actual link to routes/camino-portugues/, not just the substring
  assert.ok(
    problems.some(
      (p) =>
        p.file === "README.md" &&
        p.message.includes('"camino-portugues"') &&
        p.message.includes("routes/camino-portugues/"),
    ),
    'expected a problem naming "camino-portugues" as missing its own link despite the coastal row substring match',
  );
});

// Same false-negative shape as the README case above, reproduced against
// docs/routes.html: a link to a future camino-portugues-coastal detail page
// contains "camino-portugues" as a substring of its href.
test("checkSite reports camino-portugues missing from routes.html when only a coastal-variant link is present", () => {
  const problems = checkSite(ROOT, {
    routesHtml: `<a href="/camino-portugues-coastal">Camino Portugués da Costa</a>`,
  });
  assert.ok(
    problems.some(
      (p) =>
        p.file === "docs/routes.html" &&
        p.message.includes('"camino-portugues"') &&
        p.message.includes("/camino-portugues"),
    ),
    'expected a problem naming "camino-portugues" as missing its own link despite the coastal href substring match',
  );
});

test("the committed README already lists every route with a real link, and its totals line matches computed stats (positive control)", () => {
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.file === "README.md"),
    [],
  );
});

test("checkSite reports a stale README totals number against computed stats (synthetic readmeMd)", () => {
  // #given a README totals line whose route count (3) no longer matches the data (7)
  const readmeMd = "159,624 GPS points. 12,576 waypoints. 109 stages. 3 routes across 3 traditions.";

  // #when checkSite checks the totals line against computeStats
  const problems = checkSite(ROOT, { readmeMd });

  // #then the mismatched field is reported with both the rendered and computed value
  assert.ok(
    problems.some(
      (p) =>
        p.file === "README.md" &&
        p.message.includes('"routes"') &&
        p.message.includes("reads 3") &&
        p.message.includes("data says"),
    ),
  );
});

test("checkSite reports a missing README totals line rather than silently skipping it", () => {
  // #given a README with no totals line in the expected format at all
  const readmeMd = "# Open Pilgrimages\n\nNo totals line here.";

  // #when checkSite looks for the totals line
  const problems = checkSite(ROOT, { readmeMd });

  // #then it is reported as a problem, not silently skipped
  assert.ok(
    problems.some((p) => p.file === "README.md" && p.message.includes("totals line")),
  );
});

test("the committed glyphs.js already covers every route (positive control)", () => {
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.file === "docs/assets/glyphs.js"),
    [],
  );
});

test("no real route id collides with a reserved page name (positive control)", () => {
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.file === "index.json"),
    [],
  );
});

test("checkSite reports a route id that collides with a reserved page name", () => {
  // #given an index.json whose route id shadows a reserved page name
  const root = createFixtureRoot([{ id: "schema" }]);

  try {
    // #when / #then checkSite flags the collision by name
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === "index.json" &&
          p.message.includes('"schema"') &&
          p.message.includes("reserved"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a pilgrimage id that collides with a reserved page name", () => {
  // #given a pilgrimage id that shadows a hand-authored page, the same way a
  // route id can — a pilgrimage has no directory but does have a page, and
  // both live in one flat namespace
  const root = createFixtureRoot([{ id: "awa", pilgrimage: "schema" }], {
    pilgrimages: [{ id: "schema", sections: ["awa"] }],
  });

  try {
    // #when / #then checkSite flags the collision by name
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === "index.json" &&
          p.message.includes('"schema"') &&
          p.message.includes("reserved"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed docs/ already has inlined assets matching their generated SVGs for every route (positive control)", () => {
  // #given every glyph, elevation profile, and sparkline is duplicated inline
  // into the HTML rather than referenced
  const problems = checkSite(ROOT);

  // #then none of the inlined copies have drifted from docs/assets/**/*.svg
  assert.deepEqual(
    problems.filter((p) => p.message.includes("does not match docs/assets/")),
    [],
  );
});

// Regression guard for a real bug a reviewer found: docs/camino-ingles.html
// rendered docs/assets/routes/camino-portugues.svg's path data as its own hero
// glyph. Nothing caught it because the guard only diffed the standalone SVG
// files against git, never the inline copies in the HTML.
test("checkSite reports an inlined glyph that belongs to a different route (fixture)", () => {
  // #given camino-frances's detail page inlines camino-ingles's glyph instead of its own
  const root = createFixtureRoot([{ id: "camino-frances" }, { id: "camino-ingles" }]);
  mkdirSync(join(root, "docs", "assets", "routes"), { recursive: true });
  writeFileSync(
    join(root, "docs", "assets", "routes", "camino-frances.svg"),
    '<svg><path d="M1.0,1.0 L2.0,2.0"/></svg>',
  );
  writeFileSync(
    join(root, "docs", "assets", "routes", "camino-ingles.svg"),
    '<svg><path d="M9.0,9.0 L8.0,8.0"/></svg>',
  );
  writeFileSync(
    join(root, "docs", "camino-frances.html"),
    '<html><body><code>camino-frances</code><path d="M9.0,9.0 L8.0,8.0"/></body></html>',
  );

  try {
    // #when checkSite compares the inlined path against docs/assets/routes/camino-frances.svg
    const problems = checkSite(root);

    // #then it reports the mismatch, naming the page and the asset it should match
    assert.ok(
      problems.some(
        (p) =>
          p.file === "docs/camino-frances.html" &&
          p.message.includes("inlined glyph") &&
          p.message.includes("docs/assets/routes/camino-frances.svg"),
      ),
      "expected a problem naming docs/camino-frances.html's mismatched inlined glyph",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts a detail page whose inlined glyph matches its own generated SVG (fixture)", () => {
  // #given camino-frances's detail page inlines exactly its own glyph's path data
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "docs", "assets", "routes"), { recursive: true });
  writeFileSync(
    join(root, "docs", "assets", "routes", "camino-frances.svg"),
    '<svg><path d="M1.0,1.0 L2.0,2.0"/></svg>',
  );
  writeFileSync(
    join(root, "docs", "camino-frances.html"),
    '<html><body><code>camino-frances</code><path d="M1.0,1.0 L2.0,2.0"/></body></html>',
  );

  try {
    // #when / #then checkSite reports no inlined-asset mismatch for that page
    // (docs/routes.html and docs/index.html are absent from this fixture, so
    // they're still flagged for not inlining the glyph at all — out of scope here)
    const problems = checkSite(root);
    assert.deepEqual(
      problems.filter(
        (p) => p.file === "docs/camino-frances.html" && p.message.includes("does not match docs/assets/"),
      ),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed docs/routes.html comparison table already matches computed per-route figures (positive control)", () => {
  // #given docs/routes.html's compare-table data-value attributes for distance,
  // typical days, stages, and waypoints
  const problems = checkSite(ROOT);

  // #then none of the seven rows are reported as mismatched
  assert.deepEqual(
    problems.filter((p) => p.file === "docs/routes.html" && p.message.includes("comparison table")),
    [],
  );
});

test("checkSite reports a stale per-route figure in the comparison table (synthetic routesHtml)", () => {
  // #given a comparison table row whose distance no longer matches metadata.json
  const routesHtml = `
    <table class="compare-table">
      <tbody>
        <tr>
          <th scope="row">Camino de Santiago (Frances)</th>
          <td data-value="999">999 km</td>
          <td data-value="31">31</td>
          <td data-value="2">Moderate</td>
          <td data-value="33">33</td>
          <td data-value="2957">2,957</td>
          <td data-value="5">May, Jun, Sep</td>
        </tr>
      </tbody>
    </table>
  `;

  // #when checkSite checks the table against computeStats().routes
  const problems = checkSite(ROOT, { routesHtml });

  // #then the stale distance is reported naming the route, the field, and both values
  assert.ok(
    problems.some(
      (p) =>
        p.file === "docs/routes.html" &&
        p.message.includes('"distance"') &&
        p.message.includes('"camino-frances"') &&
        p.message.includes("reads 999") &&
        p.message.includes("data says 764"),
    ),
  );
});

test("checkSite reports a comparison table row that doesn't match any known route", () => {
  // #given a comparison table row whose name matches no route in index.json
  const routesHtml = `
    <table class="compare-table">
      <tbody>
        <tr>
          <th scope="row">Not A Real Route</th>
          <td data-value="1">1 km</td>
          <td data-value="1">1</td>
          <td data-value="1">Easy</td>
          <td data-value="1">1</td>
          <td data-value="1">1</td>
          <td data-value="1">Jan</td>
        </tr>
      </tbody>
    </table>
  `;

  // #when / #then checkSite reports it by name rather than silently skipping it
  const problems = checkSite(ROOT, { routesHtml });
  assert.ok(
    problems.some((p) => p.file === "docs/routes.html" && p.message.includes('"Not A Real Route"')),
  );
});

// README Distance cell vs. index.json's distanceKm, a detail page's per-type
// waypoint table vs. its own stated Total, and terrainNotes prose vs. a
// stage's own distanceKm: three published figures a prior PR's reviewers
// each caught by hand, in a file the previous audit pass hadn't opened.

test("a README km cell that disagrees with the index is reported", () => {
  // #given a route the index says is 788 km (camino-norte, real data) and this README cell says 784
  const readmeMd = "[Camino del Norte](routes/camino-norte/) | 784 km";

  // #when the site is checked
  const problems = checkSite(ROOT, { readmeMd });

  // #then the mismatch is named, with both figures
  assert.ok(
    problems.some((p) => p.file === "README.md" && /784/.test(p.message) && /788/.test(p.message)),
  );
});

test("a README km cell range (network routes like Kumano Kodo) is checked against its leading figure", () => {
  // #given index.json says kumano-kodo-nakahechi is 36 km; the README cell
  // renders a range across its variants, whose leading figure must still agree
  const readmeMd =
    "[Kumano Kodo](routes/kumano-kodo-nakahechi/) | 36-170 km\n" +
    "[Kohechi](routes/kumano-kodo-kohechi/) | 63 km";

  // #when / #then checkSite accepts the range because its leading figure matches
  const problems = checkSite(ROOT, { readmeMd });
  // Scoped to the two ids this synthetic readmeMd actually carries a row
  // for — a bare "kumano-kodo" substring match would also catch the real
  // repo's other kumano-kodo-* sections, which this fixture's readmeMd
  // never mentions and so are correctly reported as missing.
  assert.deepEqual(
    problems.filter(
      (p) =>
        p.file === "README.md" &&
        (p.message.includes('"kumano-kodo-nakahechi"') || p.message.includes('"kumano-kodo-kohechi"')),
    ),
    [],
  );
});

test("a per-type waypoint table that does not sum to its own total is reported", () => {
  // #given a detail page whose rows total 100 under a stated total of 154 —
  // this is how 35 viewpoints went missing on the real camino-norte page before
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  writeFileSync(
    join(root, "docs", "camino-frances.html"),
    "<html><body><code>camino-frances</code>" +
      "<table>" +
      '<caption>Waypoint counts by type on the Camino Franc&eacute;s.</caption>' +
      '<thead><tr><th scope="col">Type</th><th scope="col">Count</th></tr></thead>' +
      "<tbody>" +
      '<tr><th scope="row">Water sources</th><td>60</td></tr>' +
      '<tr><th scope="row">Accommodation</th><td>40</td></tr>' +
      '<tr><th scope="row">Total</th><td>154</td></tr>' +
      "</tbody></table></body></html>",
  );

  try {
    // #when checkSite sums the table's rows and compares against its own Total row
    const problems = checkSite(root);

    // #then the gap is named
    assert.ok(
      problems.some(
        (p) => p.file === "docs/camino-frances.html" && /100/.test(p.message) && /154/.test(p.message),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts a per-type waypoint table whose rows sum to its own total (fixture)", () => {
  // #given a detail page whose rows sum exactly to the stated Total
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  writeFileSync(
    join(root, "docs", "camino-frances.html"),
    "<html><body><code>camino-frances</code>" +
      "<table>" +
      '<caption>Waypoint counts by type on the Camino Franc&eacute;s.</caption>' +
      '<thead><tr><th scope="col">Type</th><th scope="col">Count</th></tr></thead>' +
      "<tbody>" +
      '<tr><th scope="row">Water sources</th><td>60</td></tr>' +
      '<tr><th scope="row">Accommodation</th><td>40</td></tr>' +
      '<tr><th scope="row">Total</th><td>100</td></tr>' +
      "</tbody></table></body></html>",
  );

  try {
    // #when / #then checkSite reports no waypoint-table mismatch for this page
    const problems = checkSite(root);
    assert.deepEqual(
      problems.filter((p) => p.message.includes("rows sum to")),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The Key Facts elevation cell: the one published figure a "data: correct …"
// commit orphans without anything noticing. Both live errors were left behind
// by 1bffcda, which corrected metadata.json and not the pages it feeds.

// Every message the Key Facts guard emits names the Key Facts cell or table it
// is about — checkKeyFacts' three pairing failures, and the five row closures
// it dispatches to once a table is paired. Filtering on /elevation/i instead
// also catches "inlined elevation profile does not match …", which belongs to a
// different guard entirely.
const isKeyFactsProblem = (problem: { message: string }): boolean =>
  problem.message.includes("Key Facts");

test("checkSite reports a Key Facts elevation range that disagrees with metadata", () => {
  // #given a detail page whose Key Facts cell still reads the figures the
  // metadata used to carry
  const root = createFixtureRoot([{ id: "r", distanceKm: 243 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { elevationRange: { minMeters: 5, maxMeters: 410 } } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    "<html><body><code>r</code>" +
      "<table><caption>Overview of R</caption><tbody>" +
      '<tr><th scope="row">Distance</th><td>243 km</td></tr>' +
      '<tr><th scope="row">Elevation range</th><td>10&ndash;420 m</td></tr>' +
      "</tbody></table></body></html>",
  );

  try {
    // #when checkSite compares the cell against overview.elevationRange
    const problems = checkSite(root).filter(isKeyFactsProblem);

    // #then one problem names the page and all four figures — both rendered, both declared
    assert.equal(problems.length, 1);
    assert.equal(problems[0].file, "docs/r.html");
    assert.match(problems[0].message, /10/);
    assert.match(problems[0].message, /420/);
    assert.match(problems[0].message, /5/);
    assert.match(problems[0].message, /410/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a Key Facts elevation range that matches metadata is accepted", () => {
  // #given the same page and metadata, with the cell corrected
  const root = createFixtureRoot([{ id: "r", distanceKm: 243 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { elevationRange: { minMeters: 5, maxMeters: 410 } } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    "<html><body><code>r</code>" +
      "<table><caption>Overview of R</caption><tbody>" +
      '<tr><th scope="row">Distance</th><td>243 km</td></tr>' +
      '<tr><th scope="row">Elevation range</th><td>5&ndash;410 m</td></tr>' +
      "</tbody></table></body></html>",
  );

  try {
    // #when / #then nothing is reported
    assert.deepEqual(checkSite(root).filter(isKeyFactsProblem), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a section with elevation data but no Elevation range row is not reported", () => {
  // #given kumano-kodo-iseji's real shape: a declared elevationRange the page
  // deliberately does not publish, because nothing has measured it. Demanding
  // the row wherever the data exists is the one guaranteed false positive
  // this check can produce
  const root = createFixtureRoot([{ id: "r", distanceKm: 170 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { elevationRange: { minMeters: 0, maxMeters: 647 } } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    "<html><body><code>r</code>" +
      "<table><caption>Overview of R. Not measured on a walked line.</caption><tbody>" +
      '<tr><th scope="row">Distance</th><td>~170 km (not measured)</td></tr>' +
      "</tbody></table></body></html>",
  );

  try {
    // #when / #then the absent row is not a problem
    assert.deepEqual(checkSite(root).filter(isKeyFactsProblem), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Table-to-section pairing, and the two markup shapes that used to drop a
// table out of the scan without a word. Position was the first attempt at the
// pairing: the route's own metadata against the first table, then each
// variants/{name} directory in readdirSync order. These are the shapes that
// broke it.

test("a drifted variant cell is reported even when a range-less variant sorts ahead of it", () => {
  // #given the demonstrated failure of positional pairing: the variant whose
  // table the page carries sorts *after* a variant that declares no elevation
  // range at all, so the position that used to pair with it now lands on the
  // range-less one and the skip that keeps the guard quiet there swallowed a
  // real drift
  const root = createFixtureRoot([
    {
      id: "r",
      distanceKm: 243,
      variants: [
        { id: "alpha", distanceKm: 73 },
        { id: "zeta", distanceKm: 110 },
      ],
    },
  ]);
  mkdirSync(join(root, "routes", "r", "variants", "alpha"), { recursive: true });
  mkdirSync(join(root, "routes", "r", "variants", "zeta"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { elevationRange: { minMeters: 5, maxMeters: 410 } } }),
  );
  writeFileSync(
    join(root, "routes", "r", "variants", "alpha", "metadata.json"),
    JSON.stringify({ overview: { distanceKm: 73 } }),
  );
  writeFileSync(
    join(root, "routes", "r", "variants", "zeta", "metadata.json"),
    JSON.stringify({ overview: { elevationRange: { minMeters: 0, maxMeters: 95 } } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    "<html><body><code>r</code>" +
      "<table><caption>Overview of R</caption><tbody>" +
      '<tr><th scope="row">Distance</th><td>243 km</td></tr>' +
      '<tr><th scope="row">Elevation range</th><td>5&ndash;410 m</td></tr>' +
      "</tbody></table>" +
      "<table><caption>Overview of R, Zeta</caption><tbody>" +
      '<tr><th scope="row">Distance</th><td>110 km</td></tr>' +
      '<tr><th scope="row">Elevation range</th><td>0&ndash;100 m</td></tr>' +
      "</tbody></table></body></html>",
  );

  try {
    // #when checkSite pairs each table with a section
    const problems = checkSite(root).filter(isKeyFactsProblem);

    // #then the drift is reported against the zeta variant, not lost
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /routes\/r\/variants\/zeta\/metadata\.json/);
    assert.match(problems[0].message, /0–100 m/);
    assert.match(problems[0].message, /0–95 m/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("two variant tables listed out of directory order are each attributed to their own section", () => {
  // #given two variants whose tables appear on the page in the reverse of the
  // order readdirSync yields their directories, each cell drifted from its own
  // metadata by a distinct amount
  const root = createFixtureRoot([
    {
      id: "r",
      distanceKm: 243,
      variants: [
        { id: "aaa", distanceKm: 50 },
        { id: "bbb", distanceKm: 60 },
      ],
    },
  ]);
  mkdirSync(join(root, "routes", "r", "variants", "aaa"), { recursive: true });
  mkdirSync(join(root, "routes", "r", "variants", "bbb"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { distanceKm: 243 } }),
  );
  writeFileSync(
    join(root, "routes", "r", "variants", "aaa", "metadata.json"),
    JSON.stringify({ overview: { elevationRange: { minMeters: 1, maxMeters: 100 } } }),
  );
  writeFileSync(
    join(root, "routes", "r", "variants", "bbb", "metadata.json"),
    JSON.stringify({ overview: { elevationRange: { minMeters: 2, maxMeters: 200 } } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    "<html><body><code>r</code>" +
      "<table><caption>Overview of R, Bbb</caption><tbody>" +
      '<tr><th scope="row">Distance</th><td>60 km</td></tr>' +
      '<tr><th scope="row">Elevation range</th><td>2&ndash;222 m</td></tr>' +
      "</tbody></table>" +
      "<table><caption>Overview of R, Aaa</caption><tbody>" +
      '<tr><th scope="row">Distance</th><td>50 km</td></tr>' +
      '<tr><th scope="row">Elevation range</th><td>1&ndash;111 m</td></tr>' +
      "</tbody></table></body></html>",
  );

  try {
    // #when checkSite pairs each table with a section
    const problems = checkSite(root).filter(isKeyFactsProblem);

    // #then each drift names the metadata.json of the variant its table
    // describes — not the one sitting at that table's position
    assert.equal(problems.length, 2);
    const bbb = problems.find((p) => p.message.includes("Bbb"));
    const aaa = problems.find((p) => p.message.includes("Aaa"));
    assert.ok(bbb, "expected a problem for the Bbb variant's table");
    assert.ok(aaa, "expected a problem for the Aaa variant's table");
    assert.match(bbb.message, /routes\/r\/variants\/bbb\/metadata\.json declares 2–200 m/);
    assert.match(aaa.message, /routes\/r\/variants\/aaa\/metadata\.json declares 1–100 m/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a table whose Distance matches no section is reported, not skipped", () => {
  // #given an Overview table whose leading Distance figure is not the
  // distanceKm of the route or any of its variants — the state in which
  // positional pairing quietly checked the cell against the wrong section, or
  // ran off the end of the list and checked it against nothing
  const root = createFixtureRoot([{ id: "r", distanceKm: 243 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { elevationRange: { minMeters: 5, maxMeters: 410 } } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    "<html><body><code>r</code>" +
      "<table><caption>Overview of R</caption><tbody>" +
      '<tr><th scope="row">Distance</th><td>999 km</td></tr>' +
      '<tr><th scope="row">Elevation range</th><td>5&ndash;410 m</td></tr>' +
      "</tbody></table></body></html>",
  );

  try {
    // #when checkSite tries to pair the table
    const problems = checkSite(root).filter(isKeyFactsProblem);

    // #then the unpairable table is reported, naming the figure and the
    // sections it could have been — and leading with the stale Distance cell,
    // because that is the edit that most often causes this and the only one
    // the reader can act on
    assert.equal(problems.length, 1);
    assert.equal(problems[0].file, "docs/r.html");
    assert.match(problems[0].message, /999 km/);
    assert.match(problems[0].message, /routes\/r\/metadata\.json \(243 km\)/);
    assert.match(problems[0].message, /most likely this Distance cell has drifted from the data/);
    assert.match(problems[0].message, /every Key Facts cell in this table goes unchecked/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a table whose Distance is ambiguous between two sections is reported", () => {
  // #given a variant that shares its parent route's distanceKm, so the key
  // cannot tell their two tables apart
  const root = createFixtureRoot([
    { id: "r", distanceKm: 110, variants: [{ id: "twin", distanceKm: 110 }] },
  ]);
  mkdirSync(join(root, "routes", "r", "variants", "twin"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { elevationRange: { minMeters: 5, maxMeters: 410 } } }),
  );
  writeFileSync(
    join(root, "routes", "r", "variants", "twin", "metadata.json"),
    JSON.stringify({ overview: { elevationRange: { minMeters: 0, maxMeters: 95 } } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    "<html><body><code>r</code>" +
      "<table><caption>Overview of R</caption><tbody>" +
      '<tr><th scope="row">Distance</th><td>110 km</td></tr>' +
      '<tr><th scope="row">Elevation range</th><td>5&ndash;410 m</td></tr>' +
      "</tbody></table></body></html>",
  );

  try {
    // #when checkSite tries to pair the table
    const problems = checkSite(root).filter(isKeyFactsProblem);

    // #then the ambiguity is reported, naming both candidate sections, rather
    // than one of them being picked — and saying that the whole table, not
    // just its elevation cell, is what goes unchecked
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /routes\/r\/metadata\.json/);
    assert.match(problems[0].message, /routes\/r\/variants\/twin\/metadata\.json/);
    assert.match(problems[0].message, /every Key Facts cell in this table goes unchecked/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an Overview table carrying a <thead> is still checked", () => {
  // #given a table that has grown a header row, the shape the neighbouring
  // "Metadata-only variants" table on docs/camino-portugues.html already has.
  // Requiring <tbody> to follow <caption> dropped it out of the scan entirely
  const root = createFixtureRoot([{ id: "r", distanceKm: 243 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { elevationRange: { minMeters: 5, maxMeters: 410 } } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    "<html><body><code>r</code>" +
      "<table><caption>Overview of R</caption>" +
      '<thead><tr><th scope="col">Field</th><th scope="col">Value</th></tr></thead>' +
      "<tbody>" +
      '<tr><th scope="row">Distance</th><td>243 km</td></tr>' +
      '<tr><th scope="row">Elevation range</th><td>10&ndash;420 m</td></tr>' +
      "</tbody></table></body></html>",
  );

  try {
    // #when / #then the drift is still reported
    const problems = checkSite(root).filter(isKeyFactsProblem);
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /10–420 m/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a cell written with a literal en dash is checked, not silently passed over", () => {
  // #given docs/*.html is not uniformly entity-encoded — literal em dashes
  // appear throughout, and docs/camino-primitivo.html carries a bare é — so a
  // hand-written range can arrive with U+2013 instead of &ndash;
  const root = createFixtureRoot([{ id: "r", distanceKm: 243 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { elevationRange: { minMeters: 5, maxMeters: 410 } } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    "<html><body><code>r</code>" +
      "<table><caption>Overview of R</caption><tbody>" +
      '<tr><th scope="row">Distance</th><td>243 km</td></tr>' +
      '<tr><th scope="row">Elevation range</th><td>10–420 m</td></tr>' +
      "</tbody></table></body></html>",
  );

  try {
    // #when / #then the drift is reported just as it is for &ndash;
    const problems = checkSite(root).filter(isKeyFactsProblem);
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /10–420 m/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The other six Key Facts rows, checked through the same caption anchor and
// the same distance pairing. Every <tr> below is lifted verbatim out of a
// committed page — these are the exact shapes each pattern was narrowed
// against, not invented ones.

function keyFactsPage(rows: string, distanceCell = "243 km"): string {
  return (
    "<html><body><code>r</code>" +
    "<table><caption>Overview of R</caption><tbody>" +
    `<tr><th scope="row">Distance</th><td>${distanceCell}</td></tr>` +
    rows +
    "</tbody></table></body></html>"
  );
}

test("checkSite reports a Key Facts typical duration that disagrees with estimatedDays", () => {
  // #given docs/camino-frances.html's row verbatim, against metadata whose
  // typical has since been corrected to 30
  const root = createFixtureRoot([{ id: "r", distanceKm: 243 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { estimatedDays: { min: 28, max: 35, typical: 30 } } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    keyFactsPage(
      '<tr><th scope="row">Typical duration</th><td>31 days (range 28&ndash;35)</td></tr>',
    ),
  );

  try {
    // #when checkSite compares the cell against overview.estimatedDays
    const problems = checkSite(root).filter(isKeyFactsProblem);

    // #then one problem prints both sides in the page's own order
    assert.equal(problems.length, 1);
    assert.equal(problems[0].file, "docs/r.html");
    assert.match(problems[0].message, /31 days \(range 28–35\)/);
    assert.match(problems[0].message, /30 days \(range 28–35\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("kumano-kodo-ohechi's range-first duration cell is read in its own order, not the other shape's", () => {
  // #given docs/kumano-kodo-ohechi.html's row verbatim — the two figures come
  // before the word "days" and the typical after it, the reverse of the other
  // nine tables. Read in the typical-first order this cell says typical 3,
  // min 6, max 4, and the drift below would be attributed to the wrong figure
  const root = createFixtureRoot([{ id: "r", distanceKm: 90 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { estimatedDays: { min: 3, max: 7, typical: 4 } } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    keyFactsPage(
      '<tr><th scope="row">Typical duration</th><td>3&ndash;6 days (typical 4)</td></tr>',
      "~90 km (not measured &mdash; no walked line exists yet)",
    ),
  );

  try {
    // #when checkSite compares the cell against overview.estimatedDays
    const problems = checkSite(root).filter(isKeyFactsProblem);

    // #then the max is what disagrees, and both sides read back range-first
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /3–6 days \(typical 4\)/);
    assert.match(problems[0].message, /3–7 days \(typical 4\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("both duration cell shapes are accepted when they agree with estimatedDays", () => {
  // #given one page carrying both real shapes — the route's own table written
  // typical-first and its variant's written range-first
  const root = createFixtureRoot([
    { id: "r", distanceKm: 243, variants: [{ id: "v", distanceKm: 90 }] },
  ]);
  mkdirSync(join(root, "routes", "r", "variants", "v"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { estimatedDays: { min: 28, max: 35, typical: 31 } } }),
  );
  writeFileSync(
    join(root, "routes", "r", "variants", "v", "metadata.json"),
    JSON.stringify({ overview: { estimatedDays: { min: 3, max: 6, typical: 4 } } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    "<html><body><code>r</code>" +
      "<table><caption>Overview of R</caption><tbody>" +
      '<tr><th scope="row">Distance</th><td>243 km</td></tr>' +
      '<tr><th scope="row">Typical duration</th><td>31 days (range 28&ndash;35)</td></tr>' +
      "</tbody></table>" +
      "<table><caption>Overview of R, V</caption><tbody>" +
      '<tr><th scope="row">Distance</th><td>90 km</td></tr>' +
      '<tr><th scope="row">Typical duration</th><td>3&ndash;6 days (typical 4)</td></tr>' +
      "</tbody></table></body></html>",
  );

  try {
    // #when / #then neither shape is reported
    assert.deepEqual(checkSite(root).filter(isKeyFactsProblem), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a Key Facts topology that disagrees with overview.topology", () => {
  // #given docs/kumano-kodo-nakahechi.html's row verbatim — the one table not
  // reading "Linear" — against metadata that now says circular
  const root = createFixtureRoot([{ id: "r", distanceKm: 36 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { topology: "circular", difficulty: "moderate" } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    keyFactsPage(
      '<tr><th scope="row">Topology</th><td>Network</td></tr>' +
        '<tr><th scope="row">Difficulty</th><td>Moderate</td></tr>',
      "36 km",
    ),
  );

  try {
    // #when checkSite compares both single-word cells
    const problems = checkSite(root).filter(isKeyFactsProblem);

    // #then only the topology is reported, and the declared side is
    // title-cased to read alike
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /"Network"/);
    assert.match(problems[0].message, /"Circular"/);
    assert.match(problems[0].message, /overview\.topology/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a Key Facts difficulty separately from topology, on the same table", () => {
  // #given docs/kumano-kodo-kohechi.html's two rows verbatim, with only the
  // difficulty drifted — the two rows share one closure, so a difficulty
  // problem reported as a topology one, or a topology cell read for the
  // difficulty row, would both pass a single-row test
  const root = createFixtureRoot([{ id: "r", distanceKm: 63 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { topology: "linear", difficulty: "hard" } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    keyFactsPage(
      '<tr><th scope="row">Topology</th><td>Linear</td></tr>' +
        '<tr><th scope="row">Difficulty</th><td>Expert</td></tr>',
      "63 km",
    ),
  );

  try {
    // #when checkSite compares both cells
    const problems = checkSite(root).filter(isKeyFactsProblem);

    // #then the difficulty alone is reported, naming its own field
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /"Expert"/);
    assert.match(problems[0].message, /"Hard"/);
    assert.match(problems[0].message, /overview\.difficulty/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the title-cased topology and difficulty cells every page publishes are accepted against the data's lower case", () => {
  // #given the real corpus shape: pages render "Network"/"Expert" while
  // metadata.json holds "network"/"expert". A case-sensitive comparison would
  // report all twenty-two of those cells on its first run
  const root = createFixtureRoot([{ id: "r", distanceKm: 36 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { topology: "network", difficulty: "expert" } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    keyFactsPage(
      '<tr><th scope="row">Topology</th><td>Network</td></tr>' +
        '<tr><th scope="row">Difficulty</th><td>Expert</td></tr>',
      "36 km",
    ),
  );

  try {
    // #when / #then neither cell is reported
    assert.deepEqual(checkSite(root).filter(isKeyFactsProblem), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a Key Facts countries cell that disagrees with overview.countries", () => {
  // #given docs/camino-frances.html's row verbatim against metadata that now
  // declares a different first country
  const root = createFixtureRoot([{ id: "r", distanceKm: 764 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { countries: ["PT", "ES"] } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    keyFactsPage(
      '<tr><th scope="row">Countries</th><td>France &rarr; Spain</td></tr>',
      "764 km",
    ),
  );

  try {
    // #when checkSite rebuilds the cell from the declared codes
    const problems = checkSite(root).filter(isKeyFactsProblem);

    // #then one problem names both renderings and the codes behind the
    // declared one
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /"France → Spain"/);
    assert.match(problems[0].message, /"Portugal → Spain"/);
    assert.match(problems[0].message, /PT, ES/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the entity-written arrow every Countries cell uses is accepted", () => {
  // #given the real corpus shape: the Countries cells write "&rarr;" while the
  // stage-interior headings on the same pages write a literal "→". Comparing
  // the raw cell against a rebuilt "France → Spain" would report every
  // multi-country cell there is
  const root = createFixtureRoot([{ id: "r", distanceKm: 764 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { countries: ["FR", "ES"] } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    keyFactsPage(
      '<tr><th scope="row">Countries</th><td>France &rarr; Spain</td></tr>',
      "764 km",
    ),
  );

  try {
    // #when / #then the cell is accepted
    assert.deepEqual(checkSite(root).filter(isKeyFactsProblem), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a country code with no English name is skipped, not reported", () => {
  // #given a route through a country COUNTRY_NAME does not cover. Failing here
  // would break CI on the commit that adds the route, before anyone could
  // write its page — so the cell goes unchecked until the map grows the code
  const root = createFixtureRoot([{ id: "r", distanceKm: 764 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({ overview: { countries: ["IT"] } }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    keyFactsPage('<tr><th scope="row">Countries</th><td>Italy</td></tr>', "764 km"),
  );

  try {
    // #when / #then nothing is reported for a code the map cannot render
    assert.deepEqual(checkSite(root).filter(isKeyFactsProblem), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a Key Facts Start elevation that disagrees with startPoint's altitude", () => {
  // #given docs/kumano-kodo-kohechi.html's row verbatim against metadata whose
  // altitude has moved
  const root = createFixtureRoot([{ id: "r", distanceKm: 63 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({
      overview: {
        startPoint: { name: { en: "Koyasan" }, coordinates: [135.582004, 34.212105, 831] },
        endPoint: { name: { en: "Kumano Hongu Taisha" }, coordinates: [135.77, 33.84, 80] },
      },
    }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    keyFactsPage(
      '<tr><th scope="row">Start</th><td>K&omacr;yasan (830 m)</td></tr>' +
        '<tr><th scope="row">End</th><td>Kumano Hongu Taisha (80 m)</td></tr>',
      "63 km",
    ),
  );

  try {
    // #when checkSite compares each figure against its own coordinate
    const problems = checkSite(root).filter(isKeyFactsProblem);

    // #then the Start alone is reported, naming its own field
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /Start elevation as 830 m/);
    assert.match(problems[0].message, /declares 831 m/);
    assert.match(problems[0].message, /overview\.startPoint\.coordinates/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a Start cell whose place name carries its own parenthetical, and one whose name is followed by a temple number, both read the right figure", () => {
  // #given the two cells that break a naive "first number in the cell" or
  // "first bracket" reading: docs/camino-portugues.html's
  // "Porto Cathedral (S&eacute; do Porto) (80 m)", whose name owns the first
  // bracket, and docs/shikoku-88.html's "Ry&omacr;zen-ji, Temple 1 (15 m)",
  // whose name owns a bare number
  const root = createFixtureRoot([
    { id: "r", distanceKm: 243, variants: [{ id: "v", distanceKm: 1200 }] },
  ]);
  mkdirSync(join(root, "routes", "r", "variants", "v"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({
      overview: {
        startPoint: { name: { en: "Porto Cathedral (Sé do Porto)" }, coordinates: [-8.611, 41.143, 80] },
      },
    }),
  );
  writeFileSync(
    join(root, "routes", "r", "variants", "v", "metadata.json"),
    JSON.stringify({
      overview: {
        startPoint: { name: { en: "Ryōzen-ji (Temple 1)" }, coordinates: [134.503, 34.16, 15] },
        endPoint: { name: { en: "Ōkubo-ji (Temple 88)" }, coordinates: [134.207, 34.191, 450] },
      },
    }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    "<html><body><code>r</code>" +
      "<table><caption>Overview of R</caption><tbody>" +
      '<tr><th scope="row">Distance</th><td>243 km</td></tr>' +
      '<tr><th scope="row">Start</th><td>Porto Cathedral (S&eacute; do Porto) (80 m)</td></tr>' +
      "</tbody></table>" +
      "<table><caption>Overview of R, V</caption><tbody>" +
      '<tr><th scope="row">Distance</th><td>1,200 km</td></tr>' +
      '<tr><th scope="row">Start</th><td>Ry&omacr;zen-ji, Temple 1 (15 m)</td></tr>' +
      '<tr><th scope="row">End</th><td>&Omacr;kubo-ji, Temple 88 (450 m)</td></tr>' +
      "</tbody></table></body></html>",
  );

  try {
    // #when / #then no cell is reported — 80, 15 and 450 are read, not "Sé do
    // Porto", 1 or 88
    assert.deepEqual(checkSite(root).filter(isKeyFactsProblem), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the comma-form Start and End cells kumano-kodo-iseji and kumano-kodo-ohechi publish are checked too", () => {
  // #given docs/kumano-kodo-ohechi.html's rows verbatim: four of the
  // twenty-two Start/End cells put the altitude after a comma rather than in
  // brackets, and those are the two sections with no walked line — the pages a
  // drift gate can least afford to skip
  const root = createFixtureRoot([{ id: "r", distanceKm: 90 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({
      overview: {
        startPoint: { name: { en: "Tanabe" }, coordinates: [135.3834, 33.732, 10] },
        endPoint: { name: { en: "Kumano Nachi Taisha" }, coordinates: [135.89, 33.668, 331] },
      },
    }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    keyFactsPage(
      '<tr><th scope="row">Start</th><td>Tanabe, 10 m</td></tr>' +
        '<tr><th scope="row">End</th><td>Kumano Nachi Taisha, 330 m</td></tr>',
      "~90 km (not measured &mdash; no walked line exists yet)",
    ),
  );

  try {
    // #when checkSite reads the comma form
    const problems = checkSite(root).filter(isKeyFactsProblem);

    // #then the drifted End is reported and the agreeing Start is not
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /End elevation as 330 m/);
    assert.match(problems[0].message, /declares 331 m/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a cell carrying both elevation shapes reads the figure it states first, not the parenthesised one", () => {
  // #given the shape both of whose halves are already live habits, written
  // together: a comma-form altitude as iseji and ohechi write theirs, followed
  // by the trailing "&mdash; …" prose camino-ingles' Start and camino-norte's
  // End carry — and, as camino-portugues' coastal End does, an altitude inside
  // that trailing clause. Preferring the parenthesised match reads 780, the
  // hill the route passes below, instead of 446, the point itself
  const root = createFixtureRoot([
    { id: "r", distanceKm: 243, variants: [{ id: "v", distanceKm: 90 }] },
  ]);
  mkdirSync(join(root, "routes", "r", "variants", "v"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({
      overview: {
        startPoint: { name: { en: "Pamplona" }, coordinates: [-1.644, 42.817, 446] },
      },
    }),
  );
  writeFileSync(
    join(root, "routes", "r", "variants", "v", "metadata.json"),
    JSON.stringify({
      overview: {
        startPoint: { name: { en: "Pamplona" }, coordinates: [-1.644, 42.817, 500] },
      },
    }),
  );
  const startCell =
    '<tr><th scope="row">Start</th>' +
    "<td>Pamplona, 446 m &mdash; below Alto del Perd&oacute;n (780 m)</td></tr>";
  writeFileSync(
    join(root, "docs", "r.html"),
    "<html><body><code>r</code>" +
      "<table><caption>Overview of R</caption><tbody>" +
      '<tr><th scope="row">Distance</th><td>243 km</td></tr>' +
      startCell +
      "</tbody></table>" +
      "<table><caption>Overview of R, V</caption><tbody>" +
      '<tr><th scope="row">Distance</th><td>90 km</td></tr>' +
      startCell +
      "</tbody></table></body></html>",
  );

  try {
    // #when checkSite reads each cell
    const problems = checkSite(root).filter(isKeyFactsProblem);

    // #then the agreeing 446 is accepted, and where 446 is what disagrees it
    // is 446 the report names — never 780, which nothing declares
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /Start elevation as 446 m/);
    assert.match(problems[0].message, /declares 500 m/);
    assert.doesNotMatch(problems[0].message, /780/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a Start cell that paraphrases its own name.en is not reported when the figure agrees", () => {
  // #given the reason the place name is never compared: seven of the
  // twenty-two committed Start/End cells do not contain their name.en at all
  // and ten are not equal to it. This is docs/camino-norte.html's Start —
  // "Ir&uacute;n, Spain, at the French border" against "Irún, Spain (French
  // border)" — beside docs/camino-primitivo.html's, which drops the name's
  // parenthetical entirely
  const root = createFixtureRoot([{ id: "r", distanceKm: 788 }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "metadata.json"),
    JSON.stringify({
      overview: {
        startPoint: { name: { en: "Irún, Spain (French border)" }, coordinates: [-1.789, 43.338, 20] },
        endPoint: { name: { en: "Santiago de Compostela" }, coordinates: [-8.544, 42.881, 260] },
      },
    }),
  );
  writeFileSync(
    join(root, "docs", "r.html"),
    keyFactsPage(
      '<tr><th scope="row">Start</th><td>Ir&uacute;n, Spain, at the French border (20 m)</td></tr>' +
        '<tr><th scope="row">End</th><td>Santiago de Compostela (260 m) &mdash; via Arz&uacute;a, where the Norte joins the Camino Franc&eacute;s</td></tr>',
      "788 km",
    ),
  );

  try {
    // #when / #then the paraphrase is not a problem
    assert.deepEqual(checkSite(root).filter(isKeyFactsProblem), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("terrainNotes naming a distance that contradicts the stage is reported", () => {
  // #given a stage of 18.6 km whose notes say the day is 15.3 km
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  const routeDir = join(root, "routes", "camino-frances");
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(
    join(routeDir, "stages.json"),
    JSON.stringify({
      stages: [
        {
          index: 0,
          distanceKm: 18.6,
          terrainNotes: { en: "A quiet farming valley. The day is 15.3 km, mostly flat." },
        },
      ],
    }),
  );

  try {
    // #when checkSite compares the stage's own claim against its distanceKm
    const problems = checkSite(root);

    // #then the mismatch is named
    assert.ok(
      problems.some(
        (p) =>
          p.file === "routes/camino-frances/stages.json" &&
          /terrainNotes/.test(p.message) &&
          /15\.3/.test(p.message),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite ignores a terrainNotes km figure that isn't a self-referential distance claim (fixture — the false-positive this pattern was narrowed to avoid)", () => {
  // #given prose that mentions several km figures — a split point, an
  // elevation, an alternate-route aside — none of them a "day is/covers… N
  // km" claim, reproducing the real camino-norte stage 12 text this pattern
  // was tuned against
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  const routeDir = join(root, "routes", "camino-frances");
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(
    join(routeDir, "stages.json"),
    JSON.stringify({
      stages: [
        {
          index: 0,
          distanceKm: 18.6,
          terrainNotes: {
            en:
              "Climbs to ~425 m before dropping to the coast. Most pilgrims split this stage at " +
              "the halfway point (~10 km). Walking around the bay instead is about 35 km of road.",
          },
        },
      ],
    }),
  );

  try {
    // #when / #then none of those asides are read as the stage's own distance
    const problems = checkSite(root);
    assert.deepEqual(
      problems.filter((p) => p.message.includes("terrainNotes")),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts terrainNotes whose self-referential distance claim matches the stage's own distanceKm (fixture)", () => {
  // #given a stage whose notes explicitly state its own, correct distance
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  const routeDir = join(root, "routes", "camino-frances");
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(
    join(routeDir, "stages.json"),
    JSON.stringify({
      stages: [
        {
          index: 0,
          distanceKm: 18.6,
          terrainNotes: { en: "A quiet farming valley. The day is 18.6 km, mostly flat." },
        },
      ],
    }),
  );

  try {
    // #when / #then checkSite reports no terrainNotes mismatch for this stage
    const problems = checkSite(root);
    assert.deepEqual(
      problems.filter((p) => p.message.includes("terrainNotes")),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The three sentences below are the real, verbatim terrainNotes of the three
// committed stages that state their own length in prose. Each is reproduced
// exactly (not paraphrased) because the whole question this check turns on is
// how these particular sentences are worded: the first rigid version of the
// pattern required the number to follow a verb, so all three slipped past it
// — including camino-norte stage 12, the sentence the check was written for.
// Each fixture deliberately disagrees with distanceKm so the check has to fire.
const PRIMITIVO_STAGE_9_NOTES =
  "Longest day of the Camino Primitivo at 30.5 km. Some pilgrims split it by overnighting in " +
  "Castroverde (about halfway). Mostly downhill but with sustained walking through forest, " +
  "ending with the dramatic entry into walled Roman Lugo.";

const PRIMITIVO_STAGE_4_NOTES =
  "Long stage with rolling mountain terrain. The path passes through Borres and Campiello — " +
  "the latter being where the Hospitales variant diverges from the main path the next day. " +
  "Multiple climbs and descents make this feel longer than its 28 km.";

const NORTE_STAGE_12_NOTES =
  "Drops from Güemes through Galizano and Loredo to the beach at Somo, then takes a short " +
  "passenger ferry across Santander bay to the Santander waterfront (the ferry runs every 30 " +
  "minutes in daytime). The walk from the Santander ferry dock to the cathedral is ~1 km. The " +
  "18.6 km measures the whole stage, ferry included; about 1.8 km of that is the crossing, so " +
  "roughly 16.8 km is on foot. There is no pedestrian bridge — walking around the bay instead " +
  "is about 35 km of industrial road.";

function stageNotesFixture(distanceKm: number, terrainNotes: string): string {
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  const routeDir = join(root, "routes", "camino-frances");
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(
    join(routeDir, "stages.json"),
    JSON.stringify({ stages: [{ index: 0, distanceKm, terrainNotes: { en: terrainNotes } }] }),
  );
  return root;
}

function terrainNotesProblems(root: string): string[] {
  return checkSite(root)
    .filter((p) => p.message.includes("terrainNotes"))
    .map((p) => p.message);
}

test("a stage whose notes name their own length after a superlative ('Longest day … at 30.5 km') is checked", () => {
  // #given camino-primitivo stage 9's real notes, against a distanceKm that no longer agrees
  const root = stageNotesFixture(24, PRIMITIVO_STAGE_9_NOTES);

  try {
    // #when checkSite reads the stage's own claim
    const messages = terrainNotesProblems(root);

    // #then the 30.5 km the prose asserts is reported against the stage's 24 km
    assert.ok(messages.some((m) => m.includes("30.5") && m.includes("24")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stage whose notes name their own length possessively ('longer than its 28 km') is checked", () => {
  // #given camino-primitivo stage 4's real notes, against a distanceKm that no longer agrees
  const root = stageNotesFixture(24, PRIMITIVO_STAGE_4_NOTES);

  try {
    // #when checkSite reads the stage's own claim
    const messages = terrainNotesProblems(root);

    // #then the 28 km "its" refers to is reported against the stage's 24 km
    assert.ok(messages.some((m) => m.includes("28") && m.includes("24")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stage whose notes name their own length figure-first ('The 18.6 km measures the whole stage') is checked", () => {
  // #given camino-norte stage 12's real notes — the sentence this check was created for —
  // against a distanceKm that no longer agrees
  const root = stageNotesFixture(20.4, NORTE_STAGE_12_NOTES);

  try {
    // #when checkSite reads the stage's own claim
    const messages = terrainNotesProblems(root);

    // #then the 18.6 km the prose says measures the whole stage is reported against 20.4
    assert.ok(messages.some((m) => m.includes("18.6") && m.includes("20.4")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the 'roughly 16.8 km is on foot' clause beside it is not read as the stage's own length", () => {
  // #given the same camino-norte stage 12 notes: "16.8 km" is the walking portion with the
  // ferry crossing subtracted, deliberately different from distanceKm, and it sits in the very
  // sentence whose other clause does state the stage's length
  const root = stageNotesFixture(20.4, NORTE_STAGE_12_NOTES);

  try {
    const messages = terrainNotesProblems(root);

    // #when the check is live on this string (the neighbouring 18.6 km claim is reported)
    assert.ok(messages.some((m) => m.includes("18.6")));

    // #then none of the note's other km figures — the on-foot portion, the ferry crossing,
    // the walk to the cathedral, the drive around the bay — are reported as its length
    assert.deepEqual(
      messages.filter((m) => /\b(?:16\.8|1\.8|35|1) km\b/.test(m)),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed routes/*/stages.json terrainNotes already agree with their own distanceKm (positive control)", () => {
  // #given every route's terrainNotes as currently committed
  // #when / #then checkSite reports no terrainNotes mismatch anywhere
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.message.includes("terrainNotes")),
    [],
  );
});

test("the committed docs/{id}.html per-type waypoint tables already sum to their own Total (positive control)", () => {
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.message.includes("rows sum to")),
    [],
  );
});

test("every committed Overview table pairs with a section and agrees with it (positive control)", () => {
  const problems = checkSite(ROOT).filter(isKeyFactsProblem);
  assert.deepEqual(problems, []);
});

// Per-row positive controls: the committed pages agree with their data on
// each row separately, so a future data correction is attributed to the row it
// broke rather than to "some Key Facts problem". These cannot tell a clean
// corpus from a pattern that has stopped matching — the fixture tests above,
// which each require exactly one problem, are what pin that down.
for (const field of [
  "overview.estimatedDays",
  "overview.topology",
  "overview.difficulty",
  "overview.countries",
  "overview.startPoint.coordinates",
  "overview.endPoint.coordinates",
]) {
  test(`every committed Key Facts cell agrees with ${field} (positive control)`, () => {
    const problems = checkSite(ROOT);
    assert.deepEqual(
      problems.filter((p) => p.message.includes(field)),
      [],
    );
  });
}

test("the committed README's Distance cells already agree with index.json's distanceKm for every route (positive control)", () => {
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.file === "README.md" && p.message.includes("distanceKm")),
    [],
  );
});

test("a malformed index.json fails fast with a message naming the file, not a downstream crash", () => {
  // #given an index.json whose route entries have no "id" field
  const root = mkdtempSync(join(tmpdir(), "check-site-test-"));
  writeFileSync(join(root, "index.json"), JSON.stringify({ routes: [{ notId: "oops" }] }));

  try {
    // #when / #then checkSite throws immediately, naming index.json
    assert.throws(() => checkSite(root), /index\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("index.json with invalid JSON syntax fails fast naming the file, not the wrong shape message", () => {
  // #given an index.json that is not parseable JSON at all
  const root = mkdtempSync(join(tmpdir(), "check-site-test-"));
  writeFileSync(join(root, "index.json"), "{ this is not json");

  try {
    // #when / #then checkSite throws immediately, naming index.json and the JSON error
    assert.throws(() => checkSite(root), /index\.json.*not valid JSON/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Reverse-direction checks: everything the forward checks above confirm is
// present is only half the guard. These confirm the guard also notices when
// something on disk is no longer expected — the hole that let a removed
// route's page, assets, and glyph entry linger unreported.

test("the committed docs/ has no orphaned detail page (positive control)", () => {
  // #given every real docs/*.html is either a reserved page or a real route id
  // #when / #then checkSite reports no orphaned-page problems
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.message.includes("orphaned detail page")),
    [],
  );
});

test("checkSite reports a docs/*.html page that matches no route and no reserved page name (fixture)", () => {
  // #given a stray docs/zzz-orphan.html left behind by a removed route
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  writeFileSync(join(root, "docs", "camino-frances.html"), "<html><body><code>camino-frances</code></body></html>");
  writeFileSync(join(root, "docs", "zzz-orphan.html"), "<html><body>leftover</body></html>");

  try {
    // #when checkSite scans docs/ for pages with no corresponding route
    const problems = checkSite(root);

    // #then it names the orphaned file and what to do about it
    assert.ok(
      problems.some(
        (p) => p.file === "docs/zzz-orphan.html" && p.message.includes("orphaned detail page"),
      ),
      "expected docs/zzz-orphan.html to be reported as an orphaned detail page",
    );
    // #and the real route's own page is not caught in the same net
    assert.ok(!problems.some((p) => p.file === "docs/camino-frances.html" && p.message.includes("orphaned")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed docs/assets has no orphaned glyph, profile, or sparkline asset (positive control)", () => {
  // #given every real docs/assets/{routes,profiles,sparklines}/*.svg and every
  // glyphs.js key is either a real route id or the coastal variant
  // #when / #then checkSite reports no orphaned-asset problems
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.message.includes("orphaned") && p.message.includes("asset")),
    [],
  );
  assert.deepEqual(
    problems.filter((p) => p.file === "docs/assets/glyphs.js" && p.message.includes("orphaned")),
    [],
  );
});

test("checkSite reports a glyphs.js entry that matches no route (fixture)", () => {
  // #given a glyphs.js left behind with a key for a route that no longer exists
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "docs", "assets"), { recursive: true });
  writeFileSync(
    join(root, "docs", "assets", "glyphs.js"),
    'window.OP_GLYPHS = {\n  "camino-frances": "M1,1",\n  "zzz-orphan": "M2,2"\n};\n',
  );

  try {
    // #when / #then checkSite names the orphaned key and what to do about it
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) => p.file === "docs/assets/glyphs.js" && p.message.includes('"zzz-orphan"'),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a standalone SVG asset file that matches no route (fixture)", () => {
  // #given a stray docs/assets/routes/zzz.svg left behind by a removed route
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "docs", "assets", "routes"), { recursive: true });
  writeFileSync(join(root, "docs", "assets", "routes", "zzz-orphan.svg"), "<svg><path d=\"M1,1\"/></svg>");

  try {
    // #when checkSite scans docs/assets/routes/ for files with no corresponding route
    const problems = checkSite(root);

    // #then it names the file's own path, not just the asset directory
    assert.ok(
      problems.some(
        (p) =>
          p.file === "docs/assets/routes/zzz-orphan.svg" &&
          p.message.includes("orphaned") &&
          p.message.includes('"zzz-orphan"'),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite does not flag the coastal variant's assets as orphaned even though it has no index.json route entry (fixture)", () => {
  // #given only camino-portugues-coastal's asset files, no matching route id
  const root = createFixtureRoot([{ id: "camino-portugues" }]);
  mkdirSync(join(root, "docs", "assets", "routes"), { recursive: true });
  writeFileSync(
    join(root, "docs", "assets", "routes", "camino-portugues-coastal.svg"),
    "<svg><path d=\"M1,1\"/></svg>",
  );
  // checkRoadsAsset expects every id it's called with — including the
  // coastal variant — to have a real route.geojson (a missing one is now
  // reported, not silently skipped; see the dedicated test for that below),
  // so this fixture gives it one and embeds the matching hash in the SVG.
  const coastalGeojson = {
    type: "FeatureCollection",
    features: [{ geometry: { type: "LineString", coordinates: [[-8.6, 41.1], [-8.7, 41.2]] } }],
  };
  mkdirSync(join(root, "routes", "camino-portugues", "variants", "coastal"), { recursive: true });
  writeFileSync(
    join(root, "routes", "camino-portugues", "variants", "coastal", "route.geojson"),
    JSON.stringify(coastalGeojson),
  );
  mkdirSync(join(root, "docs", "assets", "roads"), { recursive: true });
  writeFileSync(
    join(root, "docs", "assets", "roads", "camino-portugues-coastal.svg"),
    `<svg><metadata><roads-source geometry-hash="${hashRouteGeometry(coastalGeojson)}"/></metadata><path d="M1,1"/></svg>`,
  );

  try {
    // #when / #then the one legitimate variant asset is not reported as orphaned
    const problems = checkSite(root);
    assert.deepEqual(
      problems.filter((p) => p.file.includes("camino-portugues-coastal")),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed index.json variants and docs/routes.html variants table already agree (positive control)", () => {
  // #given every variant in index.json's routes[].variants[] and every row in
  // docs/routes.html's Variants table
  // #when / #then checkSite reports no variant-coverage mismatches either direction
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.file === "docs/routes.html" && p.message.includes("variant")),
    [],
  );
});

test("checkSite reports an index.json variant with no row in the variants table (fixture)", () => {
  // #given a route whose index.json variants[] lists a variant, but
  // docs/routes.html's Variants table was never updated to include it
  const root = createFixtureRoot([
    { id: "camino-portugues", variants: [{ id: "coastal", distanceKm: 110 }] },
  ]);
  writeFileSync(
    join(root, "docs", "routes.html"),
    "<html><body><table><tbody></tbody></table></body></html>",
  );

  try {
    // #when checkSite cross-checks index.json variants against the table
    const problems = checkSite(root);

    // #then it names the variant, its parent, and its distance
    assert.ok(
      problems.some(
        (p) =>
          p.file === "docs/routes.html" &&
          p.message.includes('"coastal"') &&
          p.message.includes('"camino-portugues"') &&
          p.message.includes("110 km") &&
          p.message.includes("no row"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a variants table row with no matching entry in index.json (fixture)", () => {
  // #given docs/routes.html's Variants table names a variant that index.json
  // no longer lists (removed from index.json but the table was never updated)
  const root = createFixtureRoot([{ id: "camino-portugues" }]);
  writeFileSync(
    join(root, "docs", "routes.html"),
    `<html><body><table><tbody>
      <tr>
        <td>Some Stale Variant</td>
        <td><a href="/camino-portugues">Camino Portugu&eacute;s (Central)</a></td>
        <td>999 km</td>
        <td>Metadata only</td>
      </tr>
    </tbody></table></body></html>`,
  );

  try {
    // #when checkSite cross-checks the table against index.json variants
    const problems = checkSite(root);

    // #then it names the parent route and distance the table claims, and that
    // it has no match, distinct from an index.json-side missing-variant problem
    assert.ok(
      problems.some(
        (p) =>
          p.file === "docs/routes.html" &&
          p.message.includes('"camino-portugues"') &&
          p.message.includes("999 km") &&
          p.message.includes("matches no variant in index.json"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// route.gpx coverage: every route in index.json must ship a non-empty
// route.gpx whose <trkpt> count matches computeStats()' routePoints. That
// last comparison is the one branch that actually catches the GPX drifting
// out of sync with the geometry it was generated from — a plain
// existence/non-empty check would miss a file that is present but stale.

test("checkSite reports a route with no route.gpx file (fixture)", () => {
  // #given a route with its own route.geojson (so the check applies) but no
  // routes/{id}/route.gpx on disk
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "routes", "camino-frances"), { recursive: true });
  writeFileSync(
    join(root, "routes", "camino-frances", "route.geojson"),
    JSON.stringify({ type: "FeatureCollection", features: [] }),
  );

  try {
    // #when / #then checkSite reports the missing file, naming the route
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === "routes/camino-frances/route.gpx" && p.message.includes("has no route.gpx"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports an empty route.gpx file, distinct from a missing one (fixture)", () => {
  // #given a route with its own route.geojson, whose route.gpx exists on disk but is empty
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "routes", "camino-frances"), { recursive: true });
  writeFileSync(
    join(root, "routes", "camino-frances", "route.geojson"),
    JSON.stringify({ type: "FeatureCollection", features: [] }),
  );
  writeFileSync(join(root, "routes", "camino-frances", "route.gpx"), "");

  try {
    // #when checkSite reads that file
    const problems = checkSite(root);
    const gpxProblems = problems.filter((p) => p.file === "routes/camino-frances/route.gpx");

    // #then it is reported as empty, not as missing
    assert.ok(gpxProblems.some((p) => p.message.includes("is empty")));
    assert.ok(!gpxProblems.some((p) => p.message.includes("has no route.gpx")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The core drift guard, and per project history a branch that has never
// been seen to fire is not trustworthy — this proves it does.
test("checkSite reports a route.gpx whose <trkpt> count does not match computeStats' routePoints (fixture)", () => {
  // #given a route.geojson with 3 points but a committed route.gpx with only
  // 2 <trkpt> elements — GPX that drifted out of sync with its geometry
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  const routeDir = join(root, "routes", "camino-frances");
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(join(routeDir, "metadata.json"), JSON.stringify({}));
  writeFileSync(
    join(routeDir, "route.geojson"),
    JSON.stringify({
      type: "FeatureCollection",
      features: [{ geometry: { type: "LineString", coordinates: [[1, 2], [3, 4], [5, 6]] } }],
    }),
  );
  writeFileSync(
    join(routeDir, "route.gpx"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<gpx><trk><trkseg>' +
      '<trkpt lat="2.000000" lon="1.000000"/><trkpt lat="4.000000" lon="3.000000"/>' +
      "</trkseg></trk></gpx>\n",
  );

  try {
    // #when checkSite compares the gpx's <trkpt> count against computeStats()
    const problems = checkSite(root);

    // #then it reports the mismatch by name: 2 present, 3 expected
    assert.ok(
      problems.some(
        (p) =>
          p.file === "routes/camino-frances/route.gpx" &&
          p.message.includes("has 2 <trkpt>") &&
          p.message.includes("data says 3"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts a route.gpx whose <trkpt> count matches computeStats' routePoints (fixture)", () => {
  // #given a route.geojson with 3 points and a route.gpx with exactly 3 <trkpt> elements
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  const routeDir = join(root, "routes", "camino-frances");
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(join(routeDir, "metadata.json"), JSON.stringify({}));
  writeFileSync(
    join(routeDir, "route.geojson"),
    JSON.stringify({
      type: "FeatureCollection",
      features: [{ geometry: { type: "LineString", coordinates: [[1, 2], [3, 4], [5, 6]] } }],
    }),
  );
  writeFileSync(
    join(routeDir, "route.gpx"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<gpx><trk><trkseg>' +
      '<trkpt lat="2.000000" lon="1.000000"/><trkpt lat="4.000000" lon="3.000000"/>' +
      '<trkpt lat="6.000000" lon="5.000000"/></trkseg></trk></gpx>\n',
  );

  try {
    // #when / #then checkSite reports no gpx-related problem for this route
    const problems = checkSite(root);
    assert.deepEqual(
      problems.filter((p) => p.file === "routes/camino-frances/route.gpx"),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed routes/ already has a route.gpx for every route whose <trkpt> count matches computeStats (positive control)", () => {
  // #given every route's route.gpx was generated by npm run build-assets
  // #when / #then checkSite reports no gpx-related problems for any route
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.file.endsWith("route.gpx")),
    [],
  );
});

// Interior journey: docs/{id}.html hand-inlines a `<details class="stage-interior">`
// block per stages.json stage. Nothing templates that content, so nothing
// stops it drifting from the data — a stage added/removed or a narrative
// reworded on one side and not the other would ship silently. These fixtures
// build a minimal two-stage route to prove both guard branches actually
// fire, rather than trusting the implementation without seeing it fail.

const FIRST_NARRATIVE = "You begin where Alfonso II began, walking west out of Oviedo.";
const SECOND_NARRATIVE = "Today the mountains start in earnest.";

function createInteriorFixtureRoot(): { root: string; id: string; routeDir: string } {
  const id = "camino-frances";
  const root = createFixtureRoot([{ id }]);
  const routeDir = join(root, "routes", id);
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(join(routeDir, "metadata.json"), JSON.stringify({}));
  writeFileSync(
    join(routeDir, "stages.json"),
    JSON.stringify({
      stages: [
        { index: 0, interior: { narrative: { en: FIRST_NARRATIVE } } },
        { index: 1, interior: { narrative: { en: SECOND_NARRATIVE } } },
      ],
    }),
  );
  return { root, id, routeDir };
}

function writeDetailHtml(root: string, id: string, html: string): void {
  writeFileSync(join(root, "docs", `${id}.html`), html);
}

function twoStageDetailHtml(id: string, firstNarrative: string): string {
  return `<html><body><code>${id}</code>
    <details class="stage-interior"><p>${firstNarrative}</p></details>
    <details class="stage-interior"><p>${SECOND_NARRATIVE}</p></details>
  </body></html>`;
}

test("checkSite reports a stage interior count that doesn't match stages.json (synthetic fixture — proves the count-drift branch fires)", () => {
  // #given stages.json has 2 stages but the detail page renders only 1 <details class="stage-interior"> block
  const { root, id } = createInteriorFixtureRoot();
  writeDetailHtml(
    root,
    id,
    `<html><body><code>${id}</code>
      <details class="stage-interior"><p>${FIRST_NARRATIVE}</p></details>
    </body></html>`,
  );

  try {
    // #when checkSite compares the rendered count against stages.json
    const problems = checkSite(root);

    // #then it reports the mismatch: 1 rendered, 2 expected
    assert.ok(
      problems.some(
        (p) =>
          p.file === `docs/${id}.html` &&
          p.message.includes("renders 1 stage interior narrative(s)") &&
          p.message.includes("stages.json has 2 stage(s)"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a first-stage narrative that doesn't match stages.json verbatim (synthetic fixture — proves the verbatim-drift branch fires)", () => {
  // #given the detail page's stage-count matches, but stage 1's rendered text has been reworded
  const { root, id } = createInteriorFixtureRoot();
  writeDetailHtml(root, id, twoStageDetailHtml(id, "You begin where Alfonso III began."));

  try {
    // #when checkSite compares the page's text against stages.json's narrative
    const problems = checkSite(root);

    // #then it reports that stage 1's narrative no longer appears verbatim
    assert.ok(
      problems.some(
        (p) =>
          p.file === `docs/${id}.html` &&
          p.message.includes("stage 1's interior narrative does not appear verbatim"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts a detail page whose stage-interior count and first narrative both match stages.json (fixture)", () => {
  // #given the detail page renders exactly 2 stage-interior blocks with stage 1's narrative verbatim
  const { root, id } = createInteriorFixtureRoot();
  writeDetailHtml(root, id, twoStageDetailHtml(id, FIRST_NARRATIVE));

  try {
    // #when / #then checkSite reports no interior-journey drift for this route
    const problems = checkSite(root);
    assert.deepEqual(
      problems.filter((p) => p.message.includes("interior journey content has drifted")),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed docs/{id}.html pages already render one stage-interior block per stages.json stage with stage 1's narrative verbatim (positive control)", () => {
  // #given every route's Interior Journey section was hand-inlined from that route's stages.json
  // #when / #then checkSite reports no interior-journey drift for any route
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.message.includes("interior journey content has drifted")),
    [],
  );
});

// Route chooser filter (docs/route-filter.js): each route-card carries
// data-days/data-distance-km/data-difficulty/data-best-months read straight
// from metadata.json rather than a duplicated dataset. Nothing else stops
// those attributes drifting from metadata.json when a route's difficulty or
// best months change — these fixtures prove the guard actually fires rather
// than trusting the implementation without seeing it fail.

function writeRouteFilterFixture(
  root: string,
  cardOpenTag: string,
): void {
  mkdirSync(join(root, "routes", "camino-frances"), { recursive: true });
  writeFileSync(
    join(root, "routes", "camino-frances", "metadata.json"),
    JSON.stringify({
      overview: {
        distanceKm: 764,
        difficulty: "moderate",
        estimatedDays: { typical: 31 },
        bestMonths: [5, 6, 9],
      },
    }),
  );
  writeFileSync(
    join(root, "docs", "routes.html"),
    `<html><body><div class="route-grid">${cardOpenTag}<h3><a href="/camino-frances">Camino Frances</a></h3></div></div></body></html>`,
  );
}

test("the committed docs/routes.html route cards already carry data-days/data-distance-km/data-difficulty/data-best-months matching metadata.json for every route (positive control)", () => {
  // #given every route-card in docs/routes.html was authored with the four
  // route-filter data-* attributes read from that route's metadata.json
  const problems = checkSite(ROOT);

  // #then none of the seven routes are reported as missing or mismatched
  assert.deepEqual(
    problems.filter((p) => p.file === "docs/routes.html" && p.message.includes("route filter")),
    [],
  );
});

test("checkSite reports a route with no route-card markup to check at all (fixture — proves the missing-card branch fires)", () => {
  // #given docs/routes.html has no "/camino-frances" link at all — e.g. a
  // route dropped from the catalog grid entirely, so there is no card to
  // read route-filter attributes off of in the first place
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "routes", "camino-frances"), { recursive: true });
  writeFileSync(
    join(root, "routes", "camino-frances", "metadata.json"),
    JSON.stringify({
      overview: {
        distanceKm: 764,
        difficulty: "moderate",
        estimatedDays: { typical: 31 },
        bestMonths: [5, 6, 9],
      },
    }),
  );
  writeFileSync(
    join(root, "docs", "routes.html"),
    '<html><body><div class="route-grid"></div></body></html>',
  );

  try {
    // #when checkSite looks for camino-frances's route-card
    const problems = checkSite(root);

    // #then it reports no card was found to check, naming the route
    assert.ok(
      problems.some(
        (p) =>
          p.file === "docs/routes.html" &&
          p.message.includes('"camino-frances"') &&
          p.message.includes("no route filter data-* attributes"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports every route filter attribute missing when a route card carries none of them (fixture — proves the per-attribute branch fires four times over)", () => {
  // #given a route-card that exists and links correctly but carries none of
  // the four route-filter data-* attributes
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  writeRouteFilterFixture(root, '<div class="route-card">');

  try {
    // #when checkSite compares the card's (absent) attributes against metadata.json
    const problems = checkSite(root);
    const routeFilterProblems = problems.filter(
      (p) => p.file === "docs/routes.html" && p.message.includes("route filter"),
    );

    // #then each of the four attributes is reported missing individually, by name
    for (const attr of ["data-days", "data-distance-km", "data-difficulty", "data-best-months"]) {
      assert.ok(
        routeFilterProblems.some((p) => p.message.includes(`missing route filter attribute ${attr}`)),
        `expected a problem for missing ${attr}`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a route card missing one route filter attribute (fixture — proves the partial-card branch fires)", () => {
  // #given a route-card with three of the four attributes but no data-best-months
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  writeRouteFilterFixture(
    root,
    '<div class="route-card" data-days="31" data-distance-km="764" data-difficulty="moderate">',
  );

  try {
    // #when checkSite compares the card's attributes against metadata.json
    const problems = checkSite(root);

    // #then it reports the missing attribute by name, distinct from the "no attributes at all" case
    assert.ok(
      problems.some(
        (p) =>
          p.file === "docs/routes.html" &&
          p.message.includes('"camino-frances"') &&
          p.message.includes("missing route filter attribute data-best-months") &&
          p.message.includes("metadata.json says 5,6,9"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a route card whose route filter attribute no longer matches metadata.json (fixture — proves the drift branch fires)", () => {
  // #given a route-card whose data-difficulty ("easy") no longer matches
  // metadata.json's overview.difficulty ("moderate") — the drift this guard exists to catch
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  writeRouteFilterFixture(
    root,
    '<div class="route-card" data-days="31" data-distance-km="764" data-difficulty="easy" data-best-months="5,6,9">',
  );

  try {
    // #when checkSite compares the card's attributes against metadata.json
    const problems = checkSite(root);

    // #then it reports the mismatch, naming the route, the attribute, and both values
    assert.ok(
      problems.some(
        (p) =>
          p.file === "docs/routes.html" &&
          p.message.includes('"camino-frances"') &&
          p.message.includes("data-difficulty") &&
          p.message.includes('reads "easy"') &&
          p.message.includes('metadata.json says "moderate"'),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts a route card whose route filter attributes all match metadata.json (fixture)", () => {
  // #given a route-card whose four attributes match metadata.json exactly
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  writeRouteFilterFixture(
    root,
    '<div class="route-card" data-days="31" data-distance-km="764" data-difficulty="moderate" data-best-months="5,6,9">',
  );

  try {
    // #when / #then checkSite reports no route-filter problem for this route
    const problems = checkSite(root);
    assert.deepEqual(
      problems.filter((p) => p.file === "docs/routes.html" && p.message.includes("route filter")),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite skips the route filter check when metadata.json is missing overview fields, deferring to npm run validate", () => {
  // #given a metadata.json with no overview at all
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "routes", "camino-frances"), { recursive: true });
  writeFileSync(join(root, "routes", "camino-frances", "metadata.json"), JSON.stringify({}));
  writeFileSync(
    join(root, "docs", "routes.html"),
    '<html><body><div class="route-grid"><div class="route-card"><h3><a href="/camino-frances">Camino Frances</a></h3></div></div></body></html>',
  );

  try {
    // #when / #then checkSite reports no route-filter problem — that shape of
    // malformed data is npm run validate's job, not this guard's
    const problems = checkSite(root);
    assert.deepEqual(
      problems.filter((p) => p.file === "docs/routes.html" && p.message.includes("route filter")),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite still checks data-days/data-distance-km/data-difficulty when a route's metadata.json legitimately has no bestMonths (fixture — proves one optional-field gap no longer blanks the other three checks)", () => {
  // #given a metadata.json with distanceKm/difficulty/estimatedDays but no
  // bestMonths (schema-valid: bestMonths isn't in overview.required), and a
  // route-card whose data-difficulty deliberately doesn't match
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "routes", "camino-frances"), { recursive: true });
  writeFileSync(
    join(root, "routes", "camino-frances", "metadata.json"),
    JSON.stringify({
      overview: { distanceKm: 764, difficulty: "moderate", estimatedDays: { typical: 31 } },
    }),
  );
  writeFileSync(
    join(root, "docs", "routes.html"),
    '<html><body><div class="route-grid"><div class="route-card" data-days="31" data-distance-km="764" ' +
      'data-difficulty="easy"><h3><a href="/camino-frances">Camino Frances</a></h3></div></div></body></html>',
  );

  try {
    // #when checkSite checks this route's card
    const problems = checkSite(root);
    const routeFilterProblems = problems.filter(
      (p) => p.file === "docs/routes.html" && p.message.includes("route filter"),
    );

    // #then the real drift (difficulty) is still caught even though bestMonths is absent
    assert.ok(
      routeFilterProblems.some(
        (p) => p.message.includes("data-difficulty") && p.message.includes('reads "easy"'),
      ),
    );
    // #and no problem is reported for the missing data-best-months attribute,
    // since bestMonths is legitimately absent from metadata.json
    assert.ok(!routeFilterProblems.some((p) => p.message.includes("data-best-months")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Difficulty filter vocabulary vs. schema/pilgrimage.schema.json: the filter
// panel's <select id="filter-difficulty"> options are checked against the
// schema's difficulty enum, not the other way round — a schema-valid
// "expert" route must not be invisible under every difficulty selection.

function writeDifficultySchema(root: string, enumValues: string[]): void {
  mkdirSync(join(root, "schema"), { recursive: true });
  writeFileSync(
    join(root, "schema", "pilgrimage.schema.json"),
    JSON.stringify({ properties: { overview: { properties: { difficulty: { enum: enumValues } } } } }),
  );
}

test("the committed docs/routes.html difficulty filter already covers every value in schema/pilgrimage.schema.json's difficulty enum (positive control)", () => {
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.message.includes("difficulty filter")),
    [],
  );
});

test("checkSite reports a difficulty filter with no option for a schema enum value (fixture — an 'expert' route would be invisible under every difficulty selection)", () => {
  // #given a schema whose difficulty enum includes "expert" and a filter
  // <select> that only offers easy/moderate/hard
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  writeDifficultySchema(root, ["easy", "moderate", "hard", "expert"]);
  writeFileSync(
    join(root, "docs", "routes.html"),
    '<html><body><select id="filter-difficulty"><option value="">Any</option>' +
      '<option value="easy">Easy</option><option value="moderate">Moderate</option>' +
      '<option value="hard">Hard</option></select></body></html>',
  );

  try {
    // #when / #then checkSite names the missing schema value
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === "docs/routes.html" &&
          p.message.includes('"expert"') &&
          p.message.includes("invisible under every difficulty selection"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts a difficulty filter whose options cover the schema enum exactly (fixture)", () => {
  // #given a filter <select> with an option for every schema enum value
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  writeDifficultySchema(root, ["easy", "moderate", "hard", "expert"]);
  writeFileSync(
    join(root, "docs", "routes.html"),
    '<html><body><select id="filter-difficulty"><option value="">Any</option>' +
      '<option value="easy">Easy</option><option value="moderate">Moderate</option>' +
      '<option value="hard">Hard</option><option value="expert">Expert</option></select></body></html>',
  );

  try {
    // #when / #then checkSite reports no difficulty-filter problem
    const problems = checkSite(root);
    assert.deepEqual(
      problems.filter((p) => p.message.includes("difficulty filter")),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// route-filter.js wiring: the filter panel is revealed by CSS on the
// <html class="js"> hook rather than by route-filter.js itself, so nothing
// else ties routes.html to the script it depends on — deleting the script,
// or just its <script> tag, would leave the panel rendered and inert with
// check-site reporting zero problems.

test("the committed docs/routes.html is already wired to a real, non-empty route-filter.js (positive control)", () => {
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.message.includes("route-filter.js")),
    [],
  );
});

test("checkSite reports routes.html missing its <script src=\"route-filter.js\"> tag (synthetic routesHtml — proves the CSS-reveal decoupling is guarded)", () => {
  // #given a routes.html whose filter panel markup exists but never loads route-filter.js
  const routesHtml =
    '<html><head></head><body><div class="route-filter" data-route-filter></div>' +
    '<div class="route-grid"></div></body></html>';

  // #when / #then checkSite reports the panel has no script wired to it
  const problems = checkSite(ROOT, { routesHtml });
  assert.ok(
    problems.some(
      (p) => p.file === "docs/routes.html" && p.message.includes('<script src="route-filter.js">'),
    ),
  );
});

test("checkSite reports a missing docs/route-filter.js file (fixture)", () => {
  // #given routes.html references route-filter.js but the file doesn't exist on disk
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  writeFileSync(join(root, "docs", "camino-frances.html"), "<html><body><code>camino-frances</code></body></html>");
  writeFileSync(
    join(root, "docs", "routes.html"),
    '<html><body><script src="route-filter.js"></script></body></html>',
  );

  try {
    // #when / #then checkSite reports the script file itself is missing
    const problems = checkSite(root);
    assert.ok(
      problems.some((p) => p.file === "docs/route-filter.js" && p.message.includes("does not exist")),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports an empty docs/route-filter.js file, distinct from a missing one (fixture)", () => {
  // #given docs/route-filter.js exists on disk but is empty
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  writeFileSync(join(root, "docs", "camino-frances.html"), "<html><body><code>camino-frances</code></body></html>");
  writeFileSync(
    join(root, "docs", "routes.html"),
    '<html><body><script src="route-filter.js"></script></body></html>',
  );
  writeFileSync(join(root, "docs", "route-filter.js"), "   \n  ");

  try {
    // #when checkSite reads that file
    const problems = checkSite(root);
    const scriptProblems = problems.filter((p) => p.file === "docs/route-filter.js");

    // #then it is reported as empty, not as missing
    assert.ok(scriptProblems.some((p) => p.message.includes("is empty")));
    assert.ok(!scriptProblems.some((p) => p.message.includes("does not exist")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Orphaned scripts: extends the same reverse-orphan sweep already applied to
// detail pages and inlined assets to docs/*.js, against a hand-maintained
// known-scripts set.

test("the committed docs/ has no orphaned script (positive control)", () => {
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.message.includes("orphaned script")),
    [],
  );
});

test("checkSite reports a stray docs/*.js file that isn't in the known-scripts set (fixture)", () => {
  // #given a leftover docs/leftover.js not referenced by KNOWN_SCRIPTS
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  writeFileSync(join(root, "docs", "camino-frances.html"), "<html><body><code>camino-frances</code></body></html>");
  writeFileSync(join(root, "docs", "leftover.js"), "console.log('dead code');");

  try {
    // #when / #then checkSite names the orphaned file
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === "docs/leftover.js" &&
          p.message.includes("orphaned script") &&
          p.message.includes('"leftover.js"'),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// route.gpx discoverability: Task 1 shipped GPX generation with no way to
// find it from the site. Each detail page must link its own route.gpx
// somewhere (Files & CDN table, jsDelivr code block, or both).

test("the committed docs/{id}.html pages already link their own route.gpx (positive control)", () => {
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.message.includes("no link to its route.gpx")),
    [],
  );
});

test("checkSite reports a detail page with no link to its own route.gpx (fixture)", () => {
  // #given a route with its own route.geojson (so the gpx-link check applies)
  // whose detail page identifies its route but never links its route.gpx
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "routes", "camino-frances"), { recursive: true });
  writeFileSync(
    join(root, "routes", "camino-frances", "route.geojson"),
    JSON.stringify({ type: "FeatureCollection", features: [] }),
  );
  writeFileSync(join(root, "docs", "camino-frances.html"), "<html><body><code>camino-frances</code></body></html>");

  try {
    // #when / #then checkSite reports the missing link, naming the route
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) => p.file === "docs/camino-frances.html" && p.message.includes("no link to its route.gpx"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts a detail page that links its own route.gpx (fixture)", () => {
  // #given a detail page linking its own routes/camino-frances/route.gpx, for a
  // route that has geometry — the gpx-link guard only runs for those, so
  // without route.geojson this fixture would pass with the <a> deleted
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "routes", "camino-frances"), { recursive: true });
  writeFileSync(
    join(root, "routes", "camino-frances", "route.geojson"),
    JSON.stringify({ type: "FeatureCollection", features: [] }),
  );
  writeFileSync(join(root, "routes", "camino-frances", "route.gpx"), "<gpx></gpx>");
  writeFileSync(
    join(root, "docs", "camino-frances.html"),
    '<html><body><code>camino-frances</code>' +
      '<a href="https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-frances/route.gpx">route.gpx</a>' +
      "</body></html>",
  );

  try {
    // #when / #then checkSite reports no missing-gpx-link problem for this page
    const problems = checkSite(root);
    assert.deepEqual(
      problems.filter((p) => p.message.includes("no link to its route.gpx")),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The coastal variant's route.gpx: checkRouteGpx() only walks index.json's
// top-level route ids, so routes/camino-portugues/variants/coastal/route.gpx
// — a real, committed, 5,546-point file — got no check at all.

test("the committed routes/camino-portugues/variants/coastal/route.gpx already matches its own route.geojson's point count (positive control)", () => {
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.file === "routes/camino-portugues/variants/coastal/route.gpx"),
    [],
  );
});

test("checkSite reports a missing coastal-variant route.gpx (fixture — proves the index.json route walk alone would miss this)", () => {
  // #given the coastal variant's route.geojson exists but its route.gpx doesn't
  const root = createFixtureRoot([{ id: "camino-portugues" }]);
  const variantDir = join(root, "routes", "camino-portugues", "variants", "coastal");
  mkdirSync(variantDir, { recursive: true });
  writeFileSync(
    join(variantDir, "route.geojson"),
    JSON.stringify({
      type: "FeatureCollection",
      features: [{ geometry: { type: "LineString", coordinates: [[1, 2], [3, 4], [5, 6]] } }],
    }),
  );

  try {
    // #when / #then checkSite reports the missing file under the variant's own path
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === "routes/camino-portugues/variants/coastal/route.gpx" &&
          p.message.includes("has no route.gpx"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a coastal-variant route.gpx whose <trkpt> count doesn't match its own route.geojson (fixture)", () => {
  // #given a coastal route.geojson with 3 points but a route.gpx with only 2 <trkpt>
  const root = createFixtureRoot([{ id: "camino-portugues" }]);
  const variantDir = join(root, "routes", "camino-portugues", "variants", "coastal");
  mkdirSync(variantDir, { recursive: true });
  writeFileSync(
    join(variantDir, "route.geojson"),
    JSON.stringify({
      type: "FeatureCollection",
      features: [{ geometry: { type: "LineString", coordinates: [[1, 2], [3, 4], [5, 6]] } }],
    }),
  );
  writeFileSync(
    join(variantDir, "route.gpx"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<gpx><trk><trkseg>' +
      '<trkpt lat="2.000000" lon="1.000000"/><trkpt lat="4.000000" lon="3.000000"/>' +
      "</trkseg></trk></gpx>\n",
  );

  try {
    // #when checkSite compares the coastal gpx's <trkpt> count against its own route.geojson
    const problems = checkSite(root);

    // #then it reports the mismatch: 2 present, 3 expected
    assert.ok(
      problems.some(
        (p) =>
          p.file === "routes/camino-portugues/variants/coastal/route.gpx" &&
          p.message.includes("has 2 <trkpt>") &&
          p.message.includes("data says 3"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Interior journey, extended: checkInteriorJourney used to check only
// stage 1's narrative — 33 of 34 camino-norte narratives and all 34
// reflections were unguarded. These fixtures build a three-stage route and
// deliberately leave stage 1 untouched, so a guard that only ever checks the
// first stage cannot pass them by accident.

const STAGE1_NARRATIVE = "You begin where Alfonso II began, walking west out of Oviedo.";
const STAGE1_REFLECTION = "What did you carry into this that you did not need?";
const STAGE2_NARRATIVE = "Today the mountains start in earnest.";
const STAGE3_NARRATIVE = "By the third day the meseta opens flat to every horizon.";

function createThreeStageInteriorFixtureRoot(): { root: string; id: string } {
  const id = "camino-frances";
  const root = createFixtureRoot([{ id }]);
  const routeDir = join(root, "routes", id);
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(join(routeDir, "metadata.json"), JSON.stringify({}));
  writeFileSync(
    join(routeDir, "stages.json"),
    JSON.stringify({
      stages: [
        {
          index: 0,
          interior: { narrative: { en: STAGE1_NARRATIVE }, reflection: { en: STAGE1_REFLECTION } },
        },
        { index: 1, interior: { narrative: { en: STAGE2_NARRATIVE } } },
        { index: 2, interior: { narrative: { en: STAGE3_NARRATIVE } } },
      ],
    }),
  );
  return { root, id };
}

function threeStageDetailHtml(id: string, thirdNarrative: string, includeStage1Reflection: boolean): string {
  const reflectionBlock = includeStage1Reflection
    ? `<blockquote class="stage-reflection"><p>${STAGE1_REFLECTION}</p></blockquote>`
    : "";
  return `<html><body><code>${id}</code>
    <details class="stage-interior"><p>${STAGE1_NARRATIVE}</p>${reflectionBlock}</details>
    <details class="stage-interior"><p>${STAGE2_NARRATIVE}</p></details>
    <details class="stage-interior"><p>${thirdNarrative}</p></details>
  </body></html>`;
}

test("checkSite reports a stage-3 narrative drift when stage 1 is untouched (fixture — proves the guard loops every stage, not just the first)", () => {
  const { root, id } = createThreeStageInteriorFixtureRoot();
  writeDetailHtml(
    root,
    id,
    threeStageDetailHtml(id, "By the third day the trail climbs through a different range entirely.", true),
  );

  try {
    const problems = checkSite(root);
    const pageProblems = problems.filter((p) => p.file === `docs/${id}.html`);

    // #then stage 3's drift is reported...
    assert.ok(pageProblems.some((p) => p.message.includes("stage 3's interior narrative does not appear verbatim")));
    // #and stage 1, which was never touched, is not
    assert.ok(!pageProblems.some((p) => p.message.includes("stage 1's interior narrative does not appear verbatim")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a deleted stage-1 reflection (fixture — proves the guard checks reflections, not just narratives)", () => {
  const { root, id } = createThreeStageInteriorFixtureRoot();
  writeDetailHtml(root, id, threeStageDetailHtml(id, STAGE3_NARRATIVE, false));

  try {
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === `docs/${id}.html` &&
          p.message.includes("stage 1's interior reflection does not appear verbatim"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts a three-stage page whose narratives and reflection all match stages.json verbatim (fixture)", () => {
  const { root, id } = createThreeStageInteriorFixtureRoot();
  writeDetailHtml(root, id, threeStageDetailHtml(id, STAGE3_NARRATIVE, true));

  try {
    const problems = checkSite(root);
    assert.deepEqual(
      problems.filter((p) => p.message.includes("interior journey content has drifted")),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// HTML-entity decoding: detailHtml is decoded before the narrative/reflection
// includes() check, so a narrative containing &, <, >, or ' is compared
// against the *rendered* text, not the raw HTML — a correctly-escaped page
// must not false-fail this guard.

// The roads corridor SVG (docs/assets/roads/{id}.svg) is fetched offline
// (npm run fetch-roads) and rendered from that cache alone (npm run
// build-roads) — CI never touches the network, so it can never notice the
// SVG was built against route geometry that has since changed. The guard's
// only defence is the geometry hash embedded in the SVG's <metadata>: these
// tests prove existence, well-formedness, non-emptiness, and the hash
// comparison each independently fire on the failure they're meant to catch.

function routeGeojson(coordinates: number[][]): unknown {
  return { type: "FeatureCollection", features: [{ geometry: { type: "LineString", coordinates } }] };
}

function roadsSvg(hash: string, extractDate = "2026-08-01"): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none" stroke="currentColor">` +
    `<metadata><roads-source geometry-hash="${hash}" extract-date="${extractDate}" attribution="ODbL"/></metadata>` +
    `<path d="M10,10 L20,20"/></svg>\n`
  );
}

const ROADS_ROUTE_ID = "camino-frances";
const ROADS_COORDINATES = [
  [-8.5, 42.5],
  [-8.4, 42.6],
];

function roadsFixtureRoot(): string {
  const root = createFixtureRoot([{ id: ROADS_ROUTE_ID }]);
  const routeDir = join(root, "routes", ROADS_ROUTE_ID);
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(join(routeDir, "metadata.json"), JSON.stringify({}));
  writeFileSync(join(routeDir, "route.geojson"), JSON.stringify(routeGeojson(ROADS_COORDINATES)));
  return root;
}

// camino-frances's decimated trace (229 anchors) was too large for a single
// Overpass `around:` request; chunking it (see MAX_CHUNK_POINTS in
// roads.ts) fixed that. shikoku-88 (415 anchors, 8 chunks) needed
// resumable per-chunk caching on top of chunking: three prior attempts
// under non-resumable chunking each discarded every successful chunk the
// moment a later one failed (a 429 on chunk 2/8, then a 504 on chunk 5/8,
// then a 504 on chunk 6/8), throwing away real progress every time. With
// each chunk cached individually (see chunkCachePathFor/isFreshChunkCache
// in roads.ts) and reruns resuming from what's missing, two paced runs
// completed all 8 chunks — the second reused the 4 chunks the first had
// already fetched and only requested the remaining 4. All eight corridors
// are now fetched and committed, matching every other positive control in
// this file.
test("the committed docs/assets/roads/*.svg already exist, parse, and hash-match route.geojson for every route (positive control)", () => {
  const problems = checkSite(ROOT).filter((p) => p.file.startsWith("docs/assets/roads/"));
  assert.deepEqual(problems, []);
});

test("checkSite reports a route with no roads corridor SVG at all (fixture)", () => {
  const root = roadsFixtureRoot();

  try {
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === `docs/assets/roads/${ROADS_ROUTE_ID}.svg` &&
          p.message.includes("has no roads corridor SVG"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports an empty roads corridor SVG, distinct from a missing one (fixture)", () => {
  const root = roadsFixtureRoot();
  mkdirSync(join(root, "docs", "assets", "roads"), { recursive: true });
  writeFileSync(join(root, "docs", "assets", "roads", `${ROADS_ROUTE_ID}.svg`), "");

  try {
    const problems = checkSite(root);
    const roadsProblems = problems.filter((p) => p.file === `docs/assets/roads/${ROADS_ROUTE_ID}.svg`);
    assert.ok(roadsProblems.some((p) => p.message.includes("is empty")));
    assert.ok(!roadsProblems.some((p) => p.message.includes("has no roads corridor SVG")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a roads corridor SVG that is not well-formed XML (fixture — an unclosed tag)", () => {
  const root = roadsFixtureRoot();
  mkdirSync(join(root, "docs", "assets", "roads"), { recursive: true });
  writeFileSync(
    join(root, "docs", "assets", "roads", `${ROADS_ROUTE_ID}.svg`),
    '<svg><metadata><roads-source geometry-hash="abc"></svg>',
  );

  try {
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === `docs/assets/roads/${ROADS_ROUTE_ID}.svg` &&
          p.message.includes("not well-formed XML"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Finding 1 (final review): a cache with an empty `elements` array — or one
// whose every way falls outside the corridor — used to render this exact
// shape: well-formed XML, a non-empty file, a correct geometry hash, and a
// literal `d=""`. That passed every guard that existed before this test.
// build-roads now refuses to *write* that shape (see roads.test.ts), and
// this proves check-site catches it independently, on the other end, in
// case a file reaches this state some other way (an older build, a hand
// edit).
test("checkSite reports a roads corridor SVG whose <path d> is empty, even though the file is non-empty, well-formed, and its embedded geometry-hash is correct (fixture)", () => {
  const root = roadsFixtureRoot();
  mkdirSync(join(root, "docs", "assets", "roads"), { recursive: true });
  const hash = hashRouteGeometry(routeGeojson(ROADS_COORDINATES));
  writeFileSync(
    join(root, "docs", "assets", "roads", `${ROADS_ROUTE_ID}.svg`),
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none" stroke="currentColor">` +
      `<metadata><roads-source geometry-hash="${hash}" extract-date="2026-08-01" attribution="ODbL"/></metadata>` +
      `<path d=""/></svg>\n`,
  );

  try {
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === `docs/assets/roads/${ROADS_ROUTE_ID}.svg` &&
          p.message.includes("empty corridor"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a roads corridor SVG with no embedded geometry-hash (fixture)", () => {
  const root = roadsFixtureRoot();
  mkdirSync(join(root, "docs", "assets", "roads"), { recursive: true });
  writeFileSync(
    join(root, "docs", "assets", "roads", `${ROADS_ROUTE_ID}.svg`),
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1,1 L2,2"/></svg>',
  );

  try {
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === `docs/assets/roads/${ROADS_ROUTE_ID}.svg` &&
          p.message.includes("no embedded geometry-hash"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts a roads corridor SVG whose embedded hash matches its route's current route.geojson (fixture)", () => {
  const root = roadsFixtureRoot();
  mkdirSync(join(root, "docs", "assets", "roads"), { recursive: true });
  const hash = hashRouteGeometry(routeGeojson(ROADS_COORDINATES));
  writeFileSync(join(root, "docs", "assets", "roads", `${ROADS_ROUTE_ID}.svg`), roadsSvg(hash));

  try {
    assert.deepEqual(
      checkSite(root).filter((p) => p.file === `docs/assets/roads/${ROADS_ROUTE_ID}.svg`),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a roads corridor SVG rendered against stale geometry once the route.geojson it was built from changes (fixture — mutates the geometry, not the hash string, to exercise the real failure)", () => {
  const root = roadsFixtureRoot();
  mkdirSync(join(root, "docs", "assets", "roads"), { recursive: true });

  // #given a roads SVG whose embedded hash was computed from the route's
  // original coordinates, and genuinely matches them right now
  const originalHash = hashRouteGeometry(routeGeojson(ROADS_COORDINATES));
  const svgPath = join(root, "docs", "assets", "roads", `${ROADS_ROUTE_ID}.svg`);
  writeFileSync(svgPath, roadsSvg(originalHash));
  assert.deepEqual(
    checkSite(root).filter((p) => p.file === `docs/assets/roads/${ROADS_ROUTE_ID}.svg`),
    [],
    "sanity check: the fixture starts in a matching state",
  );

  // #when the route's own route.geojson is edited — as if the route were
  // re-fetched or corrected — without re-running fetch-roads/build-roads
  const mutatedCoordinates = [
    [-8.5, 42.5],
    [-8.4, 42.60001],
  ];
  writeFileSync(
    join(root, "routes", ROADS_ROUTE_ID, "route.geojson"),
    JSON.stringify(routeGeojson(mutatedCoordinates)),
  );

  try {
    // #then checkSite recomputes the hash from the new geometry and reports the mismatch
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === `docs/assets/roads/${ROADS_ROUTE_ID}.svg` &&
          p.message.includes("stale route geometry") &&
          p.message.includes(originalHash),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Finding 5 (final review): checkRoadsAsset used to silently return when
// geojsonPath didn't exist, disabling the hash comparison with no signal —
// and the coastal variant's path is hard-coded at its call site, so a moved
// or renamed variant directory would silently switch the guard off. Every
// id checkRoadsAsset is called with is expected to have a route.geojson, so
// a missing one is now reported instead.
test("checkSite reports a roads corridor SVG whose route has no route.geojson to check its geometry-hash against, instead of silently skipping the staleness check (fixture)", () => {
  // #given a well-formed, hash-bearing roads corridor SVG, but no
  // routes/{id}/route.geojson at all — e.g. a moved or renamed route directory
  const root = createFixtureRoot([{ id: ROADS_ROUTE_ID }]);
  mkdirSync(join(root, "docs", "assets", "roads"), { recursive: true });
  writeFileSync(
    join(root, "docs", "assets", "roads", `${ROADS_ROUTE_ID}.svg`),
    roadsSvg(hashRouteGeometry(routeGeojson(ROADS_COORDINATES))),
  );

  try {
    // #when / #then the missing route.geojson is reported, not silently skipped
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === `docs/assets/roads/${ROADS_ROUTE_ID}.svg` &&
          p.message.includes("has no route.geojson"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports an orphaned roads corridor SVG that matches no route in index.json (fixture)", () => {
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "docs", "assets", "roads"), { recursive: true });
  writeFileSync(
    join(root, "docs", "assets", "roads", "zzz-orphan.svg"),
    roadsSvg(hashRouteGeometry(routeGeojson(ROADS_COORDINATES))),
  );

  try {
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) => p.file === "docs/assets/roads/zzz-orphan.svg" && p.message.includes("orphaned"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// checkRoadsAsset (above) only guards the asset files under
// docs/assets/roads/ — it never looks at whether a detail page actually
// references its own one. checkRoadsPageReferences closes that gap: these
// tests prove it fires on a page with no roads reference at all, and —
// the case that actually matters, since a wrong-route asset renders as a
// real, valid image and not an obviously broken page — on a page that
// references a *different* route's corridor SVG.

function roadsPageReferenceFixtureRoot(id: string): string {
  const root = createFixtureRoot([{ id }]);
  const routeDir = join(root, "routes", id);
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(join(routeDir, "metadata.json"), JSON.stringify({}));
  // These fixtures test whether a detail page references its own roads
  // corridor SVG — a route with no route.geojson at all (spec §4.3
  // metadata-only) is exempt from needing one, so route.geojson here makes
  // this fixture's implicit "this route has geometry" premise explicit.
  writeFileSync(
    join(routeDir, "route.geojson"),
    JSON.stringify({ type: "FeatureCollection", features: [] }),
  );
  return root;
}

test("the committed docs/{route}.html pages already reference their own roads corridor SVG (positive control)", () => {
  const problems = checkSite(ROOT).filter(
    (p) =>
      p.file.endsWith(".html") &&
      (p.message.includes("roads corridor SVG (assets/roads/") ||
        p.message.includes("isn't one of this page's own routes")),
  );
  assert.deepEqual(problems, []);
});

test("checkSite reports a detail page with no roads corridor reference at all (fixture)", () => {
  // #given a detail page whose hero never mentions assets/roads/ at all
  const root = roadsPageReferenceFixtureRoot("camino-frances");
  writeDetailHtml(root, "camino-frances", "<html><body><code>camino-frances</code></body></html>");

  try {
    // #when / #then checkSite reports the missing reference
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === "docs/camino-frances.html" &&
          p.message.includes("has no reference to its roads corridor SVG (assets/roads/camino-frances.svg)"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a detail page whose hero points at a different route's roads corridor (fixture — the wrong-route mix-up, not just a missing file)", () => {
  // #given camino-frances's detail page references camino-norte's roads SVG
  // instead of its own — a copy-paste mistake that renders as a real,
  // valid image, not an obviously broken page
  const root = roadsPageReferenceFixtureRoot("camino-frances");
  writeDetailHtml(
    root,
    "camino-frances",
    '<html><body><code>camino-frances</code>' +
      '<img class="route-hero-roads" src="assets/roads/camino-norte.svg" alt=""></body></html>',
  );

  try {
    // #when checkSite checks that detail page
    const problems = checkSite(root).filter((p) => p.file === "docs/camino-frances.html");

    // #then it reports both signals: the page's own corridor is missing...
    assert.ok(
      problems.some((p) =>
        p.message.includes("has no reference to its roads corridor SVG (assets/roads/camino-frances.svg)"),
      ),
    );
    // #and specifically that the SVG it does reference belongs to another route
    assert.ok(
      problems.some(
        (p) =>
          p.message.includes("references assets/roads/camino-norte.svg") &&
          p.message.includes("isn't one of this page's own routes"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts camino-portugues.html referencing both its own and the coastal variant's roads corridor in one page (fixture — proves the two-id page doesn't misreport its second hero as foreign)", () => {
  // #given a page carrying two legitimate roads references: the main route's
  // hero and, further down, the coastal variant's own hero
  const root = roadsPageReferenceFixtureRoot("camino-portugues");
  writeDetailHtml(
    root,
    "camino-portugues",
    '<html><body><code>camino-portugues</code>' +
      '<img class="route-hero-roads" src="assets/roads/camino-portugues.svg" alt="">' +
      '<img class="route-hero-roads" src="assets/roads/camino-portugues-coastal.svg" alt="">' +
      "</body></html>",
  );

  try {
    // #when / #then neither reference is flagged as missing or foreign
    const problems = checkSite(root).filter(
      (p) =>
        p.file === "docs/camino-portugues.html" &&
        (p.message.includes("roads corridor SVG (assets/roads/") ||
          p.message.includes("isn't one of this page's own routes")),
    );
    assert.deepEqual(problems, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Finding 6 (final review): the old regex (/assets\/roads\/([a-z0-9-]+)\.svg/g)
// ran over raw HTML, so an HTML comment, an <a href>, or plain prose
// satisfied it. Tightened to require the real hero markup shape —
// <img class="route-hero-roads" … src="assets/roads/{id}.svg"> — so deleting
// the hero markup while leaving any mention behind is caught.
test("checkSite does not accept a bare mention of the roads SVG path as satisfying the hero reference guard (fixture — an HTML comment and a plain link, not the real <img class=\"route-hero-roads\"> shape)", () => {
  // #given the hero <img> is gone, but the path still appears in a comment
  // and a plain link — exactly the kind of trace that a naive path-matching
  // regex would mistake for the real reference
  const root = roadsPageReferenceFixtureRoot("camino-frances");
  writeDetailHtml(
    root,
    "camino-frances",
    '<html><body><code>camino-frances</code>' +
      '<!-- assets/roads/camino-frances.svg --> ' +
      '<a href="assets/roads/camino-frances.svg">roads data</a>' +
      "</body></html>",
  );

  try {
    // #when / #then the guard still reports the reference as missing
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === "docs/camino-frances.html" &&
          p.message.includes("has no reference to its roads corridor SVG (assets/roads/camino-frances.svg)"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts an interior narrative containing &, <, >, and ' when the page renders them correctly HTML-escaped (fixture — proves decodeEntities covers numeric references, not just named ones)", () => {
  const id = "camino-frances";
  const root = createFixtureRoot([{ id }]);
  const routeDir = join(root, "routes", id);
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(join(routeDir, "metadata.json"), JSON.stringify({}));
  const narrative = "Rest & recover before the climb. The path <narrows> here, and it's steep.";
  writeFileSync(
    join(routeDir, "stages.json"),
    JSON.stringify({ stages: [{ index: 0, interior: { narrative: { en: narrative } } }] }),
  );
  const escapedNarrative =
    "Rest &amp; recover before the climb. The path &lt;narrows&gt; here, and it&#39;s steep.";
  writeDetailHtml(
    root,
    id,
    `<html><body><code>${id}</code><details class="stage-interior"><p>${escapedNarrative}</p></details></body></html>`,
  );

  try {
    // #when / #then the decoded page text matches the raw narrative verbatim
    const problems = checkSite(root);
    assert.deepEqual(
      problems.filter((p) => p.message.includes("interior journey content has drifted")),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- CDN link guard ---
//
// checkSite scans the real docs/*.html on disk regardless of overrides (only
// indexHtml/routesHtml/readmeMd can be swapped in), so a synthetic readmeMd
// carrying one bad CDN URL produces exactly one CDN-related problem, tied to
// "README.md" — the real, committed docs/ stays clean throughout.

test("the committed docs/ and README.md already pass the CDN link guard (positive control)", () => {
  // #given every jsDelivr URL in the real docs/ and README.md
  // #when checkSite checks each one's path, published surface, and version ref
  const problems = checkSite(ROOT);

  // #then none of them are flagged
  assert.deepEqual(
    problems.filter((p) => p.message.startsWith("links to https://cdn")),
    [],
  );
});

test("checkSite reports a CDN link whose path does not exist in the repo (synthetic readmeMd)", () => {
  // #given a CDN URL pointing at a route that was never fetched or was renamed
  const readmeMd =
    "See https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/does-not-exist/route.geojson for details.";

  // #when checkSite checks that URL's path against the working tree
  const problems = checkSite(ROOT, { readmeMd });

  // #then it's reported as missing, against README.md
  assert.ok(
    problems.some(
      (p) =>
        p.file === "README.md" &&
        p.message.includes("routes/does-not-exist/route.geojson") &&
        p.message.includes("does not exist in the repo"),
    ),
  );
});

test("checkSite reports a CDN link pointing under docs/ as outside the published surface (synthetic readmeMd)", () => {
  // #given a CDN URL pointing at the site itself rather than the data it publishes
  const readmeMd =
    "See https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/docs/index.html for details.";

  // #when checkSite checks that URL's path against the published surface (routes/, schema/, index.json)
  const problems = checkSite(ROOT, { readmeMd });

  // #then it's reported as unpublishable, against README.md — and not also flagged as merely missing,
  // since docs/index.html does exist in the repo
  assert.ok(
    problems.some(
      (p) =>
        p.file === "README.md" &&
        p.message.includes("docs/index.html") &&
        p.message.includes("outside the published CDN surface"),
    ),
  );
  assert.ok(!problems.some((p) => p.file === "README.md" && p.message.includes("does not exist in the repo")));
});

test("checkSite reports a CDN link using an unrecognized version ref (synthetic readmeMd)", () => {
  // #given a CDN URL pinned to a ref this project never publishes against —
  // `main` is now the catalog ref, but `latest` still names nothing
  const readmeMd =
    "See https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@latest/index.json for details.";

  // #when checkSite checks that URL's ref
  const problems = checkSite(ROOT, { readmeMd });

  // #then it's reported as unrecognized, against README.md
  assert.ok(
    problems.some(
      (p) =>
        p.file === "README.md" &&
        p.message.includes('"@latest"') &&
        p.message.includes("isn't one this project uses"),
    ),
  );
});

test("checkSite does not check anything for a bare CDN base URL with no path", () => {
  // #given a CDN URL with a recognized ref and no path at all — the BASE constant pattern used
  // throughout the README's code samples
  const readmeMd = "const BASE = 'https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1';";

  // #when / #then checkSite reports no CDN problems for it (no path to be missing or unpublished)
  const problems = checkSite(ROOT, { readmeMd });
  assert.deepEqual(
    problems.filter((p) => p.file === "README.md" && p.message.startsWith("links to https://cdn")),
    [],
  );
});

test("checkSite reports a detail page with zero extracted CDN links, instead of silently passing (fixture) — the floor assertion for the same bug an org rename or a bad CDN_URL_PATTERN edit would cause", () => {
  // #given a detail page that mentions its route.gpx path in plain text, but never as a URL
  // CDN_URL_PATTERN actually matches — the shape a page would take if the pattern (or the org/repo
  // it's built from) drifted out of sync with the page's real links
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "routes", "camino-frances"), { recursive: true });
  writeFileSync(join(root, "routes", "camino-frances", "route.gpx"), "<gpx></gpx>");
  writeFileSync(
    join(root, "docs", "camino-frances.html"),
    "<html><body><code>camino-frances</code>" +
      "<p>routes/camino-frances/route.gpx</p>" +
      '<img class="route-hero-roads" src="assets/roads/camino-frances.svg" alt="">' +
      "</body></html>",
  );

  try {
    // #when checkSite scans this page for CDN links
    const problems = checkSite(root);

    // #then it reports the zero-CDN-links floor problem, not a silent pass
    assert.ok(
      problems.some((p) => p.file === "docs/camino-frances.html" && p.message.includes("zero CDN links")),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite does not report the zero-CDN-links floor problem for a page that legitimately has no CDN links (fixture — index.html, routes.html, etc.)", () => {
  // #given a route whose detail page carries real CDN links (so the floor check passes for it),
  // proving the floor check doesn't also misfire against docs/index.html or docs/routes.html,
  // which never carry CDN links of their own
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "routes", "camino-frances"), { recursive: true });
  writeFileSync(join(root, "routes", "camino-frances", "route.gpx"), "<gpx></gpx>");
  writeFileSync(
    join(root, "docs", "camino-frances.html"),
    '<html><body><code>camino-frances</code>' +
      '<a href="https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-frances/route.gpx">route.gpx</a>' +
      '<img class="route-hero-roads" src="assets/roads/camino-frances.svg" alt="">' +
      "</body></html>",
  );
  writeFileSync(join(root, "docs", "index.html"), "<html><body>no CDN links on this page, ever</body></html>");

  try {
    // #when / #then checkSite reports no zero-CDN-links problem at all
    const problems = checkSite(root);
    assert.deepEqual(
      problems.filter((p) => p.message.includes("zero CDN links")),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite scans docs/*.js for CDN links too, not only docs/*.html (fixture — proves the class of file cdn-preview.js belongs to is actually covered)", () => {
  // #given a docs/*.js file carrying a bad CDN URL that appears nowhere else on the site
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  writeFileSync(
    join(root, "docs", "site-preview.js"),
    "var INDEX_URL = 'https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/does-not-exist/index.json';",
  );

  try {
    // #when checkSite scans docs/ for CDN links
    const problems = checkSite(root);

    // #then the bad link inside the .js file is reported, tied to that file
    assert.ok(
      problems.some(
        (p) =>
          p.file === "docs/site-preview.js" &&
          p.message.includes("routes/does-not-exist/index.json") &&
          p.message.includes("does not exist in the repo"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a bad CDN link in an overridden docs page (synthetic indexHtml) — the docs-page half of checkCdnLinks honours indexHtml/routesHtml overrides, not only readmeMd", () => {
  // #given an overridden docs/index.html carrying a CDN link to a path that doesn't exist —
  // previously checkCdnLinks always read the real docs/index.html off disk regardless of overrides,
  // so no override-driven test could ever exercise this half of the guard
  const indexHtml =
    '<a href="https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/does-not-exist/route.geojson">bad</a>';

  // #when checkSite checks the overridden page's CDN links
  const problems = checkSite(ROOT, { indexHtml });

  // #then it's reported as missing, against docs/index.html — not against the real docs/index.html
  // on disk, which was never read
  assert.ok(
    problems.some(
      (p) =>
        p.file === "docs/index.html" &&
        p.message.includes("routes/does-not-exist/route.geojson") &&
        p.message.includes("does not exist in the repo"),
    ),
  );
});


test("a route naming a pilgrimage that does not exist is a problem", () => {
  // #given a route's `pilgrimage` field names an id absent from pilgrimages[]
  const root = createFixtureRoot([{ id: "awa", pilgrimage: "shikoku-88" }], { pilgrimages: [] });

  try {
    // #when / #then checkSite reports the route and the missing pilgrimage id together
    const problems = checkSite(root);
    assert.ok(problems.some((p) => /shikoku-88/.test(p.message) && /awa/.test(p.message)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pilgrimage with no sections is a problem", () => {
  // #given a pilgrimage entry whose sections[] is empty
  const root = createFixtureRoot([], { pilgrimages: [{ id: "shikoku-88", sections: [] }] });

  try {
    // #when / #then checkSite reports the pilgrimage id and the missing sections
    const problems = checkSite(root);
    assert.ok(problems.some((p) => /shikoku-88/.test(p.message) && /no sections/.test(p.message)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pilgrimage section naming a route that does not exist is a problem", () => {
  // #given a pilgrimage's sections[] lists an id absent from routes[]
  const root = createFixtureRoot([], {
    pilgrimages: [{ id: "shikoku-88", sections: ["awa"] }],
  });

  try {
    // #when / #then checkSite reports the pilgrimage and the unresolved section id together
    const problems = checkSite(root);
    assert.ok(problems.some((p) => /shikoku-88/.test(p.message) && /awa/.test(p.message)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pilgrimage page is not an orphaned detail page", () => {
  // #given a pilgrimage with a section, and both the section's and the pilgrimage's
  // pages already exist under docs/
  const root = createFixtureRoot(
    [{ id: "awa", pilgrimage: "shikoku-88" }],
    { pilgrimages: [{ id: "shikoku-88", sections: ["awa"] }] },
  );
  writeFileSync(join(root, "docs", "awa.html"), "");
  writeFileSync(join(root, "docs", "shikoku-88.html"), "");

  try {
    // #when / #then neither page is flagged as an orphan
    const problems = checkSite(root);
    assert.equal(problems.filter((p) => /orphaned detail page/.test(p.message)).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pilgrimage id may not collide with a route id", () => {
  // #given the same id claimed by both a pilgrimage and a route
  const root = createFixtureRoot(
    [{ id: "awa", pilgrimage: "awa" }],
    { pilgrimages: [{ id: "awa", sections: ["awa"] }] },
  );

  try {
    // #when / #then checkSite reports the id as claimed twice
    const problems = checkSite(root);
    assert.ok(problems.some((p) => /awa/.test(p.message) && /claimed twice/.test(p.message)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pilgrimage with no generated page is a problem", () => {
  // #given a pilgrimage in index.json whose docs/<id>.html was never built
  const root = createFixtureRoot(
    [{ id: "awa", pilgrimage: "shikoku-88" }],
    { pilgrimages: [{ id: "shikoku-88", sections: ["awa"] }] },
  );
  writeFileSync(join(root, "docs", "awa.html"), "");

  try {
    // #when / #then checkSite reports the missing page against its own path,
    // and names the command that writes it
    const problems = checkSite(root);
    assert.ok(
      problems.some(
        (p) =>
          p.file === "docs/shikoku-88.html" &&
          /shikoku-88/.test(p.message) &&
          /npm run build-assets/.test(p.message),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed docs/ already has a page for every pilgrimage (positive control)", () => {
  // #given docs/camino-de-santiago.html was generated by build-assets
  // #when / #then checkSite reports no pilgrimage as missing its page
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.message.includes("has no generated page")),
    [],
  );
});

// The `.route-group` wrapper in docs/routes.html and the "Part of the …"
// backlink on each section page are both hand-edited, and eight more section
// pages are on their way. An agent that forgets either one gets a green
// check-site and a site where a section shows under the wrong heading, or
// offers no way back up to its pilgrimage.

/** A catalog with one card, wrapped in whatever grouping the test is about. */
function catalogWith(body: string): string {
  return `<html><body><div class="route-grid">\n${body}\n</div></body></html>`;
}

const AWA_CARD = '<div class="route-card" data-days="1"><h3><a href="/awa">Awa</a></h3></div>';

test("the committed section pages already link back to their pilgrimage (positive control)", () => {
  // #given the five Camino sections each carry a "Part of the Camino de
  // Santiago" line, and each sits under the Camino group in the catalog
  const problems = checkSite(ROOT);

  // #then neither the backlink nor the grouping is reported for any of them
  assert.deepEqual(
    problems.filter(
      (p) => p.message.includes("link back to its pilgrimage") || p.message.includes("route-group"),
    ),
    [],
  );
});

test("a section page with no link back to its pilgrimage is a problem", () => {
  // #given a section whose detail page never names its pilgrimage
  const root = createFixtureRoot([{ id: "awa", pilgrimage: "shikoku-88" }], {
    pilgrimages: [{ id: "shikoku-88", sections: ["awa"] }],
  });
  writeFileSync(join(root, "docs", "awa.html"), "<html><body><code>awa</code></body></html>");

  try {
    // #when / #then the missing way back up is reported against the page
    const problems = checkSite(root, { routesHtml: catalogWith(AWA_CARD) });
    assert.ok(
      problems.some(
        (p) => p.file === "docs/awa.html" && /link back to its pilgrimage/.test(p.message),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a section card outside every route-group is a problem", () => {
  // #given a section card sitting loose in the grid, under no heading
  const root = createFixtureRoot([{ id: "awa", pilgrimage: "shikoku-88" }], {
    pilgrimages: [{ id: "shikoku-88", sections: ["awa"] }],
  });

  try {
    const problems = checkSite(root, { routesHtml: catalogWith(AWA_CARD) });
    assert.ok(
      problems.some(
        (p) =>
          p.file === "docs/routes.html" &&
          /awa/.test(p.message) &&
          /route-group/.test(p.message),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a section card under another pilgrimage's heading is a problem", () => {
  // #given awa's card filed under the Camino de Santiago group
  const root = createFixtureRoot([{ id: "awa", pilgrimage: "shikoku-88" }], {
    pilgrimages: [{ id: "shikoku-88", sections: ["awa"] }],
  });

  try {
    const problems = checkSite(root, {
      routesHtml: catalogWith(
        `<div class="route-group">\n<h3><a href="/camino-de-santiago">Camino de Santiago</a></h3>\n${AWA_CARD}\n</div>`,
      ),
    });

    // #then the group it is in and the one index.json names are both reported
    assert.ok(
      problems.some(
        (p) =>
          p.file === "docs/routes.html" &&
          /camino-de-santiago/.test(p.message) &&
          /shikoku-88/.test(p.message),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a section card under its own pilgrimage's heading is not a problem", () => {
  // #given the shape the catalog is supposed to have
  const root = createFixtureRoot([{ id: "awa", pilgrimage: "shikoku-88" }], {
    pilgrimages: [{ id: "shikoku-88", sections: ["awa"] }],
  });

  try {
    const problems = checkSite(root, {
      routesHtml: catalogWith(
        `<div class="route-group">\n<h3><a href="/shikoku-88">Shikoku 88</a></h3>\n${AWA_CARD}\n</div>`,
      ),
    });

    assert.deepEqual(
      problems.filter((p) => p.message.includes("route-group")),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pilgrimages field that is not an array fails loudly, not silently", () => {
  // #given an index.json whose pilgrimages[] is not a list at all
  const root = createFixtureRoot([{ id: "awa" }], { pilgrimages: "kumano-kodo" });

  try {
    // #when / #then the guard throws rather than reading it as "no
    // pilgrimages" and reporting a site with unchecked pilgrimages as clean
    assert.throws(() => checkSite(root), /pilgrimages/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a pilgrimage entry whose sections are not strings fails loudly", () => {
  // #given a pilgrimage whose sections[] holds something that is not an id
  const root = createFixtureRoot([{ id: "awa" }], {
    pilgrimages: [{ id: "shikoku-88", sections: [{ id: "awa" }] }],
  });

  try {
    // #when / #then the shape is refused by name, the same way a malformed
    // routes[] is
    assert.throws(() => checkSite(root), /pilgrimages/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an index.json with no pilgrimages field at all is not malformed", () => {
  // #given the shape every index.json had before pilgrimages existed
  const root = createFixtureRoot([{ id: "awa" }]);

  try {
    // #when / #then the absent field reads as "no pilgrimages", not as a
    // reason to refuse the file
    assert.doesNotThrow(() => checkSite(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// A Variants section on a route page whose index.json entry declares no
// variants — the shape docs/kumano-kodo-nakahechi.html carried for 18 commits
// after the Iseji became a sibling section. The two prose strings below are
// reproduced verbatim from the committed pages, because the whole design
// question is whether a check can tell a published Variants section apart from
// the word "variant" in a sentence — and one of those sentences is the one
// that fixed this bug.

const NAKAHECHI_DISTANCE_CELL =
  '<tr><th scope="row">Distance</th><td>36 km, measured on this section&#39;s walked line. The ' +
  '<a href="/kumano-kodo-kohechi">Kohechi</a> and the <a href="/kumano-kodo-iseji">Iseji</a> are ' +
  "sibling sections, not variants of this one &mdash; 63 km measured on the Kohechi&#39;s own " +
  "line, and a declared ~170 km on the Iseji that no walked line has measured yet.</td></tr>";

const PRIMITIVO_HOSPITALES_PROSE =
  "<p>The 30.5 km O C&aacute;davo &rarr; Lugo stage is the longest single day on the route; many " +
  "pilgrims split it at Castroverde. Day 5 (Pola de Allande &rarr; La Mesa) crosses Puerto del " +
  "Palo and can optionally be swapped for the higher, more exposed Hospitales variant &mdash; " +
  "not recommended in poor weather.</p>" +
  "<li>Deciding the night before whether to take the Hospitales variant tomorrow</li>" +
  "<li>Meeting pilgrims at Berducedo who took the other variant</li>";

const VARIANTS_TABLE =
  "<table><caption>Metadata-only variants of the Kumano Kodo.</caption>" +
  '<thead><tr><th scope="col">Variant</th><th scope="col">Distance</th></tr></thead>' +
  "<tbody><tr><td>Iseji (Eastern/Coastal Route)</td><td>170 km</td></tr></tbody></table>";

const variantsSectionProblems = (root: string): string[] =>
  checkSite(root)
    .filter((p) => p.message.includes("Variants section"))
    .map((p) => `${p.file}: ${p.message}`);

function variantsFixture(html: string, variants?: FixtureVariant[]): string {
  const root = createFixtureRoot([{ id: "r", ...(variants ? { variants } : {}) }]);
  writeFileSync(join(root, "docs", "r.html"), `<html><body><code>r</code>${html}</body></html>`);
  return root;
}

test("checkSite reports a route page publishing a Variants section its index.json entry has no variants for (fixture — the kumano-kodo-nakahechi bug, reconstructed)", () => {
  // #given the deleted markup: an <h2>Variants</h2> over a table presenting a
  // sibling section as a variant, on a route index.json gives no variants[]
  const root = variantsFixture(`<h2>Variants</h2>${VARIANTS_TABLE}`);

  try {
    // #when checkSite reads the page against index.json
    const problems = variantsSectionProblems(root);

    // #then one problem names the page, the route, and the heading it found
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^docs\/r\.html: publishes a Variants section \(<h2>Variants<\/h2>\)/);
    assert.match(problems[0], /declares no variants for "r"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a variants table left behind under a renamed heading (fixture — the caption anchor, with no <h2>Variants</h2> anywhere on the page)", () => {
  // #given the half-finished edit: the heading rewritten the way b11701e
  // rewrote it, the table beneath it untouched
  const root = variantsFixture(`<h2>The Other Ways</h2>${VARIANTS_TABLE}`);

  try {
    // #when / #then the table's own caption is enough to report it
    const problems = variantsSectionProblems(root);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /publishes a Variants section \(<caption>Metadata-only variants of/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite does not fire on the committed prose that legitimately uses the word 'variant' (fixture — nakahechi:63's denial sentence and the Primitivo's Hospitales route, verbatim)", () => {
  // #given a page with no Variants section at all, carrying the exact sentence
  // that fixed this bug ("are sibling sections, not variants of this one") and
  // the Primitivo's three mentions of the Hospitales route — a real walking
  // alternative that is in no route's variants[]. A keyword check fires on
  // both; this one must not
  const root = variantsFixture(
    `<h2>The Other Ways</h2><table><tbody>${NAKAHECHI_DISTANCE_CELL}</tbody></table>` +
      PRIMITIVO_HOSPITALES_PROSE,
  );

  try {
    // #when / #then nothing is reported
    assert.deepEqual(variantsSectionProblems(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts a route page publishing a Variants section its index.json entry does declare variants for (fixture)", () => {
  // #given docs/camino-ingles.html's shape: one declared variant, one section
  const root = variantsFixture(
    "<h2>Variants</h2><table><caption>Variants of the route.</caption>" +
      "<tbody><tr><td>A Coru&ntilde;a</td><td>75 km</td></tr></tbody></table>",
    [{ id: "a-coruna", distanceKm: 75 }],
  );

  try {
    // #when / #then neither direction of the check reports anything
    assert.deepEqual(variantsSectionProblems(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite is not confused by an Overview table nested inside a Variants section (fixture — docs/camino-portugues.html's shape)", () => {
  // #given the page that puts a full Key Facts table for one variant *inside*
  // its <h2>Variants</h2>, with the metadata-only table under an <h3> after it
  const root = variantsFixture(
    "<h2>Variants</h2><h3>Coastal</h3>" +
      "<table><caption>Overview of the Coastal route.</caption>" +
      '<tbody><tr><th scope="row">Distance</th><td>110 km</td></tr></tbody></table>' +
      "<h3>Other Variants</h3><table><caption>Metadata-only variants of the route.</caption>" +
      "<tbody><tr><td>Espiritual</td><td>73 km</td></tr></tbody></table>",
    [
      { id: "coastal", distanceKm: 110 },
      { id: "espiritual", distanceKm: 73 },
    ],
  );

  try {
    // #when / #then the nested table changes nothing: variants are declared,
    // a section is published, and there is no problem to report
    assert.deepEqual(variantsSectionProblems(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a route whose page publishes no Variants section for the variants index.json declares (fixture — the inverse)", () => {
  // #given the opposite failure: data the site is hiding rather than data the
  // site invented
  const root = variantsFixture("<h2>The Other Ways</h2><p>Nothing about variants here.</p>", [
    { id: "a-coruna", distanceKm: 75 },
  ]);

  try {
    // #when checkSite reads the page against index.json
    const problems = variantsSectionProblems(root);

    // #then one problem names the count and the variant it could not find
    assert.equal(problems.length, 1);
    assert.match(problems[0], /publishes no Variants section, but index\.json declares 1 variant/);
    assert.match(problems[0], /a-coruna/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed docs/{id}.html pages already agree with index.json about which routes have variants (positive control)", () => {
  // #given the committed tree, where camino-ingles declares one variant and
  // camino-portugues three, and the other eight routes declare none
  // #when / #then no route page publishes a Variants section it has no
  // variants for, and no route with variants hides them
  assert.deepEqual(variantsSectionProblems(ROOT), []);
});

// An unqualified plural claim asserts the thing of all of them. The prose
// strings below are reproduced verbatim from the committed pages, because the
// whole design question is whether a check can tell a claim about every
// waypoint apart from the sentences beside it that mention waypoints and claim
// nothing of them all.

const FRANCES_UNIVERSAL_CLAIM =
  "<p>2,957 logistics waypoints are tagged along the route, each with <code>stageIndex</code> " +
  "and <code>kmFromStart</code>, of which 9 are curated sacred sites and 36 are towns.</p>";

const KOHECHI_UNIVERSAL_CLAIM =
  "<p>35 waypoints, every one enriched from OpenStreetMap and carrying its <code>osmId</code>, " +
  "so a re-run of the enricher reproduces the file exactly. None are hand-curated yet. Each has " +
  "a <code>stageIndex</code> and a <code>kmFromStart</code>.</p>";

const NAKAHECHI_COUNTED_CLAIMS =
  "<p>115 waypoints are tagged along the route, all but six with <code>kmFromStart</code>: 21 " +
  "curated &mdash; 18 sacred sites, 2 towns and Yunomine Onsen &mdash; and 94 enriched from " +
  "OpenStreetMap.</p>" +
  "<p>All but three carry a <code>stageIndex</code>. Kumano Nachi Taisha, Nachi Falls and " +
  "Kumano Hayatama Taisha do not.</p>";

const COASTAL_FILES_ROW =
  "<p>Files at <code>routes/camino-portugues/variants/coastal/</code>: " +
  "<code>waypoints.geojson</code> (1,043 waypoints), <code>stats.json</code> (2003&ndash;2025).</p>";

// Every message checkWaypointClaims and the two paragraph readings under it
// emit. The floor and the breakdown are in this list rather than in one of
// their own, because a filter that quietly excludes a new message is the same
// silence the floor exists to refuse — a fixture would go on asserting "nothing
// is reported" while something was.
const waypointClaimProblems = (root: string): string[] =>
  checkSite(root)
    .filter((p) =>
      /waypoints with no |not a figure this guard can read|opens a waypoint claim|opens a paragraph with|breaks its waypoint count down/.test(
        p.message,
      ),
    )
    .map((p) => `${p.file}: ${p.message}`);

// The property claims alone. The two fixtures below reproduce a committed
// sentence verbatim, its published figure included, over a handful of
// synthetic waypoints — so the opening count is reported too, correctly and
// beside the point those two tests are making.
const propertyClaimProblems = (root: string): string[] =>
  waypointClaimProblems(root).filter((problem) => !problem.includes("opens a waypoint claim"));

function waypointFixture(html: string, features: Array<Record<string, unknown>>): string {
  const root = createFixtureRoot([{ id: "r" }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "waypoints.geojson"),
    JSON.stringify({
      type: "FeatureCollection",
      features: features.map((properties) => ({ type: "Feature", properties })),
    }),
  );
  writeFileSync(join(root, "docs", "r.html"), `<html><body><code>r</code>${html}</body></html>`);
  return root;
}

const withBoth = { stageIndex: 1, kmFromStart: 0.5, osmId: 1 };
const withoutKm = { stageIndex: 1, osmId: 1 };
const withoutStageIndex = { kmFromStart: 0.5, osmId: 1 };

test("checkSite reports an 'each with' claim one waypoint does not satisfy (fixture — the kumano-kodo drift, reconstructed)", () => {
  // #given the Camino Francés sentence verbatim over a file where one waypoint
  // carries no kmFromStart — the shape docs/kumano-kodo.html shipped for 208
  // commits, with 6 of 157 missing
  const root = waypointFixture(FRANCES_UNIVERSAL_CLAIM, [withBoth, withBoth, withoutKm]);

  try {
    // #when checkSite reads the claim against the waypoints file
    const problems = propertyClaimProblems(root);

    // #then one problem quotes the claim and names both counts
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^docs\/r\.html: says "each with stageIndex and kmFromStart"/);
    assert.match(problems[0], /holds 1 of 3 waypoints with no kmFromStart/);
    assert.match(problems[0], /asserts it of all 3/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reads every property an 'each with' claim names, not only the first", () => {
  // #given the same sentence over a file failing the *second* property it
  // names — kmFromStart is never the first <code> in any committed wording, so
  // a pattern anchored on it would match nothing at all
  const root = waypointFixture(FRANCES_UNIVERSAL_CLAIM, [withoutStageIndex, withoutKm]);

  try {
    // #when / #then both properties are reported, separately
    const problems = propertyClaimProblems(root);
    assert.equal(problems.length, 2);
    assert.ok(problems.some((p) => p.includes("with no stageIndex")));
    assert.ok(problems.some((p) => p.includes("with no kmFromStart")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite does not fire on the committed prose that mentions waypoints without claiming a property of all of them (fixture — the Kohechi's osmId sentence and the coastal Files row, verbatim)", () => {
  // #given the two sentences beside the claims: the Kohechi's "every one
  // enriched from OpenStreetMap and carrying its osmId", over a file where a
  // waypoint carries no osmId, and the coastal variant's Files row naming a
  // count that belongs to a different file entirely. A keyword check on
  // "waypoints" or on <code>osmId</code> fires on both.
  //
  // The Kohechi's whole committed paragraph, and a file of the size its opening
  // figure names. Written with the "Each has …" sentence stripped and two
  // waypoints behind it, this fixture published a 35 that nothing read — the
  // exact hole checkWaypointCountParagraphs' floor now reports, demonstrated by
  // accident in a test asserting that nothing was wrong
  const root = waypointFixture(KOHECHI_UNIVERSAL_CLAIM + COASTAL_FILES_ROW, [
    ...Array.from({ length: 34 }, () => ({ ...withBoth })),
    { stageIndex: 1, kmFromStart: 0.5 },
  ]);

  try {
    // #when / #then nothing is reported
    assert.deepEqual(waypointClaimProblems(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts both committed wordings of the 'each with' claim when the data satisfies them", () => {
  // #given the Francés sentence and the Kohechi's "Each has a stageIndex and a
  // kmFromStart", over a file where every waypoint carries all three
  const root = waypointFixture(FRANCES_UNIVERSAL_CLAIM + KOHECHI_UNIVERSAL_CLAIM, [
    { ...withBoth },
    { ...withBoth },
  ]);

  try {
    // #when / #then neither wording is reported, and neither opening figure is
    // read as wrong — 2,957 and 35 sit in paragraphs whose claims are true,
    // but the counts themselves are checked, so this pins that too
    const problems = waypointClaimProblems(root);
    assert.equal(problems.length, 2);
    assert.ok(problems.every((p) => p.includes("opens a waypoint claim")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports an 'all but N' claim whose figure is wrong (fixture — the Nakahechi's own wording, off by one)", () => {
  // #given docs/kumano-kodo-nakahechi.html:171's sentence over a file where
  // seven waypoints, not six, carry no kmFromStart
  const root = waypointFixture(NAKAHECHI_COUNTED_CLAIMS, [
    withBoth,
    ...Array.from({ length: 7 }, () => ({ ...withoutKm })),
  ]);

  try {
    // #when checkSite reads the figure against the file
    const problems = waypointClaimProblems(root).filter((p) => p.includes("kmFromStart"));

    // #then the "all but six" figure is named as wrong, against the true one
    assert.equal(problems.length, 1);
    assert.match(problems[0], /says "all but six with kmFromStart"/);
    assert.match(problems[0], /holds 7 of 8 waypoints with no kmFromStart/);
    assert.match(problems[0], /correct the figure to 7/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports an 'all but N' figure it cannot read as a number, rather than passing over it", () => {
  // #given a claim whose count is a word no reader can compare against data —
  // an unreadable claim is precisely the state in which a drift goes unseen
  const root = waypointFixture(
    "<p>3 waypoints are tagged along the route, all but several with <code>kmFromStart</code>.</p>",
    [withBoth, withoutKm, withoutKm],
  );

  try {
    // #when / #then it is reported, and the message still names the true count
    const problems = waypointClaimProblems(root);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /naming "several" as the number of waypoints without a kmFromStart/);
    assert.match(problems[0], /holds 2 of 3 waypoints with no kmFromStart/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts the Nakahechi's committed 'all but N' wording when both figures are exact", () => {
  // #given both counted sentences verbatim, over a file with exactly six
  // waypoints lacking kmFromStart and three lacking stageIndex, opening on a
  // figure that is the file's own total
  const root = waypointFixture(
    "<p>10 waypoints are tagged along the route, all but six with <code>kmFromStart</code>.</p>" +
      "<p>All but three carry a <code>stageIndex</code>.</p>",
    [
      ...Array.from({ length: 6 }, () => ({ ...withoutKm })),
      ...Array.from({ length: 3 }, () => ({ ...withoutStageIndex })),
      { ...withBoth },
    ],
  );

  try {
    // #when / #then nothing is reported
    assert.deepEqual(waypointClaimProblems(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports the figure a waypoint claim's sentence opens with (fixture — docs/camino-norte.html's published 3,634 against a file that never held it)", () => {
  // #given the shape 01595c5 and 1b8cc6c shipped: a leading count no longer
  // its file's, in a sentence whose property claim is perfectly true
  const root = waypointFixture(
    "<p>3,634 logistics waypoints are tagged along the route, each with <code>stageIndex</code> " +
      "and <code>kmFromStart</code>.</p>",
    [withBoth, withBoth],
  );

  try {
    // #when checkSite reads the opening figure against the file
    const problems = waypointClaimProblems(root);

    // #then only the figure is reported, and both numbers are named alike
    assert.equal(problems.length, 1);
    assert.match(problems[0], /opens a waypoint claim with "3,634 logistics waypoints"/);
    assert.match(problems[0], /but routes\/r\/waypoints\.geojson holds 2 —/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite does not read a 'N waypoints' figure out of a paragraph that makes no claim about them", () => {
  // #given the coastal variant's Files row, whose 1,043 belongs to a different
  // file, in a page whose own claim paragraph opens with the right figure
  const root = waypointFixture(
    "<p>2 waypoints are tagged along the route, each with <code>kmFromStart</code>.</p>" +
      COASTAL_FILES_ROW,
    [withBoth, withBoth],
  );

  try {
    // #when / #then nothing is reported
    assert.deepEqual(waypointClaimProblems(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite does not measure an 'each with' claim about something other than waypoints against waypoints.geojson", () => {
  // #given a paragraph claiming a property of every *stage*, over a file whose
  // waypoints all lack it. "each with <code>…</code>" names no noun of its
  // own, so nothing but the paragraph around it says what "each" ranges over
  const root = waypointFixture(
    "<p>Ten stages are described here, each with <code>terrainNotes</code>.</p>",
    [withBoth, withBoth],
  );

  try {
    // #when / #then nothing is reported — not "2 of 2 waypoints with no terrainNotes"
    assert.deepEqual(waypointClaimProblems(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed detail pages already make no waypoint claim their own data does not support (positive control)", () => {
  // #given the committed tree, where seven pages claim "each with stageIndex
  // and kmFromStart" and none of those routes has a waypoint missing either,
  // the Nakahechi's "all but six" and "all but three" are exact, all eight
  // opening figures are read, and the three "of which" breakdowns are exact
  // #when / #then nothing is reported
  assert.deepEqual(waypointClaimProblems(ROOT), []);
});

// The floor under the opening count. Until checkWaypointCountParagraphs
// existed, that reading ran only from inside the two claim loops, so an edit
// that reworded the claim beside a figure took the figure's own check down with
// it — in silence, exit 0. See its doc comment for why a paragraph-opening
// anchor is enough to stand alone.

test("checkSite reports a published waypoint count no claim on the page brings under check (fixture — a wrong figure whose neighbouring claim was reworded)", () => {
  // #given the two-step mutation: a figure that is not the file's, in a
  // sentence whose "each with" has been reworded to "all carrying". The figure
  // alone is reported; reword the claim and, without this floor, the same wrong
  // figure passes clean
  const root = waypointFixture(
    "<p>2,000 logistics waypoints are tagged along the route, all carrying " +
      "<code>stageIndex</code> and <code>kmFromStart</code>.</p>",
    [withBoth, withBoth],
  );

  try {
    // #when checkSite walks the page's paragraphs
    const problems = waypointClaimProblems(root);

    // #then the paragraph is reported as unread, and the true count named
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^docs\/r\.html: opens a paragraph with "2,000 logistics waypoints"/);
    assert.match(problems[0], /no waypoint claim in it brings under check/);
    assert.match(problems[0], /routes\/r\/waypoints\.geojson holds 2/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the floor does not ask a page that publishes no waypoint count to publish one", () => {
  // #given a page whose only "each with" claim is about stages, over a route
  // that ships a waypoints.geojson. Nothing opens a paragraph with a count, so
  // there is no published figure to go unread — a floor demanding one would
  // false-positive on the first page shape it met
  const root = waypointFixture(
    "<p>Ten stages are described here, each with <code>terrainNotes</code>.</p>" +
      COASTAL_FILES_ROW,
    [withBoth, withBoth],
  );

  try {
    // #when / #then nothing is reported
    assert.deepEqual(waypointClaimProblems(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The breakdown clause: "…, of which 9 are curated sacred sites and 36 are
// towns". 047a1ae reworded three of these from "plus" and left their figures
// unchecked — the same drift class as the total they sit beside, one clause to
// the right.

function writeWaypointsSchema(root: string, enumValues: string[]): void {
  mkdirSync(join(root, "schema"), { recursive: true });
  writeFileSync(
    join(root, "schema", "waypoints.schema.json"),
    JSON.stringify({
      $defs: {
        WaypointFeature: { properties: { properties: { properties: { type: { enum: enumValues } } } } },
      },
    }),
  );
}

const WAYPOINT_TYPES = ["town", "sacred_site", "water_source", "accommodation", "cultural_site"];

const FRANCES_BREAKDOWN_CLAIM =
  "<p>4 logistics waypoints are tagged along the route, each with <code>stageIndex</code> " +
  "and <code>kmFromStart</code>, of which 9 are curated sacred sites and 36 are towns.</p>";

const sacred = { stageIndex: 1, kmFromStart: 0.5, type: "sacred_site" };
const town = { stageIndex: 1, kmFromStart: 0.5, type: "town" };

test("checkSite reports the extras figures a waypoint claim's 'of which' clause names (fixture — docs/camino-frances.html's sentence over a file holding neither figure)", () => {
  // #given the committed sentence verbatim, its total corrected to the fixture
  // file's, over four waypoints of which one is a sacred site and one a town.
  // Before this check, 9 and 36 could say anything at all
  const root = waypointFixture(FRANCES_BREAKDOWN_CLAIM, [sacred, town, withBoth, withBoth]);
  writeWaypointsSchema(root, WAYPOINT_TYPES);

  try {
    // #when checkSite reads each extras figure against the per-type count
    const problems = waypointClaimProblems(root);

    // #then both are reported, each naming its type and the true count
    assert.equal(problems.length, 2);
    assert.match(problems[0], /breaks its waypoint count down as "9 are curated sacred sites"/);
    assert.match(problems[0], /holds 1 of type sacred_site — correct the figure to 1/);
    assert.match(problems[1], /breaks its waypoint count down as "36 are towns"/);
    assert.match(problems[1], /holds 1 of type town — correct the figure to 1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an 'of which' clause whose figures match the per-type counts is accepted", () => {
  // #given the same sentence with both figures corrected, and the two shapes of
  // trailing prose the other two committed clauses carry — a modifier before
  // the noun and an aside after it
  const root = waypointFixture(
    "<p>4 logistics waypoints are tagged along the route, each with <code>stageIndex</code> " +
      "and <code>kmFromStart</code>, of which 2 are curated sacred sites and 2 are towns " +
      "enriched from OpenStreetMap.</p>",
    [sacred, sacred, town, town],
  );
  writeWaypointsSchema(root, WAYPOINT_TYPES);

  try {
    // #when / #then nothing is reported
    assert.deepEqual(waypointClaimProblems(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports an extras noun that resolves to no waypoint type, rather than passing over it", () => {
  // #given a clause naming something schema/waypoints.schema.json does not
  // declare. A noun this cannot resolve is a figure that goes unchecked, which
  // is the state a drift hides in — the same reading the unreadable "all but N"
  // figure gets
  const root = waypointFixture(
    "<p>2 logistics waypoints are tagged along the route, each with <code>stageIndex</code>, " +
      "of which 1 are curated shrines.</p>",
    [sacred, town],
  );
  writeWaypointsSchema(root, WAYPOINT_TYPES);

  try {
    // #when / #then it is reported, and the message says what it looked in
    const problems = waypointClaimProblems(root);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /breaks its waypoint count down as "1 are curated shrines"/);
    assert.match(problems[0], /names no waypoint type in schema\/waypoints\.schema\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite does not read a 'N are …' phrase outside an 'of which' clause as a type breakdown", () => {
  // #given docs/kumano-kodo-nakahechi.html:171's own sentence, whose "The other
  // 14 are in no file at all" is the false positive a paragraph-wide reading
  // produces and the reason the clause anchor is "of which"
  const root = waypointFixture(
    "<p>2 waypoints are tagged along the route, all but one with " +
      "<code>kmFromStart</code>. The other 14 are in no file at all.</p>",
    [{ stageIndex: 1, kmFromStart: 0.5, type: "town" }, { stageIndex: 1, type: "town" }],
  );
  writeWaypointsSchema(root, WAYPOINT_TYPES);

  try {
    // #when / #then nothing is reported
    assert.deepEqual(waypointClaimProblems(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The drafted claim, and the reading this check deliberately does not take.
// At be6cea9 the Kohechi's card on docs/index.html still read "the stage text
// is drafted and awaiting review" after three of its four stages had been
// reviewed and their flags cleared. One stage was still drafted, so a check
// asking only "is some stage drafted?" stayed green on the one page that was
// wrong — see DRAFTED_STAGE_TEXT_CLAIM_PATTERN for the replay figures.

const KOHECHI_CARD_STATUS_AT_BE6CEA9 =
  "No waypoints curated yet, and the stage text is drafted and awaiting review. " +
  '<a href="/contribute">Help complete it</a>';

const KOHECHI_CARD_STATUS_TODAY =
  "Geometry, four stages and elevation measured on the walked line, all four stages&#39; text " +
  "reviewed and cleared, and 35 waypoints &mdash; those measured against this section&#39;s own " +
  "relation instead";

const FIXTURE_GLYPH_D = "M10,10 L20,20 L30,10";
const OTHER_FIXTURE_GLYPH_D = "M40,40 L50,50 L60,40";

// The neighbouring card's claim: unqualified too, so a reading that lands on
// the wrong card still reports something, and is caught by what it quotes
// rather than by how many problems come back.
const OTHER_CARD_STATUS = "All stages are drafted and awaiting review.";

/**
 * A page shaped like docs/index.html rather than a single card, because the
 * shape is the whole difficulty. That page inlines seven of its eight card
 * glyphs three times — a glyph-fog and a glyph-ink copy in the hero
 * constellation above the grid, then once more in the card — so a reading that
 * walks backward from the first occurrence of a glyph lands in the
 * constellation and finds no card at all. A one-card page carrying one copy of
 * its glyph cannot tell that reading apart from the forward walk over the
 * cards, which is the one that works.
 *
 * The route under test is the *second* card, under a hero that inlines its
 * glyph twice, so a reading that simply takes the first card is caught too.
 */
function draftedIndexHtml(status: string, otherStatus = OTHER_CARD_STATUS): string {
  const inlined = (d: string): string => `<path pathLength="1" d="${d}"/>`;

  return (
    "<html><body>" +
    '<div class="constellation" data-constellation>' +
    `<svg>${inlined(OTHER_FIXTURE_GLYPH_D)}${inlined(OTHER_FIXTURE_GLYPH_D)}</svg>` +
    `<svg>${inlined(FIXTURE_GLYPH_D)}${inlined(FIXTURE_GLYPH_D)}</svg>` +
    "</div>" +
    '<div class="route-grid">' +
    '<div class="route-card">' +
    `<h3><svg class="route-glyph">${inlined(OTHER_FIXTURE_GLYPH_D)}</svg> S</h3>` +
    "<p>Another route.</p>" +
    `<div class="route-status route-status-needs">${otherStatus}</div>` +
    "</div>" +
    '<div class="route-card">' +
    `<h3><svg class="route-glyph">${inlined(FIXTURE_GLYPH_D)}</svg> R</h3>` +
    "<p>A route.</p>" +
    `<div class="route-status route-status-needs">${status}</div>` +
    "</div>" +
    "</div></body></html>"
  );
}

const draftedClaimProblems = (root: string, indexHtml?: string): string[] =>
  checkSite(root, indexHtml === undefined ? {} : { indexHtml })
    .filter((p) => p.message.includes("stages drafted: true"))
    .map((p) => `${p.file}: ${p.message}`);

function draftedFixture(draftedFlags: boolean[], pageHtml = "", withGlyph = true): string {
  const root = createFixtureRoot([{ id: "r" }]);
  mkdirSync(join(root, "routes", "r"), { recursive: true });
  writeFileSync(
    join(root, "routes", "r", "stages.json"),
    JSON.stringify({
      stages: draftedFlags.map((drafted, index) => ({ index: index + 1, drafted })),
    }),
  );
  if (withGlyph) {
    mkdirSync(join(root, "docs", "assets", "routes"), { recursive: true });
    writeFileSync(
      join(root, "docs", "assets", "routes", "r.svg"),
      `<svg><path d="${FIXTURE_GLYPH_D}"/></svg>`,
    );
  }
  writeFileSync(join(root, "docs", "r.html"), `<html><body><code>r</code>${pageHtml}</body></html>`);
  return root;
}

test("checkSite reports an index card claiming drafted stage text after most of it was reviewed (fixture — be6cea9, reconstructed)", () => {
  // #given the card's own status prose at be6cea9, verbatim, over a route
  // whose stages.json says one of four is still drafted
  const root = draftedFixture([true, false, false, false]);

  try {
    // #when checkSite reads the card against stages.json
    const problems = draftedClaimProblems(root, draftedIndexHtml(KOHECHI_CARD_STATUS_AT_BE6CEA9));

    // #then the claim is reported against the card, and both counts are named
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^docs\/index\.html: says of "r" that the stage text is drafted,/);
    assert.match(problems[0], /marks 1 of its 4 stages drafted: true/);
    assert.match(problems[0], /asserts it of all 4; reword it to name the 1 still drafted/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a check asking only whether some stage is drafted would have stayed green on be6cea9's card — this one does not", () => {
  // #given the same card and the same one-of-four state, which is exactly the
  // configuration in which the existence reading reports nothing
  const root = draftedFixture([true, false, false, false]);

  try {
    // #when / #then the report exists, and it exists *because* three stages
    // were cleared rather than because none was drafted
    const problems = draftedClaimProblems(root, draftedIndexHtml(KOHECHI_CARD_STATUS_AT_BE6CEA9));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /1 of its 4 stages/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reads the status prose off the route's own card, not the copy of its glyph in the hero constellation above the grid", () => {
  // #given the page shape docs/index.html actually has: the route's glyph
  // inlined twice in the hero before the grid begins, its card second, and a
  // first card carrying a different route's glyph and a different claim.
  // Walking backward from the first occurrence of the glyph lands in the
  // constellation, where lastIndexOf('<div class="route-card"') finds nothing
  const root = draftedFixture([true, false, false, false]);

  try {
    // #when checkSite resolves the card for "r"
    const problems = draftedClaimProblems(root, draftedIndexHtml(KOHECHI_CARD_STATUS_AT_BE6CEA9));

    // #then it finds the card, and it finds the right one — the neighbour's
    // claim is just as unqualified and is not what comes back
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^docs\/index\.html: says of "r" that the stage text is drafted,/);
    assert.doesNotMatch(problems[0], /All stages are drafted/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite does not fire on drafted-language that names which stages it means (fixture — the qualified forms, and the Kohechi's card today)", () => {
  // #given the card as it reads today, and five qualified claims a page may
  // honestly make while three of four stages stand reviewed. A keyword check
  // on "drafted" or "awaiting review" fires on all six. "Half the stages" and
  // "One of the stages" are the two shapes the pattern's lookbehind exists
  // for: both put the bare noun phrase in the middle of a partial claim
  const root = draftedFixture(
    [true, false, false, false],
    "<p>One of the stages is drafted and awaiting review.</p>" +
      "<p>The remaining stage is drafted.</p>" +
      "<p>Half the stages are drafted.</p>" +
      "<p>The first two stages are drafted.</p>" +
      "<p>Three of the four stages are reviewed; the last is awaiting review.</p>",
  );

  try {
    // #when / #then nothing is reported, on the page or on the card
    assert.deepEqual(draftedClaimProblems(root, draftedIndexHtml(KOHECHI_CARD_STATUS_TODAY)), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite does not fire on a hedged universal — each of these is true exactly when this check fires", () => {
  // #given the predeterminer forms, "not all the stages are drafted" first,
  // which is the most natural correction anyone would write for the sentence
  // this check exists to catch. The hedge stands before the noun phrase, so
  // blocking "all" as a preceding word would mean rejecting the phrase itself
  const root = draftedFixture(
    [true, false, false, false],
    "<p>Not all the stages are drafted.</p>" +
      "<p>Nearly all the stages are drafted.</p>" +
      "<p>Almost all the stages are drafted.</p>" +
      "<p>Not all stages are drafted.</p>" +
      "<p>Not every stage is drafted.</p>",
  );

  try {
    // #when / #then nothing is reported, on the page or on the card
    assert.deepEqual(draftedClaimProblems(root, draftedIndexHtml(KOHECHI_CARD_STATUS_TODAY)), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite still reports the genuine universal the hedge guard stands next to", () => {
  // #given the same words the hedges qualify, with nothing qualifying them —
  // the claim the guard must not cost us
  const root = draftedFixture([true, false, false, false], "<p>All the stages are drafted.</p>");

  try {
    // #when / #then it is reported, against the page's own stage counts
    const problems = draftedClaimProblems(root, draftedIndexHtml(KOHECHI_CARD_STATUS_TODAY));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^docs\/r\.html: says of "r" that the stages are drafted,/);
    assert.match(problems[0], /marks 1 of its 4 stages drafted: true/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts an unqualified drafted claim when every stage really is drafted", () => {
  // #given the card at 38e3866, before any of the four stages was reviewed —
  // the same sentence, true when it was written
  const root = draftedFixture([true, true, true, true]);

  try {
    // #when / #then nothing is reported
    assert.deepEqual(
      draftedClaimProblems(root, draftedIndexHtml(KOHECHI_CARD_STATUS_AT_BE6CEA9)),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a drafted claim on a route's own detail page, not only on its index card", () => {
  // #given the claim on the page itself, and a route with no card at all —
  // kumano-kodo-iseji and kumano-kodo-ohechi have none, by design
  const root = draftedFixture(
    [true, false],
    "<p>All stages are drafted and awaiting review.</p>",
    false,
  );

  try {
    // #when / #then the page is reported and the missing card is not
    const problems = draftedClaimProblems(root, draftedIndexHtml(KOHECHI_CARD_STATUS_AT_BE6CEA9));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^docs\/r\.html: says of "r" that All stages are drafted,/);
    assert.match(problems[0], /marks 1 of its 2 stages drafted: true/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a drafted claim in the README's row for that route", () => {
  // #given the README's route table carrying the claim on the route's own row
  const root = draftedFixture([false, false]);
  const readmeMd =
    "| Route | Distance | Status |\n" +
    "| [Camino Frances](routes/camino-frances/) | 764 km | Fully enriched |\n" +
    "| [R](routes/r/) | 10 km | The stage text is still drafted |\n";

  try {
    // #when / #then the row is reported, and the remedy names the zero case
    const problems = checkSite(root, { readmeMd })
      .filter((p) => p.message.includes("stages drafted: true"))
      .map((p) => `${p.file}: ${p.message}`);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^README\.md: says of "r" that The stage text is still drafted,/);
    assert.match(problems[0], /marks 0 of its 2 stages drafted: true/);
    assert.match(problems[0], /drop the claim, or mark the stages drafted again/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed docs/ and README.md publish no drafted claim, and no stage is drafted (positive control)", () => {
  // #given the committed tree, where none of the three phrases appears in any
  // docs/*.html or in README.md and no stages.json carries drafted: true
  // #when / #then nothing is reported in either direction
  assert.deepEqual(draftedClaimProblems(ROOT), []);
});

// Which group the README files a route under. Both drifts this reads for were
// wrong-heading drifts — see README_GROUP_HEADING_PATTERN for the replay
// figures, and for why a row under no heading at all is deliberately silent.

const KUMANO_PILGRIMAGE = {
  id: "kumano-kodo",
  name: { en: "Kumano Kodō", ja: "熊野古道" },
  sections: ["kumano-kodo-nakahechi", "kumano-kodo-ohechi"],
};

const CAMINO_PILGRIMAGE = {
  id: "camino-de-santiago",
  name: { en: "Camino de Santiago", es: "Camino de Santiago" },
  sections: ["camino-frances"],
};

const TABLE_HEADER = "| Route | Distance |\n|-------|----------|\n";

const NAKAHECHI_ROW = "| [Kumano Kodo (Nakahechi)](routes/kumano-kodo-nakahechi/) | 36 km |\n";
const OHECHI_ROW = "| [Ōhechi](routes/kumano-kodo-ohechi/) | 90 km |\n";
const FRANCES_ROW = "| [Camino Frances](routes/camino-frances/) | 764 km |\n";
const SHIKOKU_ROW = "| [Shikoku 88](routes/shikoku-88/) | 1,200 km |\n";

// README.md:19's shape. The link carries two path segments past the route id,
// which the id pattern cannot cross, so the row falls out of the scan — a
// variant has no pilgrimage membership of its own to be filed by.
const COASTAL_ROW =
  "| [Camino Portugués da Costa (Coastal)](routes/camino-portugues/variants/coastal/) | 110 km |\n";

function groupingRoot(): string {
  return createFixtureRoot(
    [
      { id: "kumano-kodo-nakahechi", pilgrimage: "kumano-kodo" },
      { id: "kumano-kodo-ohechi", pilgrimage: "kumano-kodo" },
      { id: "camino-frances", pilgrimage: "camino-de-santiago" },
      { id: "camino-portugues", pilgrimage: "camino-de-santiago" },
      { id: "shikoku-88" },
    ],
    { pilgrimages: [KUMANO_PILGRIMAGE, CAMINO_PILGRIMAGE] },
  );
}

const groupingProblems = (root: string, readmeMd: string): string[] =>
  checkSite(root, { readmeMd })
    .filter((p) => p.file === "README.md" && p.message.includes("is filed under"))
    .map((p) => p.message);

test("checkSite reports sections filed under a heading that is not their pilgrimage's name (fixture — ad51008, reconstructed)", () => {
  // #given the README shape ad51008 shipped and nine commits carried: all four
  // Kumano rows left under "### Other Routes" while index.json gave every one
  // of them a pilgrimage block
  const root = groupingRoot();
  const readmeMd =
    "### Kumano Kodō\n\nFour alternative ways to the same three shrines.\n\n" +
    "### Other Routes\n\nRoutes that belong to no pilgrimage grouping yet.\n\n" +
    TABLE_HEADER +
    NAKAHECHI_ROW +
    OHECHI_ROW;

  try {
    // #when checkSite reads each row's heading against index.json
    const problems = groupingProblems(root, readmeMd);

    // #then both rows are reported, and each names the heading it sits under
    // and the one its pilgrimage's name.en asks for
    assert.equal(problems.length, 2);
    assert.match(
      problems[0],
      /^section "kumano-kodo-nakahechi" is filed under "### Other Routes", but index\.json says it belongs to pilgrimage "kumano-kodo", whose name is "Kumano Kodō" — move the row under "### Kumano Kodō"$/,
    );
    assert.match(problems[1], /^section "kumano-kodo-ohechi" is filed under "### Other Routes"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a route that names no pilgrimage filed under a pilgrimage's heading (fixture — 8c56bac, reconstructed)", () => {
  // #given the other real drift: the commit that first split the one table put
  // shikoku-88, which names no pilgrimage, under "### Camino de Santiago"
  const root = groupingRoot();
  const readmeMd = "### Camino de Santiago\n\n" + TABLE_HEADER + FRANCES_ROW + SHIKOKU_ROW;

  try {
    // #when checkSite reads both rows under that heading
    const problems = groupingProblems(root, readmeMd);

    // #then only the unaffiliated one is reported, and the report names the
    // pilgrimage whose name the heading is
    assert.equal(problems.length, 1);
    assert.match(
      problems[0],
      /^route "shikoku-88" is filed under "### Camino de Santiago", which is pilgrimage "camino-de-santiago"'s own name, but index\.json gives "shikoku-88" no pilgrimage/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite does not report a route table that carries no ### heading at all (fixture — 75a92dd, reconstructed)", () => {
  // #given the README as it stood for the 15 commits from 75a92dd: one
  // unheaded table under "## What's In the Box", every Camino row already
  // carrying a pilgrimage block in the data. A rule that demanded a heading
  // reports 5 times on each of those commits, the first inside a data-only one
  const root = groupingRoot();
  const readmeMd =
    "## What's In the Box\n\n" + TABLE_HEADER + FRANCES_ROW + NAKAHECHI_ROW + SHIKOKU_ROW;

  try {
    // #when / #then nothing is reported — the absence of a heading is a README
    // shape, not a claim about the data
    assert.deepEqual(groupingProblems(root, readmeMd), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts rows filed under their pilgrimage's own name.en, macron included", () => {
  // #given the README as it reads today: two pilgrimage headings matching
  // index.json's name.en exactly, and an "### Other Routes" for the route that
  // belongs to neither
  const root = groupingRoot();
  const readmeMd =
    "### Camino de Santiago\n\n" +
    TABLE_HEADER +
    FRANCES_ROW +
    COASTAL_ROW +
    "\n### Kumano Kodō\n\n" +
    TABLE_HEADER +
    NAKAHECHI_ROW +
    OHECHI_ROW +
    "\n### Other Routes\n\n" +
    TABLE_HEADER +
    SHIKOKU_ROW;

  try {
    // #when / #then nothing is reported
    assert.deepEqual(groupingProblems(root, readmeMd), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reads a pilgrimage heading whole — a heading that merely contains the name is a different heading", () => {
  // #given the two near misses a hand-edited README grows: the macron dropped,
  // and the name wrapped in words. Both would pass a substring reading
  const root = groupingRoot();
  const readmeMd =
    "### Kumano Kodo\n\n" +
    TABLE_HEADER +
    NAKAHECHI_ROW +
    "\n### The Kumano Kodō Sections\n\n" +
    TABLE_HEADER +
    OHECHI_ROW;

  try {
    // #when / #then both are reported, each naming the heading it read
    const problems = groupingProblems(root, readmeMd);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /filed under "### Kumano Kodo", but index\.json says/);
    assert.match(problems[1], /filed under "### The Kumano Kodō Sections", but index\.json says/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite does not file the coastal variant's README row under a pilgrimage heading", () => {
  // #given README.md:19's row under the heading its parent does not belong to.
  // The link is routes/camino-portugues/variants/coastal/, and a variant has no
  // pilgrimage membership of its own for a heading to disagree with
  const root = groupingRoot();
  const readmeMd = "### Other Routes\n\n" + TABLE_HEADER + COASTAL_ROW;

  try {
    // #when / #then nothing is reported
    assert.deepEqual(groupingProblems(root, readmeMd), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed README.md files every route under the group index.json gives it (positive control)", () => {
  // #given the committed tree, where five Camino rows sit under "### Camino de
  // Santiago", four Kumano rows under "### Kumano Kodō", and shikoku-88 under
  // "### Other Routes"
  // #when / #then nothing is reported
  assert.deepEqual(
    checkSite(ROOT)
      .filter((p) => p.file === "README.md" && p.message.includes("is filed under"))
      .map((p) => p.message),
    [],
  );
});

// docs/contribute.html's asks, read against the data. See NEED_TAG_SPAN_PATTERN for
// the name-matching alternative this replaced, for why the key is an
// attribute, and for the ruling that a variant's completeness is not something
// index.json can be asked about.

const GENERAL_TAGS =
  '<span class="need-tag">New routes from other traditions</span>' +
  '<span class="need-tag">Walking experiences &amp; local knowledge</span>' +
  '<span class="need-tag">Data corrections &amp; waypoint additions</span>';

const WAYS_BLOCK = { stageCount: 4, bytes: 1024, placesPerStage: 2, sparse: false };

function needTagsRoot(routes: FixtureRoute[], tags: string): string {
  const root = createFixtureRoot(routes);
  writeFileSync(
    join(root, "docs", "contribute.html"),
    "<html><body><h2>What We Need Most</h2>" +
      `<div class="need-tags">${GENERAL_TAGS}${tags}</div>` +
      "</body></html>",
  );
  return root;
}

const needTagProblems = (root: string): string[] =>
  checkSite(root)
    .filter((p) => p.file === "docs/contribute.html")
    .map((p) => p.message);

test("checkSite reports a need tag asking for work on a section that already ships a ways package", () => {
  // #given the tag naming the Nakahechi — the section a display-name match
  // lands on for the tag about the Iseji and the Ōhechi, and the one that
  // makes that match a false positive on today's tree rather than merely a
  // wrong reading
  const root = needTagsRoot(
    [
      { id: "kumano-kodo-nakahechi", ways: WAYS_BLOCK },
      { id: "kumano-kodo-iseji" },
    ],
    '<span class="need-tag" data-needs="section:kumano-kodo-nakahechi section:kumano-kodo-iseji">' +
      "Kumano Kodo sections without geometry (Iseji, &#332;hechi)</span>",
  );

  try {
    // #when checkSite reads both refs against index.json
    const problems = needTagProblems(root);

    // #then only the section with a package is reported, and the report names
    // the ask and the section it read
    assert.equal(problems.length, 1);
    assert.match(
      problems[0],
      /^need tag "Kumano Kodo sections without geometry \(Iseji, Ōhechi\)" asks for work on section "kumano-kodo-nakahechi", but index\.json publishes a ways package for "kumano-kodo-nakahechi" and its metadata\.json declares no metadataOnly/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite does not report a need tag for a section whose ways package the length gate withheld", () => {
  // #given the shape build-index actually produces for a route whose package
  // fails the gate: a routes/{id}/ways/ directory on disk and no ways block in
  // index.json. Four of the eight routes with that directory are in it today,
  // and each genuinely still needs work
  const root = needTagsRoot(
    [{ id: "camino-ingles" }],
    '<span class="need-tag" data-needs="section:camino-ingles">Camino Ingl&eacute;s</span>',
  );
  mkdirSync(join(root, "routes", "camino-ingles", "ways"), { recursive: true });
  writeFileSync(join(root, "routes", "camino-ingles", "ways", "report.json"), "{}");

  try {
    // #when / #then nothing is reported — the directory is not the signal, the
    // block is
    assert.deepEqual(needTagProblems(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite does not report a need tag for a section that ships a ways package and declares metadataOnly", () => {
  // #given both halves of the signal in conflict. No section holds both today
  // — one with no line has no package to build — but a section declaring it
  // can never have geometry is never one whose asks are finished
  const root = needTagsRoot(
    [{ id: "kumano-kodo-ohechi", ways: WAYS_BLOCK }],
    '<span class="need-tag" data-needs="section:kumano-kodo-ohechi">&#332;hechi</span>',
  );
  mkdirSync(join(root, "routes", "kumano-kodo-ohechi"), { recursive: true });
  writeFileSync(
    join(root, "routes", "kumano-kodo-ohechi", "metadata.json"),
    OHECHI_METADATA_ONLY,
  );

  try {
    // #when / #then nothing is reported
    assert.deepEqual(needTagProblems(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a data-needs ref that resolves to nothing in index.json", () => {
  // #given the three ways a hand-edited ref goes wrong: a section id that is
  // not a route, a variant of a route that has none of that name, and a bare
  // id carrying no kind at all. Every one of them would otherwise switch the
  // completeness check off in silence
  const root = needTagsRoot(
    [{ id: "camino-portugues", variants: [{ id: "coastal", distanceKm: 110 }] }],
    '<span class="need-tag" data-needs="section:kumano-kodo-ohechii">A</span>' +
      '<span class="need-tag" data-needs="variant:camino-portugues/espirtual">B</span>' +
      '<span class="need-tag" data-needs="camino-portugues">C</span>',
  );

  try {
    // #when checkSite resolves each ref
    const problems = needTagProblems(root);

    // #then all three are reported, each naming what it looked for and what
    // index.json holds instead
    assert.equal(problems.length, 3);
    assert.match(
      problems[0],
      /^need tag "A" names section "kumano-kodo-ohechii", which is not a route in index\.json/,
    );
    assert.match(
      problems[1],
      /^need tag "B" names variant "camino-portugues\/espirtual", but index\.json gives "camino-portugues" the variants coastal/,
    );
    assert.match(
      problems[2],
      /^need tag "C" carries data-needs ref "camino-portugues", which is neither section:<route-id> nor variant:<route-id>\/<variant-id>$/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite accepts the four specific tags docs/contribute.html publishes today, and asks nothing of the three general ones", () => {
  // #given today's page: two sections without geometry, three variant stubs,
  // and the Coastal — which ships full geometry while the tag about it asks
  // for a Spanish continuation no file in this repo records the absence of.
  // The three general asks carry no data-needs and name nothing to check
  const root = needTagsRoot(
    [
      { id: "kumano-kodo-iseji" },
      { id: "kumano-kodo-ohechi" },
      { id: "camino-ingles", variants: [{ id: "a-coruna", distanceKm: 75 }] },
      {
        id: "camino-portugues",
        variants: [
          { id: "coastal", distanceKm: 110 },
          { id: "espiritual", distanceKm: 73 },
          { id: "lisboa", distanceKm: 620 },
        ],
      },
    ],
    '<span class="need-tag" data-needs="section:kumano-kodo-iseji section:kumano-kodo-ohechi">K</span>' +
      '<span class="need-tag" data-needs="variant:camino-ingles/a-coruna">I</span>' +
      '<span class="need-tag" data-needs="variant:camino-portugues/espiritual variant:camino-portugues/lisboa">P</span>' +
      '<span class="need-tag" data-needs="variant:camino-portugues/coastal">C</span>',
  );

  try {
    // #when / #then nothing is reported
    assert.deepEqual(needTagProblems(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkSite reports a contribute page whose asks are no longer need-tag spans", () => {
  // #given the page rewritten into markup this check cannot read. Zero tags on
  // a page that exists is the state in which the whole check goes silent
  const root = createFixtureRoot([{ id: "kumano-kodo-iseji" }]);
  writeFileSync(
    join(root, "docs", "contribute.html"),
    "<html><body><h2>What We Need Most</h2><ul><li>Kumano Kodo sections</li></ul></body></html>",
  );

  try {
    // #when / #then the page is reported rather than passed over
    const problems = needTagProblems(root);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^has no <span class="need-tag"> asks under its "What We Need Most" heading/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed docs/contribute.html asks for nothing the data says is finished (positive control)", () => {
  // #given the committed page, whose four specific tags name two sections
  // without geometry and four variants, and whose three general tags name
  // nothing
  // #when / #then nothing is reported against it
  assert.deepEqual(
    checkSite(ROOT)
      .filter((p) => p.file === "docs/contribute.html")
      .map((p) => p.message),
    [],
  );
});

test("checkSite reads a need tag that carries a second class alongside need-tag", () => {
  // #given one tag given a layout hook and left in place. A literal
  // `<span class="need-tag"` reading drops exactly that tag and keeps the rest
  // of the page looking checked
  const root = needTagsRoot(
    [{ id: "kumano-kodo-nakahechi", ways: WAYS_BLOCK }],
    '<span class="need-tag need-tag-wide" data-needs="section:kumano-kodo-nakahechi">K</span>',
  );

  try {
    // #when / #then the tag is still read, and its finished ask reported
    const problems = needTagProblems(root);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^need tag "K" asks for work on section "kumano-kodo-nakahechi"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
