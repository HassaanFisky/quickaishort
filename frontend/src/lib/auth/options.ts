import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/user";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
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
            existingUser.googleId = account.providerAccountId; // Ensure ID is updated
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
    async session({ session }) {
      if (session.user) {
        await connectDB();
        const dbUser = await User.findOne({ email: session.user.email });
        if (dbUser) {
          (session.user as { id: string; settings: unknown }).id =
            dbUser._id.toString();
          (session.user as { id: string; settings: unknown }).settings =
            dbUser.settings;
        }
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/signin",
  },
};
