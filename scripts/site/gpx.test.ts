import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { gpxFrom, type GpxMeta } from "./gpx.js";
import { segmentsOf } from "./glyphs.js";

const ROOT = join(import.meta.dirname, "..", "..");

function geojson(routeId: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, "routes", routeId, "route.geojson"), "utf-8"));
}

const META: GpxMeta = {
  id: "camino-frances",
  name: "Camino de Santiago (Frances)",
  description: "The most popular pilgrimage route to Santiago de Compostela.",
};

function lineString(coordinates: number[][]): unknown {
  return {
    type: "FeatureCollection",
    features: [{ geometry: { type: "LineString", coordinates } }],
  };
}

/**
 * A dependency-free well-formedness check: every opening tag has a matching
 * closing tag in LIFO order, and every self-closing/processing-instruction
 * tag is skipped. Good enough to catch a broken escape or a missing close
 * tag without pulling in an XML library — the acceptance check that actually
 * parses the eight generated files runs separately, outside this suite.
 */
function assertWellFormedXml(xml: string): void {
  const stack: string[] = [];
  const tagPattern = /<([^>]+)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(xml))) {
    const tag = match[1];
    if (tag.startsWith("?") || tag.endsWith("/")) continue;

    if (tag.startsWith("/")) {
      const name = tag.slice(1);
      assert.equal(stack.pop(), name, `mismatched closing tag </${name}> in: ${xml}`);
    } else {
      stack.push(tag.split(/\s/)[0]);
    }
  }

  assert.deepEqual(stack, [], `unclosed tag(s) in: ${xml}`);
}

test("gpxFrom emits a well-formed document with the GPX 1.1 header", () => {
  const gpx = gpxFrom(lineString([[1, 2], [3, 4]]), META);

  assertWellFormedXml(gpx);
  assert.match(gpx, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/);
  assert.match(
    gpx,
    /<gpx xmlns="http:\/\/www\.topografix\.com\/GPX\/1\/1" creator="open-pilgrimages" version="1\.1">/,
  );
});

test("gpxFrom carries the route name, description, ODbL copyright, and a link to the route's page", () => {
  const gpx = gpxFrom(lineString([[1, 2], [3, 4]]), META);

  assert.match(gpx, /<name>Camino de Santiago \(Frances\)<\/name>/);
  assert.match(gpx, /<desc>The most popular pilgrimage route to Santiago de Compostela\.<\/desc>/);
  assert.match(gpx, /<copyright[^>]*>.*<license>[^<]*odbl[^<]*<\/license>.*<\/copyright>/is);
  assert.match(gpx, /<link href="https:\/\/open\.pilgrimag\.es\/camino-frances">/);
});

test("gpxFrom emits no <time> element, so the output never changes between runs on that basis alone", () => {
  const gpx = gpxFrom(lineString([[1, 2], [3, 4]]), META);
  assert.equal(gpx.includes("<time>"), false);
});

test("gpxFrom emits one <trkseg> per source segment for a single-LineString route", () => {
  const gpx = gpxFrom(lineString([[1, 2], [3, 4], [5, 6]]), META);
  assert.equal((gpx.match(/<trkseg>/g) ?? []).length, 1);
});

test("gpxFrom emits one <trkseg> per feature for kumano-kodo's seven LineStrings, not one continuous line", () => {
  const geo = geojson("kumano-kodo");
  const expectedSegments = segmentsOf(geo).length;

  const gpx = gpxFrom(geo, { ...META, id: "kumano-kodo" });

  assert.equal(expectedSegments, 7);
  assert.equal((gpx.match(/<trkseg>/g) ?? []).length, 7);
});

test("gpxFrom emits one <trkseg> per line of shikoku-88's MultiLineString, not one continuous line", () => {
  const geo = geojson("shikoku-88");
  const expectedSegments = segmentsOf(geo).length;

  const gpx = gpxFrom(geo, { ...META, id: "shikoku-88" });

  assert.ok(expectedSegments > 1, "shikoku-88 is a MultiLineString");
  assert.equal((gpx.match(/<trkseg>/g) ?? []).length, expectedSegments);
});

