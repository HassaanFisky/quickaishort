"use client";

import { useState, useEffect, useCallback } from "react";
import { signIn, useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, Loader2 } from "lucide-react";
import { SESSION_EXPIRED_EVENT } from "@/lib/api";

/**
 * Listens for confirmed FastAPI auth failures (after one silent retry) and
 * renders an inline re-authentication modal without losing the current page.
 */
export function SessionExpiryModal() {
  const { status } = useSession();
  const [isVisible, setIsVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
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

  const handleReLogin = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Incorrect credentials. Please try again.");
    } else {
      setIsVisible(false);
      setEmail("");
      setPassword("");
    }
  }, [email, password]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-md flex items-center justify-center p-6"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 20, stiffness: 120 }}
            className="w-full max-w-sm bg-card border border-foreground/10 rounded-[2rem] p-8 shadow-2xl"
          >
            {/* Top bar */}
            <div className="absolute top-0 left-0 w-full h-1 rounded-t-[2rem] bg-gradient-to-r from-primary via-accent to-pink-500 opacity-60" />

            <div className="flex flex-col items-center text-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Lock className="w-6 h-6 text-amber-400" strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="text-lg font-black tracking-tight text-foreground">
                  Session Expired
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Sign in again to continue — your work is safe.
                </p>
              </div>
            </div>

            {error && (
              <p className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2 mb-4 text-center">
                {error}
              </p>
            )}

            <div className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 bg-foreground/5 border border-foreground/10 rounded-xl px-4 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleReLogin()}
                className="w-full h-12 bg-foreground/5 border border-foreground/10 rounded-xl px-4 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors"
              />

              <button
                onClick={handleReLogin}
                disabled={loading || !email || !password}
                className="w-full h-12 rounded-xl bg-primary text-white font-black text-sm uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Sign In & Continue"
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
