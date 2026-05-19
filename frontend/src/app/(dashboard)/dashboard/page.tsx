"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { GlowButton } from "@/components/ui/GlowButton";
import { CreditsLowBanner } from "@/components/shared/CreditsLowBanner";
import { InlineError } from "@/components/shared/InlineError";
import { EmptyState } from "@/components/shared/EmptyState";
import { spring } from "@/lib/animations";

const CREDITS_LOW_THRESHOLD = 10;

interface ProjectRecord {
  _id: string;
  source?: { title?: string; url?: string; thumbnail?: string };
  status?: string;
  viralScore?: number;
  createdAt?: string;
}

function viralScoreColor(score: number): string {
  if (score >= 90) return "from-pink-500 to-purple-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.3)]";
  if (score >= 71) return "bg-purple-500/20 text-purple-400 border-purple-500/30";
  if (score >= 41) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
}

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
        className="relative group rounded-2xl border border-white/[0.06] bg-[#0c0c10]/80 p-5 overflow-hidden spring-hover"
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

function ProjectCard({ project, index }: { project: ProjectRecord; index: number }) {
  const score = project.viralScore;
  const date = project.createdAt
    ? new Date(project.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : "—";
  const title = project.source?.title || "Untitled Intelligence";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Link
        href={`/editor?project=${project._id}`}
        className="group block relative rounded-2xl border border-white/[0.06] bg-[#0c0c10]/60 overflow-hidden spring-hover hover:border-primary/20"
      >
        <div
          className="aspect-video w-full relative overflow-hidden bg-zinc-900"
        >
          {project.source?.thumbnail ? (
            <img src={project.source.thumbnail} alt={title} className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700" />
          ) : (
             <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center">
                <LayoutGrid className="w-8 h-8 text-white/5" />
             </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-60" />
          
          {typeof score === "number" && (
            <div className={cn(
              "absolute top-3 right-3 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider border",
              score >= 90
                ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white border-transparent shadow-[0_4px_16px_rgba(236,72,153,0.35)]"
                : viralScoreColor(score)
            )}>
              {score}
            </div>
          )}
        </div>
        
        <div className="p-5">
          <h3 className="text-sm font-black truncate text-foreground/90 group-hover:text-foreground transition-colors mb-2">
            {title}
          </h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground/60">
              <Clock className="w-3 h-3" />
              <span>{date}</span>
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
        title="No projects active"
        body="The studio is quiet. Drop a YouTube URL into the intelligent editor to start your first viral sequence."
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

  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [projectsError, setProjectsError] = useState(false);
  const [exportCount, setExportCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/projects")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: ProjectRecord[]) => {
        if (!cancelled) {
          setProjects(Array.isArray(data) ? data : []);
          setProjectsError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjects([]);
          setProjectsError(true);
        }
      });

    fetch("/api/exports")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown[]) => {
        if (!cancelled) setExportCount(Array.isArray(data) ? data.length : 0);
      })
      .catch(() => {
        if (!cancelled) setExportCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const projectsLoading = projects === null;

  return (
    <div className="max-w-7xl mx-auto space-y-12 py-8 px-4">
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
          value={projects?.length ?? stats.total_projects}
          loading={projectsLoading && !isReady}
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
          loading={projectsLoading && !isReady}
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

      {/* Recent projects */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-base font-bold text-foreground/80">Recent Projects</h2>
        </div>
        <Link
          href="/history"
          className="group flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors duration-[160ms]"
        >
          All history <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-[160ms]" />
        </Link>
        </div>

        {projectsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-[2.5rem] border border-foreground/5 bg-secondary/20 overflow-hidden h-[240px] animate-pulse" />
            ))}
          </div>
        ) : projectsError ? (
          <InlineError
            title="Couldn't load projects"
            body="There was a problem reaching the projects service. Please refresh the page to try again."
          />
        ) : projects.length === 0 ? (
          <DashboardEmptyState />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.slice(0, 6).map((p, i) => (
              <ProjectCard key={p._id} project={p} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
