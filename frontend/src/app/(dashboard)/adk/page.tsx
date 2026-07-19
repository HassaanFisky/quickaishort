"use client";

import dynamic from "next/dynamic";

const AdkComingSoonWorkspace = dynamic(
  () =>
    import("@/components/adk/AdkComingSoonWorkspace").then(
      (m) => m.AdkComingSoonWorkspace,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-white/[0.04]" />
      </div>
    ),
  },
);

/**
 * Google Agent Development Kit workspace — Coming Soon (EP-008 ADK correction).
 * Not an Ads / marketing page.
 */
export default function AdkPage() {
  return <AdkComingSoonWorkspace />;
}
