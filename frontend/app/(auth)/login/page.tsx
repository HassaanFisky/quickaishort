"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Video, ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute top-[-15%] left-[-10%] w-[55%] h-[55%] bg-blue-700/10 blur-[140px] rounded-full"
          style={{ animation: "pulse 6s ease-in-out infinite" }}
        />
        <div
          className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[55%] bg-indigo-700/10 blur-[140px] rounded-full"
          style={{ animation: "pulse 6s ease-in-out infinite 3s" }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-md space-y-6"
      >
        {/* Back Nav */}
        <Link
          href="/"
          className="group inline-flex items-center gap-2.5 text-sm text-neutral-500 hover:text-white transition-all duration-300"
        >
          <div className="p-1.5 rounded-full bg-white/5 border border-white/10 group-hover:bg-white/10 transition-all">
            <ArrowLeft size={14} />
          </div>
          <span className="font-semibold tracking-tight">Return to Home</span>
        </Link>

        {/* Card */}
        <div className="relative bg-neutral-900/40 border border-white/10 rounded-[2rem] p-10 backdrop-blur-2xl shadow-[0_32px_80px_-16px_rgba(0,0,0,0.7)]">
          {/* Inner glow rim */}
          <div className="absolute inset-px rounded-[2rem] border border-white/5 pointer-events-none" />

          {/* Header */}
          <div className="text-center space-y-5 mb-10">
            <motion.div
              whileHover={{ scale: 1.06, rotate: 4 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="w-[72px] h-[72px] bg-gradient-to-tr from-blue-600 via-indigo-500 to-violet-600 rounded-[22px] flex items-center justify-center mx-auto shadow-[0_0_48px_-8px_rgba(99,102,241,0.5)]"
            >
              <Video
                size={32}
                className="text-white"
                fill="rgba(255,255,255,0.15)"
              />
            </motion.div>
            <div>
              <h1 className="text-[2.25rem] font-black tracking-tight text-white leading-none mb-2">
                Welcome Back
              </h1>
              <p className="text-neutral-400 text-sm font-medium">
                Sign in to access your AI video studio.
              </p>
            </div>
          </div>

          {/* Google Sign-In */}
          <div className="space-y-5">
            <Button
              id="btn-google-login"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full h-[3.75rem] bg-white hover:bg-neutral-100 text-[#111] font-bold text-base rounded-xl gap-3.5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-2xl"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={22} />
              ) : (
                <>
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    className="shrink-0"
                  >
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </Button>

            <Button
              id="btn-demo-login"
              onClick={async () => {
                setIsLoading(true);
                setError("");
                const { error } = await supabase.auth.signInWithPassword({
                  email: "demo@quickai.short",
                  password: "password123",
                });
                if (error) {
                  setError(error.message);
                  setIsLoading(false);
                } else {
                  window.location.href = "/dashboard";
                }
              }}
              disabled={isLoading}
              variant="outline"
              className="w-full h-[3.75rem] border-blue-500/30 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 font-bold text-base rounded-xl gap-3.5 transition-all duration-200"
            >
              Demo Auto-Login (Skip Google)
            </Button>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-medium text-center"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Trust badges */}
          <div className="mt-10 pt-6 border-t border-white/5 flex items-center justify-center gap-8">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-600 uppercase tracking-widest">
              <ShieldCheck size={12} className="text-green-500" />
              Secure Auth
            </div>
            <div className="w-px h-3 bg-neutral-800" />
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-600 uppercase tracking-widest">
              <Sparkles size={12} className="text-blue-500" />
              AI Powered
            </div>
          </div>
        </div>

        {/* Signup CTA */}
        <p className="text-center text-sm text-neutral-500 font-medium">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-white hover:text-blue-400 font-bold underline underline-offset-4 decoration-white/20 hover:decoration-blue-400/40 transition-all"
          >
            Sign Up Free
          </Link>
        </p>

        {/* Legal */}
        <div className="flex items-center justify-center gap-6 text-[10px] text-neutral-700 font-semibold tracking-widest uppercase">
          <Link
            href="/privacy"
            className="hover:text-neutral-400 transition-colors"
          >
            Privacy Policy
          </Link>
          <Link href="#" className="hover:text-neutral-400 transition-colors">
            Terms of Service
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
