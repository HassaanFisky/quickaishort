import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * POST /api/shorts/create
 * Proxies the request to the Railway FastAPI backend.
 * All job creation, queuing, and status tracking is handled server-side.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const upstream = await fetch(`${BACKEND_URL}/api/process-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
