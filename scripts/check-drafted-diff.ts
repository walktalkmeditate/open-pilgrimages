import {
  buildReviewChecklist,
  checklistEntry,
  escapeForPattern,
  selectReviewChecklist,
  TICKED_BOX,
} from "./review-checklist.js";

/**
 * `validate` sees one tree, so it cannot tell a stage that was never drafted
 * from one whose flag was deleted in the same commit that deleted its review.
 * Only a diff against the base ref can, which is why this is a CI step rather
 * than another validator.
 *
 * Pure by design — every git and filesystem read happens in main() below —
 * so this stays unit-testable without touching disk or git. `sectionChecklist`
 * and `pilgrimageChecklist` are `docs/review/<routeId>.md` and
 * `docs/review/<pilgrimageId>.md` at head, or `undefined` where the file does
 * not exist (or the route has no pilgrimage). Passing each route's own two
 * files in, rather than one string pooled across every route in the repo, is
 * what stops a bare tick that belongs to a different section from ever being
 * read as this one's review — see review-checklist.ts's selectReviewChecklist
 * for why the two files cannot simply be concatenated either.
 */
export function checkDraftedDiff(
  before: string,
  after: string,
  routeId: string,
  sectionChecklist: string | undefined,
  pilgrimageId: string | undefined,
  pilgrimageChecklist: string | undefined,
): string[] {
  let baseStages: { index: number; drafted?: boolean }[];
  let headStages: { index: number; drafted?: boolean }[];
  try {
    baseStages = JSON.parse(before).stages ?? [];
    headStages = JSON.parse(after).stages ?? [];
  } catch {
    return [`${routeId}: stages.json could not be read at one of the two refs`];
  }

  const stillDrafted = new Set(
    headStages.filter((s) => s.drafted === true).map((s) => s.index),
  );
  const clearedIndices = baseStages
    .filter((s) => s.drafted === true && !stillDrafted.has(s.index))
    .map((s) => s.index);

  if (clearedIndices.length === 0) return [];

  const section =
    sectionChecklist !== undefined
      ? buildReviewChecklist(`docs/review/${routeId}.md`, sectionChecklist, "")
      : undefined;
  const pilgrimage =
    pilgrimageId !== undefined && pilgrimageChecklist !== undefined
      ? buildReviewChecklist(
          `docs/review/${pilgrimageId}.md`,
          pilgrimageChecklist,
          `${escapeForPattern(routeId)} `,
        )
      : undefined;
  const checklist = selectReviewChecklist(section, pilgrimage, clearedIndices);

  return clearedIndices
    .filter(
      (index) =>
        !checklist ||
        !checklistEntry(checklist.lines, TICKED_BOX, `${checklist.qualifier}stage ${index}`),
    )
    .map(
      (index) =>
        `${routeId}: stage ${index} stopped being drafted in this PR, but no ticked ` +
        `line records the review. Add "- [x] stage ${index}" to ` +
        `docs/review/${routeId}.md, or "- [x] ${routeId} stage ${index}" to the ` +
        `pilgrimage's shared checklist.`,
    );
}

import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { basename, join, relative, sep } from "path";
import { resolveInvokedPath } from "./cli.js";
import { readPilgrimage } from "./pilgrimage.js";
import { findRouteDirectories } from "./routes.js";

const ROOT = join(import.meta.dirname, "..");

/**
 * A missing path and a bad ref both exit `git show` with status 128, so exit
 * code alone cannot tell them apart. Prose can (git's wording differs by
 * case), but it varies by git version and by whether the path happens to
 * exist on disk — a new section's path always does, and would silently stop
 * matching a wording check pinned to only one of the two phrasings. Checking
 * the ref and the path as separate structural questions never has that
 * failure mode: `rev-parse --verify --quiet` reports only whether <ref>
 * itself resolves, untouched by what path is asked for, and `cat-file -e`
 * reports only whether <ref>:<path> exists, once the ref is known good.
 */
function refExists(ref: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function pathExistsAtRef(ref: string, path: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${ref}:${path}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Everything but the missing-path case (a bad ref, a failed `git fetch`, a
 * corrupt repo) must exit non-zero with the git error: this gate exists to
 * close a fail-open path, so failing open on an infrastructure error would
 * be the same mistake again, just moved one level down.
 */
export function showAtRef(ref: string, path: string): string {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (refExists(ref) && !pathExistsAtRef(ref, path)) {
      // A path absent at the base ref is a new section, which has nothing to strip.
      return '{"stages":[]}';
    }
    throw error;
  }
}

function readChecklistFile(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

function main(): void {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error("Usage: tsx scripts/check-drafted-diff.ts <base-ref>");
    process.exit(2);
  }

  const problems: string[] = [];
  // The same walk validate uses, so a section one of them polices is never a
  // section the other cannot see — sections under variants/ included.
  for (const dir of findRouteDirectories(ROOT).sort()) {
    const stagesPath = join(dir, "stages.json");
    if (!existsSync(stagesPath)) continue;
    // git addresses paths from the repo root, with forward slashes.
    const rel = relative(ROOT, stagesPath).split(sep).join("/");

    let meta: { id?: string } = {};
    try {
      meta = JSON.parse(readFileSync(join(dir, "metadata.json"), "utf8"));
    } catch {
      // Malformed metadata is validate.ts's problem to name; this gate
      // still has a route id — the directory name — to check stages against.
    }
    const routeId = meta.id ?? basename(dir);
    let pilgrimageId: string | undefined;
    try {
      pilgrimageId = readPilgrimage(meta)?.id;
    } catch {
      // Same: a malformed pilgrimage block is validate.ts's to report. A
      // section whose pilgrimage cannot be read simply has no shared
      // checklist to fall back to, and its own file still applies.
    }

    const sectionChecklist = readChecklistFile(join(ROOT, "docs", "review", `${routeId}.md`));
    const pilgrimageChecklist = pilgrimageId
      ? readChecklistFile(join(ROOT, "docs", "review", `${pilgrimageId}.md`))
      : undefined;

    let before: string;
    try {
      before = showAtRef(baseRef, rel);
    } catch (error) {
      console.error(`Could not read ${rel} at ${baseRef}:`);
      for (const line of (error instanceof Error ? error.message : String(error)).split("\n")) {
        console.error(`  ✗ ${line}`);
      }
      process.exit(1);
    }

    problems.push(
      ...checkDraftedDiff(
        before,
        readFileSync(stagesPath, "utf8"),
        routeId,
        sectionChecklist,
        pilgrimageId,
        pilgrimageChecklist,
      ),
    );
  }

  if (problems.length > 0) {
    console.error("Drafted text was cleared without a recorded review:");
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log("Every cleared drafted flag has a recorded review.");
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
