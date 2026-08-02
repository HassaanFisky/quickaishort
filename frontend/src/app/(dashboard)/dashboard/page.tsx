"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Clock, ChevronRight } from "lucide-react";
import {
  WorkspaceComposer,
  type WorkspaceComposerSubmit,
} from "@/components/workspace/WorkspaceComposer";
import { InlineError } from "@/components/shared/InlineError";
import type { ExportRecord } from "@/types/models";
import { formatDistanceToNow } from "date-fns";

const WORKSPACE_BOOT_KEY = "qai:workspace-boot";

export interface WorkspaceBootPayload {
  prompt?: string;
  url?: string;
  fileNames?: string[];
}

function persistWorkspaceBoot(payload: WorkspaceBootPayload) {
  try {
    sessionStorage.setItem(WORKSPACE_BOOT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

function RecentProjectRow({ record }: { record: ExportRecord }) {
  const title = record.output?.filename ?? `Edit ${record.clipId.slice(0, 6)}`;
  const when = formatDistanceToNow(new Date(record.createdAt), { addSuffix: true });

  return (
    <Link
      href="/editor"
      className="flex items-center gap-3 rounded-xl border border-border bg-[hsl(var(--bg-subtle))] px-3 py-2.5 hover:border-[hsl(var(--accent-indigo))]/30 transition-colors group"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium truncate text-[hsl(var(--fg))]">{title}</p>
        <p className="text-[11px] text-[hsl(var(--fg-subtle))]">
          {when} · {record.settings.quality} · {record.settings.aspectRatio}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-[hsl(var(--fg-subtle))] group-hover:text-[hsl(var(--accent-indigo))]" />
    </Link>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [exports, setExports] = useState<ExportRecord[] | null>(null);
  const [exportsError, setExportsError] = useState(false);
  const [booting, setBooting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/exports")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
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

  const handleStart = async ({ prompt, url, files }: WorkspaceComposerSubmit) => {
    setBooting(true);

    const payload: WorkspaceBootPayload = {
      prompt: prompt || undefined,
      url,
      fileNames: files.map((f) => f.file.name),
    };

    if (files.length > 0) {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f.file));
      try {
        sessionStorage.setItem("qai:workspace-files-ready", "1");
        (window as Window & { __qaiPendingFiles?: FileList }).__qaiPendingFiles = dt.files;
      } catch {
        /* fall through — URL-only still works */
      }
    }

    persistWorkspaceBoot(payload);
    router.push("/editor");
  };

  const recent = exports?.slice(0, 4) ?? [];

  return (
    <div className="flex flex-col items-center gap-10 py-4 sm:py-8">
      <header className="w-full max-w-2xl text-center space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[hsl(var(--fg))]">
          {session?.user?.name
            ? `What are we editing, ${session.user.name.split(" ")[0]}?`
            : "Start a new edit"}
        </h1>
      </header>

      <WorkspaceComposer busy={booting} disabled={booting} onSubmit={handleStart} />

      {exportsError && (
        <div className="w-full max-w-2xl">
          <InlineError
            title="Recent projects unavailable"
            body="We couldn't load your export history. You can still upload and edit — try refreshing if you need the list."
          />
        </div>
      )}

      {!exportsError && recent.length > 0 && (
        <section className="w-full max-w-2xl space-y-3" aria-label="Recent projects">
          <div className="flex items-center gap-2 text-[12px] font-medium text-[hsl(var(--fg-subtle))]">
            <Clock className="w-3.5 h-3.5" aria-hidden />
            Recent projects
          </div>
          <ul className="space-y-2">
            {recent.map((record) => (
              <li key={record._id}>
                <RecentProjectRow record={record} />
              </li>
            ))}
          </ul>
          <Link
            href="/history"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg))]"
          >
            View all <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </section>
      )}
    </div>
  );
}
