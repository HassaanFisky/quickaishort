"use client";

import { useEffect, useState } from "react";
import { BarChart3, TrendingUp, Sparkles, Clock3, Target } from "lucide-react";
import { API_URL } from "@/lib/api";

interface AnalyticsSummary {
  days: number;
  total_exports: number;
  top_feature: string | null;
  ai_success_rate: number | null;
  avg_session_minutes: number | null;
  avg_preflight_score: number | null;
  sample_size: number;
}

const EMPTY: AnalyticsSummary = {
  days: 7,
  total_exports: 0,
  top_feature: null,
  ai_success_rate: null,
  avg_session_minutes: null,
  avg_preflight_score: null,
  sample_size: 0,
};

/**
 * Aggregate, anonymous product analytics (no per-user PII) — see
 * fastapi/routers/analytics.py. Shown to every user since events carry no
 * identity; this is product-wide usage insight, not a personal stat.
 */
export function AnalyticsSummaryCard() {
  const [summary, setSummary] = useState<AnalyticsSummary>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/analytics/summary?days=7`)
      .then((r) => (r.ok ? r.json() : EMPTY))
      .then((data: AnalyticsSummary) => { if (!cancelled) setSummary(data); })
      .catch(() => { if (!cancelled) setSummary(EMPTY); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const rows: { label: string; value: string; icon: typeof BarChart3 }[] = [
    { label: "Exports (7d)", value: String(summary.total_exports), icon: TrendingUp },
    { label: "Top feature", value: summary.top_feature ?? "—", icon: Sparkles },
    { label: "AI success rate", value: summary.ai_success_rate !== null ? `${summary.ai_success_rate}%` : "—", icon: Target },
    { label: "Avg session", value: summary.avg_session_minutes !== null ? `${summary.avg_session_minutes}m` : "—", icon: Clock3 },
  ];

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[hsl(var(--bg-subtle))]/80 p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Product Analytics — last {summary.days}d
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {rows.map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex flex-col gap-1.5">
            <Icon className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            {loading ? (
              <div className="h-5 w-12 rounded bg-white/[0.06] animate-pulse" />
            ) : (
              <span className="text-base font-black tabular-nums truncate" title={value}>{value}</span>
            )}
            <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
          </div>
        ))}
      </div>

      {!loading && summary.sample_size === 0 && (
        <p className="text-[11px] text-muted-foreground/70">No events recorded yet this period.</p>
      )}
    </div>
  );
}
