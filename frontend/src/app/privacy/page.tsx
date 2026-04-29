import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy — Quick AI Shorts",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-32 pb-24 px-6 max-w-3xl mx-auto w-full">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Privacy
        </p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: April 29, 2026
        </p>
        <div className="mt-8 space-y-6 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-foreground font-semibold mb-2">What we collect</h2>
            <p>
              Account email and Google profile name when you sign in. Project
              metadata you create (titles, timestamps, viral scores). No raw video
              data leaves your browser unless you explicitly export it.
            </p>
          </section>
          <section>
            <h2 className="text-foreground font-semibold mb-2">How we use it</h2>
            <p>
              To provide the editor and Pre-Flight analysis, and to operate your
              account. We do not sell data. We do not run third-party advertising.
            </p>
          </section>
          <section>
            <h2 className="text-foreground font-semibold mb-2">Contact</h2>
            <p>
              Questions: hassaan@quickaishort.online
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
