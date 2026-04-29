"use client";

import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import {
  Sparkles,
  Users,
  Target,
  Gauge,
  ShieldCheck,
  Rocket,
  Check,
  ArrowRight,
} from "lucide-react";

const FEATURES = [
  {
    icon: Users,
    title: "Six audience personas",
    body: "GenZ, Millennial, Sports, Tech, Lifestyle, Skeptic — each scores hook strength and predicted retention.",
  },
  {
    icon: Target,
    title: "Consensus + drop-off map",
    body: "See where viewers tune out and why, not just an opaque viral score.",
  },
  {
    icon: Sparkles,
    title: "Auto-refinement loop",
    body: "When personas reject a clip, the agent rewrites the cut and runs again until it passes.",
  },
  {
    icon: Gauge,
    title: "Browser-based pipeline",
    body: "Whisper transcription and FFmpeg.wasm export run client-side — your video never leaves your machine.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy by default",
    body: "No model training on your content. No third-party ads. Your project metadata is yours.",
  },
  {
    icon: Rocket,
    title: "Built on Google ADK",
    body: "Sequential multi-agent system on Gemini 2.5 Flash. Production-grade, not prompt-glue.",
  },
];

const STATS = [
  { value: "$117B", label: "Creator economy" },
  { value: "40%", label: "Fewer wasted posts" },
  { value: "3.8×", label: "View lift on validated clips" },
];

const FREE_FEATURES = [
  "1 Pre-Flight run / day",
  "2 audience personas",
  "Browser-based export with watermark",
  "Community support",
];

