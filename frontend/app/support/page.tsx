"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Send, LifeBuoy, FileQuestion, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SupportPage() {
  const [isSubmitted, setIsSubmitted] = useState(false);

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30 overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[30%] left-[-10%] w-[30%] h-[30%] bg-blue-600/10 blur-[100px] rounded-full" />
      </div>

      <Navbar />

      <main className="relative z-10 pt-32 pb-24 px-6 max-w-5xl mx-auto flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-8"
        >
          <LifeBuoy size={14} /> 24/7 Support
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-5xl md:text-7xl font-black tracking-tighter mb-8 text-center"
        >
          We're here <br />
          <span className="bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            to help you grow
          </span>
        </motion.h1>

        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-12 mt-16 max-w-4xl mx-auto">
          {/* Contact Methods */}
          <div className="space-y-6">
            <h2 className="text-2xl font-black tracking-tight mb-6">
              Ways to Connect
            </h2>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex items-start gap-4 p-6 bg-neutral-900/40 border border-white/5 rounded-2xl hover:bg-neutral-900 transition-colors cursor-pointer group"
            >
              <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                <MessageSquare size={24} />
              </div>
              <div>
                <h3 className="font-bold mb-1 tracking-tight">
                  Community Discord
                </h3>
                <p className="text-sm text-neutral-500 font-medium">
                  Join 50k+ creators sharing presets, bugs, and viral
                  strategies.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex items-start gap-4 p-6 bg-neutral-900/40 border border-white/5 rounded-2xl hover:bg-neutral-900 transition-colors cursor-pointer group"
            >
              <div className="w-12 h-12 bg-pink-500/10 rounded-xl flex items-center justify-center text-pink-400 group-hover:scale-110 transition-transform">
                <FileQuestion size={24} />
              </div>
              <div>
                <h3 className="font-bold mb-1 tracking-tight">Documentation</h3>
                <p className="text-sm text-neutral-500 font-medium">
                  Extensive guides on FFmpeg flags and AI node graphs.
                </p>
              </div>
            </motion.div>
          </div>

          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="p-8 rounded-[2rem] bg-neutral-900/80 border border-white/10 backdrop-blur-md shadow-2xl"
          >
            {isSubmitted ? (
              <div className="h-full flex flex-col items-center justify-center py-12 text-center text-blue-400">
                <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mb-6">
                  <Send size={28} />
                </div>
                <h3 className="text-2xl font-black mb-2 text-white tracking-tight">
                  Message Sent
                </h3>
                <p className="text-sm text-neutral-400 font-medium">
                  Our engineers will get back to you shortly.
                </p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setIsSubmitted(true);
                }}
                className="space-y-6 flex flex-col"
              >
                <h2 className="text-xl font-black tracking-tight mb-2">
                  Send a Ticket
                </h2>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    placeholder="creator@example.com"
                    required
                    className="bg-black/50 border-white/10 h-12 focus:border-blue-500 transition-colors rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                    Issue Description
                  </label>
                  <textarea
                    placeholder="Describe the bug or feature request..."
                    required
                    className="w-full bg-black/50 border border-white/10 rounded-xl p-4 min-h-[120px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm font-medium"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-14 rounded-xl bg-white text-black font-black text-lg hover:bg-neutral-200 transition-all hover:scale-105 active:scale-95 shadow-xl"
                >
                  Submit Request
                </Button>
              </form>
            )}
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