test("gpxFrom's total <trkpt> count matches the source point count", () => {
  const geo = geojson("kumano-kodo");
  const expectedPoints = segmentsOf(geo).reduce((sum, s) => sum + s.length, 0);

  const gpx = gpxFrom(geo, { ...META, id: "kumano-kodo" });

  assert.equal((gpx.match(/<trkpt\b/g) ?? []).length, expectedPoints);
});

test("gpxFrom rounds coordinates to 6 decimal places", () => {
  const gpx = gpxFrom(lineString([[-1.23723361234, 43.16233981234]]), META);

  assert.match(gpx, /<trkpt lat="43\.162340" lon="-1\.237234"\/>/);
});

test("gpxFrom keeps coordinates at exactly 6 decimal places even when the source has fewer", () => {
  const gpx = gpxFrom(lineString([[1, 2]]), META);
  assert.match(gpx, /<trkpt lat="2\.000000" lon="1\.000000"\/>/);
});

test("gpxFrom XML-escapes a name containing &, <, >, and \"", () => {
  const meta: GpxMeta = {
    id: "test-route",
    name: 'A & B <Route> "Quoted"',
    description: "fine",
  };

  const gpx = gpxFrom(lineString([[1, 2], [3, 4]]), meta);

  assertWellFormedXml(gpx);
  assert.match(gpx, /<name>A &amp; B &lt;Route&gt; &quot;Quoted&quot;<\/name>/);
  assert.equal(gpx.includes("A & B <Route>"), false);
});

test("gpxFrom XML-escapes a description containing &, <, >, and \"", () => {
  const meta: GpxMeta = {
    id: "test-route",
    name: "fine",
    description: 'Ampersands & <angle brackets> and "quotes" too',
  };

  const gpx = gpxFrom(lineString([[1, 2], [3, 4]]), meta);

  assertWellFormedXml(gpx);
  assert.match(
    gpx,
    /<desc>Ampersands &amp; &lt;angle brackets&gt; and &quot;quotes&quot; too<\/desc>/,
  );
});

test("gpxFrom preserves accented characters like é and ñ without escaping them", () => {
  const meta: GpxMeta = { id: "camino-ingles", name: "Camino Inglés", description: "Caminño" };
  const gpx = gpxFrom(lineString([[1, 2], [3, 4]]), meta);

  assert.match(gpx, /<name>Camino Inglés<\/name>/);
  assert.match(gpx, /<desc>Caminño<\/desc>/);
});

test("gpxFrom is byte-stable across repeated calls with identical input", () => {
  const geo = geojson("camino-primitivo");
  assert.equal(gpxFrom(geo, META), gpxFrom(geo, META));
});

test("gpxFrom degrades to an empty string on null geometry rather than throwing", () => {
  assert.equal(gpxFrom(null, META), "");
});

test("gpxFrom degrades to an empty string when features is missing", () => {
  assert.equal(gpxFrom({ type: "FeatureCollection" }, META), "");
});

test("gpxFrom degrades to an empty string on an empty FeatureCollection", () => {
  assert.equal(gpxFrom({ type: "FeatureCollection", features: [] }, META), "");
});

test("gpxFrom degrades to an empty string on unsupported Point geometry", () => {
  const geo = { type: "FeatureCollection", features: [{ geometry: { type: "Point", coordinates: [0, 0] } }] };
  assert.equal(gpxFrom(geo, META), "");
});

test("gpxFrom degrades to an empty string on a LineString with missing coordinates", () => {
  const geo = { type: "FeatureCollection", features: [{ geometry: { type: "LineString" } }] };
  assert.equal(gpxFrom(geo, META), "");
});
