"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Plus,
  FolderOpen,
  Zap,
  TrendingUp,
  Clock,
  ChevronRight,
  Sparkles,
  LayoutGrid,
  Upload,
  Search,
} from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useVideoThumbnail } from "@/hooks/useVideoThumbnail";
import { useAIPanel } from "@/stores/aiPanelStore";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { GlowButton } from "@/components/ui/GlowButton";
import { CreditsLowBanner } from "@/components/shared/CreditsLowBanner";
import { InlineError } from "@/components/shared/InlineError";
import { EmptyState } from "@/components/shared/EmptyState";
import { AIPanel } from "@/components/ai/AIPanel";
import { spring } from "@/lib/animations";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { UsageStatsCard } from "@/components/dashboard/UsageStatsCard";
import type { ExportRecord } from "@/types/models";
import { buildExportDownloadUrl } from "@/lib/api";

const CREDITS_LOW_THRESHOLD = 10;

type QualityFilter = "all" | ExportRecord["settings"]["quality"];
type SortMode = "recent" | "duration";

function StatCard({
  label,
  value,
  loading,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  loading: boolean;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="stat-glow-wrapper">
      {/* Ambient rotating neon glow — stays behind the card */}
      <div className="stat-card-glow-ring" aria-hidden="true" />

      <motion.article
        whileHover={{ y: -3 }}
        transition={spring.smooth}
        aria-label={`${label}: ${loading ? "loading" : value}`}
        aria-busy={loading}
        className="relative group rounded-2xl border border-white/[0.06] bg-[hsl(var(--bg-subtle))]/80 p-5 overflow-hidden spring-hover"
      >
        <div className={cn("absolute -top-10 -right-10 w-28 h-28 blur-[70px] opacity-[0.18] rounded-full pointer-events-none", color)} aria-hidden="true" />

        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-muted-foreground group-hover:text-foreground transition-colors duration-[160ms]">
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </span>
        </div>

        {loading ? (
          <div className="h-8 w-20 rounded-lg bg-white/[0.06] animate-pulse" aria-hidden="true" />
        ) : (
          <span className="text-[2rem] font-black tracking-tight font-mono tabular-nums leading-none">
            {value}
          </span>
        )}
      </motion.article>
    </div>
  );
}

