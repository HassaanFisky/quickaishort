import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Terms of Service — Quick AI Shorts",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-32 pb-24 px-6 max-w-3xl mx-auto w-full">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Terms
        </p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: April 29, 2026
        </p>
        <div className="mt-8 space-y-6 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-foreground font-semibold mb-2">Use of the service</h2>
            <p>
              You may use Quick AI Shorts for lawful creation of short-form video
              content from sources you own or have rights to use. You retain full
              ownership of clips you produce.
            </p>
          </section>
          <section>
            <h2 className="text-foreground font-semibold mb-2">Account</h2>
            <p>
              You are responsible for activity under your account. We may suspend
              accounts that abuse the service or violate platform terms of upstream
              video providers.
            </p>
          </section>
          <section>
            <h2 className="text-foreground font-semibold mb-2">Disclaimer</h2>
            <p>
              The service is provided as-is during the public beta. Pre-Flight
              persona simulations are predictive aids — not guarantees of audience
              behavior.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
