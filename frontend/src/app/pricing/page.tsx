"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { Check, Sparkles, Zap, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { GlowButton } from "@/components/ui/GlowButton";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";

const PADDLE_PRICE_ID_PRO =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO ?? "pri_01krk7sez47kmd25kdtnff1z9t";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Full browser-side AI engine. No credit card required.",
    features: [
      "Professional local processing",
      "Content transcription (Standard)",
      "AI clip detection (5 clips/video)",
      "9:16 auto-reframe",
      "Browser preview export (MediaRecorder)",
      "Face tracking",
    ],
    cta: "Start Free",
    href: "/editor",
    highlight: false,
    paddle: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$19",
    period: "per month",
    description: "Powered by Gemini 2.5 Flash. Elite viral intelligence.",
    features: [
      "Everything in Free",
      "Elite Viral Intelligence scoring",
      "Unlimited clip suggestions",
      "Whisper Large model",
      "Export history & cloud sync",
      "Priority processing queue",
      "Caption style presets",
      "Watermark removal",
    ],
    cta: "Upgrade to Pro",
    href: "#",
    highlight: true,
    paddle: true,
  },
  {
    id: "agency",
    name: "Agency",
    price: "$49",
    period: "per month",
    description: "For teams producing shorts at scale.",
    features: [
      "Everything in Pro",
      "5 team seats",
      "Batch processing",
      "API access",
      "Custom branding",
      "Dedicated support",
    ],
    cta: "Coming Soon",
    href: "#",
    highlight: false,
    paddle: false,
  },
];

export default function PricingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [checkoutLoading, setCheckoutLoading] = useState(false);

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
      toast.error("Could not open checkout. Please try again.");
      console.error("Paddle checkout error:", err);
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />

      <main className="pt-32 pb-24">
        <div className="container mx-auto px-6 max-w-6xl">
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
              Start free with full local AI processing. Upgrade for Gemini-powered viral intelligence.
            </p>
          </motion.div>

          {/* Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={`relative rounded-[2rem] p-8 flex flex-col gap-6 ${
                  plan.highlight
                    ? "nano-glass border border-primary/30 shadow-[0_0_40px_rgba(33,150,243,0.1)]"
                    : "nano-glass border border-white/5"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                    <Zap className="w-3 h-3 fill-current" />
                    Most Popular
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
                ) : plan.href !== "#" ? (
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
                ) : (
                  <GlowButton
                    variant="glass"
                    className="w-full h-12 rounded-2xl font-bold"
                    disabled
                  >
                    {plan.cta}
                  </GlowButton>
                )}
              </motion.div>
            ))}
          </div>

          {/* Bottom note */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="text-center text-muted-foreground text-sm mt-16"
          >
            Payments secured by Paddle. Cancel anytime. All plans include full client-side processing.
          </motion.p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
