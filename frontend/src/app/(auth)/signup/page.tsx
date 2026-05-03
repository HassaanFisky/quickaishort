"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2, ShieldCheck, Mail, Lock, User as UserIcon } from "lucide-react";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Failed to register");
        setLoading(false);
        return;
      }

      // Automatically sign in after successful registration
      const signInRes = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (signInRes?.error) {
        setError("Account created, but failed to auto-login.");
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
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-accent/20 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-primary/20 blur-[120px] rounded-full animate-pulse delay-700" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[420px]"
      >
        <Card className="w-full bg-card/40 backdrop-blur-xl border border-white/10 shadow-2xl rounded-[32px] overflow-hidden relative">
          
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent via-primary to-pink-500 opacity-50" />

          <CardHeader className="text-center space-y-6 pt-12 pb-4">
            <div className="flex justify-center transform hover:scale-105 transition-transform duration-500">
              <div className="relative w-16 h-16">
                <Image
                  src="/qs-logo.png"
                  alt="QS Logo"
                  fill
                  className="object-contain invert dark:invert-0 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                />
              </div>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl font-black tracking-tight text-white">
                Create Account
              </CardTitle>
              <CardDescription className="text-sm font-medium text-muted-foreground/80">
                Join elite creators building viral content.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="pb-10 px-8 pt-4">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-sm font-medium text-center">
                  {error}
                </div>
              )}
              
              <div className="space-y-2 relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-accent transition-colors">
                  <UserIcon className="w-5 h-5" />
                </div>
                <Input
                  id="name"
                  type="text"
                  placeholder="Full Name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-14 pl-12 rounded-2xl bg-black/20 border-white/10 text-white placeholder:text-muted-foreground/50 focus-visible:ring-accent focus-visible:border-accent transition-all"
                />
              </div>

              <div className="space-y-2 relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-accent transition-colors">
                  <Mail className="w-5 h-5" />
                </div>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-14 pl-12 rounded-2xl bg-black/20 border-white/10 text-white placeholder:text-muted-foreground/50 focus-visible:ring-accent focus-visible:border-accent transition-all"
                />
              </div>

              <div className="space-y-2 relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-accent transition-colors">
                  <Lock className="w-5 h-5" />
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="Create Password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-14 pl-12 rounded-2xl bg-black/20 border-white/10 text-white placeholder:text-muted-foreground/50 focus-visible:ring-accent focus-visible:border-accent transition-all"
                />
              </div>

              <div className="flex items-center space-x-2 text-sm text-muted-foreground mt-2 mb-4">
                <ShieldCheck className="w-4 h-4 text-green-500" />
                <span>Verified human registration</span>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-14 text-lg font-bold rounded-2xl bg-gradient-to-r from-accent to-primary hover:opacity-90 text-white transition-all hover:scale-[1.02] shadow-[0_0_20px_rgba(59,130,246,0.3)] disabled:opacity-50 disabled:hover:scale-100 relative overflow-hidden"
              >
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>

            <div className="mt-8 relative flex items-center py-2">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink-0 mx-4 text-muted-foreground text-sm font-medium">Or</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
              className="w-full mt-4 h-14 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold transition-all hover:scale-[1.02]"
            >
              <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign up with Google
            </Button>

            <p className="mt-8 text-center text-sm text-muted-foreground/80 font-medium">
              Already have an account?{" "}
              <Link href="/signin" className="text-accent hover:text-white transition-colors font-bold tracking-wide underline-offset-4 hover:underline">
                Sign In
              </Link>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
