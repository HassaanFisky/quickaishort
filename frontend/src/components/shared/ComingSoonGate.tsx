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
 * EP-008 — Premium Coming Soon surface. Never interactive unfinished features.
 */
export function ComingSoonGate({
  title,
  description = "We’re crafting this experience. Stay tuned.",
  className,
  children,
}: ComingSoonGateProps) {
  return (
    <div
      className={cn(
        "relative min-h-[60vh] w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[hsl(var(--bg-subtle))]",
        className,
      )}
    >
      <div
        className="absolute inset-0 pointer-events-none select-none blur-md opacity-40 scale-105"
        aria-hidden
      >
        {children ?? (
          <div className="h-full w-full bg-gradient-to-br from-primary/20 via-transparent to-[#ec4899]/15" />
        )}
      </div>
      <div className="relative z-10 flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.08] bg-black/40 text-primary">
          <Lock className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary/80">
          Coming Soon
        </p>
        <h1 className="text-2xl font-black tracking-tight text-foreground max-w-md">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
