"use client";

import React from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ShieldCheck } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30 overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] bg-blue-600/5 blur-[120px] rounded-full" />
      </div>

      <Navbar />

      <main className="relative z-10 pt-32 pb-24 px-6 max-w-4xl mx-auto flex flex-col">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-800/50 border border-neutral-700 text-neutral-400 text-xs font-bold uppercase tracking-widest mb-8 self-center"
        >
          <ShieldCheck size={14} /> Legal Documentation
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-4xl md:text-6xl font-black tracking-tighter mb-4 text-center"
        >
          Privacy Policy
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-neutral-500 text-center uppercase tracking-widest text-xs font-bold mb-20"
        >
          Last Updated: March 2026
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="prose prose-invert prose-neutral max-w-none text-neutral-400 font-medium leading-loose"
        >
          <div className="space-y-12">
            <section className="space-y-4">
              <h2 className="text-2xl font-black text-white tracking-tight border-b border-white/10 pb-4">
                1. Information We Do Not Collect
              </h2>
              <p>
                Because QuickAI Shorts is a fully client-side application
                heavily reliant on WebAssembly and FFmpeg running inside your
                local browser tab,{" "}
                <strong>
                  we do not upload your raw video files or processed outputs to
                  our servers.
                </strong>{" "}
                Your media remains securely on your local device.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-black text-white tracking-tight border-b border-white/10 pb-4">
                2. Information We Collect
              </h2>
              <p>
                We collect information necessary to provide the service layout
                and sync data. This includes:
              </p>
              <ul className="list-disc pl-6 space-y-2 marker:text-blue-500">
                <li>
                  Basic account details (email, avatar) obtained via Supabase
                  Auth when you log in.
                </li>
                <li>
                  Project metadata (titles, timeline structure, edits, filter
                  properties) which are synced to your account so you can
                  continue editing from any device.
                </li>
                <li>
                  Anonymized telemetry and crash logs to improve engine
                  performance.
                </li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-black text-white tracking-tight border-b border-white/10 pb-4">
                3. Cloud Services & Third Parties
              </h2>
              <p>
                QuickAI Shorts integrates with limited external APIs. When you
                request AI Auto-framing or viral moment detection, only
                low-resolution thumbnails or extracted audio transcripts are
                sent to our language models (Gemini via API) for analysis. The
                core high-resolution rendering never leaves your browser tab.
                All metadata is stored securely in Neon Postgres.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-black text-white tracking-tight border-b border-white/10 pb-4">
                4. Your Rights
              </h2>
              <p>
                You can request complete deletion of your account and associated
                project metadata at any point via the studio dashboard. Local
                cache stored in IndexedDB by the editor engine can be cleared
                instantly from your browser settings.
              </p>
            </section>

            <section className="mt-16 p-8 bg-neutral-900/50 rounded-3xl border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="text-lg font-bold text-white mb-1">
                  Questions about privacy?
                </h3>
                <p className="text-sm">
                  Contact our legal team for specific concerns.
                </p>
              </div>
              <a
                href="/support"
                className="px-6 py-3 bg-white text-black font-bold uppercase tracking-widest text-xs rounded-xl hover:bg-neutral-200 transition-colors"
              >
                Contact Us
              </a>
            </section>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
