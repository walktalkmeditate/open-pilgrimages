import type { Position, WayMark, WayMarkKind } from "./types.js";
import { projectOnLine } from "./geo.js";
import { cap } from "./text.js";
import { MOMENT_DROP_METERS, type WaypointFeature } from "./moments.js";

/**
 * The six kinds the map has a glyph for. A waypoint of any other service type
 * — waymarker, camping, pass, information — draws nothing, so packaging it
 * would be dead weight on the download. No route in the dataset carries one
 * today; the skip exists so a future one does not break the build.
 */
export const MARK_KIND_BY_TYPE: Record<string, WayMarkKind> = {
  water_source: "water",
  food: "food",
  accommodation: "bed",
  transport: "transport",
  supply: "supply",
  medical: "medical",
};

export const MARK_NAME_MAX = 80;

/**
 * Same precision as geo.ts's line rounding (~0.11 m) — finer than any GPS
 * fix. Kept local rather than imported: it is a one-line rounding rule, not
 * shared state, and this file has no other reason to reach into geo.ts's
 * internals.
 */
const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * PilgrimageWayImporter.maxMarks — a stage file with more is refused whole on
 * the phone. The Camino Francés' busiest stage already carries 393 service
 * waypoints, so this is one new fountain away from mattering.
 */
export const MAX_MARKS = 400;

export interface MarkInput {
  line: Position[];
  cumulative: number[];
  /** Already filtered to this stage's `stageIndex`. */
  waypoints: WaypointFeature[];
}

export function buildMarks(
  input: MarkInput,
): { marks: WayMark[]; dropped: string[]; trimmed: number } {
  const marks: WayMark[] = [];
  const dropped: string[] = [];

  for (const feature of input.waypoints) {
    const kind = MARK_KIND_BY_TYPE[feature.properties.type];
    if (!kind) continue;

    const rawId = feature.id;
    if (!rawId) continue;

    const point = feature.geometry.coordinates;
    const projection = projectOnLine(input.line, input.cumulative, point);
    if (projection.offLineMeters > MOMENT_DROP_METERS) {
      dropped.push(
        `${rawId} ("${feature.properties.name ?? rawId}") is ${Math.round(projection.offLineMeters)} m ` +
          `from the line, beyond the ${MOMENT_DROP_METERS} m limit`,
      );
      continue;
    }

    const id = rawId.startsWith("wp-") ? rawId : `wp-${rawId}`;
    marks.push({
      id,
      kind,
      name: cap(feature.properties.name, MARK_NAME_MAX) ?? id,
      // The service's own place, not the line — a mark has no `pin` field
      // to hold that separately the way a moment does, so `at` is where the
      // fountain actually is, drawn off the trail; `frac` and `offLineMeters`
      // are what tell the walker how far and where along the way to find it.
      at: { lat: round6(point[1]), lon: round6(point[0]) },
      frac: projection.frac,
      offLineMeters: Math.round(projection.offLineMeters * 10) / 10,
    });
  }

  // Over the app's limit, keep the ones nearest the trail: a walker passes
  // those, and the map only draws 40 at a time anyway. Failing the whole route
  // because one city day has 401 fountains would help nobody.
  let trimmed = 0;
  if (marks.length > MAX_MARKS) {
    trimmed = marks.length - MAX_MARKS;
    marks.sort((a, b) => a.offLineMeters - b.offLineMeters || (a.id < b.id ? -1 : 1));
    marks.length = MAX_MARKS;
  }

  marks.sort((a, b) => a.frac - b.frac || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { marks, dropped, trimmed };
}
