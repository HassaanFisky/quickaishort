"use client";

import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

export function MainContent({ children }: { children: React.ReactNode }) {
  const { isSidebarCollapsed } = useUIStore();
  return (
    <div
      className={cn(
        "transition-[padding-left] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
        isSidebarCollapsed ? "md:pl-20" : "md:pl-[240px]",
      )}
    >
      {children}
    </div>
  );
}
