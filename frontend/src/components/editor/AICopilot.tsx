"use client";

import { useAIPanel } from "@/stores/aiPanelStore";
import { useEditorStore } from "@/stores/editorStore";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, MessageSquareQuote } from "lucide-react";

const NO_VIDEO_SUGGESTIONS = [
  "What makes a video go viral?",
  "Best aspect ratio for TikTok?",
  "How long should a short be?",
  "What hook works best for AI content?",
];

const WITH_VIDEO_SUGGESTIONS = [
  "Find the 3 best moments to clip",
  "Write captions for this video",
  "Suggest a viral hook from the transcript",
  "What would you cut from this?",
];

/**
 * AICopilot â€” fixed overlay panel, zero layout impact when closed.
 *
 * Manages two concerns:
 * 1. AI Chat â€” powered by /api/ai/chat, state in aiPanelStore
 * 2. AI Creative Direction â€” scriptPrompt from editorStore, sent to export pipeline
 *
 * Opens via setOpen(true) from the Sparkles button in EditorLayout header.
 * When closed: unmounted entirely â€” consumes zero layout space.
 */
export function AICopilot() {
  const { isOpen, setOpen, videoContext, messages, addMessage } = useAIPanel();
  const { scriptPrompt, setScriptPrompt } = useEditorStore();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryText, setRetryText] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const suggestions = videoContext ? WITH_VIDEO_SUGGESTIONS : NO_VIDEO_SUGGESTIONS;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");
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
      } else if (res.status === 503) {
        content = "AI service not configured â€” contact support.";
      } else if (res.status === 429) {
        content = "Rate limit exceeded â€” try again in a moment.";
      } else if (res.status >= 500) {
        content = `AI error (${res.status}) â€” please try again.`;
        setRetryText(trimmed);
      } else {
        content = data.message ?? "Something went wrong.";
      }
      addMessage({ role: "assistant", content });
    } catch {
      addMessage({
        role: "assistant",
        content: "Connection lost â€” check your internet and try again.",
      });
      setRetryText(trimmed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          key="ai-copilot"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 220, damping: 30 }}
          className="fixed right-0 top-0 h-full z-50 w-[360px] bg-zinc-900 border-l border-white/5 flex flex-col shadow-2xl"
        >
          {/* Header */}
          <header className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
                <Sparkles size={12} className="text-white" />
              </div>
              <span className="text-sm font-black text-zinc-100">
                {videoContext ? "Video AI" : "QuickAI Assistant"}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close AI Copilot"
              className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <X size={14} />
            </button>
          </header>

          {/* Context indicator */}
          <div className="px-4 py-2 text-xs text-zinc-500 border-b border-white/5 shrink-0 bg-zinc-950/30">
            {videoContext ? (
              <>
                Editing:{" "}
                <strong className="text-zinc-300">
                  {videoContext.title.length > 45
                    ? videoContext.title.slice(0, 45) + "â€¦"
                    : videoContext.title}
                </strong>
              </>
            ) : (
              "No video loaded â€” ask me anything about short-form strategy."
            )}
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
            {messages.length === 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] uppercase tracking-wider text-zinc-600 pb-1">
                  Quick Actions
                </p>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg border border-white/5 hover:border-primary/30 hover:bg-primary/8 text-zinc-400 hover:text-zinc-100 transition-all duration-150"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] text-xs px-3 py-2 rounded-xl leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-white"
                      : "bg-zinc-800 text-zinc-100"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 rounded-xl px-3 py-2">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            )}

            {retryText && !loading && (
              <div className="flex justify-end">
                <button
                  onClick={() => send(retryText)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-all duration-150 font-medium"
                >
                  Try again â†º
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat input */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="border-t border-white/5 p-3 flex gap-2 shrink-0"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={videoContext ? "Ask about this videoâ€¦" : "Ask anythingâ€¦"}
              className="flex-1 text-xs rounded-lg px-3 py-2 bg-zinc-800 border border-white/5 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-primary/40 transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="px-2.5 py-2 rounded-lg bg-primary text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
            >
              <Send size={14} />
            </button>
          </form>

          {/* AI Creative Direction â€” render pipeline control */}
          <div className="border-t border-white/5 p-4 flex flex-col gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquareQuote className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                AI Creative Direction
              </span>
            </div>
            <textarea
              value={scriptPrompt}
              onChange={(e) => setScriptPrompt(e.target.value)}
              placeholder="e.g. Make it high-energy and focus on the technical details..."
              className="w-full h-20 bg-zinc-800 border border-white/5 rounded-xl p-3 text-[11px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-primary/40 transition-colors resize-none [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10"
            />
            <p className="text-[9px] text-zinc-600 leading-relaxed">
              This prompt is applied by the render pipeline when exporting. It influences
              AI voiceover tone and clip-level stylistic choices.
            </p>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
