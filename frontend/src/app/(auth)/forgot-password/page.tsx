"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { GlowButton } from "@/components/ui/GlowButton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "Something went wrong.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[-5%] left-[-5%] w-[45vw] h-[45vw] bg-primary/[0.10] blur-[140px] rounded-full" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[45vw] h-[45vw] bg-[#ec4899]/[0.06] blur-[140px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[400px]"
      >
        <Card className="w-full bg-[hsl(var(--bg-base))]/80 backdrop-blur-2xl border border-white/[0.08] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.7)] rounded-3xl overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

          <CardHeader className="text-center space-y-5 pt-10 pb-2">
            <div className="flex justify-center">
              <div className="relative w-12 h-12">
                <Image src="/qs-logo.png" alt="" fill aria-hidden className="object-contain invert dark:invert-0 drop-shadow-[0_0_16px_rgba(168,85,247,0.55)]" />
              </div>
            </div>
            <div className="space-y-1.5">
              <CardTitle className="text-2xl font-black tracking-tight text-white">
                {sent ? "Check your inbox" : "Forgot password?"}
              </CardTitle>
              <CardDescription className="text-[13px] text-muted-foreground">
                {sent
                  ? `We sent a reset link to ${email}`
                  : "Enter your email and we'll send you a reset link."}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="pb-8 px-7 pt-5">
            <AnimatePresence mode="wait">
              {sent ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  className="flex flex-col items-center gap-4 py-4"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </div>
                  <p className="text-[13px] text-muted-foreground text-center max-w-[260px] leading-relaxed">
                    Click the link in the email to set a new password. It expires in 1 hour.
                  </p>
                  <GlowButton variant="outline" size="sm" className="mt-2 rounded-xl" asChild>
                    <Link href="/signin">
                      <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to sign in
                    </Link>
                  </GlowButton>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onSubmit={handleSubmit}
                  className="space-y-4"
                >
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[13px] font-medium text-center"
                      >
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="relative group">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors duration-[160ms]" aria-hidden />
                    <Input
                      type="email"
                      placeholder="name@example.com"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12 pl-10 rounded-xl bg-white/[0.04] border-white/[0.08] text-white placeholder:text-muted-foreground/40 focus-visible:border-primary/60 focus-visible:bg-primary/5 transition-[background-color,border-color] duration-[160ms]"
                    />
                  </div>

                  <GlowButton
                    type="submit"
                    variant="gradient"
                    disabled={loading}
                    className="w-full h-12 rounded-xl text-[13px] font-bold"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Reset Link"}
                  </GlowButton>

                  <div className="text-center">
                    <Link href="/signin" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors duration-[160ms]">
                      <ArrowLeft className="w-3 h-3" /> Back to sign in
                    </Link>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
