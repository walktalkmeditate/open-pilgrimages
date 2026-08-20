import { realpathSync } from "fs";

/**
 * Node resolves symlinks for import.meta.filename but leaves process.argv[1]
 * as invoked, so a naive `import.meta.filename === process.argv[1]` "run as a
 * script, not imported" guard silently fails under a symlinked checkout.
 */
export function resolveInvokedPath(argv1: string | undefined): string | null {
  if (!argv1) return null;
  try {
    return realpathSync(argv1);
  } catch {
    return null;
  }
}

/**
 * A plain codepoint comparator — not localeCompare, which is
 * environment-dependent (ICU locale data varies by platform/Node build) and
 * was the subject of an earlier bug: sort order changed between machines.
 */
export function byCodepoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
