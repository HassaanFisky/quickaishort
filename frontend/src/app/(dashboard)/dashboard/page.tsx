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
  BarChart3, 
  ChevronRight,
  Sparkles,
  Search,
  LayoutGrid
} from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

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
  icon: any;
  color: string;
}) {
  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="relative group rounded-3xl border border-foreground/5 bg-secondary/20 p-6 backdrop-blur-xl overflow-hidden"
    >
      <div className={cn("absolute -top-12 -right-12 w-32 h-32 blur-[80px] opacity-20 rounded-full transition-colors", color)} />
      
      <div className="flex items-center gap-3 mb-4">
        <div className={cn("p-2 rounded-xl bg-foreground/5 border border-foreground/5 text-muted-foreground group-hover:text-foreground transition-colors")}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground group-hover:text-foreground/80 transition-colors">
          {label}
        </span>
      </div>

      <div className="flex items-end justify-between">
        {loading ? (
          <div className="h-9 w-24 rounded-lg bg-foreground/10 animate-pulse" />
        ) : (
          <span className="text-3xl font-black tracking-tighter">{value}</span>
        )}
        <div className="text-[10px] font-bold text-muted-foreground/40 bg-foreground/5 px-2 py-1 rounded-md">
          +12%
        </div>
      </div>
    </motion.div>
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
        className="group block relative rounded-3xl border border-foreground/5 bg-secondary/30 overflow-hidden transition-all duration-300 hover:border-primary/30 hover:bg-secondary/50 shadow-sm hover:shadow-2xl hover:shadow-primary/5"
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
              "absolute top-4 right-4 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest border",
              score >= 90 ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white border-transparent" : viralScoreColor(score)
            )}>
              {score} Score
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

function EmptyState() {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-[2.5rem] border border-dashed border-foreground/10 bg-secondary/10 p-20 text-center relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.03),transparent_70%)]" />
      <div className="relative z-10">
        <div className="w-20 h-20 rounded-3xl bg-secondary/40 border border-foreground/5 flex items-center justify-center mx-auto mb-6 shadow-2xl">
          <FolderOpen className="w-8 h-8 text-muted-foreground/40" />
        </div>
        <h3 className="text-2xl font-black tracking-tight mb-2">No projects active</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-8">
          The studio is quiet. Drop a YouTube URL into the intelligent editor to start your first viral sequence.
        </p>
        <Link
          href="/editor"
          className="inline-flex h-14 items-center rounded-2xl px-8 text-sm font-black text-white transition hover:brightness-110 shadow-xl"
          style={{
            background: "linear-gradient(135deg, #3b82f6 0%, #a855f7 60%, #ec4899 100%)",
          }}
        >
          <Plus className="w-5 h-5 mr-3" />
          Create First Project
        </Link>
      </div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? session?.user?.email ?? null;

  const { stats, isReady } = useDashboardStats({ userId });

  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [exportCount, setExportCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ProjectRecord[]) => {
        if (!cancelled) setProjects(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
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
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Creator Intelligence</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter leading-none">
            Welcome back, <span className="premium-gradient-text">{session?.user?.name?.split(' ')[0] ?? 'Creator'}</span>
          </h1>
          <p className="text-muted-foreground font-medium">Your studio is optimized and ready for deployment.</p>
        </div>
        
        <div className="flex items-center gap-3">
           <div className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-2xl bg-secondary/40 border border-foreground/5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">ADK Pipeline Active</span>
           </div>
           <Link
            href="/editor"
            className="inline-flex h-14 items-center rounded-2xl px-8 text-sm font-black text-white transition hover:scale-[1.02] active:scale-[0.98] shadow-2xl shadow-primary/20"
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #a855f7 60%, #ec4899 100%)",
            }}
          >
            <Plus className="w-5 h-5 mr-3" />
            New Intelligence
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
          label="High-Res Exports"
          value={exportCount ?? stats.export_count}
          loading={projectsLoading && !isReady}
          icon={TrendingUp}
          color="bg-pink-500"
        />
        <StatCard
          label="AI Credits Used"
          value={stats.ai_runs * 30}
          loading={!isReady}
          icon={BarChart3}
          color="bg-emerald-500"
        />
      </div>

      {/* Recent projects */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="p-2 rounded-lg bg-secondary/40">
                <Clock className="w-4 h-4 text-muted-foreground" />
             </div>
             <h2 className="text-lg font-black uppercase tracking-widest text-foreground/90">
               Recent Intelligence
             </h2>
          </div>
          <Link
            href="/history"
            className="group flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
          >
            Studio History <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {projectsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-[2.5rem] border border-foreground/5 bg-secondary/20 overflow-hidden h-[240px] animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState />
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
