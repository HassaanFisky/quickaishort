"use client";

import Link from "next/link";
import { Zap, Sparkles, FolderOpen, TrendingUp } from "lucide-react";
import { GlowButton } from "@/components/ui/GlowButton";
import type { UserStats } from "@/types/stats";
import { useState, useEffect } from "react";

interface UsageStatsCardProps {
  stats: UserStats;
  loading: boolean;
}

/**
 * Shows real lifetime totals from UserStats (Firestore-backed, fastapi/models/user_stats.py).
 * The backend does not track monthly-reset quotas today, so this intentionally
 * shows cumulative counts + credit balance rather than fabricated "X / Y this month"
 * progress bars — see Phase 43 commit notes.
 */
export function UsageStatsCard({ stats, loading }: UsageStatsCardProps) {
  const [referralCredits, setReferralCredits] = useState<number | null>(null);
  const [refLoading, setRefLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/account/credits")
      .then((r) => r.json())
      .then((data) => {
        if (active) {
          setReferralCredits(data.credits || 0);
          setRefLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setReferralCredits(0);
          setRefLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const rows = [
    { label: "Projects", value: stats.total_projects, icon: FolderOpen },
    { label: "Exports", value: stats.export_count, icon: TrendingUp },
    { label: "AI / Pre-Flight runs", value: stats.ai_runs, icon: Sparkles },
  ];

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[hsl(var(--bg-subtle))]/80 p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Account Usage
        </span>
        <span
          className={
            stats.is_pro
              ? "text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20"
              : "text-[10px] font-bold px-2 py-0.5 rounded-md bg-foreground/5 text-muted-foreground border border-foreground/10"
          }
        >
          {stats.is_pro ? "PRO" : "FREE"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">Base credits</p>
            {loading ? (
              <div className="h-5 w-12 rounded bg-white/[0.06] animate-pulse mt-0.5" />
            ) : (
              <p className="text-lg font-black tabular-nums leading-none">{stats.credits_balance}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/[0.06] border border-primary/15">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">Referral credits</p>
            {refLoading ? (
              <div className="h-5 w-12 rounded bg-white/[0.06] animate-pulse mt-0.5" />
            ) : (
              <p className="text-lg font-black tabular-nums leading-none">{referralCredits}</p>
            )}
          </div>
        </div>
      </div>


      <div className="grid grid-cols-3 gap-3">
        {rows.map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex flex-col gap-1.5">
            <Icon className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            {loading ? (
              <div className="h-5 w-8 rounded bg-white/[0.06] animate-pulse" />
            ) : (
              <span className="text-base font-black tabular-nums">{value}</span>
            )}
            <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
          </div>
        ))}
      </div>

      {!stats.is_pro && (
        <GlowButton variant="gradient" size="sm" asChild className="w-full h-10 rounded-xl text-[12px] font-bold">
          <Link href="/pricing">Upgrade to Pro</Link>
        </GlowButton>
      )}
    </div>
  );
}
