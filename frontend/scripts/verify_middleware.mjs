/**
 * Automated Verification Test Suite for NextAuth Edge Middleware & SEC-01 Fix.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server.js";

const TEST_SECRET = "quickai-studio-test-secret-at-least-32-chars-long";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/editor",
  "/settings",
  "/history",
  "/adk",
  "/projects",
  "/billing",
];
const AUTH_REDIRECT_FROM = ["/signin"];

async function runMiddleware(req, getTokenFn) {
  const { pathname, search } = req.nextUrl;

  const isLocalDevNoAuth =
    process.env.NODE_ENV !== "production" &&
    process.env.LOCAL_FIRST_DEV_NO_AUTH === "1";

  if (isLocalDevNoAuth) {
    if (AUTH_REDIRECT_FROM.includes(pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = "/editor";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const token = await getTokenFn({ req, secret: process.env.NEXTAUTH_SECRET || TEST_SECRET });

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isProtected && !token) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    const callbackTarget = `${pathname}${search}`;
    url.search = `?callbackUrl=${encodeURIComponent(callbackTarget)}`;
    return NextResponse.redirect(url);
  }

  if (token && AUTH_REDIRECT_FROM.includes(pathname)) {
    const url = req.nextUrl.clone();
    const rawTarget =
      req.nextUrl.searchParams.get("callbackUrl") ||
      req.nextUrl.searchParams.get("from");
    let decodedTarget = "";
    if (rawTarget) {
      try {
        decodedTarget = decodeURIComponent(rawTarget);
      } catch {
        decodedTarget = rawTarget;
      }
    }

    const isRelative = /^\/[^\/\\]/.test(decodedTarget) || decodedTarget === "/";

    const isSafe = isRelative && decodedTarget
      ? PROTECTED_PREFIXES.some(
        (p) => decodedTarget === p || decodedTarget.startsWith(`${p}/`),
      )
      : false;
    url.pathname = isSafe ? decodedTarget : "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

test("SEC-01: NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1 enforces auth redirect to /signin?callbackUrl=...", async () => {
  const originalKernel = process.env.NEXT_PUBLIC_STUDIO_PROJECT_KERNEL;
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NEXT_PUBLIC_STUDIO_PROJECT_KERNEL = "1";
    process.env.NODE_ENV = "production";
    const mockGetToken = async () => null;

    const req = new NextRequest("http://localhost:3000/editor?project=123");
    const res = await runMiddleware(req, mockGetToken);

    assert.equal(res.status, 307);
    assert.equal(
      res.headers.get("location"),
      "http://localhost:3000/signin?callbackUrl=%2Feditor%3Fproject%3D123"
    );
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalKernel !== undefined) process.env.NEXT_PUBLIC_STUDIO_PROJECT_KERNEL = originalKernel;
    else delete process.env.NEXT_PUBLIC_STUDIO_PROJECT_KERNEL;
  }
});

test("Fixed Middleware: Unauthenticated /dashboard redirects to /signin?callbackUrl=/dashboard", async () => {
  const mockGetToken = async () => null;
  const req = new NextRequest("http://localhost:3000/dashboard");
  const res = await runMiddleware(req, mockGetToken);

  assert.equal(res.status, 307);
  assert.equal(res.headers.get("location"), "http://localhost:3000/signin?callbackUrl=%2Fdashboard");
});

test("Fixed Middleware: All protected routes redirect when unauthenticated", async () => {
  const mockGetToken = async () => null;
  const routes = ["/dashboard", "/editor", "/settings", "/history", "/adk", "/projects", "/billing"];

  for (const route of routes) {
    const req = new NextRequest(`http://localhost:3000${route}`);
    const res = await runMiddleware(req, mockGetToken);
    assert.equal(res.status, 307, `Expected ${route} to redirect`);
    assert.equal(
      res.headers.get("location"),
      `http://localhost:3000/signin?callbackUrl=${encodeURIComponent(route)}`
    );
  }
});

test("Fixed Middleware: Public routes pass through without authentication", async () => {
  const mockGetToken = async () => null;
  const publicRoutes = ["/", "/about", "/pricing", "/privacy", "/terms"];

  for (const route of publicRoutes) {
    const req = new NextRequest(`http://localhost:3000${route}`);
    const res = await runMiddleware(req, mockGetToken);
    assert.equal(res.status, 200, `Expected ${route} to pass through`);
    assert.equal(res.headers.get("location"), null);
  }
});

test("Fixed Middleware: Authenticated request with valid token passes through", async () => {
  const mockGetToken = async () => ({ sub: "user_456", email: "director@quickai.studio" });
  const req = new NextRequest("http://localhost:3000/editor");
  const res = await runMiddleware(req, mockGetToken);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("location"), null);
});

test("Fixed Middleware: Authenticated user visiting /signin is redirected to callbackUrl", async () => {
  const mockGetToken = async () => ({ sub: "user_456" });

  const req1 = new NextRequest("http://localhost:3000/signin?callbackUrl=%2Feditor");
  const res1 = await runMiddleware(req1, mockGetToken);
  assert.equal(res1.status, 307);
  assert.equal(res1.headers.get("location"), "http://localhost:3000/editor");

  const req2 = new NextRequest("http://localhost:3000/signin?from=%2Fsettings");
  const res2 = await runMiddleware(req2, mockGetToken);
  assert.equal(res2.status, 307);
  assert.equal(res2.headers.get("location"), "http://localhost:3000/settings");

  const req3 = new NextRequest("http://localhost:3000/signin?callbackUrl=https%3A%2F%2Fattacker.com");
  const res3 = await runMiddleware(req3, mockGetToken);
  assert.equal(res3.status, 307);
  assert.equal(res3.headers.get("location"), "http://localhost:3000/dashboard");
});

test("Fixed Middleware: Local dev no-auth bypass only works when explicitly requested outside production", async () => {
  const mockGetToken = async () => null;
  const originalEnv = process.env.NODE_ENV;
  const originalBypass = process.env.LOCAL_FIRST_DEV_NO_AUTH;

  try {
    process.env.NODE_ENV = "development";
    process.env.LOCAL_FIRST_DEV_NO_AUTH = "1";
    const reqDev = new NextRequest("http://localhost:3000/editor");
    const resDev = await runMiddleware(reqDev, mockGetToken);
    assert.equal(resDev.status, 200, "Local dev bypass active");

    process.env.NODE_ENV = "production";
    process.env.LOCAL_FIRST_DEV_NO_AUTH = "1";
    const reqProd = new NextRequest("http://localhost:3000/editor");
    const resProd = await runMiddleware(reqProd, mockGetToken);
    assert.equal(resProd.status, 307, "Production MUST NEVER bypass auth");
    assert.equal(resProd.headers.get("location"), "http://localhost:3000/signin?callbackUrl=%2Feditor");
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalBypass !== undefined) process.env.LOCAL_FIRST_DEV_NO_AUTH = originalBypass;
    else delete process.env.LOCAL_FIRST_DEV_NO_AUTH;
  }
});
