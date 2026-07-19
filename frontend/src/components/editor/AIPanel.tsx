"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Mic, MicOff, Sparkles, Zap } from "lucide-react";
import { useEditorStore, type EditorAction } from "@/stores/editorStore";
import {
  type EditorStateContext,
  sendEditorCommand,
  type CanonicalEditorAction,
} from "@/lib/gemini-editor";
import { useSession } from "next-auth/react";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { cn } from "@/lib/utils";
import {
  buildEdgeFacets,
  createMediaGraph,
  fetchGroundedSuggestions,
  upsertMediaGraphFacets,
  type SuggestionIntent,
} from "@/lib/studio/mediaGraph";
import axios from "axios";
import { API_URL } from "@/lib/api";
import {
  ensureStudioProject,
  isStudioProjectKernelEnabled,
} from "@/lib/studio/projectKernel";

/* ─── Sub-components ───────────────────────────────────────────────────────── */

function ActionTag({ type, index }: { type: string; index: number }) {
  return (
    <motion.span
      className="action-tag"
      initial={{ opacity: 0, scale: 0.9, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      {type.replace(/_/g, " ").toLowerCase()}
    </motion.span>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex items-end gap-2">
      <div className="msg-gem-badge">✦</div>
      <div className="thinking-dots">
        <span /><span /><span />
      </div>
    </div>
  );
}

function MessageText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return (
    <p className="msg-text">
      {parts.map((p, i) =>
        p.startsWith("**") ? (
          <strong key={i} className="font-semibold text-white/95">{p.slice(2, -2)}</strong>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </p>
  );
}

function StreamingText({ text }: { text: string }) {
  const lines = text.split(/\n+/).filter((l) => l.trim());
  if (lines.length === 0) return <MessageText text={text} />;
  return (
    <div className="flex flex-col gap-1">
      {lines.map((line, i) => (
        <MessageText key={i} text={line} />
      ))}
    </div>
  );
}

/** Convert canonical registry action → dispatchAIActions envelope ({type, payload}). */
function canonicalToDispatchEnvelope(action: CanonicalEditorAction): EditorAction {
  const { type, ...rest } = action;
  return { type, payload: rest } as EditorAction;
}

/* ─── Main panel ────────────────────────────────────────────────────────────── */

export function AIPanel() {
  const { data: session } = useSession();
  const {
    aiPanelOpen,
    setAIPanelOpen,
    aiMessages,
    addAIMessage,
    isAIThinking,
    setAIThinking,
    dispatchAIActions,
    videoMetadata,
    videoAnalysis,
    // Editor state for context
    suggestions: clips,
    selectedClipId,
    exportSettings,
    captions,
    captionsEnabled,
    markIn,
    markOut,
    timelineMarkers,
    transcript,
    silenceSegments,
    duration,
    runId,
  } = useEditorStore();

  const [inputText, setInputText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestionIntent[]>([]);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const mediaGraphIdRef = useRef<string | null>(null);
  const boundRunIdRef = useRef<string | null>(null);

  // New source video → reset suggestion rail + graph bind
  useEffect(() => {
    if (boundRunIdRef.current === runId) return;
    boundRunIdRef.current = runId;
    mediaGraphIdRef.current = null;
    setSuggestionsLoaded(false);
    setSuggestions([]);
  }, [runId]);
  const [recentActions, setRecentActions] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  // Build editor state snapshot for every Gemini call
  const editorState = useMemo((): EditorStateContext => {
    const selectedIndex = selectedClipId
      ? clips.findIndex((c) => c.id === selectedClipId)
      : null;
    const selectedClip = selectedClipId
      ? clips.find((c) => c.id === selectedClipId) ?? null
      : null;
    const selectedClipDuration =
      selectedClip ? selectedClip.end - selectedClip.start : null;
    return {
      clipIndex: selectedIndex != null && selectedIndex >= 0 ? selectedIndex : null,
      clipStart: selectedClip?.start ?? null,
      clipEnd: selectedClip?.end ?? null,
      clipCount: clips.length,
      selectedClipDuration,
      totalClips: clips.length,
      videoDuration: videoMetadata?.duration ?? 0,
      markIn: markIn ?? null,
      markOut: markOut ?? null,
      timelineMarkerCount: timelineMarkers.length,
      filter: exportSettings.filter,
      audioBoost: exportSettings.audioBoost,
      playbackSpeed: exportSettings.playbackSpeed,
      noiseSuppression: exportSettings.noiseSuppression,
      captionsEnabled,
      captionCount: captions.length,
      transitionEnabled: exportSettings.transitionEnabled,
      voiceoverEnabled: exportSettings.voiceoverEnabled,
      recentActions,
    };
  }, [
    clips, selectedClipId, videoMetadata, exportSettings,
    captionsEnabled, captions.length, recentActions,
    markIn, markOut, timelineMarkers,
  ]);

  const handleTranscript = useCallback((text: string, isFinal: boolean) => {
    if (isFinal) {
      setInputText((prev) => (prev ? prev + " " + text : text));
      setInterimText("");
    } else {
      setInterimText(text);
    }
  }, []);

  const { isRecording, startRecording, stopRecording, error: voiceError } =
    useVoiceInput(handleTranscript);

  const toggleVoice = () => (isRecording ? stopRecording() : startRecording());

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages, isAIThinking]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (aiPanelOpen) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [aiPanelOpen]);

  // EP-003: grounded suggestions from MediaGraph only (Phase 2 A5a).
  // Heuristic title chips are forbidden as product truth.
  useEffect(() => {
    if (!videoMetadata || suggestionsLoaded) return;
    setSuggestionsLoaded(true);

    setSuggestions([
      {
        suggestion_id: "skel-analyzing",
        label: "Analyzing media…",
        capability_id: null,
        intent_kind: "informational",
        params: {},
        evidence: { facet_keys: [], summary: "Waiting for edge facets" },
        confidence: 0,
        interactive: false,
      },
    ]);

    const durationLabel =
      videoMetadata.duration > 3600
        ? `${Math.round(videoMetadata.duration / 3600)}h ${Math.round((videoMetadata.duration % 3600) / 60)}m`
        : videoMetadata.duration > 60
        ? `${Math.round(videoMetadata.duration / 60)}m ${Math.round(videoMetadata.duration % 60)}s`
        : `${Math.round(videoMetadata.duration)}s`;

    addAIMessage({
      role: "assistant",
      content: `**${videoMetadata.title || "Video"}** loaded (${durationLabel}).\n\nI can edit this video — trim, captions, filters, audio, split clips, and more. Suggestions appear from media understanding — not guesses.`,
      actions: [],
    });

    const effectRunId = runId;
    let cancelled = false;
    (async () => {
      try {
        let projectId = useEditorStore.getState().studioProjectId;
        if (isStudioProjectKernelEnabled() && !projectId) {
          projectId = await ensureStudioProject({
            title: videoMetadata.title ?? "Studio Project",
            active_run_id: useEditorStore.getState().runId,
          });
        }
        if (
          cancelled ||
          boundRunIdRef.current !== effectRunId
        ) {
          return;
        }
        const graph = await createMediaGraph({
          project_id: projectId,
        });
        if (
          cancelled ||
          boundRunIdRef.current !== effectRunId
        ) {
          return;
        }
        mediaGraphIdRef.current = graph.graph_id;

        const moments = clips.map((c) => ({
          start: c.start,
          end: c.end,
          score: c.score ?? 0,
        }));

        const facets = buildEdgeFacets({
          duration: videoMetadata.duration || duration || 0,
          transcriptChunks: transcript?.chunks ?? null,
          silenceSegments: silenceSegments ?? null,
          captionsEnabled,
          viralMoments: moments.length > 0 ? moments : null,
        });
        await upsertMediaGraphFacets(graph.graph_id, facets);
        if (
          cancelled ||
          boundRunIdRef.current !== effectRunId ||
          mediaGraphIdRef.current !== graph.graph_id
        ) {
          return;
        }
        const grounded = await fetchGroundedSuggestions(graph.graph_id);
        if (
          !cancelled &&
          boundRunIdRef.current === effectRunId &&
          mediaGraphIdRef.current === graph.graph_id &&
          grounded.length > 0
        ) {
          setSuggestions(grounded);
        }
      } catch {
        if (!cancelled && boundRunIdRef.current === effectRunId) {
          setSuggestions([
            {
              suggestion_id: "skel-unavailable",
              label: "Media understanding unavailable — type an edit command",
              capability_id: null,
              intent_kind: "informational",
              params: {},
              evidence: { facet_keys: [], summary: "MediaGraph API error" },
              confidence: 0,
              interactive: false,
            },
          ]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    videoMetadata,
    suggestionsLoaded,
    addAIMessage,
    transcript,
    silenceSegments,
    duration,
    captionsEnabled,
    clips,
    runId,
  ]);

  // Refresh grounded suggestions when transcript/silence/clips arrive after first load
  useEffect(() => {
    const graphId = mediaGraphIdRef.current;
    const effectRunId = runId;
    if (!graphId || !videoMetadata) return;
    let cancelled = false;
    (async () => {
      try {
        // Abort if a newer source video superseded this effect's run
        if (
          cancelled ||
          boundRunIdRef.current !== effectRunId ||
          mediaGraphIdRef.current !== graphId
        ) {
          return;
        }
        const moments = clips.map((c) => ({
          start: c.start,
          end: c.end,
          score: c.score ?? 0,
        }));
        const facets = buildEdgeFacets({
          duration: videoMetadata.duration || duration || 0,
          transcriptChunks: transcript?.chunks ?? null,
          silenceSegments: silenceSegments ?? null,
          captionsEnabled,
          viralMoments: moments.length > 0 ? moments : null,
        });
        await upsertMediaGraphFacets(graphId, facets);
        if (
          cancelled ||
          boundRunIdRef.current !== effectRunId ||
          mediaGraphIdRef.current !== graphId
        ) {
          return;
        }
        const grounded = await fetchGroundedSuggestions(graphId);
        if (
          !cancelled &&
          boundRunIdRef.current === effectRunId &&
          mediaGraphIdRef.current === graphId &&
          grounded.length > 0
        ) {
          setSuggestions(grounded);
        }
      } catch {
        /* keep prior rail */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    transcript,
    silenceSegments,
    captionsEnabled,
    clips,
    videoMetadata,
    duration,
    runId,
  ]);

  /** EP-004: grounded chip → structured Plan → local apply (+ optional Kernel). */
  const applyGroundedSuggestion = useCallback(
    async (s: SuggestionIntent) => {
      if (!s.interactive || !s.capability_id || isAIThinking) return;
      addAIMessage({ role: "user", content: s.label });
      setAIThinking(true);
      try {
        const { data: plan } = await axios.post(
          `${API_URL}/api/studio/v1/orchestrator/plan`,
          {
            source: "suggestion",
            project_id: useEditorStore.getState().studioProjectId,
            structured: {
              capability_id: s.capability_id,
              params: s.params ?? {},
              label: s.label,
              suggestion_id: s.suggestion_id,
            },
          },
        );
        const step = plan?.steps?.[0];
        if (step?.capability_id) {
          dispatchAIActions([
            {
              type: step.capability_id,
              payload: step.params ?? {},
            },
          ]);
        }

        if (
          isStudioProjectKernelEnabled() &&
          useEditorStore.getState().studioProjectId &&
          plan?.plan_id
        ) {
          useEditorStore.getState().rebuildRenderManifest();
          const st = useEditorStore.getState();
          if (st.compiledManifest) {
            await axios.post(`${API_URL}/api/studio/v1/orchestrator/execute`, {
              plan_id: plan.plan_id,
              project_id: st.studioProjectId,
              base_revision: st.studioAckedRevision,
              base_snapshot_hash: st.studioSnapshotHash,
              proposed_manifest: st.compiledManifest,
            });
            // Refresh ack revision from head is best-effort via execute response
          }
        }

        addAIMessage({
          role: "assistant",
          content: plan?.message || `Planned: ${s.capability_id}`,
          actions: step
            ? [{ type: step.capability_id, payload: step.params ?? {} }]
            : [],
        });
      } catch (err: unknown) {
        const msg =
          axios.isAxiosError(err) && err.response?.data?.detail
            ? String(err.response.data.detail)
            : "Could not apply grounded suggestion — try typing the edit.";
        addAIMessage({ role: "assistant", content: msg, actions: [] });
      } finally {
        setAIThinking(false);
      }
    },
    [isAIThinking, addAIMessage, dispatchAIActions],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isAIThinking) return;

      // Save to command history (dedupe consecutive duplicates)
      if (commandHistoryRef.current[commandHistoryRef.current.length - 1] !== trimmed) {
        commandHistoryRef.current.push(trimmed);
        if (commandHistoryRef.current.length > 50) commandHistoryRef.current.shift();
      }
      historyIndexRef.current = -1;

      stopRecording();
      setInputText("");
      setInterimText("");

      const historySnapshot = useEditorStore.getState().aiMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      addAIMessage({ role: "user", content: trimmed });
      setAIThinking(true);

      try {
        const userTier = session?.user?.isPro || (session?.user as any)?.isPremium ? "pro" : "free";
        const result = await sendEditorCommand({
          command: trimmed,
          user_tier: userTier,
          project_context: {
            clip_count: editorState.clipCount,
            duration: editorState.videoDuration,
          },
        });

        // Server normalizes legacy {tool,params} → canonical {type} (EP-001).
        // Drop any non-canonical wire shape rather than client-side dialect translation.
        const rawActions = result.actions || [];
        const dispatchActions = rawActions
          .filter(
            (a): a is CanonicalEditorAction =>
              Boolean(a) &&
              typeof a === "object" &&
              typeof (a as CanonicalEditorAction).type === "string",
          )
          .map((a) => canonicalToDispatchEnvelope(a));

        if (dispatchActions.length > 0) {
          dispatchAIActions(dispatchActions);
          setRecentActions((prev) =>
            [...prev, ...dispatchActions.map((x: { type: string }) => x.type)].slice(-8),
          );
        }

        // EP-004 — Kernel commit from already-planned actions (no second LLM call).
        // NEXT_PUBLIC_* is build-time; capture once so we never half-enter Kernel path.
        let receipt = "";
        const kernelEnabled = isStudioProjectKernelEnabled();
        if (kernelEnabled && dispatchActions.length > 0) {
          try {
            const { ensureStudioProject, fetchStudioHead } = await import(
              "@/lib/studio/projectKernel"
            );
            if (!isStudioProjectKernelEnabled()) {
              // Defensive: never touch Kernel store fields if flag flipped off in tests
              receipt = " · Preview only (Kernel disabled)";
            } else {
              const projectId = await ensureStudioProject({
                title: videoMetadata?.title ?? "Studio Project",
                active_run_id: useEditorStore.getState().runId,
              });
              const structured_steps = dispatchActions.map(
                (a: { type: string; payload?: Record<string, unknown> }) => ({
                  capability_id: a.type,
                  params: a.payload ?? {},
                }),
              );
              const { data: plan } = await axios.post(
                `${API_URL}/api/studio/v1/orchestrator/plan`,
                {
                  source: "chat",
                  intent_text: trimmed,
                  project_id: projectId,
                  structured_steps,
                },
              );
              useEditorStore.getState().rebuildRenderManifest();
              const st = useEditorStore.getState();
              if (
                plan?.plan_id &&
                st.compiledManifest &&
                projectId &&
                plan.steps?.length
              ) {
                const { data: executed } = await axios.post(
                  `${API_URL}/api/studio/v1/orchestrator/execute`,
                  {
                    plan_id: plan.plan_id,
                    project_id: projectId,
                    base_revision: st.studioAckedRevision,
                    base_snapshot_hash: st.studioSnapshotHash,
                    proposed_manifest: st.compiledManifest,
                  },
                );
                const head = await fetchStudioHead(projectId);
                useEditorStore.setState({
                  studioAckedRevision: head.revision,
                  studioSnapshotHash: head.snapshot_hash,
                });
                const accepted = (executed?.steps ?? []).filter(
                  (s: { status?: string }) => s.status === "accepted",
                ).length;
                receipt =
                  accepted > 0
                    ? ` · Kernel r${head.revision} (${accepted} ack)`
                    : executed?.status === "failed"
                      ? " · Preview applied; Kernel rejected — re-apply before export"
                      : " · Preview applied; Kernel steps skipped";
              }
            }
          } catch {
            // Honesty: local preview may have applied; server authority did not ack
            receipt =
              " · Preview applied; Kernel sync failed — re-sync before export";
          }
        }

        addAIMessage({
          role: "assistant",
          content: `${result.feedback || result.message || "Done."}${receipt}`,
          actions: dispatchActions,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);

        let displayMsg = "Request failed — please try again.";
        if (/api[_\s]?key|not configured|401|403/i.test(errMsg)) {
          displayMsg = "Gemini API key not configured on this server.";
        } else if (/rate.?limit|quota|429|RESOURCE_EXHAUSTED/i.test(errMsg)) {
          displayMsg = "Rate limit reached — wait a moment and retry.";
        } else if (/network|fetch|failed to fetch/i.test(errMsg)) {
          displayMsg = "Connection lost — check your internet.";
        } else if (/400|invalid argument/i.test(errMsg)) {
          displayMsg = "Invalid request — try rephrasing.";
        } else if (errMsg && errMsg !== "Request failed") {
          displayMsg = errMsg;
        }

        addAIMessage({ role: "assistant", content: displayMsg, actions: [] });
      } finally {
        setAIThinking(false);
      }
    },
    [isAIThinking, stopRecording, addAIMessage, setAIThinking, dispatchAIActions, videoMetadata, videoAnalysis, editorState, session],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
      return;
    }
    // Arrow up/down — navigate command history
    if (e.key === "ArrowUp" && commandHistoryRef.current.length > 0) {
      e.preventDefault();
      const next = historyIndexRef.current < commandHistoryRef.current.length - 1
        ? historyIndexRef.current + 1
        : historyIndexRef.current;
      historyIndexRef.current = next;
      const cmd = commandHistoryRef.current[commandHistoryRef.current.length - 1 - next];
      if (cmd !== undefined) setInputText(cmd);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndexRef.current <= 0) {
        historyIndexRef.current = -1;
        setInputText("");
      } else {
        historyIndexRef.current -= 1;
        const cmd = commandHistoryRef.current[commandHistoryRef.current.length - 1 - historyIndexRef.current];
        if (cmd !== undefined) setInputText(cmd);
      }
    }
  };

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const isVideoLoaded = !!videoMetadata;

  return (
    <AnimatePresence>
      {aiPanelOpen && (
        <motion.aside
          drag
          dragMomentum={false}
          dragConstraints={{ top: -400, bottom: 200, left: -600, right: 600 }}
          className="fixed bottom-5 z-50 flex flex-col cursor-grab active:cursor-grabbing"
          style={{ left: "calc(50% - min(260px, 46vw))", width: "min(520px, 92vw)", maxHeight: "55vh" }}
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 260 }}
        >
        <div className="flex flex-col h-full rounded-2xl overflow-hidden border border-white/[0.08] bg-[#111116]/95 backdrop-blur-2xl shadow-[0_24px_64px_rgba(0,0,0,0.7),0_0_0_1px_rgba(168,85,247,0.1)]">
          {/* ── Header ──────────────────────────────────────────────── */}
          <div className="ai-panel-header">
            <div className="ai-header-left">
              {/* Gem badge */}
              <div className="ai-header-gem">✦</div>
              <span className="ai-panel-title">QuickAI Editor</span>
            </div>

            <div className="ai-header-right">
              {/* Status dot */}
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  isAIThinking
                    ? "bg-amber-400 animate-pulse"
                    : isVideoLoaded
                    ? "bg-emerald-400"
                    : "bg-white/20"
                )}
              />
              {aiMessages.length > 0 && (
                <button
                  onClick={() => useEditorStore.setState({ aiMessages: [] })}
                  className="text-[9px] text-white/30 hover:text-white/70 transition-colors uppercase tracking-wider px-1"
                  aria-label="Clear conversation"
                >
                  Clear
                </button>
              )}
              <button
                className="ai-close-btn"
                onClick={() => setAIPanelOpen(false)}
                aria-label="Close QuickAI Editor"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* ── Context strip ─────────────────────────────────────── */}
          <div className="px-4 py-2 flex items-center gap-2 border-b border-white/[0.05] bg-white/[0.02] shrink-0">
            <Zap className="w-3 h-3 text-accent-p shrink-0" />
            <span className="text-[10px] text-white/40 font-medium truncate">
              {isVideoLoaded
                ? videoMetadata!.title.length > 48
                  ? videoMetadata!.title.slice(0, 48) + "…"
                  : videoMetadata!.title
                : "No video loaded — paste a YouTube URL to start"}
            </span>
          </div>

          {/* ── Active edit state (only shown when something is non-default) ── */}
          {(() => {
            const tags: string[] = [];
            if (editorState.filter !== "None") tags.push(editorState.filter);
            if (editorState.audioBoost !== 85 && editorState.audioBoost !== 100) tags.push(`Audio ${editorState.audioBoost}%`);
            if (editorState.playbackSpeed !== 100) tags.push(`${editorState.playbackSpeed}% speed`);
            if (editorState.captionCount > 0) tags.push(`${editorState.captionCount} caption${editorState.captionCount > 1 ? "s" : ""}`);
            if (editorState.transitionEnabled) tags.push("Transitions");
            if (tags.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-1.5 px-3.5 py-2 border-b border-white/[0.05] bg-white/[0.015] shrink-0">
                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/20 self-center">Active</span>
                {tags.map((t) => (
                  <span key={t} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-white/50">
                    {t}
                  </span>
                ))}
              </div>
            );
          })()}

          {/* ── Messages ────────────────────────────────────────────── */}
          <div className="ai-messages">

            {/* Empty state */}
            {aiMessages.length === 0 && (
              <div className="ai-empty-state">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-1">
                  <Sparkles className="w-5 h-5 text-accent-p/60" />
                </div>
                <p className="text-[12px] font-semibold text-white/30">
                  {isVideoLoaded ? "Tell me what to edit" : "Load a video first"}
                </p>
                <p className="text-[10px] text-white/15 max-w-[200px]">
                  {isVideoLoaded
                    ? "I'll apply your edits directly to the timeline"
                    : "Paste a YouTube URL in the top bar to get started"}
                </p>
              </div>
            )}

            {/* Messages */}
            {aiMessages.map((msg) => (
              <motion.div
                key={msg.id}
                className={`ai-msg ai-msg-${msg.role}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                {msg.role === "assistant" && (
                  <div className="msg-gem-badge">✦</div>
                )}
                <div className="msg-content">
                  {msg.role === "assistant" ? (
                    <StreamingText text={msg.content} />
                  ) : (
                    <MessageText text={msg.content} />
                  )}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="action-tags">
                      {msg.actions.map((a, i) => (
                        <ActionTag key={i} type={a.type} index={i} />
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}

            {/* Thinking indicator */}
            {isAIThinking && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="ai-msg ai-msg-assistant"
              >
                <ThinkingBubble />
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Suggestion chips (EP-003 grounded only) ─────────── */}
          {suggestions.length > 0 && (
            <div className="suggestions-rail">
              {suggestions.map((s) =>
                s.interactive ? (
                  <button
                    key={s.suggestion_id}
                    className="suggestion-chip"
                    title={s.evidence.summary}
                    onClick={() => void applyGroundedSuggestion(s)}
                    disabled={isAIThinking}
                  >
                    {s.label}
                  </button>
                ) : (
                  <span
                    key={s.suggestion_id}
                    className="suggestion-chip opacity-60 cursor-default pointer-events-none"
                    title={s.evidence.summary}
                    aria-disabled="true"
                  >
                    {s.label}
                  </span>
                ),
              )}
            </div>
          )}

          {/* ── Input area ───────────────────────────────────────── */}
          <div className="ai-input-area">
            {interimText && (
              <div className="interim-text">{interimText}</div>
            )}

            <div className="input-row">
              <textarea
                ref={textareaRef}
                className="ai-textarea"
                placeholder={
                  !isVideoLoaded
                    ? "Load a video to start editing…"
                    : isRecording
                    ? "Listening…"
                    : "Tell me what to edit… (Enter to send)"
                }
                value={inputText}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={isAIThinking || !isVideoLoaded}
              />

              <button
                className={`voice-btn ${isRecording ? "voice-btn-active" : ""}`}
                onClick={toggleVoice}
                disabled={!isVideoLoaded}
                aria-label={isRecording ? "Stop recording" : "Voice input"}
                title={isRecording ? "Stop voice input" : "Voice input"}
              >
                {isRecording ? <MicOff size={14} /> : <Mic size={14} />}
              </button>

              <button
                className="send-btn"
                onClick={() => sendMessage(inputText)}
                disabled={isAIThinking || !inputText.trim() || !isVideoLoaded}
                aria-label="Send"
                title="Send (Enter)"
              >
                <Send size={13} />
              </button>
            </div>

            {voiceError && <p className="voice-error">{voiceError}</p>}

            {/* Keyboard hint */}
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[9px] text-white/15">
                Enter to send · Shift+Enter for new line
              </span>
              <span className="text-[9px] text-white/15 flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-white/[0.06] font-mono text-[9px]">Ctrl</kbd>
                <kbd className="px-1 py-0.5 rounded bg-white/[0.06] font-mono text-[9px]">K</kbd>
                to open
              </span>
            </div>
          </div>
        </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
