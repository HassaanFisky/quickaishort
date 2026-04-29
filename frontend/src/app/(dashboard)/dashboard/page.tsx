"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Plus, FolderOpen } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { cn } from "@/lib/utils";

interface ProjectRecord {
  _id: string;
  source?: { title?: string; url?: string; thumbnail?: string };
  status?: string;
  viralScore?: number;
  createdAt?: string;
}

function viralScoreColor(score: number): string {
  if (score >= 90) return "bg-gradient-to-r from-pink-500 to-purple-500 text-white";
  if (score >= 71) return "bg-purple-500/15 text-purple-400 border border-purple-500/30";
  if (score >= 41) return "bg-amber-500/15 text-amber-400 border border-amber-500/30";
  return "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30";
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | number;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-4">
      <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 h-8 flex items-end">
        {loading ? (
          <div className="h-7 w-16 rounded bg-foreground/10 animate-pulse" />
        ) : (
          <span className="text-2xl font-bold tracking-tight">{value}</span>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectRecord }) {
  const score = project.viralScore;
  const date = project.createdAt
    ? new Date(project.createdAt).toLocaleDateString()
    : "—";
  const title = project.source?.title || "Untitled project";

  return (
    <Link
      href={`/editor?project=${project._id}`}
      className="group rounded-lg border border-border bg-secondary/40 overflow-hidden transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40"
    >
      <div
        className="aspect-video w-full"
        style={{
          background:
            "linear-gradient(135deg, var(--bg-surface-2, #15151a) 0%, var(--bg-surface-3, #1a1a21) 100%)",
        }}
      />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold truncate flex-1">{title}</h3>
          {typeof score === "number" && (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                viralScoreColor(score),
              )}
            >
              {score}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{date}</p>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-12 text-center">
      <FolderOpen className="w-8 h-8 text-muted-foreground mx-auto" />
      <h3 className="mt-4 text-base font-semibold">No projects yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Drop a YouTube URL into the editor to get started.
      </p>
      <Link
        href="/editor"
        className="mt-6 inline-flex h-10 items-center rounded-xl px-5 text-sm font-semibold text-white transition hover:brightness-110"
        style={{
          background: "linear-gradient(135deg, #3b82f6 0%, #a855f7 60%, #ec4899 100%)",
        }}
      >
        <Plus className="w-4 h-4 mr-2" />
        Create your first
      </Link>
    </div>
  );
}

function ProjectSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 overflow-hidden">
      <div className="aspect-video w-full bg-foreground/5 animate-pulse" />
      <div className="p-4">
        <div className="h-4 w-3/4 rounded bg-foreground/10 animate-pulse" />
        <div className="mt-2 h-3 w-1/3 rounded bg-foreground/5 animate-pulse" />
      </div>
    </div>
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
  const exportsLoading = exportCount === null;

  return (
    <div className="space-y-8">
      {/* Header strip — minimal, no marketing */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Workspace
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Dashboard</h1>
        </div>
        <Link
          href="/editor"
          className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold text-white transition hover:brightness-110"
          style={{
            background: "linear-gradient(135deg, #3b82f6 0%, #a855f7 60%, #ec4899 100%)",
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          New project
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Projects"
          value={projects?.length ?? stats.total_projects}
          loading={projectsLoading && !isReady}
        />
        <StatCard
          label="AI Insights"
          value={stats.ai_runs}
          loading={!isReady}
        />
        <StatCard
          label="Exports"
          value={exportCount ?? stats.export_count}
          loading={exportsLoading && !isReady}
        />
        <StatCard
          label="Credits Used"
          value={stats.ai_runs}
          loading={!isReady}
        />
      </div>

      {/* Recent projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Recent projects
          </h2>
          <Link
            href="/history"
            className="text-xs font-semibold text-primary hover:underline"
          >
            View all
          </Link>
        </div>

        {projectsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <ProjectSkeleton />
            <ProjectSkeleton />
            <ProjectSkeleton />
          </div>
        ) : projects.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.slice(0, 6).map((p) => (
              <ProjectCard key={p._id} project={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
