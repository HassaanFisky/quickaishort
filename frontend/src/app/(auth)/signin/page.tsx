"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
// import Logo from "@/components/shared/Logo";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/20 blur-[120px] rounded-full -z-10" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="w-full max-w-md bg-card/40 backdrop-blur-md border border-white/10 shadow-2xl rounded-3xl overflow-hidden">
          <CardHeader className="text-center space-y-6 pt-12 pb-2">
            <div className="flex justify-center mb-2 transform hover:scale-105 transition-transform duration-500">
              <div className="relative w-12 h-12">
                <Image
                  src="/qs-logo.png"
                  alt="QS Logo"
                  fill
                  className="object-contain invert dark:invert-0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl font-black tracking-tight text-white">
                Welcome Back
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                Sign in to manage your projects and history.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pb-12 px-10 pt-8">
            <Button
              className="w-full h-14 text-lg font-bold rounded-full bg-white text-black hover:bg-white/90 transition-all hover:scale-[1.02] shadow-xl"
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            >
              <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </Button>

            <p className="mt-8 text-center text-sm text-muted-foreground/60">
              By signing in, you agree to our{" "}
              <Link
                href="/terms"
                className="underline hover:text-white transition-colors"
              >
                Terms
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="underline hover:text-white transition-colors"
              >
                Privacy
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
