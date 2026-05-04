"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { CinematicIntro } from "@/components/layout/CinematicIntro";
import { motion, useScroll, useTransform, AnimatePresence, useInView } from "framer-motion";
import {
  Sparkles,
  Users,
  Target,
  Gauge,
  Rocket,
  Check,
  ArrowRight,
  Play,
  Cpu,
  Zap,
  Brain,
  TrendingUp,
  Shield,
  Star,
  ChevronRight,
} from "lucide-react";
import { GlowButton } from "@/components/ui/GlowButton";
import { cn } from "@/lib/utils";

function useAnimatedCounter(target: number, duration = 2000, start = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [start, target, duration]);
  return value;
}

const PERSONAS = [
  {
    id: "genz",
    emoji: "⚡",
    title: "Gen Z",
    description: "Trend-driven, high BS-detector, short attention span.",
    color: "from-pink-500 to-rose-500",
    borderColor: "border-pink-500/30",
    retention: 92,
    verdict: "WATCHES",
    hook: "strong",
    reason: "Hook lands in first 1.2s. Pacing matches feed scroll behavior.",
  },
  {
    id: "tech",
    emoji: "🖥️",
    title: "The Techie",
    description: "Values efficiency, technical depth, and clean aesthetics.",
    color: "from-blue-500 to-cyan-500",
    borderColor: "border-blue-500/30",
    retention: 88,
    verdict: "WATCHES",
    hook: "moderate",
    reason: "Good signal-to-noise. Loses them at the 18s explanation.",
  },
  {
    id: "millennial",
    emoji: "💼",
    title: "Millennial",
    description: "Aspirational, value-driven, prefers depth over flash.",
    color: "from-orange-500 to-yellow-500",
    borderColor: "border-orange-500/30",
    retention: 74,
    verdict: "WATCHES",
    hook: "moderate",
    reason: "Relatable framing but the CTA feels rushed.",
  },
  {
    id: "skeptic",
    emoji: "🏆",
    title: "Sports Fan",
    description: "High energy, competitive, hooks on stakes and outcomes.",
    color: "from-emerald-500 to-teal-500",
    borderColor: "border-emerald-500/30",
    retention: 61,
    verdict: "SCROLLS",
    hook: "weak",
    reason: "No stakes in the first 3s. Missing the competitive hook.",
  },
];

const FEATURES = [
  {
    icon: Users,
    title: "4 Audience Personas",
    body: "Gen Z, Millennial, Sports Fan, Tech Nerd — each scores hook strength and predicted retention.",
    className: "md:col-span-2",
  },
  {
    icon: Target,
    title: "Drop-off Map",
    body: "See exactly where viewers tune out and why, powered by Google Gemini 2.5 Flash.",
    className: "md:col-span-1",
  },
  {
    icon: Sparkles,
    title: "Auto-Refinement",
    body: "When personas reject a clip, our agents rewrite the cut automatically until it passes.",
    className: "md:col-span-1",
  },
  {
    icon: Gauge,
    title: "Instant Export",
    body: "Whisper and FFmpeg.wasm run client-side — your video never leaves your machine.",
    className: "md:col-span-2",
  },
];

const PIPELINE_STEPS = [
  { icon: Play, label: "Paste YouTube URL", sub: "yt-dlp extracts stream" },
  { icon: Brain, label: "Whisper Transcription", sub: "Browser-side Web Worker" },
  { icon: Zap, label: "ADK SequentialAgent", sub: "4-step orchestration" },
  { icon: Users, label: "Parallel Persona Panel", sub: "4 agents fire simultaneously" },
  { icon: Target, label: "Quality Gate Loop", sub: "Iterates until score ≥ 65" },
  { icon: TrendingUp, label: "PUBLISH / REFINE / DISCARD", sub: "Actionable verdict" },
];

const TESTIMONIALS = [
  {
    quote: "Pre-Flight caught that my hook was weak for Gen Z before I wasted 48 hours of reach. Literal game changer.",
    name: "Marcus T.",
    role: "1.2M Subscriber Tech Creator",
    score: 94,
  },
  {
    quote: "I went from 12% average retention to 67% in 3 weeks just by listening to the persona panel. Nothing else changed.",
    name: "Priya N.",
    role: "Lifestyle & Wellness, 800k",
    score: 88,
  },
  {
    quote: "The Skeptic persona saved me from posting the most cringe thumbnail I've ever made. Worth every penny.",
    name: "Jake R.",
    role: "Sports Analyst, 2.3M",
    score: 71,
  },
];

