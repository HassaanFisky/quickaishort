"use client";

import * as React from "react";
import {
  Settings,
  User,
  Scissors,
  History,
  LayoutDashboard,
  Bot,
  SquareSplitHorizontal,
  Type,
  Rocket,
  Wand2,
  Download,
  PanelLeft,
  PanelRight,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useRouter, usePathname } from "next/navigation";
import { useEditorStore } from "@/stores/editorStore";
import { useUIStore } from "@/stores/uiStore";
import { toast } from "sonner";

/** True when the user is typing into a field — so `/` types a slash, not opens the palette. */
function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || node.isContentEditable === true;
}

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const inEditor = pathname?.startsWith("/editor") ?? false;

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K always opens
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // "/" opens anywhere — unless the user is typing into a field
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {inEditor && (
          <>
            <CommandGroup heading="Editor Actions">
              <CommandItem
                onSelect={() =>
                  runCommand(() => {
                    const s = useEditorStore.getState();
                    s.splitClipAtTime(s.currentTime);
                    useUIStore.getState().setActiveTool("split");
                    toast.success("Split at playhead");
                  })
                }
              >
                <SquareSplitHorizontal className="mr-2 h-4 w-4" />
                <span>Split at playhead</span>
                <CommandShortcut>S</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runCommand(() => {
                    useEditorStore.getState().addCanvasElement({
                      type: "text",
                      content: "NEW TEXT",
                      x: 100,
                      y: 200,
                      scale: 1.5,
                      rotation: 0,
                      style: { className: "text-4xl font-black text-white" },
                    });
                    useUIStore.getState().setActiveTool("text");
                    toast.success("Text added to canvas");
                  })
                }
              >
                <Type className="mr-2 h-4 w-4" />
                <span>Add text overlay</span>
                <CommandShortcut>T</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runCommand(() => window.dispatchEvent(new CustomEvent("qai:preflight")))
                }
              >
                <Rocket className="mr-2 h-4 w-4" />
                <span>Run Pre-Flight</span>
                <CommandShortcut>⇧P</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runCommand(() => window.dispatchEvent(new CustomEvent("qai:export")))
                }
              >
                <Download className="mr-2 h-4 w-4" />
                <span>Export short</span>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runCommand(() => window.dispatchEvent(new Event("trigger-silence-detect")))
                }
              >
                <Wand2 className="mr-2 h-4 w-4" />
                <span>Auto-enhance audio</span>
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Panels">
              <CommandItem
                onSelect={() =>
                  runCommand(() => {
                    const u = useUIStore.getState();
                    u.setLeftPanelOpen(!u.leftPanelOpen);
                  })
                }
              >
                <PanelLeft className="mr-2 h-4 w-4" />
                <span>Toggle clips panel</span>
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runCommand(() => {
                    const u = useUIStore.getState();
                    u.setRightPanelOpen(!u.rightPanelOpen);
                  })
                }
              >
                <PanelRight className="mr-2 h-4 w-4" />
                <span>Toggle properties panel</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => runCommand(() => router.push("/dashboard"))}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/editor"))}>
            <Scissors className="mr-2 h-4 w-4" />
            <span>Editor</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/adk"))}>
            <Bot className="mr-2 h-4 w-4" />
            <span>ADK</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/history"))}>
            <History className="mr-2 h-4 w-4" />
            <span>History</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem onSelect={() => runCommand(() => router.push("/settings"))}>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/settings"))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
