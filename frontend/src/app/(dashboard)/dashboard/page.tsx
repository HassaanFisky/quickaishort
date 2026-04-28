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
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion, Variants } from "framer-motion";

import { useDashboardStats } from "@/hooks/useDashboardStats";

import { getGreeting } from "@/lib/utils/greeting";

import { containerVariants, itemVariants } from "@/lib/animations";


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
      glow: "bg-primary/20",
    },
    {
      icon: Sparkles,
      label: "AI Generations",
      value: String(stats.ai_runs),
      color: "text-purple-400",
      glow: "bg-purple-400/20",
    },
    {
      icon: Layers,
      label: "Clips Exported",
      value: String(stats.export_count),
      color: "text-sky-400",
      glow: "bg-sky-400/20",
    },
    {
      icon: Clock,
      label: "Minutes Saved",
      value: `${minutes}m`,
      color: "text-emerald-400",
      glow: "bg-emerald-400/20",
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
      className="container mx-auto px-6 py-12 max-w-7xl space-y-12"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header Section */}
      <motion.div
        variants={itemVariants}
        className="relative group"
      >
        <div className="absolute -inset-1 bg-linear-to-r from-primary/20 via-purple-500/20 to-accent/20 rounded-[2.5rem] blur-xl opacity-50 group-hover:opacity-100 transition-opacity duration-1000" />
        <div className="depth-card glass-surface rounded-[2rem] p-8 md:p-12 relative overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between gap-10">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,hsl(var(--primary)/0.08),transparent_60%)] pointer-events-none" />
          
          <div className="relative z-10 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/10 text-primary text-[10px] font-black tracking-[0.2em] uppercase">
              <TrendingUp className="w-3.5 h-3.5" />
              Creator Studio
              {transport && (
                <span className="text-[9px] font-bold opacity-60 ml-2 px-1.5 py-0.5 rounded-md bg-foreground/5">
                  {transport}
                </span>
              )}
            </div>
            
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tighter premium-gradient-text leading-[1.1]">
              {getGreeting()}, <br className="md:hidden" />
              {firstName}.
            </h1>
            
            <p className="text-muted-foreground text-lg md:text-xl font-medium max-w-xl">
              Your AI-powered studio is ready. Let&apos;s turn your videos into viral shorts.
            </p>
          </div>

          <div className="relative z-10 shrink-0">
            <GlowButton
              variant="premium"
              size="lg"
              className="h-16 px-12 rounded-2xl text-lg group w-full lg:w-auto shadow-2xl shadow-primary/20 hover:shadow-primary/40 transition-all duration-500"
              asChild
            >
              <Link href="/editor">
                <Plus className="mr-3 w-6 h-6 group-hover:rotate-90 transition-transform duration-500" />
                New Project
              </Link>
            </GlowButton>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        variants={containerVariants}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        {metrics.map((stat, i) => (
          <motion.div
            key={i}
            variants={itemVariants}
            className="depth-card spring-hover rounded-[2rem] p-8 group cursor-default relative overflow-hidden"
          >
            <div className={cn("absolute top-0 right-0 w-24 h-24 blur-3xl opacity-0 group-hover:opacity-40 transition-opacity duration-700 rounded-full", stat.glow)} />
            
            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-center justify-between mb-8">
                <div className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center border border-foreground/5 bg-foreground/5 group-hover:bg-foreground/10 transition-all duration-500 group-hover:scale-110",
                  stat.color
                )}>
                  <stat.icon className="w-7 h-7" />
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <TrendingUp className={cn("w-5 h-5", stat.color)} />
                </div>
              </div>
              
              <div className="mt-auto">
                <div className="text-5xl font-bold tracking-tight mb-2 flex items-baseline gap-1">
                  {isReady ? stat.value : (
                    <div className="w-12 h-10 bg-foreground/10 rounded-lg animate-pulse" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-black uppercase tracking-[0.2em] opacity-70 group-hover:opacity-100 transition-opacity">
                  {stat.label}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Bottom Section: Recent Work & Tips */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
      >
        {/* Recent Work / Empty State */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <History className="w-6 h-6 text-primary" />
              Recent Productions
            </h2>
            <Link
              href="/history"
              className="text-sm font-bold text-primary hover:text-primary/80 transition-all flex items-center gap-2 group"
            >
              Library
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="depth-card border-dashed border-2 border-foreground/10 min-h-[440px] flex flex-col items-center justify-center text-center p-12 rounded-[2.5rem] group hover:border-primary/40 transition-all duration-700 bg-linear-to-b from-foreground/[0.02] to-transparent">
            <Link href="/editor" className="flex flex-col items-center">
              <div className="relative mb-10">
                <div className="absolute inset-0 bg-primary/20 rounded-3xl blur-2xl group-hover:blur-3xl transition-all duration-700" />
                <div className="nano-glass w-24 h-24 rounded-3xl flex items-center justify-center relative z-10 group-hover:scale-110 group-hover:rotate-6 transition-all duration-700">
                  <Plus className="w-10 h-10 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
              
              <h3 className="text-3xl font-bold mb-4 tracking-tight">
                No active projects
              </h3>
              <p className="text-muted-foreground max-w-md mb-10 text-lg leading-relaxed font-medium opacity-80">
                Upload a video or paste a YouTube link to let our AI find the most viral moments for you.
              </p>
              
              <GlowButton variant="premium" className="px-10 h-14 rounded-2xl text-base shadow-xl shadow-primary/10">
                Create Your First Short
              </GlowButton>
            </Link>
          </div>
        </div>

        {/* Sidebar / Pro Tips */}
        <div className="lg:col-span-4 space-y-6">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3 px-2">
            <Zap className="w-6 h-6 text-yellow-400" />
            Studio Insights
          </h2>
          
          <div className="depth-card rounded-[2.5rem] p-8 md:p-10 space-y-10 relative overflow-hidden bg-linear-to-br from-primary/[0.05] to-transparent border-primary/10">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl rounded-full -mr-16 -mt-16" />
            
            <div className="space-y-10">
              {[
                {
                  title: "Cloud Processing",
                  desc: "We handle the heavy lifting. Large 4K files process in the background without slowing your device.",
                  icon: Sparkles,
                },
                {
                  title: "Smart Framing",
                  desc: "Our AI automatically tracks subjects and centers them for the perfect vertical viewing experience.",
                  icon: Zap,
                },
                {
                  title: "Viral Hook Detection",
                  desc: "Advanced NLP identifies the most engaging hooks to boost your retention rates instantly.",
                  icon: TrendingUp,
                },
              ].map((tip, idx) => (
                <div key={idx} className="flex gap-5 group">
                  <div className="shrink-0 w-12 h-12 rounded-xl bg-foreground/5 flex items-center justify-center text-primary font-black group-hover:scale-110 group-hover:bg-primary/10 transition-all duration-500">
                    <tip.icon className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    <h4 className="text-base font-bold tracking-tight">{tip.title}</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed font-medium opacity-80 group-hover:opacity-100 transition-opacity">
                      {tip.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <GlowButton
              variant="outline"
              className="w-full h-14 rounded-2xl border-foreground/10 hover:border-primary/30 hover:bg-primary/5 bg-foreground/5 transition-all duration-500"
            >
              <PlayCircle className="w-5 h-5 mr-3" />
              Quickstart Tutorial
            </GlowButton>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
