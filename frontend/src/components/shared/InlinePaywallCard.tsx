"use client";

import Link from "next/link";
import { Sparkles, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface InlinePaywallCardProps {
  /** Short headline that names the gated feature. */
  feature: string;
  /** One-sentence explanation of what unlocking it enables. */
  body: string;
  /** Pricing route or upgrade target. Defaults to /pricing. */
  href?: string;
  /** Label for the primary upgrade action. */
  ctaLabel?: string;
  /** Optional secondary text below the CTA (e.g. credit cost reminder). */
  footnote?: string;
  className?: string;
}

/**
 * Inline upgrade card surfaced when an API returns 402 / premium-gated.
 * Replaces modal interruptions for paywalls on Pre-Flight and similar gates.
 * Keeps surrounding workflow state intact while the user decides.
 */
export function InlinePaywallCard({
  feature,
  body,
  href = "/pricing",
  ctaLabel = "Upgrade to Pro",
  footnote,
  className,
}: InlinePaywallCardProps) {
  return (
    <div
      role="region"
      aria-label={`${feature} requires Pro`}
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
          <Lock className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Sparkles
              className="h-3 w-3 text-primary"
              aria-hidden="true"
            />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              Pro feature
            </span>
          </div>
          <h3 className="mt-1 text-sm font-bold text-foreground">{feature}</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {body}
          </p>

          <Link
            href={href}
            className={cn(
              "mt-3 inline-flex h-9 items-center rounded-xl bg-primary px-4 text-[11px] font-bold uppercase tracking-widest text-primary-foreground",
              "shadow-lg shadow-primary/20 transition-[transform,filter] hover:brightness-110 active:scale-[0.98]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            )}
            style={{ transitionDuration: "var(--motion-2)" }}
          >
            {ctaLabel}
          </Link>

          {footnote && (
            <p className="mt-2 text-[10px] text-muted-foreground/70">
              {footnote}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
