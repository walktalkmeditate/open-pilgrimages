import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { checkSite } from "./check-site.js";

const ROOT = join(import.meta.dirname, "..", "..");

interface FixtureVariant {
  id: string;
  distanceKm: number;
}

interface FixtureRoute {
  id: string;
  variants?: FixtureVariant[];
}

function createFixtureRoot(indexRoutes: FixtureRoute[]): string {
  const root = mkdtempSync(join(tmpdir(), "check-site-test-"));
  mkdirSync(join(root, "routes"));
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "index.json"), JSON.stringify({ routes: indexRoutes }));
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
  // already renders route IDs today
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  writeFileSync(
    join(root, "docs", "camino-frances.html"),
    "<html><body><code>camino-frances</code></body></html>",
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
| [Kumano Kodo](routes/kumano-kodo/) | 39-170 km |
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
  // #given an index.json listing a route with no routes/{id}/route.gpx on disk
  const root = createFixtureRoot([{ id: "camino-frances" }]);

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
  // #given a routes/{id}/route.gpx that exists on disk but is empty
  const root = createFixtureRoot([{ id: "camino-frances" }]);
  mkdirSync(join(root, "routes", "camino-frances"), { recursive: true });
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
