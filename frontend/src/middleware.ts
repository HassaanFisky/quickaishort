import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PROTECTED_PREFIXES = ["/dashboard", "/editor", "/settings", "/history"];
const AUTH_REDIRECT_FROM = ["/signin"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isProtected && !token) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.search = `?from=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (token && AUTH_REDIRECT_FROM.includes(pathname)) {
    const url = req.nextUrl.clone();
    const fromParam = req.nextUrl.searchParams.get("from");
    let decodedFrom = "";
    if (fromParam) {
      try {
        decodedFrom = decodeURIComponent(fromParam);
      } catch {
        decodedFrom = fromParam;
      }
    }
    
    // Ensure the path is strictly relative (starts with single '/') and prevents backslash/slash protocol bypasses
    const isRelative = /^\/[^\/\\]/.test(decodedFrom) || decodedFrom === "/";

    // Validate the redirect target against the known protected prefixes to prevent open-redirect
    const isSafe = isRelative && decodedFrom
      ? PROTECTED_PREFIXES.some(
          (p) => decodedFrom === p || decodedFrom.startsWith(`${p}/`),
        )
      : false;
    url.pathname = isSafe ? decodedFrom : "/dashboard";
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
    "/signin",
  ],
};
