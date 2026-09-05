import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { join } from "path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { resolveInvokedPath } from "./cli.js";
import type { Position, WayFile, WayReportFile, WayRouteFile } from "./ways/types.js";
import { SCHEMA_VERSION } from "./ways/types.js";
import {
  walkedLine,
  cumulativeMeters,
  lineLengthMeters,
  stageBoundaries,
  simplify,
  strideCap,
  roundLine,
  routePoints,
  RDP_TOLERANCE_METERS,
  MAX_ROUTE_POINTS,
} from "./ways/geo.js";
import { buildMoments, MOMENT_TYPES, type WaypointFeature } from "./ways/moments.js";
import { buildMarks } from "./ways/marks.js";
import { buildStageBlock, midpointHours, type DatasetStage } from "./ways/stage.js";
import { wholeSecondISO } from "./ways/text.js";
import { buildReport, buildRouteCard, type ReportStageInput, type RouteMetadata } from "./ways/catalog.js";

export function stageFileName(index: number): string {
  return `stage-${String(index).padStart(2, "0")}.json`;
}

export interface RouteWaysInput {
  routeId: string;
  metadata: RouteMetadata & { lastUpdated: string };
  stages: DatasetStage[];
  waypoints: WaypointFeature[];
  routeGeoJson: unknown;
  walkedLineSource: "route.main.geojson" | "route.geojson";
  hasCover: boolean;
}

export interface RouteWaysResult {
  ways: WayFile[];
  route: WayRouteFile;
  report: WayReportFile;
  /** True when every stage cleared the length gate, so a package was built. */
  emitted: boolean;
}

export function buildRouteWays(input: RouteWaysInput): RouteWaysResult {
  const { routeId, stages } = input;

  // Everything below indexes boundaries[] and report.stages[] by stage.index
  // as a plain array subscript, on the assumption that a stage's declared
  // index is also its position in the array. An empty stages.json has no
  // last stage for the anchors.push below to read; a gap or duplicate index
  // would silently pair a stage with another stage's boundary. Both fail
  // loud here instead of as a confusing TypeError or a wrong package deep in
  // the build.
  if (stages.length === 0) {
    throw new Error(`${routeId}: stages.json has no stages`);
  }
  for (let i = 0; i < stages.length; i++) {
    if (stages[i].index !== i) {
      throw new Error(
        `${routeId}: stage ${i} declares index ${stages[i].index}; this build requires contiguous 0-based indices`,
      );
    }
  }

  // A waypoint of a moment type whose stageIndex is missing or out of range
  // matches no stage's `stageIndex` filter below, so it never becomes a
  // moment and never reaches a stage's own `dropped` list either — it just
  // vanishes. Collected here, once, against the whole route, so the report
  // says so instead.
  const routeDropped = input.waypoints
    .filter((w) => MOMENT_TYPES.includes(w.properties.type))
    .filter((w) => {
      const stageIndex = w.properties.stageIndex;
      return stageIndex === undefined || stageIndex < 0 || stageIndex >= stages.length;
    })
    .map((w) => {
      const label = `${w.id ?? "(no id)"} ("${w.properties.name ?? w.id ?? "unnamed"}")`;
      return w.properties.stageIndex === undefined
        ? `${label} has no stageIndex and was dropped`
        : `${label} has stageIndex ${w.properties.stageIndex}, outside 0..${stages.length - 1}, and was dropped`;
    });

  const line = walkedLine(input.routeGeoJson);
  const cumulative = cumulativeMeters(line);

  const anchors: Position[] = input.stages.map((s) => s.start.coordinates);
  anchors.push(input.stages[input.stages.length - 1].end.coordinates);
  const boundaries = stageBoundaries(
    line,
    cumulative,
    anchors,
    input.stages.map((s) => s.distanceKm),
  );

  const ways: WayFile[] = [];
  const reportStages: ReportStageInput[] = [];

  for (const stage of input.stages) {
    const from = Math.min(boundaries[stage.index].index, boundaries[stage.index + 1].index);
    const to = Math.max(boundaries[stage.index].index, boundaries[stage.index + 1].index);

    // Round last: the app measures the rounded line, so the build must too.
    const slice = roundLine(
      strideCap(simplify(line.slice(from, to + 1), RDP_TOLERANCE_METERS), MAX_ROUTE_POINTS),
    );
    const sliceCumulative = cumulativeMeters(slice);
    const meters = lineLengthMeters(slice);
    const hours = midpointHours(stage.estimatedHours);

    const stageWaypoints = input.waypoints.filter((w) => w.properties.stageIndex === stage.index);
    const moments = buildMoments({
      line: slice,
      cumulative: sliceCumulative,
      waypoints: stageWaypoints,
      start: { name: stage.start.name.en, at: stage.start.coordinates, localized: stage.start.name },
      end: { name: stage.end.name.en, at: stage.end.coordinates, localized: stage.end.name },
    });
    const marks = buildMarks({ line: slice, cumulative: sliceCumulative, waypoints: stageWaypoints });
    const block = buildStageBlock(input.routeId, input.stages.length, stage);

    // No `source`: the app assigns .pilgrimage(routeId:stageIndex:) from the
    // stage block, and refuses a file whose block disagrees with what it
    // fetched. Writing one here would be a field nothing reads.
    ways.push({
      schemaVersion: SCHEMA_VERSION,
      id: `pilgrimage:${input.routeId}:${stage.index}`,
      // The stage block's name is already trimmed and capped to 120.
      title: block.name,
      departedAt: wholeSecondISO(input.metadata.lastUpdated),
      route: routePoints(slice, sliceCumulative, hours),
      totalDistanceMeters: Math.round(meters * 10) / 10,
      theirActiveSeconds: Math.round(hours * 3600),
      moments: moments.moments,
      marks: marks.marks,
      stage: block,
    });

    reportStages.push({
      index: stage.index,
      name: stage.name.en,
      sliceKm: meters / 1000,
      distanceKm: stage.distanceKm,
      boundaryMode: boundaries[stage.index].mode,
      routePoints: slice.length,
      moments: moments.moments.length,
      momentsBeyondEnds: moments.beyondEnds,
      momentsWithText: moments.moments.filter((m) => m.text !== undefined).length,
      marks: marks.marks.length,
      marksTrimmed: marks.trimmed,
      dropped: [...moments.dropped, ...marks.dropped].sort(),
    });
  }

  const report = buildReport({
    routeId: input.routeId,
    generatedAt: input.metadata.lastUpdated,
    walkedLine: {
      source: input.walkedLineSource,
      points: line.length,
      lengthKm: lineLengthMeters(line) / 1000,
    },
    stages: reportStages,
    dropped: routeDropped,
  });

  return {
    ways: report.gate.passed ? ways : [],
    route: buildRouteCard(input.routeId, input.metadata, input.stages, input.hasCover),
    report,
    emitted: report.gate.passed,
  };
}

function loadJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function createValidator(root: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const name of ["way.schema.json", "way-route.schema.json", "way-report.schema.json"]) {
    ajv.addSchema(loadJson(join(root, "schema", name)), name);
  }
  return ajv;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function main(): void {
  const root = join(import.meta.dirname, "..");
  const routesDir = join(root, "routes");
  const ajv = createValidator(root);
  const failures: string[] = [];

  for (const entry of readdirSync(routesDir).sort()) {
    const routeDir = join(routesDir, entry);
    if (!statSync(routeDir).isDirectory()) continue;

    const waysDir = join(routeDir, "ways");
    // Cleared before every guard below, not after them: a route that loses an
    // input file (or never had one) must not keep a package an earlier build
    // left behind. A stale package would outlive the data that justified it,
    // and CI's drift check would never see it go.
    rmSync(waysDir, { recursive: true, force: true });

    const metadataPath = join(routeDir, "metadata.json");
    const stagesPath = join(routeDir, "stages.json");
    const waypointsPath = join(routeDir, "waypoints.geojson");
    if (!existsSync(metadataPath) || !existsSync(stagesPath) || !existsSync(waypointsPath)) continue;

    const mainLinePath = join(routeDir, "route.main.geojson");
    const source = existsSync(mainLinePath) ? "route.main.geojson" : "route.geojson";
    const geoPath = join(routeDir, source);
    if (!existsSync(geoPath)) continue;

    const metadata = loadJson(metadataPath);
    const result = buildRouteWays({
      routeId: metadata.id,
      metadata,
      stages: loadJson(stagesPath).stages,
      waypoints: loadJson(waypointsPath).features,
      routeGeoJson: loadJson(geoPath),
      walkedLineSource: source,
      hasCover: existsSync(join(routeDir, "cover.jpg")),
    });

    mkdirSync(waysDir, { recursive: true });

    if (!ajv.validate("way-report.schema.json", result.report)) {
      failures.push(`${metadata.id}: report.json is invalid — ${JSON.stringify(ajv.errors)}`);
      continue;
    }
    writeJson(join(waysDir, "report.json"), result.report);

    for (const droppedLine of result.report.dropped) {
      console.log(`${metadata.id}: ${droppedLine}`);
    }

    // A coverage failure is reported, not fatal: a dataset whose routes do not
    // all have a walked line yet is unfinished, not broken, and `npm run
    // pipeline` has to stay runnable while that is true. Only a schema failure
    // — a package that would not decode on the phone — exits non-zero.
    if (!result.emitted) {
      console.log(`${metadata.id}: no package — ${result.report.gate.failing.length} stage(s) outside the gate`);
      for (const index of result.report.gate.failing) {
        const stage = result.report.stages[index];
        console.log(
          `    stage ${index} ("${stage.name}"): the walked line measures ` +
            `${stage.sliceKm.toFixed(2)} km against a declared ${stage.distanceKm} km`,
        );
      }
      continue;
    }

    if (!ajv.validate("way-route.schema.json", result.route)) {
      failures.push(`${metadata.id}: route.json is invalid — ${JSON.stringify(ajv.errors)}`);
      continue;
    }
    writeJson(join(waysDir, "route.json"), result.route);

    for (const way of result.ways) {
      if (!ajv.validate("way.schema.json", way)) {
        failures.push(`${metadata.id}: ${way.id} is invalid — ${JSON.stringify(ajv.errors)}`);
        continue;
      }
      writeJson(join(waysDir, stageFileName(way.stage.index)), way);
    }

    const coverage = result.report.places.sparse
      ? `sparse (${result.report.places.placesPerStage} places per stage — ${result.report.places.note})`
      : `${result.report.places.placesPerStage} places per stage`;
    console.log(`${metadata.id}: ${result.ways.length} stage(s), listed, ${coverage}`);
    const trimmed = result.report.stages.filter((stage) => stage.marksTrimmed > 0);
    for (const stage of trimmed) {
      console.log(`    stage ${stage.index}: ${stage.marksTrimmed} mark(s) over the app's limit, farthest from the line dropped`);
    }
  }

  if (failures.length > 0) {
    console.error("\nBuild failed:");
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
