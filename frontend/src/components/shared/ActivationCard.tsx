"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { getStats } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ActivationCardProps {
  userId: string;
  /** Fires once when stats first report is_pro: true. */
  onActivated?: () => void;
  /** Fires once when the 5-minute poll window expires without activation. */
  onTimeout?: () => void;
  className?: string;
}

const FAST_POLL_MS = 1500;
const SLOW_POLL_MS = 5000;
const FAST_PHASE_MS = 30 * 1000;
const TOTAL_BUDGET_MS = 5 * 60 * 1000;

/**
 * Three-stage copy progression for the activation window.
 * Boundaries match the spec's user-flow definition (2c step 4):
 *   0–15s    "Activating Pro…"
 *   15–30s   "Almost there…"
 *   30s–5m   "Pro will activate within a minute"
 *   >5m      exhausted (handled separately)
 */
function stageCopy(elapsedMs: number): { title: string; body: string } {
  if (elapsedMs < 15_000) {
    return {
      title: "Activating Pro…",
      body: "Payment received. We're setting up your account.",
    };
  }
  if (elapsedMs < 30_000) {
    return {
      title: "Almost there…",
      body: "Final activation steps in progress.",
    };
  }
  return {
    title: "Pro will activate within a minute",
    body: "Payment received. We're refreshing automatically as soon as activation completes.",
  };
}

/**
 * Activation status card shown after a successful Paddle checkout.
 *
 * Behaviour:
 *  - Polls GET /api/stats every 1.5s for the first 30s, then every 5s.
 *  - On detecting `is_pro: true`, calls NextAuth `update()` so
 *    `session.user.isPro` flips across the app and fires `onActivated`.
 *  - After 5 minutes without activation, switches to the exhausted state
 *    and exposes a support recovery affordance.
 *  - Tick interval is 1s so the stage copy updates smoothly between polls.
 *
 * Notes:
 *  - The component is intentionally self-contained — it does not require
 *    a parent to drive elapsed time, polling, or session refresh.
 *  - If the user navigates away during activation, polling stops here but
 *    the Pusher real-time stream on the dashboard (useDashboardStats) will
 *    still pick up the activation when it lands.
 */
export function ActivationCard({
  userId,
  onActivated,
  onTimeout,
  className,
}: ActivationCardProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [activated, setActivated] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const sessionUpdateRef = useRef(false);
  const { update } = useSession();

  // 1s tick to advance the displayed copy. Decoupled from the poll cadence
  // so copy doesn't appear to jump on the 5s-phase boundary.
  useEffect(() => {
    if (activated || exhausted) return;
    const startedAt = Date.now();
    const tickId = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1000);
    return () => {
      window.clearInterval(tickId);
    };
  }, [activated, exhausted]);

  // Polling loop. Uses a single recursive setTimeout chain so each tick
  // schedules the next at the correct cadence based on elapsed time.
  //
  // Visibility behaviour: when document.visibilityState is "hidden" the poll
  // skips the API call but keeps the schedule running so the 5-minute budget
  // is wall-clock based. When visibility returns, we cancel the current
  // scheduled tick and fire an immediate poll so the user does not have to
  // wait for the next interval.
  useEffect(() => {
    if (activated || exhausted) return;
    if (!userId) return;

    const startedAt = Date.now();
    let cancelled = false;
    let timeoutId: number | undefined;

    const poll = async () => {
      if (cancelled) return;

      const isHidden =
        typeof document !== "undefined" &&
        document.visibilityState === "hidden";

      if (!isHidden) {
        let isProNow = false;
        try {
          const stats = await getStats(userId);
          isProNow = Boolean(stats.is_pro);
        } catch {
          // Transient API failure; the next tick will retry.
        }

        if (cancelled) return;

        if (isProNow) {
          setActivated(true);
          if (!sessionUpdateRef.current) {
            sessionUpdateRef.current = true;
            // Refresh the NextAuth JWT so session.user.isPro is true across the app.
            // Best-effort: if it fails, the next page navigation will pick it up.
            if (update) {
              try {
                await update();
              } catch {
                /* ignore */
              }
            }
          }
          onActivated?.();
          return;
        }
      }

      const totalElapsed = Date.now() - startedAt;
      if (totalElapsed >= TOTAL_BUDGET_MS) {
        setExhausted(true);
        onTimeout?.();
        return;
      }

      const interval = totalElapsed < FAST_PHASE_MS ? FAST_POLL_MS : SLOW_POLL_MS;
      timeoutId = window.setTimeout(poll, interval);
    };

    const handleVisibilityChange = () => {
      if (cancelled) return;
      // When the tab becomes visible again, fire a poll immediately rather
      // than waiting for the next scheduled tick.
      if (document.visibilityState === "visible") {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(poll, 0);
      }
    };

    timeoutId = window.setTimeout(poll, FAST_POLL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId, activated, exhausted, onActivated, onTimeout, update]);

  // === Success state ===
  if (activated) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
          >
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">Pro is active.</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Your PRO badge and new credit balance will appear momentarily.
            </p>
            <Link
              href="/dashboard"
              className="mt-3 inline-flex h-9 items-center rounded-xl bg-emerald-500/10 px-4 text-[11px] font-bold uppercase tracking-widest text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 transition-colors"
              style={{ transitionDuration: "var(--motion-2)" }}
            >
              Go to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // === Exhausted state (after 5 minutes without activation) ===
  if (exhausted) {
    return (
      <div
        role="alert"
        className={cn(
          "relative overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500"
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">
              Pro is taking longer than expected
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Your payment is received and your account will activate. Check
              your email for the Paddle receipt or contact support if you need
              immediate access.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href="mailto:support@quickaishort.online"
                className="inline-flex h-9 items-center rounded-xl bg-amber-500/10 px-4 text-[11px] font-bold uppercase tracking-widest text-amber-500 border border-amber-500/30 hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 transition-colors"
                style={{ transitionDuration: "var(--motion-2)" }}
              >
                Contact support
              </a>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-9 items-center rounded-xl bg-foreground/5 px-4 text-[11px] font-bold uppercase tracking-widest text-foreground/80 border border-foreground/10 hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40 transition-colors"
                style={{ transitionDuration: "var(--motion-2)" }}
              >
                Refresh page
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // === Activating state (three-stage copy progression) ===
  const { title, body } = stageCopy(elapsedMs);
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.04] p-5",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-primary/20 blur-3xl"
      />
      <div className="relative flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary"
        >
          <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">{title}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {body}
          </p>
          {/* Indeterminate progress strip — never reaches 100% on its own;
              the activation success state replaces this entire card. */}
          <div className="relative mt-3 h-1 w-full overflow-hidden rounded-full bg-foreground/5">
            <div className="absolute inset-y-0 left-0 w-1/3 animate-[indeterminate_1.6s_ease-in-out_infinite] rounded-full bg-primary" />
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes indeterminate {
          0% {
            transform: translateX(-100%);
            width: 33%;
          }
          50% {
            transform: translateX(75%);
            width: 50%;
          }
          100% {
            transform: translateX(300%);
            width: 33%;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          div :global([class*="animate-["]) {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
