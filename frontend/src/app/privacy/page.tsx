import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { CONTACT_EMAIL, mailto } from "@/lib/email-addresses";

export const metadata: Metadata = {
  title: "Privacy Policy — QuickAI Short",
  description:
    "How QuickAI Short (quickaishort.online) collects, uses, protects, and shares your data — including Paddle payments and AI processing.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-32 pb-24 px-6 max-w-3xl mx-auto w-full">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Legal
        </p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: July 30, 2026 · Effective for{" "}
          <span className="text-foreground/80">quickaishort.online</span>
        </p>
        <p className="mt-6 text-muted-foreground leading-relaxed">
          QuickAI Short (&quot;QuickAI,&quot; &quot;we,&quot; &quot;us,&quot; or
          &quot;our&quot;) operates the website and product at{" "}
          <strong className="text-foreground font-medium">quickaishort.online</strong>{" "}
          (the &quot;Service&quot;). This Privacy Policy explains what information
          we collect, how we use it, how we protect it, and your choices. By using
          the Service, you agree to this Policy.
        </p>

        <div className="mt-10 space-y-10 text-muted-foreground leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              1. Our privacy commitment
            </h2>
            <p>
              We design the Service to protect user data privacy. We collect only
              what we need to operate accounts, process edits and exports, bill
              subscriptions, and improve reliability. We do{" "}
              <strong className="text-foreground font-medium">not</strong> sell
              personal data. We do{" "}
              <strong className="text-foreground font-medium">not</strong> run
              third-party advertising networks on the Service. We do{" "}
              <strong className="text-foreground font-medium">not</strong> train
              our own internal machine-learning models on your content, prompts,
              transcripts, or project files{" "}
              <strong className="text-foreground font-medium">
                without your explicit consent
              </strong>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              2. Information we collect
            </h2>
            <h3 className="text-foreground font-medium text-base">
              2.1 Account &amp; identity
            </h3>
            <p>
              When you register or sign in (including via Google OAuth or email
              credentials), we may collect your name, email address, profile
              image URL (if provided by the identity provider), and a unique user
              identifier. We use this to authenticate you and operate your
              account.
            </p>
            <h3 className="text-foreground font-medium text-base">
              2.2 Project &amp; usage data
            </h3>
            <p>
              We store project metadata and operational records needed to run the
              editor and Studio features — for example titles, timestamps, credit
              balances, export job status, viral/Pre-Flight scores, chat edit
              history associated with your account, and similar product telemetry
              required for reliability, abuse prevention, and support.
            </p>
            <h3 className="text-foreground font-medium text-base">
              2.3 Media you upload or process
            </h3>
            <p>
              Depending on the workflow you choose, media may be processed in the
              browser and/or temporarily stored in our cloud infrastructure (for
              example Google Cloud Storage) to complete uploads, server-side
              exports, dubbing, or related jobs. We treat your media as
              confidential customer content and use it only to provide the
              features you request.
            </p>
            <h3 className="text-foreground font-medium text-base">
              2.4 Payment information
            </h3>
            <p>
              Paid plans are processed by{" "}
              <strong className="text-foreground font-medium">Paddle</strong>,
              our Merchant of Record. Paddle collects and processes payment
              card and billing details under its own privacy and compliance
              program. We do{" "}
              <strong className="text-foreground font-medium">not</strong> store
              full payment card numbers on QuickAI servers. We may receive
              limited billing metadata from Paddle (for example subscription
              status, transaction IDs, and customer identifiers) so we can
              activate Pro entitlements and provide support.
            </p>
            <h3 className="text-foreground font-medium text-base">
              2.5 Technical &amp; device data
            </h3>
            <p>
              Like most online services, we automatically receive technical data
              such as IP address, browser type, device/OS information, approximate
              location derived from IP, referrer, and request logs. We may use
              cookies or similar technologies for authentication, session
              security, and essential product function.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              3. How we use information
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide, secure, and improve the Service (editor, AI chat, Pre-Flight, export, dubbing, and related features).</li>
              <li>Authenticate users, manage credits/entitlements, and prevent fraud or abuse.</li>
              <li>Process subscriptions and fulfill paid features via Paddle webhooks and status updates.</li>
              <li>Send transactional messages (for example password reset, welcome, or Pro activation notices) when configured.</li>
              <li>Comply with law, enforce our Terms, and respond to lawful requests.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              4. AI processing &amp; model training
            </h2>
            <p>
              Certain features send prompts, transcripts, captions, or other
              content you provide to third-party AI providers (currently Google
              Gemini APIs) solely to generate the analysis, edits, translations,
              or suggestions you request. Those providers process data under
              their terms and data-processing terms applicable to API customers.
            </p>
            <p>
              <strong className="text-foreground font-medium">
                We do not train internal QuickAI models on your user content
                without your explicit consent.
              </strong>{" "}
              We do not sell your content for advertising model training. If we
              ever offer an optional program that uses customer content to
              improve proprietary models, we will obtain clear, affirmative
              consent before any such use.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              5. Payments &amp; global billing compliance
            </h2>
            <p>
              Subscriptions and paid upgrades are handled by{" "}
              <strong className="text-foreground font-medium">Paddle</strong>, a
              global Merchant of Record that provides PCI-aligned payment
              processing and handles applicable sales tax / VAT collection in
              supported jurisdictions. Payment security, invoicing, and many
              consumer billing obligations are administered through Paddle&apos;s
              systems. For Paddle&apos;s own privacy practices, see Paddle&apos;s
              published policies. Our{" "}
              <Link href="/refund-policy" className="text-foreground underline underline-offset-4 hover:text-primary">
                Refund Policy
              </Link>{" "}
              describes how billing disputes and exceptional refunds are handled.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              6. Sharing &amp; processors
            </h2>
            <p>
              We share data only with service providers who help us operate the
              Service, under appropriate contractual and technical safeguards,
              including (as applicable): cloud hosting and object storage (Google
              Cloud), databases (for example MongoDB Atlas / Google Firestore),
              authentication providers, email delivery, monitoring, and Paddle for
              payments. We may disclose information if required by law or to
              protect the rights, safety, or integrity of QuickAI, our users, or
              the public.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              7. Retention &amp; security
            </h2>
            <p>
              We retain account and project data for as long as your account is
              active and as needed to provide the Service, resolve disputes,
              enforce agreements, and meet legal obligations. Media objects and
              job artifacts may be deleted or expired according to product
              storage limits and operational policies. We use industry-standard
              safeguards (encryption in transit, access controls, and least-privilege
              service accounts). No method of transmission or storage is 100%
              secure; we cannot guarantee absolute security.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              8. Your choices &amp; rights
            </h2>
            <p>
              Depending on your location, you may have rights to access, correct,
              delete, or export personal data, or to object to certain processing.
              To exercise a request, email{" "}
              <a href={mailto(CONTACT_EMAIL)} className="text-foreground underline underline-offset-4 hover:text-primary">
                {CONTACT_EMAIL}
              </a>
              . We may need to verify your identity before fulfilling a request.
              You may also close your account and stop using the Service at any
              time, subject to our Terms and any active subscription terms with
              Paddle.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              9. Children
            </h2>
            <p>
              The Service is not directed to children under 13 (or the minimum
              age required in your jurisdiction). We do not knowingly collect
              personal information from children. If you believe a child has
              provided us data, contact us and we will take appropriate steps to
              delete it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              10. International transfers
            </h2>
            <p>
              We and our processors may process data in the United States and
              other countries where our infrastructure operates. Where required,
              we rely on appropriate transfer mechanisms offered by our providers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              11. Changes
            </h2>
            <p>
              We may update this Policy from time to time. The &quot;Last
              updated&quot; date will change when we do. Material changes may be
              highlighted in-product or by email when appropriate. Continued use
              of the Service after an update constitutes acceptance of the revised
              Policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground font-semibold text-xl">
              12. Contact
            </h2>
            <p>
              Privacy questions for QuickAI Short / quickaishort.online:{" "}
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
