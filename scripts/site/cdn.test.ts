import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  cdnPathExistsOnDisk,
  currentCdnMovingRef,
  extractCdnRefs,
  isPublishedCdnPath,
  isRecognizedCdnRef,
} from "./cdn.js";

// --- extractCdnRefs ---

test("extractCdnRefs finds a plain file URL inside an HTML href attribute", () => {
  const html = `<a href="https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-frances/route.gpx">GPX</a>`;
  const refs = extractCdnRefs(html);

  assert.equal(refs.length, 1);
  assert.equal(refs[0].ref, "v1");
  assert.equal(refs[0].path, "routes/camino-frances/route.gpx");
});

test("extractCdnRefs finds a URL inside a single-quoted JS string", () => {
  const js = `const BASE = 'https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1';`;
  const refs = extractCdnRefs(js);

  assert.equal(refs.length, 1);
  assert.equal(refs[0].ref, "v1");
});

test("extractCdnRefs reports an empty path for a bare base URL with no trailing slash", () => {
  const md = "See https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1 for the CDN base.";
  const refs = extractCdnRefs(md);

  assert.equal(refs.length, 1);
  assert.equal(refs[0].path, "");
});

test("extractCdnRefs preserves a trailing slash for a directory-style URL", () => {
  const md =
    "Available via jsDelivr at `https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-portugues/variants/coastal/`.";
  const refs = extractCdnRefs(md);

  assert.equal(refs.length, 1);
  assert.equal(refs[0].path, "routes/camino-portugues/variants/coastal/");
});

test("extractCdnRefs finds every distinct URL in a page with several", () => {
  const html = [
    "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json",
    "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/shikoku-88/route.geojson",
  ].join("\n");
  const refs = extractCdnRefs(html);

  assert.equal(refs.length, 2);
});

test("extractCdnRefs returns nothing for text with no jsDelivr URLs", () => {
  assert.deepEqual(extractCdnRefs("<html><body>hello</body></html>"), []);
});

test("extractCdnRefs accepts a plain http:// URL, not only https://", () => {
  const md = "http://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json";
  const refs = extractCdnRefs(md);

  assert.equal(refs.length, 1);
  assert.equal(refs[0].path, "index.json");
});

test("extractCdnRefs accepts a protocol-relative //cdn.jsdelivr.net URL", () => {
  const md = "See //cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json for details.";
  const refs = extractCdnRefs(md);

  assert.equal(refs.length, 1);
  assert.equal(refs[0].url, "//cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json");
});

test("extractCdnRefs extracts only the top-level directory from a URL broken across lines", () => {
  // #given a URL wrapped mid-path — the extractor can only see up to the line break
  const md =
    "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/\ncamino-frances/route.gpx";
  const refs = extractCdnRefs(md);

  // #then it extracts a bare top-level prefix, not the intended deeper path — this is the shape
  // isPublishedCdnPath's bare-prefix rejection (below) exists to catch
  assert.equal(refs.length, 1);
  assert.equal(refs[0].path, "routes/");
});

// --- isRecognizedCdnRef ---

test("isRecognizedCdnRef accepts the moving v1 tag", () => {
  assert.ok(isRecognizedCdnRef("v1"));
});

test("isRecognizedCdnRef accepts a released semver tag", () => {
  assert.ok(isRecognizedCdnRef("v1.6.0"));
});

test("isRecognizedCdnRef accepts main — the ref the app reads its catalog from", () => {
  assert.ok(isRecognizedCdnRef("main"));
});

test("isRecognizedCdnRef rejects any other branch name", () => {
  assert.ok(!isRecognizedCdnRef("feat/ways-build"));
  assert.ok(!isRecognizedCdnRef("latest"));
});

test("isRecognizedCdnRef rejects a bare major-version-only ref that isn't the current moving tag", () => {
  assert.ok(!isRecognizedCdnRef("v2"));
});

test("isRecognizedCdnRef derives the current moving tag from package.json's version, not a hardcoded v1", () => {
  // #given package.json's real version today is on the 1.x line
  // #when / #then only v1 — not a hardcoded literal — is accepted as the moving tag
  assert.ok(isRecognizedCdnRef("v1"));
  assert.equal(currentCdnMovingRef(), "v1");
});

