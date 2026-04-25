"use client";

import React from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Users, Code, Activity, Globe } from "lucide-react";
import Image from "next/image";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30 overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[10%] left-[10%] w-[30%] h-[30%] bg-blue-600/5 blur-[120px] rounded-full" />
      </div>

      <Navbar />

      <main className="relative z-10 pt-32 pb-24 px-6 max-w-4xl mx-auto flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-8"
        >
          <Globe size={14} /> Our Mission
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-5xl md:text-7xl font-black tracking-tighter mb-8 text-center"
        >
          Democratizing <br />
          <span className="bg-gradient-to-r from-blue-400 to-cyan-500 bg-clip-text text-transparent">
            Video Creation
          </span>
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-lg md:text-xl text-neutral-400 text-center mb-16 space-y-6 font-medium"
        >
          <p>
            QuickAI Shorts started with a singular observation: creating
            professional short-form content requires expensive hardware and
            bloated software. We believed the browser was powerful enough to
            change that.
          </p>
          <p>
            By bringing FFmpeg natively into the browser client, our engineers
            eliminated the bottleneck of uploading giant video files to the
            cloud. What used to take hours now takes seconds.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="w-full bg-neutral-900 border border-neutral-800 rounded-[2.5rem] p-12 text-center"
        >
          <div className="flex justify-center mb-8">
            <div className="w-24 h-24 bg-blue-500/10 border border-blue-500/20 flex items-center justify-center rounded-[2rem] shadow-[0_0_30px_rgba(59,130,246,0.2)]">
              <Image
                src="/logo.png"
                alt="Logo"
                width={64}
                height={64}
                className="opacity-90 object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]"
              />
            </div>
          </div>
          <h2 className="text-3xl font-black tracking-tighter mb-4">
            Reinventing the Studio
          </h2>
          <p className="text-neutral-500 mb-8 max-w-2xl mx-auto font-medium">
            We are a small, elite team of engineers and creators dedicated to
            pushing edge computing limits for consumers. We build tools that
            make you faster.
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            <div className="flex flex-col items-center">
              <span className="text-4xl font-black text-white">0</span>
              <span className="text-xs uppercase font-bold tracking-widest text-neutral-600 mt-2">
                Server Renders
              </span>
            </div>
            <div className="w-px h-12 bg-neutral-800 hidden sm:block"></div>
            <div className="flex flex-col items-center">
              <span className="text-4xl font-black text-white">∞</span>
              <span className="text-xs uppercase font-bold tracking-widest text-neutral-600 mt-2">
                Time Saved
              </span>
            </div>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
