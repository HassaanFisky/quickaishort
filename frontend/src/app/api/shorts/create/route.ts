import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth/options";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * POST /api/shorts/create
 * Proxies the request to the FastAPI backend (Cloud Run).
 * Forwards the NextAuth session token so FastAPI auth middleware can verify it.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Extract the raw NextAuth JWT from the cookie to forward to FastAPI
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const rawCookie =
    req.cookies.get("__Secure-next-auth.session-token")?.value ||
    req.cookies.get("next-auth.session-token")?.value ||
    "";

  try {
    const body = await req.json();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (rawCookie) headers["Authorization"] = `Bearer ${rawCookie}`;
    if (token?.sub) headers["X-User-Id"] = token.sub;

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
