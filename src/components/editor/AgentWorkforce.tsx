"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudDownload,
  FileAudio,
  Sparkles,
  Smartphone,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Cpu,
  Zap,
  Activity,
} from "lucide-react";
import { useEditorStore, AgentState } from "@/stores/editorStore";
import { cn } from "@/lib/utils";

interface AgentNodeProps {
  agent: AgentState;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  isNext: boolean;
}

const AgentNode = ({ agent, icon: Icon, isActive, isNext }: AgentNodeProps) => {
  const statusColor =
    agent.status === "working"
      ? "text-primary"
      : agent.status === "done"
        ? "text-emerald-400"
        : agent.status === "error"
          ? "text-red-400"
          : "text-slate-600";

  const displayMessage =
    agent.status === "working"
      ? agent.message || "Working..."
      : agent.status === "done"
        ? "Done."
        : agent.status === "error"
          ? "Something went wrong."
          : "Waiting...";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "relative flex items-center gap-6 p-4 rounded-3xl transition-all duration-500",
        isActive
          ? "bg-white/[0.03] border border-white/10 shadow-2xl"
          : "opacity-40",
      )}
    >
      {/* Node Visual */}
      <div className="relative w-16 h-16 flex items-center justify-center">
        {/* Progress Ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90">
          <circle
            cx="32"
            cy="32"
            r="28"
            className="stroke-white/5 fill-none"
            strokeWidth="4"
          />
          <motion.circle
            cx="32"
            cy="32"
            r="28"
            className={cn(
              "fill-none transition-colors",
              statusColor.replace("text-", "stroke-"),
            )}
            strokeWidth="4"
            strokeDasharray="176"
            animate={{ strokeDashoffset: 176 - (176 * agent.progress) / 100 }}
          />
        </svg>

        {/* Inner Glow */}
        <AnimatePresence>
          {agent.status === "working" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-2 bg-primary/20 blur-xl rounded-full animate-pulse"
            />
          )}
        </AnimatePresence>

        {/* Icon */}
        <div className={cn("relative z-10", statusColor)}>
          {agent.status === "working" ? (
            <Loader2 className="w-7 h-7 animate-spin" />
          ) : agent.status === "done" ? (
            <CheckCircle2 className="w-7 h-7" />
          ) : agent.status === "error" ? (
            <AlertCircle className="w-7 h-7" />
          ) : (
            <Icon className="w-7 h-7" />
          )}
        </div>
      </div>

      {/* Info & Live Status */}
      <div className="flex-1 flex flex-col gap-1 min-w-[200px]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
            {agent.label}
          </span>
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-widest",
              statusColor,
            )}
          >
            {agent.status}
          </span>
        </div>

        <div className="h-8 relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={displayMessage}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              className="text-[9px] font-medium text-slate-500 italic flex items-center gap-2"
            >
              {agent.status === "working" && (
                <Zap className="w-3 h-3 text-primary animate-pulse" />
              )}
              {displayMessage}
            </motion.p>
          </AnimatePresence>
        </div>
        
        {agent.reasoningLogs && agent.reasoningLogs.length > 0 && (
          <div className="mt-2 p-2 bg-black/20 rounded-md max-h-24 overflow-y-auto custom-scrollbar">
            {agent.reasoningLogs.map((log, idx) => (
              <div key={idx} className="text-[10px] text-slate-400 font-mono tracking-tight leading-relaxed">
                <span className="text-primary mr-1">&gt;</span>{log}
              </div>
            ))}
          </div>
        )}

        {/* Mini Progress Bar */}
        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-1">
          <motion.div
            className={cn("h-full", statusColor.replace("text-", "bg-"))}
            animate={{ width: `${agent.progress}%` }}
          />
        </div>
      </div>
    </motion.div>
  );
};

export default function AgentWorkforce() {
  const { agentStates, currentStage } = useEditorStore();

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8 gap-8">
      {/* Engine Status Header */}
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-md">
          <Activity className="w-3 h-3 text-primary animate-pulse" />
          <span className="text-[9px] font-black tracking-[0.3em] text-primary uppercase">
            Studio Active
          </span>
        </div>
        <h2 className="text-2xl font-black text-white/90 tracking-tighter">
          Analyzing Your Video
        </h2>
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest max-w-sm">
          We&apos;re working through your video to find the best moments.
        </p>
      </div>

      {/* Workforce Network */}
      <div className="relative w-full max-w-2xl flex flex-col gap-4">
        <div className="absolute left-[32px] top-[48px] bottom-[48px] w-px bg-linear-to-b from-primary/50 via-primary/10 to-transparent" />

        <AgentNode
          agent={agentStates.ingestion}
          icon={CloudDownload}
          isActive={
            currentStage === "loading" ||
            agentStates.ingestion.status !== "idle"
          }
          isNext={currentStage === "idle"}
        />

        <AgentNode
          agent={agentStates.transcription}
          icon={FileAudio}
          isActive={
            currentStage === "transcribing" ||
            agentStates.transcription.status !== "idle"
          }
          isNext={currentStage === "loading"}
        />

        <AgentNode
          agent={agentStates.viralAnalysis}
          icon={Sparkles}
          isActive={
            currentStage === "analyzing" ||
            agentStates.viralAnalysis.status !== "idle"
          }
          isNext={currentStage === "transcribing"}
        />

        <AgentNode
          agent={agentStates.reframing}
          icon={Smartphone}
          isActive={agentStates.reframing.status !== "idle"}
          isNext={currentStage === "analyzing"}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-4 mt-4 px-6 py-3 nano-glass rounded-2xl border-white/5 opacity-60">
        <Cpu className="w-4 h-4 text-primary" />
        <span className="text-[10px] font-medium text-slate-400">
          Processing locally on your device
        </span>
      </div>
    </div>
  );
}
