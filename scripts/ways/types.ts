/** SemVer of every file this build writes, per the repo's schemaVersion rule. */
export const SCHEMA_VERSION = "1.0.0";

/** GeoJSON order: [lon, lat] or [lon, lat, alt]. Never [lat, lon]. */
export type Position = [number, number] | [number, number, number];

/** The app's order: an object, lat first. Never a bare array. */
export interface WayCoordinate {
  lat: number;
  lon: number;
}

export interface WayRoutePoint {
  lat: number;
  lon: number;
  alt?: number;
  /** Seconds since departure, synthesized from the stage's estimated hours. */
  t: number;
}

export interface WayMoment {
  id: string;
  frac: number;
  /**
   * Flat, as PilgrimageWayImporter reads it — never the nested single-key
   * object Way's synthesized Codable would write. Only waypoints exist here.
   */
  kind: "waypoint";
  /** Capped at 80: WayImporter.maxLabelCharacters. */
  label: string;
  /** SF Symbol name; the app falls back to `mappin` for one the device lacks. */
  icon: string;
  text?: string;
  names?: Record<string, string>;
  sitMinutes?: number;
  /** On the line, so the engine's 60 m trigger fires as the walker passes. */
  at: WayCoordinate;
  /** The place's own coordinate, for the map pin. */
  pin: WayCoordinate;
}

export type WayMarkKind = "water" | "food" | "bed" | "transport" | "supply" | "medical";

export interface WayMark {
  id: string;
  kind: WayMarkKind;
  name: string;
  at: WayCoordinate;
  frac: number;
  offLineMeters: number;
}

export interface WayStageHours {
  min: number;
  max: number;
}

export interface WayStagePlace {
  name: string;
  at: WayCoordinate;
}

/**
 * Every field is required: the app's `WayStage` declares them non-optional, so
 * the build writes an empty string or an empty array where the dataset is
 * silent rather than dropping a key the decoder expects.
 */
export interface WayStage {
  routeId: string;
  index: number;
  count: number;
  name: string;
  theme: string;
  narrative: string;
  closing: string;
  warnings: string[];
  distanceKm: number;
  gainMeters: number;
  hours: WayStageHours;
  difficulty: string;
  start: WayStagePlace;
  end: WayStagePlace;
}

/**
 * No `source`: the app assigns `.pilgrimage(routeId:stageIndex:)` from the
 * stage block and refuses a file whose block disagrees with what it fetched.
 */
export interface WayFile {
  schemaVersion: string;
  id: string;
  title: string;
  /** ISO-8601, whole seconds, UTC. */
  departedAt: string;
  route: WayRoutePoint[];
  totalDistanceMeters: number;
  theirActiveSeconds: number;
  moments: WayMoment[];
  marks: WayMark[];
  stage: WayStage;
}

export interface WayRouteStage {
  index: number;
  name: string;
  distanceKm: number;
  gainMeters?: number;
  hours: WayStageHours;
  difficulty?: string;
}

export interface WayRouteFile {
  schemaVersion: string;
  id: string;
  name: string;
  names?: Record<string, string>;
  country: string;
  region: string;
  distanceKm: number;
  stageCount: number;
  tradition: string;
  summary: string;
  cover?: string;
  stages: WayRouteStage[];
}

export interface WayReportStage {
  index: number;
  name: string;
  sliceKm: number;
  distanceKm: number;
  ratio: number;
  passedGate: boolean;
  boundaryMode: "snap" | "proportional";
  routePoints: number;
  moments: number;
  momentsBeyondEnds: number;
  momentsWithText: number;
  marks: number;
  /** How many marks the 400-mark app limit left behind, if any. */
  marksTrimmed: number;
  dropped: string[];
}

export interface WayReportFile {
  schemaVersion: string;
  routeId: string;
  generatedAt: string;
  walkedLine: { source: "route.main.geojson" | "route.geojson"; points: number; lengthKm: number };
  stages: WayReportStage[];
  gate: { passed: boolean; failing: number[] };
  /**
   * Waypoints of a moment type whose `stageIndex` is missing or outside
   * `0..stages.length-1` — they match no stage's filter, so they never reach
   * a stage's own `dropped` list and would otherwise vanish with no trace.
   */
  dropped: string[];
  /**
   * How well curated the route is. This does not gate anything — it becomes
   * the `sparse` flag and `placesPerStage` on the catalog entry, and the app
   * says "few places marked yet" on a sparse route's card.
   */
  places: {
    sparse: boolean;
    stagesWithMomentBeyondEnds: number;
    halfOfStages: number;
    placesPerStage: number;
    note?: string;
  };
}
