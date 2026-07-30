import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { CONTACT_EMAIL, mailto } from "@/lib/email-addresses";

export const metadata: Metadata = {
  title: "Terms of Service — QuickAI Short",
  description:
    "Terms governing use of QuickAI Short at quickaishort.online — accounts, content, Paddle billing, AI features, and liability.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-32 pb-24 px-6 max-w-3xl mx-auto w-full">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Legal
        </p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: July 30, 2026 · Effective for{" "}
          <span className="text-foreground/80">quickaishort.online</span>
        </p>
        <p className="mt-6 text-muted-foreground leading-relaxed">
          These Terms of Service (&quot;Terms&quot;) govern your access to and
          use of QuickAI Short at{" "}
          <strong className="text-foreground font-medium">quickaishort.online</strong>{" "}
          (the &quot;Service&quot;), operated by QuickAI Short (&quot;QuickAI,&quot;
          &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By creating an
          account or using the Service, you agree to these Terms and our{" "}
          <Link href="/privacy" className="text-foreground underline underline-offset-4 hover:text-primary">
            Privacy Policy
          </Link>
          .
        </p>

        <div className="mt-10 space-y-10 text-muted-foreground leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              1. The Service
            </h2>
            <p>
              QuickAI Short is a cloud-native platform for conversational AI video
              editing and short-form creation — including browser and server-side
              media workflows, Pre-Flight / multi-agent analysis, captions,
              dubbing, and export. Features, limits, and credit costs may vary by
              plan (Free, Pro, and any future tiers) and are described on our{" "}
              <Link href="/pricing" className="text-foreground underline underline-offset-4 hover:text-primary">
                Pricing
              </Link>{" "}
              page. We may modify, suspend, or discontinue features with
              reasonable notice when practical.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              2. Eligibility &amp; accounts
            </h2>
            <p>
              You must be legally able to enter a binding contract in your
              jurisdiction and meet any minimum age requirements. You are
              responsible for safeguarding your credentials and for all activity
              under your account. Notify us promptly of unauthorized use at{" "}
              <a href={mailto(CONTACT_EMAIL)} className="text-foreground underline underline-offset-4 hover:text-primary">
                {CONTACT_EMAIL}
              </a>
              . We may suspend or terminate accounts that violate these Terms,
              abuse infrastructure, attempt to bypass billing or rate limits, or
              infringe third-party rights.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              3. Acceptable use &amp; content rights
            </h2>
            <p>
              You may use the Service only for lawful purposes. You represent that
              you own or have all rights and licenses needed for any video, audio,
              images, scripts, or other materials you upload, link, or process
              (including rights required by YouTube or other upstream platforms).
              You retain ownership of your original content and outputs you create,
              subject to the licenses below and third-party model/provider terms.
            </p>
            <p>
              You grant QuickAI a limited, worldwide, non-exclusive license to
              host, process, transmit, and display your content solely as needed
              to operate the Service for you (including cloud storage, rendering,
              AI API calls you initiate, and support). You must not upload or
              generate content that is illegal, infringing, harmful, or that
              violates another person&apos;s privacy or publicity rights.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              4. AI features &amp; no training without consent
            </h2>
            <p>
              AI features (including Gemini-powered analysis, chat edits,
              Pre-Flight personas, translation/dubbing, and related suggestions)
              are assistive tools. Outputs may be inaccurate, incomplete, or
              unsuitable for your use case. Pre-Flight scores and persona
              simulations are predictive aids —{" "}
              <strong className="text-foreground font-medium">
                not guarantees
              </strong>{" "}
              of audience behavior, views, or revenue.
            </p>
            <p>
              <strong className="text-foreground font-medium">
                We do not train our internal models on your user content without
                your explicit consent.
              </strong>{" "}
              Content you submit may be processed by third-party AI APIs solely to
              fulfill your requests, under those providers&apos; applicable terms.
              You remain responsible for reviewing outputs before publishing.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              5. Plans, credits &amp; Paddle billing
            </h2>
            <p>
              Free and paid plan limits (resolution, watermarks, daily AI
              workloads, credits, storage boundaries, and Pro unlocks) are as
              stated on Pricing and in-product. Credits and entitlements are
              licensed for use on the Service and have no cash value except where
              required by law.
            </p>
            <p>
              Paid subscriptions are sold and billed through{" "}
              <strong className="text-foreground font-medium">Paddle</strong>, a
              globally compliant Merchant of Record that processes payments,
              invoices, and applicable taxes. By upgrading, you also agree to
              Paddle&apos;s checkout terms presented at purchase. Cancellation
              stops future renewals according to Paddle&apos;s and our stated
              policies; you generally keep Pro access until the end of the paid
              period. Refunds are governed by our{" "}
              <Link href="/refund-policy" className="text-foreground underline underline-offset-4 hover:text-primary">
                Refund Policy
              </Link>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              6. Privacy
            </h2>
            <p>
              Our collection and use of personal data is described in the{" "}
              <Link href="/privacy" className="text-foreground underline underline-offset-4 hover:text-primary">
                Privacy Policy
              </Link>
              . We are committed to protecting user data privacy and process
              payments through Paddle&apos;s secure, globally compliant systems.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              7. Intellectual property
            </h2>
            <p>
              The Service, branding, UI, software, and documentation are owned by
              QuickAI or its licensors. These Terms do not transfer ownership of
              QuickAI IP to you. Feedback you submit may be used by us without
              obligation to you.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              8. Third-party services
            </h2>
            <p>
              The Service interoperate with third parties (for example Google
              Cloud, Google Gemini, identity providers, email providers, and
              Paddle). Your use of those services may be subject to their terms.
              We are not responsible for third-party outages, policy changes, or
              content hosted outside QuickAI.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              9. Disclaimers
            </h2>
            <p>
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS
              AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED,
              INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
              NON-INFRINGEMENT. WE DO NOT WARRANT UNINTERRUPTED OR ERROR-FREE
              OPERATION, OR THAT AI OUTPUTS WILL MEET YOUR EXPECTATIONS.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              10. Limitation of liability
            </h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, QUICKAI AND ITS AFFILIATES
              WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL,
              CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE,
              DATA, OR GOODWILL. OUR AGGREGATE LIABILITY ARISING OUT OF THESE
              TERMS OR THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS
              YOU PAID TO US FOR THE SERVICE IN THE TWELVE (12) MONTHS BEFORE THE
              CLAIM OR (B) ONE HUNDRED U.S. DOLLARS (US $100). Some jurisdictions
              do not allow certain limitations; in those cases, our liability is
              limited to the fullest extent permitted.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              11. Indemnity
            </h2>
            <p>
              You will defend and indemnify QuickAI against claims arising from
              your content, your use of the Service, or your violation of these
              Terms or applicable law, except to the extent caused by our willful
              misconduct.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              12. Changes &amp; termination
            </h2>
            <p>
              We may update these Terms by posting a revised version with a new
              &quot;Last updated&quot; date. Continued use after changes become
              effective constitutes acceptance. You may stop using the Service at
              any time. We may terminate or suspend access for breach or risk to
              the Service. Sections that by nature should survive (including IP,
              disclaimers, liability limits, and indemnity) will survive
              termination.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              13. Governing law
            </h2>
            <p>
              These Terms are governed by the laws applicable to our principal
              place of business operations for the Service, without regard to
              conflict-of-law rules, except where mandatory consumer protections
              in your country apply. Courts in that jurisdiction will have
              exclusive venue for disputes, subject to those mandatory rights.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              14. Contact
            </h2>
            <p>
              Questions about these Terms:{" "}
              <a href={mailto(CONTACT_EMAIL)} className="text-foreground underline underline-offset-4 hover:text-primary">
                {CONTACT_EMAIL}
              </a>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
