import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
  /** Optional icon shown to the left of the action label. */
  actionIcon?: ReactNode;
  /**
   * "primary" — solid accent background, suitable for inline empty states.
   * "gradient" — full brand gradient, suitable for hero-weight empty states
   *              like the dashboard or history page.
   */
  tone?: "primary" | "gradient";
  /** "md" is the standard inline empty state; "lg" is hero-weight. */
  size?: "md" | "lg";
  className?: string;
}

const GRADIENT_BG =
  "linear-gradient(135deg, #3b82f6 0%, #a855f7 60%, #ec4899 100%)";

export function EmptyState({
  icon: Icon,
  title,
  body,
  actionLabel,
  actionHref,
  actionIcon,
  tone = "primary",
  size = "md",
  className,
}: EmptyStateProps) {
  const isLarge = size === "lg";
  const isGradient = tone === "gradient";

  return (
    <div
      role="status"
      className={cn(
        "relative overflow-hidden rounded-3xl border border-dashed border-foreground/10 bg-secondary/10 text-center",
        isLarge ? "px-6 py-20" : "px-6 py-16",
        className,
      )}
    >
      {isLarge && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.04),transparent_70%)]"
        />
      )}

      <div className="relative z-10">
        <div
          className={cn(
            "mx-auto mb-6 flex items-center justify-center rounded-2xl border border-foreground/5 bg-secondary/40",
            isLarge ? "h-20 w-20 shadow-2xl" : "h-16 w-16",
          )}
        >
          <Icon
            className={cn(
              "text-muted-foreground/60",
              isLarge ? "h-8 w-8" : "h-7 w-7",
            )}
            aria-hidden="true"
          />
        </div>

        <h3
          className={cn(
            "font-semibold tracking-tight text-foreground",
            isLarge ? "text-2xl font-black" : "text-xl",
          )}
        >
          {title}
        </h3>

        <p
          className={cn(
            "mx-auto mt-2 max-w-sm text-muted-foreground",
            isLarge ? "text-sm" : "text-sm",
          )}
        >
          {body}
        </p>

        {actionLabel && actionHref && (
          <Link
            href={actionHref}
            className={cn(
              "inline-flex items-center rounded-2xl font-bold transition-[transform,filter] hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              isLarge ? "mt-8 h-14 px-8 text-sm" : "mt-6 h-11 px-6 text-sm",
              isGradient
                ? "text-white shadow-xl"
                : "bg-primary text-primary-foreground shadow-lg shadow-primary/20",
            )}
            style={{
              transitionDuration: "var(--motion-2)",
              ...(isGradient ? { background: GRADIENT_BG } : {}),
            }}
          >
            {actionIcon && <span className="mr-3 inline-flex">{actionIcon}</span>}
            {actionLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
