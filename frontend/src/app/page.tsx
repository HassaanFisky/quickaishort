"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { CinematicIntro } from "@/components/layout/CinematicIntro";
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from "framer-motion";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { motionProps } from "@/lib/animations";
import {
  Sparkles,
  Users,
  Target,
  ArrowRight,
  Brain,
  Zap,
  Video,
  Mic,
  Layers,
  Coffee,
  Trophy,
  Cpu,
  Clapperboard,
  Newspaper,
  Bot,
  Cloud
} from "lucide-react";
import { GlowButton } from "@/components/ui/GlowButton";
import { cn } from "@/lib/utils";
import { spring, containerVariants, itemVariants, staggerFast } from "@/lib/animations";
import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";

const PERSONAS = [
  {
    id: "genz",
    icon: Zap,
    title: "Gen Z",
    description: "Trend-driven, high BS-detector, short attention span.",
    color: "from-pink-500 to-rose-500",
    borderColor: "border-pink-500/30",
    verdict: "WATCHES",
    hook: "strong",
    reason: "Hook lands in first 1.2s. Pacing matches feed scroll behavior.",
  },
  {
    id: "millennial",
    icon: Coffee,
    title: "Millennial",
    description: "Aspirational, value-driven, prefers depth over flash.",
    color: "from-orange-500 to-yellow-500",
    borderColor: "border-orange-500/30",
    verdict: "WATCHES",
    hook: "moderate",
    reason: "Relatable framing but the CTA feels rushed.",
  },
  {
    id: "sports",
    icon: Trophy,
    title: "Sports Fan",
    description: "High energy, competitive, hooks on stakes and outcomes.",
    color: "from-emerald-500 to-teal-500",
    borderColor: "border-emerald-500/30",
    verdict: "SCROLLS",
    hook: "weak",
    reason: "No stakes in the first 3s. Missing the competitive hook.",
  },
  {
    id: "tech",
    icon: Cpu,
    title: "The Techie",
    description: "Values efficiency, technical depth, and clean aesthetics.",
    color: "from-blue-500 to-cyan-500",
    borderColor: "border-blue-500/30",
    verdict: "WATCHES",
    hook: "moderate",
    reason: "Good signal-to-noise. Loses them at the 18s explanation.",
  },
  {
    id: "entertainment",
    icon: Clapperboard,
    title: "Entertainment",
    description: "Story-first, emotion-driven, rewards personality and payoff.",
    color: "from-purple-500 to-fuchsia-500",
    borderColor: "border-purple-500/30",
    verdict: "WATCHES",
    hook: "strong",
    reason: "Clear setup-payoff arc. Personality carries the mid-section.",
  },
  {
    id: "news",
    icon: Newspaper,
    title: "News Watcher",
    description: "Fact-focused, skeptical of hype, wants the point up front.",
    color: "from-sky-500 to-indigo-500",
    borderColor: "border-sky-500/30",
    verdict: "SCROLLS",
    hook: "weak",
    reason: "Headline buried at 8s. Lead with the key fact, not the setup.",
  },
];

const FEATURES = [
  {
    icon: Mic,
    title: "Edit by conversation",
    body: "Tell the AI what to cut, caption, or reframe — it applies real timeline edits, not vague suggestions.",
    className: "md:col-span-2",
  },
  {
    icon: Video,
    title: "Live preview",
    body: "See every change on a 9:16 canvas before you commit — timeline stays the visualization, chat stays the control.",
    className: "md:col-span-1",
  },
  {
    icon: Layers,
    title: "Ingest → export",
    body: "Paste a YouTube link or upload a file. Transcribe in-browser. Export via cloud render when you’re ready.",
    className: "md:col-span-1",
  },
  {
    icon: Sparkles,
    title: "Grounded suggestions",
    body: "Chips above chat come from your media — trim, captions, dub, and more — not invented fluff.",
    className: "md:col-span-2",
  },
  {
    icon: Users,
    title: "Pre-Flight skill",
    body: "Optional audience simulation with six personas — a capability when you want validation, not the whole product.",
    className: "md:col-span-2",
  },
  {
    icon: Target,
    title: "Cloud export",
    body: "Server-side FFmpeg render to your library — Free 720p with watermark; Pro unlocks higher quality.",
    className: "md:col-span-1",
  },
];

