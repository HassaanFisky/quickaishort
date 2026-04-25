"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
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
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center space-y-4">
      <h2 className="text-2xl font-bold text-red-500">Something went wrong!</h2>
      <p className="text-zinc-400 max-w-md text-center">
        Don&apos;t worry, this error has been captured. Try refreshing or going
        back home.
      </p>
      <div className="flex gap-4">
        <Button onClick={() => reset()} variant="secondary">
          Try again
        </Button>
        <Button
          onClick={() => (window.location.href = "/")}
          variant="outline"
          className="border-zinc-800 text-zinc-300"
        >
          Go Home
        </Button>
      </div>
    </div>
  );
}
