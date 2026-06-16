import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { triggerProActivationEmail } from "@/lib/email";

// Called by the pricing page once ActivationCard confirms is_pro: true.
// Billing.py's Paddle webhook can't reach the Next.js MongoDB user record to
// look up an email address (separate databases), so this fires from the
// client at the verified-activation moment instead, using the session it
// already has.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  triggerProActivationEmail(session.user.email, session.user.name ?? "");

  return NextResponse.json({ status: "queued" });
}
