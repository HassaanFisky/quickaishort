"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Plus,
  FolderOpen,
  Clock,
  LogOut,
  ChevronUp,
  User,
  CreditCard,
} from "lucide-react";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/uiStore";

const NAV_ITEMS = [
  { href: "/editor", label: "New edit", icon: Plus },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/history", label: "Recent", icon: Clock },
];

const menuVariants: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 260, damping: 28 },
  },
  exit: {
    opacity: 0,
    y: 4,
    scale: 0.97,
    transition: { duration: 0.14 },
  },
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const { isSidebarCollapsed, toggleSidebar } = useUIStore();

  const initial = session?.user?.name?.[0]?.toUpperCase() ?? "U";

  const renderNavLink = (
    href: string,
    label: string,
    Icon: React.ElementType,
  ) => {
    const active =
      pathname === href ||
      (href !== "/" && pathname?.startsWith(`${href}/`));

    const linkEl = (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "nav-link group relative flex items-center rounded-xl transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-indigo))]/50",
          isSidebarCollapsed ? "justify-center px-0 py-2.5 w-full" : "gap-3 px-3 py-2.5 text-[13px] font-medium",
          active
            ? "bg-[hsl(var(--accent-indigo))]/10 text-[hsl(var(--accent-indigo))]"
            : "text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg))] hover:bg-[hsl(var(--bg-muted))]/50",
        )}
      >
        {active && !isSidebarCollapsed && (
          <motion.span
            layoutId="sidebar-active"
            aria-hidden
            className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[hsl(var(--accent-indigo))]"
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
          />
        )}
        <Icon
          className={cn(
            "w-[17px] h-[17px] shrink-0",
            active ? "text-[hsl(var(--accent-indigo))]" : "text-[hsl(var(--fg-subtle))] group-hover:text-[hsl(var(--fg-muted))]",
          )}
          aria-hidden
        />
        {!isSidebarCollapsed && <span>{label}</span>}
      </Link>
    );

    if (isSidebarCollapsed) {
      return (
        <Tooltip key={href}>
          <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {label}
          </TooltipContent>
        </Tooltip>
      );
    }
    return linkEl;
  };

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 z-40 hidden md:flex h-screen flex-col border-r border-border bg-[hsl(var(--bg-base))]",
        "transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
        isSidebarCollapsed ? "w-[56px]" : "w-[220px]",
      )}
    >
      <div
        className={cn(
          "border-b border-border flex items-center",
          isSidebarCollapsed ? "px-2 py-4 justify-center" : "px-4 py-4",
        )}
      >
        <button
          type="button"
          onClick={toggleSidebar}
          className={cn(
            "inline-flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-indigo))]/50",
            !isSidebarCollapsed && "gap-2.5",
          )}
          aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Image
            src="/qs-logo.png"
            alt=""
            width={28}
            height={28}
            className="rounded-md shrink-0 qs-logo-mark"
            priority
          />
          {!isSidebarCollapsed && (
            <span className="text-[13px] font-semibold text-[hsl(var(--fg))] whitespace-nowrap">
              QuickAI
            </span>
          )}
        </button>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5" aria-label="Main navigation">
        {NAV_ITEMS.map(({ href, label, icon }) => renderNavLink(href, label, icon))}
      </nav>

      {session?.user && (
        <div
          className={cn(
            "relative border-t border-border p-2",
            isSidebarCollapsed && "flex justify-center",
          )}
        >
          {isSidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  aria-label="Account menu"
                  className="flex items-center justify-center rounded-xl w-9 h-9 hover:bg-[hsl(var(--bg-muted))]/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-indigo))]/50"
                >
                  <Avatar className="w-7 h-7 border border-border shrink-0">
                    <AvatarImage src={session.user.image || ""} alt="" />
                    <AvatarFallback className="bg-[hsl(var(--accent-indigo))]/15 text-[hsl(var(--accent-indigo))] text-[10px] font-semibold">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {session.user.name}
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Account menu"
              className={cn(
                "w-full flex items-center justify-between rounded-xl px-2.5 py-2 gap-2",
                "hover:bg-[hsl(var(--bg-muted))]/50 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-indigo))]/50",
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="w-8 h-8 border border-border shrink-0">
                  <AvatarImage src={session.user.image || ""} alt="" />
                  <AvatarFallback className="bg-[hsl(var(--accent-indigo))]/15 text-[hsl(var(--accent-indigo))] text-xs font-semibold">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[13px] font-medium truncate text-[hsl(var(--fg))]">
                    {session.user.name}
                  </p>
                  <p className="text-[11px] truncate text-[hsl(var(--fg-subtle))]">
                    {session.user.isPro ? "Pro plan" : "Free plan"}
                  </p>
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
          )}

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                role="menu"
                variants={menuVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className={cn(
                  "absolute bottom-[calc(100%+6px)] rounded-xl border border-border bg-[hsl(var(--bg-subtle))] shadow-lg p-1 z-10",
                  isSidebarCollapsed ? "left-12 w-48" : "left-2 right-2",
                )}
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/settings");
                  }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-[hsl(var(--fg-muted))] hover:bg-[hsl(var(--bg-muted))]/50 hover:text-[hsl(var(--fg))]"
                >
                  <User className="w-4 h-4" aria-hidden />
                  Profile
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/settings?tab=billing");
                  }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-[hsl(var(--fg-muted))] hover:bg-[hsl(var(--bg-muted))]/50 hover:text-[hsl(var(--fg))]"
                >
                  <CreditCard className="w-4 h-4" aria-hidden />
                  Plan and billing
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    signOut();
                  }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-red-400 hover:bg-red-500/10"
                >
                  <LogOut className="w-4 h-4" aria-hidden />
                  Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </aside>
  );
}
