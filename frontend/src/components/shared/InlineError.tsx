"use client";

import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface InlineErrorProps {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function InlineError({
  title,
  body,
  actionLabel,
  onAction,
  className,
}: InlineErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-foreground/5 bg-secondary/30 px-4 py-3",
        "border-l-[3px] border-l-destructive",
        className,
      )}
    >
      <AlertCircle
        className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {body && (
          <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
        )}
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          style={{ transitionDuration: "var(--motion-2)" }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
