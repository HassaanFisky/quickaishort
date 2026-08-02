"use client";

import Link from "next/link";
import { History, Video, Calendar, Download, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import axios from "axios";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ExportRecord } from "@/types/models";
import { buildExportDownloadUrl } from "@/lib/api";
import { containerVariants, itemVariants } from "@/lib/animations";
import { EmptyState } from "@/components/shared/EmptyState";
import { InlineError } from "@/components/shared/InlineError";

export default function HistoryPage() {
  const queryClient = useQueryClient();

  const { data: exports, isLoading, isError } = useQuery<ExportRecord[]>({
    queryKey: ["exports"],
    queryFn: async () => {
      const res = await axios.get("/api/exports");
      return res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`/api/exports/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exports"] });
      toast.success("Export deleted.");
    },
    onError: () => {
      toast.error("Couldn't delete this export. Try again in a moment.");
    },
  });

  const handleDownload = (exp: ExportRecord) => {
    const url = exp.downloadUrl ? buildExportDownloadUrl(exp.downloadUrl) : null;
    if (!url) {
      toast.error("Download link expired. Re-export from the editor to generate a new file.");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = exp.output?.filename ?? `quickai-short-${exp._id}.mp4`;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (isLoading)
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <LoadingSpinner size={40} />
      </div>
    );

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold text-[hsl(var(--fg))]">Recent exports</h1>
        <p className="text-[13px] text-[hsl(var(--fg-subtle))]">
          Download finished shorts or remove old exports.
        </p>
      </header>

      {isError && (
        <InlineError
          title="Exports couldn't load"
          body="Check your connection and refresh. Your editor projects are unaffected."
        />
      )}

      {!isError && exports && exports.length === 0 && (
        <EmptyState
          icon={History}
          title="No exports yet"
          body="Finish an edit in the workspace, then export a short to see it here."
          actionLabel="Start editing"
          actionHref="/editor"
          size="md"
        />
      )}

      {exports && exports.length > 0 && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {exports.map((exp) => (
            <motion.div key={exp._id} variants={itemVariants}>
              <Card className="overflow-hidden border-border bg-[hsl(var(--bg-subtle))]">
                <CardContent className="p-0">
                  <div className="aspect-video bg-[hsl(var(--bg-muted))] relative flex items-center justify-center">
                    <Video className="w-10 h-10 text-[hsl(var(--fg-subtle))]/40" aria-hidden />
                    <span className="absolute top-3 left-3 text-[10px] font-medium px-2 py-0.5 rounded-md bg-[hsl(var(--bg-base))]/80 border border-border">
                      {exp.settings?.aspectRatio || "9:16"} · {exp.settings?.quality}
                    </span>
                  </div>

                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="text-[13px] font-medium truncate" title={exp.output?.filename}>
                        {exp.output?.filename || `Export ${exp.clipId.slice(0, 6)}`}
                      </h3>
                      <div className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--fg-subtle))] mt-1">
                        <Calendar className="w-3 h-3" aria-hidden />
                        {format(new Date(exp.createdAt), "MMM d, yyyy · p")}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-9 text-[12px]"
                        onClick={() => handleDownload(exp)}
                        disabled={!exp.downloadUrl}
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" /> Download
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 text-[12px] text-red-400 hover:text-red-300"
                        onClick={() => {
                          if (confirm("Delete this export permanently?")) {
                            deleteMutation.mutate(exp._id);
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      <p className="text-[12px] text-[hsl(var(--fg-subtle))]">
        Need a saved project?{" "}
        <Link href="/projects" className="text-[hsl(var(--accent-indigo))] hover:underline">
          View all projects
        </Link>
      </p>
    </div>
  );
}
