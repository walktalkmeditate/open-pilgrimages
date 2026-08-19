import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { checkSite } from "./check-site.js";

const ROOT = join(import.meta.dirname, "..", "..");

const MISSING_FROM_TODAYS_CATALOG = [
  "camino-norte",
  "camino-primitivo",
  "camino-portugues",
  "camino-ingles",
];

function createFixtureRoot(indexRoutes: Array<{ id: string }>): string {
  const root = mkdtempSync(join(tmpdir(), "check-site-test-"));
  mkdirSync(join(root, "routes"));
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "index.json"), JSON.stringify({ routes: indexRoutes }));
  return root;
}

// The site has not been rebuilt yet (that's Tasks 10-13), so the guard is
// expected to report real problems against the committed docs/ and
// README.md today. These tests pin down exactly which ones, so the guard's
// own regression suite doesn't depend on npm run check-site's exit code.

test("checkSite reports every route the routes.html catalog is missing", () => {
  const problems = checkSite(ROOT);

  for (const id of MISSING_FROM_TODAYS_CATALOG) {
    assert.ok(
      problems.some(
        (p) => p.file === "docs/routes.html" && p.message.includes(`"${id}"`),
      ),
      `expected a problem naming "${id}" as absent from docs/routes.html`,
    );
  }
});

test("checkSite reports a route missing from the catalog (synthetic routesHtml)", () => {
  const problems = checkSite(ROOT, {
    routesHtml: "<html>only camino-frances lives here</html>",
  });
  assert.ok(problems.some((p) => p.message.includes("shikoku-88")));
});

test("checkSite reports the real hero stats as stale for every field", () => {
  // #given the committed docs/index.html, which still reads "3 / 89K / 6K / 47"
  // #when checkSite compares it against computeStats' current totals
  const problems = checkSite(ROOT);
  const heroProblems = problems.filter(
    (p) => p.file === "docs/index.html" && p.message.startsWith("hero stat"),
  );
  const labels = heroProblems
    .map((p) => p.message.match(/^hero stat "([^"]+)"/)?.[1])
    .sort();

  // #then all four hero fields are flagged, each showing both numbers
  assert.deepEqual(labels, ["GPS Points", "Routes", "Stages", "Waypoints"]);
  assert.ok(
    heroProblems.some((p) => p.message.includes("3") && p.message.includes("7")),
    "Routes stat should show both the rendered 3 and the computed 7",
  );
  assert.ok(
    heroProblems.every((p) => p.message.includes("data says")),
    "every hero mismatch should print the computed value it was checked against",
  );
});

test("checkSite reports a stale hero number (synthetic indexHtml)", () => {
  const problems = checkSite(ROOT, {
    indexHtml: `<span class="stat-number">3</span><span class="stat-label">Routes</span>`,
  });
  assert.ok(problems.some((p) => p.message.includes("Routes")));
});

test("checkSite reports every route as missing a detail page", () => {
  const problems = checkSite(ROOT);
  assert.ok(
    problems.some(
      (p) => p.file === "docs/camino-frances.html" && p.message.includes("no detail page"),
    ),
  );
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

test("checkSite reports the real nav links that kept their .html extension", () => {
  const problems = checkSite(ROOT);
  assert.ok(
    problems.some(
      (p) => p.file === "docs/index.html" && p.message.includes('"routes.html"'),
    ),
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
