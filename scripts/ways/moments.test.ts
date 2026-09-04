import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { cap, nonEnglishNames, wholeSecondISO } from "./text.js";
import {
  buildMoments,
  composedText,
  iconFor,
  MOMENT_DROP_METERS,
  type StagePlace,
  type WaypointFeature,
} from "./moments.js";
import {
  walkedLine,
  cumulativeMeters,
  simplify,
  roundLine,
  RDP_TOLERANCE_METERS,
} from "./geo.js";
import type { Position } from "./types.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "way-fixture-route");
const loadJson = (name: string) => JSON.parse(readFileSync(join(FIXTURE, name), "utf-8"));

function stageSlice(from: number, to: number): { line: Position[]; cumulative: number[] } {
  const line = roundLine(simplify(walkedLine(loadJson("route.main.geojson")).slice(from, to + 1), RDP_TOLERANCE_METERS));
  return { line, cumulative: cumulativeMeters(line) };
}

function waypointsForStage(index: number): WaypointFeature[] {
  return loadJson("waypoints.geojson").features.filter(
    (f: WaypointFeature) => f.properties.stageIndex === index,
  );
}

test("cap trims, drops the empty, and truncates", () => {
  assert.equal(cap("  hello  ", 10), "hello");
  assert.equal(cap("   ", 10), undefined);
  assert.equal(cap(undefined, 10), undefined);
  assert.equal(cap("abcdefghijk", 5), "abcde");
});

test("nonEnglishNames drops en and returns undefined when nothing is left", () => {
  assert.deepEqual(nonEnglishNames({ en: "Start", es: "Inicio" }), { es: "Inicio" });
  assert.equal(nonEnglishNames({ en: "Start" }), undefined);
  assert.equal(nonEnglishNames(undefined), undefined);
});

