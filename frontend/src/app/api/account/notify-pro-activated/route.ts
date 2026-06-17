import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { triggerProActivationEmail } from "@/lib/email";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/user";
import { API_URL } from "@/lib/api";

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

  try {
    await connectDB();
    const dbUser = await User.findOne({ email: session.user.email });
    
    if (dbUser && dbUser.referredBy && !dbUser.referralRewarded) {
      const referrer = await User.findOne({ referralCode: dbUser.referredBy });
      if (referrer) {
        referrer.referralCredits = (referrer.referralCredits || 0) + 100;
        await referrer.save();

        dbUser.referralCredits = (dbUser.referralCredits || 0) + 100;
        dbUser.referralRewarded = true;
        await dbUser.save();

        try {
          const response = await fetch(`${API_URL}/api/admin/referral-bonus`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Admin-Secret": process.env.ADMIN_SECRET || "",
            },
            body: JSON.stringify({
              referred_user_id: dbUser._id.toString(),
              referrer_user_id: referrer._id.toString(),
              amount: 100,
            }),
          });
          
          if (!response.ok) {
            const errText = await response.text();
            if (process.env.NODE_ENV !== "production") {
              console.error("[referral_credit] FastAPI credit award failed:", errText);
            }
          }
        } catch (apiErr) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[referral_credit] Failed to connect to FastAPI:", apiErr);
          }
        }
      }
    }
  } catch (dbErr) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[pro_activated] DB operation failed:", dbErr);
    }
  }

  triggerProActivationEmail(session.user.email, session.user.name ?? "");

  return NextResponse.json({ status: "queued" });
}

