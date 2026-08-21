import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { checkAllCdnUrls, checkCdnUrl, collectCdnUrls } from "./check-cdn.js";

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "check-cdn-test-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  return root;
}

// --- collectCdnUrls ---

test("collectCdnUrls finds a URL from a docs/*.html page and from README.md, deduplicated and sorted", () => {
  const root = fixtureRoot();
  try {
    writeFileSync(
      join(root, "docs", "camino-frances.html"),
      '<a href="https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-frances/route.gpx">gpx</a>' +
        '<a href="https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json">index</a>',
    );
    writeFileSync(
      join(root, "README.md"),
      // same index.json URL again — must not appear twice in the result
      "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json\n",
    );

    const urls = collectCdnUrls(root);

    assert.deepEqual(urls, [
      "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json",
      "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/routes/camino-frances/route.gpx",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("collectCdnUrls excludes a bare base URL with no path — jsDelivr 400s on it standalone, and no real consumer ever fetches it that way", () => {
  const root = fixtureRoot();
  try {
    writeFileSync(
      join(root, "README.md"),
      "const BASE = 'https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1';\n" +
        "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json\n",
    );

    assert.deepEqual(collectCdnUrls(root), [
      "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("collectCdnUrls returns an empty list when nothing references the CDN", () => {
  const root = fixtureRoot();
  try {
    writeFileSync(join(root, "docs", "camino-frances.html"), "<html><body>no CDN links here</body></html>");
    assert.deepEqual(collectCdnUrls(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- checkCdnUrl ---

function fakeFetch(status: number): typeof fetch {
  return (async () =>
    new Response(null, { status })) as unknown as typeof fetch;
}

function rejectingFetch(message: string): typeof fetch {
  return (async () => {
    throw new Error(message);
  }) as unknown as typeof fetch;
}

test("checkCdnUrl reports ok for a 200 response", async () => {
  const result = await checkCdnUrl("https://example.invalid/ok", fakeFetch(200));
  assert.deepEqual(result, { url: "https://example.invalid/ok", ok: true, status: 200 });
});

test("checkCdnUrl reports failure, with status, for a 404 response", async () => {
  const result = await checkCdnUrl("https://example.invalid/missing", fakeFetch(404));
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
});

test("checkCdnUrl reports failure, with an error message, when the fetch itself throws (e.g. a timeout)", async () => {
  const result = await checkCdnUrl("https://example.invalid/slow", rejectingFetch("The operation was aborted"));
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.error?.includes("aborted"));
});

test("checkCdnUrl passes a client-side timeout signal on every request", async () => {
  let capturedInit: RequestInit | undefined;
  const capturing: typeof fetch = (async (
    _url: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    capturedInit = init;
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;

  await checkCdnUrl("https://example.invalid/ok", capturing);

  assert.ok(capturedInit?.signal instanceof AbortSignal);
});

// --- checkAllCdnUrls ---

test("checkAllCdnUrls checks every URL sequentially and sleeps between requests, not after the last one", async () => {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const fetchImpl: typeof fetch = (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  const sleepImpl = async (ms: number): Promise<void> => {
    sleeps.push(ms);
  };

  const urls = ["https://example.invalid/a", "https://example.invalid/b", "https://example.invalid/c"];
  const results = await checkAllCdnUrls(urls, { fetchImpl, sleepImpl });

  assert.deepEqual(calls, urls);
  assert.equal(sleeps.length, 2); // one fewer than the number of URLs
  assert.ok(results.every((r) => r.ok));
});

test("checkAllCdnUrls does not retry a failed URL — one fetch call per URL, failure and all", async () => {
  let callCount = 0;
  const fetchImpl: typeof fetch = (async () => {
    callCount++;
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;

  const results = await checkAllCdnUrls(["https://example.invalid/missing"], {
    fetchImpl,
    sleepImpl: async () => {},
  });

  assert.equal(callCount, 1);
  assert.equal(results[0].ok, false);
});
