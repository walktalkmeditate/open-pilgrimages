import type {
  WayReportFile,
  WayReportStage,
  WayRouteFile,
  WayRouteStage,
} from "./types.js";
import { SCHEMA_VERSION } from "./types.js";
import { cap, nonEnglishNames } from "./text.js";
import { midpointHours, type DatasetStage } from "./stage.js";
import { withinGate } from "./geo.js";
import { REGION_BY_COUNTRY } from "../build-index.js";

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

export interface RouteMetadata {
  name: Record<string, string>;
  description?: Record<string, string>;
  overview?: { countries?: string[] };
  tradition?: { type?: string };
}

export function buildRouteCard(
  routeId: string,
  metadata: RouteMetadata,
  stages: DatasetStage[],
  hasCover: boolean,
): WayRouteFile {
  const countries = metadata.overview?.countries ?? [];
  // The last country is the one the route ends in — the Camino Francés starts
  // in France and is filed under Spain, the same rule build-index applies.
  const country = countries.length > 1 ? countries[countries.length - 1] : countries[0] ?? "";

  const cardStages: WayRouteStage[] = stages.map((stage) => {
    const entry: WayRouteStage = {
      index: stage.index,
      name: cap(stage.name.en, NAME_MAX) ?? `Stage ${stage.index + 1}`,
      distanceKm: stage.distanceKm,
      hours: {
        min: typeof stage.estimatedHours?.min === "number" ? stage.estimatedHours.min : midpointHours(stage.estimatedHours),
        max: typeof stage.estimatedHours?.max === "number" ? stage.estimatedHours.max : midpointHours(stage.estimatedHours),
      },
    };
    if (typeof stage.elevationGainMeters === "number") entry.gainMeters = stage.elevationGainMeters;
    if (stage.difficulty) entry.difficulty = stage.difficulty;
    return entry;
  });

  const card: WayRouteFile = {
    schemaVersion: SCHEMA_VERSION,
    id: routeId,
    name: cap(metadata.name.en, NAME_MAX) ?? routeId,
    country,
    region: REGION_BY_COUNTRY[country] ?? "Other",
    // The stages' own sum, not the geometry's length: what a walker will walk.
    distanceKm: Math.round(stages.reduce((sum, s) => sum + s.distanceKm, 0) * 10) / 10,
    stageCount: stages.length,
    tradition: metadata.tradition?.type ?? "",
    summary: cap(metadata.description?.en, SUMMARY_MAX) ?? "",
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
  stages: ReportStageInput[];
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
  const withMoment = stages.filter((s) => s.momentsBeyondEnds > 0).length;
  const half = halfOfStages(stages.length);
  const sparse = withMoment < half;
  const placesPerStage =
    stages.length === 0
      ? 0
      : Math.round((stages.reduce((sum, s) => sum + s.momentsBeyondEnds, 0) / stages.length) * 10) / 10;

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
    gate: { passed: failing.length === 0, failing },
    places: {
      sparse,
      stagesWithMomentBeyondEnds: withMoment,
      halfOfStages: half,
      placesPerStage,
      ...(sparse
        ? {
            note:
              `only ${withMoment} of ${stages.length} stages carry a place beyond their own ` +
              `start and end; the app's card will say "few places marked yet"`,
          }
        : {}),
    },
  };
}
