"use client";

import React from "react";
import { useEditorStore } from "@/stores/editorStore";
import { getModePack } from "@/lib/modepacks/modePacks";
import { cn } from "@/lib/utils";
import { ShieldCheck, Heart, MessageCircle, Share2, Music2, Code, Mic } from "lucide-react";

export function SafeZoneOverlay() {
  const safeZonesEnabled = useEditorStore((s) => s.safeZonesEnabled);
  const activeModePack = useEditorStore((s) => s.activeModePack);
  const exportSettings = useEditorStore((s) => s.exportSettings);

  if (!safeZonesEnabled) return null;

  const pack = getModePack(activeModePack);
  const { safeZone } = pack;

  const isShortForm = pack.aspectRatio === "9:16";
  const isLandscape = pack.aspectRatio === "16:9";

  return (
    <div
      className="absolute inset-0 pointer-events-none z-30 overflow-hidden"
      aria-hidden="true"
    >
      {/* Dimmed exclusion margins (top, bottom, left, right) */}
      <div
        className="absolute inset-x-0 top-0 bg-black/20 backdrop-blur-[0.5px] border-b border-white/10"
        style={{ height: `${safeZone.topPct}%` }}
      >
        <div className="absolute bottom-1 left-2 text-[8px] font-mono uppercase tracking-wider text-white/50">
          Top Header / Search UI
        </div>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 bg-black/20 backdrop-blur-[0.5px] border-t border-white/10"
        style={{ height: `${safeZone.bottomPct}%` }}
      >
        <div className="absolute top-1 left-2 text-[8px] font-mono uppercase tracking-wider text-white/50 flex items-center gap-1">
          {pack.id === "podcast_clip" ? (
            <>
              <Mic className="w-2.5 h-2.5" /> Waveform & Audiogram Safe Zone
            </>
          ) : (
            <>
              <Music2 className="w-2.5 h-2.5" /> Platform Caption & Audio Safe Area
            </>
          )}
        </div>
      </div>

      {isShortForm && (
        <div
          className="absolute top-0 bottom-0 right-0 bg-black/20 backdrop-blur-[0.5px] border-l border-white/10 flex flex-col items-center justify-center gap-4 py-8"
          style={{ width: `${safeZone.rightPct}%` }}
        >
          {/* Mock right-rail action buttons preview */}
          <div className="flex flex-col items-center gap-3 opacity-40">
            <div className="w-6 h-6 rounded-full border border-white/40 flex items-center justify-center">
              <Heart className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="w-6 h-6 rounded-full border border-white/40 flex items-center justify-center">
              <MessageCircle className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="w-6 h-6 rounded-full border border-white/40 flex items-center justify-center">
              <Share2 className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <span className="text-[7px] font-mono uppercase tracking-widest text-white/40 rotate-90 whitespace-nowrap mt-2">
            Action Rail
          </span>
        </div>
      )}

      {/* Main Safe Perimeter Box */}
      <div
        className={cn(
          "absolute transition-all duration-300 border-2 border-dashed border-primary/60 shadow-[0_0_15px_rgba(168,85,247,0.15)]",
          "rounded-lg"
        )}
        style={{
          top: `${safeZone.topPct}%`,
          bottom: `${safeZone.bottomPct}%`,
          left: `${safeZone.leftPct}%`,
          right: `${safeZone.rightPct}%`,
        }}
      >
        {/* Corner Reticles */}
        <span className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-primary" />
        <span className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-primary" />
        <span className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-primary" />
        <span className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-primary" />

        {/* Floating Safe-Zone Badge */}
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-primary/40 text-[9px] font-semibold text-primary shadow-lg">
          <ShieldCheck className="w-3 h-3 text-primary animate-pulse" />
          <span>{safeZone.label}</span>
          <span className="text-white/40">·</span>
          <span className="font-mono text-[8px] text-white/70">{pack.aspectRatio}</span>
        </div>

        {/* 16:9 Title Safe inner box for YouTube Longform and Tutorial */}
        {isLandscape && (
          <div
            className="absolute inset-[5%] border border-dotted border-white/30 rounded"
            title="Inner Title Safe (80%)"
          >
            <span className="absolute top-1 right-2 text-[7px] font-mono text-white/40 uppercase">
              Title Safe (80%)
            </span>
          </div>
        )}

        {/* Tutorial UI guide line */}
        {pack.id === "tutorial" && (
          <div className="absolute bottom-2 inset-x-4 flex items-center justify-center gap-1 text-[8px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 rounded py-0.5 px-2">
            <Code className="w-2.5 h-2.5" />
            <span>Terminal & Code Safe Margins</span>
          </div>
        )}
      </div>
    </div>
  );
}
export default SafeZoneOverlay;
