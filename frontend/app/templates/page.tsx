"use client";

import React from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { LayoutTemplate, Play, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TemplatesPage() {
  const templates = [
    {
      title: "Podcast Split-Screen",
      category: "Interviews",
      description: "Automatically stacked layout ideal for 2 speakers. Features dynamic face tracking to keep both subjects center frame.",
      color: "from-blue-500/20 to-purple-500/20",
    },
    {
      title: "Gaming Reactions",
      category: "Gaming",
      description: "Gameplay in the center, creator facecam at the top perfectly masked with a glowing border. Perfect for high-energy shorts.",
      color: "from-red-500/20 to-orange-500/20",
    },
    {
      title: "Storytime Clean",
      category: "Vlogs",
      description: "Cinematic crop with heavy focus on centered subjects. Immersive automatic animated captions with high pop-out.",
      color: "from-emerald-500/20 to-teal-500/20",
    },
    {
      title: "Edu-Tok Overlay",
      category: "Education",
      description: "Subtle background blur with prominent bullet-point text overlay spaces to display stats, facts, and info neatly.",
      color: "from-yellow-500/20 to-amber-500/20",
    },
    {
      title: "Neon Highlight",
      category: "General",
      description: "Cyperpunk-themed aesthetic with bold, thick outlines around standard trims. Ideal for edgy tech channels.",
      color: "from-pink-500/20 to-rose-500/20",
    },
    {
      title: "Minimal Cinematic",
      category: "Aesthetics",
      description: "Film grain, deep blacks, letterboxes, and minimal elegant subtitle styling for high-end mood shorts.",
      color: "from-neutral-700/20 to-neutral-500/20",
    }
  ];

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30 overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[20%] left-[-20%] w-[50%] h-[50%] bg-blue-600/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-sky-600/10 blur-[120px] rounded-full" />
      </div>

      <Navbar />

      <main className="relative z-10 pt-32 pb-24 px-6 max-w-7xl mx-auto flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-8"
        >
          <LayoutTemplate size={14} /> One-Click Workflow
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-5xl md:text-7xl font-black tracking-tighter mb-8 text-center"
        >
          Pro Presets & <br />
          <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent">
            Smart Templates
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-lg md:text-xl text-neutral-400 text-center mb-24 max-w-2xl font-medium"
        >
          Skip the manual framing. Apply our curated presets to instantly format your content for maximum algorithmic push.
        </motion.p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full">
          {templates.map((template, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
              className="group cursor-pointer rounded-3xl bg-neutral-900 border border-white/5 hover:border-blue-500/50 transition-all overflow-hidden shadow-xl shadow-black hover:shadow-2xl hover:shadow-blue-900/20"
            >
              <div className={`aspect-[4/3] w-full bg-gradient-to-br ${template.color} flex flex-col items-center justify-center p-8 relative overflow-hidden`}>
                <div className="absolute inset-0 bg-neutral-950/20 backdrop-blur-[2px]" />
                <Play className="w-16 h-16 text-white/50 group-hover:scale-110 group-hover:text-white transition-all z-10" strokeWidth={1} />
                <div className="absolute bottom-4 left-4 z-10 px-3 py-1 bg-black/50 backdrop-blur-md rounded-full text-[10px] font-bold tracking-widest uppercase text-white border border-white/10">
                  {template.category}
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold tracking-tight mb-2 flex items-center justify-between">
                  {template.title}
                  <ExternalLink className="w-4 h-4 text-neutral-600 group-hover:text-blue-500 transition-colors" />
                </h3>
                <p className="text-sm font-medium text-neutral-500 leading-relaxed">
                  {template.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           transition={{ duration: 0.8, delay: 1 }}
           className="mt-20"
        >
          <Button className="h-14 px-10 rounded-2xl bg-white text-black hover:bg-neutral-200 font-bold tracking-tight shadow-xl hover:scale-105 transition-all text-lg">
            Suggest a Template
          </Button>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
