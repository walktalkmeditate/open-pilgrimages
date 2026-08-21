import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  cdnPathExistsOnDisk,
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

// --- isRecognizedCdnRef ---

test("isRecognizedCdnRef accepts the moving v1 tag", () => {
  assert.ok(isRecognizedCdnRef("v1"));
});

test("isRecognizedCdnRef accepts a released semver tag", () => {
  assert.ok(isRecognizedCdnRef("v1.6.0"));
});

test("isRecognizedCdnRef rejects a branch name", () => {
  assert.ok(!isRecognizedCdnRef("main"));
});

test("isRecognizedCdnRef rejects a bare major-version-only ref", () => {
  assert.ok(!isRecognizedCdnRef("v2"));
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