const STACK = [
  {
    icon: Sparkles,
    title: "QuickAI editing brain",
    body: "Natural-language commands become structured timeline actions — trim, captions, reframes, and more.",
  },
  {
    icon: Bot,
    title: "Optional Pre-Flight",
    body: "When you want validation, a multi-agent audience panel can score hook and retention before you post.",
  },
  {
    icon: Mic,
    title: "Browser-side Whisper",
    body: "Transcription runs as WebAssembly in your tab — captions without waiting on a separate upload pipeline.",
  },
  {
    icon: Cloud,
    title: "Cloud rendering",
    body: "Final exports render on Cloud Run with FFmpeg and land in your export history, ready to download.",
  },
];

export default function LandingPage() {
  const [showIntro, setShowIntro] = useState(false);
  const [hasCheckedSession, setHasCheckedSession] = useState(false);
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const seen = sessionStorage.getItem("introSeen");
    if (!seen && !reduceMotion) {
      setShowIntro(true);
      sessionStorage.setItem("introSeen", "true");
    } else if (!seen) {
      sessionStorage.setItem("introSeen", "true");
    }
    setHasCheckedSession(true);
  }, [reduceMotion]);

  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });

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
        {/* Scroll progress bar (Stripe/Linear style) */}
        <motion.div className="scroll-progress" style={{ scaleX }} aria-hidden="true" />

        <Navbar />

        {/* Living Background */}
        <div className="living-water-bg" />

        <main>
          {/* HERO SECTION */}
          <section className="relative min-h-screen flex flex-col items-center justify-center pt-24 px-6 overflow-hidden">
            <motion.div style={{ opacity }} className="absolute inset-0 -z-10 pointer-events-none">
              <div className="hero-glow-a top-[20%] left-[10%] w-[500px] h-[500px] opacity-40" />
              <div className="hero-glow-b bottom-[20%] right-[10%] w-[600px] h-[600px] opacity-40" />
              <div className="hero-glow-c top-[35%] right-[30%] w-[400px] h-[400px] opacity-30" />
            </motion.div>

            <div className="max-w-6xl mx-auto w-full flex flex-col items-center text-center relative z-10">
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-col items-center"
              >
                <motion.h1 variants={itemVariants} className="text-5xl md:text-7xl lg:text-[5.5rem] font-black leading-[1.05] tracking-tighter mb-6 text-center">
                  Edit video{" "}
                  <br className="hidden md:block" />
                  <span className="brand-gradient-text">by conversation.</span>
                </motion.h1>

                <motion.p variants={itemVariants} className="text-lg md:text-xl text-muted-foreground mb-10 max-w-xl leading-relaxed text-center">
                  Paste a link or upload a file. Tell QuickAI what to cut, caption, or reframe.
                  Preview live — then export a short when it feels right.
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

            {/* Social Proof Ticker — alive, edge-faded, GPU-accelerated */}
            <div className="absolute bottom-10 w-full marquee-mask overflow-hidden">
              <div className="flex items-center gap-10 marquee-track px-4">
                {[...Array(3)].map((_, i) => (
                  <React.Fragment key={i}>
                    {[
                      "Paste a link. Talk to the editor.",
                      "Chat is the workflow. Timeline is the proof.",
                      "Trim. Caption. Reframe. Export.",
                      "AI applies the edit — you stay in control.",
                      "Upload or YouTube. Same clear path.",
                      "Preview first. Export when ready.",
                      "Optional Pre-Flight when you want a second opinion.",
                    ].map((text, j) => (
                      <span
                        key={`${text}-${i}-${j}`}
                        className="flex items-center gap-2.5 text-[12px] font-semibold tracking-wide px-2 text-foreground/80 whitespace-nowrap"
                      >
                        <span
                          className="marquee-dot w-1.5 h-1.5 rounded-full bg-primary shrink-0"
                          style={{ animationDelay: `${(i * 8 + j) * 120}ms` }}
                        />
                        {text}
                      </span>
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
                  From link to short{" "}
                  <span className="brand-gradient-text">in one flow</span>
                </h2>
                <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                  Ingest → chat → preview → export. Conversation drives the edit; you approve what ships.
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
                <div className="hidden md:block absolute top-[52px] left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent -z-10" />

                {[
                  { step: "01", icon: Video, title: "Ingest", desc: "Paste a YouTube URL or upload a file. We prepare the project and transcript." },
                  { step: "02", icon: Brain, title: "Chat to edit", desc: "Say what you want — trim silence, add captions, reframe — AI applies real edits." },
                  { step: "03", icon: Target, title: "Preview & export", desc: "Watch the result live, then render a short to your library when you’re ready." }
                ].map((item, i) => (
                  <motion.div
                    key={item.step}
                    {...motionProps(reduceMotion, {
                      initial: { opacity: 0, y: 24 },
                      animate: { opacity: 1, y: 0 },
                      transition: { ...spring.smooth, delay: i * 0.1 },
                    })}
                    className="flex flex-col items-center text-center group"
                  >
                    <motion.div
                      whileHover={reduceMotion ? undefined : { scale: 1.08, transition: spring.snappy }}
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
          <section id="features" className="py-32 px-6">
            <div className="max-w-5xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ ...spring.smooth }}
                className="text-center mb-16"
              >
                <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Everything you need to ship a short</h2>
                <p className="text-muted-foreground text-lg max-w-md mx-auto">One editor. Conversation in, polished clip out.</p>
              </motion.div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {FEATURES.map((feature, i) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    whileTap={{ scale: 0.98 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ ...spring.smooth, delay: i * 0.07 }}
                    onMouseMove={(e: React.MouseEvent<HTMLDivElement>) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      e.currentTarget.style.setProperty("--mouse-x", `${((e.clientX - rect.left) / rect.width) * 100}%`);
                      e.currentTarget.style.setProperty("--mouse-y", `${((e.clientY - rect.top) / rect.height) * 100}%`);
                    }}
                    className={cn(
                      "spotlight-card liquid-panel p-7 group relative overflow-hidden rounded-2xl cursor-pointer transition-shadow duration-300 hover:shadow-[0_8px_32px_rgba(168,85,247,0.08)]",
                      feature.className
                    )}
                  >
                    {/* Ambient glow on hover */}
                    <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
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
                <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">Optional Pre-Flight skill</h2>
                <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                  When you want a second opinion, simulate six audience lenses — without making validation the whole product.
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                        "w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-md shrink-0",
                        persona.color
                      )}>
                        <persona.icon className="w-5 h-5 text-white" aria-hidden="true" />
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

          {/* PRODUCT TRUTH — THE STACK */}
          <section className="py-32 px-6 border-y ghost-border">
            <div className="max-w-5xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ ...spring.smooth }}
                className="text-center mb-16"
              >
                <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">What actually runs</h2>
                <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                  Clear pieces for editing, transcription, optional validation, and cloud export — no mystery workflow.
                </p>
              </motion.div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {STACK.map((item, i) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -4, transition: spring.smooth }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ ...spring.smooth, delay: i * 0.08 }}
                    className="p-7 rounded-2xl nano-glass border border-white/5 flex flex-col gap-4 relative overflow-hidden"
                  >
                    <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <item.icon className="w-5 h-5 text-primary" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black tracking-tight mb-1.5">{item.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
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
                    Your next short<br />
                    <span className="brand-gradient-text">starts with a sentence.</span>
                  </h2>
                  <p className="text-base text-muted-foreground mb-10 max-w-sm mx-auto leading-relaxed">
                    Open the editor, bring a clip, and tell QuickAI what to do. Preview live — export when it feels right.
                  </p>
                  <GlowButton size="lg" variant="gradient" className="h-14 px-10 rounded-2xl text-base font-bold" asChild>
                    <Link href="/editor">
                      Start Creating <ArrowRight className="ml-2.5 w-5 h-5" />
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
