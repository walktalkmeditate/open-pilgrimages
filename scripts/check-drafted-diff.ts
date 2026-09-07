/**
 * `validate` sees one tree, so it cannot tell a stage that was never drafted
 * from one whose flag was deleted in the same commit that deleted its review.
 * Only a diff against the base ref can, which is why this is a CI step rather
 * than another validator.
 */
export function checkDraftedDiff(
  before: string,
  after: string,
  checklistAfter: string,
  routeId: string,
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
  const errors: string[] = [];

  for (const stage of baseStages) {
    if (stage.drafted !== true || stillDrafted.has(stage.index)) continue;
    if (hasTick(checklistAfter, routeId, stage.index)) continue;
    errors.push(
      `${routeId}: stage ${stage.index} stopped being drafted in this PR, but no ticked ` +
        `line records the review. Add "- [x] stage ${stage.index}" to ` +
        `docs/review/${routeId}.md, or "- [x] ${routeId} stage ${stage.index}" to the ` +
        `pilgrimage's shared checklist.`,
    );
  }

  return errors;
}

function hasTick(checklist: string, routeId: string, index: number): boolean {
  // Per spec section 6, the checklist quotes drafted text verbatim, so a tick
  // inside a fence or blockquote must not satisfy its own gate. validate.ts
  // already strips those; reused here rather than re-solving it.
  const lines = topLevelChecklistLines(checklist);
  const bare = new RegExp(`^\\s{0,3}[-*+]\\s+\\[[xX]\\]\\s+stage\\s+${index}\\b`, "m");
  const qualified = new RegExp(
    `^\\s{0,3}[-*+]\\s+\\[[xX]\\]\\s+${routeId}\\s+stage\\s+${index}\\b`,
    "m",
  );
  return bare.test(lines) || qualified.test(lines);
}

import { execFileSync } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { resolveInvokedPath } from "./cli.js";
import { topLevelChecklistLines } from "./review-checklist.js";

const ROOT = join(import.meta.dirname, "..");

function showAtRef(ref: string, path: string): string {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" });
  } catch {
    // A file absent at the base ref is a new section, which has nothing to strip.
    return '{"stages":[]}';
  }
}

function main(): void {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error("Usage: tsx scripts/check-drafted-diff.ts <base-ref>");
    process.exit(2);
  }

  const reviewDir = join(ROOT, "docs", "review");
  const checklist = existsSync(reviewDir)
    ? readdirSync(reviewDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => readFileSync(join(reviewDir, f), "utf8"))
        .join("\n")
    : "";

  const problems: string[] = [];
  for (const entry of readdirSync(join(ROOT, "routes")).sort()) {
    const rel = `routes/${entry}/stages.json`;
    if (!existsSync(join(ROOT, rel))) continue;
    problems.push(
      ...checkDraftedDiff(showAtRef(baseRef, rel), readFileSync(join(ROOT, rel), "utf8"), checklist, entry),
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
