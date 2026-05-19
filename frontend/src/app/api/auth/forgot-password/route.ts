import { NextResponse } from "next/server";
import crypto from "crypto";
import { Resend } from "resend";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/user";

const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@quickaishort.online";
const APP_URL = (process.env.NEXTAUTH_URL ?? "https://www.quickaishort.online").replace(/\/$/, "");
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes between resends

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local[0]}***@${domain}`;
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ message: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    await connectDB();
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+resetToken +resetTokenExpiry +password"
    );

    // User doesn't exist — generic response to prevent email enumeration
    if (!user) {
      return NextResponse.json({ message: "If that email exists, a reset link has been sent." });
    }

    // Google-only account (no password set)
    if (!user.password) {
      return NextResponse.json(
        {
          message:
            "This account uses Google Sign-In. Please sign in with Google — no password is needed.",
        },
        { status: 400 }
      );
    }

    // Rate-limit: don't reissue a token if one was sent recently
    if (
      user.resetTokenExpiry &&
      user.resetTokenExpiry.getTime() > Date.now() + EXPIRY_MS - RATE_LIMIT_MS
    ) {
      return NextResponse.json({
        message: "A reset link was already sent. Please wait 5 minutes before requesting another.",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    user.resetToken = crypto.createHash("sha256").update(token).digest("hex");
    user.resetTokenExpiry = new Date(Date.now() + EXPIRY_MS);
    await user.save();

    const resetUrl = `${APP_URL}/reset-password?token=${token}`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: sendError } = await resend.emails.send({
      from: FROM,
      to: normalizedEmail,
      subject: "Reset your QuickAI Short password",
      text: `Reset your QuickAI Short password\n\nClick this link to reset your password (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
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
            We received a request to reset your QuickAI Short password. Click the button below — this link expires in <strong style="color:#f4f4f5">1 hour</strong>.
          </p>
          <a href="${resetUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#3b82f6,#a855f7,#ec4899);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:14px;text-decoration:none;margin-bottom:24px">
            Reset Password →
          </a>
          <p style="color:#52525b;font-size:12px;margin:0 0 16px">
            Or copy this link into your browser:<br/>
            <span style="color:#71717a;word-break:break-all">${resetUrl}</span>
          </p>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:0 0 16px"/>
          <p style="color:#3f3f46;font-size:11px;margin:0">
            If you didn't request a password reset, you can safely ignore this email. This link expires in 1 hour and can only be used once.
          </p>
        </div>
      `,
    });

    // Resend v2+ returns { data, error } — never throws
    if (sendError) {
      console.error("[forgot-password] Resend error:", JSON.stringify(sendError));
      return NextResponse.json(
        { message: "Failed to send reset email. Please try again in a moment." },
        { status: 500 }
      );
    }

    console.info(`[forgot-password] Reset email sent to ${maskEmail(normalizedEmail)}`);
    return NextResponse.json({ message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    console.error("[forgot-password] Unexpected error:", err);
    return NextResponse.json({ message: "Something went wrong. Try again." }, { status: 500 });
  }
}
