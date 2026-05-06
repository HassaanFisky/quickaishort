"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutGrid,
  Scissors,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Sparkles,
  Clapperboard,
  LogOut,
} from "lucide-react";
import QSLogo from "@/components/shared/QSLogo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { LiquidThemeToggle } from "@/components/shared/LiquidThemeToggle";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/editor", label: "Editor", icon: Scissors },
  { href: "/adk", label: "ADK Studio", icon: Clapperboard },
  { href: "/history", label: "History", icon: HistoryIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
  { href: "/pricing", label: "Pricing", icon: Sparkles },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const initial = session?.user?.name?.[0]?.toUpperCase() ?? "U";

  return (
    <aside
      className="fixed top-0 left-0 z-40 hidden md:flex h-screen w-[240px] flex-col border-r border-border bg-secondary/30"
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <Link href="/" className="inline-flex items-center">
          <QSLogo variant="full" size="sm" />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
              )}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r bg-primary"
                />
              )}
              <Icon className="w-4 h-4 shrink-0" />
              <span className="font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Theme toggle */}
      <div className="px-4 py-2 border-t border-border">
        <LiquidThemeToggle />
      </div>

      {/* User */}
      {session?.user && (
        <div className="relative border-t border-border px-3 py-3">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-full flex items-center gap-3 rounded-md px-2 py-2 hover:bg-secondary/60 transition-colors"
          >
            <Avatar className="w-8 h-8">
              <AvatarImage src={session.user.image || ""} />
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium truncate">{session.user.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {session.user.email}
              </p>
            </div>
          </button>

          {menuOpen && (
            <div className="absolute bottom-[calc(100%+4px)] left-3 right-3 rounded-md border border-border bg-popover shadow-lg p-1">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  signOut();
                }}
                className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
