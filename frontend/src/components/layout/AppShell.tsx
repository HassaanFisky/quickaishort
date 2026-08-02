"use client";

import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  /** Editor uses full-bleed layout without max-width container */
  fullBleed?: boolean;
  className?: string;
}

/**
 * Unified application chrome — collapsible sidebar + main region.
 * Used on dashboard, projects, billing/settings, and mirrored in the editor.
 */
export function AppShell({ children, fullBleed = false, className }: AppShellProps) {
  return (
    <div className={cn("min-h-screen bg-background text-foreground", className)}>
      <Sidebar />
      <MainContent>
        {fullBleed ? (
          children
        ) : (
          <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </div>
        )}
      </MainContent>
    </div>
  );
}
