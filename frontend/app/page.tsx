"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  Plus,
  Sparkles,
  Zap,
  Youtube,
  Layers,
  Cpu,
  ShieldCheck,
  MousePointer2,
  ChevronRight,
  Play,
  PlayIcon,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30 overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-pink-600/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-indigo-600/5 blur-[100px] rounded-full" />
      </div>

      {/* Navigation */}
      <Navbar />

      {/* Hero Section */}
      <section className="relative z-10 pt-32 pb-24 px-6 max-w-7xl mx-auto flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-8"
        >
          <Sparkles size={14} /> The Next-Gen Browser-Based AI Studio
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-6xl md:text-8xl font-black tracking-tighter mb-8 leading-[0.9]"
        >
          Turn YouTube into <br />
          <span className="bg-linear-to-r from-blue-500 via-indigo-400 to-pink-500 bg-clip-text text-transparent">
            Viral Shorts
          </span>{" "}
          in Seconds
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-lg md:text-xl text-neutral-400 max-w-2xl mb-12 font-medium"
        >
          The world's first browser-native video editor with client-side
          rendering. Import, edit, and export viral clips without a heavy
          workstation.
          <span className="hidden md:inline">
            {" "}
            Powered by Gemini AI & FFmpeg.wasm.
          </span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex flex-col sm:flex-row items-center gap-4"
        >
          <Link href="/dashboard" passHref>
            <Button className="h-16 px-12 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-lg shadow-2xl shadow-blue-500/20 gap-3 group">
              Start Editing Now{" "}
              <ChevronRight className="group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Link
            href="https://github.com/QuickAIShort"
            target="github repo of QuickAi Short"
          >
            <Button
              variant="outline"
              className="h-16 px-8 rounded-2xl border-white/10 hover:border-white/20 bg-white/5 font-bold gap-3"
            >
              Watch Demo <PlayIcon size={18} fill="currentColor" />
            </Button>
          </Link>
        </motion.div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-48 w-full text-left">
          <FeatureCard
            icon={<Layers className="text-blue-500" />}
            title="Browser-Native Studio"
            description="A full-featured NLE in your tab. No software to install, no slow uploads. Just professional results."
          />
          <FeatureCard
            icon={<Zap className="text-yellow-500" />}
            title="High-Speed FFmpeg"
            description="Client-side exports use your hardware to render video locally. Zero server latency, zero egress fees."
          />
          <FeatureCard
            icon={<Sparkles className="text-pink-500" />}
            title="AI Viral Detection"
            description="Powered by Gemini 2.5 Flash — finds the best 60-second moments from any long-form video automatically."
          />
        </div>
      </section>

      {/* Social Proof (Ticker Style) */}
      <section className="py-24 border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600 mb-12">
            Built with Industry Standard Core Technology
          </p>
          <div className="flex flex-wrap justify-center items-center gap-12 md:gap-24 opacity-30 grayscale hover:grayscale-0 transition-all duration-700">
            <span className="font-bold text-2xl tracking-tighter">
              NEON POSTGRES
            </span>
            <span className="font-bold text-2xl tracking-tighter">
              SUPABASE AUTH
            </span>
            <span className="font-bold text-2xl tracking-tighter">
              CLOUDFLARE R2
            </span>
            <span className="font-bold text-2xl tracking-tighter">
              UPSTASH REDIS
            </span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}

function FeatureCard({ icon, title, description }: any) {
  return (
    <div className="p-8 rounded-3xl bg-neutral-900/40 border border-white/5 hover:border-blue-500/30 transition-all group hover:bg-neutral-900/60 shadow-xl">
      <div className="w-14 h-14 bg-black rounded-2xl flex items-center justify-center mb-8 border border-white/5 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-lg font-black tracking-tight mb-4">{title}</h3>
      <p className="text-neutral-500 leading-relaxed text-sm font-medium">
        {description}
      </p>
    </div>
  );
}
