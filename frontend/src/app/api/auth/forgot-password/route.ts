import { NextResponse } from "next/server";
import crypto from "crypto";
import { Resend } from "resend";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/user";

const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@quickaishort.online";
const APP_URL = process.env.NEXTAUTH_URL ?? "https://www.quickaishort.online";
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ message: "Email is required" }, { status: 400 });
    }

    await connectDB();
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+resetToken +resetTokenExpiry");

    // Always return success to prevent email enumeration
    if (!user || !user.password) {
      return NextResponse.json({ message: "If that email exists, a reset link has been sent." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    user.resetToken = crypto.createHash("sha256").update(token).digest("hex");
    user.resetTokenExpiry = new Date(Date.now() + EXPIRY_MS);
    await user.save();

    const resetUrl = `${APP_URL}/reset-password?token=${token}`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: "Reset your QuickAI Short password",
      html: `
        <div style="font-family:'Inter',Arial,sans-serif;max-width:480px;margin:0 auto;background:#08080a;color:#f4f4f5;padding:40px 32px;border-radius:20px;border:1px solid rgba(255,255,255,0.08)">
          <div style="text-align:center;margin-bottom:32px">
            <div style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#a855f7,#ec4899);padding:2px;border-radius:14px">
              <div style="background:#08080a;border-radius:12px;padding:12px 20px">
                <span style="font-size:18px;font-weight:900;letter-spacing:-0.5px;color:#f4f4f5">QuickAI Short</span>
              </div>
            </div>
          </div>
          <h1 style="font-size:24px;font-weight:900;margin:0 0 8px;color:#f4f4f5">Reset your password</h1>
          <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 28px">
            We received a request to reset your password. Click the button below — this link expires in 1 hour.
          </p>
          <a href="${resetUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#3b82f6,#a855f7,#ec4899);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:14px;text-decoration:none;margin-bottom:24px">
            Reset Password
          </a>
          <p style="color:#52525b;font-size:12px;margin:0">
            If you didn't request this, you can safely ignore this email.<br/>
            This link expires in 1 hour.
          </p>
        </div>
      `,
    });

    return NextResponse.json({ message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    console.error("[forgot-password]", err);
    return NextResponse.json({ message: "Something went wrong. Try again." }, { status: 500 });
  }
}
