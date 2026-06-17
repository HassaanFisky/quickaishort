import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/user";
import bcrypt from "bcryptjs";
import { triggerWelcomeEmail } from "@/lib/email";

import crypto from "crypto";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }
        await connectDB();
        const user = await User.findOne({ email: credentials.email }).select("+password");
        if (!user || !user.password) {
          throw new Error("Invalid email or password");
        }
        const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
        if (!isPasswordValid) {
          throw new Error("Invalid email or password");
        }
        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          image: user.image,
          isPro: user.isPro || user.isPremium || false,
        };
      }
    })
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        // DB persistence is a side-effect — never block or reject a Google-authenticated user.
        // If MongoDB is unavailable the user still has a valid Google session; log and continue.
        try {
          await connectDB();
          const existingUser = await User.findOne({ email: user.email });

          if (!existingUser) {
            let referredBy = null;
            try {
              const { cookies } = await import("next/headers");
              const cookieStore = cookies();
              const refCookie = cookieStore.get("NEXT_REFERRAL")?.value;
              if (refCookie) {
                const referrer = await User.findOne({ referralCode: refCookie });
                if (referrer) {
                  referredBy = refCookie;
                }
              }
            } catch (err) {
              if (process.env.NODE_ENV !== "production") {
                console.error("[auth] Google sign-in referral resolution failed:", err);
              }
            }

            const name = user.name || user.email?.split("@")[0] || "User";
            const newReferralCode = "qs-" + crypto.randomBytes(4).toString("hex");

            await User.create({
              googleId: account.providerAccountId,
              email: user.email,
              name,
              image: user.image,
              referralCode: newReferralCode,
              referredBy,
            });
            if (user.email) triggerWelcomeEmail(user.email, name);
          } else {
            existingUser.lastLoginAt = new Date();
            existingUser.googleId = account.providerAccountId;
            await existingUser.save();
          }
        } catch (error) {
          // Log the failure for observability but do NOT return false.
          // Returning false here produces "AccessDenied" for a legitimately authenticated user.
          if (process.env.NODE_ENV !== "production") {
            console.error("[auth] Google sign-in DB persistence failed:", error);
          }
        }
        return true;
      }
      return true;
    },

    async jwt({ token, user, trigger }) {
      // First sign-in: user object is present; hydrate token from DB to avoid
      // a DB round-trip on every session() call.
      if (user) {
        token.id = user.id ?? token.sub;
        token.isPro = user.isPro ?? false;
      }

      // Google users don't carry id/isPro from authorize(); fetch once and cache.
      if (!token.id) {
        try {
          await connectDB();
          const dbUser = await User.findOne({ email: token.email }).select("_id isPro isPremium");
          if (dbUser) {
            token.id = dbUser._id.toString();
            token.isPro = dbUser.isPro || dbUser.isPremium || false;
          }
        } catch (err) {
          console.error("[jwt] DB lookup failed:", err);
        }
      }

      // Explicit update() call (e.g., after Paddle activation): refresh isPro from DB.
      if (trigger === "update") {
        try {
          await connectDB();
          const dbUser = await User.findById(token.id).select("isPro isPremium settings");
          if (dbUser) {
            token.isPro = dbUser.isPro || dbUser.isPremium || false;
            token.settings = dbUser.settings;
          }
        } catch (err) {
          console.error("[jwt] refresh failed:", err);
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id ?? "";
        session.user.isPro = token.isPro ?? false;
      }
      // Re-encode the NextAuth JWT payload as a compact HS256 token that the
      // FastAPI backend can verify with NEXTAUTH_SECRET.  The session cookie is
      // httpOnly and unreachable from document.cookie, so we expose the token
      // here and the axios interceptor reads session.backendToken instead.
      try {
        const { encode } = await import("next-auth/jwt");
        session.backendToken = await encode({
          token,
          secret: process.env.NEXTAUTH_SECRET!,
          maxAge: 30 * 24 * 60 * 60,
        });
      } catch {
        // encode failure is non-fatal; API calls will receive 401 until resolved
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        // Cover both www and apex on quickaishort.online
        domain:
          process.env.NODE_ENV === "production"
            ? ".quickaishort.online"
            : undefined,
      },
    },
  },
  pages: {
    signIn: "/signin",
  },
  debug: process.env.NODE_ENV === "development",
};

