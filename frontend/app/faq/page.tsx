"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ChevronDown, MessageCircleQuestion } from "lucide-react";

export default function FAQPage() {
  const faqs = [
    {
      question: "How does QuickAI Shorts process videos without upload?",
      answer:
        "We utilize WebAssembly (WASM) ports of FFmpeg running entirely inside your browser. When you import a video, your device acts as the server, reading and manipulating the file locally. This completely eliminates upload latency and ensures zero server-side bottlenecks.",
    },
    {
      question: "Is rendering faster than cloud-based editors?",
      answer:
        "In most cases, yes! Specifically, if your local machine has decent hardware (a modern Mac M-series or a dedicated GPU), our client-side WebGL engine outputs 1080p/4K fast because there's absolutely zero network transfer time holding it back.",
    },
    {
      question: "How does the AI auto-framing magic work?",
      answer:
        "When enabled, an optimized machine learning model runs in your browser to detect faces and primary subjects. It calculates a centered bounding box for 9:16 aspect ratios, ensuring the most important action is always in frame.",
    },
    {
      question: "What formats do you support?",
      answer:
        "We support processing standard MP4, WebM, and MOV containers. Video codecs include H.264, VP8/VP9, and increasingly H.265 (HEVC), depending on your specific browser capabilities.",
    },
    {
      question: "Do I retain all rights to the videos I make?",
      answer:
        "100% yes. QuickAI Shorts is a tool, exactly like Adobe Premiere. We don't claim any ownership or copyright over what you produce. Create, export, and monetize as much as you like on Youtube, TikTok, and Instagram.",
    },
  ];

  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30 overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[20%] left-[-10%] w-[30%] h-[30%] bg-blue-600/10 blur-[100px] rounded-full" />
      </div>

      <Navbar />

      <main className="relative z-10 pt-32 pb-24 px-6 max-w-4xl mx-auto flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-bold uppercase tracking-widest mb-8"
        >
          <MessageCircleQuestion size={14} /> Knowledge Base
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-5xl md:text-7xl font-black tracking-tighter mb-8 text-center"
        >
          Frequently <br />
          <span className="bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent">
            Asked Questions
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-lg md:text-xl text-neutral-400 text-center mb-24 font-medium"
        >
          Curious about the tech? Here are the straight answers indicating how
          we bypass server uploads entirely.
        </motion.p>

        <div className="w-full space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
              className="border border-white/10 bg-neutral-900/40 backdrop-blur-sm rounded-2xl overflow-hidden hover:border-white/20 transition-colors"
            >
              <button
                onClick={() => toggleAccordion(index)}
                className="w-full px-8 py-6 flex items-center justify-between text-left focus:outline-none"
              >
                <span className="font-bold text-lg tracking-tight pr-8">
                  {faq.question}
                </span>
                <motion.div
                  animate={{ rotate: activeIndex === index ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex-shrink-0 text-neutral-500"
                >
                  <ChevronDown size={24} />
                </motion.div>
              </button>

              <AnimatePresence>
                {activeIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="px-8 pb-6 text-neutral-400 font-medium leading-relaxed">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