function ExportCard({ record, index }: { record: ExportRecord; index: number }) {
  const date = new Date(record.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const title = record.output?.filename ?? `Export ${record.clipId.slice(0, 6)}`;
  const downloadUrl = record.downloadUrl ? buildExportDownloadUrl(record.downloadUrl) : null;
  const thumbnail = useVideoThumbnail(downloadUrl);
  const durationLabel = record.output?.duration ? `${Math.round(record.output.duration)}s` : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Link
        href={downloadUrl ?? "/history"}
        target={downloadUrl ? "_blank" : undefined}
        rel={downloadUrl ? "noopener noreferrer" : undefined}
        className="group block relative rounded-2xl border border-white/[0.06] bg-[hsl(var(--bg-subtle))]/60 overflow-hidden spring-hover hover:border-primary/20"
      >
        <div className="aspect-video w-full relative overflow-hidden bg-zinc-900">
          {thumbnail ? (
            <img src={thumbnail} alt={title} className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700" />
          ) : (
             <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center">
                <LayoutGrid className="w-8 h-8 text-white/5" />
             </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-60" />

          <div className="absolute top-3 right-3 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider border bg-zinc-500/20 text-zinc-300 border-zinc-500/30">
            {record.settings.quality}
          </div>
        </div>

        <div className="p-5">
          <h3 className="text-sm font-black truncate text-foreground/90 group-hover:text-foreground transition-colors mb-2">
            {title}
          </h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground/60">
              <Clock className="w-3 h-3" />
              <span>{date}</span>
              {durationLabel && <span>· {durationLabel}</span>}
            </div>
            <div className="p-1.5 rounded-full bg-foreground/5 opacity-0 group-hover:opacity-100 transition-all">
              <ChevronRight className="w-3 h-3 text-primary" />
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function DashboardEmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <EmptyState
        icon={FolderOpen}
        title="No exports yet"
        body="Drop a YouTube URL into the editor to start your first viral sequence. AI-powered editing, 100+ features, export in seconds."
        actionLabel="Create First Project"
        actionHref="/editor"
        actionIcon={<Plus className="w-5 h-5" aria-hidden="true" />}
        tone="gradient"
        size="lg"
      />
    </motion.div>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? session?.user?.email ?? null;

  const { stats, isReady, error } = useDashboardStats({ userId });
  const { isOpen: aiPanelOpen, setOpen: setAIPanelOpen, setVideoContext } = useAIPanel();

  const [exports, setExports] = useState<ExportRecord[] | null>(null);
  const [exportsError, setExportsError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  // Dashboard shows the general assistant — clear any video context from the editor
  useEffect(() => {
    setVideoContext(null);
  }, [setVideoContext]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/exports")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: ExportRecord[]) => {
        if (!cancelled) {
          setExports(Array.isArray(data) ? data : []);
          setExportsError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExports([]);
          setExportsError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const exportsLoading = exports === null;
  const exportCount = exports?.length ?? null;

  const visibleExports = useMemo(() => {
    if (!exports) return [];
    const q = searchQuery.trim().toLowerCase();
    return exports
      .filter((e) => qualityFilter === "all" || e.settings.quality === qualityFilter)
      .filter((e) => {
        if (!q) return true;
        const title = (e.output?.filename ?? e.clipId).toLowerCase();
        return title.includes(q);
      })
      .sort((a, b) => {
        if (sortMode === "duration") {
          return (b.output?.duration ?? 0) - (a.output?.duration ?? 0);
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [exports, searchQuery, qualityFilter, sortMode]);

  return (
    <div className="max-w-7xl mx-auto space-y-12 py-8 px-4 relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Studio</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight flex items-baseline gap-3 flex-wrap">
            Welcome back,{" "}
            <span className="brand-gradient-text">{session?.user?.name?.split(" ")[0] ?? "Creator"}</span>
            {session?.user?.isPro && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                PRO
              </span>
            )}
          </h1>
          <p className="text-[13px] text-muted-foreground">Your studio is ready.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <GlowButton variant="glass" size="lg" asChild className="h-12 px-6 rounded-2xl text-sm font-bold">
            <Link href="/editor">
              <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
              Import Video
            </Link>
          </GlowButton>
          <GlowButton variant="gradient" size="lg" asChild className="h-12 px-7 rounded-2xl text-sm font-bold">
            <Link href="/editor">
              <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
              New Project
            </Link>
          </GlowButton>
        </div>
      </div>

      {/* Stats row */}
      <section aria-label="Account summary" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Total Projects"
          value={stats.total_projects}
          loading={!isReady}
          icon={FolderOpen}
          color="bg-blue-500"
        />
        <StatCard
          label="Viral Scans"
          value={stats.ai_runs}
          loading={!isReady}
          icon={Zap}
          color="bg-purple-500"
        />
        <StatCard
          label="Exports"
          value={exportCount ?? stats.export_count}
          loading={exportsLoading && !isReady}
          icon={TrendingUp}
          color="bg-pink-500"
        />
        <StatCard
          label="Credits"
          value={stats.credits_balance}
          loading={!isReady}
          icon={Zap}
          color="bg-emerald-500"
        />
      </section>

      {/* Credits-low banner — only after stats load without error and balance is actually low */}
      {isReady && !error && stats.credits_balance <= CREDITS_LOW_THRESHOLD && stats.credits_balance > 0 && (
        <CreditsLowBanner credits={stats.credits_balance} />
      )}

      {/* Non-blocking stats-sync error — surfaced when the hook reports an error reaching the stats service */}
      {isReady && error && (
        <InlineError
          title="Stats are catching up"
          body="We couldn't reach the stats service. Your projects are still here, and values will update automatically."
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent exports */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-base font-bold text-foreground/80">Recent Exports</h2>
            </div>
            <Link
              href="/history"
              className="group flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors duration-[160ms]"
            >
              All history <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-[160ms]" />
            </Link>
          </div>

          {/* Search + sort + quality filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search exports…"
                aria-label="Search exports by filename"
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-foreground/[0.03] border border-foreground/5 text-[12px] font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40 transition-colors"
              />
            </div>
            <div className="flex gap-1 p-1 bg-foreground/[0.03] rounded-xl border border-foreground/5">
              {(["all", "low", "medium", "high"] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => setQualityFilter(q)}
                  className={cn(
                    "h-7 px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors capitalize",
                    qualityFilter === q ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              aria-label="Sort exports"
              className="h-9 px-3 rounded-xl bg-foreground/[0.03] border border-foreground/5 text-[12px] font-medium text-foreground focus:outline-none focus:border-primary/40 transition-colors"
            >
              <option value="recent">Most recent</option>
              <option value="duration">Longest first</option>
            </select>
          </div>

          {exportsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {[1, 2].map(i => (
                <div key={i} className="rounded-[2.5rem] border border-foreground/5 bg-secondary/20 overflow-hidden h-[240px] animate-pulse" />
              ))}
            </div>
          ) : exportsError ? (
            <InlineError
              title="Couldn't load exports"
              body="There was a problem reaching the exports service. Please refresh the page to try again."
            />
          ) : visibleExports.length === 0 ? (
            <DashboardEmptyState />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {visibleExports.slice(0, 6).map((record, i) => (
                <ExportCard key={record._id} record={record} index={i} />
              ))}
            </div>
          )}
        </div>

        {/* Usage + activity sidebar */}
        <div className="space-y-6">
          <UsageStatsCard stats={stats} loading={!isReady} />
          <div className="rounded-2xl border border-white/[0.06] bg-[hsl(var(--bg-subtle))]/80 p-6">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground block mb-4">
              Recent Activity
            </span>
            <ActivityFeed exports={exports ?? []} />
          </div>
        </div>
      </div>

      {/* Floating AI assistant button — bottom-right */}
      {!aiPanelOpen && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 20 }}
          onClick={() => setAIPanelOpen(true)}
          title="Open AI Assistant"
          className="fixed bottom-8 right-8 z-30 h-12 w-12 rounded-2xl
                     bg-[hsl(var(--accent-indigo))] text-[hsl(var(--accent-fg))]
                     flex items-center justify-center shadow-2xl
                     hover:bg-[hsl(var(--accent-hover))] transition-colors"
        >
          <Sparkles size={18} />
        </motion.button>
      )}

      {/* General-purpose AI assistant panel */}
      <AIPanel />
    </div>
  );
}
