"use client";

import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComingSoonGateProps {
  title: string;
  description?: string;
  className?: string;
  /** Decorative blurred backdrop content (non-interactive) */
  children?: React.ReactNode;
}

/**
 * Premium Coming Soon surface. Never interactive unfinished features.
 * Used by ADK (Google Agent Development Kit) workspace — not Ads.
 */
export function ComingSoonGate({
  title,
  description = "Advanced capabilities will arrive in a future release.",
  className,
  children,
}: ComingSoonGateProps) {
  return (
    <div
      className={cn(
        "relative min-h-[60vh] w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[hsl(var(--bg-subtle))]",
        className,
      )}
      role="region"
      aria-label={`${title}. Coming soon.`}
    >
      <div
        className="absolute inset-0 pointer-events-none select-none blur-[10px] opacity-45 scale-[1.02]"
        aria-hidden
      >
        {children ?? (
          <div className="h-full w-full bg-gradient-to-br from-white/[0.06] via-transparent to-white/[0.03]" />
        )}
      </div>
      <div className="relative z-10 flex h-full min-h-[inherit] flex-col items-center justify-center gap-3 px-6 py-16 text-center sm:gap-4 sm:py-20">
        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.1] bg-black/50 text-muted-foreground">
          <Lock className="h-5 w-5" aria-hidden />
        </span>
        {title.trim().toLowerCase() === "coming soon" ? (
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            Coming Soon
          </h1>
        ) : (
          <>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary/80">
              Coming Soon
            </p>
            <h1 className="max-w-md text-2xl font-black tracking-tight text-foreground">
              {title}
            </h1>
          </>
        )}
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
          {description}
        </p>
      </div>
    </div>
  );
}