const PRO_FEATURES = [
  "Unlimited Pre-Flight runs",
  "Full 6-persona panel",
  "Auto-refinement loop",
  "No watermark, 4K export",
  "Drop-off map + analytics",
  "Priority support",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 overflow-x-hidden">
      <Navbar />

      <main>
        {/* HERO */}
        <section className="relative min-h-[88vh] flex items-center justify-center pt-32 pb-20 px-6 overflow-hidden">
          {/* Subtle gradient mesh — drifts on a 12s cycle */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 hero-mesh pointer-events-none"
          />
          <style jsx>{`
            .hero-mesh {
              background:
                radial-gradient(circle at 20% 30%, rgba(168, 85, 247, 0.06) 0%, transparent 45%),
                radial-gradient(circle at 80% 70%, rgba(59, 130, 246, 0.06) 0%, transparent 45%),
                radial-gradient(circle at 50% 100%, rgba(236, 72, 153, 0.04) 0%, transparent 55%);
              animation: hero-drift 12s ease-in-out infinite alternate;
            }
            @keyframes hero-drift {
              0% { transform: translate(0, 0) scale(1); }
              100% { transform: translate(-2%, 2%) scale(1.04); }
            }
            @media (prefers-reduced-motion: reduce) {
              .hero-mesh { animation: none; }
            }
          `}</style>

          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              <Sparkles className="w-3 h-3" />
              Google AI Agents Challenge 2026
            </span>

            <h1
              className="mt-8 text-4xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05]"
              style={{ letterSpacing: "-0.03em" }}
            >
              Know your clip will hit —
              <br />
              <span className="bg-clip-text text-transparent" style={{
                backgroundImage: "linear-gradient(135deg, #3b82f6 0%, #a855f7 60%, #ec4899 100%)",
              }}>
                before you publish.
              </span>
            </h1>

            <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
              The only AI system that runs 6 simulated audience personas on your clip and tells you{" "}
              <span className="text-foreground font-semibold">PUBLISH</span> or{" "}
              <span className="text-foreground font-semibold">REFINE</span> — before you waste your reach.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/editor"
                className="inline-flex h-11 items-center rounded-xl px-6 text-sm font-semibold text-white transition hover:brightness-110"
                style={{
                  background: "linear-gradient(135deg, #3b82f6 0%, #a855f7 60%, #ec4899 100%)",
                }}
              >
                Start free
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
              <Link
                href="#how"
                className="inline-flex h-11 items-center rounded-xl border border-primary/40 px-6 text-sm font-semibold text-foreground transition hover:bg-primary/5"
              >
                See it work
              </Link>
            </div>
          </div>
        </section>

        {/* HOW PRE-FLIGHT WORKS */}
        <section id="how" className="py-24 px-6 border-t border-border">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                How Pre-Flight works
              </p>
              <h2
                className="mt-3 text-3xl md:text-5xl font-bold"
                style={{ letterSpacing: "-0.03em" }}
              >
                Three steps, one decision.
              </h2>
            </div>

            <div className="relative grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
              {/* Connector line on desktop */}
              <div
                aria-hidden
                className="hidden md:block absolute left-0 right-0 top-6 h-px bg-border"
                style={{ marginLeft: "16.66%", marginRight: "16.66%" }}
              />

              {[
                { n: "01", title: "Drop a clip", body: "Paste a YouTube URL or upload a file. We extract and transcribe it in your browser." },
                { n: "02", title: "Run Pre-Flight", body: "6 audience personas score the clip in parallel. Aggregator returns a consensus." },
                { n: "03", title: "Publish or refine", body: "Above threshold? Ship it. Below? The agent rewrites the cut and runs again." },
              ].map((s) => (
                <div key={s.n} className="relative bg-background pr-4">
                  <div
                    className="text-3xl font-extrabold text-primary"
                    style={{ letterSpacing: "-0.04em" }}
                  >
                    {s.n}
                  </div>
                  <h3 className="mt-3 text-xl font-bold">{s.title}</h3>
                  <p className="mt-2 text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="py-24 px-6 border-t border-border">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Features
              </p>
              <h2
                className="mt-3 text-3xl md:text-5xl font-bold"
                style={{ letterSpacing: "-0.03em" }}
              >
                Built for creators who don&apos;t guess.
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="group rounded-xl border border-border bg-secondary/40 p-6 transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 border-l-[3px] border-l-transparent hover:border-l-primary"
                >
                  <f.icon className="w-5 h-5 text-primary mb-4" />
                  <h3 className="text-base font-bold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* STATS STRIP */}
        <section className="py-20 px-6 border-t border-border bg-secondary/30">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-10 text-center">
            {STATS.map((s) => (
              <div key={s.label}>
                <div
                  className="text-4xl md:text-5xl font-extrabold text-primary"
                  style={{ letterSpacing: "-0.03em" }}
                >
                  {s.value}
                </div>
                <div className="mt-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="py-24 px-6 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Pricing
              </p>
              <h2 className="mt-3 text-3xl md:text-5xl font-bold" style={{ letterSpacing: "-0.03em" }}>
                Start free. Upgrade when it pays for itself.
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Free */}
              <div className="rounded-xl border border-border bg-secondary/40 p-8 flex flex-col">
                <span className="inline-flex items-center self-start rounded-full bg-foreground/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Free
                </span>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold" style={{ letterSpacing: "-0.03em" }}>$0</span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Try Pre-Flight on real clips.</p>

                <ul className="mt-6 space-y-3 flex-1">
                  {FREE_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm">
                      <Check className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signin"
                  className="mt-8 inline-flex h-11 items-center justify-center rounded-xl border border-border text-sm font-semibold transition hover:bg-foreground/5"
                >
                  Start free
                </Link>
              </div>

              {/* Pro */}
              <div
                className="relative rounded-xl p-8 flex flex-col"
                style={{
                  border: "1px solid rgba(168, 85, 247, 0.35)",
                  background: "linear-gradient(180deg, rgba(168, 85, 247, 0.06), transparent 40%)",
                  boxShadow: "0 0 40px rgba(168, 85, 247, 0.12)",
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white"
                    style={{
                      background: "linear-gradient(135deg, #3b82f6, #a855f7, #ec4899)",
                    }}
                  >
                    Pro
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-primary font-semibold">
                    Most popular
                  </span>
                </div>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold" style={{ letterSpacing: "-0.03em" }}>$29</span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">For creators who publish weekly.</p>

                <ul className="mt-6 space-y-3 flex-1">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm">
                      <Check className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/pricing"
                  className="mt-8 inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold text-white transition hover:brightness-110"
                  style={{
                    background: "linear-gradient(135deg, #3b82f6 0%, #a855f7 60%, #ec4899 100%)",
                  }}
                >
                  Go Pro
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="py-28 px-6 border-t border-border text-center">
          <h2
            className="text-3xl md:text-5xl font-bold"
            style={{ letterSpacing: "-0.03em" }}
          >
            Stop publishing blind.
          </h2>
          <Link
            href="/editor"
            className="mt-8 inline-flex h-12 items-center rounded-xl px-8 text-sm font-semibold text-white transition hover:brightness-110"
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #a855f7 60%, #ec4899 100%)",
            }}
          >
            Run your first Pre-Flight
            <ArrowRight className="ml-2 w-4 h-4" />
          </Link>
        </section>
      </main>

      <Footer />
    </div>
  );
}
