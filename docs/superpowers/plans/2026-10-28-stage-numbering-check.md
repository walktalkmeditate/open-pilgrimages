# Stage Numbering Check — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CI fails when a walkable route's stage numbers change meaning (its stage count changes, or stage N's start or end moves more than 500 m since the last release tag) unless the release is MAJOR, because `honor.pilgrimapp.org/<route>/<stage>` links now carry those numbers.

**Architecture:** One new script, `scripts/check-stage-numbering.ts`, shaped like `check-drafted-diff.ts`: pure exported functions (`checkStageNumbering`, `isMajorBump`) that never touch git or disk, and a `main()` that does every git and file read. The walkable routes are listed *from the tag* (`git ls-tree`), so a route deleted at head is caught and an empty listing fails rather than passing.

**Tech Stack:** TypeScript run by `tsx`, `node:test` + `node:assert/strict`, git CLI via `execFileSync`, `haversineMeters` from `scripts/ways/geo.ts`.

**Spec:** `pilgrim-ios/docs/superpowers/specs/2026-10-28-stage-links-design.md` §5 (commit `b27c071` on pilgrim-ios `feat/stage-links`). Read §5 and §6 step 1 before starting.

## Global Constraints

- Branch `feat/stage-links` in `open-pilgrimages`. Never commit to `main`. Ship by PR, opened only on the owner's go.
- Stage numbers in messages are counted from 1 (the link's numbering), with the data index in brackets: `stage 14 (index 13)`.
- Tolerance is exactly **500 m** (`MOVE_TOLERANCE_METERS = 500`), compared with `>`: 500 m passes, 501 m fails.
- Names are never compared.
- The check fails closed: no reachable tag fails, zero walkable routes at the tag fails, an unreadable `stages.json` fails. It never prints success without having compared at least one route.
- MAJOR means `package.json` major version > the tag's major version, both strictly `MAJOR.MINOR.PATCH` (tag with a leading `v`). Anything unparseable is not MAJOR.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests run with `npm test`; types with `npx tsc --noEmit`.

## Review Focus

- **A stage missing `start` or `end` in one of the two trees** → a named problem for that route, not a TypeError stack trace. Pinned in Task 1 (`a stage with no end is reported, not thrown`).
- **`stages.json` listing the same stages in a different array order** → passes, because stages are matched by `index`, not array position. Pinned in Task 1 (`stages are matched by index, not array order`).
- **A pre-release version such as `2.0.0-rc.1`** → not MAJOR, so the gate stays shut. Pinned in Task 1 (`isMajorBump` cases).
- **A walkable route deleted at head** → fails, because every link to it would open nothing. Pinned in Task 1 (`a route gone from the working tree fails`).
- **Exactly 500 m of movement** → passes; the boundary is `>`. Pinned in Task 1 (`a 400 m nudge passes`) plus the constant itself.

---

### Task 1: The pure check

**Files:**
- Create: `scripts/check-stage-numbering.ts`
- Test: `scripts/check-stage-numbering.test.ts`

**Interfaces:**
- Consumes: `haversineMeters(a: Position, b: Position): number` from `scripts/ways/geo.ts`; `Position` from `scripts/ways/types.ts`.
- Produces:
  - `export const MOVE_TOLERANCE_METERS = 500`
  - `export function checkStageNumbering(routeId: string, tag: string, before: string, after: string | undefined): string[]` (`before`/`after` are raw `stages.json` text; `after` undefined = file gone at head; returns problems, empty = fine)
  - `export function isMajorBump(tag: string, version: string): boolean`

- [ ] **Step 1: Write the failing tests**

Create `scripts/check-stage-numbering.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkStageNumbering, isMajorBump, MOVE_TOLERANCE_METERS } from "./check-stage-numbering.js";

type Ends = [[number, number], [number, number]];

/** A stages.json body with one stage per [start, end] pair, indexed in order. */
function stages(...ends: Ends[]): string {
  return JSON.stringify({
    stages: ends.map(([start, end], index) => ({
      index,
      name: { en: `stage ${index}` },
      start: { name: { en: "from" }, coordinates: start },
      end: { name: { en: "to" }, coordinates: end },
      distanceKm: 20,
    })),
  });
}

const A: [number, number] = [-3.912, 42.337];
const B: [number, number] = [-4.14, 42.289];
const C: [number, number] = [-4.4, 42.3];
/** ~600 m and ~400 m north of A: one degree of latitude is ~111.2 km. */
const A_600M: [number, number] = [A[0], A[1] + 0.0054];
const A_400M: [number, number] = [A[0], A[1] + 0.0036];

test("the tolerance is 500 m", () => {
  assert.equal(MOVE_TOLERANCE_METERS, 500);
});

test("an unchanged route passes", () => {
  assert.deepEqual(checkStageNumbering("camino-frances", "v1.0.0", stages([A, B], [B, C]), stages([A, B], [B, C])), []);
});

test("a renamed stage passes", () => {
  const renamed = JSON.parse(stages([A, B])) as { stages: { name: { en: string } }[] };
  renamed.stages[0].name.en = "Hornillos del Camino to Castrojeriz";
  assert.deepEqual(checkStageNumbering("camino-frances", "v1.0.0", stages([A, B]), JSON.stringify(renamed)), []);
});

test("a start moved 600 m fails and names the stage by its link number", () => {
  const problems = checkStageNumbering("camino-frances", "v1.0.0", stages([A, B]), stages([A_600M, B]));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: stage 1 \(index 0\)'s start moved 60\d m since v1\.0\.0/);
});

test("a 400 m nudge passes", () => {
  assert.deepEqual(checkStageNumbering("camino-frances", "v1.0.0", stages([A, B]), stages([A_400M, B])), []);
});

test("a changed stage count fails", () => {
  const problems = checkStageNumbering("camino-frances", "v1.0.0", stages([A, B], [B, C]), stages([A, B], [B, C], [C, A]));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: 2 stages at v1\.0\.0, 3 now/);
});

test("a route gone from the working tree fails", () => {
  const problems = checkStageNumbering("camino-frances", "v1.0.0", stages([A, B]), undefined);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: walkable at v1\.0\.0 but its stages\.json is gone/);
});

test("unreadable JSON is reported, not thrown", () => {
  const problems = checkStageNumbering("camino-frances", "v1.0.0", stages([A, B]), "{not json");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: stages\.json could not be read/);
});

test("a stage with no end is reported, not thrown", () => {
  const broken = JSON.parse(stages([A, B])) as { stages: Record<string, unknown>[] };
  delete broken.stages[0].end;
  const problems = checkStageNumbering("camino-frances", "v1.0.0", stages([A, B]), JSON.stringify(broken));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: stages\.json could not be read/);
});

test("stages are matched by index, not array order", () => {
  const reordered = JSON.parse(stages([A, B], [B, C])) as { stages: unknown[] };
  reordered.stages.reverse();
  assert.deepEqual(checkStageNumbering("camino-frances", "v1.0.0", stages([A, B], [B, C]), JSON.stringify(reordered)), []);
});

test("isMajorBump only for a strictly higher major", () => {
  assert.equal(isMajorBump("v1.12.0", "2.0.0"), true);
  assert.equal(isMajorBump("v1.12.0", "1.13.0"), false);
  assert.equal(isMajorBump("v1.12.0", "1.12.0"), false);
  assert.equal(isMajorBump("v2.0.0", "1.99.0"), false);
  assert.equal(isMajorBump("v1.12.0", "2.0.0-rc.1"), false);
  assert.equal(isMajorBump("v1.12.0", "not-a-version"), false);
  assert.equal(isMajorBump("main", "2.0.0"), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './check-stage-numbering.js'`.

- [ ] **Step 3: Write the pure functions**

Create `scripts/check-stage-numbering.ts`:

```ts
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

function stageEnds(json: string): StageEnds[] {
  const stages = (JSON.parse(json) as { stages?: unknown }).stages;
  if (!Array.isArray(stages)) throw new Error("no stages array");
  return stages
    .map((raw) => {
      const s = raw as { index?: unknown; start?: { coordinates?: unknown }; end?: { coordinates?: unknown } };
      const start = s.start?.coordinates;
      const end = s.end?.coordinates;
      if (typeof s.index !== "number" || !Array.isArray(start) || !Array.isArray(end)) {
        throw new Error("a stage is missing its index, start or end");
      }
      return { index: s.index, start: start as Position, end: end as Position };
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -20` and `npx tsc --noEmit`
Expected: every test passes, including all of `check-stage-numbering.test.ts`; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-stage-numbering.ts scripts/check-stage-numbering.test.ts
git commit -F - <<'EOF'
feat(check): know when a route's stage numbers change meaning

honor.pilgrimapp.org/<route>/<stage> links will carry these numbers, so a
redraw that moves stage 14 sends every saved link to a different day's
walk. This is the pure half: count and endpoint comparison, plus what
counts as a MAJOR release.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: The CLI, CI step and the written rule

**Files:**
- Modify: `scripts/check-stage-numbering.ts` (append `main()`)
- Modify: `scripts/check-stage-numbering.test.ts` (append CLI tests)
- Modify: `package.json` (`scripts`)
- Modify: `.github/workflows/validate.yml` (one step after `npm run validate`)
- Modify: `README.md:254` (Versioning bullet)
- Modify: `CLAUDE.md` (conventions list, after the `Route IDs` bullet near line 62)

**Interfaces:**
- Consumes: `checkStageNumbering`, `isMajorBump` from Task 1; `resolveInvokedPath(argv1: string | undefined): string | null` from `scripts/cli.ts`.
- Produces: `npm run check-stage-numbering`, exit 0 on pass (or MAJOR), 1 on any problem or missing tag.

- [ ] **Step 1: Write the failing CLI tests**

Append to `scripts/check-stage-numbering.test.ts`:

```ts
import { join } from "path";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";

const ROOT = join(import.meta.dirname, "..");

/**
 * A real git repo holding one walkable route, because main()'s job is the
 * git plumbing: which tag, which routes, which version. Created inside ROOT
 * so the copied script still resolves tsx from node_modules.
 */
function createTempRepo(options: { tag: boolean; walkable: boolean }): { dir: string; run: () => string } {
  const dir = mkdtempSync(join(ROOT, ".check-stage-numbering-test-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");

  const routeDir = join(dir, "routes", "camino-frances");
  mkdirSync(join(routeDir, "ways"), { recursive: true });
  writeFileSync(join(routeDir, "stages.json"), stages([A, B], [B, C]));
  if (options.walkable) writeFileSync(join(routeDir, "ways", "route.json"), JSON.stringify({ id: "camino-frances" }));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", version: "1.0.0" }));
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  if (options.tag) git("tag", "v1.0.0");

  mkdirSync(join(dir, "scripts", "ways"), { recursive: true });
  for (const name of ["check-stage-numbering.ts", "cli.ts", "ways/geo.ts", "ways/types.ts"]) {
    cpSync(join(ROOT, "scripts", name), join(dir, "scripts", name));
  }
  const scriptPath = join(dir, "scripts", "check-stage-numbering.ts");
  return {
    dir,
    run: () =>
      execFileSync(process.execPath, ["--import", "tsx", scriptPath], { cwd: dir, stdio: "pipe", encoding: "utf8" }),
  };
}

function stderrOf(run: () => string): string {
  try {
    run();
  } catch (error) {
    return (error as { stderr?: Buffer | string }).stderr?.toString() ?? "";
  }
  assert.fail("expected the check to exit non-zero");
}

test("cli: unchanged since the tag passes and says how many routes it compared", () => {
  const { dir, run } = createTempRepo({ tag: true, walkable: true });
  try {
    assert.match(run(), /Stage numbers unchanged since v1\.0\.0 for 1 walkable route/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: a moved stage on a MINOR release fails", () => {
  const { dir, run } = createTempRepo({ tag: true, walkable: true });
  try {
    writeFileSync(join(dir, "routes", "camino-frances", "stages.json"), stages([A_600M, B], [B, C]));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", version: "1.1.0" }));
    assert.match(stderrOf(run), /camino-frances: stage 1 \(index 0\)'s start moved/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: the same move on a MAJOR release passes and lists what it allowed", () => {
  const { dir, run } = createTempRepo({ tag: true, walkable: true });
  try {
    writeFileSync(join(dir, "routes", "camino-frances", "stages.json"), stages([A_600M, B], [B, C]));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", version: "2.0.0" }));
    const stdout = run();
    assert.match(stdout, /MAJOR release/);
    assert.match(stdout, /camino-frances: stage 1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: no reachable tag fails instead of passing with nothing compared", () => {
  const { dir, run } = createTempRepo({ tag: false, walkable: true });
  try {
    assert.match(stderrOf(run), /No release tag is reachable from HEAD/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: a tag with no walkable routes fails", () => {
  const { dir, run } = createTempRepo({ tag: true, walkable: false });
  try {
    assert.match(stderrOf(run), /v1\.0\.0 has no walkable routes/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

Move the three new `import` lines to the top of the file with the others, so the file has one import block.

- [ ] **Step 2: Run the tests to verify the CLI ones fail**

Run: `npm test 2>&1 | grep -E "^not ok|cli:" | head`
Expected: the five `cli:` tests fail (the script exits 0 with no output, since there is no `main()` yet).

- [ ] **Step 3: Write `main()`**

Append to `scripts/check-stage-numbering.ts`, and add the imports at the top:

```ts
import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import { resolveInvokedPath } from "./cli.js";
```

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -20` and `npx tsc --noEmit`
Expected: all tests pass; `tsc` prints nothing. No `.check-stage-numbering-test-*` directories are left in the repo root (`ls -d .check-stage-numbering-test-* 2>/dev/null` prints nothing).

- [ ] **Step 5: Wire the script, the CI step and the docs**

In `package.json` `scripts`, after `"check-drafted-diff"`:

```json
    "check-stage-numbering": "tsx scripts/check-stage-numbering.ts",
```

In `.github/workflows/validate.yml`, directly after the `- run: npm run validate` line:

```yaml
      - name: Stage numbers stay where links expect them
        # Runs on push and pull_request alike. It reads the last release tag,
        # which the checkout above already fetched: fetch-depth: 0 brings
        # every tag with the history. Without a tag the script fails rather
        # than passing with nothing compared.
        run: npm run check-stage-numbering
```

In `README.md`, replace the Versioning bullet (line 254) with:

```markdown
- **Versioning:** Read the catalog from `@main`, then pin every file you download to the exact tag its `release` field names. `@v1` is frozen at whatever jsDelivr cached — it is no longer moved on release. MINOR adds optional fields. MAJOR = breaking. A walkable route's stage numbers are public addresses (`honor.pilgrimapp.org/<route>/<stage>` opens that stage in Pilgrim, counted from 1), so changing a route's stage count or moving a stage's start or end more than 500 m is MAJOR. CI's `check-stage-numbering` compares against the last release tag.
```

In `CLAUDE.md`, directly after the bullet that starts `- Route IDs: kebab-case`:

```markdown
- Stage numbers of a walkable route are public addresses:
  `honor.pilgrimapp.org/<route>/<stage>` (counted from 1) opens that stage in
  Pilgrim, and shared links outlive releases. Changing a route's stage count,
  or moving a stage's start or end more than 500 m, is a MAJOR release.
  `npm run check-stage-numbering` compares against the last tag; renaming a
  stage is fine.
```

- [ ] **Step 6: Run the check against the real repo**

Run: `npm run check-stage-numbering`
Expected: `Stage numbers unchanged since v1.12.0 for 8 walkable routes.` (or the current tag and count if a release has landed since; the count must be greater than zero).

- [ ] **Step 7: Commit**

```bash
git add scripts/check-stage-numbering.ts scripts/check-stage-numbering.test.ts package.json .github/workflows/validate.yml README.md CLAUDE.md
git commit -F - <<'EOF'
feat(check): stage numbers stay put unless the release is MAJOR

Runs in CI against the last release tag, listing walkable routes from the
tag itself so a deleted route is still caught. It fails without a tag or
with nothing to compare, because a gate that quietly checks nothing is
worse than none. The rule is written into the README and CLAUDE.md.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 8: Push and open the PR (on the owner's go)**

```bash
git push -u origin feat/stage-links
gh pr create --title "Stage numbers are public addresses" --body-file - <<'EOF'
Stage links (`honor.pilgrimapp.org/<route>/<stage>`) are coming to Pilgrim, so a route's stage numbers become addresses that outlive any release. This adds `check-stage-numbering`, which fails CI when a walkable route's stage count changes or a stage's start or end moves more than 500 m since the last tag, unless the release is MAJOR. Renaming a stage passes.

Spec: pilgrim-ios `docs/superpowers/specs/2026-10-28-stage-links-design.md` §5.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Expected: CI's new step prints `Stage numbers unchanged since v1.12.0 for 8 walkable routes.`
