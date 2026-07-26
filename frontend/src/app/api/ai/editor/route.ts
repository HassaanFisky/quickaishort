/**
 * POST /api/ai/editor
 *
 * Thin proxy to FastAPI POST /api/ai-edit.
 * Replaces the former direct-Gemini implementation.
 *
 * Upstream contract: fastapi/routers/ai_editor_router.py
 * Credits, sanitisation, mock mode all enforced server-side.
 *
 * Auth: mints a compact HS256 backendToken — never forward the raw
 * NextAuth session cookie (encrypted JWE; FastAPI PyJWT rejects it).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth/options";
import { mintBackendToken } from "@/lib/auth/mintBackendToken";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

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
