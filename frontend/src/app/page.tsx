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
  Check,
  ArrowRight,
  Play,
  Brain,
  Shield,
  Star,
  ChevronRight,
  Zap,
  BarChart,
  Video
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
    verdict: "SCROLLS",
    hook: "weak",
    reason: "No stakes in the first 3s. Missing the competitive hook.",
  },
];

const FEATURES = [
  {
    icon: Users,
    title: "4 Audience Personas",
    body: "Test your hook against diverse AI personas simulating real viewers.",
    className: "md:col-span-2",
  },
  {
    icon: Target,
    title: "Consensus Score",
    body: "Get a clear 0-100 score predicting viral potential before you post.",
    className: "md:col-span-1",
  },
  {
    icon: Sparkles,
    title: "Actionable Feedback",
    body: "Receive line-by-line critiques on pacing, hook, and retention.",
    className: "md:col-span-1",
  },
  {
    icon: BarChart,
    title: "Drop-off Mapping",
    body: "See exactly where viewers tune out and why, powered by Gemini 2.5 Flash.",
    className: "md:col-span-2",
  },
];

const TESTIMONIALS = [
  {
    quote: "Pre-Flight caught that my hook was weak for Gen Z before I wasted 48 hours of reach. Literal game changer.",
    name: "Marcus T.",
    role: "1.2M Sub Creator",
    score: 94,
  },
  {
    quote: "I went from 12% average retention to 67% in 3 weeks just by listening to the persona panel. Nothing else changed.",
    name: "Priya N.",
    role: "Lifestyle & Wellness",
    score: 88,
  },
  {
    quote: "The Skeptic persona saved me from posting the most cringe thumbnail I've ever made. Worth every penny.",
    name: "Jake R.",
    role: "Sports Analyst",
    score: 71,
  },
];

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
  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

  if (!hasCheckedSession) return null;

  return (
    <>
      <AnimatePresence mode="wait">
        {showIntro && (
          <motion.div key="intro" exit={{ opacity: 0 }} transition={{ duration: 1 }}>
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
          <section className="relative min-h-screen flex flex-col items-center justify-center pt-24 px-6 overflow-hidden">
            <motion.div style={{ opacity }} className="absolute inset-0 -z-10 pointer-events-none">
              <div className="hero-glow-a top-[20%] left-[10%] w-[500px] h-[500px] opacity-20" />
              <div className="hero-glow-b bottom-[20%] right-[10%] w-[600px] h-[600px] opacity-20" />
            </motion.div>

            <div className="max-w-6xl mx-auto w-full flex flex-col items-center text-center relative z-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="flex flex-col items-center"
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-primary mb-8 fade-up shadow-[0_0_20px_rgba(168,85,247,0.2)]">
                  <Shield className="w-4 h-4" />
                  Built for Google AI Agents Challenge 2026
                </div>

                <h1 className="text-5xl md:text-7xl lg:text-8xl font-black leading-[1.1] tracking-tighter mb-6 fade-up" style={{ animationDelay: '0.1s' }}>
                  Know your clip <br className="hidden md:block" />
                  <span className="premium-gradient-text block mt-2">
                    will go viral.
                  </span>
                </h1>

                <p className="text-lg md:text-2xl text-muted-foreground mb-10 max-w-2xl leading-relaxed fade-up" style={{ animationDelay: '0.2s' }}>
                  Simulate real audience retention before you post. Stop guessing and let AI personas guarantee your next hit.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4 fade-up w-full sm:w-auto" style={{ animationDelay: '0.3s' }}>
                  <GlowButton size="lg" className="w-full sm:w-auto h-14 px-10 rounded-2xl text-lg font-bold interactive" asChild>
                    <Link href="/editor">
                      Start Creating <ArrowRight className="ml-2 w-5 h-5" />
                    </Link>
                  </GlowButton>
                  <Link href="#how" className="w-full sm:w-auto h-14 px-10 rounded-2xl text-lg font-bold border border-white/10 hover:bg-white/5 flex items-center justify-center gap-2 interactive">
                    See How It Works
                  </Link>
                </div>
              </motion.div>
            </div>
            
            {/* Social Proof Ticker */}
            <div className="absolute bottom-10 w-full overflow-hidden fade-up" style={{ animationDelay: '0.6s' }}>
              <div className="flex items-center gap-8 marquee-track opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                {[...Array(2)].map((_, i) => (
                  <React.Fragment key={i}>
                    {["Powered by Gemini 2.5 Flash", "Next.js 14", "Framer Motion", "Google Cloud", "TailwindCSS"].map((tech) => (
                      <div key={tech} className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest px-8">
                        <Zap className="w-4 h-4 text-primary" /> {tech}
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </section>

          {/* HOW IT WORKS / PIPELINE SECTION */}
          <section id="how" className="py-32 px-6 relative border-y ghost-border bg-black/40">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-20 fade-up">
                <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tight">The 3-Step Pre-Flight Pipeline</h2>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                  From raw YouTube link to a validated, high-retention short in seconds.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
                {/* Connecting Line (Desktop) */}
                <div className="hidden md:block absolute top-[50px] left-[15%] right-[15%] h-1 bg-gradient-to-r from-primary/10 via-primary/50 to-accent/10 -z-10" />

                {[
                  { step: "01", icon: Video, title: "Paste URL", desc: "Drop any YouTube link. We instantly extract and process the video." },
                  { step: "02", icon: Brain, title: "AI Analyzes", desc: "A panel of 6 AI personas watches the clip, grading hook and retention." },
                  { step: "03", icon: Target, title: "Get Viral Clips", desc: "Receive actionable edits or export the proven clip immediately." }
                ].map((item, i) => (
                  <motion.div 
                    key={item.step}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.2 }}
                    className="flex flex-col items-center text-center group"
                  >
                    <div className="w-24 h-24 rounded-full nano-glass flex items-center justify-center mb-6 relative border border-white/10 group-hover:border-primary/50 transition-colors interactive">
                      <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                      <item.icon className="w-10 h-10 text-primary" />
                      <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-background border border-white/10 flex items-center justify-center font-black text-xs text-muted-foreground shadow-xl">
                        {item.step}
                      </div>
                    </div>
                    <h3 className="text-2xl font-black mb-3">{item.title}</h3>
                    <p className="text-muted-foreground leading-relaxed px-4">{item.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* BENTO GRID FEATURES */}
          <section className="py-32 px-6 bg-white/[0.01]">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-20">
                <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Everything you need to go viral</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {FEATURES.map((feature, i) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className={cn(
                      "liquid-panel p-8 group relative overflow-hidden interactive",
                      feature.className
                    )}
                  >
                    <feature.icon className="w-10 h-10 text-primary mb-6" />
                    <h3 className="text-2xl font-black mb-3 tracking-tight">{feature.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{feature.body}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* PERSONA SHOWCASE */}
          <section className="py-32 px-6 relative overflow-hidden">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-20">
                <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tight">The AI Persona Panel</h2>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                  Test your content against simulated audiences before you post.
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
                    className={cn("group relative p-6 rounded-2xl nano-glass border interactive", persona.borderColor)}
                  >
                    <div className={cn("absolute top-0 right-0 w-40 h-40 blur-3xl opacity-10 -z-10 bg-gradient-to-br", persona.color)} />
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br text-2xl shadow-lg", persona.color)}>
                          {persona.emoji}
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Agent</p>
                          <p className="text-base font-black">{persona.title}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mb-4">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-widest",
                        persona.hook === "strong" ? "text-emerald-400" : persona.hook === "moderate" ? "text-amber-400" : "text-red-400"
                      )}>
                        Hook: {persona.hook}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground/80 font-medium leading-relaxed italic border-l-2 border-white/10 pl-3">
                      &ldquo;{persona.reason}&rdquo;
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* TESTIMONIALS */}
          <section className="py-32 px-6 border-y ghost-border bg-black/20">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">Creators who stopped guessing</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {TESTIMONIALS.map((t, i) => (
                  <motion.div
                    key={t.name}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.15 }}
                    className="p-8 rounded-2xl nano-glass border-white/5 flex flex-col gap-5 relative interactive"
                  >
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, j) => (
                        <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <p className="text-base font-medium text-foreground/90 leading-relaxed flex-1">&ldquo;{t.quote}&rdquo;</p>
                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                      <div>
                        <p className="text-base font-black">{t.name}</p>
                        <p className="text-xs text-muted-foreground font-medium">{t.role}</p>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pre-Flight</span>
                        <span className="text-xl font-black text-primary">{t.score}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* CTA SECTION */}
          <section className="py-40 px-6 relative overflow-hidden">
            <div className="max-w-4xl mx-auto text-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="gradient-border p-[1px] rounded-[48px] shadow-2xl shadow-primary/20"
              >
                <div className="p-16 rounded-[48px] glass-surface relative overflow-hidden bg-background/80">
                  <div className="absolute inset-0 -z-10 bg-gradient-to-tr from-primary/20 via-transparent to-accent/20" />
                  <h2 className="text-5xl md:text-7xl font-black mb-8 tracking-tight">Stop publishing <br /> in the dark.</h2>
                  <p className="text-xl text-muted-foreground mb-12 max-w-xl mx-auto leading-relaxed">
                    Test your content before you post. Get actionable AI feedback to guarantee your next viral hit.
                  </p>
                  <GlowButton size="lg" className="h-16 px-12 rounded-2xl text-xl font-black interactive" asChild>
                    <Link href="/editor">
                      Run Your First Pre-Flight <ArrowRight className="ml-3 w-6 h-6" />
                    </Link>
                  </GlowButton>
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
