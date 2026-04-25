"use client";

import React from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Check, Sparkles } from "lucide-react";

export default function PricingPage() {
  const tiers = [
    {
      name: "Free Tier",
      price: "$0",
      description: "Perfect for beginners exploring AI video editing.",
      features: [
        "Browser-based editing",
        "Export up to 720p",
        "5 AI Auto-cuts per month",
        "Standard support",
        "Watermark on exports",
      ],
      buttonText: "Get Started",
      highlight: false,
    },
    {
      name: "Pro Editor",
      price: "$19",
      period: "/mo",
      description: "For creators who want to dominate short-form content.",
      features: [
        "Unlimited browser-based editing",
        "Export in glorious 4K",
        "Unlimited AI Auto-cuts & framing",
        "Priority 24/7 support",
        "No watermark",
        "Custom branding templates",
      ],
      buttonText: "Upgrade to Pro",
      highlight: true,
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30 overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[20%] w-[40%] h-[40%] bg-emerald-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
      </div>

      <Navbar />

      <main className="relative z-10 pt-32 pb-24 px-6 max-w-7xl mx-auto flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-8"
        >
          Pricing Plans
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-5xl md:text-7xl font-black tracking-tighter mb-8"
        >
          Simple Pricing, <br />
          <span className="bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent">
            Maximum Value
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-lg md:text-xl text-neutral-400 max-w-2xl mb-24 font-medium"
        >
          No hidden fees out of nowhere. We leverage client-side processing, so
          our costs are incredibly low—and we pass those savings directly to
          you.
        </motion.p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl text-left">
          {tiers.map((tier, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
              className={`relative p-10 rounded-[2.5rem] border ${
                tier.highlight
                  ? "bg-gradient-to-b from-neutral-900 to-black border-blue-500/50 shadow-2xl shadow-blue-500/20"
                  : "bg-neutral-900/40 border-white/5"
              } transition-all`}
            >
              {tier.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-blue-600 text-white text-xs font-bold uppercase tracking-widest rounded-full flex items-center gap-1 shadow-lg shadow-blue-600/30">
                  <Sparkles size={12} /> Recommended
                </div>
              )}

              <h3 className="text-2xl font-black tracking-tight mb-2">
                {tier.name}
              </h3>
              <p className="text-neutral-500 text-sm font-medium mb-8 h-10">
                {tier.description}
              </p>

              <div className="flex items-end mb-8">
                <span className="text-6xl font-black tracking-tighter leading-none">
                  {tier.price}
                </span>
                {tier.period && (
                  <span className="text-neutral-500 font-bold ml-2 pb-2">
                    {tier.period}
                  </span>
                )}
              </div>

              <div className="space-y-4 mb-10">
                {tier.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div
                      className={`p-1 rounded-full ${tier.highlight ? "bg-blue-500/20 text-blue-400" : "bg-neutral-800 text-neutral-400"}`}
                    >
                      <Check size={14} strokeWidth={3} />
                    </div>
                    <span className="text-sm font-medium text-neutral-300">
                      {feature}
                    </span>
                  </div>
                ))}
              </div>

              <Button
                className={`w-full h-14 rounded-2xl font-black text-lg transition-transform hover:scale-105 active:scale-95 ${
                  tier.highlight
                    ? "bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-600/25"
                    : "bg-white text-black hover:bg-neutral-200"
                }`}
              >
                {tier.buttonText}
              </Button>
            </motion.div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
