"use client";

import { useEditorStore } from "@/stores/editorStore";
import { useServerExport } from "@/hooks/useServerExport";
import { useSession } from "next-auth/react";
import { CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CheckCircle, Download, Rocket, ShieldCheck, Clock, Settings2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import type { ExportQuality } from "@/types/export";

export default function ExportPanel() {
  const {
    suggestions,
    selectedClipId,
    captionsEnabled,
    exportSettings,
    setExportSetting,
  } = useEditorStore();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? session?.user?.email ?? "anonymous";
  const { exportClip, isExporting, exportProgress } = useServerExport({ userId });
  const [exportComplete, setExportComplete] = useState(false);

  const selectedClip = suggestions.find((s) => s.id === selectedClipId);

  const handleExport = async () => {
    if (!selectedClip) {
      toast.error("Please select a clip to export");
      return;
    }
    setExportComplete(false);
    await exportClip({ quality: exportSettings.quality, captionsEnabled });
  };

  useEffect(() => {
    if (!isExporting && exportProgress === 100) {
      setExportComplete(true);
    }
  }, [isExporting, exportProgress]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-500">
      <div className="depth-card rounded-3xl overflow-hidden border border-foreground/5 shadow-2xl">
        <div className="bg-primary/5 p-5 border-b border-foreground/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Rocket className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
              Export Configuration
            </span>
          </div>
          {exportProgress > 0 && (
            <span className="text-[10px] font-black text-muted-foreground/60 bg-foreground/5 px-2 py-0.5 rounded-full tabular-nums">
              {exportProgress}%
            </span>
          )}
        </div>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-3">
            <Label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest pl-1">
              Output Format
            </Label>
            <Select
              value={exportSettings.format}
              onValueChange={(v) => setExportSetting("format", v as "mp4" | "webm")}
            >
              <SelectTrigger className="h-11 rounded-xl bg-foreground/5 border-foreground/5 focus:ring-primary/50 transition-all font-medium">
                <SelectValue placeholder="Format" />
              </SelectTrigger>
              <SelectContent className="glass-surface border-foreground/10 rounded-xl overflow-hidden">
                <SelectItem value="mp4">MP4 (H.264 + AAC)</SelectItem>
                <SelectItem value="webm">WebM (VP9 + Opus)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest pl-1">
              Quality Preset
            </Label>
            <Select
              value={exportSettings.quality}
              onValueChange={(v) => setExportSetting("quality", v as ExportQuality)}
            >
              <SelectTrigger className="h-11 rounded-xl bg-foreground/5 border-foreground/5 focus:ring-primary/50 transition-all font-medium">
                <SelectValue placeholder="Quality" />
              </SelectTrigger>
              <SelectContent className="glass-surface border-foreground/10 rounded-xl overflow-hidden">
                <SelectItem value="low">Low (Faster, ~2MB/s)</SelectItem>
                <SelectItem value="medium">
                  Medium (Recommended, ~5MB/s)
                </SelectItem>
                <SelectItem value="high">High (Maximum, ~10MB/s)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="pt-4 space-y-5">
            {isExporting && (
              <div className="space-y-3">
                <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                    Rendering…
                  </span>
                  <span className="tabular-nums">{exportProgress}%</span>
                </div>
                <Progress value={exportProgress} className="h-1.5 bg-foreground/5 overflow-hidden" />
              </div>
            )}

            {exportComplete ? (
              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-3 animate-in zoom-in-95 duration-300">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" strokeWidth={1.5} />
                <p className="text-[11px] font-black text-emerald-400 uppercase tracking-widest">
                  Download Started
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Check your Downloads folder.
                </p>
                <button
                  onClick={() => setExportComplete(false)}
                  className="text-[9px] font-black text-muted-foreground/60 hover:text-foreground uppercase tracking-widest transition-colors"
                >
                  Export Again
                </button>
              </div>
            ) : (
              <Button
                className="w-full h-14 rounded-2xl text-[12px] font-black uppercase tracking-widest bg-primary text-white hover:bg-primary/90 shadow-[0_0_20px_hsl(var(--primary)/0.3)] group transition-all"
                onClick={handleExport}
                disabled={!selectedClipId || isExporting}
              >
                <Rocket className="mr-3 w-5 h-5 group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform" />
                Render Selection
              </Button>
            )}
          </div>
        </CardContent>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl border border-foreground/5 bg-foreground/[0.02] flex flex-col items-center text-center gap-2 transition-colors hover:border-emerald-500/30">
          <ShieldCheck className="w-5 h-5 text-emerald-500" />
          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Private Render</span>
        </div>
        <div className="p-4 rounded-2xl border border-foreground/5 bg-foreground/[0.02] flex flex-col items-center text-center gap-2 transition-colors hover:border-primary/30">
          <Clock className="w-5 h-5 text-primary" />
          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Fastest Lane</span>
        </div>
      </div>

      <div className="p-5 bg-amber-500/5 rounded-[1.5rem] border border-amber-500/20 shadow-inner">
        <div className="flex gap-4">
          <Settings2 className="w-5 h-5 text-amber-500 shrink-0" />
          <p className="text-[10px] text-amber-500/70 leading-relaxed font-bold uppercase tracking-wider">
            Large exports are queued on high-performance servers. You can close this tab and receive an email when it&apos;s ready.
          </p>
        </div>
      </div>
    </div>
  );
}
