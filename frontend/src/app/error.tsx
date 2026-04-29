"use client";

import { useEffect } from "react";
import QSLogo from "@/components/shared/QSLogo";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <QSLogo variant="mark" size="xl" />
      <p className="mt-10 text-[11px] uppercase tracking-[0.2em] text-destructive">
        Something broke
      </p>
      <h1 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">
        We couldn&apos;t render this view.
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        An unexpected error occurred. The team has been notified — try again or head
        back home.
      </p>
      <button
        onClick={reset}
        className="mt-8 inline-flex h-11 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
      >
        Try again
      </button>
    </div>
  );
}
