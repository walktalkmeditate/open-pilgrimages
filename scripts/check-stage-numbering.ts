import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import { resolveInvokedPath } from "./cli.js";
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

const ROOT = join(import.meta.dirname, "..");
const WAYS_ROUTE = "/ways/route.json";

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Walkable routes are listed from the tag rather than the working tree, so
 * a route deleted at head is still compared (and fails), and a tag that
 * lists none fails instead of passing with nothing checked.
 */
function main(): void {
  let tag: string;
  try {
    tag = git(["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", "HEAD"]).trim();
  } catch {
    console.error("No release tag is reachable from HEAD, so there is nothing to compare stage numbers against.");
    console.error("  ✗ Fetch tags first (actions/checkout with fetch-depth: 0). This check never passes without one.");
    process.exit(1);
  }

  const walkable = git(["ls-tree", "-r", "--name-only", tag, "--", "routes"])
    .split("\n")
    .filter((path) => path.endsWith(WAYS_ROUTE))
    .map((path) => path.slice(0, -WAYS_ROUTE.length))
    .sort();
  if (walkable.length === 0) {
    console.error(`${tag} has no walkable routes, so the tag or the repo layout is not what this check expects.`);
    process.exit(1);
  }

  const problems: string[] = [];
  for (const dir of walkable) {
    const routeId = basename(dir);
    let before: string;
    try {
      before = git(["show", `${tag}:${dir}/stages.json`]);
    } catch {
      problems.push(`${routeId}: stages.json could not be read at ${tag} or in the working tree.`);
      continue;
    }
    const headPath = join(ROOT, dir, "stages.json");
    const after = existsSync(headPath) ? readFileSync(headPath, "utf8") : undefined;
    problems.push(...checkStageNumbering(routeId, tag, before, after));
  }

  const count = `${walkable.length} walkable route${walkable.length === 1 ? "" : "s"}`;
  if (problems.length === 0) {
    console.log(`Stage numbers unchanged since ${tag} for ${count}.`);
    return;
  }

  const version = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version?: string }).version ?? "";
  if (isMajorBump(tag, version)) {
    console.log(`MAJOR release (${tag} → ${version}): these stage-number changes are allowed:`);
    for (const p of problems) console.log(`  • ${p}`);
    return;
  }

  console.error("Stage numbers are public addresses (honor.pilgrimapp.org/<route>/<stage>), and these changed:");
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error("Keep the stages where they were, or make this a MAJOR release in package.json.");
  process.exit(1);
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
