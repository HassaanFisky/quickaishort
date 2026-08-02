"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import {
  Plus,
  FolderOpen,
  Clock,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TabItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const TABS: TabItem[] = [
  { href: "/dashboard", label: "Home", icon: Plus },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/history", label: "Recent", icon: Clock },
  { href: "/settings", label: "Account", icon: User },
];

const HIDDEN_PATHS = new Set<string>(["/signin", "/signup"]);

function isEditorPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/editor" || pathname.startsWith("/editor/");
}

export function BottomTabBar() {
  const pathname = usePathname();
  const { status } = useSession();

  const shouldRender =
    status === "authenticated" &&
    !HIDDEN_PATHS.has(pathname ?? "") &&
    !isEditorPath(pathname);

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
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-[hsl(var(--bg-base))]"
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
                className={cn(
                  "relative flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  "transition-colors active:opacity-70",
                  "focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[hsl(var(--accent-indigo))]",
                  active ? "text-[hsl(var(--accent-indigo))]" : "text-[hsl(var(--fg-subtle))]",
                )}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-8 rounded-b-full bg-[hsl(var(--accent-indigo))]"
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
