/**
 * RETIRED (EP-003 / ADR-009 / Phase 2 A5a).
 * Title-keyword + invent Gemini suggestion chips are forbidden as product truth.
 * Editor rail uses MediaGraph: GET /api/studio/v1/media-graphs/{id}/suggestions
 */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "retired",
      detail:
        "Heuristic /api/ai/suggestions is retired. Use MediaGraph grounded suggestions.",
      replacement: "/api/studio/v1/media-graphs/{graph_id}/suggestions",
    },
    { status: 410 },
  );
}

export async function GET() {
  return POST();
}
