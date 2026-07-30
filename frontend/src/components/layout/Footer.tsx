import Link from "next/link";
import QSLogo from "@/components/shared/QSLogo";
import { CONTACT_EMAIL, mailto } from "@/lib/email-addresses";

const NAV_LINKS = [
  { href: "/editor", label: "Editor" },
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund-policy", label: "Refunds" },
];

/** Single verified ImprovMX channel — contact@quickaishort.online */
const CONTACT_LINKS = [
  { email: CONTACT_EMAIL, label: "Contact" },
  { email: CONTACT_EMAIL, label: "Support" },
  { email: CONTACT_EMAIL, label: "Feedback" },
] as const;

export default function Footer() {
  return (
    <footer className="w-full border-t border-white/[0.05] py-14 relative z-30">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-start justify-between gap-10">
          <div className="flex flex-col gap-3">
            <QSLogo variant="wordmark" size="md" className="text-muted-foreground" />
            <p className="text-[13px] text-muted-foreground max-w-[220px] leading-relaxed">
              AI-powered clip validation for creators who ship with confidence.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-10 sm:gap-14">
            <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={[
                    "text-[13px] font-medium text-[hsl(var(--fg-subtle))] hover:text-[hsl(var(--fg-muted))]",
                    "transition-colors duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                    "focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4",
                  ].join(" ")}
                >
                  {label}
                </Link>
              ))}
            </nav>

            <nav
              aria-label="Contact"
              className="flex flex-col gap-2.5 min-w-[9rem]"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[hsl(var(--fg-subtle))] mb-0.5">
                Get in touch
              </p>
              {CONTACT_LINKS.map(({ email, label }) => (
                <a
                  key={label}
                  href={mailto(email)}
                  className={[
                    "text-[13px] font-medium text-[hsl(var(--fg-subtle))] hover:text-[hsl(var(--fg-muted))]",
                    "transition-colors duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                    "focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4",
                  ].join(" ")}
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-[hsl(var(--fg-subtle))]">
            © {new Date().getFullYear()} QuickAI Short. All rights reserved.
          </p>
          <p className="text-[11px] text-[hsl(var(--fg-subtle))]">
            Built with Gemini 2.5 Flash · Google ADK · Paddle Billing
          </p>
        </div>
      </div>
    </footer>
  );
}
