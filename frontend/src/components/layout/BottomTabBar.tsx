"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import {
  LayoutGrid,
  Scissors,
  Clapperboard,
  History as HistoryIcon,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TabItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Mirrors Sidebar.tsx NAV_ITEMS for desktop/mobile navigation parity.
// Labels are shortened to fit a 5-tab layout at 320px viewport width.
const TABS: TabItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutGrid },
  { href: "/editor", label: "Editor", icon: Scissors },
  { href: "/adk", label: "Studio", icon: Clapperboard },
  { href: "/history", label: "Library", icon: HistoryIcon },
  { href: "/settings", label: "Profile", icon: SettingsIcon },
];

// Routes where the tab bar should never render, even if the session is authenticated.
const HIDDEN_PATHS = new Set<string>(["/signin", "/signup"]);

export function BottomTabBar() {
  const pathname = usePathname();
  const { status } = useSession();

  const shouldRender =
    status === "authenticated" && !HIDDEN_PATHS.has(pathname ?? "");

  // Toggle a body class so the global CSS rule reserves matching bottom padding
  // on <main> while the bar is mounted. This prevents the fixed bar from
  // overlapping the final scroll position of page content.
  useEffect(() => {
    if (!shouldRender) return;
    document.body.classList.add("has-bottom-nav");
    return () => {
      document.body.classList.remove("has-bottom-nav");
    };
  }, [shouldRender]);

  if (!shouldRender) return null;

  return (
    <nav
      aria-label="App sections"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 nano-glass border-t border-white/5"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul role="list" className="flex h-14">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/" && pathname?.startsWith(`${href}/`));
          return (
            <li key={href} className="flex-1 min-w-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                className={cn(
                  "relative flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  "transition-colors active:opacity-70",
                  "focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                style={{ transitionDuration: "var(--motion-2)" }}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-8 rounded-b-full bg-primary"
                  />
                )}
                <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span className="truncate max-w-full px-1">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
