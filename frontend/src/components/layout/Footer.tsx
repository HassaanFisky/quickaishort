import Link from "next/link";
import Logo from "@/components/shared/Logo";

export default function Footer() {
  return (
    <footer className="w-full border-t ghost-border py-16 relative z-30">
      <div className="container mx-auto px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="flex flex-col items-center md:items-start gap-4">
            <Logo />
            <p className="text-muted-foreground text-sm max-w-xs text-center md:text-left leading-relaxed">
              The world&apos;s first browser-based AI Shorts generator.
              <br />
              Secure, fast, and free forever.
            </p>
          </div>

          <nav className="flex items-center gap-8">
            <Link
              href="/editor"
              className="text-sm font-medium text-muted-foreground hover:text-foreground interactive"
            >
              Editor
            </Link>
            <Link
              href="/#features"
              className="text-sm font-medium text-muted-foreground hover:text-foreground interactive"
            >
              Features
            </Link>
          </nav>
        </div>

        <div className="mt-16 pt-8 border-t ghost-border text-center text-xs text-muted-foreground/50">
          © {new Date().getFullYear()} QuickAI Shorts. Built with Intelligence.
        </div>
      </div>
    </footer>
  );
}
