"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Sparkles, Zap, ArrowRight, Loader2, ChevronDown, ShieldCheck } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { GlowButton } from "@/components/ui/GlowButton";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";
import { ActivationCard } from "@/components/shared/ActivationCard";
import { ConfettiBurst } from "@/components/shared/ConfettiBurst";
import { cn } from "@/lib/utils";

const FAQS: { q: string; a: string; link?: { href: string; label: string } }[] = [
  {
    q: "What's the difference between Free and Pro?",
    a: "Free gives you local browser AI processing, transcription, AI clip detection (5 clips per video), 9:16 auto-reframe, face tracking, and 720p export with a \"Made with QuickAI\" watermark. Pro adds 4K export, watermark removal, Deep Analysis (Gemini-powered viral intelligence), unlimited clip suggestions, export history with cloud sync, and priority processing.",
  },
  {
    q: "Where is my video processed?",
    a: "Preview, transcription, and clip analysis run locally in your browser. When you request a final server export, the render happens in our cloud and the finished file is stored for you to download.",
  },
  {
    q: "What export formats do you support?",
    a: "Vertical 9:16 MP4, ready for Shorts, Reels, and TikTok. Free exports at 720p with a watermark; Pro exports up to 4K with no watermark.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your Paddle receipt email or by contacting support — you keep Pro access until the end of the current billing period.",
  },
  {
    q: "What's your refund policy?",
    a: "See our full refund policy for details on eligibility windows and how to request one.",
    link: { href: "/refund-policy", label: "Read the refund policy" },
  },
  {
    q: "Does it work on mobile?",
    a: "Yes. The editor is touch-optimized for phones and tablets. Browser-side AI features work best in a modern desktop browser.",
  },
  {
    q: "Do you offer team plans?",
    a: "A Teams tier (multiple seats, batch processing, API access) is coming soon — join the waitlist by emailing support@quickaishort.online.",
  },
];

const PADDLE_PRICE_ID_PRO =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO ?? "pri_01krk7sez47kmd25kdtnff1z9t";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Local browser AI processing. No credit card required.",
    features: [
      "Local browser AI processing",
      "Transcription (in-browser Whisper)",
      "AI clip detection (5 clips/video)",
      "9:16 auto-reframe",
      "Face tracking",
      "720p export with \"Made with QuickAI\" watermark",
    ],
    cta: "Start Free",
    href: "/editor",
    highlight: false,
    paddle: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    period: "per month",
    description: "4K export, no watermark, and Gemini-powered Deep Analysis.",
    features: [
      "Everything in Free",
      "4K export",
      "Watermark removal",
      "Deep Analysis (Gemini-powered viral intelligence)",
      "Unlimited clip suggestions",
      "Whisper Large transcription",
      "Export history & cloud sync",
      "Priority processing queue",
      "Caption style presets",
    ],
    cta: "Upgrade to Pro",
    href: "#",
    highlight: true,
    paddle: true,
  },
];

