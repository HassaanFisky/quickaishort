import Link from "next/link";
import QSLogo from "@/components/shared/QSLogo";

const LINKS = [
  { href: "/editor",        label: "Editor"   },
  { href: "/#features",     label: "Features" },
  { href: "/privacy",       label: "Privacy"  },
  { href: "/terms",         label: "Terms"    },
  { href: "/refund-policy", label: "Refunds"  },
];

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

          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={[
                  "text-[13px] font-medium text-[#52525b] hover:text-[#a1a1aa]",
                  "transition-colors duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                  "focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4",
                ].join(" ")}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-12 pt-6 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-[#3f3f46]">
            © {new Date().getFullYear()} QuickAI Shorts. All rights reserved.
          </p>
          <p className="text-[11px] text-[#3f3f46]">
            Built with Gemini 2.5 Flash · Google ADK
          </p>
        </div>
      </div>
    </footer>
  );
}
