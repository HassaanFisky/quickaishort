import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/user";

const isLocalFirst = () =>
  process.env.LOCAL_FIRST_MODE === "1" ||
  process.env.NEXT_PUBLIC_LOCAL_FIRST_MODE === "1";

export async function GET() {
  if (isLocalFirst()) {
    return NextResponse.json({
      credits: 100,
      referrals: 0,
      referralCode: "qs-studio-local",
    });
  }
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const referralCode = user.referralCode;
    let referralsCount = 0;
    if (referralCode) {
      referralsCount = await User.countDocuments({ referredBy: referralCode });
    }

    return NextResponse.json({
      credits: user.referralCredits || 0,
      referrals: referralsCount,
      referralCode: referralCode || "",
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[credits_api] GET failed:", error);
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
