"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-2xl bg-black/60 border-b border-white/[0.08] transition-all">
      <Link href="/" className="flex items-center gap-2 group">
        <div className="relative w-8 h-8 overflow-hidden transition-transform duration-500 group-hover:scale-105">
          <div
            className="absolute inset-0 bg-[#2997ff]"
            style={{
              WebkitMaskImage: "url('/logo.png')",
              WebkitMaskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskImage: "url('/logo.png')",
              maskSize: "contain",
              maskRepeat: "no-repeat",
              maskPosition: "center",
            }}
          />
        </div>
        <span className="font-medium text-lg tracking-tight text-[#f5f5f7]">
          QuickAI<span className="text-[#2997ff] font-semibold">Short</span>
        </span>
      </Link>
      <div className="hidden md:flex items-center gap-8 text-[13px] font-medium text-[#86868b] tracking-wide">
        <Link
          href="/features"
          className="hover:text-white transition-colors duration-300"
        >
          Features
        </Link>
        <Link
          href="/pricing"
          className="hover:text-white transition-colors duration-300"
        >
          Pricing
        </Link>
        <Link
          href="/faq"
          className="hover:text-white transition-colors duration-300"
        >
          FAQ
        </Link>
      </div>
      <div className="flex items-center gap-4">
        <Link href="/login" passHref>
          <Button
            variant="ghost"
            className="text-[13px] font-medium text-[#86868b] hover:text-white hover:bg-white/5 h-8 rounded-full px-4 transition-all"
          >
            Sign In
          </Button>
        </Link>
        <Link href="/dashboard" passHref>
          <Button className="bg-[#f5f5f7] text-black hover:bg-white text-[13px] font-medium h-8 rounded-full px-5 shadow-sm transition-all hover:scale-105 active:scale-95">
            Get Started
          </Button>
        </Link>
      </div>
    </nav>
  );
}
