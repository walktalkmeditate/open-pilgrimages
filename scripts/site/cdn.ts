import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..", "..");
const PACKAGE_JSON_PATH = join(ROOT, "package.json");

/**
 * The one place this repo's jsDelivr host+path is spelled out. check-site.ts
 * derives its JSDELIVR_BASE from CDN_REPO_BASE below rather than hardcoding
 * its own copy — two independently-edited copies of this string is exactly
 * how an org rename (or any edit to one without the other) used to make
 * CDN_URL_PATTERN match nothing, silently, with neither scanner able to
 * tell zero matches from a clean pass. See checkCdnLinks' and
 * collectCdnUrls' zero-result floor checks for the other half of that fix.
 */
const CDN_HOST_AND_REPO_PATH = "cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages";
export const CDN_REPO_BASE = "https://" + CDN_HOST_AND_REPO_PATH;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every URL this project ever points at jsDelivr shares this prefix — the
 * GitHub-backed CDN serving this repo's own published files. Anything after
 * `@` is the version ref; anything after the next `/` is the path within the
 * repo at that ref. The protocol is optional and `http:` is accepted
 * alongside `https:` — a stray `http://` link or a protocol-relative
 * `//cdn.jsdelivr...` copy-paste is still a link to this repo's CDN, not
 * something to skip silently.
 */
const CDN_URL_PATTERN = new RegExp(
  "(?:https?:)?//" + escapeRegExp(CDN_HOST_AND_REPO_PATH) + "@([^/\\s\"'<>)`]+)(/[^\\s\"'<>)`]*)?",
  "g",
);

export interface CdnRef {
  /** The full matched URL, exactly as it appears in the source text. */
  url: string;
  /**
   * The version ref after `@` — e.g. `"main"` (the catalog ref, refreshed on
   * jsDelivr's own ~12 h cycle), `"v1.6.0"` (a pinned release, what package
   * files resolve against), or `"v1"` (the frozen moving-tag alias — no
   * longer advanced by the release procedure, still recognized because
   * README and schema `$id`s carry it; see isRecognizedCdnRef below).
   */
  ref: string;
  /**
   * The repo-relative path after the ref, with the leading slash stripped.
   * Empty string for a bare base URL with no path (e.g. the `BASE` constant
   * in the README's code samples) — there's nothing to check for those
   * beyond the ref itself. A trailing slash is preserved, since it's the
   * only signal that a URL names a directory (see the coastal variant's
   * README entry) rather than a file.
   */
  path: string;
}

/**
 * Pulls every jsDelivr URL for this repo out of a page of HTML or Markdown.
 * Pure text scanning — no knowledge of what's actually on disk or in git —
 * so it works identically whether called from the offline check-site guard
 * or the networked check-cdn script.
 */
export function extractCdnRefs(text: string): CdnRef[] {
  const refs: CdnRef[] = [];

  for (const match of text.matchAll(CDN_URL_PATTERN)) {
    const [url, ref, rawPath] = match;
    refs.push({ url, ref, path: rawPath ? rawPath.slice(1) : "" });
  }

  return refs;
}

const PUBLISHED_PATH_PREFIXES = ["routes/", "schema/"];

/**
 * A line-wrapped URL (the source of the original v1.5.0 GPX regression's
 * cousin bug) extracts as just its top-level prefix — "routes/" or
 * "schema/" — since everything after the line break is lost. That's a real
 * directory, so a prefix-only check would pass it, and jsDelivr genuinely
 * serves a directory listing for it (200) — a link that resolves to
 * "browse everything" is not the file a real consumer wanted. Rejecting the
 * bare prefixes themselves (nothing deeper), while still accepting anything
 * one level in, is enough to catch that shape without rejecting real
 * directory links like the coastal variant's trailing-slash README entry.
 */
function isBareTopLevelPrefix(path: string): boolean {
  return PUBLISHED_PATH_PREFIXES.includes(path);
}

/**
 * A `..` path segment would let a CDN link claim a path outside this repo's
 * published surface while still starting with an allowed prefix (e.g.
 * `routes/../docs/index.html`), and would let cdnPathExistsOnDisk stat
 * outside the repo root entirely. Checked as a path segment, not a raw
 * substring — a real filename that merely contains ".." (e.g. "foo..bar")
 * is not a traversal attempt and shouldn't be rejected as one.
 */
function hasTraversalSegment(path: string): boolean {
  return path.split("/").includes("..");
}

