import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  CLIENT_TIMEOUT_MS,
  REQUEST_DELAY_MS,
  checkAllCdnUrls,
  checkCdnUrl,
  collectCdnUrls,
} from "./check-cdn.js";

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

test("collectCdnUrls finds a URL from a docs/*.js file, not only docs/*.html — the class of file cdn-preview.js belongs to", () => {
  const root = fixtureRoot();
  try {
    writeFileSync(
      join(root, "docs", "cdn-preview.js"),
      "var INDEX_URL = 'https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json';",
    );

    assert.deepEqual(collectCdnUrls(root), [
      "https://cdn.jsdelivr.net/gh/walktalkmeditate/open-pilgrimages@v1/index.json",
    ]);
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

test("checkCdnUrl uses HEAD, not GET — the 45 CDN URLs this project checks total 20.4 MB, and HEAD never downloads a body to drain or cancel", async () => {
  let capturedMethod: string | undefined;
  const capturing: typeof fetch = (async (
    _url: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    capturedMethod = init?.method;
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;

  await checkCdnUrl("https://example.invalid/ok", capturing);

  assert.equal(capturedMethod, "HEAD");
});

test("checkCdnUrl calls AbortSignal.timeout with the real client timeout constant, and passes its actual signal to fetch — not just some AbortSignal", async (t) => {
  // #given a spy on the actual AbortSignal.timeout factory, so this test fails if the client-side
  // timeout is ever replaced with a bare `new AbortController().signal` that would never fire
  const timeoutSpy = t.mock.method(AbortSignal, "timeout");
  let capturedSignal: AbortSignal | undefined;
  const capturing: typeof fetch = (async (
    _url: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    capturedSignal = init?.signal ?? undefined;
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;

  // #when
  await checkCdnUrl("https://example.invalid/ok", capturing);

  // #then AbortSignal.timeout was called exactly once, with this module's own CLIENT_TIMEOUT_MS,
  // and the signal fetch actually received is the one that call returned
  assert.equal(timeoutSpy.mock.calls.length, 1);
  assert.deepEqual(timeoutSpy.mock.calls[0].arguments, [CLIENT_TIMEOUT_MS]);
  assert.equal(capturedSignal, timeoutSpy.mock.calls[0].result);
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
  // one fewer than the number of URLs, and each one the real delay — not just any two numbers,
  // which is all `sleeps.length === 2` alone would prove (the delay constant could be 0)
  assert.deepEqual(sleeps, [REQUEST_DELAY_MS, REQUEST_DELAY_MS]);
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
