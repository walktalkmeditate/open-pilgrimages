import { existsSync, statSync } from "fs";
import { join } from "path";

/**
 * Every URL this project ever points at jsDelivr shares this prefix — the
 * GitHub-backed CDN serving this repo's own published files. Anything after
 * `@` is the version ref; anything after the next `/` is the path within the
 * repo at that ref.
 */
const CDN_URL_PATTERN =
  /https:\/\/cdn\.jsdelivr\.net\/gh\/walktalkmeditate\/open-pilgrimages@([^/\s"'<>)`]+)(\/[^\s"'<>)`]*)?/g;

export interface CdnRef {
  /** The full matched URL, exactly as it appears in the source text. */
  url: string;
  /** The version ref after `@` — e.g. "v1", "v1.6.0", or (a mistake) "main". */
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
 * The CDN only ever serves this repo's published data surface — routes/,
 * schema/, and index.json. Nothing under docs/ (the site itself) belongs on
 * a data CDN, even though the file genuinely exists in the repo: a URL
 * pointing there is always a copy-paste mistake, not a future possibility,
 * so this check doesn't need to know what does or doesn't exist on disk.
 */
export function isPublishedCdnPath(path: string): boolean {
  return path === "index.json" || PUBLISHED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

const RELEASED_VERSION_REF_PATTERN = /^v\d+\.\d+\.\d+$/;

/**
 * `@v1` is the moving major-version tag every CDN consumer is told to pin
 * to; a `@vX.Y.Z` ref names one specific release. Both are refs this project
 * actually produces and moves/creates as part of cutting a release (see
 * .claude/commands/release.md). Anything else — `@main`, `@latest`, a
 * branch name — is a ref this project has never published against and the
 * README explicitly warns against using, since it isn't pinned to a
 * release: it can point at an in-progress commit that 404s on files added
 * since the last release, or change contents without warning.
 */
export function isRecognizedCdnRef(ref: string): boolean {
  return ref === "v1" || RELEASED_VERSION_REF_PATTERN.test(ref);
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
  const local = join(root, path);
  if (!existsSync(local)) return false;
  return path.endsWith("/") ? statSync(local).isDirectory() : statSync(local).isFile();
}
