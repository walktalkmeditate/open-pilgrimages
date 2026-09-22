import type {
  WayReportFile,
  WayReportStage,
  WayRouteFile,
  WayRouteStage,
  WayStampHours,
} from "./types.js";
import { SCHEMA_VERSION } from "./types.js";
import { cap, nonEnglishNames } from "./text.js";
import { midpointHours, type DatasetStage } from "./stage.js";
import { withinGate } from "./geo.js";
import { primaryCountry, regionOf } from "../region.js";

const NAME_MAX = 120;
const SUMMARY_MAX = 600;

/**
 * The review's coverage bar. It no longer gates listing — measured, that
 * listed nothing — so it decides only whether a route's card says "few places
 * marked yet".
 */
export function halfOfStages(stageCount: number): number {
  return Math.ceil(stageCount / 2);
}

/** A 24-hour clock time, "00:00" through "23:59". */
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface RouteMetadata {
  name: Record<string, string>;
  description?: Record<string, string>;
  overview?: { countries?: string[] };
  tradition?: { type?: string };
  pilgrimage?: { stats?: { infrastructure?: { templeHours?: { current?: string } } } };
}

/**
 * The one place that knows where a section's pilgrimage declares the stamp
 * office's hours. Every step of the path is optional — `stats` is optional on
 * the block, `infrastructure` on the stats, `templeHours` on that — so a
 * section that says nothing about hours reads as `undefined` rather than
 * throwing on the way down.
 */
export function templeHoursCurrent(metadata: RouteMetadata): string | undefined {
  const current = metadata.pilgrimage?.stats?.infrastructure?.templeHours?.current;
  return typeof current === "string" ? current : undefined;
}

/**
 * "08:00-17:00" as the app reads it. Anything else — a 25th hour, a season's
 * two windows, prose — is omitted rather than guessed at: a wrong closing time
 * sends a walker to a shut office, which is worse than telling them nothing.
 * build-ways says which string it could not read on the way past.
 */
export function parseStampHours(current: string | undefined): WayStampHours | undefined {
  if (current === undefined) return undefined;
  const [opens, closes, ...rest] = current.split("-");
  if (rest.length > 0) return undefined;
  if (!CLOCK.test(opens ?? "") || !CLOCK.test(closes ?? "")) return undefined;
  return { opens, closes };
}

export function buildRouteCard(
  routeId: string,
  metadata: RouteMetadata,
  stages: DatasetStage[],
  hasCover: boolean,
): WayRouteFile {
  const country = primaryCountry(metadata.overview?.countries);

  // gainMeters and difficulty are always written, exactly as buildStageBlock
  // writes them into the stage file: the app's RouteFile.Stage declares both
  // non-optional, so a stage the dataset is silent about needs a zero and an
  // empty string. A missing key would fail the decode for the whole card.
  const cardStages: WayRouteStage[] = stages.map((stage) => ({
    index: stage.index,
    name: cap(stage.name.en, NAME_MAX) ?? `Stage ${stage.index + 1}`,
    distanceKm: stage.distanceKm,
    hours: {
      min: typeof stage.estimatedHours?.min === "number" ? stage.estimatedHours.min : midpointHours(stage.estimatedHours),
      max: typeof stage.estimatedHours?.max === "number" ? stage.estimatedHours.max : midpointHours(stage.estimatedHours),
    },
    gainMeters: typeof stage.elevationGainMeters === "number" ? stage.elevationGainMeters : 0,
    difficulty: stage.difficulty ?? "",
  }));

  // Omitted, not emptied: the app shows the closing time or says nothing, and
  // an empty object would be a third state neither the card nor the phone has
  // a use for.
  const stampHours = parseStampHours(templeHoursCurrent(metadata));

  const card: WayRouteFile = {
    schemaVersion: SCHEMA_VERSION,
    id: routeId,
    name: cap(metadata.name.en, NAME_MAX) ?? routeId,
    country,
    region: regionOf(country),
    // The stages' own sum, not the geometry's length: what a walker will walk.
    distanceKm: Math.round(stages.reduce((sum, s) => sum + s.distanceKm, 0) * 10) / 10,
    stageCount: stages.length,
    tradition: metadata.tradition?.type ?? "",
    summary: cap(metadata.description?.en, SUMMARY_MAX) ?? "",
    ...(stampHours ? { stampHours } : {}),
    stages: cardStages,
  };

  const names = nonEnglishNames(metadata.name);
  if (names) card.names = names;
  if (hasCover) card.cover = "cover.jpg";

  return card;
}

