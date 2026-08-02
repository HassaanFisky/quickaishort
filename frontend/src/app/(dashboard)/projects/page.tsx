"use client";

import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, MoreHorizontal, Pencil, Trash2, Copy, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import axios from "axios";
import { toast } from "sonner";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { InlineError } from "@/components/shared/InlineError";
import { EmptyState } from "@/components/shared/EmptyState";
import type { ExportRecord } from "@/types/models";
import { buildExportDownloadUrl } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface MongoProject {
  _id: string;
  status: "draft" | "analyzed" | "exported";
  source?: {
    filename?: string;
    url?: string;
    type?: string;
  };
  updatedAt?: string;
  createdAt?: string;
  clips?: unknown[];
}

function projectTitle(p: MongoProject): string {
  return (
    p.source?.filename ||
    (p.source?.url ? p.source.url.replace(/^https?:\/\//, "").slice(0, 48) : "") ||
    "Untitled project"
  );
}

function ProjectRow({
  title,
  meta,
  status,
  onOpen,
  onDelete,
}: {
  title: string;
  meta: string;
  status: string;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-[hsl(var(--bg-subtle))] px-3 py-3 sm:px-4">
      <div className="w-10 h-10 rounded-lg bg-[hsl(var(--bg-muted))] flex items-center justify-center shrink-0">
        <FolderOpen className="w-4 h-4 text-[hsl(var(--fg-subtle))]" aria-hidden />
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <p className="text-[13px] font-medium truncate text-[hsl(var(--fg))]">{title}</p>
        <p className="text-[11px] text-[hsl(var(--fg-subtle))]">{meta}</p>
      </button>
      <span className="hidden sm:inline text-[10px] font-medium capitalize text-[hsl(var(--fg-subtle))] px-2 py-0.5 rounded-md bg-[hsl(var(--bg-muted))]">
        {status}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Project actions">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onOpen}>
            <ChevronRight className="w-4 h-4 mr-2" /> Open
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Pencil className="w-4 h-4 mr-2" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Copy className="w-4 h-4 mr-2" /> Duplicate
          </DropdownMenuItem>
          {onDelete && (
            <DropdownMenuItem className="text-red-400" onClick={onDelete}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function ProjectsPage() {
  const queryClient = useQueryClient();

  const {
    data: projects,
    isLoading: projectsLoading,
    isError: projectsError,
  } = useQuery<MongoProject[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await axios.get("/api/projects");
      return res.data;
    },
  });

  const { data: exports } = useQuery<ExportRecord[]>({
    queryKey: ["exports"],
    queryFn: async () => {
      const res = await axios.get("/api/exports");
      return res.data;
    },
  });

  const deleteExport = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`/api/exports/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exports"] });
      toast.success("Export removed.");
    },
    onError: () => {
      toast.error("Couldn't delete this export. Try again in a moment.");
    },
  });

  if (projectsLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <LoadingSpinner size={40} />
      </div>
    );
  }

  const hasProjects = (projects?.length ?? 0) > 0;
  const hasExports = (exports?.length ?? 0) > 0;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold text-[hsl(var(--fg))]">Projects</h1>
        <p className="text-[13px] text-[hsl(var(--fg-subtle))]">
          Your edits and exported shorts in one place.
        </p>
      </header>

      {projectsError && (
        <InlineError
          title="Projects couldn't load"
          body="Check your connection and refresh. Your editor work is still saved locally until sync succeeds."
        />
      )}

      {!projectsError && !hasProjects && !hasExports && (
        <EmptyState
          icon={FolderOpen}
          title="No projects yet"
          body="Upload footage from the home workspace or start a new edit."
          actionLabel="New edit"
          actionHref="/editor"
          size="md"
        />
      )}

      {hasProjects && (
        <section className="space-y-3" aria-label="Saved projects">
          <h2 className="text-[12px] font-medium text-[hsl(var(--fg-subtle))]">Saved projects</h2>
          <ul className="space-y-2">
            {projects!.map((p) => {
              const updated = p.updatedAt || p.createdAt;
              const meta = [
                updated
                  ? formatDistanceToNow(new Date(updated), { addSuffix: true })
                  : "Recently",
                `${p.clips?.length ?? 0} clips`,
              ].join(" · ");
              return (
                <li key={p._id}>
                  <ProjectRow
                    title={projectTitle(p)}
                    meta={meta}
                    status={p.status}
                    onOpen={() => {
                      if (p.source?.url) {
                        try {
                          sessionStorage.setItem(
                            "qai:workspace-boot",
                            JSON.stringify({ url: p.source.url }),
                          );
                        } catch {
                          /* ignore */
                        }
                      }
                      window.location.href = "/editor";
                    }}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {hasExports && (
        <section className="space-y-3" aria-label="Exported shorts">
          <div className="flex items-center justify-between">
            <h2 className="text-[12px] font-medium text-[hsl(var(--fg-subtle))]">Exported shorts</h2>
            <Link href="/history" className="text-[12px] text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg))]">
              Full history
            </Link>
          </div>
          <ul className="space-y-2">
            {exports!.slice(0, 12).map((exp) => {
              const title = exp.output?.filename ?? `Export ${exp.clipId.slice(0, 6)}`;
              const meta = `${formatDistanceToNow(new Date(exp.createdAt), { addSuffix: true })} · ${exp.settings.quality}`;
              return (
                <li key={exp._id}>
                  <ProjectRow
                    title={title}
                    meta={meta}
                    status="exported"
                    onOpen={() => {
                      const url = exp.downloadUrl ? buildExportDownloadUrl(exp.downloadUrl) : null;
                      if (url) window.open(url, "_blank", "noopener,noreferrer");
                      else window.location.href = "/history";
                    }}
                    onDelete={() => {
                      if (confirm("Delete this export? This can't be undone.")) {
                        deleteExport.mutate(exp._id);
                      }
                    }}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
