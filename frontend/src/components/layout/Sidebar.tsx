"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  LayoutGrid,
  Scissors,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Clapperboard,
  LogOut,
  ChevronUp,
} from "lucide-react";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard",  icon: LayoutGrid,   linkClass: "nav-dashboard-link",     activeClass: "nav-dashboard-active"    },
  { href: "/editor",    label: "Editor",      icon: Scissors,     linkClass: "nav-scissors-link",      activeClass: ""                        },
  { href: "/adk",       label: "ADK Studio",  icon: Clapperboard, linkClass: "nav-clapperboard-link",  activeClass: ""                        },
  { href: "/history",   label: "History",     icon: HistoryIcon,  linkClass: "nav-history-link",       activeClass: ""                        },
  { href: "/settings",  label: "Settings",    icon: SettingsIcon, linkClass: "nav-settings-link",      activeClass: ""                        },
];

const menuVariants: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.97 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: "spring" as const, stiffness: 260, damping: 28 },
  },
  exit: {
    opacity: 0, y: 4, scale: 0.97,
    transition: { duration: 0.14 },
  },
};

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const initial = session?.user?.name?.[0]?.toUpperCase() ?? "U";

  return (
    <aside className="fixed top-0 left-0 z-40 hidden md:flex h-screen w-[232px] flex-col border-r border-white/[0.05] backdrop-blur-xl bg-[hsl(var(--bg-base))]/80">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.05]">
        <Link
          href="/"
          className="inline-flex items-center rounded-lg focus-visible:outline-none focus-visible:[box-shadow:0_0_0_2px_#020203,_0_0_0_4px_rgba(168,85,247,0.6)]"
          aria-label="QuickAI Short — home"
        >
          <Image
            src="/qs-logo-optimized.png"
            alt="QuickAI Shorts"
            width={28}
            height={28}
            className="rounded-md shrink-0"
            priority
          />
          <span className="ml-2 text-[13px] font-black tracking-tight text-foreground/90">
            Quick<span className="premium-gradient-text">AI</span> Shorts
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-0.5" aria-label="Main navigation">
        {NAV_ITEMS.map(({ href, label, icon: Icon, linkClass, activeClass }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "nav-link group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium",
                "transition-[background-color,border-color,color] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                "focus-visible:outline-none focus-visible:[box-shadow:0_0_0_2px_#020203,_0_0_0_4px_rgba(168,85,247,0.6)]",
                active
                  ? "bg-primary/[0.08] text-primary font-semibold"
                  : "text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg))] hover:bg-white/[0.04]",
                linkClass,
                active && activeClass,
              )}
            >
              {/* Active left indicator */}
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  aria-hidden
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-gradient-to-b from-primary to-[#ec4899] shadow-[0_0_8px_rgba(168,85,247,0.6)]"
                  transition={{ type: "spring", stiffness: 260, damping: 28 }}
                />
              )}
              <Icon
                className={cn(
                  "nav-icon w-[17px] h-[17px] shrink-0 transition-colors duration-[160ms]",
                  active ? "text-primary" : "text-[hsl(var(--fg-subtle))] group-hover:text-[hsl(var(--fg-muted))]",
                )}
                aria-hidden
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      {session?.user && (
        <div className="relative border-t border-white/[0.05] p-3">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Account menu"
            className={cn(
              "w-full flex items-center justify-between rounded-xl px-3 py-2.5 gap-3",
              "transition-[background-color,border-color] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              "hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06]",
              "focus-visible:outline-none focus-visible:[box-shadow:0_0_0_2px_#020203,_0_0_0_4px_rgba(168,85,247,0.6)]",
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar className="w-8 h-8 border border-white/[0.08] shadow-md shrink-0">
                <AvatarImage src={session.user.image || ""} alt="" />
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[13px] font-semibold truncate text-[hsl(var(--fg))]">{session.user.name}</p>
                <motion.p
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 28, delay: 0.1 }}
                  className={cn(
                    "text-[10px] truncate font-bold uppercase tracking-widest",
                    session.user.isPro ? "text-primary" : "text-[hsl(var(--fg-subtle))]",
                  )}
                >
                  {session.user.isPro ? "Pro" : "Free"}
                </motion.p>
              </div>
            </div>
            <ChevronUp
              className={cn(
                "w-3.5 h-3.5 text-[hsl(var(--fg-subtle))] shrink-0 transition-transform duration-200",
                menuOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                role="menu"
                variants={menuVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute bottom-[calc(100%+6px)] left-3 right-3 rounded-xl border border-white/[0.08] bg-[hsl(var(--bg-subtle))]/95 backdrop-blur-2xl shadow-2xl p-1.5 z-10"
              >
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); signOut(); }}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold",
                    "text-red-400 hover:bg-red-500/[0.08] hover:text-red-300",
                    "transition-colors duration-[120ms]",
                    "focus-visible:outline-none focus-visible:bg-red-500/[0.08]",
                  )}
                >
                  <LogOut className="w-4 h-4" aria-hidden />
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </aside>
  );
}
