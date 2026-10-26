/**
 * Adversarial NextAuth Edge Middleware Verification Suite.
 *
 * Compiles and runs the authoritative frontend/src/middleware.ts directly.
 * Tests:
 * 1. Unauthenticated Route Protection (SEC-01) for all protected prefixes & subpaths.
 * 2. Public route pass-through behavior.
 * 3. Authenticated session token pass-through with cryptographically signed NextAuth JWTs.
 * 4. SEC-01 Bypass Elimination: verifies zero-auth bypass is physically impossible in production.
 * 5. Open Redirect Fuzzing & Stress Testing on callbackUrl and legacy from query params.
 * 6. Matcher configuration integrity.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server.js";

const TEST_SECRET = "01234567890123456789012345678901"; // 32-char secret

// Compile and import src/middleware.ts directly
const middlewareTsPath = path.resolve("src/middleware.ts");
const rawTs = fs.readFileSync(middlewareTsPath, "utf8");
const patchedTs = rawTs.replace(/from\s+["']next\/server["']/, 'from "next/server.js"');

const transpiled = ts.transpileModule(patchedTs, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});

const tempCompiledPath = path.resolve("scripts/.middleware.compiled.mjs");
fs.writeFileSync(tempCompiledPath, transpiled.outputText);

const { middleware, config } = await import(pathToFileURL(tempCompiledPath).href);

// Clean up temporary compiled file
fs.unlinkSync(tempCompiledPath);

async function createAuthenticatedCookie(sub = "usr_adversarial_test") {
  const tokenStr = await encode({
    token: { sub, name: "Test User", email: "test@quickai.studio" },
    secret: TEST_SECRET,
  });
  return `next-auth.session-token=${tokenStr}`;
}

// ==============================================================================
// 1. Unauthenticated Protected Route Verification
// ==============================================================================

test("Unauthenticated requests to protected root routes redirect to /signin with callbackUrl", async () => {
  process.env.NODE_ENV = "production";
  process.env.NEXTAUTH_SECRET = TEST_SECRET;

  const protectedRoutes = [
    "/dashboard",
    "/editor",
    "/settings",
    "/billing",
    "/projects",
    "/history",
    "/adk",
  ];

  for (const route of protectedRoutes) {
    const req = new NextRequest(`http://localhost:3000${route}`);
    const res = await middleware(req);

    assert.equal(res.status, 307, `Expected 307 redirect for unauthenticated ${route}`);
    const location = res.headers.get("location");
    const expectedTarget = encodeURIComponent(route);
    assert.equal(
      location,
      `http://localhost:3000/signin?callbackUrl=${expectedTarget}`,
      `Invalid redirect location for ${route}`
    );
  }
});

test("Unauthenticated requests to nested subpaths redirect to /signin with preserved query params", async () => {
  process.env.NODE_ENV = "production";
  process.env.NEXTAUTH_SECRET = TEST_SECRET;

  const testCases = [
    { url: "http://localhost:3000/dashboard/analytics", expectedCallback: "/dashboard/analytics" },
    { url: "http://localhost:3000/editor/proj_123?tab=timeline", expectedCallback: "/editor/proj_123?tab=timeline" },
    { url: "http://localhost:3000/settings/security", expectedCallback: "/settings/security" },
    { url: "http://localhost:3000/billing/invoices?year=2026", expectedCallback: "/billing/invoices?year=2026" },
    { url: "http://localhost:3000/projects/shared/abc", expectedCallback: "/projects/shared/abc" },
  ];

  for (const { url, expectedCallback } of testCases) {
    const req = new NextRequest(url);
    const res = await middleware(req);

    assert.equal(res.status, 307);
    const location = res.headers.get("location");
    assert.equal(
      location,
      `http://localhost:3000/signin?callbackUrl=${encodeURIComponent(expectedCallback)}`
    );
  }
});

// ==============================================================================
// 2. Public Routes Pass-Through
// ==============================================================================

test("Public routes allow unauthenticated pass-through", async () => {
  process.env.NODE_ENV = "production";
  process.env.NEXTAUTH_SECRET = TEST_SECRET;

  const publicRoutes = ["/", "/about", "/pricing", "/privacy", "/terms", "/api/health"];

  for (const route of publicRoutes) {
    const req = new NextRequest(`http://localhost:3000${route}`);
    const res = await middleware(req);

    assert.equal(res.status, 200, `Expected 200 pass-through for public route ${route}`);
    assert.equal(res.headers.get("location"), null);
  }
});

// ==============================================================================
// 3. Authenticated Session Pass-Through
// ==============================================================================

test("Authenticated requests with valid NextAuth cookie pass through to protected routes", async () => {
  process.env.NODE_ENV = "production";
  process.env.NEXTAUTH_SECRET = TEST_SECRET;
  const cookie = await createAuthenticatedCookie("usr_authorized_99");

  const routes = ["/dashboard", "/editor", "/settings", "/billing", "/projects"];

  for (const route of routes) {
    const req = new NextRequest(`http://localhost:3000${route}`, {
      headers: { cookie },
    });
    const res = await middleware(req);

    assert.equal(res.status, 200, `Authenticated user blocked on ${route}`);
    assert.equal(res.headers.get("location"), null);
  }
});

// ==============================================================================
// 4. SEC-01 Bypass Elimination & Environment Isolation
// ==============================================================================

test("SEC-01: Zero-auth bypass is strictly blocked in production regardless of flags", async () => {
  const originalEnv = process.env.NODE_ENV;
  const originalBypass = process.env.LOCAL_FIRST_DEV_NO_AUTH;
  const originalKernel = process.env.NEXT_PUBLIC_STUDIO_PROJECT_KERNEL;

  try {
    process.env.NODE_ENV = "production";
    process.env.NEXTAUTH_SECRET = TEST_SECRET;

    // Attack permutation 1: LOCAL_FIRST_DEV_NO_AUTH=1 in production
    process.env.LOCAL_FIRST_DEV_NO_AUTH = "1";
    let req = new NextRequest("http://localhost:3000/editor");
    let res = await middleware(req);
    assert.equal(res.status, 307, "Production MUST NEVER allow LOCAL_FIRST_DEV_NO_AUTH bypass");
    assert.equal(res.headers.get("location"), "http://localhost:3000/signin?callbackUrl=%2Feditor");

    // Attack permutation 2: NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1 in production
    delete process.env.LOCAL_FIRST_DEV_NO_AUTH;
    process.env.NEXT_PUBLIC_STUDIO_PROJECT_KERNEL = "1";
    req = new NextRequest("http://localhost:3000/dashboard");
    res = await middleware(req);
    assert.equal(res.status, 307, "Production MUST NEVER allow NEXT_PUBLIC_STUDIO_PROJECT_KERNEL bypass");
    assert.equal(res.headers.get("location"), "http://localhost:3000/signin?callbackUrl=%2Fdashboard");

    // Attack permutation 3: Both flags active in production
    process.env.LOCAL_FIRST_DEV_NO_AUTH = "1";
    process.env.NEXT_PUBLIC_STUDIO_PROJECT_KERNEL = "1";
    req = new NextRequest("http://localhost:3000/billing");
    res = await middleware(req);
    assert.equal(res.status, 307, "Production MUST NEVER allow combined flag bypass");
    assert.equal(res.headers.get("location"), "http://localhost:3000/signin?callbackUrl=%2Fbilling");
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalBypass !== undefined) process.env.LOCAL_FIRST_DEV_NO_AUTH = originalBypass;
    else delete process.env.LOCAL_FIRST_DEV_NO_AUTH;
    if (originalKernel !== undefined) process.env.NEXT_PUBLIC_STUDIO_PROJECT_KERNEL = originalKernel;
    else delete process.env.NEXT_PUBLIC_STUDIO_PROJECT_KERNEL;
  }
});

test("Local dev bypass operates only when NODE_ENV !== production AND LOCAL_FIRST_DEV_NO_AUTH === '1'", async () => {
  const originalEnv = process.env.NODE_ENV;
  const originalBypass = process.env.LOCAL_FIRST_DEV_NO_AUTH;

  try {
    process.env.NODE_ENV = "development";
    process.env.LOCAL_FIRST_DEV_NO_AUTH = "1";

    const reqDev = new NextRequest("http://localhost:3000/editor");
    const resDev = await middleware(reqDev);
    assert.equal(resDev.status, 200, "Dev bypass should permit unauthenticated access in development");

    const reqSignin = new NextRequest("http://localhost:3000/signin");
    const resSignin = await middleware(reqSignin);
    assert.equal(resSignin.status, 307);
    assert.equal(resSignin.headers.get("location"), "http://localhost:3000/editor");
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalBypass !== undefined) process.env.LOCAL_FIRST_DEV_NO_AUTH = originalBypass;
    else delete process.env.LOCAL_FIRST_DEV_NO_AUTH;
  }
});

// ==============================================================================
// 5. Open Redirect Fuzzing & Stress Testing on callbackUrl / from
// ==============================================================================

test("Adversarial Open Redirect Fuzzing: external escape attempts always fall back to /dashboard and stay on-origin", async () => {
  process.env.NODE_ENV = "production";
  process.env.NEXTAUTH_SECRET = TEST_SECRET;
  const cookie = await createAuthenticatedCookie();

  // Attack payloads attempting to escape the origin to an external domain or scheme
  const externalEscapePayloads = [
    // 1. External absolute URLs
    "https://evil.com",
    "http://evil.com/phishing",
    "https://attacker.com/dashboard",
    "http://169.254.169.254/latest/meta-data",
    "http://127.0.0.1:8000",
    "http://localhost:3000.evil.com",
    // 2. Protocol-relative / double slash
    "//evil.com",
    "//evil.com/dashboard",
    "///evil.com",
    "////evil.com",
    "//127.0.0.1:8000",
    "//localhost:3000.attacker.com",
    // 3. Backslash evasion
    "/\\evil.com",
    "/\\attacker.com",
    "/\\\\evil.com",
    "\\\\evil.com",
    "\\evil.com",
    "\\attacker.com",
    // 4. Encoded bypass attempts
    "%2f%2fevil.com",
    "/%2f/evil.com",
    "%5c%5cevil.com",
    "/%5cevil.com",
    "/%2e%2e/evil.com",
    // 5. Malicious schemes
    "javascript:alert(document.domain)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    // 6. Control character & CRLF injection
    "/dashboard%0d%0aLocation:https://evil.com",
    "/dashboard%00evil.com",
    // 7. Domain confusion & userinfo
    "/dashboard@evil.com",
    "/editor.attacker.com",
    "/billing#evil.com",
    "http://localhost:3000.attacker.com",
    // 8. Trailing backslash / unwhitelisted prefix
    "/dashboard\\evil.com",
  ];

  for (const payload of externalEscapePayloads) {
    for (const param of ["callbackUrl", "from"]) {
      const targetUrl = `http://localhost:3000/signin?${param}=${encodeURIComponent(payload)}`;
      const req = new NextRequest(targetUrl, {
        headers: { cookie },
      });
      const res = await middleware(req);

      assert.equal(res.status, 307, `Expected 307 for payload: ${payload} via ${param}`);
      const location = res.headers.get("location");
      
      // Critical Security Assertion 1: Must fall back to safe /dashboard
      assert.equal(
        location,
        "http://localhost:3000/dashboard",
        `Security Breach: Open redirect payload '${payload}' was not neutralized to /dashboard, got: ${location}`
      );

      // Critical Security Assertion 2: Origin MUST NEVER change
      const redirectUrl = new URL(location);
      assert.equal(
        redirectUrl.origin,
        "http://localhost:3000",
        `Critical Vulnerability: Origin escaped to ${redirectUrl.origin}`
      );
    }
  }
});

test("Legitimate relative callbackUrl targets are honored for authenticated users", async () => {
  process.env.NODE_ENV = "production";
  process.env.NEXTAUTH_SECRET = TEST_SECRET;
  const cookie = await createAuthenticatedCookie();

  const validTargets = [
    { target: "/editor", expected: "http://localhost:3000/editor" },
    { target: "/settings", expected: "http://localhost:3000/settings" },
    { target: "/billing", expected: "http://localhost:3000/billing" },
    { target: "/projects", expected: "http://localhost:3000/projects" },
    { target: "/history", expected: "http://localhost:3000/history" },
    { target: "/adk", expected: "http://localhost:3000/adk" },
    { target: "/dashboard", expected: "http://localhost:3000/dashboard" },
    { target: "/editor/project_456", expected: "http://localhost:3000/editor/project_456" },
  ];

  for (const { target, expected } of validTargets) {
    const req = new NextRequest(`http://localhost:3000/signin?callbackUrl=${encodeURIComponent(target)}`, {
      headers: { cookie },
    });
    const res = await middleware(req);

    assert.equal(res.status, 307);
    assert.equal(res.headers.get("location"), expected);
  }
});

// ==============================================================================
// 6. Matcher Config Verification
// ==============================================================================

test("Matcher config covers all protected prefixes and signin route", () => {
  const matcher = config?.matcher || [];
  const requiredRoutes = [
    "/dashboard/:path*",
    "/editor/:path*",
    "/settings/:path*",
    "/history/:path*",
    "/adk/:path*",
    "/adk",
    "/projects/:path*",
    "/projects",
    "/billing/:path*",
    "/billing",
    "/signin",
  ];

  for (const route of requiredRoutes) {
    assert.ok(
      matcher.includes(route),
      `Missing route '${route}' from middleware config.matcher`
    );
  }
});
