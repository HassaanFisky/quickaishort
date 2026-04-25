import React from "react";
import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="py-20 px-8 border-t border-white/[0.08] bg-[#000000] relative z-10">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
        <div className="flex flex-col gap-4">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative w-6 h-6 overflow-hidden">
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
            <span className="font-medium text-[15px] tracking-tight text-[#f5f5f7]">
              QuickAI<span className="text-[#2997ff] font-semibold">Short</span>
            </span>
          </Link>
          <p className="text-[#86868b] text-[13px] leading-relaxed max-w-[240px] mt-2 font-medium">
            The world's most advanced in-browser video studio. Fast, private,
            and exceptionally powerful.
          </p>
        </div>
        <div className="flex gap-16 text-[13px] font-medium text-[#86868b]">
          <div className="flex flex-col gap-4">
            <h5 className="text-[#f5f5f7] mb-1 font-semibold">Platform</h5>
            <Link
              href="/dashboard"
              className="hover:text-white transition-colors duration-300"
            >
              Studio
            </Link>
            <Link
              href="/templates"
              className="hover:text-white transition-colors duration-300"
            >
              Architecture
            </Link>
            <Link
              href="/guide"
              className="hover:text-white transition-colors duration-300"
            >
              User Guide
            </Link>
          </div>
          <div className="flex flex-col gap-4">
            <h5 className="text-[#f5f5f7] mb-1 font-semibold">Company</h5>
            <Link
              href="/about"
              className="hover:text-white transition-colors duration-300"
            >
              Our Vision
            </Link>
            <Link
              href="/support"
              className="hover:text-white transition-colors duration-300"
            >
              Support
            </Link>
            <Link
              href="/privacy"
              className="hover:text-white transition-colors duration-300"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
      <div className="max-w-5xl mx-auto mt-20 flex justify-between items-center border-t border-white/[0.08] pt-6 text-[12px] font-medium text-[#86868b]">
        <span>Copyright © 2026 QuickAI Shorts Inc. All rights reserved.</span>
      </div>
    </footer>
  );
}
