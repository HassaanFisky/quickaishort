/**
 * TEMP debug logger for /editor max-update-depth investigation.
 * Prefix: [QAI-LOOP]. Remove after the loop is proven fixed.
 */
import { useEditorStore } from "@/stores/editorStore";
import { useUIStore } from "@/stores/uiStore";
import { useAIPanel } from "@/stores/aiPanelStore";

const MAX = 120;
const MAX_RENDER_PER_LOC = 8;
let seq = 0;
const counts: Record<string, number> = {};
let trapsInstalled = false;
let consolePatched = false;

export type QaiLoopEntry = {
  id: string;
  timestamp: number;
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
};

function sink(entry: QaiLoopEntry): void {
  // #region agent log
  console.log("[QAI-LOOP]", JSON.stringify(entry));
  // #endregion
  if (typeof window === "undefined") return;
  const w = window as Window & { __QAI_LOOP_LOGS?: QaiLoopEntry[]; __QAI_LOOP_COUNTS?: Record<string, number> };
  w.__QAI_LOOP_LOGS = w.__QAI_LOOP_LOGS || [];
  w.__QAI_LOOP_LOGS.push(entry);
  w.__QAI_LOOP_COUNTS = counts;
  try {
    const body = JSON.stringify(entry) + "\n";
    if (seq <= 12 || entry.message === "max-update-depth" || entry.message === "store-write") {
      void fetch("/api/__qai-loop", {
        method: "POST",
        body,
        keepalive: true,
        headers: { "content-type": "application/json" },
      }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

export function qaiLoopStack(max = 16): string[] {
  return (new Error("qai-loop").stack || "")
    .split("\n")
    .slice(2, 2 + max)
    .map((s) => s.trim());
}

export function qaiLoopLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown> = {},
): void {
  const vital =
    message === "max-update-depth" ||
    message === "store-write" ||
    message === "boundary-catch" ||
    message === "traps-installed";
  if (seq >= MAX && !vital) return;
  counts[location] = (counts[location] || 0) + 1;
  if (!vital && message === "render" && counts[location] > MAX_RENDER_PER_LOC) return;
  seq += 1;
  sink({
    id: `log_${Date.now()}_${seq}`,
    timestamp: Date.now(),
    hypothesisId,
    location,
    message,
    data: { ...data, renderCount: counts[location], seq },
  });
}

export function qaiLoopRender(
  hypothesisId: string,
  location: string,
  data: Record<string, unknown> = {},
): void {
  qaiLoopLog(hypothesisId, location, "render", data);
}

function changedKeys(next: object, prev: object | undefined): string[] {
  if (!prev) return ["(init)"];
  const keys = new Set([...Object.keys(next), ...Object.keys(prev)]);
  const out: string[] = [];
  keys.forEach((k) => {
    const a = (next as Record<string, unknown>)[k];
    const b = (prev as Record<string, unknown>)[k];
    if (a !== b && typeof a !== "function") out.push(k);
  });
  return out;
}

export function installQaiLoopTraps(): void {
  if (typeof window === "undefined" || trapsInstalled) return;
  trapsInstalled = true;

  if (!consolePatched) {
    consolePatched = true;
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      const msg = String(args[0] ?? "");
      if (msg.includes("Maximum update depth")) {
        qaiLoopLog("Z", "console.error", "max-update-depth", {
          msg: msg.slice(0, 400),
          counts: { ...counts },
          stack: qaiLoopStack(22),
        });
      }
      orig.apply(console, args);
    };
  }

  const wrap = (
    name: string,
    hypothesisId: string,
    store: { setState: (...args: never[]) => unknown; getState: () => object },
  ) => {
    const origSet = store.setState.bind(store) as (...args: unknown[]) => unknown;
    (store as unknown as { setState: (...args: unknown[]) => unknown }).setState = (partial: unknown, ...rest: unknown[]) => {
      const prev = store.getState();
      const keys =
        partial && typeof partial === "object" && !Array.isArray(partial)
          ? Object.keys(partial as object).filter((k) => typeof (partial as Record<string, unknown>)[k] !== "function")
          : ["(fn)"];
      qaiLoopLog(hypothesisId, `${name}.setState`, "store-write", {
        keys: keys.slice(0, 12),
        changed: changedKeys(
          typeof partial === "function" ? prev : { ...prev, ...(partial as object) },
          prev,
        ).slice(0, 12),
        stack: qaiLoopStack(18),
      });
      return origSet(partial, ...rest);
    };
  };

  wrap("editorStore", "B", useEditorStore);
  wrap("uiStore", "A", useUIStore);
  wrap("aiPanelStore", "B", useAIPanel);
  qaiLoopLog("B", "qaiLoopDebug.ts", "traps-installed", {
    collapsed: useUIStore.getState().isSidebarCollapsed,
  });
}
