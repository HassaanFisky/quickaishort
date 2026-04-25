"use client";

import { useSession } from "next-auth/react";
import { GlowButton } from "@/components/ui/GlowButton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  History,
  Scissors,
  Layers,
  BarChart3,
  Clock,
  Zap,
  Sparkles,
  PlayCircle,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { data: session } = useSession();

  return (
    <div className="container mx-auto px-6 py-12 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
        <div className="space-y-2">
          <Badge className="bg-primary/10 text-primary border-primary/20 mb-4 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase">
            NANO DASHBOARD V1.0
          </Badge>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tighter premium-gradient-text">
            Welcome, {session?.user?.name?.split(" ")[0] || "Creator"}.
          </h1>
          <p className="text-muted-foreground text-xl font-medium">
            Your creative engine is ready. What are we building today?
          </p>
        </div>
        <GlowButton
          variant="premium"
          size="lg"
          className="h-16 px-10 rounded-2xl text-lg group w-full lg:w-auto shadow-2xl"
          asChild
        >
          <Link href="/editor">
            <Plus className="mr-3 w-6 h-6 group-hover:rotate-90 transition-transform duration-500" />
            Create Project
          </Link>
        </GlowButton>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            icon: Scissors,
            label: "Total Projects",
            value: "0",
            color: "text-primary",
            glow: "hover:shadow-[0_0_20px_rgba(33,150,243,0.15)]",
          },
          {
            icon: Sparkles,
            label: "AI Insights",
            value: "0",
            color: "text-purple-400",
            glow: "hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]",
          },
          {
            icon: Layers,
            label: "Exports Done",
            value: "0",
            color: "text-sky-400",
            glow: "hover:shadow-[0_0_20px_rgba(56,189,248,0.15)]",
          },
          {
            icon: Clock,
            label: "Time Saved",
            value: "0h",
            color: "text-emerald-400",
            glow: "hover:shadow-[0_0_20px_rgba(52,211,153,0.15)]",
          },
        ].map((stat, i) => (
          <div
            key={i}
            className={cn(
              "nano-glass p-8 rounded-3xl transition-all duration-500 group cursor-default",
              stat.glow,
            )}
          >
            <div className="flex items-center justify-between mb-6">
              <div
                className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center border border-white/5 bg-white/5 group-hover:bg-white/10 transition-colors",
                  stat.color,
                )}
              >
                <stat.icon className="w-6 h-6" />
              </div>
              <BarChart3 className="w-5 h-5 text-muted-foreground/20" />
            </div>
            <div className="text-4xl font-bold tracking-tight mb-1">
              {stat.value}
            </div>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Recent Projects */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <History className="w-6 h-6 text-primary" />
              Recent Studio Projects
            </h2>
            <Link
              href="/history"
              className="text-sm font-bold text-primary hover:underline underline-offset-4 transition-all"
            >
              View All Activity
            </Link>
          </div>

          <div className="nano-glass border-dashed border-2 border-white/10 min-h-[400px] flex flex-col items-center justify-center text-center p-12 rounded-[2.5rem] group hover:border-primary/30 transition-all duration-700">
            <Link href="/editor" className="flex flex-col items-center">
              <div className="nano-glass w-24 h-24 rounded-3xl flex items-center justify-center mb-10 group-hover:scale-110 group-hover:nano-glow transition-all duration-500">
                <Plus className="w-10 h-10 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="text-3xl font-bold mb-4">The canvas is empty.</h3>
              <p className="text-muted-foreground max-w-md mb-10 text-lg leading-relaxed font-medium">
                Transform any video into premium social content with our
                client-side AI pipeline. No uploads required.
              </p>
              <GlowButton
                variant="premium"
                className="px-10 h-12 rounded-xl text-md"
              >
                Launch Nano Editor
              </GlowButton>
            </Link>
          </div>
        </div>

        {/* Pro Tips Side Panel */}
        <div className="lg:col-span-4 space-y-6">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3 px-2">
            <Zap className="w-6 h-6 text-yellow-400" />
            Nano Pro Tips
          </h2>
          <div className="nano-glass rounded-[2.5rem] p-10 space-y-8 bg-linear-to-br from-white/[0.03] to-transparent">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Direct Pipeline
            </h3>

            <div className="space-y-10">
              {[
                {
                  title: "Wasm Processing",
                  desc: "Processing happens 100% locally. For 4K files, ensure your browser has hardware acceleration enabled.",
                },
                {
                  title: "9:16 Optimization",
                  desc: "Use the built-in AI cropper to automatically find the best framing for TikTok and Reels.",
                },
                {
                  title: "Smart Captions",
                  desc: "Enable dynamic captions to boost retention. All transcription is done privately via WebGPU.",
                },
              ].map((tip, idx) => (
                <div key={idx} className="relative pl-10">
                  <div className="absolute left-0 top-1 text-primary font-black text-lg opacity-40">
                    0{idx + 1}
                  </div>
                  <h4 className="text-md font-bold mb-2">{tip.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed font-medium transition-colors group-hover:text-foreground">
                    {tip.desc}
                  </p>
                </div>
              ))}
            </div>

            <GlowButton
              variant="outline"
              className="w-full mt-6 h-12 rounded-2xl border-white/5 hover:border-primary/20 bg-white/5"
            >
              <PlayCircle className="w-4 h-4 mr-2" />
              Watch Nano Masterclass
            </GlowButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
