"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { CinematicIntro } from "@/components/layout/CinematicIntro";
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Users,
  Check,
  ArrowRight,
  MessageSquare,
  Eye,
  Zap,
  Video,
  Mic,
  Layers,
  ShieldCheck,
  Upload,
  Download,
} from "lucide-react";
import { GlowButton } from "@/components/ui/GlowButton";
import { cn } from "@/lib/utils";
import { spring, containerVariants, itemVariants } from "@/lib/animations";
import { BILLING_PLANS } from "@/lib/billing-plans";

/** Pre-Flight personas — skill framing only (ADK UI Coming Soon). */
const PERSONAS = [
  {
    id: "genz",
    emoji: "⚡",
    title: "Gen Z",
    description: "Trend-driven, high BS-detector, short attention span.",
    color: "from-pink-500 to-rose-500",
    borderColor: "border-pink-500/30",
  },
  {
    id: "tech",
    emoji: "🖥️",
    title: "The Techie",
    description: "Values efficiency, technical depth, and clean aesthetics.",
    color: "from-blue-500 to-cyan-500",
    borderColor: "border-blue-500/30",
  },
  {
    id: "millennial",
    emoji: "💼",
    title: "Millennial",
    description: "Aspirational, value-driven, prefers depth over flash.",
    color: "from-orange-500 to-yellow-500",
    borderColor: "border-orange-500/30",
  },
  {
    id: "sports",
    emoji: "🏆",
    title: "Sports Fan",
    description: "High energy, competitive, hooks on stakes and outcomes.",
    color: "from-emerald-500 to-teal-500",
    borderColor: "border-emerald-500/30",
  },
];

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Chat is the edit",
    body: "Tell QuickAI what to cut, caption, reframe, or dub — it executes on the timeline.",
    className: "md:col-span-2",
  },
  {
    icon: Mic,
    title: "Voice or text",
    body: "Speak or type. Same command path. Instant preview after every change.",
    className: "md:col-span-1",
  },
  {
    icon: Video,
    title: "Ingest → export",
    body: "Paste a YouTube link or upload a file. Preview live. Export a short when it feels right.",
    className: "md:col-span-1",
  },
  {
    icon: Layers,
    title: "Timeline + canvas",
    body: "Multi-track timeline, captions, and real-time 9:16 preview built for Shorts.",
    className: "md:col-span-2",
  },
];

