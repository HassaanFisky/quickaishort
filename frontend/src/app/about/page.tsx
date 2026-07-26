import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "About — QuickAI Short",
  description:
    "Conversational AI video editing: ingest a clip, chat to edit, preview live, and export a short.",
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
          Conversation is the editing workflow.
        </h1>
        <div className="mt-8 space-y-6 text-muted-foreground leading-relaxed">
          <p>
            QuickAI Short is a conversational AI video editor. Paste a YouTube URL or
            upload a file, tell the AI what to cut, caption, or reframe, preview every
            change live, then export a short when it feels right.
          </p>
          <p>
            You stay the director. QuickAI performs the craft. The timeline shows the
            result — chat is how you steer. Optional Pre-Flight audience simulation is
            a skill when you want a second opinion, not the product&apos;s sole identity.
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
