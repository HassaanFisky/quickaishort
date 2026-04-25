"use client";

import {
  LayoutGrid,
  FolderOpen,
  Layers,
  Sparkles,
  Users,
  Grid3X3,
  Folder,
  PlaySquare,
  Wand2,
  Settings,
  LogOut,
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
        "w-12 h-12 rounded-2xl transition-all duration-300 relative group",
        active
          ? "bg-primary text-primary-foreground nano-glow"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
      )}
      onClick={onClick}
    >
      <Icon
        className={cn(
          "w-5 h-5 transition-transform duration-300",
          active ? "scale-110" : "group-hover:scale-110",
        )}
        strokeWidth={2}
      />
      {active && (
        <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-4 bg-primary rounded-full shadow-[0_0_8px_rgba(33,150,243,0.8)]" />
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
          className="nano-glass text-foreground text-xs font-bold px-3 py-1.5 border-white/10 ml-2"
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
      className="fixed z-50 nano-glass border-white/5 shadow-2xl
      bottom-6 left-6 right-6 h-16 flex flex-row items-center justify-around px-4
      md:top-1/2 md:left-6 md:bottom-auto md:right-auto md:w-20 md:h-[750px] md:-translate-y-1/2 md:flex-col md:py-8 md:gap-4 md:px-0 md:justify-start rounded-[2.5rem]"
    >
      {/* Top Brand/Logo */}
      <div className="mb-4 hidden md:flex items-center justify-center">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30">
          <span className="text-primary font-black text-lg">N</span>
        </div>
      </div>

      {/* Main Tools Section */}
      <div className="flex flex-row md:flex-col gap-2 md:gap-4">
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
          label="Collab"
          href="/editor"
          active={pathname === "/editor"}
        />
      </div>

      <div className="hidden md:block w-8 h-px bg-white/5 my-4 rounded-full" />

      {/* Settings/Meta Section */}
      <div className="mt-0 md:mt-auto flex flex-row md:flex-col gap-2 md:gap-4 items-center pb-4">
        <SidebarItem icon={Grid3X3} label="Grid" />
        <SidebarItem icon={Folder} label="Folders" />
        <SidebarItem icon={PlaySquare} label="Media" />
        <SidebarItem icon={Wand2} label="fx" />
        <SidebarItem icon={Users} label="Users" />
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
                <div className="relative group cursor-pointer mt-2">
                  <Avatar className="w-10 h-10 ring-2 ring-white/5 group-hover:ring-primary/40 transition-all duration-300">
                    <AvatarImage src={session.user.image || ""} />
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                      {session.user.name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-[#030303] rounded-full" />
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="nano-glass p-0 overflow-hidden min-w-[200px] ml-4 border-white/10"
              >
                <div className="px-5 py-4 border-b border-white/5">
                  <p className="text-sm font-bold text-foreground">
                    {session.user.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate opacity-60">
                    {session.user.email}
                  </p>
                </div>
                <div className="p-2 space-y-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 h-10 px-4 rounded-xl font-bold"
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
