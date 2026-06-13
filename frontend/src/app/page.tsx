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
  Video,
  Mic,
  Layers
} from "lucide-react";
import { GlowButton } from "@/components/ui/GlowButton";
import { cn } from "@/lib/utils";
import { spring, containerVariants, itemVariants, staggerFast } from "@/lib/animations";
import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";

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
  {
    icon: Video,
    title: "AI Video Editor",
    body: "Full non-linear editor with canvas, captions, B-roll, and AI-powered scene composition — all in the browser.",
    className: "md:col-span-2",
  },
  {
    icon: Mic,
    title: "Edit by Voice or Text",
    body: "Tell the AI to trim silences, add a caption, or reframe the shot — it executes in one command.",
    className: "md:col-span-1",
  },
  {
    icon: Layers,
    title: "Timeline + Canvas",
    body: "Multi-track timeline with keyframe animations, transitions, and real-time 9:16 preview for Shorts.",
    className: "md:col-span-1",
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
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-col items-center"
              >
                <motion.div variants={itemVariants} className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-primary mb-8 shadow-[0_0_20px_rgba(168,85,247,0.2)]">
                  <Shield className="w-3.5 h-3.5" />
                  Built for Google AI Agents Challenge 2026
                </motion.div>

                <motion.h1 variants={itemVariants} className="text-5xl md:text-7xl lg:text-[5.5rem] font-black leading-[1.05] tracking-tighter mb-6 text-center">
                  Know your clip <br className="hidden md:block" />
                  <span className="brand-gradient-text">
                    will go viral.
                  </span>
                </motion.h1>

                <motion.p variants={itemVariants} className="text-lg md:text-xl text-muted-foreground mb-10 max-w-xl leading-relaxed text-center">
                  Edit your short with AI, then validate it against 6 audience personas before you post. From timeline to viral — one platform.
                </motion.p>

                <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                  <GlowButton size="lg" variant="gradient" className="w-full sm:w-auto h-14 px-10 rounded-2xl text-base font-bold" asChild>
                    <Link href="/editor">
                      Start Creating <ArrowRight className="ml-2 w-5 h-5" />
                    </Link>
                  </GlowButton>
                  <GlowButton size="lg" variant="outline" className="w-full sm:w-auto h-14 px-10 rounded-2xl text-base font-bold" asChild>
                    <Link href="#how">See How It Works</Link>
                  </GlowButton>
                </motion.div>
              </motion.div>
            </div>
            
            {/* Social Proof Ticker */}
            <div className="absolute bottom-10 w-full overflow-hidden">
              <div className="flex items-center gap-8 marquee-track opacity-40 hover:opacity-70 transition-opacity duration-500">
                {[...Array(2)].map((_, i) => (
                  <React.Fragment key={i}>
                    {["Gemini 2.5 Flash", "Google ADK v1", "Next.js 14", "Framer Motion", "Google Cloud Run", "Tailwind v4"].map((tech) => (
                      <div key={tech} className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] px-8 text-muted-foreground whitespace-nowrap">
                        <Zap className="w-3 h-3 text-primary/60" /> {tech}
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </section>

          {/* HOW IT WORKS / PIPELINE SECTION */}
          <section id="how" className="py-32 px-6 relative border-y ghost-border bg-black/30">
            <div className="max-w-5xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ ...spring.smooth }}
                className="text-center mb-20"
              >
                <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">
                  The 3-Step <span className="brand-gradient-text">Pre-Flight</span> Pipeline
                </h2>
                <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                  From raw YouTube link to a validated, high-retention short in seconds.
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
                <div className="hidden md:block absolute top-[52px] left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent -z-10" />

                {[
                  { step: "01", icon: Video, title: "Paste URL", desc: "Drop any YouTube link. We instantly extract and process the video." },
                  { step: "02", icon: Brain, title: "AI Analyzes", desc: "A panel of 6 AI personas watches the clip, grading hook and retention." },
                  { step: "03", icon: Target, title: "Get Viral Clips", desc: "Receive actionable edits or export the proven clip immediately." }
                ].map((item, i) => (
                  <motion.div
                    key={item.step}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ ...spring.smooth, delay: i * 0.1 }}
                    className="flex flex-col items-center text-center group"
                  >
                    <motion.div
                      whileHover={{ scale: 1.08, transition: spring.snappy }}
                      className="w-[104px] h-[104px] rounded-2xl nano-glass flex items-center justify-center mb-6 relative border border-white/8 group-hover:border-primary/40"
                    >
                      <div className="absolute inset-0 bg-primary/10 rounded-2xl blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <item.icon className="w-9 h-9 text-primary relative z-10" />
                      <div className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-[hsl(var(--bg-subtle))] border border-white/10 flex items-center justify-center font-black text-[10px] text-muted-foreground tracking-wider shadow-lg">
                        {item.step}
                      </div>
                    </motion.div>
                    <h3 className="text-xl font-black mb-2 tracking-tight">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed px-4 max-w-[200px]">{item.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* BENTO GRID FEATURES */}
          <section className="py-32 px-6">
            <div className="max-w-5xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ ...spring.smooth }}
                className="text-center mb-16"
              >
                <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Everything you need to go viral</h2>
                <p className="text-muted-foreground text-lg max-w-md mx-auto">One tool. Every insight.</p>
              </motion.div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {FEATURES.map((feature, i) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -5, transition: spring.smooth }}
                    whileTap={{ scale: 0.98 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ ...spring.smooth, delay: i * 0.07 }}
                    className={cn(
                      "liquid-panel p-7 group relative overflow-hidden rounded-2xl cursor-pointer",
                      feature.className
                    )}
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 group-hover:bg-primary/15 transition-colors duration-200">
                      <feature.icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-xl font-black mb-2 tracking-tight">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.body}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* PERSONA SHOWCASE */}
          <section className="py-32 px-6 relative overflow-hidden border-t ghost-border bg-black/20">
            <div className="max-w-5xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ ...spring.smooth }}
                className="text-center mb-16"
              >
                <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">The AI Persona Panel</h2>
                <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                  Test your content against simulated audiences before you post.
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {PERSONAS.map((persona, i) => (
                  <motion.div
                    key={persona.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -6, scale: 1.02, transition: spring.smooth }}
                    whileTap={{ scale: 0.97 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ ...spring.smooth, delay: i * 0.08 }}
                    className={cn(
                      "group relative p-5 rounded-2xl nano-glass border overflow-hidden cursor-pointer",
                      persona.borderColor
                    )}
                  >
                    <div className={cn("absolute -top-6 -right-6 w-28 h-28 blur-3xl opacity-[0.12] bg-gradient-to-br pointer-events-none", persona.color)} />

                    {/* Verdict badge */}
                    <div className="flex items-center justify-between mb-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br text-xl shadow-md shrink-0",
                        persona.color
                      )}>
                        {persona.emoji}
                      </div>
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-[0.12em] px-2 py-1 rounded-full border",
                        persona.verdict === "WATCHES"
                          ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                          : persona.verdict === "SCROLLS"
                          ? "text-red-400 border-red-500/30 bg-red-500/10"
                          : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                      )}>
                        {persona.verdict}
                      </span>
                    </div>

                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Persona</p>
                    <p className="text-sm font-black mb-3">{persona.title}</p>

                    {/* Hook meter */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Hook</span>
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-wider",
                          persona.hook === "strong" ? "text-emerald-400" : persona.hook === "moderate" ? "text-amber-400" : "text-red-400"
                        )}>{persona.hook}</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                        <div className={cn(
                          "h-full rounded-full bg-gradient-to-r transition-all",
                          persona.hook === "strong" ? "w-[85%] from-emerald-500 to-teal-400" :
                          persona.hook === "moderate" ? "w-[55%] from-amber-500 to-yellow-400" :
                          "w-[25%] from-red-500 to-orange-400"
                        )} />
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground/80 leading-relaxed border-l-2 border-white/10 pl-2.5 italic">
                      &ldquo;{persona.reason}&rdquo;
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* TESTIMONIALS */}
          <section className="py-32 px-6 border-y ghost-border">
            <div className="max-w-5xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ ...spring.smooth }}
                className="text-center mb-16"
              >
                <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">Creators who stopped guessing</h2>
              </motion.div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {TESTIMONIALS.map((t, i) => (
                  <motion.div
                    key={t.name}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -5, transition: spring.smooth }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ ...spring.smooth, delay: i * 0.1 }}
                    className="p-7 rounded-2xl nano-glass border border-white/5 flex flex-col gap-5 relative cursor-pointer"
                  >
                    <div className="flex items-center gap-0.5">
                      {[...Array(5)].map((_, j) => (
                        <Star key={j} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <p className="text-sm font-medium text-foreground/85 leading-relaxed flex-1">&ldquo;{t.quote}&rdquo;</p>
                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                      <div>
                        <p className="text-sm font-black">{t.name}</p>
                        <p className="text-xs text-muted-foreground font-medium">{t.role}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Pre-Flight</span>
                        <span className={cn(
                          "text-2xl font-black font-mono",
                          t.score >= 90 ? "score-viral" :
                          t.score >= 71 ? "score-strong" :
                          t.score >= 41 ? "score-moderate" : "score-weak"
                        )}>{t.score}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* CTA SECTION */}
          <section className="py-40 px-6 relative overflow-hidden">
            <div className="max-w-3xl mx-auto text-center">
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ ...spring.smooth }}
                className="gradient-border p-[1px] rounded-[40px] shadow-2xl shadow-primary/20"
              >
                <div className="p-14 md:p-20 rounded-[39px] glass-strong relative overflow-hidden">
                  <div className="absolute inset-0 -z-10 bg-gradient-to-tr from-primary/15 via-transparent to-[#ec4899]/10" />
                  <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-primary/20 blur-[80px] -z-10 rounded-full" />
                  <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tight leading-[1.1]">
                    Stop publishing<br />
                    <span className="brand-gradient-text">in the dark.</span>
                  </h2>
                  <p className="text-base text-muted-foreground mb-10 max-w-sm mx-auto leading-relaxed">
                    Test your content before you post. Get actionable AI feedback to guarantee your next viral hit.
                  </p>
                  <GlowButton size="lg" variant="gradient" className="h-14 px-10 rounded-2xl text-base font-bold" asChild>
                    <Link href="/editor">
                      Run Your First Pre-Flight <ArrowRight className="ml-2.5 w-5 h-5" />
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
