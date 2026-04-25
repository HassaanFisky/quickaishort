"use client";

import React from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  Layers,
  Zap,
  Sparkles,
  Cpu,
  Maximize,
  FastForward,
} from "lucide-react";

export default function FeaturesPage() {
  const features = [
    {
      icon: <Layers className="text-blue-500" size={32} />,
      title: "Browser-Native NLE",
      description:
        "A complete non-linear video editor right in your browser. Trim, crop, add text layers, and manage multiple tracks without downloading a single megabyte.",
    },
    {
      icon: <Zap className="text-yellow-500" size={32} />,
      title: "Zero Upload Latency",
      description:
        "By leveraging FFmpeg.wasm, we process your videos entirely client-side. No waiting for gigabytes to upload to a remote server. Your files never leave your device.",
    },
    {
      icon: <Sparkles className="text-pink-500" size={32} />,
      title: "Viral Magic Detection",
      description:
        "Powered by Gemini AI, our system automatically scans long-form content to identify the hook, the build-up, and the climax to generate perfect 60-second shorts.",
    },
    {
      icon: <Cpu className="text-emerald-500" size={32} />,
      title: "Hardware Accelerated",
      description:
        "QuickAI Shorts utilizes WebGL and WebGPU to deliver ultra-smooth playback and instant rendering. Experience desktop-grade performance in a tab.",
    },
    {
      icon: <Maximize className="text-purple-500" size={32} />,
      title: "Smart Auto-Framing",
      description:
        "Never lose the subject. Our AI automatically tracks faces and primary subjects, keeping them dead-center when converting horizontal videos into 9:16 vertical shorts.",
    },
    {
      icon: <FastForward className="text-orange-500" size={32} />,
      title: "One-Click Export",
      description:
        "Export directly to 1080p or 4K with optimized bitrates for TikTok, Instagram Reels, and YouTube Shorts. Our presets ensure maximum algorithm reach.",
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30 overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-pink-600/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-indigo-600/5 blur-[100px] rounded-full" />
      </div>

      <Navbar />

      <main className="relative z-10 pt-32 pb-24 px-6 max-w-7xl mx-auto flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-8"
        >
          Power and Precision
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-5xl md:text-7xl font-black tracking-tighter mb-8"
        >
          Features that <br />
          <span className="bg-gradient-to-r from-blue-500 via-indigo-400 to-pink-500 bg-clip-text text-transparent">
            Define the Future
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-lg md:text-xl text-neutral-400 max-w-2xl mb-24 font-medium"
        >
          Everything you need to turn long-form content into viral, engaging
          short-form videos—all from the comfort of your browser.
        </motion.p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full text-left">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
              className="p-8 rounded-3xl bg-neutral-900/40 border border-white/5 hover:border-blue-500/30 transition-all group hover:bg-neutral-900/60 shadow-xl"
            >
              <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mb-8 border border-white/5 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-xl font-black tracking-tight mb-4">
                {feature.title}
              </h3>
              <p className="text-neutral-500 leading-relaxed text-sm font-medium">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
