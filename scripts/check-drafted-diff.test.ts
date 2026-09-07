import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "fs";
import { execFileSync } from "child_process";
import { checkDraftedDiff } from "./check-drafted-diff.js";

const ROOT = join(import.meta.dirname, "..");

/**
 * A real (uncommitted-at-head) git repo, because the bug this proves lives in
 * main()'s file discovery — it only shows up when there is more than one
 * docs/review/*.md file on disk, which the pure checkDraftedDiff export
 * cannot exercise on its own.
 */
function createTempScriptRepo(): { dir: string; scriptPath: string } {
  const dir = mkdtempSync(join(ROOT, ".check-drafted-diff-test-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });

  const routeDir = join(dir, "routes", "camino-norte");
  mkdirSync(routeDir, { recursive: true });
  writeFileSync(join(routeDir, "metadata.json"), JSON.stringify({ id: "camino-norte" }));
  writeFileSync(
    join(routeDir, "stages.json"),
    JSON.stringify({ stages: [{ index: 0, drafted: true }] }),
  );
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", version: "1.7.0" }));
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: dir });

  const scriptsDir = join(dir, "scripts");
  mkdirSync(scriptsDir);
  for (const name of ["check-drafted-diff.ts", "cli.ts", "review-checklist.ts", "pilgrimage.ts"]) {
    cpSync(join(ROOT, "scripts", name), join(scriptsDir, name));
  }

  return { dir, scriptPath: join(scriptsDir, "check-drafted-diff.ts") };
}

const drafted = JSON.stringify({ stages: [{ index: 0, drafted: true }, { index: 1 }] });
const cleared = JSON.stringify({ stages: [{ index: 0 }, { index: 1 }] });

test("clearing a drafted flag with no checklist entry is an error", () => {
  // #given stage 0 was drafted at the base ref and is not at the head
  // #when neither the section nor the pilgrimage checklist mentions it
  const errors = checkDraftedDiff(drafted, cleared, "camino-norte", undefined, undefined, undefined);
  // #then the stage is named, along with the file that has to record the review
  assert.equal(errors.length, 1);
  assert.match(errors[0], /camino-norte/);
  assert.match(errors[0], /stage 0/);
  assert.match(errors[0], /docs\/review\/camino-norte\.md/);
});

test("a bare ticked entry in the route's own section file is allowed", () => {
  // #given the bare form lives in docs/review/camino-norte.md, the file the
  // spec table says the bare form counts in
  const errors = checkDraftedDiff(drafted, cleared, "camino-norte", "- [x] stage 0\n", undefined, undefined);
  assert.deepEqual(errors, []);
});

test("a section-qualified tick in the pilgrimage's shared checklist counts", () => {
  // #given the qualified form lives in docs/review/<pilgrimage-id>.md, the
  // file the spec table says the qualified form counts in
  const errors = checkDraftedDiff(
    drafted,
    cleared,
    "camino-norte",
    undefined,
    "kumano-kodo",
    "- [x] camino-norte stage 0\n",
  );
  assert.deepEqual(errors, []);
});

test("a bare tick in the pilgrimage's shared file does not clear the flag", () => {
  // #given the bare form appears, but in the pilgrimage-level file rather
  // than the route's own — the exact scoping spec section 6 exists to enforce
  const errors = checkDraftedDiff(
    drafted,
    cleared,
    "camino-norte",
    undefined,
    "kumano-kodo",
    "- [x] stage 0\n",
  );
  assert.equal(errors.length, 1);
});

test("an unticked entry does not clear the flag", () => {
  const errors = checkDraftedDiff(drafted, cleared, "camino-norte", "- [ ] stage 0\n", undefined, undefined);
  assert.equal(errors.length, 1);
});

test("a stage that was never drafted is not policed", () => {
  // #given stage 1 carried no flag at either ref
  const errors = checkDraftedDiff(drafted, drafted, "camino-norte", undefined, undefined, undefined);
  // #then nothing is reported — this check only watches flags that disappeared
  assert.deepEqual(errors, []);
});

test("a tick quoted only inside a fenced block does not count as a review", () => {
  // #given a genuinely unticked top-level entry, plus the same line quoted
  // inside a fence the way spec section 6 requires the checklist to quote
  // drafted text verbatim
  const checklist =
    "- [ ] stage 0\n\nDrafted text for stage 0, quoted verbatim per spec:\n\n```\n- [x] stage 0\n```\n";
  // #when the diff checker reads the checklist after the flag was cleared
  const errors = checkDraftedDiff(drafted, cleared, "camino-norte", checklist, undefined, undefined);
  // #then the fenced tick must not satisfy the gate — only the top-level line counts
  assert.equal(errors.length, 1);
  assert.match(errors[0], /stage 0/);
});

test("a bare tick in an unrelated route's checklist does not clear this route's flag", () => {
  const { dir, scriptPath } = createTempScriptRepo();
  try {
    const baseRef = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();

    // #given the flag clears at head, and a bare tick exists — but only in a
    // different route's own review file, never in docs/review/camino-norte.md
    // or a pilgrimage file camino-norte belongs to
    writeFileSync(
      join(dir, "routes", "camino-norte", "stages.json"),
      JSON.stringify({ stages: [{ index: 0 }] }),
    );
    mkdirSync(join(dir, "docs", "review"), { recursive: true });
    writeFileSync(join(dir, "docs", "review", "some-other-route.md"), "- [x] stage 0\n");

    // #when / #then main() must not let that unrelated file's tick stand in
    // for camino-norte's own review
    assert.throws(() =>
      execFileSync(process.execPath, ["--import", "tsx", scriptPath, baseRef], {
        cwd: dir,
        stdio: "pipe",
      }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unparseable base ref is reported, not thrown", () => {
  const errors = checkDraftedDiff("{not json", cleared, "camino-norte", undefined, undefined, undefined);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /could not be read/);
});
