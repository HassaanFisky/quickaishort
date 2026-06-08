/**
 * POST /api/ai/editor
 *
 * Thin proxy to FastAPI POST /api/ai-edit.
 * Replaces the former direct-Gemini implementation.
 *
 * Upstream contract: fastapi/routers/ai_editor_router.py
 * Credits, sanitisation, mock mode all enforced server-side.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth/options";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Extract raw NextAuth JWT from cookie — same pattern as /api/shorts/create
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const rawCookie =
    req.cookies.get("__Secure-next-auth.session-token")?.value ||
    req.cookies.get("next-auth.session-token")?.value ||
    "";

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (rawCookie) headers["Authorization"] = `Bearer ${rawCookie}`;
  if (token?.sub) headers["X-User-Id"] = token.sub;

  const xff =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "";
  if (xff) headers["X-Forwarded-For"] = xff;

  try {
    const upstream = await fetch(`${BACKEND_URL}/api/ai-edit`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await upstream.json().catch(() => null);
    return NextResponse.json(data ?? { error: "Empty upstream response" }, {
      status: upstream.status,
      headers: { "Cache-Control": "private, no-cache" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/ai/editor] upstream error:", msg);
    return NextResponse.json(
      { error: "AI editor service unavailable" },
      { status: 503 },
    );
  }
}