export default function PricingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [activationInProgress, setActivationInProgress] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const isPro = Boolean(session?.user?.isPro);
  const userId =
    (session?.user as { id?: string } | undefined)?.id ?? session?.user?.email ?? "";

  // Subscribe to the global Paddle event bridge from PaddleProvider. The
  // checkout overlay is async and user-driven, so checkoutLoading must stay
  // true for its entire lifetime (open → completed/closed/error), not just
  // for the synchronous Checkout.open() call.
  useEffect(() => {
    const onCompleted = () => {
      setCheckoutLoading(false);
      setShowConfetti(true);
      window.setTimeout(() => setShowConfetti(false), 1800);
      if (userId) setActivationInProgress(true);
    };
    const onClosed = () => setCheckoutLoading(false);
    const onError = () => {
      setCheckoutLoading(false);
      toast.error("Checkout couldn't be completed.", {
        description: "Your card may have been declined, or there was a network issue.",
        action: { label: "Try again", onClick: () => void handleCheckout() },
      });
    };
    window.addEventListener("paddle:checkout-completed", onCompleted);
    window.addEventListener("paddle:checkout-closed", onClosed);
    window.addEventListener("paddle:checkout-error", onError);
    return () => {
      window.removeEventListener("paddle:checkout-completed", onCompleted);
      window.removeEventListener("paddle:checkout-closed", onClosed);
      window.removeEventListener("paddle:checkout-error", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleActivated = useCallback(() => {
    fetch("/api/account/notify-pro-activated", { method: "POST" }).catch(() => {
      /* best-effort — the welcome toast on /editor still confirms activation */
    });
    window.setTimeout(() => router.push("/editor?welcome=1"), 1200);
  }, [router]);

  const handleCheckout = async () => {
    if (!session?.user) {
      signIn("google", { callbackUrl: "/pricing" });
      return;
    }

    if (!window.Paddle) {
      toast.error("Payment system not ready. Please refresh and try again.");
      return;
    }

    const userId = (session.user as { id?: string }).id ?? session.user.email ?? "";
    if (!userId) {
      toast.error("Could not identify your account. Please sign in again.");
      return;
    }

    setCheckoutLoading(true);
    try {
      window.Paddle.Checkout.open({
        items: [{ priceId: PADDLE_PRICE_ID_PRO, quantity: 1 }],
        customData: { userId },
        settings: {
          displayMode: "overlay",
          theme: "dark",
        },
      });
    } catch (err) {
      setCheckoutLoading(false);
      toast.error("Could not open checkout. Please try again.");
      if (process.env.NODE_ENV !== "production") console.error("Paddle checkout error:", err);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <ConfettiBurst show={showConfetti} />
      <Navbar />

      <section aria-label="Pricing" className="pt-32 pb-24">
        <div className="container mx-auto px-6 max-w-6xl">
          {/* Activation status — mounts immediately on checkout.completed and
              polls for is_pro: true while running NextAuth.update(). */}
          {activationInProgress && userId && (
            <div className="mb-12">
              <ActivationCard userId={userId} onActivated={handleActivated} />
            </div>
          )}

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-20"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-primary text-xs font-bold uppercase tracking-widest mb-8">
              <Sparkles className="w-3 h-3" />
              Simple Pricing
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 premium-gradient-text">
              SHIP MORE.<br />SPEND LESS.
            </h1>
            <p className="text-muted-foreground text-xl max-w-2xl mx-auto">
              Start free with local browser AI and 720p exports. Go Pro for 4K, watermark removal, and Gemini-powered Deep Analysis.
            </p>
          </motion.div>

          {/* Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={cn(
                  "relative rounded-[2rem] p-8 flex flex-col gap-6",
                  plan.highlight
                    ? "nano-glass border-2 border-transparent bg-origin-border shadow-[0_0_40px_rgba(168,85,247,0.12)] [background-image:linear-gradient(hsl(var(--bg-base)),hsl(var(--bg-base))),linear-gradient(135deg,#a855f7,#ec4899)] [background-clip:padding-box,border-box]"
                    : "nano-glass border border-white/5",
                )}
              >
                {plan.highlight && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                    <Zap className="w-3 h-3 fill-current" />
                    Most Popular
                  </div>
                )}
                {session?.user && ((plan.id === "pro" && isPro) || (plan.id === "free" && !isPro)) && (
                  <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-foreground/10 border border-foreground/15 text-[9px] font-black uppercase tracking-widest text-foreground/70">
                    Current Plan
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">
                    {plan.name}
                  </h3>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-5xl font-bold tracking-tighter">
                      {plan.price}
                    </span>
                    <span className="text-muted-foreground text-sm pb-1">
                      /{plan.period}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {plan.description}
                  </p>
                  {plan.id === "pro" && (
                    <p className="text-[10px] text-fg-muted mt-2 leading-relaxed">
                      Traditional NLE subscriptions start at $22/mo — QuickAI includes conversational editing + cloud export for $29.
                    </p>
                  )}
                </div>

                <ul className="space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-foreground/80">{feature}</span>
                    </li>
                  ))}
                </ul>

                {plan.paddle ? (
                  isPro ? (
                    <GlowButton variant="glass" className="w-full h-12 rounded-2xl font-bold" disabled>
                      <Check className="w-4 h-4 mr-2" />
                      Current Plan
                    </GlowButton>
                  ) : (
                    <GlowButton
                      variant="premium"
                      className="w-full h-12 rounded-2xl font-bold group"
                      onClick={handleCheckout}
                      disabled={checkoutLoading}
                    >
                      {checkoutLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          {session?.user ? plan.cta : "Sign in to Upgrade"}
                          <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </GlowButton>
                  )
                ) : (
                  <GlowButton
                    variant="glass"
                    className="w-full h-12 rounded-2xl font-bold group"
                    asChild
                  >
                    <Link href={plan.href}>
                      {plan.cta}
                      <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </GlowButton>
                )}
              </motion.div>
            ))}
          </div>

          {/* Teams — coming soon */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="max-w-3xl mx-auto mt-8"
          >
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-white/5 nano-glass px-6 py-4">
              <p className="text-sm text-muted-foreground text-center sm:text-left">
                <span className="font-bold text-foreground">Teams — coming soon.</span>{" "}
                Multiple seats, batch processing, and API access.
              </p>
              <a
                href="mailto:support@quickaishort.online?subject=Teams%20waitlist"
                className="text-sm font-semibold text-primary hover:underline whitespace-nowrap"
              >
                Join the waitlist
              </a>
            </div>
          </motion.div>

          {/* Bottom note */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="flex items-center justify-center gap-2 text-center text-muted-foreground text-sm mt-16"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
            Payments secured by Paddle. Cancel anytime.
          </motion.div>

          {/* FAQ */}
          <div className="max-w-2xl mx-auto mt-24">
            <h2 className="text-2xl font-bold tracking-tight text-center mb-8">
              Frequently asked questions
            </h2>
            <div className="flex flex-col divide-y divide-white/5 rounded-2xl border border-white/5 nano-glass overflow-hidden">
              {FAQS.map((faq, i) => {
                const isOpen = openFaq === i;
                return (
                  <div key={faq.q}>
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-white/[0.02] transition-colors"
                    >
                      <span className="text-sm font-bold text-foreground">{faq.q}</span>
                      <ChevronDown
                        className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200", isOpen && "rotate-180")}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <p className="px-6 pb-5 text-sm text-muted-foreground leading-relaxed">
                            {faq.a}{" "}
                            {faq.link && (
                              <Link href={faq.link.href} className="text-primary font-semibold hover:underline">
                                {faq.link.label}
                              </Link>
                            )}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