/**
 * The CDN only ever serves this repo's published data surface — routes/,
 * schema/, and index.json. Nothing under docs/ (the site itself) belongs on
 * a data CDN, even though the file genuinely exists in the repo: a URL
 * pointing there is always a copy-paste mistake, not a future possibility,
 * so this check doesn't need to know what does or doesn't exist on disk.
 */
export function isPublishedCdnPath(path: string): boolean {
  if (hasTraversalSegment(path) || isBareTopLevelPrefix(path)) return false;
  return path === "index.json" || PUBLISHED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

const RELEASED_VERSION_REF_PATTERN = /^v\d+\.\d+\.\d+$/;

let cachedCurrentMajorVersion: string | undefined;

/**
 * The major version out of package.json's own `"version"` — "1" for
 * "1.6.0". This, not a hardcoded "v1", is what `isRecognizedCdnRef` below
 * uses to keep tolerating `@v{major}` links: that alias is only for legacy
 * README/schema `$id` references, and the release procedure no longer moves
 * it (see .claude/commands/release.md's Phase 8, "the v1 alias is not
 * maintained"), but a hardcoded "v1" here would still start rejecting every
 * such legacy `@v2` reference the instant this project ships its first major
 * bump — the same "guard reports clean while broken" shape as the rest of
 * this file's fixes, just triggered by a version bump instead of an org
 * rename. Cached after the first read since package.json doesn't change
 * within a single process run.
 */
function currentMajorVersion(): string {
  if (cachedCurrentMajorVersion !== undefined) return cachedCurrentMajorVersion;

  let major = "1"; // falls back to today's only shipped major if package.json can't be read/parsed
  try {
    const pkg: unknown = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf-8"));
    const version = (pkg as { version?: unknown } | null)?.version;
    if (typeof version === "string" && /^\d+\./.test(version)) {
      major = version.split(".")[0];
    }
  } catch {
    // fall through to the "1" fallback above
  }

  cachedCurrentMajorVersion = major;
  return major;
}

/**
 * The legacy major-version alias still tolerated in README/schema `$id`
 * links — "v1" today, "v2" the release after this project's first major
 * bump. Not a ref consumers are told to pin to: the catalog is read from
 * `@main` and packages are pinned at a released `@vX.Y.Z` tag. check-site.ts
 * builds example legacy-link text from this rather than a second hardcoded
 * "@v1", so that text can't go stale the way isRecognizedCdnRef itself used
 * to.
 */
export function currentCdnMovingRef(): string {
  return `v${currentMajorVersion()}`;
}

/**
 * Three refs this project actually publishes against:
 *
 * - `@main` — the catalog ref. jsDelivr caches a *tag* URL permanently, so a
 *   force-moved `v1` keeps serving whatever it first resolved (measured: `@v1`
 *   still returns the March 2026 index, three routes, while the tag itself
 *   points at the August commit). A branch ref refreshes on jsDelivr's own
 *   ~12 h cycle, so `@main/index.json` is the only URL that reliably names the
 *   current release. Only `index.json` is fetched this way; everything a
 *   consumer downloads afterwards is pinned to the exact tag it named.
 * - `@vX.Y.Z` — one specific release, and what every package file is pinned to.
 * - `@v{currentMajorVersion()}` — the historical moving major tag. Still
 *   recognised because README and schema `$id`s carry it, but the release
 *   procedure no longer moves it: see .claude/commands/release.md.
 *
 * Anything else — `@latest`, another branch name — is a ref this project has
 * never published against.
 *
 * `currentMajor` defaults to the real package.json-derived value but can be
 * overridden — the same DI shape as fetch-roads.ts's fetchImpl/sleepImpl —
 * so a test can simulate "the next major version bump" without editing
 * package.json.
 */
export function isRecognizedCdnRef(ref: string, currentMajor: string = currentMajorVersion()): boolean {
  return ref === "main" || ref === `v${currentMajor}` || RELEASED_VERSION_REF_PATTERN.test(ref);
}

/**
 * Whether a CDN ref's path exists in the working tree right now. This is
 * deliberately blind to git history or tags — it only tells you whether the
 * *next* release would serve this path, not whether the currently-published
 * `@v1` does. That gap (a path added in this PR, not yet released) is the
 * one this check can never close; see check-cdn.ts for the networked check
 * that closes it instead.
 */
export function cdnPathExistsOnDisk(root: string, path: string): boolean {
  if (hasTraversalSegment(path)) return false;
  const local = join(root, path);
  if (!existsSync(local)) return false;
  return path.endsWith("/") ? statSync(local).isDirectory() : statSync(local).isFile();
}