test("isRecognizedCdnRef accepts next major version's moving tag once told the major has bumped (simulates a v1 -> v2 release, via the currentMajor override)", () => {
  // #given a release has bumped package.json to a new major line — simulated via the override
  // parameter rather than editing package.json, the same DI shape fetch-roads.ts uses for fetchImpl
  // #when / #then v2 is now recognized as the moving tag, and v1 no longer is
  assert.ok(isRecognizedCdnRef("v2", "2"));
  assert.ok(!isRecognizedCdnRef("v1", "2"));
});

test("isRecognizedCdnRef still accepts a released semver tag regardless of the current major", () => {
  // #given a URL pinned to a specific past release, checked while the current major is 2
  // #when / #then the specific-release tag is accepted independent of the moving-tag major
  assert.ok(isRecognizedCdnRef("v1.6.0", "2"));
});

// --- isPublishedCdnPath ---

test("isPublishedCdnPath accepts a routes/ path", () => {
  assert.ok(isPublishedCdnPath("routes/camino-frances/route.geojson"));
});

test("isPublishedCdnPath accepts a schema/ path", () => {
  assert.ok(isPublishedCdnPath("schema/route.schema.json"));
});

test("isPublishedCdnPath accepts the top-level index.json", () => {
  assert.ok(isPublishedCdnPath("index.json"));
});

test("isPublishedCdnPath rejects a path under docs/", () => {
  assert.ok(!isPublishedCdnPath("docs/index.html"));
});

test("isPublishedCdnPath rejects a bare top-level routes/ prefix — too shallow to be a real link, even though the directory itself exists", () => {
  assert.ok(!isPublishedCdnPath("routes/"));
});

test("isPublishedCdnPath rejects a bare top-level schema/ prefix", () => {
  assert.ok(!isPublishedCdnPath("schema/"));
});

test("isPublishedCdnPath still accepts a real deeper directory link (the coastal variant's trailing-slash README entry)", () => {
  assert.ok(isPublishedCdnPath("routes/camino-portugues/variants/coastal/"));
});

test("isPublishedCdnPath rejects a path that escapes the published surface via a .. segment", () => {
  assert.ok(!isPublishedCdnPath("routes/../docs/index.html"));
});

test("isPublishedCdnPath does not false-positive on a filename that merely contains two dots", () => {
  assert.ok(isPublishedCdnPath("routes/camino-frances/v1.2..3-notes.json"));
});

// --- cdnPathExistsOnDisk ---

test("cdnPathExistsOnDisk finds a real file", () => {
  const root = mkdtempSync(join(tmpdir(), "cdn-test-"));
  try {
    mkdirSync(join(root, "routes", "camino-frances"), { recursive: true });
    writeFileSync(join(root, "routes", "camino-frances", "route.geojson"), "{}");

    assert.ok(cdnPathExistsOnDisk(root, "routes/camino-frances/route.geojson"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cdnPathExistsOnDisk reports false for a missing file", () => {
  const root = mkdtempSync(join(tmpdir(), "cdn-test-"));
  try {
    assert.ok(!cdnPathExistsOnDisk(root, "routes/does-not-exist/route.geojson"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cdnPathExistsOnDisk requires a trailing-slash path to be a directory, not a same-named file", () => {
  const root = mkdtempSync(join(tmpdir(), "cdn-test-"));
  try {
    mkdirSync(join(root, "routes"), { recursive: true });
    writeFileSync(join(root, "routes", "camino-frances"), "not a directory");

    assert.ok(!cdnPathExistsOnDisk(root, "routes/camino-frances/"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cdnPathExistsOnDisk rejects a path with a .. segment even when it resolves to a real file outside root", () => {
  const root = mkdtempSync(join(tmpdir(), "cdn-test-"));
  try {
    // #given a real file that a .. traversal would successfully reach if not rejected first
    writeFileSync(join(root, "secret.json"), "{}");

    // #when / #then the traversal is rejected before ever stat-ing outside root/routes
    assert.ok(!cdnPathExistsOnDisk(root, "routes/../secret.json"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
