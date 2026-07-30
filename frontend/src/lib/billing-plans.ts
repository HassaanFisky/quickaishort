/**
 * Canonical Paddle Billing plan catalog — single source for /pricing + landing.
 * Pro is the only sellable paid SKU (NEXT_PUBLIC_PADDLE_PRICE_ID_PRO).
 */

export const PADDLE_PRICE_ID_PRO =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO ?? "pri_01krk7sez47kmd25kdtnff1z9t";

export type BillingPlanId = "free" | "pro" | "agency";

export type BillingPlan = {
  id: BillingPlanId;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
  highlight: boolean;
  /** Opens Paddle Checkout (Pro only). */
  paddle: boolean;
};

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Conversation-first editing with clear limits. No credit card.",
    features: [
      "Chat-primary Studio editor",
      "Browser transcription + clip detection",
      "3 AI video workloads / day (UTC)",
      "100 starter credits (no auto-refresh)",
      "Export up to 720p",
      "Mandatory “Made with QuickAI” watermark",
      "500 MB projected storage boundary",
      "1 credit / AI chat · 20 credits / export",
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
    description: "Unlock resolution, watermark removal, and unlimited daily AI workloads.",
    features: [
      "Everything in Free",
      "Exports up to 4K — no watermark",
      "Unlimited daily AI video workloads",
      "+100 credits on each paid Pro grant",
      "Deep analysis / Pre-Flight (50 credits)",
      "Dub Video (15–40 credits)",
      "Cloud export history via GCS",
      "Priority: honest usage meter in Studio",
    ],
    cta: "Upgrade to Pro",
    href: "/pricing",
    highlight: true,
    paddle: true,
  },
  {
    id: "agency",
    name: "Agency",
    price: "$49",
    period: "per month",
    description: "Teams & API — Coming Soon (not available for purchase).",
    features: [
      "Everything in Pro (when shipped)",
      "5 team seats — Coming Soon",
      "Batch processing — Coming Soon",
      "API access — Coming Soon",
      "Custom branding — Coming Soon",
      "Dedicated support — Coming Soon",
    ],
    cta: "Coming Soon",
    href: "#",
    highlight: false,
    paddle: false,
  },
];
