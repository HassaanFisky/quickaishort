"use client";

import React from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { BookOpen, Video, Scissors, Rocket, ArrowRight } from "lucide-react";

export default function GuidePage() {
  const steps = [
    {
      icon: <Video className="text-blue-500 w-8 h-8" />,
      title: "1. Import Source",
      description:
        "Paste a YouTube link or drop a local MP4 file into the browser. The video loads instantly for scrubbing.",
      color: "border-blue-500/30",
    },
    {
      icon: <Scissors className="text-emerald-500 w-8 h-8" />,
      title: "2. Frame & Trim",
      description:
        "Hit 'Auto-Frame' to center faces. Use the magnetic playhead to cut dead air and highlight the best 60-second hook.",
      color: "border-emerald-500/30",
    },
    {
      icon: <Rocket className="text-orange-500 w-8 h-8" />,
      title: "3. Export Locally",
      description:
        "Click Export to initialize FFmpeg within the tab. Wait seconds, not hours, for a massive 4K MP4 file completely processed on your end.",
      color: "border-orange-500/30",
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30 overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[30%] left-[-10%] w-[30%] h-[30%] bg-blue-600/10 blur-[100px] rounded-full" />
        <div className="absolute top-[50%] right-[-10%] w-[30%] h-[30%] bg-emerald-600/10 blur-[120px] rounded-full" />
      </div>

      <Navbar />

      <main className="relative z-10 pt-32 pb-24 px-6 max-w-5xl mx-auto flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-8"
        >
          <BookOpen size={14} /> Masterclass
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-5xl md:text-7xl font-black tracking-tighter mb-8 text-center"
        >
          The Shorts <br />
          <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            Creation Guide
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-lg md:text-xl text-neutral-400 text-center mb-24 max-w-2xl font-medium"
        >
          Creating a million-view short form video doesn't require a Hollywood
          team. It requires the right workflow. Let's walk through it.
        </motion.p>

        <div className="relative w-full">
          <div className="absolute left-[39px] md:left-1/2 top-4 bottom-4 w-1 bg-neutral-900 md:-translate-x-1/2 rounded-full hidden md:block" />

          <div className="space-y-12 w-full">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + index * 0.2 }}
                className={`relative flex flex-col md:flex-row gap-8 items-start ${index % 2 !== 0 ? "md:flex-row-reverse text-left md:text-right" : "text-left"}`}
              >
                <div
                  className={`w-full md:w-1/2 pt-4 ${index % 2 !== 0 ? "md:pl-16" : "md:pr-16"}`}
                >
                  <h3 className="text-3xl font-black tracking-tight mb-4">
                    {step.title}
                  </h3>
                  <p className="text-neutral-500 text-lg leading-relaxed font-medium">
                    {step.description}
                  </p>
                </div>

                <div className="z-10 flex border-4 border-black items-center justify-center w-20 h-20 rounded-2xl bg-neutral-900 border-dashed absolute top-0 left-0 md:relative md:-top-0 md:left-auto flex-shrink-0 shadow-xl shadow-black">
                  {step.icon}
                </div>

                <div className="w-full md:w-1/2 hidden md:block" />
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
