"use client";

import Link from "next/link";
import { Download, Clock } from "lucide-react";
import { motion } from "framer-motion";
import type { ExportRecord } from "@/types/models";
import { buildExportDownloadUrl } from "@/lib/api";

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface ActivityFeedProps {
  exports: ExportRecord[];
}

/**
 * Derived from real export history (the only user-action data this app
 * currently persists) rather than a synthetic activity log — see Phase 43
 * commit notes for why a dedicated /api/activity endpoint was skipped.
 */
export function ActivityFeed({ exports }: ActivityFeedProps) {
  const recent = exports.slice(0, 10);

  if (recent.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground py-6 text-center">
        No activity yet — export a clip to see it here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-white/[0.05]">
      {recent.map((exp, i) => {
        const title = exp.output?.filename ?? `Export ${exp.clipId.slice(0, 6)}`;
        const url = exp.downloadUrl ? buildExportDownloadUrl(exp.downloadUrl) : null;
        const when = relativeTime(new Date(exp.createdAt));
        return (
          <motion.li
            key={exp._id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="py-3 first:pt-0 last:pb-0"
          >
            {url ? (
              <Link
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 hover:text-primary transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Download className="w-3 h-3 text-primary" aria-hidden="true" />
                </div>
                <span className="text-[13px] font-medium text-foreground/85 group-hover:text-primary truncate flex-1">
                  Exported &ldquo;{title}&rdquo;
                </span>
                <span className="text-[11px] text-muted-foreground/60 shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  {when}
                </span>
              </Link>
            ) : (
              <div className="flex items-center gap-3 opacity-60">
                <div className="w-7 h-7 rounded-lg bg-foreground/5 border border-foreground/10 flex items-center justify-center shrink-0">
                  <Download className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                </div>
                <span className="text-[13px] font-medium text-foreground/85 truncate flex-1">
                  Exported &ldquo;{title}&rdquo;
                </span>
                <span className="text-[11px] text-muted-foreground/60 shrink-0">{when}</span>
              </div>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}
