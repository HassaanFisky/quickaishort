/**
 * TEMPORARY ops probe — returns SHA-256 of NEXTAUTH_SECRET (never the secret).
 * Remove after Vercel↔Cloud Run secret match verification.
 */
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const PROBE_HEADER = "x-qai-secret-probe";
const PROBE_VALUE = "session-secret-check-2026-07-24";

export async function GET(req: NextRequest) {
  if (req.headers.get(PROBE_HEADER) !== PROBE_VALUE) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const secret = process.env.NEXTAUTH_SECRET ?? "";
  const sha256 = createHash("sha256").update(secret, "utf8").digest("hex");

  return NextResponse.json({
    present: secret.length > 0,
    length: secret.length,
    sha256,
  });
}
