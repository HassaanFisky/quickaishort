import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth/options";
import { mintBackendToken } from "@/lib/auth/mintBackendToken";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * POST /api/shorts/create
 * Proxies the request to the FastAPI backend (Cloud Run).
 * Forwards a minted HS256 backendToken — never the raw NextAuth JWE cookie.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const userId = String(token?.id ?? token?.sub ?? session.user.id ?? "");
  const backendToken =
    session.backendToken ??
    (await mintBackendToken({
      id: userId,
      email: (token?.email as string | undefined) ?? session.user.email,
      isPro: Boolean(token?.isPro ?? session.user.isPro),
    }));

  if (!backendToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${backendToken}`,
    };
    if (userId) headers["X-User-Id"] = userId;

    const xff =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "";
    if (xff) headers["X-Forwarded-For"] = xff;

    const upstream = await fetch(`${BACKEND_URL}/api/process-video`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (error) {
    console.error("[/api/shorts/create] upstream error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to reach processing backend." },
      { status: 502 },
    );
  }
}
