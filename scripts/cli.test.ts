import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "path";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, realpathSync } from "fs";
import { tmpdir } from "os";
import { byCodepoint, resolveInvokedPath } from "./cli.js";

const ROOT = join(import.meta.dirname, "..");

test("resolveInvokedPath resolves a symlinked invocation path", () => {
  // Node resolves symlinks for import.meta.filename but leaves process.argv[1]
  // as invoked. Without this normalisation the guard silently skips main(),
  // so the CLI script never runs and nothing reports why.
  const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
  const target = join(ROOT, "package.json");
  const link = join(dir, "invoked.js");
  symlinkSync(target, link);

  try {
    assert.equal(resolveInvokedPath(link), realpathSync(target));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveInvokedPath returns null when argv[1] is absent", () => {
  assert.equal(resolveInvokedPath(undefined), null);
});

test("resolveInvokedPath returns null for a path that does not exist", () => {
  const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
  try {
    assert.equal(resolveInvokedPath(join(dir, "nope.js")), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("byCodepoint sorts by codepoint order, not locale-sensitive order", () => {
  // #given strings whose codepoint order differs from a locale-aware order
  // (localeCompare was the subject of an earlier bug: it's environment-dependent)
  const input = ["b", "a", "Z", "A"];

  // #when sorting with byCodepoint
  const sorted = [...input].sort(byCodepoint);

  // #then uppercase codepoints (fixed, ASCII-ordered) sort before lowercase
  assert.deepEqual(sorted, ["A", "Z", "a", "b"]);
});

test("byCodepoint treats equal strings as equal", () => {
  assert.equal(byCodepoint("camino-frances", "camino-frances"), 0);
});
