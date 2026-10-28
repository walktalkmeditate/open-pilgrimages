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

export interface StageNumberingResult {
  /** Stage-number changes. A MAJOR release may allow these. */
  changes: string[];
  /** Files that could not be read. Nothing allows these, MAJOR included. */
  unreadable: string[];
}

export function checkStageNumbering(
  routeId: string,
  tag: string,
  before: string,
  after: string | undefined,
): StageNumberingResult {
  if (after === undefined) {
    return {
      changes: [`${routeId}: walkable at ${tag} but its stages.json is gone, so every link to it would open nothing.`],
      unreadable: [],
    };
  }
  let was: StageEnds[];
  let now: StageEnds[];
  try {
    was = stageEnds(before);
    now = stageEnds(after);
  } catch {
    return { changes: [], unreadable: [`${routeId}: stages.json could not be read at ${tag} or in the working tree.`] };
  }
  if (was.length !== now.length) {
    return {
      changes: [`${routeId}: ${was.length} stages at ${tag}, ${now.length} now, so stage links would open different days' walks.`],
      unreadable: [],
    };
  }
  const changes: string[] = [];
  for (let i = 0; i < was.length; i++) {
    for (const side of ["start", "end"] as const) {
      const meters = haversineMeters(was[i][side], now[i][side]);
      if (meters > MOVE_TOLERANCE_METERS) {
        changes.push(
          `${routeId}: stage ${i + 1} (index ${was[i].index})'s ${side} moved ${Math.round(meters)} m since ${tag}.`,
        );
      }
    }
  }
  return { changes, unreadable: [] };
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

const RELEASE_TAG_PATTERN = "v[0-9]*.[0-9]*.[0-9]*";

function describeTag(exclude?: string): string {
  const args = ["describe", "--tags", "--abbrev=0", "--match", RELEASE_TAG_PATTERN];
  if (exclude) args.push("--exclude", exclude);
  return git([...args, "HEAD"]).trim();
}

/**
 * Walkable routes are listed from the tag rather than the working tree, so
 * a route deleted at head is still compared (and fails), and a tag that
 * lists none fails instead of passing with nothing checked. A release commit
 * is measured against the release before it, never against itself.
 */
function main(): void {
  let tag: string;
  try {
    tag = describeTag();
    if (git(["rev-list", "-n", "1", tag]).trim() === git(["rev-parse", "HEAD"]).trim()) {
      tag = describeTag(tag);
    }
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

  const changes: string[] = [];
  const unreadable: string[] = [];
  for (const dir of walkable) {
    const routeId = basename(dir);
    let before: string;
    try {
      before = git(["show", `${tag}:${dir}/stages.json`]);
    } catch {
      unreadable.push(`${routeId}: stages.json could not be read at ${tag}.`);
      continue;
    }
    const headPath = join(ROOT, dir, "stages.json");
    const after = existsSync(headPath) ? readFileSync(headPath, "utf8") : undefined;
    const result = checkStageNumbering(routeId, tag, before, after);
    changes.push(...result.changes);
    unreadable.push(...result.unreadable);
    if (!existsSync(join(ROOT, dir, "ways", "route.json"))) {
      changes.push(`${routeId}: walkable at ${tag} but has no ways package now, so every link to it would open nothing.`);
    }
  }

  const count = `${walkable.length} walkable route${walkable.length === 1 ? "" : "s"}`;
  if (changes.length === 0 && unreadable.length === 0) {
    console.log(`Stage numbers unchanged since ${tag} for ${count}.`);
    return;
  }

  const version = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version?: string }).version ?? "";
  if (unreadable.length === 0 && isMajorBump(tag, version)) {
    console.log(`MAJOR release (${tag} → ${version}): these stage-number changes are allowed:`);
    for (const p of changes) console.log(`  • ${p}`);
    return;
  }

  console.error("Stage numbers are public addresses (honor.pilgrimapp.org/<route>/<stage>), and these changed:");
  for (const p of [...unreadable, ...changes]) console.error(`  ✗ ${p}`);
  if (unreadable.length > 0) {
    console.error("A file that cannot be read fails even on a MAJOR release.");
  } else {
    console.error("Keep the stages where they were, or ship the redraw as the MAJOR release itself,");
    console.error("through the release procedure, with the tag pushed right behind the merge.");
  }
  process.exit(1);
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