test("wholeSecondISO normalizes anything format: date-time allows", () => {
  // metadata.lastUpdated is only constrained to date-time, but the Way
  // schema's departedAt pattern demands whole seconds and a Z.
  assert.equal(wholeSecondISO("2026-08-19T00:00:00Z"), "2026-08-19T00:00:00Z");
  assert.equal(wholeSecondISO("2026-08-19T00:00:00.448Z"), "2026-08-19T00:00:00Z");
  assert.equal(wholeSecondISO("2026-08-19T02:00:00+02:00"), "2026-08-19T00:00:00Z");
  assert.match(wholeSecondISO("2026-08-19T00:00:00Z"), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test("iconFor maps each moment type to its SF Symbol", () => {
  assert.equal(iconFor({ type: "sacred_site" }), "building.columns");
  assert.equal(iconFor({ type: "cultural_site" }), "book.closed");
  assert.equal(iconFor({ type: "viewpoint" }), "eye");
  assert.equal(iconFor({ type: "town" }), "house.lodge");
  assert.equal(iconFor({ type: "credential_stamp" }), "seal");
});

test("iconFor gives any stamp-bearing waypoint the seal, whatever its type", () => {
  assert.equal(iconFor({ type: "sacred_site", credentialStamp: true }), "seal");
  assert.equal(iconFor({ type: "town", credentialStamp: true }), "seal");
  assert.equal(iconFor({ type: "sacred_site", credentialStamp: false }), "building.columns");
});

test("composedText builds a line from a temple's structured fields", () => {
  assert.equal(
    composedText({
      type: "sacred_site",
      templeNumber: 3,
      tradition: "buddhist",
      denomination: "Koyasan Shingon",
      credentialStamp: true,
      stampFee: { currency: "JPY", amount: 500 },
    }),
    "Temple 3 · Koyasan Shingon · stamp available (¥500)",
  );
});

test("composedText falls back to the tradition when there is no denomination", () => {
  assert.equal(
    composedText({ type: "sacred_site", templeNumber: 7, tradition: "buddhist" }),
    "Temple 7 · Buddhist",
  );
});

test("composedText says only what it knows", () => {
  assert.equal(composedText({ type: "credential_stamp", credentialStamp: true }), "stamp available");
  assert.equal(
    composedText({ type: "sacred_site", credentialStamp: true, stampFee: { currency: "EUR", amount: 2 } }),
    "stamp available (€2)",
  );
  assert.equal(
    composedText({ type: "sacred_site", credentialStamp: true, stampFee: { currency: "XYZ", amount: 9 } }),
    "stamp available (9 XYZ)",
  );
  assert.equal(composedText({ type: "cultural_site" }), undefined);
});

test("stage 0's moments are the town, the shrine, the museum, and a synthesized end", () => {
  const { line, cumulative } = stageSlice(0, 10);
  const result = buildMoments({
    line,
    cumulative,
    waypoints: waypointsForStage(0),
    start: { name: "Start Town", at: [0, 0] },
    end: { name: "Middle", at: [0.01, 0] },
  });

  assert.deepEqual(result.moments.map((m) => m.id), ["wp-start-town", "wp-shrine", "wp-museum", "stage-end"]);
  assert.deepEqual(result.moments.map((m) => m.kind), ["waypoint", "waypoint", "waypoint", "waypoint"]);
  assert.deepEqual(result.moments.map((m) => m.icon), [
    "house.lodge", "building.columns", "book.closed", "house.lodge",
  ]);
  assert.equal(result.moments[0].label, "Start Town");
  assert.deepEqual(result.moments.map((m) => Math.round(m.frac * 1000) / 1000), [0, 0.5, 0.8, 1]);
  assert.equal(result.beyondEnds, 2);
});

test("a start place with a town waypoint on it does not get a second, synthesized moment", () => {
  const { line, cumulative } = stageSlice(0, 10);
  const result = buildMoments({
    line,
    cumulative,
    waypoints: waypointsForStage(0),
    start: { name: "Start Town", at: [0, 0] },
    end: { name: "Middle", at: [0.01, 0] },
  });
  assert.equal(result.moments.filter((m) => m.id === "stage-start").length, 0);
});

test("a moment carries text, local names, sit minutes, and a pin off the line", () => {
  const { line, cumulative } = stageSlice(10, 30);
  const result = buildMoments({
    line,
    cumulative,
    waypoints: waypointsForStage(1),
    start: { name: "Middle", at: [0.01, 0] },
    end: { name: "Bend", at: [0.02, 0.01] },
  });
  const byId = new Map(result.moments.map((m) => [m.id, m]));

  const lookout = byId.get("wp-lookout")!;
  assert.ok(Math.abs(lookout.frac - 0.1036) < 1e-3, `${lookout.frac}`);
  assert.equal(lookout.text, "The whole first leg, behind you.");
  assert.equal(lookout.sitMinutes, 5);
  assert.deepEqual(lookout.pin, { lat: 0.0005, lon: 0.012 });
  // `at` is on the line so the engine's 60 m trigger fires on the trail.
  assert.ok(Math.abs(lookout.at.lat) < 1e-4);
  assert.notDeepEqual(lookout.at, lookout.pin);

  const temple = byId.get("temple-3")!;
  assert.equal(temple.icon, "seal");
  assert.equal(temple.text, "Temple 3 · Koyasan Shingon · stamp available (¥500)");
  assert.equal(temple.sitMinutes, 5);

  const office = byId.get("wp-office")!;
  assert.equal(office.text, "stamp available");
  assert.deepEqual(office.names, { es: "Oficina del Peregrino" });
  assert.equal(office.sitMinutes, undefined);
});

test("a waypoint more than 300 m off the line is dropped and named in the warnings", () => {
  const { line, cumulative } = stageSlice(10, 30);
  const result = buildMoments({
    line,
    cumulative,
    waypoints: waypointsForStage(1),
    start: { name: "Middle", at: [0.01, 0] },
    end: { name: "Bend", at: [0.02, 0.01] },
  });
  assert.equal(result.moments.some((m) => m.id === "wp-far-chapel"), false);
  assert.equal(result.dropped.length, 1);
  assert.match(result.dropped[0], /wp-far-chapel/);
  assert.match(result.dropped[0], new RegExp(String(MOMENT_DROP_METERS)));
});

test("a town near the stage anchor but far off the line is dropped, not treated as the anchor's marker", () => {
  const { line, cumulative } = stageSlice(30, 40);
  const end: StagePlace = { name: "End Town", at: [0.024, 0.02] };
  const offlineTown: WaypointFeature = {
    id: "wp-offline-town",
    type: "Feature",
    geometry: { type: "Point", coordinates: [0.0241, 0.0201] },
    properties: { routeId: "fixture-way", name: "Offline Town", type: "town", stageIndex: 2 },
  };
  const result = buildMoments({
    line,
    cumulative,
    waypoints: [...waypointsForStage(2), offlineTown],
    start: { name: "Bend", at: [0.02, 0.01] },
    end,
  });

  // The waypoint sits 15 m from the declared anchor but 456 m off the walked
  // line — past MOMENT_DROP_METERS, so it is dropped like any other detour.
  assert.equal(result.moments.some((m) => m.id === "wp-offline-town"), false);
  assert.equal(result.dropped.some((message) => message.includes("wp-offline-town")), true);

  // The stage still needs a marker at its own end, so the synthesized
  // stage-end moment must survive the drop, not be suppressed by a town that
  // never actually counted as being at that place.
  assert.equal(result.moments.some((m) => m.id === "stage-end"), true);
});

test("a stage whose only places are its own ends counts zero moments beyond them", () => {
  const { line, cumulative } = stageSlice(30, 40);
  const result = buildMoments({
    line,
    cumulative,
    waypoints: waypointsForStage(2),
    start: { name: "Bend", at: [0.02, 0.01] },
    end: { name: "End Town", at: [0.02, 0.02] },
  });
  assert.deepEqual(result.moments.map((m) => m.id), ["stage-start", "wp-end-town"]);
  assert.deepEqual(result.moments.at(-1)!.names, { es: "Pueblo Final" });
  assert.equal(result.beyondEnds, 0);
});

test("moments are ordered by frac with ties broken by id, so a rebuild is byte-identical", () => {
  const line: Position[] = [[0, 0], [0.01, 0]];
  const cumulative = cumulativeMeters(line);
  const at = (lon: number, id: string): WaypointFeature => ({
    id,
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, 0] },
    properties: { routeId: "fixture-way", name: id, type: "town", stageIndex: 0 },
  });
  const result = buildMoments({
    line,
    cumulative,
    waypoints: [at(0.005, "wp-zulu"), at(0.005, "wp-alpha")],
    start: { name: "A", at: [0, 0] },
    end: { name: "B", at: [0.01, 0] },
  });
  const middle = result.moments.filter((m) => m.id.startsWith("wp-"));
  assert.deepEqual(middle.map((m) => m.id), ["wp-alpha", "wp-zulu"]);
});
