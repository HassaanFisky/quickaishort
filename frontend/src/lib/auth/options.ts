import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/user";
import bcrypt from "bcryptjs";

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
        try {
          await connectDB();
          const existingUser = await User.findOne({ email: user.email });

          if (!existingUser) {
            await User.create({
              googleId: account.providerAccountId,
              email: user.email,
              name: user.name,
              image: user.image,
            });
          } else {
            existingUser.lastLoginAt = new Date();
            existingUser.googleId = account.providerAccountId;
            await existingUser.save();
          }
          return true;
        } catch (error) {
          console.error("Error during sign in:", error);
          return false;
        }
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
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/signin",
  },
  debug: process.env.NODE_ENV === "development",
};

