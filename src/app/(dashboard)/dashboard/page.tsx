"use client";

import { useSession } from "next-auth/react";
import { GlowButton } from "@/components/ui/GlowButton";
import {
  Plus,
  Film,
  Layers,
  Clock,
  Zap,
  Sparkles,
  PlayCircle,
  ArrowRight,
  History,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

import { useDashboardStats } from "@/hooks/useDashboardStats";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  if (hour >= 18 && hour < 22) return "Good evening";
  return "Working late";
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, damping: 22, stiffness: 110 },
  },
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] || "Creator";
  const userId = session?.user?.id ?? session?.user?.email ?? null;

  const { stats, isReady, transport } = useDashboardStats({ userId });

  const minutes = Math.round(stats.total_duration_processed / 60);
  const metrics = [
    {
      icon: Film,
      label: "Videos Created",
      value: String(stats.total_projects),
      color: "text-primary",
    },
    {
      icon: Sparkles,
      label: "Audience Predictions",
      value: String(stats.ai_runs),
      color: "text-purple-400",
    },
    {
      icon: Layers,
      label: "Clips Exported",
      value: String(stats.export_count),
      color: "text-sky-400",
    },
    {
      icon: Clock,
      label: "Minutes Analyzed",
      value: `${minutes}m`,
      color: "text-emerald-400",
    },
  ];

  const hasActivity =
    stats.total_projects +
      stats.ai_runs +
      stats.export_count +
      stats.total_duration_processed >
    0;

  return (
    <motion.div
      className="container mx-auto px-6 py-12 space-y-10"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        variants={itemVariants}
        className="depth-card glass-surface rounded-[2rem] p-8 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,rgba(168,85,247,0.08),transparent_60%)] pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary text-[10px] font-black tracking-[0.2em] uppercase">
              <Sparkles className="w-3 h-3" />
              Studio
              {transport === "websocket" && (
                <span className="text-[8px] font-bold opacity-60 ml-1">
                  · ws
                </span>
              )}
              {transport === "rest" && (
                <span className="text-[8px] font-bold opacity-60 ml-1">
                  · rest
                </span>
              )}
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter premium-gradient-text">
              {getGreeting()}, {firstName}.
            </h1>
            <p className="text-muted-foreground text-lg font-medium">
              Your studio is ready. What are we building today?
            </p>
          </div>
          <GlowButton
            variant="premium"
            size="lg"
            className="h-14 px-10 rounded-2xl text-base group w-full lg:w-auto shrink-0"
            asChild
          >
            <Link href="/editor">
              <Plus className="mr-2 w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
              Create New Short
            </Link>
          </GlowButton>
        </div>
      </motion.div>

      {hasActivity ? (
        <motion.div
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          {metrics.map((stat, i) => (
            <motion.div
              key={i}
              variants={itemVariants}
              className="depth-card spring-hover rounded-[1.75rem] p-7 group cursor-default focus-ring"
              tabIndex={0}
            >
              <div className="flex items-center justify-between mb-6">
                <div
                  className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center border border-white/5 bg-white/5 group-hover:bg-white/10 transition-colors",
                    stat.color,
                  )}
                >
                  <stat.icon className="w-5 h-5" />
                </div>
              </div>
              <div className="text-4xl font-bold tracking-tight mb-1">
                {isReady ? stat.value : "—"}
              </div>
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">
                {stat.label}
              </p>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <motion.div
          variants={itemVariants}
          className="depth-card rounded-[2rem] p-10 flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight">
                Welcome to the Studio
              </h3>
              <p className="text-sm text-muted-foreground font-medium mt-1">
                Upload your first video and your stats will appear here.
              </p>
            </div>
          </div>
          <GlowButton
            variant="premium"
            className="h-11 px-6 rounded-xl focus-ring"
            asChild
          >
            <Link href="/editor">
              <Plus className="mr-2 w-4 h-4" />
              Start Your First Project
            </Link>
          </GlowButton>
        </motion.div>
      )}

      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 lg:grid-cols-12 gap-8"
      >
        <div className="lg:col-span-8 space-y-5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2.5">
              <History className="w-5 h-5 text-primary" />
              Recent Work
            </h2>
            <Link
              href="/history"
              className="text-sm font-bold text-primary hover:underline underline-offset-4 transition-all flex items-center gap-1"
            >
              View All
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="depth-card border-dashed border-2 border-white/10 min-h-[380px] flex flex-col items-center justify-center text-center p-12 rounded-[2rem] group hover:border-primary/30 transition-all duration-700">
            <Link href="/editor" className="flex flex-col items-center">
              <div className="nano-glass w-20 h-20 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:nano-glow transition-all duration-500">
                <Plus className="w-9 h-9 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="text-2xl font-bold mb-3">
                Your studio is ready for its first project.
              </h3>
              <p className="text-muted-foreground max-w-md mb-8 text-base leading-relaxed font-medium">
                Import a video or paste a link to find your best clips automatically.
              </p>
              <GlowButton variant="premium" className="px-8 h-11 rounded-xl">
                Create New Short
              </GlowButton>
            </Link>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-5">
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2.5 px-1">
            <Zap className="w-5 h-5 text-yellow-400" />
            Pro Tips
          </h2>
          <div className="depth-card rounded-[2rem] p-8 space-y-8 bg-linear-to-br from-white/[0.03] to-transparent">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              How It Works
            </h3>

            <div className="space-y-8">
              {[
                {
                  title: "Server-side Render",
                  desc: "Big files render on our infra so your browser never stalls — even on 1GB+ source videos.",
                },
                {
                  title: "Vertical Format",
                  desc: "Smart crop finds the best frame for TikTok and Reels automatically.",
                },
                {
                  title: "Auto Subtitles",
                  desc: "Burned-in captions boost watch-time. Transcription runs privately on your device.",
                },
              ].map((tip, idx) => (
                <div key={idx} className="relative pl-9">
                  <div className="absolute left-0 top-0.5 text-primary font-black text-base opacity-40">
                    0{idx + 1}
                  </div>
                  <h4 className="text-sm font-bold mb-1.5">{tip.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                    {tip.desc}
                  </p>
                </div>
              ))}
            </div>

            <GlowButton
              variant="outline"
              className="w-full mt-4 h-11 rounded-2xl border-white/5 hover:border-primary/20 bg-white/5"
            >
              <PlayCircle className="w-4 h-4 mr-2" />
              Watch Quickstart Guide
            </GlowButton>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
