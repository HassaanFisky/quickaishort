import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

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

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Local-first no-auth bypass is strictly limited to non-production environments
  // when explicitly requested via LOCAL_FIRST_DEV_NO_AUTH.
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

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

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

    // Ensure the path is strictly relative (starts with single '/') and prevents backslash/slash protocol bypasses
    const isRelative = /^\/[^\/\\]/.test(decodedTarget) || decodedTarget === "/";

    // Validate the redirect target against the known protected prefixes to prevent open-redirect
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

export const config = {
  matcher: [
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
  ],
};
