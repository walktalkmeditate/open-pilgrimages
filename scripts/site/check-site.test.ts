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

test("the committed README already lists every route (positive control)", () => {
  const problems = checkSite(ROOT);
  assert.deepEqual(
    problems.filter((p) => p.file === "README.md"),
    [],
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
