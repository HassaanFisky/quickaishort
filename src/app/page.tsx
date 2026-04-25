"use client";

import Link from "next/link";
import { GlowButton } from "@/components/ui/GlowButton";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Scissors,
  Zap,
  Shield,
  PlayCircle,
  ArrowRight,
  Sparkles,
  Cpu,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRef } from "react";

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-background text-foreground selection:bg-primary/30 overflow-x-hidden"
    >
      <Navbar />

      <main>
        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center justify-center pt-20 pb-20 overflow-hidden">
          {/* Animated Background Elements */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/20 blur-[120px] rounded-full animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-600/10 blur-[100px] rounded-full animate-pulse delay-700" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0,transparent_70%)]" />
          </div>

          <div className="container mx-auto px-6 relative z-10 text-center">
            <motion.div
              style={{ y, opacity }}
              className="flex flex-col items-center"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <Badge
                  variant="outline"
                  className="mb-8 px-4 py-1.5 text-xs font-bold border-white/10 bg-white/5 text-primary nano-glow backdrop-blur-md rounded-full"
                >
                  <Sparkles className="w-3 h-3 mr-2" />
                  NANO REDESIGN IS LIVE
                </Badge>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter mb-4 leading-[0.85] premium-gradient-text"
              >
                VIRAL SHORTS.
                <br />
                <span className="text-primary">NO LIMITS.</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="text-sm md:text-base font-semibold text-muted-foreground tracking-wide mb-4"
              >
                Know before you post.{" "}
                <span className="text-primary">Pre-Flight AI</span> validates every clip before it goes live.
              </motion.p>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-lg md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-12 leading-relaxed"
              >
                The world&apos;s fastest client-side AI video engine. Zero
                server delay, total privacy, and unmatched performance—processed
                entirely in your browser.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="flex flex-col sm:flex-row items-center justify-center gap-4"
              >
                <GlowButton
                  variant="premium"
                  size="lg"
                  className="h-14 px-10 rounded-2xl group"
                  asChild
                >
                  <Link href="/editor">
                    Start Creating Now
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </GlowButton>
                <GlowButton
                  variant="glass"
                  size="lg"
                  className="h-14 px-10 rounded-2xl"
                >
                  <PlayCircle className="mr-2 w-5 h-5" />
                  Watch Demo
                </GlowButton>
              </motion.div>
            </motion.div>
          </div>

          {/* Bottom Fade Gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-linear-to-t from-background to-transparent" />
        </section>

        {/* Feature Grid: Nano Modern Bento */}
        <section id="features" className="py-32 relative">
          <div className="container mx-auto px-6 max-w-7xl">
            <div className="flex flex-col md:flex-row items-end justify-between mb-20 gap-8">
              <div className="max-w-2xl">
                <h2 className="text-4xl md:text-6xl font-bold mb-6 tracking-tighter">
                  ENGINEERED FOR <span className="text-primary">SPEED.</span>
                </h2>
                <p className="text-muted-foreground text-xl">
                  Stop waiting for cloud renders. QuickAI Shorts puts a
                  professional AI studio right in your browser.
                </p>
              </div>
              <div className="hidden md:block h-px flex-1 bg-white/10 mx-12 mb-6" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-[300px]">
              {/* Feature 1: Wasm Core */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
                className="col-span-12 md:col-span-8 nano-glass p-10 flex flex-col justify-between group overflow-hidden relative"
              >
                <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/10 blur-[100px] rounded-full group-hover:bg-primary/20 transition-all duration-700" />
                <div className="relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-8 border border-primary/20 group-hover:nano-glow transition-all">
                    <Cpu className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-3xl font-bold mb-4 tracking-tight">
                    Wasm Performance
                  </h3>
                  <p className="text-muted-foreground text-lg max-w-lg leading-relaxed">
                    Harness the power of native WebAssembly to process 4K video
                    directly in your browser. No uploads, no lag, just pure
                    performance.
                  </p>
                </div>
                <div className="mt-8 flex items-center gap-2 text-primary font-bold text-sm">
                  <span>LEARN MORE</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </motion.div>

              {/* Feature 2: Privacy */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                viewport={{ once: true }}
                className="col-span-12 md:col-span-4 nano-glass p-10 flex flex-col justify-between group bg-linear-to-br from-white/5 to-transparent"
              >
                <div>
                  <div className="w-14 h-14 rounded-2xl bg-sky-500/10 flex items-center justify-center mb-8 border border-sky-500/20 group-hover:shadow-[0_0_20px_rgba(14,165,233,0.3)] transition-all">
                    <Lock className="w-7 h-7 text-sky-400" />
                  </div>
                  <h3 className="text-3xl font-bold mb-4 tracking-tight">
                    Private By Default
                  </h3>
                  <p className="text-muted-foreground text-lg leading-relaxed">
                    Your content stays on your machine. We never see your data.
                  </p>
                </div>
              </motion.div>

              {/* Feature 3: Smart AI */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                viewport={{ once: true }}
                className="col-span-12 md:col-span-5 nano-glass p-10 flex flex-col justify-between group"
              >
                <div>
                  <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-8 border border-purple-500/20 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all">
                    <Sparkles className="w-7 h-7 text-purple-400" />
                  </div>
                  <h3 className="text-3xl font-bold mb-4 tracking-tight">
                    AI Clipping
                  </h3>
                  <p className="text-muted-foreground text-lg leading-relaxed">
                    Auto-detect viral moments with our lightweight transformer
                    models.
                  </p>
                </div>
              </motion.div>

              {/* Feature 4: One Click Export */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                viewport={{ once: true }}
                className="col-span-12 md:col-span-7 nano-glass p-10 flex flex-row items-center gap-10 group overflow-hidden"
              >
                <div className="flex-1">
                  <h3 className="text-3xl font-bold mb-4 tracking-tight">
                    One-Click Viral
                  </h3>
                  <p className="text-muted-foreground text-lg leading-relaxed">
                    Auto-subtitle, auto-crop, and auto-export in 9:16 format
                    optimized for TikTok, Reels, and YouTube Shorts.
                  </p>
                </div>
                <div className="w-32 h-44 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500">
                  <PlayCircle className="w-12 h-12 text-white/20 group-hover:text-primary transition-colors" />
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* How Pre-Flight Works */}
        <section id="preflight" className="py-24 relative">
          <div className="container mx-auto px-6 max-w-5xl text-center">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
              className="text-4xl md:text-5xl font-bold tracking-tighter mb-4"
            >
              PREDICT VIRALITY{" "}
              <span className="text-primary">BEFORE YOU POST.</span>
            </motion.h2>
            <p className="text-muted-foreground text-lg mb-16 max-w-2xl mx-auto leading-relaxed">
              Pre-Flight runs your clip through 6 AI audience personas and returns a consensus
              score, drop-off map, and refinement suggestion — before you publish a single frame.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
              {[
                {
                  step: "01",
                  title: "Paste your link",
                  body: "Drop any YouTube URL. Our engine extracts the video, transcribes it in your browser with Whisper, and surfaces the top clip candidates ranked by viral score.",
                },
                {
                  step: "02",
                  title: "6 AI personas vote",
                  body: "GenZ, Millennial, Sports Fan, Tech, Arabic, and Spanish-speaking audience personas each score your clip on hook strength, retention, and shareability.",
                },
                {
                  step: "03",
                  title: "Cleared for launch",
                  body: "You receive a consensus score, a drop-off map, and a refined clip if needed. PUBLISH means go. REFINE FIRST means we already fixed it for you.",
                },
              ].map(({ step, title, body }) => (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  viewport={{ once: true }}
                  className="nano-glass p-8 rounded-3xl flex flex-col gap-4"
                >
                  <span className="text-4xl font-black text-primary/30 tracking-tighter">
                    {step}
                  </span>
                  <h3 className="text-xl font-bold tracking-tight">{title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-32">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center p-20 nano-glass rounded-[3rem] border-white/5 shadow-3xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
              >
                <div className="text-7xl font-bold mb-4 tracking-tighter premium-gradient-text">
                  0ms
                </div>
                <div className="text-muted-foreground uppercase tracking-[0.2em] font-bold text-sm">
                  Server Latency
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                viewport={{ once: true }}
              >
                <div className="text-7xl font-bold mb-4 tracking-tighter premium-gradient-text">
                  100%
                </div>
                <div className="text-muted-foreground uppercase tracking-[0.2em] font-bold text-sm">
                  Client Side
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                viewport={{ once: true }}
              >
                <div className="text-7xl font-bold mb-4 tracking-tighter premium-gradient-text">
                  &infin;
                </div>
                <div className="text-muted-foreground uppercase tracking-[0.2em] font-bold text-sm">
                  Export Freedom
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Pricing Teaser */}
        <section id="pricing-preview" className="py-24">
          <div className="container mx-auto px-6 max-w-4xl">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tighter mb-4 text-center">
              SIMPLE <span className="text-primary">PRICING.</span>
            </h2>
            <p className="text-muted-foreground text-center mb-16">
              Start free. Upgrade when Pre-Flight changes how you create.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Free */}
              <div className="nano-glass p-8 rounded-3xl border border-white/5 flex flex-col gap-6">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">
                    Free
                  </p>
                  <p className="text-5xl font-black tracking-tighter">$0</p>
                  <p className="text-muted-foreground text-sm mt-1">forever</p>
                </div>
                <ul className="space-y-3 text-sm text-muted-foreground flex-1">
                  {[
                    "Manual clip editing",
                    "FFmpeg.wasm export (9:16, captions)",
                    "2-persona Pre-Flight preview",
                    "3 exports/month · watermark",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/editor"
                  className="w-full h-12 rounded-xl border border-white/10 text-sm font-bold flex items-center justify-center hover:bg-white/5 transition-colors"
                >
                  Start Free
                </Link>
              </div>

              {/* Pro */}
              <div
                className="p-8 rounded-3xl flex flex-col gap-6 relative overflow-hidden"
                style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.15), rgba(236,72,153,0.08))", border: "1px solid rgba(168,85,247,0.3)" }}
              >
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/20 blur-[60px] rounded-full" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs font-black uppercase tracking-widest text-primary">
                      Pro
                    </p>
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                      Challenge Special
                    </span>
                  </div>
                  <p className="text-5xl font-black tracking-tighter">$29</p>
                  <p className="text-muted-foreground text-sm mt-1">per month</p>
                </div>
                <ul className="space-y-3 text-sm text-muted-foreground flex-1 relative z-10">
                  {[
                    "Everything in Free",
                    "Full 6-persona Pre-Flight panel",
                    "Audience loop refinement (up to 3 passes)",
                    "BigQuery channel analytics grounding",
                    "Unlimited exports · no watermark",
                    "YouTube OAuth analytics integration",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                      <span className="text-foreground/80">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/pricing"
                  className="w-full h-12 rounded-xl text-sm font-black flex items-center justify-center text-white transition-all hover:opacity-90 relative z-10"
                  style={{ background: "linear-gradient(to right, #a855f7, #ec4899)" }}
                >
                  Start Pre-Flight Pro
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-32 text-center relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-primary/5 blur-[120px] rounded-full -z-10" />
          <div className="container mx-auto px-6">
            <h2 className="text-5xl md:text-7xl font-bold mb-10 tracking-tighter">
              READY TO GO <span className="text-primary">NANO?</span>
            </h2>
            <GlowButton
              variant="premium"
              size="lg"
              className="h-16 px-12 rounded-2xl text-lg"
              asChild
            >
              <Link href="/editor">Get Started For Free</Link>
            </GlowButton>
            <p className="mt-8 text-muted-foreground font-medium underline underline-offset-4 cursor-pointer hover:text-foreground transition-colors">
              Join the 10,000+ creators switching to local AI.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
