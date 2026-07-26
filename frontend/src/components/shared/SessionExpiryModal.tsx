"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { signIn, useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, Loader2, Mail, ShieldCheck } from "lucide-react";
import { SESSION_EXPIRED_EVENT } from "@/lib/api";
import { mapAuthError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlowButton } from "@/components/ui/GlowButton";

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
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
  );
}

/**
 * Confirmed FastAPI auth failure (after silent retry) → calm re-auth sheet.
 * Keeps the editor mounted so timeline work is never discarded.
 */
export function SessionExpiryModal() {
  const { status, update } = useSession();
  const [isVisible, setIsVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onSessionExpired = () => {
      if (status === "loading") return;
      setIsVisible(true);
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    };
  }, [status]);

  const callbackUrl =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/editor";

  const handleGoogleSignIn = useCallback(async () => {
    setGoogleLoading(true);
    setError("");
    await signIn("google", { callbackUrl });
  }, [callbackUrl]);

  const handleReLogin = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (result?.error) {
      setLoading(false);
      setError(mapAuthError(result.error));
      return;
    }
    // Force session callback remint so backendToken is fresh before next API call.
    try {
      await update();
    } catch {
      // Non-fatal — SessionProvider refetch will eventually catch up
    }
    setLoading(false);
    setIsVisible(false);
    setEmail("");
    setPassword("");
  }, [email, password, update]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    setError("");
    setEmail("");
    setPassword("");
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-reauth-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/75 p-6 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.97, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 12 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-[400px] overflow-hidden rounded-3xl border border-border bg-card/90 shadow-[var(--card-shadow)] backdrop-blur-2xl"
          >
            <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

            <div className="px-7 pb-8 pt-10">
              <div className="mb-6 flex flex-col items-center gap-4 text-center">
                <div className="relative h-12 w-12">
                  <Image
                    src="/qs-logo.png"
                    alt=""
                    fill
                    aria-hidden
                    className="object-contain invert drop-shadow-[0_0_16px_rgba(168,85,247,0.55)] dark:invert-0"
                  />
                </div>
                <div className="space-y-1.5">
                  <h2
                    id="session-reauth-title"
                    className="text-2xl font-black tracking-tight text-foreground"
                  >
                    Sign in to continue
                  </h2>
                  <p className="text-[13px] text-muted-foreground">
                    Your timeline is still here — reconnect to keep editing.
                  </p>
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-[13px] font-medium text-red-400"
                >
                  {error}
                </motion.div>
              )}

              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={googleLoading || loading}
                  onClick={handleGoogleSignIn}
                  className="h-12 w-full rounded-xl border-border bg-card text-[13px] font-semibold text-foreground transition-[background-color,border-color] duration-[160ms] hover:bg-muted/70"
                >
                  {googleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <GoogleMark className="mr-2.5 h-4 w-4 shrink-0" />
                      Continue with Google
                    </>
                  )}
                </Button>

                <div className="relative my-1 flex items-center">
                  <div className="flex-grow border-t border-border" />
                  <span className="mx-4 flex-shrink-0 text-[12px] text-muted-foreground">
                    or
                  </span>
                  <div className="flex-grow border-t border-border" />
                </div>

                <div className="relative group">
                  <Mail
                    className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors duration-[160ms] group-focus-within:text-primary"
                    aria-hidden
                  />
                  <Input
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-xl border-border bg-card pl-10 text-foreground placeholder:text-muted-foreground/40 transition-[background-color,border-color] duration-[160ms] focus-visible:border-primary/60 focus-visible:bg-primary/5"
                  />
                </div>

                <div className="relative group">
                  <Lock
                    className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors duration-[160ms] group-focus-within:text-primary"
                    aria-hidden
                  />
                  <Input
                    type="password"
                    placeholder="Password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleReLogin()}
                    className="h-12 rounded-xl border-border bg-card pl-10 text-foreground placeholder:text-muted-foreground/40 transition-[background-color,border-color] duration-[160ms] focus-visible:border-primary/60 focus-visible:bg-primary/5"
                  />
                </div>

                <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                  <span>Encrypted connection</span>
                </div>

                <GlowButton
                  type="button"
                  variant="gradient"
                  disabled={loading || googleLoading || !email || !password}
                  onClick={handleReLogin}
                  className="h-12 w-full rounded-xl text-[13px] font-bold"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Sign in"
                  )}
                </GlowButton>
              </div>

              <button
                type="button"
                onClick={handleDismiss}
                className="mt-5 w-full text-center text-[12px] font-medium text-muted-foreground transition-colors duration-[160ms] hover:text-foreground"
              >
                Keep editing offline
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
