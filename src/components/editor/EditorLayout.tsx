"use client";

import { useEditorStore } from "@/stores/editorStore";
import { useMediaPipeline } from "@/hooks/useMediaPipeline";
import React, { useState } from "react";
import type { DragEvent, ChangeEvent, KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GlowButton } from "@/components/ui/GlowButton";
import { Search, Loader2, Zap, Smartphone, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Components
import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import BottomDock from "./BottomDock";
import VideoCanvas from "./VideoCanvas";
import Sidebar from "@/components/layout/Sidebar";

export default function EditorLayout() {
  const { setSourceFile, setProcessing } = useEditorStore();
  const { runPipeline, status } = useMediaPipeline();
  const [urlInput, setUrlInput] = useState("");

  const isAnalysing = (
    ["analyzing", "loading", "transcribing"] as string[]
  ).includes(status || "");

  const handleAnalyze = async (file?: File) => {
    if (file) {
      const url = URL.createObjectURL(file);
      setSourceFile(file, url);
      await runPipeline();
    } else if (urlInput) {
      try {
        setProcessing(true, "loading");
        toast.info("Connecting to Viral Intelligence Engine...");
        
        // 1. Get info
        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const infoRes = await fetch(`${API_URL}/api/info?url=${encodeURIComponent(urlInput)}`);
        if (!infoRes.ok) throw new Error("Could not retrieve video info");
        const info = await infoRes.json();
        
        toast.success(`Found: ${info.title}`);
        
        // 2. Set source to proxy URL
        const proxyUrl = `${API_URL}/api/proxy?url=${encodeURIComponent(urlInput)}`;
        
        // We use a custom action to set URL since sourceFile is null
        useEditorStore.setState({ 
          sourceUrl: proxyUrl, 
          sourceFile: null,
          currentStage: "loading" 
        });
        
        await runPipeline();
      } catch (error) {
        console.error(error);
        toast.error("Failed to fetch video. Ensure Python engine is running.");
        setProcessing(false, "idle");
      }
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith("video/")) {
        handleAnalyze(file);
      } else {
        toast.error("Please upload a video file");
      }
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="relative h-screen w-full overflow-hidden bg-[#030303] flex flex-col items-center p-6 pl-4 md:pl-28 pb-32 md:pb-8 selection:bg-primary/30"
    >
      {/* Immersive Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(33,150,243,0.03),transparent_70%)] pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-white/10 to-transparent shadow-[0_1px_20px_rgba(255,255,255,0.05)]" />

      <Sidebar />

      {/* Main Content Area */}
      <div className="relative z-10 w-full h-full flex flex-col gap-6 max-w-[1800px] mx-auto">
        {/* Header/Title Area */}
        <div className="flex items-center justify-between px-2">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black tracking-widest uppercase">
                Studio V1
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground/90">
              &lsquo;Nano&rsquo; Video Editor Dashboard
            </h1>
            <p className="text-xs text-muted-foreground/60 font-medium">
              Studio V1
            </p>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-[#030303] bg-muted/20 flex items-center justify-center overflow-hidden">
                    <div className="w-full h-full bg-linear-to-br from-primary/20 to-purple-500/20" />
                  </div>
                ))}
             </div>
             <GlowButton variant="glass" size="sm" className="rounded-xl h-9 px-4 font-bold text-xs border-white/5">
                Share
             </GlowButton>
          </div>
        </div>

        {/* Workspace Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-6 overflow-hidden">
          {/* Left Panel */}
          <div className="nano-glass rounded-[2rem] p-5 border-white/5 shadow-2xl flex flex-col overflow-hidden">
            <LeftPanel />
          </div>

          {/* Center Stage */}
          <div className="relative flex flex-col items-center justify-center">
            {/* Search Island - Floating */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg px-4">
              <motion.div 
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="nano-glass rounded-2xl p-1.5 flex flex-col gap-1 border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
              >
                <div className="text-[10px] font-bold text-center text-muted-foreground/40 uppercase tracking-widest pt-1">
                  YouTube URL or Local File
                </div>
                <div className="flex items-center gap-2 p-1">
                  <div className="relative flex-1 group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
                    <input
                      type="text"
                      placeholder="Paste YouTube URL or drop a video file..."
                      className="bg-transparent border-none outline-none text-sm w-full text-foreground placeholder:text-muted-foreground/30 h-10 pl-10 pr-4 font-medium"
                      value={urlInput}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setUrlInput(e.target.value)
                      }
                      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) =>
                        e.key === "Enter" && handleAnalyze()
                      }
                    />
                  </div>
                  <GlowButton
                    variant="premium"
                    size="sm"
                    className="rounded-xl h-10 px-6 font-bold text-xs"
                    onClick={() => handleAnalyze()}
                    disabled={isAnalysing}
                  >
                    {isAnalysing ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="capitalize">{status}...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5" />
                        Initialize AI
                      </div>
                    )}
                  </GlowButton>
                </div>
              </motion.div>
            </div>

            <div className="w-full h-full flex items-center justify-center rounded-[2.5rem] overflow-hidden bg-[#0a0a0a] border border-white/5 relative group">
              <div className="absolute inset-0 bg-primary/5 blur-[100px] opacity-20 group-hover:opacity-40 transition-opacity duration-1000" />
              <VideoCanvas />
              
              {/* Overlay Playback Controls Mock */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 nano-glass rounded-full border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                 <Zap className="w-4 h-4 text-primary fill-primary" />
                 <span className="text-[10px] font-black text-foreground/60 uppercase tracking-[0.2em]">Live Engine</span>
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className="nano-glass rounded-[2rem] p-5 border-white/5 shadow-2xl flex flex-col overflow-hidden">
            <RightPanel />
          </div>
        </div>

        {/* Bottom Timeline Area */}
        <div className="h-44 nano-glass rounded-[2.5rem] p-5 border-white/5 shadow-2xl flex flex-col overflow-hidden">
          <BottomDock />
        </div>
      </div>

      {/* Floating Action Menu (Mocks for extra premium feel) */}
      <div className="fixed right-8 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-40 hidden 2xl:flex">
         {[Smartphone, Zap, Sparkles].map((Icon, i) => (
           <div key={i} className="w-12 h-12 rounded-2xl nano-glass border-white/5 flex items-center justify-center hover:border-primary/40 hover:scale-110 transition-all cursor-pointer group">
              <Icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
           </div>
         ))}
      </div>
    </div>
  );
}
