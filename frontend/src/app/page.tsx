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
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRef } from "react";
import { cn } from "@/lib/utils";

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
          {/* Animated Background Elements - Theme Aware */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 blur-[120px] rounded-full animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent/5 blur-[100px] rounded-full animate-pulse delay-700" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,hsl(var(--foreground)/0.03)_0,transparent_70%)]" />
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
                  className="mb-8 px-5 py-2 text-[10px] font-black tracking-[0.2em] border-foreground/10 bg-foreground/5 text-primary nano-glow backdrop-blur-md rounded-full uppercase"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-2" />
                  Elite Studio Experience
                </Badge>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter mb-6 leading-[0.85] premium-gradient-text"
              >
                VIRAL SHORTS.
                <br />
                <span className="text-primary">NO LIMITS.</span>
              </motion.h1>
              
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="flex items-center gap-2 mb-8 bg-foreground/5 px-4 py-2 rounded-2xl border border-foreground/5"
              >
                <TrendingUp className="w-4 h-4 text-primary" />
                <p className="text-xs md:text-sm font-bold text-muted-foreground tracking-wide">
                  Know before you post. <span className="text-foreground">Audience Simulation AI</span> validates every clip.
                </p>
              </motion.div>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-lg md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-12 leading-relaxed font-medium"
              >
                The world&apos;s most reliable hybrid AI video engine. Instant
                clipping with production-grade cloud rendering for 100%
                delivery, even on massive source files.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="flex flex-col sm:flex-row items-center justify-center gap-5"
              >
                <GlowButton
                  variant="premium"
                  size="lg"
                  className="h-16 px-12 rounded-2xl group text-lg shadow-2xl shadow-primary/20"
                  asChild
                >
                  <Link href="/editor">
                    Start Creating Now
                    <ArrowRight className="ml-2 w-6 h-6 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </GlowButton>
                <GlowButton
                  variant="outline"
                  size="lg"
                  className="h-16 px-12 rounded-2xl text-lg border-foreground/10 bg-foreground/5 hover:bg-foreground/10"
                  asChild
                >
                  <Link href="/editor">
                    <PlayCircle className="mr-2 w-6 h-6" />
                    Watch Demo
                  </Link>
                </GlowButton>
              </motion.div>
            </motion.div>
          </div>

          {/* Bottom Fade Gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-48 bg-linear-to-t from-background via-background/80 to-transparent" />
        </section>

        {/* Feature Grid: Nano Modern Bento */}
        <section id="features" className="py-32 relative">
          <div className="container mx-auto px-6 max-w-7xl">
            <div className="flex flex-col md:flex-row items-end justify-between mb-24 gap-8">
              <div className="max-w-2xl space-y-4">
                <h2 className="text-5xl md:text-7xl font-black mb-6 tracking-tighter leading-tight">
                  ENGINEERED FOR <br /> <span className="text-primary">SUPREME SPEED.</span>
                </h2>
                <p className="text-muted-foreground text-xl md:text-2xl font-medium leading-relaxed opacity-80">
                  Stop waiting for cloud renders. QuickAI Shorts puts a
                  professional AI studio right in your browser.
                </p>
              </div>
              <div className="hidden md:block h-px flex-1 bg-foreground/10 mx-12 mb-8" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 auto-rows-[340px]">
              {/* Feature 1: Production Core */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
                className="col-span-12 md:col-span-8 depth-card glass-surface p-12 flex flex-col justify-between group overflow-hidden relative rounded-[3rem]"
              >
                <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary/10 blur-[100px] rounded-full group-hover:bg-primary/20 transition-all duration-1000" />
                <div className="relative z-10 space-y-6">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-8 border border-primary/20 group-hover:nano-glow transition-all duration-500">
                    <Cpu className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-4xl font-bold tracking-tight">
                    Production Rendering
                  </h3>
                  <p className="text-muted-foreground text-lg md:text-xl max-w-xl leading-relaxed font-medium">
                    Harness our high-speed cloud infrastructure to process 4K video.
                    Big files render on our infra so your machine stays cool —
                    zero browser crashes, ever.
                  </p>
                </div>
                <div className="mt-8 flex items-center gap-3 text-primary font-black text-xs tracking-widest uppercase">
                  <span>Explore Infrastructure</span>
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
                </div>
              </motion.div>

              {/* Feature 2: Privacy */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                viewport={{ once: true }}
                className="col-span-12 md:col-span-4 depth-card glass-surface p-12 flex flex-col justify-between group rounded-[3rem] bg-linear-to-br from-foreground/[0.03] to-transparent"
              >
                <div>
                  <div className="w-16 h-16 rounded-2xl bg-sky-500/10 flex items-center justify-center mb-10 border border-sky-500/20 group-hover:shadow-[0_0_30px_rgba(14,165,233,0.2)] transition-all duration-500">
                    <Lock className="w-8 h-8 text-sky-400" />
                  </div>
                  <h3 className="text-3xl font-bold mb-5 tracking-tight">
                    Secure By <br /> Design
                  </h3>
                  <p className="text-muted-foreground text-lg leading-relaxed font-medium opacity-80">
                    Your content stays encrypted and private. We never train on your media.
                  </p>
                </div>
                <div className="w-full h-1 bg-foreground/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ x: "-100%" }}
                    whileInView={{ x: "0%" }}
                    transition={{ duration: 1, delay: 0.5 }}
                    className="w-full h-full bg-sky-400/30" 
                  />
                </div>
              </motion.div>

              {/* Feature 3: Smart AI */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                viewport={{ once: true }}
                className="col-span-12 md:col-span-5 depth-card glass-surface p-12 flex flex-col justify-between group rounded-[3rem]"
              >
                <div>
                  <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-10 border border-purple-500/20 group-hover:shadow-[0_0_30px_rgba(168,85,247,0.2)] transition-all duration-500">
                    <Sparkles className="w-8 h-8 text-purple-400" />
                  </div>
                  <h3 className="text-3xl font-bold mb-5 tracking-tight">
                    Viral Intent <br /> Mapping
                  </h3>
                  <p className="text-muted-foreground text-lg leading-relaxed font-medium opacity-80">
                    Auto-detect viral moments with our advanced multi-persona transformer models.
                  </p>
                </div>
              </motion.div>

              {/* Feature 4: One Click Export */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                viewport={{ once: true }}
                className="col-span-12 md:col-span-7 depth-card glass-surface p-12 flex flex-row items-center gap-10 group overflow-hidden rounded-[3rem]"
              >
                <div className="flex-1 space-y-6">
                  <h3 className="text-4xl font-bold tracking-tight">
                    One-Click <br /> Distribution
                  </h3>
                  <p className="text-muted-foreground text-lg leading-relaxed font-medium opacity-80">
                    Auto-subtitle, auto-crop, and auto-export in 9:16 format
                    optimized for every vertical platform.
                  </p>
                </div>
                <div className="w-40 h-56 rounded-[2rem] bg-foreground/5 border border-foreground/10 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-all duration-700 shadow-2xl">
                  <PlayCircle className="w-16 h-16 text-foreground/10 group-hover:text-primary transition-colors duration-500" />
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* How Pre-Flight Works */}
        <section id="preflight" className="py-32 relative">
          <div className="container mx-auto px-6 max-w-6xl text-center space-y-8">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
              className="text-5xl md:text-7xl font-black tracking-tighter"
            >
              PREDICT VIRALITY <br />
              <span className="text-primary">BEFORE YOU PUBLISH.</span>
            </motion.h2>
            <p className="text-muted-foreground text-xl md:text-2xl mb-20 max-w-3xl mx-auto leading-relaxed font-medium opacity-80">
              Pre-Flight runs your clip through 6 AI audience personas and returns a consensus
              score, drop-off map, and refinement suggestions.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 text-left">
              {[
                {
                  step: "01",
                  title: "Intelligent Extraction",
                  body: "Drop any YouTube URL. Our engine extracts the video, transcribes it with Whisper, and surfaces the top clip candidates.",
                },
                {
                  step: "02",
                  title: "Persona Simulation",
                  body: "6 AI personas (GenZ, Millennial, Sports Fan, Tech, etc.) score your clip on hook strength and retention.",
                },
                {
                  step: "03",
                  title: "Final Verification",
                  body: "Receive a consensus score and drop-off map. If it's not ready, our AI refines it for you automatically.",
                },
              ].map(({ step, title, body }) => (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  viewport={{ once: true }}
                  className="depth-card p-10 rounded-[2.5rem] flex flex-col gap-6 group hover:border-primary/30 transition-all duration-500"
                >
                  <span className="text-5xl font-black text-primary/20 tracking-tighter group-hover:text-primary/40 transition-colors">
                    {step}
                  </span>
                  <div className="space-y-3">
                    <h3 className="text-2xl font-bold tracking-tight">{title}</h3>
                    <p className="text-muted-foreground text-base leading-relaxed font-medium opacity-80">{body}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-40">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-16 text-center p-20 depth-card rounded-[4rem] border-foreground/5 shadow-3xl relative overflow-hidden">
               <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-accent/5" />
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
                className="relative z-10"
              >
                <div className="text-8xl font-black mb-4 tracking-tighter premium-gradient-text">
                  0ms
                </div>
                <div className="text-muted-foreground uppercase tracking-[0.3em] font-black text-xs opacity-60">
                  Latency
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                viewport={{ once: true }}
                className="relative z-10"
              >
                <div className="text-8xl font-black mb-4 tracking-tighter premium-gradient-text">
                  100%
                </div>
                <div className="text-muted-foreground uppercase tracking-[0.3em] font-black text-xs opacity-60">
                  Efficiency
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                viewport={{ once: true }}
                className="relative z-10"
              >
                <div className="text-8xl font-black mb-4 tracking-tighter premium-gradient-text">
                  &infin;
                </div>
                <div className="text-muted-foreground uppercase tracking-[0.3em] font-black text-xs opacity-60">
                  Scale
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-32">
          <div className="container mx-auto px-6 max-w-5xl">
            <div className="text-center space-y-4 mb-20">
              <h2 className="text-5xl md:text-7xl font-black tracking-tighter">
                SIMPLE <span className="text-primary">PRICING.</span>
              </h2>
              <p className="text-muted-foreground text-xl font-medium opacity-80">
                Start for free. Upgrade when you&apos;re ready to dominate.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* Free Plan */}
              <div className="depth-card p-12 rounded-[3rem] border border-foreground/5 flex flex-col gap-10 group hover:border-foreground/10 transition-all duration-500">
                <div className="space-y-4">
                  <Badge variant="outline" className="px-4 py-1 text-[10px] font-black tracking-widest border-foreground/10 bg-foreground/5 rounded-full uppercase">
                    Starter
                  </Badge>
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-black tracking-tighter">$0</span>
                    <span className="text-muted-foreground font-bold">/mo</span>
                  </div>
                  <p className="text-muted-foreground font-medium">Perfect for individuals getting started.</p>
                </div>
                
                <ul className="space-y-5 text-sm font-bold text-muted-foreground flex-1">
                  {[
                    "Standard AI clipping",
                    "Wasm-powered local export",
                    "2 AI Audience personas",
                    "Watermarked preview",
                    "Community support",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-foreground/10" />
                      {f}
                    </li>
                  ))}
                </ul>
                
                <Link
                  href="/editor"
                  className="w-full h-16 rounded-[1.5rem] border border-foreground/10 text-base font-black flex items-center justify-center hover:bg-foreground/5 transition-all duration-500 uppercase tracking-widest"
                >
                  Get Started
                </Link>
              </div>

              {/* Pro Plan */}
              <div
                className="p-12 rounded-[3rem] flex flex-col gap-10 relative overflow-hidden group shadow-2xl"
                style={{ 
                  background: "linear-gradient(135deg, hsl(var(--primary)/0.15), hsl(var(--accent)/0.05))", 
                  border: "1px solid hsl(var(--primary)/0.3)" 
                }}
              >
                <div className="absolute -top-20 -right-20 w-80 h-80 bg-primary/10 blur-[100px] rounded-full group-hover:bg-primary/20 transition-all duration-1000" />
                
                <div className="relative z-10 space-y-4">
                  <div className="flex items-center gap-3">
                    <Badge className="px-4 py-1 text-[10px] font-black tracking-widest bg-primary text-white rounded-full uppercase">
                      Pro
                    </Badge>
                    <span className="text-[10px] font-black uppercase px-3 py-1 rounded-full bg-primary/20 text-primary border border-primary/30 tracking-widest">
                      Most Popular
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-black tracking-tighter text-foreground">$29</span>
                    <span className="text-muted-foreground font-bold">/mo</span>
                  </div>
                  <p className="text-foreground/80 font-bold">For professional creators and agencies.</p>
                </div>

                <ul className="space-y-5 text-sm font-black text-foreground/70 flex-1 relative z-10">
                  {[
                    "Full 6-persona AI panel",
                    "Unlimited high-speed cloud renders",
                    "No watermarks on any exports",
                    "Deep analytics grounding",
                    "Priority infrastructure access",
                    "Multi-platform auto-crop",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
                      <span className="text-foreground/90">{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/pricing"
                  className="w-full h-16 rounded-[1.5rem] text-base font-black flex items-center justify-center text-white transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-primary/30 relative z-10 uppercase tracking-widest"
                  style={{ background: "linear-gradient(to right, hsl(var(--primary)), hsl(var(--accent)))" }}
                >
                  Go Professional
                  <ArrowRight className="ml-3 w-5 h-5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-40 text-center relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-primary/5 blur-[150px] rounded-full -z-10" />
          <div className="container mx-auto px-6 space-y-10">
            <h2 className="text-6xl md:text-8xl font-black tracking-tighter leading-none">
              READY TO <br /> <span className="text-primary uppercase">Dominate?</span>
            </h2>
            <GlowButton
              variant="premium"
              size="lg"
              className="h-20 px-16 rounded-[2rem] text-xl font-black shadow-2xl shadow-primary/20"
              asChild
            >
              <Link href="/editor">Launch Studio Now</Link>
            </GlowButton>
            <p className="text-muted-foreground font-bold text-lg opacity-60">
              Join 10,000+ creators building the future of video.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
