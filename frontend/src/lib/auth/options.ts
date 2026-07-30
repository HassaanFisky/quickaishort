import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/user";
import bcrypt from "bcryptjs";
import { triggerWelcomeEmail } from "@/lib/email";

import crypto from "crypto";
import {
  mintBackendToken,
  SESSION_MAX_AGE,
} from "@/lib/auth/mintBackendToken";

export { SESSION_MAX_AGE };

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

      // Explicit update() call (e.g., after Paddle activation): refresh isPro from
      // Firestore-backed FastAPI /api/stats (billing SoT), then mirror into Mongo.
      if (trigger === "update" && token.id) {
        try {
          const apiBase = (
            process.env.NEXT_PUBLIC_API_URL ||
            process.env.API_URL ||
            ""
          ).replace(/\/$/, "");
          if (apiBase) {
            const minted = await mintBackendToken({
              id: String(token.id),
              email: token.email,
              isPro: Boolean(token.isPro),
            });
            if (minted) {
              const res = await fetch(`${apiBase}/api/stats`, {
                headers: {
                  Authorization: `Bearer ${minted}`,
                  "X-User-Id": String(token.id),
                },
                cache: "no-store",
              });
              if (res.ok) {
                const stats = (await res.json()) as {
                  is_pro?: boolean;
                  is_premium?: boolean;
                };
                const fromFirestore = Boolean(stats.is_pro || stats.is_premium);
                token.isPro = fromFirestore;
                try {
                  await connectDB();
                  await User.findByIdAndUpdate(token.id, {
                    isPro: fromFirestore,
                    isPremium: fromFirestore,
                    updatedAt: new Date(),
                  });
                } catch (mirrorErr) {
                  console.error("[jwt] Mongo Pro mirror failed:", mirrorErr);
                }
              }
            }
          } else {
            await connectDB();
            const dbUser = await User.findById(token.id).select(
              "isPro isPremium settings",
            );
            if (dbUser) {
              token.isPro = dbUser.isPro || dbUser.isPremium || false;
              token.settings = dbUser.settings;
            }
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
      // Mint a compact HS256 JWT that FastAPI verifies with NEXTAUTH_SECRET.
      // next-auth/jwt encode() produces encrypted JWE — incompatible with PyJWT HS256.
      try {
        const subject = String(token.id ?? token.sub ?? "");
        if (subject) {
          const minted = await mintBackendToken({
            id: subject,
            email: token.email,
            isPro: token.isPro ?? false,
          });
          if (minted) session.backendToken = minted;
        }
      } catch {
        // Sign failure is non-fatal; API calls will receive 401 until resolved
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
  },
  jwt: {
    maxAge: SESSION_MAX_AGE,
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

