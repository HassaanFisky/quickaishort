import Link from "next/link";
import { Zap } from "lucide-react";

interface CreditsLowBannerProps {
  credits: number;
}

export function CreditsLowBanner({ credits }: CreditsLowBannerProps) {
  const isExhausted = credits <= 0;
  const headline = isExhausted
    ? "You're out of credits."
    : `You have ${credits} ${credits === 1 ? "credit" : "credits"} left.`;
  const body = isExhausted
    ? "Upgrade to Pro to keep creating, or wait for your free credits to refresh."
    : "Upgrade to Pro for more headroom on Pre-Flight and exports.";

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-2xl border border-foreground/5 bg-secondary/30 px-4 py-3 border-l-[3px] border-l-amber-500"
    >
      <Zap
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{headline}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
      </div>
      <Link
        href="/pricing"
        className="shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        style={{ transitionDuration: "var(--motion-2)" }}
      >
        Get more
      </Link>
    </div>
  );
}
