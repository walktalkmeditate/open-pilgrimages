import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "path";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
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

function problemsOf(...args: Parameters<typeof checkStageNumbering>): string[] {
  const { changes, unreadable } = checkStageNumbering(...args);
  return [...unreadable, ...changes];
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
  assert.deepEqual(problemsOf("camino-frances", "v1.0.0", stages([A, B], [B, C]), stages([A, B], [B, C])), []);
});

test("a renamed stage passes", () => {
  const renamed = JSON.parse(stages([A, B])) as { stages: { name: { en: string } }[] };
  renamed.stages[0].name.en = "Hornillos del Camino to Castrojeriz";
  assert.deepEqual(problemsOf("camino-frances", "v1.0.0", stages([A, B]), JSON.stringify(renamed)), []);
});

test("a start moved 600 m fails and names the stage by its link number", () => {
  const problems = problemsOf("camino-frances", "v1.0.0", stages([A, B]), stages([A_600M, B]));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: stage 1 \(index 0\)'s start moved 60\d m since v1\.0\.0/);
});

test("a 400 m nudge passes", () => {
  assert.deepEqual(problemsOf("camino-frances", "v1.0.0", stages([A, B]), stages([A_400M, B])), []);
});

test("a 499 m move passes and a 501 m move fails", () => {
  const metersPerDegree = (Math.PI / 180) * 6_371_000;
  const north = (meters: number): [number, number] => [A[0], A[1] + meters / metersPerDegree];
  assert.deepEqual(problemsOf("camino-frances", "v1.0.0", stages([A, B]), stages([north(499), B])), []);
  const problems = problemsOf("camino-frances", "v1.0.0", stages([A, B]), stages([north(501), B]));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /start moved 501 m/);
});

test("unreadable files are reported apart from changes, so MAJOR cannot allow them", () => {
  const result = checkStageNumbering("camino-frances", "v1.0.0", stages([A, B]), "{not json");
  assert.equal(result.changes.length, 0);
  assert.equal(result.unreadable.length, 1);
});

test("a changed stage count fails", () => {
  const problems = problemsOf("camino-frances", "v1.0.0", stages([A, B], [B, C]), stages([A, B], [B, C], [C, A]));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: 2 stages at v1\.0\.0, 3 now/);
});

test("a route gone from the working tree fails", () => {
  const problems = problemsOf("camino-frances", "v1.0.0", stages([A, B]), undefined);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: walkable at v1\.0\.0 but its stages\.json is gone/);
});

test("unreadable JSON is reported, not thrown", () => {
  const problems = problemsOf("camino-frances", "v1.0.0", stages([A, B]), "{not json");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: stages\.json could not be read/);
});

test("a stage with no end is reported, not thrown", () => {
  const broken = JSON.parse(stages([A, B])) as { stages: Record<string, unknown>[] };
  delete broken.stages[0].end;
  const problems = problemsOf("camino-frances", "v1.0.0", stages([A, B]), JSON.stringify(broken));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: stages\.json could not be read/);
});

test("stages are matched by index, not array order", () => {
  const reordered = JSON.parse(stages([A, B], [B, C])) as { stages: unknown[] };
  reordered.stages.reverse();
  assert.deepEqual(problemsOf("camino-frances", "v1.0.0", stages([A, B], [B, C]), JSON.stringify(reordered)), []);
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

test("coordinates with non-numeric elements are reported, not passed", () => {
  const broken = JSON.parse(stages([A, B])) as { stages: Record<string, unknown>[] };
  (broken.stages[0].start as unknown as Record<string, unknown>).coordinates = ["a", "b"];
  const problems = problemsOf("camino-frances", "v1.0.0", stages([A, B]), JSON.stringify(broken));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: stages\.json could not be read/);
});

test("empty coordinate arrays are reported, not passed", () => {
  const broken = JSON.parse(stages([A, B])) as { stages: Record<string, unknown>[] };
  (broken.stages[0].start as unknown as Record<string, unknown>).coordinates = [];
  const problems = problemsOf("camino-frances", "v1.0.0", stages([A, B]), JSON.stringify(broken));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /camino-frances: stages\.json could not be read/);
});

const ROOT = join(import.meta.dirname, "..");

/**
 * A real git repo holding one walkable route, tagged one commit behind HEAD, because main()'s job is the
 * git plumbing: which tag, which routes, which version. Created inside ROOT
 * so the copied script still resolves tsx from node_modules.
 */
function createTempRepo(options: { tag: boolean; walkable: boolean }): { dir: string; run: () => string } {
  const dir = mkdtempSync(join(ROOT, ".check-stage-numbering-test-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgSign", "false");
  git("config", "tag.gpgSign", "false");

  const routeDir = join(dir, "routes", "camino-frances");
  mkdirSync(join(routeDir, "ways"), { recursive: true });
  writeFileSync(join(routeDir, "stages.json"), stages([A, B], [B, C]));
  if (options.walkable) writeFileSync(join(routeDir, "ways", "route.json"), JSON.stringify({ id: "camino-frances" }));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", version: "1.0.0" }));
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  if (options.tag) git("tag", "v1.0.0");
  git("commit", "-q", "--allow-empty", "-m", "work after the release");

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

test("cli: a release commit is measured against the release before it", () => {
  const { dir, run } = createTempRepo({ tag: true, walkable: true });
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
    writeFileSync(join(dir, "routes", "camino-frances", "stages.json"), stages([A_600M, B], [B, C]));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", version: "1.1.0" }));
    git("add", "-A");
    git("commit", "-q", "-m", "release 1.1.0");
    git("tag", "v1.1.0");
    const message = stderrOf(run);
    assert.match(message, /since v1\.0\.0/);
    assert.match(message, /stage 1 \(index 0\)'s start moved/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: a walkable route that loses its ways package fails", () => {
  const { dir, run } = createTempRepo({ tag: true, walkable: true });
  try {
    rmSync(join(dir, "routes", "camino-frances", "ways", "route.json"));
    assert.match(
      stderrOf(run),
      /camino-frances: walkable at v1\.0\.0 but has no ways package now, so every link to it would open nothing\./,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: an unreadable stages.json fails even on a MAJOR release", () => {
  const { dir, run } = createTempRepo({ tag: true, walkable: true });
  try {
    writeFileSync(join(dir, "routes", "camino-frances", "stages.json"), "{not json");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", version: "2.0.0" }));
    assert.match(stderrOf(run), /camino-frances: stages\.json could not be read at v1\.0\.0 or in the working tree/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: a route new since the tag is not compared", () => {
  const { dir, run } = createTempRepo({ tag: true, walkable: true });
  try {
    const fresh = join(dir, "routes", "new-route");
    mkdirSync(join(fresh, "ways"), { recursive: true });
    writeFileSync(join(fresh, "stages.json"), stages([A, B]));
    writeFileSync(join(fresh, "ways", "route.json"), JSON.stringify({ id: "new-route" }));
    assert.match(run(), /Stage numbers unchanged since v1\.0\.0 for 1 walkable route/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: a MAJOR bump still allows a route to lose its ways package", () => {
  const { dir, run } = createTempRepo({ tag: true, walkable: true });
  try {
    rmSync(join(dir, "routes", "camino-frances", "ways", "route.json"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", version: "2.0.0" }));
    assert.match(run(), /MAJOR release/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
