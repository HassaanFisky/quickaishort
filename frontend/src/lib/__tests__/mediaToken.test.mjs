/**
 * F-1 frontend media-token regression tests.
 *
 * Run: node --test frontend/src/lib/__tests__/mediaToken.test.mjs
 *
 * The repository has no frontend test runner (no vitest/jest in
 * frontend/package.json), but it already uses Node's built-in runner for
 * `graft:studio:test` in the root package.json. These follow that precedent.
 *
 * lib/api.ts cannot be imported directly here: it is TypeScript and pulls in
 * axios/next-auth at module scope. Instead this re-implements the exact
 * caching/URL-construction logic under test and pins the behavioural
 * contract — cache reuse, skew-aware expiry, single-flight de-duplication,
 * per-URL binding, and the query-parameter shape the backend verifies.
 *
 * Each test states the pre-integration behaviour it would have caught.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

const MEDIA_TOKEN_SKEW_SECONDS = 120;
const API_URL = "https://api.example.test";

let mintCalls = [];
let cache;
let inflight;
let now;
let nextToken;

function nowSeconds() {
  return Math.floor(now / 1000);
}

function isFresh(entry) {
  return entry.expires - MEDIA_TOKEN_SKEW_SECONDS > nowSeconds();
}

// Mirrors getMediaToken() in lib/api.ts.
async function getMediaToken(sourceUrl) {
  const cached = cache.get(sourceUrl);
  if (cached && isFresh(cached)) return cached;

  const existing = inflight.get(sourceUrl);
  if (existing) return existing;

  const request = (async () => {
    try {
      mintCalls.push(sourceUrl);
      const data = await nextToken(sourceUrl);
      if (!data?.token || !data?.expires) return null;
      const entry = {
        token: data.token,
        expires: data.expires,
        userId: data.user_id,
      };
      cache.set(sourceUrl, entry);
      return entry;
    } catch {
      return null;
    } finally {
      inflight.delete(sourceUrl);
    }
  })();

  inflight.set(sourceUrl, request);
  return request;
}

// Mirrors withMediaToken() in lib/api.ts.
function withMediaToken(base, entry) {
  if (!entry) return base;
  const sep = base.includes("?") ? "&" : "?";
  return (
    `${base}${sep}user_id=${encodeURIComponent(entry.userId)}` +
    `&token=${encodeURIComponent(entry.token)}` +
    `&expires=${entry.expires}`
  );
}

const getProxyVideoUrl = (url) =>
  `${API_URL}/api/proxy-video?url=${encodeURIComponent(url)}`;
const getAudioUrl = (url) => `${API_URL}/api/audio?url=${encodeURIComponent(url)}`;

const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const YT2 = "https://www.youtube.com/watch?v=aaaaaaaaaaa";

beforeEach(() => {
  cache = new Map();
  inflight = new Map();
  mintCalls = [];
  now = 1_700_000_000_000;
  nextToken = async () => ({
    token: "tok-1",
    expires: nowSeconds() + 3600,
    user_id: "user-1",
  });
});

describe("URL construction — the shape the backend verifies", () => {
  test("appends user_id, token and expires as query params", async () => {
    const entry = await getMediaToken(YT);
    const url = new URL(withMediaToken(getProxyVideoUrl(YT), entry));

    assert.equal(url.searchParams.get("user_id"), "user-1");
    assert.equal(url.searchParams.get("token"), "tok-1");
    assert.equal(url.searchParams.get("expires"), String(entry.expires));
  });

  test("preserves the inner url param that inferVideoId() unwraps", async () => {
    // useServerExport.ts:436 reads searchParams.get("url") to recover the
    // YouTube id. Appending token params must not disturb it.
    const entry = await getMediaToken(YT);
    const url = new URL(withMediaToken(getProxyVideoUrl(YT), entry));
    assert.equal(url.searchParams.get("url"), YT);
  });

  test("uses & (not ?) because the base already has a query string", async () => {
    const entry = await getMediaToken(YT);
    const url = withMediaToken(getAudioUrl(YT), entry);
    assert.equal(url.split("?").length, 2, "must contain exactly one '?'");
    assert.ok(url.includes("&user_id="));
  });

  test("returns the untokenised URL when no token is available", () => {
    // Pre-integration behaviour, and the unauthenticated fallback path.
    const base = getProxyVideoUrl(YT);
    assert.equal(withMediaToken(base, null), base);
  });

  test("url-encodes token values", () => {
    const url = withMediaToken(getAudioUrl(YT), {
      token: "a+b/c=",
      expires: 123,
      userId: "user with space",
    });
    assert.ok(url.includes("user_id=user%20with%20space"));
    assert.ok(url.includes("token=a%2Bb%2Fc%3D"));
  });
});

describe("caching and expiry", () => {
  test("reuses a still-valid token instead of re-minting", async () => {
    await getMediaToken(YT);
    await getMediaToken(YT);
    await getMediaToken(YT);
    assert.equal(mintCalls.length, 1);
  });

  test("re-mints once the token has expired", async () => {
    const first = await getMediaToken(YT);
    now += 3601 * 1000;
    nextToken = async () => ({
      token: "tok-2",
      expires: nowSeconds() + 3600,
      user_id: "user-1",
    });

    const second = await getMediaToken(YT);
    assert.equal(mintCalls.length, 2);
    assert.notEqual(second.token, first.token);
    assert.equal(second.token, "tok-2");
  });

  test("refreshes inside the skew window, before real expiry", async () => {
    // Guards the race where a token lapses mid-request.
    await getMediaToken(YT);
    now += (3600 - MEDIA_TOKEN_SKEW_SECONDS + 1) * 1000;
    await getMediaToken(YT);
    assert.equal(mintCalls.length, 2, "must refresh within the skew window");
  });

  test("tokens are bound per source URL and never shared", async () => {
    nextToken = async (u) => ({
      token: u === YT ? "tok-A" : "tok-B",
      expires: nowSeconds() + 3600,
      user_id: "user-1",
    });
    const a = await getMediaToken(YT);
    const b = await getMediaToken(YT2);

    assert.notEqual(a.token, b.token);
    assert.equal(mintCalls.length, 2);
  });
});

describe("concurrency — no token storms", () => {
  test("concurrent requests for the same URL mint exactly once", async () => {
    // VideoCanvas and useMediaPipeline start together. Without single-flight
    // de-duplication this fires one mint per consumer.
    let resolveMint;
    nextToken = () =>
      new Promise((res) => {
        resolveMint = () =>
          res({ token: "tok-1", expires: nowSeconds() + 3600, user_id: "user-1" });
      });

    const all = Promise.all([
      getMediaToken(YT),
      getMediaToken(YT),
      getMediaToken(YT),
      getMediaToken(YT),
    ]);
    resolveMint();
    const results = await all;

    assert.equal(mintCalls.length, 1, "expected exactly one mint request");
    for (const r of results) assert.equal(r.token, "tok-1");
  });

  test("concurrent requests for different URLs mint once each", async () => {
    nextToken = async (u) => ({
      token: `tok-${u}`,
      expires: nowSeconds() + 3600,
      user_id: "user-1",
    });
    await Promise.all([getMediaToken(YT), getMediaToken(YT2), getMediaToken(YT)]);
    assert.equal(mintCalls.length, 2);
  });

  test("a failed mint clears in-flight state so the next call retries", async () => {
    nextToken = async () => {
      throw new Error("401");
    };
    assert.equal(await getMediaToken(YT), null);
    assert.equal(inflight.size, 0, "in-flight entry must be released");

    nextToken = async () => ({
      token: "tok-ok",
      expires: nowSeconds() + 3600,
      user_id: "user-1",
    });
    const retry = await getMediaToken(YT);
    assert.equal(retry.token, "tok-ok");
  });

  test("a failed mint is not cached", async () => {
    nextToken = async () => {
      throw new Error("503");
    };
    await getMediaToken(YT);
    assert.equal(cache.size, 0);
  });
});

describe("unauthenticated behaviour", () => {
  test("null token yields the plain URL so current playback still works", async () => {
    // MEDIA_PROXY_AUTH_REQUIRED is false — the backend still serves these.
    nextToken = async () => null;
    const entry = await getMediaToken(YT);
    assert.equal(entry, null);
    assert.equal(withMediaToken(getProxyVideoUrl(YT), entry), getProxyVideoUrl(YT));
  });

  test("a malformed mint response is rejected rather than half-applied", async () => {
    nextToken = async () => ({ token: "", expires: 0, user_id: "u" });
    assert.equal(await getMediaToken(YT), null);
  });
});
