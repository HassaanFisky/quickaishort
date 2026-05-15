"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, Mail, Lock } from "lucide-react";
import { GlowButton } from "@/components/ui/GlowButton";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError(res.error);
        setLoading(false);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError("An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[-5%] left-[-5%] w-[45vw] h-[45vw] bg-primary/[0.12] blur-[140px] rounded-full" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[45vw] h-[45vw] bg-[#ec4899]/[0.08] blur-[140px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[400px]"
      >
        <Card className="w-full bg-[#08080a]/80 backdrop-blur-2xl border border-white/[0.08] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.7)] rounded-3xl overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

          <CardHeader className="text-center space-y-5 pt-10 pb-2">
            <div className="flex justify-center">
              <div className="relative w-12 h-12">
                <Image
                  src="/qs-logo.png"
                  alt=""
                  fill
                  aria-hidden
                  className="object-contain invert dark:invert-0 drop-shadow-[0_0_16px_rgba(168,85,247,0.55)]"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <CardTitle className="text-2xl font-black tracking-tight text-white">
                Welcome back
              </CardTitle>
              <CardDescription className="text-[13px] text-muted-foreground">
                Sign in to your workspace.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="pb-8 px-7 pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[13px] font-medium text-center"
                >
                  {error}
                </motion.div>
              )}
              
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors duration-[160ms]" aria-hidden />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 pl-10 rounded-xl bg-white/[0.04] border-white/[0.08] text-white placeholder:text-muted-foreground/40 focus-visible:border-primary/60 focus-visible:bg-primary/5 transition-[background-color,border-color] duration-[160ms]"
                />
              </div>

              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors duration-[160ms]" aria-hidden />
                <Input
                  id="password"
                  type="password"
                  placeholder="Password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 pl-10 rounded-xl bg-white/[0.04] border-white/[0.08] text-white placeholder:text-muted-foreground/40 focus-visible:border-primary/60 focus-visible:bg-primary/5 transition-[background-color,border-color] duration-[160ms]"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" aria-hidden />
                  <span>Encrypted connection</span>
                </div>
                <Link href="#" className="text-[12px] font-medium text-primary hover:text-primary/80 transition-colors duration-[160ms]">
                  Forgot password?
                </Link>
              </div>

              <GlowButton
                type="submit"
                variant="gradient"
                disabled={loading}
                className="w-full h-12 rounded-xl text-[13px] font-bold"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
              </GlowButton>
            </form>

            <div className="my-6 relative flex items-center">
              <div className="flex-grow border-t border-white/[0.06]" />
              <span className="flex-shrink-0 mx-4 text-[12px] text-muted-foreground">or</span>
              <div className="flex-grow border-t border-white/[0.06]" />
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
              className="w-full h-12 rounded-xl border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] text-white text-[13px] font-semibold transition-[background-color,border-color] duration-[160ms]"
            >
              <svg className="mr-2.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </Button>

            <p className="mt-6 text-center text-[12px] text-muted-foreground">
              No account?{" "}
              <Link href="/signup" className="text-primary hover:text-white transition-colors duration-[160ms] font-semibold underline-offset-4 hover:underline">
                Create one
              </Link>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
