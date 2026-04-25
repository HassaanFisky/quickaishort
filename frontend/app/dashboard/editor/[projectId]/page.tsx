"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTimelineStore } from "@/lib/editor/timeline-state";
import { createClient } from "@/lib/supabase/client";
import { Toolbar } from "@/components/editor/Toolbar";
import { VideoPlayer } from "@/components/editor/VideoPlayer";
import { Timeline } from "@/components/editor/Timeline";
import { useKeyboardShortcuts } from "@/lib/editor/use-keyboard-shortcuts";
import { Loader2, AlertCircle, ChevronLeft, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function EditorPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();
  const supabase = createClient();
  const {
    setProjectId,
    setProjectTitle,
    setDuration,
    isDirty,
    save,
    projectTitle,
  } = useTimelineStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useKeyboardShortcuts();

  useEffect(() => {
    if (!projectId) return;

    const fetchProject = async () => {
      setIsLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          router.push("/login");
          return;
        }

        const apiUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const res = await fetch(`${apiUrl}/api/projects/${projectId}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!res.ok) {
          throw new Error("Failed to load project");
        }

        const project = await res.json();
        setProjectId(project.id);
        setProjectTitle(project.title);
        setDuration(project.duration || 60);

        if (project.timelineData) {
          useTimelineStore.setState({
            clips: project.timelineData.clips || [],
            textLayers: project.timelineData.textLayers || [],
          });
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to load project";
        console.error(err);
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (isDirty) void save();
    }, 30000);
    return () => clearInterval(timer);
  }, [isDirty, save]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 text-neutral-400">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
        <p className="text-sm font-bold tracking-widest uppercase opacity-80 animate-pulse">
          Initializing Studio...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 text-neutral-400">
        <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl flex flex-col items-center gap-4 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-sm">{error}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard")}
          className="border-neutral-800 text-neutral-300"
        >
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col overflow-hidden font-sans">
      <header className="flex items-center justify-between px-6 py-3 border-b border-neutral-900 bg-black/50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-neutral-800 rounded-lg text-neutral-500"
            onClick={() => router.push("/dashboard")}
          >
            <ChevronLeft size={20} />
          </Button>
          <div className="h-6 w-px bg-neutral-800" />
          <h1 className="font-bold text-sm tracking-tight">{projectTitle}</h1>
          {isDirty && (
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 uppercase tracking-widest bg-neutral-900 px-3 py-1.5 rounded-lg border border-neutral-800 shadow-inner">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
            Local Engine: Active
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-neutral-800 text-neutral-500"
          >
            <Settings2 size={18} />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-none p-6 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <VideoPlayer />

          <div className="flex flex-col gap-6 h-full">
            <Toolbar />
            <div className="flex-1 p-6 bg-neutral-900/40 rounded-2xl border border-neutral-800 border-dashed flex items-center justify-center text-center">
              <div className="max-w-[240px] space-y-2">
                <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                  Properties Inspector
                </p>
                <p className="text-[10px] text-neutral-600">
                  Select a clip or text layer on the timeline to modify
                  properties.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-[300px] flex flex-col overflow-hidden">
          <Timeline />
        </div>
      </div>
    </div>
  );
}
