import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "About — Quick AI Shorts",
  description:
    "Pre-Flight: the only AI system that simulates 6 audience personas on your clip before you publish.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-32 pb-24 px-6 max-w-3xl mx-auto w-full">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          About
        </p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
          Stop publishing blind.
        </h1>
        <div className="mt-8 space-y-6 text-muted-foreground leading-relaxed">
          <p>
            Quick AI Shorts is a full-stack short-form video platform — from AI-assisted
            editing to pre-publication audience validation. Paste a YouTube URL, edit on
            a multi-track timeline with canvas overlays and AI voice commands, then run
            your clip through Pre-Flight: six distinct AI audience personas that simulate
            real viewer behaviour before you ever post.
          </p>
          <p>
            Other tools tell you <em>which clip</em> to cut. We give you the editor to
            cut it, the AI to direct it, and the intelligence to know <em>if it will
            work</em> — all in one browser tab.
          </p>
          <p>
            Built for the Google for Startups AI Agents Challenge 2026 by Hassaan
            Fisky, a solo founder operating from Karachi, Pakistan.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
