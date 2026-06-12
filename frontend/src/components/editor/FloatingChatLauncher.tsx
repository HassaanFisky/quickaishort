"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X, Send } from "lucide-react";
import { useAIPanel } from "@/stores/aiPanelStore";
import { useEditorStore } from "@/stores/editorStore";
import { matchShortcut } from "@/lib/shortcuts";
import { loadTranscript, saveTranscript } from "@/lib/transcriptPersistence";
import { ChatTranscript } from "@/components/editor/ChatTranscript";

const EMPTY_LABEL =
  "Tell Quick AI Editor what to do — try: trim the silences, add B-roll, hook caption";

const SUGGESTIONS = ["Trim the silences", "Add B-roll", "Hook caption"];

function useProjectId(): string {
  const sourceUrl = useEditorStore((s) => s.sourceUrl);
  const sourceFile = useEditorStore((s) => s.sourceFile);
  if (sourceUrl) {
    try {
      return btoa(sourceUrl).slice(0, 24);
    } catch {
      return sourceUrl.slice(0, 24);
    }
  }
  if (sourceFile?.name) return sourceFile.name;
  return "session";
}

export function FloatingChatLauncher() {
  const {
    isFloatingChatOpen,
    toggleFloatingChat,
    setFloatingChatOpen,
    messages,
    addMessage,
    videoContext,
  } = useAIPanel();
  const projectId = useProjectId();

  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryText, setRetryText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  // Hydrate from IndexedDB on mount
  useEffect(() => {
    loadTranscript(projectId).then((turns) => {
      if (turns.length > 0 && messages.length === 0) {
        turns.forEach((t) => addMessage(t));
      }
    });
    // Only hydrate once per projectId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Persist on every messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveTranscript(projectId, messages);
    }
  }, [messages, projectId]);

  // Keyboard: Shift+Alt+A toggles; Esc closes only if no input focused
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchShortcut(e, "toggleFloatingChat")) {
        e.preventDefault();
        toggleFloatingChat();
        return;
      }
      if (e.key === "Escape" && isFloatingChatOpen) {
        const active = document.activeElement as HTMLElement | null;
        const tag = active?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA" && !active?.isContentEditable) {
          setFloatingChatOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFloatingChatOpen, toggleFloatingChat, setFloatingChatOpen]);

  // Focus input when panel opens
  useEffect(() => {
    if (isFloatingChatOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isFloatingChatOpen]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setChatInput("");
      setRetryText(null);
      addMessage({ role: "user", content: trimmed });
      setLoading(true);
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: [...messages, { role: "user", content: trimmed }],
            videoContext,
          }),
        });
        const data = await res.json();
        let content: string;
        if (data.content) {
          content = data.content;
        } else if (res.status === 401) {
          content = "Sign in to use AI suggestions.";
        } else if (res.status >= 500) {
          content = `AI error (${res.status}) — please try again.`;
          setRetryText(trimmed);
        } else {
          content = data.message ?? "Something went wrong.";
        }
        addMessage({ role: "assistant", content });
      } catch {
        addMessage({
          role: "assistant",
          content: "Connection lost — check your internet and try again.",
        });
        setRetryText(trimmed);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, videoContext, addMessage],
  );

  const panelMotion = prefersReducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }
    : { initial: { opacity: 0, y: 16, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: 16, scale: 0.96 }, transition: { type: "spring" as const, stiffness: 320, damping: 28 } };

  return (
    <>
      {/* Chat panel */}
      <AnimatePresence>
        {isFloatingChatOpen && (
          <motion.div
            key="floating-chat-panel"
            initial={panelMotion.initial}
            animate={panelMotion.animate}
            exit={panelMotion.exit}
            transition={panelMotion.transition}
            className="fixed bottom-[96px] left-[50%] -translate-x-1/2 z-40 w-[min(640px,92vw)] max-h-[480px] flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden max-[767px]:left-0 max-[767px]:right-0 max-[767px]:w-full max-[767px]:translate-x-0 max-[767px]:bottom-0 max-[767px]:rounded-t-2xl max-[767px]:rounded-b-none max-[767px]:max-h-[70vh]"
            role="dialog"
            aria-label="Quick AI Editor floating chat"
          >
            {/* Header */}
            <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center">
                  <Sparkles size={10} className="text-white" />
                </div>
                <span className="text-xs font-black text-foreground">
                  Quick AI Editor
                </span>
              </div>
              <button
                onClick={() => setFloatingChatOpen(false)}
                aria-label="Close chat"
                className="p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={13} />
              </button>
            </header>

            {/* Messages (shared transcript) */}
            <ChatTranscript
              messages={messages}
              loading={loading}
              retryText={retryText}
              onRetry={sendMessage}
              suggestions={SUGGESTIONS}
              onSuggestion={sendMessage}
              emptyLabel={EMPTY_LABEL}
            />

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(chatInput);
              }}
              className="border-t border-border p-3 flex gap-2 shrink-0"
            >
              <input
                ref={inputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Message Quick AI…"
                className="flex-1 text-xs rounded-lg px-3 py-2 bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || loading}
                className="px-2.5 py-2 rounded-lg bg-primary text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
              >
                <Send size={13} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Launch button */}
      <motion.button
        onClick={toggleFloatingChat}
        aria-label={isFloatingChatOpen ? "Close AI chat" : "Open AI chat (Shift+Alt+A)"}
        aria-expanded={isFloatingChatOpen}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className="fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 flex items-center justify-center max-[767px]:h-11 max-[767px]:w-11"
      >
        {isFloatingChatOpen ? <X size={20} /> : <Sparkles size={20} />}
      </motion.button>
    </>
  );
}
