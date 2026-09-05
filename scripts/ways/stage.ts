import type { Position, WayStage } from "./types.js";
import { cap } from "./text.js";

export interface LocalizedString {
  en: string;
  [language: string]: string;
}

export interface DatasetStage {
  index: number;
  name: LocalizedString;
  start: { name: LocalizedString; coordinates: Position };
  end: { name: LocalizedString; coordinates: Position };
  distanceKm: number;
  elevationGainMeters?: number;
  elevationLossMeters?: number;
  estimatedHours?: { min?: number; max?: number };
  difficulty?: string;
  warnings?: LocalizedString[];
  interior?: {
    theme?: LocalizedString;
    narrative?: LocalizedString;
    reflection?: LocalizedString;
  };
}

const NAME_MAX = 120;
const THEME_MAX = 80;
const NARRATIVE_MAX = 2000;
const CLOSING_MAX = 400;
const WARNING_MAX = 300;

/**
 * A stage with no estimated range still needs a clock, because
 * WayGeometry.elapsed(atFrac:) divides by theirActiveSeconds. One hour is the
 * smallest honest placeholder; nothing on a stage walk ever shows it.
 */
export function midpointHours(hours: { min?: number; max?: number } | undefined): number {
  const min = hours?.min;
  const max = hours?.max;
  if (typeof min === "number" && typeof max === "number") return (min + max) / 2;
  if (typeof min === "number") return min;
  if (typeof max === "number") return max;
  return 1;
}

export function lastSentence(text: string | undefined): string | undefined {
  const trimmed = cap(text, Number.MAX_SAFE_INTEGER);
  if (!trimmed) return undefined;
  const sentences = trimmed.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length === 0) return trimmed;
  return sentences[sentences.length - 1].trim();
}

/**
 * Every stage in the dataset carries `interior.reflection`, and the schema now
 * requires it — but `interior` itself is optional, so a contribution can still
 * arrive without one, and the narrative's last sentence is what closes the day
 * when that happens.
 */
export function closingFor(stage: DatasetStage): string | undefined {
  return (
    cap(stage.interior?.reflection?.en, CLOSING_MAX) ??
    cap(lastSentence(stage.interior?.narrative?.en), CLOSING_MAX)
  );
}

/**
 * Every field is written, even when the dataset is silent: the app's WayStage
 * declares `theme`, `narrative`, `closing`, `warnings`, `gainMeters` and
 * `difficulty` non-optional, so a missing key would fail the decode outright.
 * An empty string renders as nothing; a missing key renders as a refused
 * package.
 */
export function buildStageBlock(routeId: string, count: number, stage: DatasetStage): WayStage {
  const hoursMid = stage.estimatedHours;
  return {
    routeId,
    index: stage.index,
    count,
    name: cap(stage.name.en, NAME_MAX) ?? `Stage ${stage.index + 1}`,
    theme: cap(stage.interior?.theme?.en, THEME_MAX) ?? "",
    narrative: cap(stage.interior?.narrative?.en, NARRATIVE_MAX) ?? "",
    closing: closingFor(stage) ?? "",
    warnings: (stage.warnings ?? [])
      .map((warning) => cap(warning.en, WARNING_MAX))
      .filter((warning): warning is string => warning !== undefined),
    distanceKm: stage.distanceKm,
    gainMeters: typeof stage.elevationGainMeters === "number" ? stage.elevationGainMeters : 0,
    hours: {
      min: typeof hoursMid?.min === "number" ? hoursMid.min : midpointHours(hoursMid),
      max: typeof hoursMid?.max === "number" ? hoursMid.max : midpointHours(hoursMid),
    },
    difficulty: stage.difficulty ?? "",
    start: {
      name: cap(stage.start.name.en, NAME_MAX) ?? "Start",
      at: { lat: stage.start.coordinates[1], lon: stage.start.coordinates[0] },
    },
    end: {
      name: cap(stage.end.name.en, NAME_MAX) ?? "End",
      at: { lat: stage.end.coordinates[1], lon: stage.end.coordinates[0] },
    },
  };
}
