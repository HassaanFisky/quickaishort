"use client";

import dynamic from "next/dynamic";
import { Megaphone } from "lucide-react";

const ComingSoonGate = dynamic(
  () =>
    import("@/components/shared/ComingSoonGate").then((m) => m.ComingSoonGate),
  { ssr: false, loading: () => <div className="min-h-[40vh] animate-pulse rounded-2xl bg-white/[0.03]" /> },
);

/** EP-008 — Ads remains visible but unavailable (Coming Soon). */
export default function AdsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <div className="mb-6 flex items-center gap-2 text-muted-foreground">
        <Megaphone className="h-4 w-4" aria-hidden />
        <span className="text-[10px] font-black uppercase tracking-[0.2em]">
          Ads
        </span>
      </div>
      <ComingSoonGate
        title="Ads Studio"
        description="Campaign-ready short ads and creative kits — launching soon. Editing and Pre-Flight stay fully available in the Editor."
      />
    </div>
  );
}