export interface ReportStageInput {
  index: number;
  name: string;
  sliceKm: number;
  distanceKm: number;
  boundaryMode: "snap" | "proportional";
  routePoints: number;
  moments: number;
  momentsBeyondEnds: number;
  momentsWithText: number;
  marks: number;
  marksTrimmed: number;
  dropped: string[];
}

export interface ReportInput {
  routeId: string;
  generatedAt: string;
  walkedLine: { source: "route.main.geojson" | "route.geojson"; points: number; lengthKm: number };
  /**
   * Every stage the route declares. `stages` below carries only the ones the
   * cut produced — a stage whose boundaries stall is skipped — so coverage,
   * which describes the route a walker downloads, cannot be counted off it.
   */
  stageCount: number;
  stages: ReportStageInput[];
  /** Waypoints a stage filter never saw at all — see WayReportFile.dropped. */
  dropped?: string[];
  /**
   * What is wrong with the route as a whole rather than with any one stage's
   * length. Any of these keeps a package from being written, exactly as a
   * stage outside the length gate does.
   */
  gateReasons?: string[];
}

export function buildReport(input: ReportInput): WayReportFile {
  const stages: WayReportStage[] = input.stages.map((stage) => ({
    index: stage.index,
    name: stage.name,
    sliceKm: Math.round(stage.sliceKm * 1000) / 1000,
    distanceKm: stage.distanceKm,
    ratio: stage.distanceKm > 0 ? Math.round((stage.sliceKm / stage.distanceKm) * 10000) / 10000 : 0,
    passedGate: withinGate(stage.sliceKm, stage.distanceKm),
    boundaryMode: stage.boundaryMode,
    routePoints: stage.routePoints,
    moments: stage.moments,
    momentsBeyondEnds: stage.momentsBeyondEnds,
    momentsWithText: stage.momentsWithText,
    marks: stage.marks,
    marksTrimmed: stage.marksTrimmed,
    dropped: stage.dropped,
  }));

  const failing = stages.filter((s) => !s.passedGate).map((s) => s.index);
  const reasons = input.gateReasons ?? [];
  const withMoment = stages.filter((s) => s.momentsBeyondEnds > 0).length;
  const half = halfOfStages(input.stageCount);
  const sparse = withMoment < half;
  const placesPerStage =
    input.stageCount === 0
      ? 0
      : Math.round((stages.reduce((sum, s) => sum + s.momentsBeyondEnds, 0) / input.stageCount) * 10) /
        10;

  return {
    schemaVersion: SCHEMA_VERSION,
    routeId: input.routeId,
    generatedAt: input.generatedAt,
    walkedLine: {
      source: input.walkedLine.source,
      points: input.walkedLine.points,
      lengthKm: Math.round(input.walkedLine.lengthKm * 1000) / 1000,
    },
    stages,
    gate: {
      passed: failing.length === 0 && reasons.length === 0,
      failing,
      ...(reasons.length > 0 ? { reasons } : {}),
    },
    dropped: input.dropped ?? [],
    places: {
      sparse,
      stagesWithMomentBeyondEnds: withMoment,
      halfOfStages: half,
      placesPerStage,
      ...(sparse
        ? {
            note:
              `only ${withMoment} of ${input.stageCount} stages carry a place beyond their own ` +
              `start and end; the app's card will say "few places marked yet"`,
          }
        : {}),
    },
  };
}
