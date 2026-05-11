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
  ChevronUp,
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
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const initial = session?.user?.name?.[0]?.toUpperCase() ?? "U";

  return (
    <aside className="fixed top-0 left-0 z-40 hidden md:flex h-screen w-[240px] flex-col nano-glass border-r border-white/5 bg-background/40">
      {/* Logo */}
      <div className="px-6 py-6 border-b ghost-border">
        <Link href="/" className="inline-flex items-center interactive">
          <QSLogo variant="full" size="sm" />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-300",
                active
                  ? "bg-primary/10 text-primary font-bold border border-primary/20 shadow-[inset_0_0_20px_rgba(168,85,247,0.05)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5 font-medium border border-transparent interactive",
              )}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-gradient-to-b from-primary to-accent shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                />
              )}
              <Icon className={cn("w-4 h-4 shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Theme toggle removed - redundant with top-right toggle */}

      {/* User */}
      {session?.user && (
        <div className="relative border-t ghost-border p-4">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-white/5 transition-colors interactive border border-transparent hover:border-white/10"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="w-9 h-9 border border-white/10 shadow-md">
                <AvatarImage src={session.user.image || ""} />
                <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-bold truncate text-foreground/90">{session.user.name}</p>
                <p className="text-[10px] text-muted-foreground truncate font-medium uppercase tracking-wider">
                  Founder Member
                </p>
              </div>
            </div>
            <ChevronUp className={cn("w-4 h-4 text-muted-foreground transition-transform duration-300", menuOpen && "rotate-180")} />
          </button>

          {menuOpen && (
            <div className="absolute bottom-[calc(100%+8px)] left-4 right-4 rounded-xl border border-white/10 glass-surface shadow-2xl p-1.5 animate-in slide-in-from-bottom-2 fade-in duration-200">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  signOut();
                }}
                className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-400 font-bold hover:bg-red-500/10 transition-colors interactive"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