const FLOW_STEPS = [
  {
    step: "01",
    icon: Upload,
    title: "Ingest",
    desc: "Paste a YouTube URL or drop a file. Transcription and facets kick in.",
  },
  {
    step: "02",
    icon: MessageSquare,
    title: "Chat",
    desc: "Say what to change. AI applies wired edits — trim, captions, boost, dub.",
  },
  {
    step: "03",
    icon: Eye,
    title: "Preview",
    desc: "Watch every change live on the canvas before you commit.",
  },
  {
    step: "04",
    icon: Download,
    title: "Export",
    desc: "Ship a Final render when the cut feels right. You stay the director.",
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
        <motion.div className="scroll-progress" style={{ scaleX }} aria-hidden="true" />

        <Navbar />

        <div className="living-water-bg" />

        <main>
          {/* HERO — brand + chat-is-edit promise + one CTA */}
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
                <motion.p
                  variants={itemVariants}
                  className="text-[11px] md:text-xs font-black uppercase tracking-[0.22em] text-muted-foreground mb-5"
                >
                  QuickAI Short
                </motion.p>

                <motion.h1 variants={itemVariants} className="text-5xl md:text-7xl lg:text-[5.5rem] font-black leading-[1.05] tracking-tighter mb-6 text-center">
                  Chat is{" "}
                  <span className="brand-gradient-text">the edit.</span>
                </motion.h1>

                <motion.p variants={itemVariants} className="text-lg md:text-xl text-muted-foreground mb-10 max-w-xl leading-relaxed text-center">
                  Ingest a clip. Tell the AI what to change. Preview live. Export a short —
                  conversation is the workflow.
                </motion.p>

                <motion.div variants={itemVariants} className="flex flex-col items-center gap-4">
                  <GlowButton size="lg" variant="gradient" className="w-full sm:w-auto h-14 px-10 rounded-2xl text-base font-bold" asChild>
                    <Link href="/editor">
                      Open Editor <ArrowRight className="ml-2 w-5 h-5" />
                    </Link>
                  </GlowButton>
                  <Link
                    href="#how"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
                  >
                    See the flow
                  </Link>
                </motion.div>
              </motion.div>
            </div>

            <div className="absolute bottom-10 w-full marquee-mask overflow-hidden">
              <div className="flex items-center gap-10 marquee-track px-4">
                {[...Array(3)].map((_, i) => (
                  <React.Fragment key={i}>
                    {[
                      "Ingest. Chat. Preview. Export.",
                      "You direct. AI performs.",
                      "Trim silences in one sentence.",
                      "Captions, dubs, boosts — from chat.",
                      "Conversation is the editing workflow.",
                      "Timeline shows the result.",
                      "No guessing. Just steer.",
                      "Built for Shorts. Honest about what's live.",
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

          {/* HOW IT WORKS — product flow, not Pre-Flight identity */}
          <section id="how" className="py-28 md:py-32 px-6 relative border-y ghost-border bg-black/30 scroll-mt-24">
            <div className="max-w-5xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ ...spring.smooth }}
                className="text-center mb-16 md:mb-20"
              >
                <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">
                  Four steps. <span className="brand-gradient-text">One conversation.</span>
                </h2>
                <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                  The product loop — not a separate wizard.
                </p>
              </motion.div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
                <div className="hidden lg:block absolute top-[52px] left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent -z-10" />

                {FLOW_STEPS.map((item, i) => (
                  <motion.div
                    key={item.step}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ ...spring.smooth, delay: i * 0.08 }}
                    className="flex flex-col items-center text-center group"
                  >
                    <motion.div
                      whileHover={{ scale: 1.06, transition: spring.snappy }}
                      className="w-[96px] h-[96px] rounded-2xl nano-glass flex items-center justify-center mb-5 relative border border-white/8 group-hover:border-primary/40"
                    >
                      <div className="absolute inset-0 bg-primary/10 rounded-2xl blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <item.icon className="w-8 h-8 text-primary relative z-10" />
                      <div className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-[hsl(var(--bg-subtle))] border border-white/10 flex items-center justify-center font-black text-[10px] text-muted-foreground tracking-wider shadow-lg">
                        {item.step}
                      </div>
                    </motion.div>
                    <h3 className="text-lg font-black mb-2 tracking-tight">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed px-2 max-w-[220px]">{item.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* FEATURES — chat editor capabilities */}
          <section id="features" className="py-28 md:py-32 px-6 scroll-mt-24">
            <div className="max-w-5xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ ...spring.smooth }}
                className="text-center mb-14 md:mb-16"
              >
                <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
                  Built for the cut
                </h2>
                <p className="text-muted-foreground text-lg max-w-md mx-auto">
                  Content over chrome. Chat steers. Timeline proves it.
                </p>
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

          {/* PRE-FLIGHT — demoted to skill / coming capability */}
          <section className="py-28 md:py-32 px-6 relative overflow-hidden border-t ghost-border bg-black/20">
            <div className="max-w-5xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ ...spring.smooth }}
                className="text-center mb-12 md:mb-14"
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-muted-foreground text-[10px] font-black uppercase tracking-[0.14em] mb-5">
                  <Sparkles className="w-3 h-3 text-primary" />
                  Skill · Coming capability
                </div>
                <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">
                  Pre-Flight personas
                </h2>
                <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                  Audience simulation is an optional skill when you want a second opinion —
                  not the product&apos;s sole identity. Available from the editor when credits allow.
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {PERSONAS.map((persona, i) => (
                  <motion.div
                    key={persona.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -4, transition: spring.smooth }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ ...spring.smooth, delay: i * 0.08 }}
                    className={cn(
                      "group relative p-5 rounded-2xl nano-glass border overflow-hidden",
                      persona.borderColor
                    )}
                  >
                    <div className={cn("absolute -top-6 -right-6 w-28 h-28 blur-3xl opacity-[0.1] bg-gradient-to-br pointer-events-none", persona.color)} />

                    <div className="flex items-center justify-between mb-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br text-xl shadow-md shrink-0",
                        persona.color
                      )}>
                        {persona.emoji}
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-[0.12em] px-2 py-1 rounded-full border border-white/10 bg-white/5 text-muted-foreground">
                        Soon
                      </span>
                    </div>

                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Persona</p>
                    <p className="text-sm font-black mb-2">{persona.title}</p>
                    <p className="text-xs text-muted-foreground/80 leading-relaxed">
                      {persona.description}
                    </p>
                  </motion.div>
                ))}
              </div>

              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ ...spring.smooth, delay: 0.2 }}
                className="mt-10 text-center text-sm text-muted-foreground max-w-lg mx-auto flex items-start justify-center gap-2"
              >
                <Users className="w-4 h-4 shrink-0 mt-0.5 text-primary/70" aria-hidden="true" />
                <span>
                  Live product today: conversational editor. Pre-Flight stays a capability —
                  not a fake live wizard.
                </span>
              </motion.p>
            </div>
          </section>

          {/* PRICING — honest Free / Pro (unchanged catalog) */}
          <section id="pricing" aria-label="Pricing" className="py-28 md:py-32 px-6 border-t ghost-border bg-black/20 scroll-mt-24">
            <div className="max-w-6xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ ...spring.smooth }}
                className="text-center mb-14 md:mb-16"
              >
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-primary text-xs font-bold uppercase tracking-widest mb-6">
                  <Sparkles className="w-3 h-3" />
                  Paddle Billing
                </div>
                <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">
                  Clear plans. <span className="brand-gradient-text">No dark patterns.</span>
                </h2>
                <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                  Free is honest 720p with watermark — Pro removes the ceiling via secure Paddle checkout.
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {BILLING_PLANS.map((plan, i) => (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ ...spring.smooth, delay: i * 0.08 }}
                    className={cn(
                      "relative rounded-[2rem] p-8 flex flex-col gap-6",
                      plan.highlight
                        ? "nano-glass border-2 border-transparent bg-origin-border shadow-[0_0_40px_rgba(168,85,247,0.12)] [background-image:linear-gradient(hsl(var(--bg-base)),hsl(var(--bg-base))),linear-gradient(135deg,#a855f7,#ec4899)] [background-clip:padding-box,border-box]"
                        : "nano-glass border border-white/5",
                    )}
                  >
                    {plan.highlight && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                        <Zap className="w-3 h-3 fill-current" />
                        Most Popular
                      </div>
                    )}

                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">
                        {plan.name}
                      </h3>
                      <div className="flex items-end gap-2 mb-2">
                        <span className="text-5xl font-bold tracking-tighter">{plan.price}</span>
                        <span className="text-muted-foreground text-sm pb-1">/{plan.period}</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{plan.description}</p>
                    </div>

                    <ul className="space-y-3 flex-1">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3 text-sm">
                          <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <span className="text-foreground/80">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {plan.href !== "#" ? (
                      <GlowButton
                        variant={plan.highlight ? "premium" : "glass"}
                        className="w-full h-12 rounded-2xl font-bold group"
                        asChild
                      >
                        <Link href={plan.href}>
                          {plan.cta}
                          <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </Link>
                      </GlowButton>
                    ) : (
                      <GlowButton variant="glass" className="w-full h-12 rounded-2xl font-bold" disabled>
                        {plan.cta}
                      </GlowButton>
                    )}
                  </motion.div>
                ))}
              </div>

              <p className="flex items-center justify-center gap-2 text-center text-muted-foreground text-sm mt-12">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                Payments secured by Paddle. Cancel anytime.
              </p>
            </div>
          </section>

          {/* CTA — chat-first close */}
          <section className="py-32 md:py-40 px-6 relative overflow-hidden">
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
                    Stop clicking.<br />
                    <span className="brand-gradient-text">Start directing.</span>
                  </h2>
                  <p className="text-base text-muted-foreground mb-10 max-w-sm mx-auto leading-relaxed">
                    Open the editor. Paste a link. Tell QuickAI what to cut — the timeline does the rest.
                  </p>
                  <GlowButton size="lg" variant="gradient" className="h-14 px-10 rounded-2xl text-base font-bold" asChild>
                    <Link href="/editor">
                      Open Editor <ArrowRight className="ml-2.5 w-5 h-5" />
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
