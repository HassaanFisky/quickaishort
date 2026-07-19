"use client";

import {
  Bot,
  GitBranch,
  Wrench,
  Brain,
  BookOpen,
  Plug,
  Blocks,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { ComingSoonGate } from "@/components/shared/ComingSoonGate";
import { cn } from "@/lib/utils";

/** Reserved ADK information architecture — visible, non-interactive (EP-008 correction). */
const ADK_IA: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "agents", label: "Agents", icon: Bot },
  { id: "workflows", label: "Workflows", icon: GitBranch },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "mcp", label: "MCP", icon: Plug },
  { id: "integrations", label: "Integrations", icon: Blocks },
  { id: "automation", label: "Automation", icon: Zap },
];

const SUBTITLE =
  "Advanced agent orchestration capabilities will arrive in a future release.";

/**
 * Google Agent Development Kit workspace — intentionally unavailable.
 * Premium Coming Soon + reserved IA skeleton (not Ads).
 */
export function AdkComingSoonWorkspace() {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 w-full flex-col overflow-hidden md:h-[100dvh] md:flex-row">
      {/* Reserved IA rail — structure only */}
      <aside
        className="shrink-0 border-b border-white/[0.06] bg-[hsl(var(--bg-subtle))] md:w-56 md:border-b-0 md:border-r"
        aria-label="ADK workspace sections (coming soon)"
      >
        <div className="flex items-center gap-2 px-4 py-4 md:px-5">
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-white/[0.08] bg-black/30 text-primary">
            <Bot className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">
              ADK
            </p>
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Agent Development Kit
            </p>
          </div>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-visible md:px-3 md:pb-6"
          aria-disabled="true"
        >
          {ADK_IA.map(({ id, label, icon: Icon }) => (
            <div
              key={id}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-muted-foreground/70",
                "pointer-events-none select-none opacity-60",
                "md:w-full",
              )}
              aria-hidden
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap font-medium">{label}</span>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main workspace behind Coming Soon gate */}
      <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden p-3 sm:p-4 md:p-6">
        <ComingSoonGate
          className="h-full min-h-[50vh] rounded-2xl"
          title="Coming Soon"
          description={SUBTITLE}
        >
          <AdkSkeletonBackdrop />
        </ComingSoonGate>
      </main>
    </div>
  );
}

function AdkSkeletonBackdrop() {
  return (
    <div className="flex h-full w-full flex-col gap-4 p-6 md:p-10">
      <div className="h-8 w-48 rounded-lg bg-primary/25" />
      <div className="h-4 w-72 max-w-full rounded bg-white/10" />
      <div className="mt-4 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-primary/15 via-white/[0.03] to-[#ec4899]/10 p-4"
          >
            <div className="mb-3 h-3 w-24 rounded bg-white/15" />
            <div className="space-y-2">
              <div className="h-2 w-full rounded bg-white/10" />
              <div className="h-2 w-[80%] rounded bg-white/10" />
              <div className="h-2 w-2/3 rounded bg-white/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
