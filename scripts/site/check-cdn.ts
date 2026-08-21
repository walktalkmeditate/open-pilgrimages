import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { byCodepoint, resolveInvokedPath } from "../cli.js";
import { extractCdnRefs } from "./cdn.js";

const ROOT = join(import.meta.dirname, "..", "..");

// Deliberately not run from CI (see .github/workflows/validate.yml, which
// never references this script) — CI stays offline and deterministic.
// check-site.ts's offline guard catches everything that can be caught
// without the network (a bad path, a bad ref); this closes the one gap it
// structurally can't: a path that exists in the working tree but hasn't
// been released yet, so `@v1` doesn't serve it. That gap only closes once a
// release actually ships — which is why the release runbook
// (.claude/commands/release.md) runs this after moving the `v1` tag and
// purging jsDelivr's cache, not on every PR.
const USER_AGENT =
  "open-pilgrimages-check-cdn/1.0 (+https://github.com/walktalkmeditate/open-pilgrimages)";
const REQUEST_DELAY_MS = 300;
const CLIENT_TIMEOUT_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Every distinct jsDelivr URL this repo's own docs/*.html and README.md
 * reference, sorted for a stable, readable run order. Mirrors exactly what
 * check-site.ts's checkCdnLinks scans offline — this is the same URL set,
 * minus one exclusion: a bare base URL with no path (the `BASE` constant in
 * the README's JS/Python/Swift samples) is never itself fetched by a real
 * consumer — it's always concatenated with a path first — and jsDelivr
 * genuinely 400s on it standalone (confirmed against the live CDN), so
 * fetching it here would report a permanent, meaningless failure. The
 * offline guard in check-site.ts skips it for the same reason.
 */
export function collectCdnUrls(root: string): string[] {
  const texts: string[] = [];
  const docs = join(root, "docs");

  if (existsSync(docs)) {
    for (const entry of readdirSync(docs)) {
      if (entry.endsWith(".html")) {
        texts.push(readFileSync(join(docs, entry), "utf-8"));
      }
    }
  }

  const readmePath = join(root, "README.md");
  if (existsSync(readmePath)) {
    texts.push(readFileSync(readmePath, "utf-8"));
  }

  const urls = new Set<string>();
  for (const text of texts) {
    for (const ref of extractCdnRefs(text)) {
      if (ref.path === "") continue;
      urls.add(ref.url);
    }
  }

  return [...urls].sort(byCodepoint);
}

export type CdnCheckResult =
  | { url: string; ok: true; status: number }
  | { url: string; ok: false; status?: number; error?: string };

/**
 * Fetches one CDN URL and reports whether it resolved. `fetchImpl` defaults
 * to the real global `fetch` but can be swapped for a fake in tests — the
 * same dependency-injection shape as fetch-roads.ts's fetchOverpass, for the
 * same reason: this is the one function in the script that touches the
 * network, so it's the one that needs to be replaceable to test anything
 * around it without actually calling jsDelivr.
 */
export async function checkCdnUrl(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CdnCheckResult> {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
    return { url, ok: response.status === 200, status: response.status };
  } catch (error) {
    return { url, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function describeFailure(result: CdnCheckResult): string {
  if (result.ok) return "";
  return result.status !== undefined ? `HTTP ${result.status}` : (result.error ?? "unknown error");
}

/**
 * Runs every URL sequentially, one request at a time with a courtesy delay
 * between them — the same "be a polite client" posture fetch-roads.ts takes
 * with Overpass, scaled down for a CDN that's far less fragile than a free
 * Overpass instance but still isn't this project's own infrastructure to
 * hammer. Never retries a failure; a 404 or a timeout is reported once and
 * moved on from, not looped on.
 */
export async function checkAllCdnUrls(
  urls: string[],
  options: { fetchImpl?: typeof fetch; sleepImpl?: (ms: number) => Promise<void> } = {},
): Promise<CdnCheckResult[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const results: CdnCheckResult[] = [];

  for (let i = 0; i < urls.length; i++) {
    results.push(await checkCdnUrl(urls[i], fetchImpl));
    if (i < urls.length - 1) await sleepImpl(REQUEST_DELAY_MS);
  }

  return results;
}

async function main(): Promise<void> {
  const urls = collectCdnUrls(ROOT);
  console.log(`Checking ${urls.length} CDN URL(s) referenced by docs/ and README.md\n`);

  const results = await checkAllCdnUrls(urls);

  for (const result of results) {
    console.log(result.ok ? `  ok    ${result.url}` : `  FAIL  ${result.url} — ${describeFailure(result)}`);
  }

  const failures = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failures.length}/${results.length} resolved.`);

  if (failures.length > 0) {
    console.error(`\n${failures.length} CDN URL(s) did not resolve:`);
    for (const failure of failures) {
      console.error(`  ${failure.url} — ${describeFailure(failure)}`);
    }
    process.exit(1);
  }
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
