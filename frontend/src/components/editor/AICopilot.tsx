"use client";

import { useAIPanel } from "@/stores/aiPanelStore";
import { useEditorStore } from "@/stores/editorStore";
import type { AiViralMoment } from "@/stores/editorStore";
import { useAiCommander } from "@/hooks/useAiCommander";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useRef, useEffect, useCallback } from "react";
import { signIn } from "next-auth/react";
import {
  Sparkles, X, Send, MessageSquareQuote,
  Undo2, Redo2, ChevronDown, ChevronUp,
} from "lucide-react";
import AIToolConsole from "@/components/editor/AIToolConsole";
import { ChatTranscript } from "@/components/editor/ChatTranscript";

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

export function AICopilot() {
  const { isOpen, setOpen, videoContext, messages, addMessage, aiPanelMode, setAiPanelMode } = useAIPanel();
  const { scriptPrompt, setScriptPrompt } = useEditorStore();
  const duration = useEditorStore((s) => s.duration);
  const aiSuggestions = useEditorStore((s) => s.aiSuggestions);
  const clearAiSuggestions = useEditorStore((s) => s.clearAiSuggestions);
  const setPendingSeek = useEditorStore((s) => s.setPendingSeek);
  const addCaption = useEditorStore((s) => s.addCaption);
  const commander = useAiCommander();

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [retryText, setRetryText] = useState<string | null>(null);

  // Edit state
  const [editInput, setEditInput] = useState("");
  const [clampExpanded, setClampExpanded] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);

  const chatSuggestions = videoContext ? WITH_VIDEO_SUGGESTIONS : NO_VIDEO_SUGGESTIONS;

  // ── Chat send ──────────────────────────────────────────────────────────────
  async function sendChat(text: string) {
    const trimmed = text.trim();
    if (!trimmed || chatLoading) return;
    setChatInput("");
    setRetryText(null);
    addMessage({ role: "user", content: trimmed });
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [...messages, { role: "user", content: trimmed }], videoContext }),
      });
      const data = await res.json();
      let content: string;
      if (data.content) {
        content = data.content;
      } else if (res.status === 401) {
        content = "Sign in to use AI suggestions.";
      } else if (res.status === 503) {
        content = "AI service not configured — contact support.";
      } else if (res.status === 429) {
        content = "Rate limit exceeded — try again in a moment.";
      } else if (res.status >= 500) {
        content = `AI error (${res.status}) — please try again.`;
        setRetryText(trimmed);
      } else {
        content = data.message ?? "Something went wrong.";
      }
      addMessage({ role: "assistant", content });
    } catch {
      addMessage({ role: "assistant", content: "Connection lost — check your internet and try again." });
      setRetryText(trimmed);
    } finally {
      setChatLoading(false);
    }
  }

  // ── Edit execute ───────────────────────────────────────────────────────────
  const handleEditSubmit = useCallback(async () => {
    const t = editInput.trim();
    if (!t) return;
    if (commander.status === "executing" || commander.status === "applying") return;
    setEditInput("");
    await commander.execute(t);
  }, [editInput, commander]);

  // Keyboard: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z = redo (scoped to Edit panel)
  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      commander.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
      e.preventDefault();
      commander.redo();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEditSubmit();
    }
    // Escape cancels in-flight
    if (e.key === "Escape") {
      commander.cancel();
    }
  }, [commander, handleEditSubmit]);

  const isExecuting = commander.status === "executing" || commander.status === "applying";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          key="ai-copilot"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 220, damping: 30 }}
          className="fixed right-0 top-0 h-full z-50 w-[360px] bg-card border-l border-border flex flex-col shadow-2xl"
        >
          {/* Header */}
          <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
                <Sparkles size={12} className="text-white" />
              </div>
              <span className="text-sm font-black text-foreground">
                {videoContext ? "Video AI" : "QuickAI Assistant"}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close AI Copilot"
              className="p-1.5 rounded-lg hover:bg-foreground/10 text-fg-muted hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          </header>

          {/* Mode tabs */}
          <div className="flex border-b border-border shrink-0">
            {(["chat", "edit", "tools"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setAiPanelMode(mode)}
                className={`flex-1 py-2 text-xs font-black uppercase tracking-widest transition-colors ${
                  aiPanelMode === mode
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "chat" ? "Chat" : mode === "edit" ? "Edit" : "Tools"}
              </button>
            ))}
          </div>

          {/* Context indicator */}
          <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border shrink-0 bg-base/30">
            {videoContext ? (
              <>Editing: <strong className="text-fg-muted">{videoContext.title.length > 45 ? videoContext.title.slice(0, 45) + "…" : videoContext.title}</strong></>
            ) : (
              "No video loaded — ask me anything about short-form strategy."
            )}
          </div>

          {/* ── CHAT MODE ─────────────────────────────────────────────────── */}
          {aiPanelMode === "chat" && (
            <>
              <ChatTranscript
                messages={messages}
                loading={chatLoading}
                retryText={retryText}
                onRetry={sendChat}
                suggestions={chatSuggestions}
                onSuggestion={sendChat}
              />
              <form onSubmit={(e) => { e.preventDefault(); sendChat(chatInput); }} className="border-t border-border p-3 flex gap-2 shrink-0">
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder={videoContext ? "Ask about this video…" : "Ask anything…"} className="flex-1 text-xs rounded-lg px-3 py-2 bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors" />
                <button type="submit" disabled={!chatInput.trim() || chatLoading} className="px-2.5 py-2 rounded-lg bg-primary text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"><Send size={14} /></button>
              </form>
            </>
          )}

          {/* ── TOOLS MODE ────────────────────────────────────────────────── */}
          {aiPanelMode === "tools" && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <AIToolConsole />
            </div>
          )}

          {/* ── EDIT MODE ─────────────────────────────────────────────────── */}
          {aiPanelMode === "edit" && (
            <div className="flex flex-col flex-1 min-h-0">

              {/* Undo/Redo toolbar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">Canvas Edit</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={commander.undo}
                    disabled={!commander.canUndo}
                    aria-label="Undo last AI edit"
                    className="p-1.5 rounded hover:bg-foreground/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Undo2 size={13} />
                  </button>
                  <button
                    onClick={commander.redo}
                    disabled={!commander.canRedo}
                    aria-label="Redo last AI edit"
                    className="p-1.5 rounded hover:bg-foreground/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Redo2 size={13} />
                  </button>
                </div>
              </div>

              {/* Status banners */}
              <div className="flex flex-col gap-2 px-4 pt-3 shrink-0">
                {/* E1: no video */}
                {duration === 0 && (
                  <div className="text-xs px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    Load a video first before using AI Edit.
                  </div>
                )}

                {/* Error banner */}
                {commander.status === "error" && commander.lastError && (
                  <div className="flex items-start justify-between gap-2 text-xs px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                    <span className="flex-1">{commander.lastError}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {/session expired/i.test(commander.lastError ?? "") && (
                        <button onClick={() => signIn()} className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/40 transition-colors font-black">Sign in</button>
                      )}
                    </div>
                  </div>
                )}

                {/* Clarification bubble */}
                {commander.status === "needs_clarification" && commander.lastMessage && (
                  <div className="text-xs px-3 py-2 rounded-xl bg-muted text-foreground leading-relaxed">
                    {commander.lastMessage}
                  </div>
                )}

                {/* Success message */}
                {commander.status === "idle" && commander.lastMessage && !commander.lastError && (
                  <div className="text-xs px-3 py-2 rounded-xl bg-muted/60 text-muted-foreground leading-relaxed">
                    {commander.lastMessage}
                  </div>
                )}

                {/* Clamping notice */}
                {commander.lastClampedReport.length > 0 && (
                  <div className="text-[10px] px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <div className="flex items-center justify-between">
                      <span>
                        {commander.lastClampedReport.length === 1
                          ? "1 edit adjusted to fit the video bounds."
                          : `${commander.lastClampedReport.length} edits adjusted to fit the video bounds.`}
                      </span>
                      <button
                        onClick={() => setClampExpanded((v) => !v)}
                        className="ml-2 shrink-0 hover:opacity-70"
                        aria-label={clampExpanded ? "Collapse details" : "Show details"}
                      >
                        {clampExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      </button>
                    </div>
                    {clampExpanded && (
                      <ul className="mt-1.5 space-y-0.5 list-disc list-inside text-amber-400/70">
                        {commander.lastClampedReport.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    )}
                  </div>
                )}

                {/* Mock mode badge */}
                {commander.isMockResponse && (
                  <div className="text-[10px] px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-center font-black tracking-wide">
                    Mock response — set MOCK_AI_EDITOR=false on server for real Gemini
                  </div>
                )}
              </div>

              {/* Messages / suggestions area */}
              <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-thumb]:rounded-full">

                {/* ── EXPLAIN_LAST_EDIT banner ── */}
                {aiSuggestions.lastEditExplanation && (
                  <div className="rounded-lg border border-primary/20 bg-primary/8 px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] uppercase tracking-wider text-primary font-black">What AI did</p>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${
                        aiSuggestions.lastEditExplanation.confidence === "high"
                          ? "bg-green-500/20 text-green-400"
                          : aiSuggestions.lastEditExplanation.confidence === "medium"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-red-500/20 text-red-400"
                      }`}>{aiSuggestions.lastEditExplanation.confidence}</span>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">{aiSuggestions.lastEditExplanation.explanation}</p>
                  </div>
                )}

                {/* ── DETECT_VIRAL_MOMENTS list ── */}
                {aiSuggestions.viralMoments.length > 0 && (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex flex-col gap-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-black">Viral Moments</p>
                    {aiSuggestions.viralMoments.map((m: AiViralMoment, i: number) => (
                      <button
                        key={i}
                        onClick={() => setPendingSeek(m.timestamp)}
                        className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg hover:bg-primary/8 hover:border-primary/20 border border-transparent text-left transition-all duration-150"
                      >
                        <span className="text-foreground truncate flex-1">{m.hook}</span>
                        <span className="ml-2 shrink-0 text-[10px] font-black text-primary tabular-nums">
                          {Math.floor(m.timestamp / 60)}:{String(Math.floor(m.timestamp % 60)).padStart(2, "0")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* ── GENERATE_HOOK_CAPTION options ── */}
                {aiSuggestions.hookCaptions.length > 0 && (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex flex-col gap-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-black">Hook Captions</p>
                    {aiSuggestions.hookCaptions.map((c: string, i: number) => (
                      <button
                        key={i}
                        onClick={() => {
                          addCaption({ text: c, startTime: 0, endTime: Math.min(3, duration) });
                        }}
                        className="w-full text-left text-xs px-2 py-1.5 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/8 text-fg-muted hover:text-foreground transition-all duration-150"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}

                {/* ── SUGGEST_STYLE_PRESET card ── */}
                {aiSuggestions.stylePreset && (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-black">Style Preset Applied</p>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-black">{aiSuggestions.stylePreset.preset}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{aiSuggestions.stylePreset.reason}</p>
                  </div>
                )}

                {/* Clear suggestions button */}
                {(aiSuggestions.viralMoments.length > 0 || aiSuggestions.hookCaptions.length > 0 || aiSuggestions.stylePreset || aiSuggestions.lastEditExplanation) && (
                  <button
                    onClick={clearAiSuggestions}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors self-end"
                  >
                    Clear insights
                  </button>
                )}

                {commander.lastSuggestions.length > 0 && (
                  <>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Suggestions</p>
                    {commander.lastSuggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => setEditInput(s)}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/8 text-fg-muted hover:text-foreground transition-all duration-150"
                      >
                        {s}
                      </button>
                    ))}
                  </>
                )}
              </div>

              {/* Input area */}
              <div className="border-t border-border p-3 flex flex-col gap-2 shrink-0">
                <div className={`flex gap-2 rounded-xl border transition-colors ${isExecuting ? "border-primary/60 shadow-[0_0_0_2px_rgba(168,85,247,0.2)]" : "border-border"}`}>
                  <textarea
                    ref={editInputRef}
                    value={editInput}
                    onChange={(e) => setEditInput(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    placeholder={duration === 0 ? "Load a video first…" : "e.g. trim to the hook and add a CTA text…"}
                    disabled={duration === 0}
                    rows={2}
                    className="flex-1 text-xs rounded-xl px-3 py-2.5 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none disabled:opacity-40"
                  />
                  {isExecuting ? (
                    <button
                      onClick={commander.cancel}
                      aria-label="Cancel AI edit"
                      className="self-end mb-2 mr-2 px-2.5 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/40 text-[10px] font-black uppercase tracking-wide transition-colors"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={handleEditSubmit}
                      disabled={!editInput.trim() || duration === 0}
                      aria-label="Send AI edit command"
                      className="self-end mb-2 mr-2 px-2.5 py-2 rounded-lg bg-primary text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                    >
                      <Send size={13} />
                    </button>
                  )}
                </div>
                <p className="text-[9px] text-muted-foreground text-center">
                  Enter to send · Shift+Enter for new line · Ctrl+Z to undo · Esc to cancel
                </p>
              </div>

              {/* AI Creative Direction */}
              <div className="border-t border-border p-4 flex flex-col gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <MessageSquareQuote className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-muted">AI Creative Direction</span>
                </div>
                <textarea
                  value={scriptPrompt}
                  onChange={(e) => setScriptPrompt(e.target.value)}
                  placeholder="e.g. Make it high-energy and focus on the technical details..."
                  className="w-full h-16 bg-muted border border-border rounded-xl p-3 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors resize-none [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-foreground/10"
                />
              </div>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
