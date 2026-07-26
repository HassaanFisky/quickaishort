"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Mic, MicOff, Sparkles, Zap, GripHorizontal } from "lucide-react";
import { useEditorStore, type EditorAction } from "@/stores/editorStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSwipeGesture } from "@/hooks/useTouchGestures";
import {
  type EditorStateContext,
  streamEditorCommand,
  type CanonicalEditorAction,
} from "@/lib/gemini-editor";
import { useSession } from "next-auth/react";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { cn } from "@/lib/utils";
import {
  buildEdgeFacets,
  createMediaGraph,
  ensureMediaGraphForProject,
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
import { DubPanel } from "@/components/editor/DubPanel";
import { useUIStore } from "@/stores/uiStore";

/** Debounce edge facet upserts — transcript/silence/clips churn must not spam Firestore. */
const FACET_REFRESH_DEBOUNCE_MS = 400;

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
          <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>
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
  const [followUpChips, setFollowUpChips] = useState<string[]>([]);
  const activeTool = useUIStore((s) => s.activeTool);
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const mediaGraphIdRef = useRef<string | null>(null);
  const mediaGraphRevisionRef = useRef<number>(-1);
  const boundRunIdRef = useRef<string | null>(null);

  // New source video → reset suggestion rail + graph bind
  useEffect(() => {
    if (boundRunIdRef.current === runId) return;
    boundRunIdRef.current = runId;
    mediaGraphIdRef.current = null;
    mediaGraphRevisionRef.current = -1;
    setSuggestionsLoaded(false);
    setSuggestions([]);
  }, [runId]);
  const [recentActions, setRecentActions] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  // Desktop (lg+) = docked right column in the editor layout flow;
  // below lg = swipe-down-dismissable bottom sheet.
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useSwipeGesture(sheetRef, {
    enabled: !isDesktop && aiPanelOpen,
    onSwipe: (direction, distance) => {
      if (direction === "down" && distance > 60) setAIPanelOpen(false);
    },
  });

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
        // Prefer ensure-by-project (idempotent). When Kernel is on, never create
        // orphan graphs with project_id=null (FinOps / ADR-009).
        let graph = null;
        if (projectId) {
          graph = await ensureMediaGraphForProject(projectId);
        } else if (!isStudioProjectKernelEnabled()) {
          graph = await createMediaGraph({ project_id: null });
        } else {
          return;
        }
        if (
          cancelled ||
          boundRunIdRef.current !== effectRunId
        ) {
          return;
        }
        mediaGraphIdRef.current = graph.graph_id;
        mediaGraphRevisionRef.current = graph.revision;

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
        const upserted = await upsertMediaGraphFacets(graph.graph_id, facets);
        if (
          cancelled ||
          boundRunIdRef.current !== effectRunId ||
          mediaGraphIdRef.current !== graph.graph_id
        ) {
          return;
        }
        mediaGraphRevisionRef.current = upserted.revision;
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
    const timer = window.setTimeout(() => {
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
          const upserted = await upsertMediaGraphFacets(graphId, facets);
          if (
            cancelled ||
            boundRunIdRef.current !== effectRunId ||
            mediaGraphIdRef.current !== graphId
          ) {
            return;
          }
          // FinOps: identical facets → same revision → skip suggestions re-GET.
          if (upserted.revision === mediaGraphRevisionRef.current) {
            return;
          }
          mediaGraphRevisionRef.current = upserted.revision;
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
    }, FACET_REFRESH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
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
      setFollowUpChips([]);

      try {
        const userTier = session?.user?.isPro || (session?.user as any)?.isPremium ? "pro" : "free";
        const result = await streamEditorCommand(
          {
            command: trimmed,
            user_tier: userTier,
            history: historySnapshot.slice(-12),
            project_context: {
              clip_count: editorState.clipCount,
              duration: editorState.videoDuration,
            },
          },
          () => {
            /* SSE payload handled when stream resolves to structured result */
          },
          () => {
            /* onDone — thinking cleared after full apply below */
          },
        );

        if (!result) {
          throw new Error("Empty AI response");
        }

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
                    ? ` · Saved to project (r${head.revision})`
                    : executed?.status === "failed"
                      ? " · Preview only — project save rejected"
                      : " · Preview only — project steps skipped";
              } else {
                receipt = " · Preview applied";
              }
            }
          } catch {
            // Honesty: local preview may have applied; server authority did not ack
            receipt = " · Preview applied — project sync failed, re-sync before export";
          }
        } else if (dispatchActions.length > 0) {
          receipt = " · Preview applied";
        }

        addAIMessage({
          role: "assistant",
          content: `${result.feedback || result.message || "Done."}${receipt}`,
          actions: dispatchActions,
        });

        const nextChips = (result.suggestions || [])
          .map((s) => String(s).trim())
          .filter(Boolean)
          .slice(0, 3);
        setFollowUpChips(nextChips);

        // Refresh grounded rail after a successful turn.
        setSuggestionsLoaded(false);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const status = axios.isAxiosError(err)
          ? err.response?.status
          : err &&
            typeof err === "object" &&
            "status" in err &&
            typeof (err as { status: unknown }).status === "number"
            ? (err as { status: number }).status
            : undefined;
        const detail =
          axios.isAxiosError(err) && err.response?.data?.detail
            ? String(err.response.data.detail)
            : "";

        let displayMsg = "Couldn't complete that — try again.";
        if (status === 402 || /insufficient credits|402/i.test(`${errMsg} ${detail}`)) {
          displayMsg =
            detail || "You're out of credits. Upgrade to Pro to keep editing with AI.";
        } else if (status === 503 || /credit service unavailable/i.test(`${errMsg} ${detail}`)) {
          displayMsg =
            detail || "Billing check is briefly unavailable. Try again in a moment.";
        } else if (
          status === 401 ||
          /\(401\)|unauthorized|invalid or expired token|missing authorization/i.test(
            `${errMsg} ${detail}`,
          )
        ) {
          displayMsg =
            "Sign in to continue — your timeline is still here.";
        } else if (
          status === 403 ||
          /\(403\)|forbidden|permission/i.test(`${errMsg} ${detail}`)
        ) {
          displayMsg =
            detail || "This action isn't available on your plan.";
        } else if (/api[_\s]?key|not configured/i.test(`${errMsg} ${detail}`)) {
          displayMsg =
            "AI editing isn't available right now. Try again later.";
        } else if (
          status === 429 ||
          /rate.?limit|quota|429|RESOURCE_EXHAUSTED|prepayment|credits? depleted/i.test(
            `${errMsg} ${detail}`,
          )
        ) {
          displayMsg =
            "AI is busy right now. Your edits stay on the timeline — try again shortly.";
        } else if (/network|fetch|failed to fetch/i.test(errMsg)) {
          displayMsg = "Connection lost — check your internet and retry.";
        } else if (/400|invalid argument/i.test(errMsg)) {
          displayMsg = "Couldn't understand that — try rephrasing.";
        } else if (detail) {
          displayMsg = detail;
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

  // Shared chat body — rendered in exactly one housing at a time
  // (desktop docked column XOR mobile bottom sheet).
  const panelBody = (
    <>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="ai-panel-header">
        <div className="ai-header-left">
          {/* Gem badge */}
          <div className="ai-header-gem">✦</div>
          <span className="ai-panel-title">Studio Chat</span>
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
                  : "bg-fg-subtle/40"
            )}
          />
          {aiMessages.length > 0 && (
            <button
              onClick={() => useEditorStore.setState({ aiMessages: [] })}
              className="text-[9px] text-fg-subtle hover:text-fg-muted transition-colors uppercase tracking-wider px-1"
              aria-label="Clear conversation"
            >
              Clear
            </button>
          )}
          <button
            className="ai-close-btn"
            onClick={() => setAIPanelOpen(false)}
            aria-label="Close Studio Chat"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {activeTool === "dub" && (
        <div className="border-b border-border/60 px-3 py-3 bg-card/40 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-muted">
              Dub Video
            </span>
            <button
              type="button"
              aria-label="Close Dub Video"
              className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
              onClick={() => setActiveTool(null)}
            >
              Close
            </button>
          </div>
          <DubPanel />
        </div>
      )}

      {/* ── Context strip ─────────────────────────────────────── */}
      <div className="px-4 py-2 flex items-center gap-2 border-b border-border bg-muted/30 shrink-0">
        <Zap className="w-3 h-3 text-accent-p shrink-0" />
        <span className="text-[10px] text-fg-muted font-medium truncate">
          {isVideoLoaded
            ? videoMetadata!.title.length > 48
              ? videoMetadata!.title.slice(0, 48) + "…"
              : videoMetadata!.title
            : "No video loaded — upload a file or paste a YouTube URL"}
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
          <div className="flex flex-wrap gap-1.5 px-3.5 py-2 border-b border-border bg-muted/20 shrink-0">
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-fg-subtle self-center">Active</span>
            {tags.map((t) => (
              <span key={t} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-muted border border-border text-fg-muted">
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
            <div className="w-12 h-12 rounded-2xl bg-muted border border-border flex items-center justify-center mb-1">
              <Sparkles className="w-5 h-5 text-accent-p/60" />
            </div>
            <p className="text-[12px] font-semibold text-fg-muted">
              {isVideoLoaded ? "Tell me what to edit" : "Load a video first"}
            </p>
            <p className="text-[10px] text-fg-subtle max-w-[200px]">
              {isVideoLoaded
                ? "I'll apply your edits directly to the timeline"
                : "Upload a video or paste a YouTube URL to get started"}
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

      {/* ── Suggestion chips (grounded + post-reply follow-ups) ─────────── */}
      {(suggestions.length > 0 || followUpChips.length > 0) && (
        <div className="suggestions-rail" data-tour-id="ai.suggestions">
          {followUpChips.map((chip) => (
            <button
              key={`follow-${chip}`}
              className="suggestion-chip"
              type="button"
              onClick={() => void sendMessage(chip)}
              disabled={isAIThinking}
            >
              {chip}
            </button>
          ))}
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
            data-tour-id="ai.chat"
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
          <span className="text-[9px] text-fg-subtle">
            Enter to send · Shift+Enter for new line
          </span>
          <span className="text-[9px] text-fg-subtle flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">Shift</kbd>
            <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">Alt</kbd>
            <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">A</kbd>
            to toggle
          </span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop (lg+) — docked right column; part of the layout flow so the
          canvas resizes when it opens and the video is never covered. */}
      {isDesktop && (
        <div
          className="hidden lg:block h-full min-h-0 shrink-0 overflow-hidden transition-[width,margin-left,opacity,visibility] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{
            width: aiPanelOpen ? "clamp(380px, 30vw, 460px)" : 0,
            marginLeft: aiPanelOpen ? "0.75rem" : 0,
            opacity: aiPanelOpen ? 1 : 0,
            visibility: aiPanelOpen ? "visible" : "hidden",
          }}
          aria-hidden={!aiPanelOpen}
        >
          <aside
            className="ai-panel relative w-[clamp(380px,30vw,460px)]"
            aria-label="Studio Chat"
          >
            {/* Slim slide edge — docked sidebar cue, never covers the canvas */}
            <div
              aria-hidden
              className="absolute left-0 top-0 bottom-0 w-1 rounded-l-3xl bg-gradient-to-b from-primary/40 via-primary/15 to-transparent pointer-events-none"
            />
            {panelBody}
          </aside>
        </div>
      )}

      {/* Mobile/tablet (<lg) — swipe-down-dismissable bottom sheet */}
      <AnimatePresence>
        {!isDesktop && aiPanelOpen && (
          <>
            <motion.div
              key="ai-sheet-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => setAIPanelOpen(false)}
            />
            <motion.div
              key="ai-sheet"
              ref={sheetRef}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed left-0 right-0 bottom-0 z-50 h-[75vh] max-h-[75vh] bg-card border-t border-border rounded-t-3xl flex flex-col overflow-hidden touch-pan-y"
            >
              <div className="flex flex-col items-center pt-2.5 pb-1 shrink-0">
                <GripHorizontal size={16} className="text-foreground/20" aria-hidden="true" />
              </div>
              {panelBody}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
