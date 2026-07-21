import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Refund Policy — Quick AI Shorts",
  description: "Our fair and transparent refund policy for QuickAI Short digital services.",
};

export default function RefundPolicyPage() {
  const lastUpdated = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="min-h-screen flex flex-col selection:bg-indigo-500/30">
      <Navbar />
      <main className="flex-1 pt-32 pb-24 px-6 max-w-3xl mx-auto w-full">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.3em] font-semibold text-indigo-500">
            Compliance
          </p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground">
            Refund Policy
          </h1>
          <p className="text-sm text-muted-foreground/60">
            Last updated: {lastUpdated}
          </p>
        </div>

        <div className="mt-12 space-y-10 text-muted-foreground leading-relaxed text-lg">
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">1. Digital Nature of Service</h2>
            <p>
              QuickAI Short provides digital software-as-a-service (SaaS) products. Due to the 
              immediate delivery and nature of digital goods, all purchases are generally final 
              and non-refundable once credits have been consumed or a subscription has been active.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">2. Refund Eligibility</h2>
            <p>
              We prioritize fairness. While we maintain a strict policy, we may consider refund 
              requests on a case-by-case basis in the following exceptional circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-3 marker:text-indigo-500">
              <li>
                <span className="text-foreground font-medium">Duplicate Charges:</span> If our system bills you twice 
                erroneously for the same transaction.
              </li>
              <li>
                <span className="text-foreground font-medium">Major Technical Failure:</span> If a verified system error 
                permanently prevents you from accessing core services you paid for, and our support 
                team cannot resolve it within a reasonable timeframe.
              </li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">3. Subscriptions & Cancellations</h2>
            <p>
              You may cancel your subscription at any time through your dashboard settings. 
              Cancellation will stop future billing cycles but does not entitle you to a refund 
              for the current active period. 
            </p>
            <div className="bg-secondary/30 border border-border/50 rounded-2xl p-6 italic text-base">
              Users are responsible for managing their subscriptions and performing cancellations 
              prior to the renewal date. We do not provide prorated refunds for mid-month cancellations.
            </div>
          </section>

          <section className="space-y-4 border-t border-border pt-10">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">4. Contact Support</h2>
            <p>
              If you believe you qualify for an exceptional refund or have billing concerns, 
              please reach out to our team at:
            </p>
            <div className="inline-block px-6 py-3 bg-foreground/5 rounded-full border border-foreground/10 text-foreground font-medium hover:bg-foreground/10 transition-colors cursor-pointer">
              support@quickaishort.online
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
