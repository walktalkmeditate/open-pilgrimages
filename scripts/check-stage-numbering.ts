import { haversineMeters } from "./ways/geo.js";
import type { Position } from "./ways/types.js";

/**
 * A walkable route's stage numbers are public addresses:
 * honor.pilgrimapp.org/<route>/<stage> opens that stage in Pilgrim, and a
 * link shared today is still tapped after the next release. A redraw that
 * shifts what stage 14 means sends every such link to a different day's
 * walk without anyone noticing, so it has to be a deliberate MAJOR release.
 *
 * Pure by design, like check-drafted-diff.ts: every git and filesystem read
 * happens in main() below.
 */
export const MOVE_TOLERANCE_METERS = 500;

interface StageEnds {
  index: number;
  start: Position;
  end: Position;
}

function isValidPosition(p: unknown): p is Position {
  if (!Array.isArray(p) || p.length < 2 || p.length > 3) return false;
  if (typeof p[0] !== "number" || !Number.isFinite(p[0])) return false;
  if (typeof p[1] !== "number" || !Number.isFinite(p[1])) return false;
  if (p.length === 3 && (typeof p[2] !== "number" || !Number.isFinite(p[2]))) return false;
  return true;
}

function stageEnds(json: string): StageEnds[] {
  const stages = (JSON.parse(json) as { stages?: unknown }).stages;
  if (!Array.isArray(stages)) throw new Error("no stages array");
  return stages
    .map((raw) => {
      const s = raw as { index?: unknown; start?: { coordinates?: unknown }; end?: { coordinates?: unknown } };
      const start = s.start?.coordinates;
      const end = s.end?.coordinates;
      if (typeof s.index !== "number" || !isValidPosition(start) || !isValidPosition(end)) {
        throw new Error("a stage is missing its index, start or end");
      }
      return { index: s.index, start, end };
    })
    .sort((a, b) => a.index - b.index);
}

export function checkStageNumbering(
  routeId: string,
  tag: string,
  before: string,
  after: string | undefined,
): string[] {
  if (after === undefined) {
    return [`${routeId}: walkable at ${tag} but its stages.json is gone, so every link to it would open nothing.`];
  }
  let was: StageEnds[];
  let now: StageEnds[];
  try {
    was = stageEnds(before);
    now = stageEnds(after);
  } catch {
    return [`${routeId}: stages.json could not be read at ${tag} or in the working tree.`];
  }
  if (was.length !== now.length) {
    return [`${routeId}: ${was.length} stages at ${tag}, ${now.length} now, so stage links would open different days' walks.`];
  }
  const problems: string[] = [];
  for (let i = 0; i < was.length; i++) {
    for (const side of ["start", "end"] as const) {
      const meters = haversineMeters(was[i][side], now[i][side]);
      if (meters > MOVE_TOLERANCE_METERS) {
        problems.push(
          `${routeId}: stage ${i + 1} (index ${was[i].index})'s ${side} moved ${Math.round(meters)} m since ${tag}.`,
        );
      }
    }
  }
  return problems;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function isMajorBump(tag: string, version: string): boolean {
  const from = SEMVER.exec(tag.replace(/^v/, ""));
  const to = SEMVER.exec(version);
  if (!tag.startsWith("v") || !from || !to) return false;
  return Number(to[1]) > Number(from[1]);
}