function StatCounter({ target, format, duration = 2000 }: { target: number; format: (n: number) => string; duration?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const value = useAnimatedCounter(target, duration, inView);
  return <div ref={ref} className="text-3xl md:text-5xl font-black mb-2 tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/70">{format(value)}</div>;
}

function StatsSection() {
  return (
    <section className="py-20 border-y border-white/5 bg-white/[0.02]">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-12 text-center">
        {[
          { target: 12, format: (n: number) => `${n}M+`, label: "AI Decisions / Month", duration: 1800 },
          { target: 340, format: (n: number) => `${n}%`, label: "Creator Reach Lift", duration: 1500 },
          { target: 992, format: (n: number) => `${(n / 10).toFixed(1)}%`, label: "Persona Accuracy", duration: 1800 },
          { target: 450, format: (n: number) => `${n}k`, label: "Wasted Posts Avoided", duration: 2000 },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
          >
            <StatCounter target={stat.target} format={stat.format} duration={stat.duration} />
            <div className="text-xs md:text-sm font-bold text-muted-foreground uppercase tracking-[0.2em]">{stat.label}</div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [showIntro, setShowIntro] = useState(false);
  const [hasCheckedSession, setHasCheckedSession] = useState(false);

  useEffect(() => {
    const seen = sessionStorage.getItem("introSeen");
    if (!seen) {
      setShowIntro(true);
      sessionStorage.setItem("introSeen", "true");
    }
    setHasCheckedSession(true);
  }, []);

  const { scrollYProgress } = useScroll();
  const y1 = useTransform(scrollYProgress, [0, 1], [0, -100]);
  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

  if (!hasCheckedSession) return null;

  return (
    <>
      <AnimatePresence mode="wait">
        {showIntro && (
          <motion.div
            key="intro"
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
          >
            <CinematicIntro onComplete={() => setShowIntro(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn(
        "relative min-h-screen bg-background text-foreground selection:bg-primary/30 overflow-x-hidden font-sans transition-opacity duration-1000",
        showIntro ? "opacity-0 h-screen overflow-hidden" : "opacity-100"
      )}>
        <Navbar />
        
        {/* Living Background */}
        <div className="living-water-bg" />

        <main>
          {/* HERO SECTION */}
          <section className="relative min-h-screen flex flex-col items-center justify-center pt-20 px-6">
            <motion.div 
              style={{ opacity }}
              className="absolute top-0 left-0 w-full h-full -z-10 pointer-events-none overflow-hidden"
            >
              <div className="absolute top-[20%] left-[10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full animate-pulse" />
              <div className="absolute bottom-[20%] right-[10%] w-[40%] h-[40%] bg-accent/10 blur-[120px] rounded-full animate-pulse delay-700" />
            </motion.div>

            <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-primary mb-8">
                  <Sparkles className="w-4 h-4" />
                  Next-Gen AI Video Pipeline
                </div>

                <h1 className="text-5xl md:text-7xl lg:text-8xl font-black leading-[0.9] tracking-tight mb-8">
                  Know your clip <br />
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500">
                    will hit.
                  </span>
                </h1>

                <p className="text-xl md:text-2xl text-muted-foreground mb-10 leading-relaxed max-w-xl">
                  The first multi-agent system that simulates real audience personas on your video — <span className="text-foreground font-semibold">before you waste your reach.</span>
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <GlowButton size="lg" className="w-full sm:w-auto h-14 px-10 rounded-2xl text-lg font-bold" asChild>
                    <Link href="/editor">
                      Start Creating <ArrowRight className="ml-2 w-5 h-5" />
                    </Link>
                  </GlowButton>
                  <Link href="#how" className="w-full sm:w-auto h-14 px-10 rounded-2xl text-lg font-bold border border-white/10 hover:bg-white/5 flex items-center justify-center gap-2 transition-colors">
                    Watch Demo <Play className="w-5 h-5 fill-current" />
                  </Link>
                </div>

                <div className="mt-12 flex items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex -space-x-3">
                    {[1,2,3,4].map(i => (
                      <div key={i} className="w-10 h-10 rounded-full border-2 border-background bg-secondary flex items-center justify-center overflow-hidden">
                        <Image 
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i + 10}`} 
                          alt="User" 
                          width={40} 
                          height={40} 
                        />
                      </div>
                    ))}
                  </div>
                  <p>Trusted by <span className="text-foreground font-bold">2,000+</span> elite creators</p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.8, rotateY: 20 }}
                animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
                className="relative aspect-square lg:aspect-auto lg:h-[600px] w-full"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-accent/20 blur-3xl rounded-3xl -z-10" />
                <div className="relative h-full w-full rounded-3xl border border-white/10 overflow-hidden nano-glass shadow-2xl">
                  <Image
                    src="/hero-ai.png"
                    alt="AI Video Generation Hero"
                    fill
                    className="object-cover opacity-80"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                  
                  {/* Floating Elements */}
                  <motion.div 
                    animate={{ y: [0, -20, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-10 right-10 p-6 nano-glass border-white/10 rounded-2xl shadow-xl backdrop-blur-xl"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-xs font-bold text-green-500 uppercase tracking-widest">Viral Score</span>
                    </div>
                    <div className="text-4xl font-black">98.4%</div>
                  </motion.div>

                  <motion.div 
                    animate={{ y: [0, 20, 0] }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    className="absolute bottom-10 left-10 p-6 nano-glass border-white/10 rounded-2xl shadow-xl backdrop-blur-xl max-w-[200px]"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="w-4 h-4 text-primary" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Audience Match</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {['GenZ', 'Tech', 'Millennial'].map(tag => (
                        <span key={tag} className="px-2 py-1 rounded-md bg-primary/20 text-[9px] font-bold border border-primary/30">{tag}</span>
                      ))}
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </section>

          {/* STATS SECTION */}
          <StatsSection />

          {/* HOW IT WORKS — ADK PIPELINE */}
          <section id="how" className="py-32 px-6 relative overflow-hidden">
            <div className="absolute inset-0 -z-10">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-primary/5 blur-[120px] rounded-full" />
            </div>
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-20">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-primary mb-6">
                  <Zap className="w-3.5 h-3.5" /> Powered by Google ADK 1.0
                </div>
                <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tight">
                  The Pre-Flight Pipeline
                </h2>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                  A SequentialAgent orchestrates 6 specialized sub-agents. LoopAgent iterates until your clip scores 65+ or gives a final verdict.
                </p>
              </div>

              <div className="relative">
                {/* connector line */}
                <div className="hidden lg:block absolute top-1/2 left-[8.33%] right-[8.33%] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent -translate-y-1/2 z-0" />
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 relative z-10">
                  {PIPELINE_STEPS.map((step, i) => (
                    <motion.div
                      key={step.label}
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.12, duration: 0.5 }}
                      className="flex flex-col items-center text-center group"
                    >
                      <div className="relative mb-4">
                        <div className="w-14 h-14 rounded-2xl bg-secondary/60 border border-white/10 flex items-center justify-center group-hover:border-primary/40 group-hover:bg-primary/10 transition-all duration-300 shadow-lg">
                          <step.icon className="w-6 h-6 text-primary" />
                        </div>
                        <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-background border border-white/10 flex items-center justify-center text-[9px] font-black text-muted-foreground">
                          {i + 1}
                        </div>
                      </div>
                      <p className="text-[11px] font-black text-foreground/90 mb-1 leading-tight">{step.label}</p>
                      <p className="text-[9px] text-muted-foreground/60 font-medium">{step.sub}</p>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Agent primitives badges */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.7 }}
                className="mt-16 flex flex-wrap justify-center gap-3"
              >
                {["SequentialAgent", "LoopAgent", "ParallelAgent", "BaseAgent ×4", "FunctionTool", "MCPToolset"].map(badge => (
                  <span key={badge} className="px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-[10px] font-black text-muted-foreground uppercase tracking-widest hover:border-primary/30 hover:text-primary transition-colors">
                    {badge}
                  </span>
                ))}
              </motion.div>
            </div>
          </section>

          {/* PERSONA SHOWCASE */}
          <section className="py-32 px-6 relative overflow-hidden">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-20">
                <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tight">The 4-Persona Panel</h2>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                  Our multi-agent system fires 4 specialized LLM agents in parallel — each simulating a real audience segment on your clip.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {PERSONAS.map((persona, i) => (
                  <motion.div
                    key={persona.id}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    whileHover={{ y: -8, transition: { duration: 0.2 } }}
                    className={cn("group relative p-6 rounded-2xl nano-glass border overflow-hidden", persona.borderColor)}
                  >
                    <div className={cn("absolute top-0 right-0 w-40 h-40 blur-3xl opacity-15 -z-10 bg-gradient-to-br", persona.color)} />

                    {/* Header */}
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2.5">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br text-lg", persona.color)}>
                          {persona.emoji}
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Agent</p>
                          <p className="text-sm font-black">{persona.title}</p>
                        </div>
                      </div>
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter",
                        persona.verdict === "WATCHES"
                          ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                          : "bg-red-500/10 border border-red-500/20 text-red-400"
                      )}>
                        {persona.verdict}
                      </span>
                    </div>

                    {/* Retention Bar */}
                    <div className="mb-4">
                      <div className="flex justify-between text-[9px] font-bold text-muted-foreground mb-1.5">
                        <span>Predicted Retention</span>
                        <span className={persona.retention >= 80 ? "text-emerald-400" : persona.retention >= 60 ? "text-amber-400" : "text-red-400"}>
                          {persona.retention}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: `${persona.retention}%` }}
                          viewport={{ once: true }}
                          transition={{ delay: i * 0.1 + 0.4, duration: 0.8, ease: "easeOut" }}
                          className={cn("h-full rounded-full bg-gradient-to-r", persona.color)}
                        />
                      </div>
                    </div>

                    {/* Hook verdict */}
                    <div className="mb-4">
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-widest",
                        persona.hook === "strong" ? "text-emerald-400" : persona.hook === "moderate" ? "text-amber-400" : "text-red-400"
                      )}>
                        Hook: {persona.hook}
                      </span>
                    </div>

                    <p className="text-[10px] text-muted-foreground/70 font-medium leading-relaxed italic border-l-2 border-white/10 pl-3">
                      &ldquo;{persona.reason}&rdquo;
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* BENTO GRID FEATURES */}
          <section id="features" className="py-32 px-6 bg-white/[0.01]">
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {FEATURES.map((feature, i) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className={cn(
                      "liquid-panel p-10 group relative overflow-hidden",
                      feature.className
                    )}
                  >
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] rounded-full group-hover:bg-primary/10 transition-colors" />
                    <feature.icon className="w-10 h-10 text-primary mb-8" />
                    <h3 className="text-3xl font-black mb-4 tracking-tight">{feature.title}</h3>
                    <p className="text-lg text-muted-foreground leading-relaxed">{feature.body}</p>
                    
                    <div className="mt-8 flex items-center gap-2 text-sm font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      Learn more <ArrowRight className="w-4 h-4" />
                    </div>
                  </motion.div>
                ))}
                
                <motion.div 
                  className="md:col-span-3 liquid-panel p-10 flex flex-col md:flex-row items-center justify-between gap-8 bg-gradient-to-r from-primary/10 to-accent/10"
                >
                  <div className="max-w-xl">
                    <h3 className="text-3xl font-black mb-4 tracking-tight">Built on Google Vertex AI</h3>
                    <p className="text-lg text-muted-foreground">
                      Leveraging the power of Gemini 2.5 Flash for hyper-fast inference and deep content understanding. Sequential multi-agent orchestration ensures the highest quality output.
                    </p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="p-6 rounded-3xl bg-background/50 border border-white/10 backdrop-blur-md">
                      <Rocket className="w-12 h-12 text-primary" />
                    </div>
                    <div className="p-6 rounded-3xl bg-background/50 border border-white/10 backdrop-blur-md">
                      <Cpu className="w-12 h-12 text-accent" />
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </section>

          {/* PRICING */}
          <section id="pricing" className="py-32 px-6 relative">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-20">
                <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tight">Simple, Creator Pricing</h2>
                <p className="text-xl text-muted-foreground">Start for free. Level up when you&apos;re ready to dominate.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* FREE */}
                <motion.div 
                  whileHover={{ scale: 1.02 }}
                  className="p-10 rounded-[32px] nano-glass border-white/5 flex flex-col"
                >
                  <div className="mb-8">
                    <span className="px-4 py-1.5 rounded-full bg-white/5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground border border-white/10">Free Plan</span>
                    <div className="mt-6 flex items-baseline gap-2">
                      <span className="text-6xl font-black">$0</span>
                      <span className="text-muted-foreground font-medium">/month</span>
                    </div>
                    <p className="mt-4 text-muted-foreground font-medium">Test your hooks against 2 personas.</p>
                  </div>

                  <div className="space-y-4 mb-10 flex-1">
                    {["1 Pre-Flight run / day", "2 audience personas", "Browser-based export", "Community support"].map(item => (
                      <div key={item} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                          <Check className="w-3 h-3 text-primary" />
                        </div>
                        <span className="text-sm font-medium">{item}</span>
                      </div>
                    ))}
                  </div>

                  <Link href="/signin" className="h-14 px-10 rounded-2xl text-lg font-bold border border-white/10 hover:bg-white/5 flex items-center justify-center transition-colors">
                    Start Free
                  </Link>
                </motion.div>

                {/* PRO */}
                <motion.div 
                  whileHover={{ scale: 1.02 }}
                  className="p-10 rounded-[32px] bg-gradient-to-b from-primary/20 to-accent/5 border border-primary/30 relative flex flex-col shadow-[0_0_80px_rgba(168,85,247,0.15)]"
                >
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-6 py-2 rounded-full bg-gradient-to-r from-primary to-accent text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-xl">Most Popular</div>
                  
                  <div className="mb-8">
                    <span className="px-4 py-1.5 rounded-full bg-primary/10 text-[10px] font-bold uppercase tracking-[0.2em] text-primary border border-primary/20">Pro Creator</span>
                    <div className="mt-6 flex items-baseline gap-2">
                      <span className="text-6xl font-black">$12</span>
                      <span className="text-muted-foreground font-medium">/month</span>
                    </div>
                    <p className="mt-4 text-muted-foreground font-medium">The full suite for serious creators.</p>
                  </div>

                  <div className="space-y-4 mb-10 flex-1">
                    {[
                      "Unlimited Pre-Flight runs",
                      "Full 4-persona parallel panel",
                      "Auto-refinement loop",
                      "4K No Watermark export",
                      "Drop-off map + analytics",
                      "Priority support"
                    ].map(item => (
                      <div key={item} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-sm font-bold">{item}</span>
                      </div>
                    ))}
                  </div>

                  <GlowButton className="h-14 rounded-2xl text-lg font-bold" asChild>
                    <Link href="/pricing">Get Pro Access</Link>
                  </GlowButton>
                </motion.div>
              </div>
            </div>
          </section>

          {/* TESTIMONIALS */}
          <section className="py-32 px-6 relative overflow-hidden">
            <div className="absolute inset-0 -z-10 bg-white/[0.01]" />
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">Creators who stopped guessing</h2>
                <p className="text-muted-foreground text-lg">Real results from the Pre-Flight beta.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {TESTIMONIALS.map((t, i) => (
                  <motion.div
                    key={t.name}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.15 }}
                    className="p-8 rounded-2xl nano-glass border-white/5 flex flex-col gap-5 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full -z-10" />
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, j) => (
                        <Star key={j} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <p className="text-sm font-medium text-foreground/80 leading-relaxed flex-1">&ldquo;{t.quote}&rdquo;</p>
                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                      <div>
                        <p className="text-sm font-black">{t.name}</p>
                        <p className="text-[10px] text-muted-foreground font-medium">{t.role}</p>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Pre-Flight Score</span>
                        <span className="text-lg font-black text-primary">{t.score}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* CTA SECTION */}
          <section className="py-40 px-6 relative">
            <div className="max-w-4xl mx-auto text-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="p-16 rounded-[48px] nano-glass border-white/10 relative overflow-hidden"
              >
                <div className="absolute inset-0 -z-10 bg-gradient-to-tr from-primary/10 via-transparent to-accent/10" />
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-primary mb-8">
                  <Shield className="w-3.5 h-3.5" /> Google AI Agents Challenge 2026
                </div>
                <h2 className="text-5xl md:text-7xl font-black mb-8 tracking-tight">Stop publishing <br /> in the dark.</h2>
                <p className="text-xl text-muted-foreground mb-12 max-w-xl mx-auto">
                  The only pre-publication AI system that runs a 6-agent Google ADK pipeline on your clip before you waste a single impression.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <GlowButton size="lg" className="h-16 px-12 rounded-2xl text-xl font-black" asChild>
                    <Link href="/editor">
                      Run Your First Pre-Flight <ArrowRight className="ml-3 w-6 h-6" />
                    </Link>
                  </GlowButton>
                  <Link href="/pricing" className="h-16 px-10 rounded-2xl text-lg font-bold border border-white/10 hover:bg-white/5 flex items-center justify-center gap-2 transition-colors">
                    View Pricing <ChevronRight className="w-5 h-5" />
                  </Link>
                </div>
              </motion.div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}

// Re-using the existing Button component if available, or a fallback
function Button({ className, variant, size, asChild, ...props }: any) {
  const Comp = asChild ? "span" : "button";
  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        variant === "outline" ? "border bg-transparent border-white/10 hover:bg-white/5" : "bg-primary text-primary-foreground",
        size === "lg" ? "h-12 px-8" : "h-10 px-4",
        className
      )}
      {...props}
    />
  );
}
