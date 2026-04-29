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
    url.pathname = fromParam && fromParam.startsWith("/") ? fromParam : "/dashboard";
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
