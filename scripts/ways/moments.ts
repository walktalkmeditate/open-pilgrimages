import type { Position, WayCoordinate, WayMoment } from "./types.js";
import { haversineMeters, projectOnLine } from "./geo.js";
import { cap, nonEnglishNames } from "./text.js";

export interface WaypointProperties {
  routeId?: string;
  type: string;
  name?: string;
  nameLocalized?: Record<string, string>;
  description?: string;
  stageIndex?: number;
  kmFromStart?: number;
  templeNumber?: number;
  tradition?: string;
  denomination?: string;
  credentialStamp?: boolean;
  stampFee?: { currency?: string; amount?: number };
}

export interface WaypointFeature {
  id?: string;
  type?: string;
  geometry: { type: string; coordinates: Position };
  properties: WaypointProperties;
}

export interface StagePlace {
  name: string;
  at: Position;
  localized?: Record<string, string>;
}

export interface MomentInput {
  line: Position[];
  cumulative: number[];
  /** Already filtered to this stage's `stageIndex`. */
  waypoints: WaypointFeature[];
  start: StagePlace;
  end: StagePlace;
}

export interface MomentResult {
  moments: WayMoment[];
  dropped: string[];
  /** Moments that are neither the stage's start place nor its end place. */
  beyondEnds: number;
}

export const MOMENT_TYPES: readonly string[] = [
  "sacred_site",
  "cultural_site",
  "viewpoint",
  "town",
  "credential_stamp",
];

export const ICON_BY_TYPE: Record<string, string> = {
  sacred_site: "building.columns",
  cultural_site: "book.closed",
  viewpoint: "eye",
  town: "house.lodge",
  credential_stamp: "seal",
};

/** A place this far off the trail is a detour, not something you walk past. */
export const MOMENT_DROP_METERS = 300;

/** Close enough that the stage's own start or end place is already on the map. */
export const PLACE_MATCH_METERS = 150;

export const SIT_MINUTES = 5;

const SIT_TYPES = new Set(["sacred_site", "viewpoint"]);

const MOMENT_TEXT_MAX = 600;
/** WayImporter.maxLabelCharacters — a longer label is refused on the phone. */
const LABEL_MAX = 80;

const CURRENCY_SYMBOL: Record<string, string> = { JPY: "¥", EUR: "€", GBP: "£", USD: "$" };

export function iconFor(properties: WaypointProperties): string {
  if (properties.credentialStamp === true) return "seal";
  return ICON_BY_TYPE[properties.type] ?? "mappin";
}

function feeText(fee: WaypointProperties["stampFee"]): string {
  if (!fee || typeof fee.amount !== "number" || !fee.currency) return "";
  const symbol = CURRENCY_SYMBOL[fee.currency];
  return symbol ? ` (${symbol}${fee.amount})` : ` (${fee.amount} ${fee.currency})`;
}

/**
 * The line a card shows when the dataset gave a place no description. Built
 * only from fields that are already facts about the place, never invented.
 */
export function composedText(properties: WaypointProperties): string | undefined {
  const parts: string[] = [];

  if (typeof properties.templeNumber === "number") {
    parts.push(`Temple ${properties.templeNumber}`);
  }

  const school =
    cap(properties.denomination, 80) ??
    (properties.tradition
      ? properties.tradition.charAt(0).toUpperCase() + properties.tradition.slice(1)
      : undefined);
  if (school) parts.push(school);

  if (properties.credentialStamp === true) {
    parts.push(`stamp available${feeText(properties.stampFee)}`);
  }

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

const coordinate = (p: Position): WayCoordinate => ({ lat: p[1], lon: p[0] });

function placeMoment(
  id: string,
  place: StagePlace,
  line: Position[],
  cumulative: number[],
): WayMoment {
  const projection = projectOnLine(line, cumulative, place.at);
  const moment: WayMoment = {
    id,
    frac: projection.frac,
    kind: "waypoint",
    label: cap(place.name, LABEL_MAX) ?? place.name,
    icon: "house.lodge",
    at: coordinate(projection.at),
    pin: coordinate(place.at),
  };
  const names = nonEnglishNames(place.localized);
  if (names) moment.names = names;
  return moment;
}

export function buildMoments(input: MomentInput): MomentResult {
  const { line, cumulative, waypoints, start, end } = input;
  const moments: WayMoment[] = [];
  const dropped: string[] = [];
  const beyondEndIds = new Set<string>();

  let startHasTown = false;
  let endHasTown = false;

  for (const feature of waypoints) {
    const properties = feature.properties;
    if (!MOMENT_TYPES.includes(properties.type)) continue;

    const rawId = feature.id;
    if (!rawId) continue;

    const point = feature.geometry.coordinates;
    const nearStart = haversineMeters(point, start.at) <= PLACE_MATCH_METERS;
    const nearEnd = haversineMeters(point, end.at) <= PLACE_MATCH_METERS;

    const projection = projectOnLine(line, cumulative, point);
    if (projection.offLineMeters > MOMENT_DROP_METERS) {
      dropped.push(
        `${rawId} ("${properties.name ?? rawId}") is ${Math.round(projection.offLineMeters)} m ` +
          `from the line, beyond the ${MOMENT_DROP_METERS} m limit`,
      );
      continue;
    }

    if (properties.type === "town") {
      if (nearStart) startHasTown = true;
      if (nearEnd) endHasTown = true;
    }

    // The Camino's ids are already `wp-sjpp`; Shikoku's are `temple-12`. Both
    // conventions are already fit to be a moment id, so the raw id is used
    // as-is rather than guessed at — prefixing the first would double it to
    // `wp-wp-sjpp`, and prefixing the second would hide `temple-3` behind
    // `wp-temple-3` for no reason.
    const id = rawId;
    const moment: WayMoment = {
      id,
      frac: projection.frac,
      kind: "waypoint",
      label: cap(properties.name, LABEL_MAX) ?? id,
      icon: iconFor(properties),
      at: coordinate(projection.at),
      pin: coordinate(point),
    };

    const text = cap(properties.description, MOMENT_TEXT_MAX) ?? composedText(properties);
    if (text) moment.text = text;

    const names = nonEnglishNames(properties.nameLocalized);
    if (names) moment.names = names;

    if (SIT_TYPES.has(properties.type)) moment.sitMinutes = SIT_MINUTES;

    moments.push(moment);
    if (!nearStart && !nearEnd) beyondEndIds.add(id);
  }

  if (!startHasTown) moments.push(placeMoment("stage-start", start, line, cumulative));
  if (!endHasTown) moments.push(placeMoment("stage-end", end, line, cumulative));

  moments.sort((a, b) => a.frac - b.frac || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { moments, dropped, beyondEnds: beyondEndIds.size };
}
