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

/** Reserved ADK information architecture — visible under gate, non-interactive (EP-008). */
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
 * Full-workspace Coming Soon gate with reserved IA skeleton under blur (not Ads).
 */
export function AdkComingSoonWorkspace() {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 w-full flex-col overflow-hidden p-3 sm:p-4 md:h-[100dvh] md:p-6">
      <ComingSoonGate
        className="h-full min-h-[50vh] rounded-2xl"
        title="Coming Soon"
        description={SUBTITLE}
      >
        <AdkWorkspaceSkeleton />
      </ComingSoonGate>
    </div>
  );
}

/** Full layout (rail + main) as decorative blur backdrop — Hydro-Glass, no accent cards. */
function AdkWorkspaceSkeleton() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden md:flex-row">
      <aside
        className="shrink-0 border-b border-white/[0.06] bg-[hsl(var(--bg-subtle))] md:w-56 md:border-b-0 md:border-r"
        aria-hidden
      >
        <div className="flex items-center gap-2 px-4 py-4 md:px-5">
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-white/[0.08] bg-black/30 text-muted-foreground">
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground/80">
              ADK
            </p>
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Agent Development Kit
            </p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-visible md:px-3 md:pb-6">
          {ADK_IA.map(({ id, label, icon: Icon }) => (
            <div
              key={id}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-muted-foreground/70",
                "pointer-events-none select-none opacity-60",
                "md:w-full",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap font-medium">{label}</span>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-6 md:p-10">
        <div className="h-8 w-48 rounded-lg bg-white/[0.08]" />
        <div className="h-4 w-72 max-w-full rounded bg-white/[0.06]" />
        <div className="mt-4 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4"
            >
              <div className="mb-3 h-3 w-24 rounded bg-white/[0.08]" />
              <div className="space-y-2">
                <div className="h-2 w-full rounded bg-white/[0.06]" />
                <div className="h-2 w-[80%] rounded bg-white/[0.06]" />
                <div className="h-2 w-2/3 rounded bg-white/[0.05]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
