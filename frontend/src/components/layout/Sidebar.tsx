"use client";

import {
  LayoutGrid,
  FolderOpen,
  Layers,
  Sparkles,
  Users,
  Grid3X3,
  PlaySquare,
  Wand2,
  Settings,
  LogOut,
  Zap,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { motion } from "framer-motion";

interface SidebarItemProps {
  icon: any;
  label: string;
  active?: boolean;
  href?: string;
  onClick?: () => void;
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  href,
  onClick,
}: SidebarItemProps) {
  const content = (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "w-12 h-12 rounded-2xl transition-all duration-500 relative group overflow-hidden",
        active
          ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(168,85,247,0.3)]"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground focus-ring",
      )}
      onClick={onClick}
    >
      {/* Active Gradient Background Layer */}
      {active && (
        <div className="absolute inset-0 bg-linear-to-tr from-primary via-indigo-500 to-accent opacity-90" />
      )}
      
      {/* Hover Highlight Layer */}
      <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <Icon
        className={cn(
          "w-5 h-5 relative z-10 transition-all duration-500",
          active ? "scale-110 drop-shadow-sm" : "group-hover:scale-110 group-hover:text-primary",
        )}
        strokeWidth={active ? 2.5 : 2}
      />

      {/* Active Indicator Bar */}
      {active && (
        <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-6 bg-purple-500 rounded-full shadow-[0_0_8px_rgba(168,85,247,0.5)] z-20" />
      )}
      {/* Animated active dot */}
      {active && (
        <motion.span
          layoutId="sidebar-active-dot"
          className="absolute -right-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-purple-400 z-20"
        />
      )}
    </Button>
  );

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          {href ? <Link href={href}>{content}</Link> : content}
        </TooltipTrigger>
        <TooltipContent
          side="right"
          className="nano-glass border-white/10 text-foreground text-[11px] font-bold px-3 py-1.5 ml-3 backdrop-blur-2xl shadow-2xl"
        >
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside
      className="fixed z-50 glass-surface depth-card border-white/5 shadow-[0_0_60px_rgba(0,0,0,0.7)]
      bottom-6 left-6 right-6 h-16 flex flex-row items-center justify-around px-4
      md:top-1/2 md:left-6 md:bottom-auto md:right-auto md:w-20 md:h-[85vh] md:-translate-y-1/2 md:flex-col md:py-10 md:gap-6 md:px-0 md:justify-start rounded-[2.5rem] transition-all duration-700 ease-fluid"
    >
      {/* Top Brand/Logo - Refined for QuickAI */}
      <div className="mb-6 hidden md:flex flex-col items-center justify-center group cursor-pointer">
        <div className="relative w-12 h-12 flex items-center justify-center">
          {/* Animated Background Rings */}
          <div className="absolute inset-0 rounded-2xl bg-primary/20 border border-primary/30 group-hover:scale-110 group-hover:rotate-12 transition-all duration-500" />
          <div className="absolute inset-0 rounded-2xl bg-accent/10 border border-accent/20 scale-90 group-hover:scale-105 group-hover:-rotate-12 transition-all duration-700" />
          
          {/* Central Logo Icons */}
          <div className="relative z-10 flex items-center justify-center">
            <Play className="w-5 h-5 text-primary fill-primary/20 -mr-1" />
            <Zap className="w-6 h-6 text-accent fill-accent group-hover:scale-125 transition-transform duration-500" strokeWidth={2.5} />
          </div>
        </div>
        <div className="mt-2 flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
           <span className="text-[8px] font-black uppercase tracking-[0.2em] text-primary">Quick</span>
           <span className="text-[8px] font-black uppercase tracking-[0.2em] text-accent -mt-1">AI</span>
        </div>
      </div>

      {/* Main Tools Section */}
      <div className="flex flex-row md:flex-col gap-3 md:gap-5">
        <SidebarItem
          icon={LayoutGrid}
          label="Dashboard"
          href="/dashboard"
          active={pathname === "/dashboard"}
        />
        <SidebarItem
          icon={FolderOpen}
          label="Projects"
          href="/projects"
          active={pathname === "/projects"}
        />
        <SidebarItem
          icon={Layers}
          label="Assets"
          href="/assets"
          active={pathname === "/assets"}
        />
        <SidebarItem
          icon={Sparkles}
          label="Effects"
          href="/effects"
          active={pathname === "/effects"}
        />
        <SidebarItem
          icon={Users}
          label="Video Editor"
          href="/editor"
          active={pathname === "/editor" || pathname.startsWith("/editor")}
        />
      </div>

      <div className="hidden md:block w-10 h-px bg-linear-to-r from-transparent via-white/10 to-transparent my-2" />

      {/* Settings/Meta Section */}
      <div className="mt-0 md:mt-auto flex flex-row md:flex-col gap-3 md:gap-5 items-center pb-6">
        <SidebarItem icon={Grid3X3} label="Templates" />
        <SidebarItem icon={PlaySquare} label="Stock Media" />
        <SidebarItem icon={Wand2} label="Smart Tools" />
        <SidebarItem
          icon={Settings}
          label="Settings"
          href="/settings"
          active={pathname === "/settings"}
        />

        {session?.user && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative group cursor-pointer mt-4">
                  <div className="absolute inset-0 bg-primary/20 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <Avatar className="w-11 h-11 ring-2 ring-white/10 group-hover:ring-primary/50 group-hover:scale-105 transition-all duration-500 shadow-2xl relative z-10">
                    <AvatarImage src={session.user.image || ""} />
                    <AvatarFallback className="bg-linear-to-br from-primary/30 to-indigo-600/30 text-primary text-xs font-black">
                      {session.user.name?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-[3px] border-[#0a0a0a] rounded-full z-20 group-hover:scale-110 transition-transform duration-300 shadow-lg" />
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="nano-glass p-0 overflow-hidden min-w-[220px] ml-5 border-white/10 shadow-2xl animate-in zoom-in-95 duration-200"
              >
                <div className="px-6 py-5 border-b border-white/5 bg-white/5">
                  <p className="text-sm font-black text-foreground tracking-tight">
                    {session.user.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate opacity-60 font-medium">
                    {session.user.email}
                  </p>
                </div>
                <div className="p-2.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 h-11 px-4 rounded-xl font-bold transition-all"
                    onClick={() => signOut()}
                  >
                    <LogOut className="w-4 h-4 mr-3" />
                    Sign Out
                  </Button>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </aside>
  );
}
