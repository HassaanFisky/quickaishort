"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Mic, MicOff, Sparkles, Zap, GripHorizontal } from "lucide-react";
import { useEditorStore, type EditorAction } from "@/stores/editorStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSwipeGesture } from "@/hooks/useTouchGestures";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { motionProps } from "@/lib/animations";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  type EditorStateContext,
  streamEditorCommand,
  buildProjectContextForCommand,
  type CanonicalEditorAction,
  AiEditorCommandError,
} from "@/lib/gemini-editor";
import {
  getAiEditorHealth,
  orchestratorPlan,
  orchestratorExecute,
} from "@/lib/api";
import { mapAiEditorError } from "@/lib/aiEditorErrors";
import { useSession } from "next-auth/react";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { SPEECH_COPY } from "@/lib/studio/computePlane";
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
import { API_URL, getStats } from "@/lib/api";
import {
  ensureStudioProject,
  isStudioProjectKernelEnabled,
} from "@/lib/studio/projectKernel";
import { DubPanel } from "@/components/editor/DubPanel";
import { useUIStore } from "@/stores/uiStore";
import Link from "next/link";
import { AuthenticatedFetchError } from "@/lib/authenticatedFetch";
import {
  formatCommandFeedback,
  shouldSkipCreditGate,
} from "@/lib/aiCommandHonesty";

/** Debounce edge facet upserts — transcript/silence/clips churn must not spam Firestore. */
const FACET_REFRESH_DEBOUNCE_MS = 400;

type OrchestratorPlanResult = {
  plan_id?: string;
  decision_mode?: string;
  message?: string;
  status?: string;
  steps?: Array<{
    capability_id: EditorAction["type"];
    params?: Record<string, unknown>;
    status?: string;
  }>;
  execution_integrity?: { status?: string };
};

/**
 * Silence chips go through decision_gate (0 Gemini). Typed director/dead-air
 * chat is intercepted server-side (decision-intelligence) then Kernel-gated.
 * ASK/RESEARCH with chip segments falls back to the existing structured plan.
 */
async function planGroundedSuggestion(
  s: SuggestionIntent,
  projectId: string | null,
): Promise<OrchestratorPlanResult> {
  const capabilityId = s.capability_id;
  if (!capabilityId) {
    return { message: "unsupported_suggestion", steps: [] };
  }

  const structured = {
    source: "suggestion" as const,
    project_id: projectId,
    structured: {
      capability_id: capabilityId,
      params: s.params ?? {},
      label: s.label,
      suggestion_id: s.suggestion_id,
    },
  };

  if (capabilityId !== "REMOVE_SILENCES") {
    return (await orchestratorPlan(structured)) as OrchestratorPlanResult;
  }

  const gated = (await orchestratorPlan({
    source: "suggestion",
    decision_gate: true,
    intent_text: s.label,
    project_id: projectId,
  })) as OrchestratorPlanResult;

  if (gated?.decision_mode === "ACT") return gated;

  const segments = Array.isArray(s.params?.segments) ? s.params.segments : [];
  if (segments.length > 0) {
    return (await orchestratorPlan(structured)) as OrchestratorPlanResult;
  }
  return gated;
}

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

function ThinkingBubble({ stageLabel }: { stageLabel?: string }) {
  return (
    <div
      className="flex flex-col gap-1"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-end gap-2">
        <div className="msg-gem-badge" aria-hidden>
          ✦
        </div>
        <div className="thinking-dots" aria-hidden>
          <span /><span /><span />
        </div>
      </div>
      <p className="text-12 text-muted-foreground pl-8">
        {stageLabel?.trim() || "Got it — shaping your edit…"}
      </p>
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
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [kernelSyncState, setKernelSyncState] = useState<
    "idle" | "saved" | "preview" | "sync_failed"
  >("idle");
  const {
    aiPanelOpen,
    setAIPanelOpen,
    aiMessages,
    addAIMessage,
    isAIThinking,
    setAIThinking,
    dispatchAIActions,
    applyAiEdits,
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
    aiSuggestions,
    duration,
    runId,
    currentTime,
    sourceUrl,
    sourceFile,
  } = useEditorStore();

  const [inputText, setInputText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestionIntent[]>([]);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const [followUpChips, setFollowUpChips] = useState<string[]>([]);
  const [thinkingStage, setThinkingStage] = useState("Got it — shaping your edit…");
  const [showExportFinalChip, setShowExportFinalChip] = useState(false);
  const firstWinAckedRef = useRef(false);
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
    setKernelSyncState("idle");
    setShowExportFinalChip(false);
    firstWinAckedRef.current = false;
  }, [runId]);

  // Composer handoff — pre-fill chat when user described intent on home workspace
  useEffect(() => {
    if (!sourceUrl && !sourceFile) return;
    try {
      const pending = sessionStorage.getItem("qai:initial-prompt");
      if (!pending) return;
      sessionStorage.removeItem("qai:initial-prompt");
      setInputText(pending);
    } catch {
      /* ignore */
    }
  }, [runId, sourceUrl, sourceFile]);

  // Honest partial / missing-tool feedback from dispatchAIActions — never silent.
  useEffect(() => {
    const onRefused = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        type?: string;
        reason?: string;
        openAdvanced?: boolean;
      }>).detail;
      const type = detail?.type || "tool";
      const reason = detail?.reason || "unavailable";
      const label = type.replace(/_/g, " ").toLowerCase();
      let content: string;
      if (reason === "needs_stock_pick") {
        content =
          "Pick a B-roll clip from the library — chat needs a stock source first.";
      } else if (reason === "partial_open_advanced") {
        content = `${label} is only partial in chat — open Advanced for full controls.`;
      } else if (reason === "not_implemented_in_preview") {
        content = `${label} isn't chat-ready yet — open Advanced to finish that edit.`;
      } else if (reason === "missing_time_sec") {
        content = `Couldn't apply ${label} — need a clear time or in/out range.`;
      } else if (reason === "no_duration") {
        content = "Couldn't remove silences — video duration isn't ready yet.";
      } else if (reason === "no_silences") {
        content = "No silence segments found to cut.";
      } else if (reason === "keep_too_short") {
        content = "Couldn't remove silences — that cut would leave nothing usable.";
      } else if (reason === "over_80_percent") {
        content = "Refused — removing those silences would drop more than 80% of the video.";
      } else if (reason === "invalid_range") {
        content = "Couldn't apply trim — need a valid in/out range.";
      } else if (reason === "preview_only_not_exported") {
        content = `${label} plays in the preview only — it is not mixed into the exported file yet.`;
      } else if (reason === "no_clip") {
        content = "No clip selected for that mark — pick a clip first.";
      } else {
        content = `${label} isn't available from chat yet — try Advanced or another edit.`;
      }
      addAIMessage({ role: "assistant", content, actions: [] });
      if (detail?.openAdvanced && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("qai:open-advanced"));
      }
    };
    window.addEventListener("qai:ai-tool-refused", onRefused as EventListener);
    return () =>
      window.removeEventListener("qai:ai-tool-refused", onRefused as EventListener);
  }, [addAIMessage]);
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setCreditBalance(null);
      return;
    }
    let cancelled = false;
    getStats(userId)
      .then((stats) => {
        if (!cancelled) setCreditBalance(stats.credits_balance);
      })
      .catch(() => {
        if (!cancelled) setCreditBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  // Honest Gemini circuit — poll lightly while chat is open (no fake success).
  const [circuitBanner, setCircuitBanner] = useState<string | null>(null);
  const [mockAiMode, setMockAiMode] = useState(false);
  useEffect(() => {
    if (!aiPanelOpen) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const health = await getAiEditorHealth();
        if (cancelled) return;
        setMockAiMode(Boolean(health.mock_ai_mode));
        const circuit = health.gemini_circuit;
        if (health.status === "deferred" || circuit?.blocked === true) {
          const ra = circuit?.retry_after_seconds;
          setCircuitBanner(
            ra
              ? `AI briefly unavailable — retry in ~${ra}s. Timeline edits are safe.`
              : "AI temporarily unavailable (provider limit). Timeline edits are safe — try again later.",
          );
        } else if (health.status === "missing_api_key") {
          setCircuitBanner("AI is not configured on the server.");
        } else {
          setCircuitBanner(null);
        }
      } catch {
        if (!cancelled) setCircuitBanner(null);
      }
    };
    void poll();
    const id = window.setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [aiPanelOpen]);

  const [recentActions, setRecentActions] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commandHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  // Desktop (lg+) = docked right column in the editor layout flow;
  // below lg = swipe-down-dismissable bottom sheet.
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const reduceMotion = usePrefersReducedMotion();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useSwipeGesture(sheetRef, {
    enabled: !isDesktop && aiPanelOpen,
    onSwipe: (direction, distance) => {
      if (direction === "down" && distance > 60) setAIPanelOpen(false);
    },
  });

  useEffect(() => {
    if (isDesktop || !aiPanelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAIPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop, aiPanelOpen, setAIPanelOpen]);

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

  const {
    isRecording,
    startRecording,
    stopRecording,
    error: voiceError,
    available: browserVoiceAvailable,
  } = useVoiceInput(handleTranscript);

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
          mediaGraphIdRef.current === graph.graph_id
        ) {
          if (grounded.length > 0) {
            setSuggestions(grounded);
          } else {
            setSuggestions([
              {
                suggestion_id: "skel-empty",
                label: "Suggestions unavailable — type an edit command",
                capability_id: null,
                intent_kind: "informational",
                params: {},
                evidence: { facet_keys: [], summary: "No grounded suggestions yet" },
                confidence: 0,
                interactive: false,
              },
            ]);
          }
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
        const plan = await planGroundedSuggestion(
          s,
          useEditorStore.getState().studioProjectId,
        );
        if (
          s.capability_id === "REMOVE_SILENCES" &&
          plan?.decision_mode &&
          plan.decision_mode !== "ACT" &&
          !plan.steps?.length
        ) {
          addAIMessage({
            role: "assistant",
            content:
              plan.message ||
              "Need silence evidence before cutting dead air.",
            actions: [],
          });
          return;
        }
        const step = plan?.steps?.[0];
        if (step?.capability_id) {
          useEditorStore.getState().pushAiSnapshot("AI suggestion");
          dispatchAIActions([
            {
              type: step.capability_id,
              payload: step.params ?? {},
            },
          ]);
        }

        // Apply honesty: DETECT_VIRAL must never look like a silent success.
        if (step?.capability_id === "DETECT_VIRAL_MOMENTS") {
          const st = useEditorStore.getState();
          const moments = st.aiSuggestions.viralMoments;
          const explain = st.aiSuggestions.lastEditExplanation;
          if (moments.length > 0) {
            const pride =
              !firstWinAckedRef.current
                ? " Nice — first win locked in."
                : "";
            if (!firstWinAckedRef.current) {
              firstWinAckedRef.current = true;
              setShowExportFinalChip(true);
            }
            addAIMessage({
              role: "assistant",
              content: `Found ${moments.length} highlight${moments.length === 1 ? "" : "s"} — preview at the top moment.${pride}`,
              actions: [{ type: step.capability_id, payload: step.params ?? {} }],
            });
            return;
          }
          addAIMessage({
            role: "assistant",
            content:
              explain?.explanation ||
              "No viral moments yet — analysis will retry when the transcript is ready.",
            actions: [],
          });
          return;
        }

        if (step?.capability_id === "REMOVE_SILENCES") {
          const st = useEditorStore.getState();
          const cuts = st.silenceSegments.filter((seg) => seg.type !== "keep");
          if (cuts.length === 0 && !st.trimMarker) {
            addAIMessage({
              role: "assistant",
              content:
                "No silence gaps long enough to cut — dead-air markers need to finish analyzing first.",
              actions: [],
            });
            return;
          }
        }

        if (
          isStudioProjectKernelEnabled() &&
          useEditorStore.getState().studioProjectId &&
          plan?.plan_id
        ) {
          try {
            useEditorStore.getState().rebuildRenderManifest();
            const st = useEditorStore.getState();
            if (st.compiledManifest) {
              await orchestratorExecute({
                plan_id: plan.plan_id,
                project_id: st.studioProjectId,
                base_revision: st.studioAckedRevision,
                base_snapshot_hash: st.studioSnapshotHash,
                proposed_manifest: st.compiledManifest,
              });
            }
          } catch (syncErr: unknown) {
            const { formatApiDetail } = await import("@/lib/authenticatedFetch");
            const detail = axios.isAxiosError(syncErr)
              ? formatApiDetail(
                syncErr.response?.data?.detail,
                syncErr.response?.status ?? 500,
              )
              : "";
            addAIMessage({
              role: "assistant",
              content:
                step?.capability_id
                  ? `Edit applied in the editor. Cloud sync failed${detail ? `: ${detail}` : ""} — timeline stays updated.`
                  : detail || "Cloud sync failed — try again.",
              actions: step
                ? [{ type: step.capability_id, payload: step.params ?? {} }]
                : [],
            });
            return;
          }
        }

        // First-win pride + optional Export Final (continuum +2 heuristic path).
        let pride = "";
        if (step?.capability_id && !firstWinAckedRef.current) {
          firstWinAckedRef.current = true;
          setShowExportFinalChip(true);
          pride = " Nice — preview looks sharper.";
        }
        addAIMessage({
          role: "assistant",
          content: `${
            step
              ? plan?.message || `Applied ${step.capability_id.replace(/_/g, " ").toLowerCase()}.`
              : plan?.message || "No edit applied — that suggestion returned no executable action."
          }${pride}`,
          actions: step
            ? [{ type: step.capability_id, payload: step.params ?? {} }]
            : [],
        });
      } catch (err: unknown) {
        const { formatApiDetail } = await import("@/lib/authenticatedFetch");
        const msg = axios.isAxiosError(err)
          ? formatApiDetail(err.response?.data?.detail, err.response?.status ?? 500) ||
          "Could not apply grounded suggestion — try typing the edit."
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

      const transcriptReady = (transcript?.chunks?.length ?? 0) > 0;
      if (!transcriptReady) {
        addAIMessage({
          role: "assistant",
          content: "Transcript is still running — wait until captions land, then send the command.",
          actions: [],
        });
        return;
      }

      // Fail-closed before network: zero credits must never burn Gemini prepaid.
      // MOCK_AI_MODE skips the client gate — backend already skips the charge.
      if (!shouldSkipCreditGate(mockAiMode) && creditBalance !== null && creditBalance <= 0) {
        addAIMessage({
          role: "assistant",
          content:
            "You're out of credits. Upgrade to Pro to keep editing with AI — no charge was made.",
          actions: [],
        });
        return;
      }

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
      // Instant perceived ack (<300ms) — stage before model round-trip.
      setThinkingStage("Got it — shaping your edit…");
      setAIThinking(true);
      setFollowUpChips([]);

      try {
        const userTier = session?.user?.isPro || (session?.user as any)?.isPremium ? "pro" : "free";
        const project_context = buildProjectContextForCommand({
          editorState,
          selectedClipId,
          currentTime,
          aspectRatio: exportSettings.aspectRatio,
          runId,
          studioProjectId: useEditorStore.getState().studioProjectId,
          transcript,
          captions,
          videoAnalysis,
          silenceSegments,
          viralMoments: (aiSuggestions.viralMoments ?? []).map((m) => ({
            timestamp: m.timestamp,
            score: m.score,
            hook: m.hook,
          })),
        });
        const result = await streamEditorCommand(
          {
            command: trimmed,
            user_tier: userTier,
            history: historySnapshot.slice(-12),
            project_context,
            workload_id: runId || undefined,
          },
          () => {
            /* SSE payload handled when stream resolves to structured result */
          },
          () => {
            /* onDone — thinking cleared after full apply below */
          },
          (stage) => {
            if (stage.message) setThinkingStage(stage.message);
            else if (stage.stage === "planning")
              setThinkingStage("Reading your cut…");
            else if (stage.stage === "applying")
              setThinkingStage("Updating the preview…");
          },
        );

        if (!result) {
          throw new Error("Empty AI response");
        }

        // Server normalizes legacy {tool,params} → canonical {type} (EP-001).
        // Drop any non-canonical wire shape rather than client-side dialect translation.
        const rawActions = result.actions || [];
        const rawCanonical = rawActions.filter(
            (a): a is CanonicalEditorAction =>
              Boolean(a) &&
              typeof a === "object" &&
              typeof (a as CanonicalEditorAction).type === "string",
          );
        const dispatchActions = rawCanonical
          .map((a) => canonicalToDispatchEnvelope(a));

        if (rawCanonical.length > 0) {
          applyAiEdits(rawCanonical);
          setRecentActions((prev) =>
            [...prev, ...rawCanonical.map((x) => x.type)].slice(-8),
          );
        }

        // EP-004 — Kernel commit from already-planned actions (no second LLM call).
        // NEXT_PUBLIC_* is build-time; capture once so we never half-enter Kernel path.
        let receipt = "";
        let integrityStatus: string | null = null;
        const kernelEnabled = isStudioProjectKernelEnabled();
        const directorLoop = result.model_used === "decision-intelligence";
        if (kernelEnabled && (dispatchActions.length > 0 || directorLoop)) {
          try {
            const { ensureStudioProject, fetchStudioHead } = await import(
              "@/lib/studio/projectKernel"
            );
            if (!isStudioProjectKernelEnabled()) {
              // Defensive: never touch Kernel store fields if flag flipped off in tests
              receipt = " · Preview only (Kernel disabled)";
              setKernelSyncState("preview");
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
              const plan = directorLoop
                ? await orchestratorPlan({
                    source: "chat",
                    decision_gate: true,
                    intent_text: trimmed,
                    project_id: projectId,
                    project_context,
                  })
                : await orchestratorPlan({
                    source: "chat",
                    intent_text: trimmed,
                    project_id: projectId,
                    structured_steps,
                  });
              useEditorStore.getState().rebuildRenderManifest();
              const st = useEditorStore.getState();
              const executable =
                !directorLoop || plan?.decision_mode === "ACT";
              if (
                executable &&
                plan?.plan_id &&
                st.compiledManifest &&
                projectId &&
                plan.steps?.length
              ) {
                const executed = (await orchestratorExecute({
                  plan_id: plan.plan_id,
                  project_id: projectId,
                  base_revision: st.studioAckedRevision,
                  base_snapshot_hash: st.studioSnapshotHash,
                  proposed_manifest: st.compiledManifest,
                })) as OrchestratorPlanResult;
                integrityStatus =
                  executed?.execution_integrity?.status ||
                  executed?.status ||
                  null;
                const head = await fetchStudioHead(projectId);
                useEditorStore.setState({
                  studioAckedRevision: head.revision,
                  studioSnapshotHash: head.snapshot_hash,
                });
                const accepted = (executed?.steps ?? []).filter(
                  (s) => s.status === "accepted",
                ).length;
                if (accepted > 0) {
                  receipt = ` · Saved to project (r${head.revision})`;
                  setKernelSyncState("saved");
                } else if (executed?.status === "failed") {
                  receipt = " · Preview only — project save rejected";
                  setKernelSyncState("preview");
                } else {
                  receipt = " · Preview only — project steps skipped";
                  setKernelSyncState("preview");
                }
              } else if (directorLoop && plan?.decision_mode && plan.decision_mode !== "ACT") {
                receipt = ` · ${plan.decision_mode} — no project mutation`;
                setKernelSyncState("preview");
              } else {
                receipt = " · Preview applied";
                setKernelSyncState("preview");
              }
            }
          } catch {
            // Honesty: local preview may have applied; server authority did not ack
            receipt =
              " · Preview only — project sync failed; export may not include this edit until you retry";
            setKernelSyncState("sync_failed");
          }
        } else if (dispatchActions.length > 0) {
          receipt = " · Preview applied (not yet saved to project)";
          setKernelSyncState("preview");
        }

        const honest = formatCommandFeedback({
          appliedTypes: rawCanonical.map((a) => a.type),
          message: result.feedback || result.message,
          clamped: result.clamped,
          dropped: result.dropped,
          status: result.status,
          decisionMode: result.decision_mode,
          unresolved: result.unresolved,
          integrityStatus,
        });
        addAIMessage({
          role: "assistant",
          content: `${honest}${receipt}`,
          actions: dispatchActions,
        });

        const nextChips = (result.suggestions || [])
          .map((s) => String(s).trim())
          .filter(Boolean)
          .slice(0, 3);
        setFollowUpChips(nextChips);

        // Refresh grounded rail after a successful turn.
        setSuggestionsLoaded(false);
        if (session?.user?.id) {
          getStats(session.user.id)
            .then((stats) => setCreditBalance(stats.credits_balance))
            .catch(() => undefined);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const status =
          err instanceof AiEditorCommandError
            ? err.status
            : err instanceof AuthenticatedFetchError
              ? err.status
              : axios.isAxiosError(err)
                ? err.response?.status
                : err &&
                  typeof err === "object" &&
                  "status" in err &&
                  typeof (err as { status: unknown }).status === "number"
                  ? (err as { status: number }).status
                  : undefined;
        const body =
          err instanceof AiEditorCommandError
            ? err.body
            : err instanceof AuthenticatedFetchError
              ? err.body
              : axios.isAxiosError(err)
                ? err.response?.data
                : undefined;
        const kind =
          err instanceof AiEditorCommandError ? err.kind : undefined;
        const retryAfter =
          err instanceof AiEditorCommandError
            ? err.retryAfterSeconds
            : undefined;
        const mapped = mapAiEditorError({
          status,
          message: errMsg,
          kind,
          retryAfterSeconds: retryAfter,
          body,
        });

        addAIMessage({
          role: "assistant",
          content: mapped.message,
          actions: [],
        });
        if (mapped.kind === "credits" && session?.user?.id) {
          getStats(session.user.id)
            .then((stats) => setCreditBalance(stats.credits_balance))
            .catch(() => setCreditBalance(0));
        }
      } finally {
        setAIThinking(false);
      }
    },
    [
      isAIThinking,
      creditBalance,
      mockAiMode,
      applyAiEdits,
      stopRecording,
      addAIMessage,
      setAIThinking,
      dispatchAIActions,
      videoMetadata,
      videoAnalysis,
      editorState,
      selectedClipId,
      currentTime,
      exportSettings.aspectRatio,
      runId,
      transcript,
      captions,
      silenceSegments,
      aiSuggestions.viralMoments,
      session,
    ],
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
  const transcriptReady = (transcript?.chunks?.length ?? 0) > 0;
  const creditsExhausted =
    !shouldSkipCreditGate(mockAiMode) && creditBalance !== null && creditBalance <= 0;
  const canSendChat =
    isVideoLoaded &&
    transcriptReady &&
    !isAIThinking &&
    !creditsExhausted &&
    !!inputText.trim();

  // Shared chat body — rendered in exactly one housing at a time
  // (desktop docked column XOR mobile bottom sheet).
  const panelBody = (
    <>
      {/* ── Header ──────────────────────────────────────────────── */}
      {circuitBanner && (
        <div
          className="px-3 py-2 text-[11px] leading-snug border-b border-amber-500/30 bg-amber-500/10 text-amber-100"
          role="status"
          aria-live="polite"
        >
          {circuitBanner}
        </div>
      )}
      <div className="ai-panel-header">
        <div className="ai-header-left">
          {/* Gem badge */}
          <div className="ai-header-gem">✦</div>
          <span className="ai-panel-title">Chat</span>
        </div>

        <div className="ai-header-right">
          {creditBalance !== null && (
            <Link
              href="/pricing"
              className={cn(
                "text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md border transition-colors",
                creditBalance <= 0
                  ? "border-amber-500/40 text-amber-300 bg-amber-500/10"
                  : "border-border text-fg-muted hover:text-foreground",
              )}
              title="Credits remaining"
            >
              {creditBalance} cr
            </Link>
          )}
          {kernelSyncState === "saved" && (
            <span className="text-[9px] uppercase tracking-wider text-emerald-400/90">
              Saved
            </span>
          )}
          {kernelSyncState === "preview" && (
            <span className="text-[9px] uppercase tracking-wider text-amber-300/90">
              Preview
            </span>
          )}
          {kernelSyncState === "sync_failed" && (
            <span className="text-[9px] uppercase tracking-wider text-rose-300/90">
              Re-sync
            </span>
          )}
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
            aria-label="Close Chat"
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
        <span className="text-12 text-fg-muted font-medium truncate">
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
            <span className="text-12 font-black uppercase tracking-[0.12em] text-fg-subtle self-center">Active</span>
            {tags.map((t) => (
              <span key={t} className="text-12 font-bold px-2 py-0.5 rounded-full bg-muted border border-border text-fg-muted">
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
          <EmptyState
            icon={Sparkles}
            title={isVideoLoaded ? "Tell me what to edit" : "Load a video first"}
            body={
              isVideoLoaded
                ? "I'll apply your edits directly to the timeline."
                : "Upload a video or paste a YouTube URL to get started."
            }
            size="md"
            className="border-0 bg-transparent py-10 px-4"
          />
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
            <ThinkingBubble stageLabel={thinkingStage} />
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Suggestion chips (grounded + post-reply follow-ups) ─────────── */}
      {(suggestions.length > 0 ||
        followUpChips.length > 0 ||
        showExportFinalChip) && (
        <div
          className="suggestions-rail"
          data-tour-id="ai.suggestions"
          role="list"
          aria-label="Grounded edit suggestions"
        >
          {showExportFinalChip && (
            <button
              key="export-final"
              className={cn(
                "suggestion-chip suggestion-chip--export",
                reduceMotion && "suggestion-chip--reduced-motion",
              )}
              type="button"
              role="listitem"
              onClick={() => {
                dispatchAIActions([{ type: "EXPORT_CLIP", payload: {} }]);
                addAIMessage({
                  role: "assistant",
                  content: "Opening final export…",
                  actions: [{ type: "EXPORT_CLIP", payload: {} }],
                });
                setShowExportFinalChip(false);
              }}
              disabled={isAIThinking}
              aria-label="Export Final"
            >
              <span className="suggestion-chip-label">Export Final</span>
              <span className="suggestion-chip-evidence">
                Server render · preview stays
              </span>
            </button>
          )}
          {followUpChips.map((chip) => {
            const isExportChip = /^export\s*final$/i.test(chip.trim());
            return (
              <button
                key={`follow-${chip}`}
                className={cn(
                  "suggestion-chip",
                  isExportChip && "suggestion-chip--export",
                  reduceMotion && "suggestion-chip--reduced-motion",
                )}
                type="button"
                role="listitem"
                onClick={() => {
                  if (isExportChip) {
                    dispatchAIActions([{ type: "EXPORT_CLIP", payload: {} }]);
                    addAIMessage({
                      role: "assistant",
                      content: "Opening final export…",
                      actions: [{ type: "EXPORT_CLIP", payload: {} }],
                    });
                    return;
                  }
                  void sendMessage(chip);
                }}
                disabled={isAIThinking}
                aria-label={chip}
              >
                <span className="suggestion-chip-label">{chip}</span>
              </button>
            );
          })}
          {suggestions.map((s) =>
            s.interactive ? (
              <button
                key={s.suggestion_id}
                className={cn(
                  "suggestion-chip",
                  reduceMotion && "suggestion-chip--reduced-motion",
                )}
                type="button"
                role="listitem"
                title={s.evidence.summary}
                aria-label={`${s.label}. ${s.evidence.summary}`}
                onClick={() => void applyGroundedSuggestion(s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void applyGroundedSuggestion(s);
                  }
                }}
                disabled={isAIThinking}
              >
                <span className="suggestion-chip-label">{s.label}</span>
                {s.evidence.summary ? (
                  <span className="suggestion-chip-evidence">{s.evidence.summary}</span>
                ) : null}
              </button>
            ) : (
              <span
                key={s.suggestion_id}
                className={cn(
                  "suggestion-chip opacity-60 cursor-default pointer-events-none",
                  reduceMotion && "suggestion-chip--reduced-motion",
                )}
                role="listitem"
                title={s.evidence.summary}
                aria-disabled="true"
                aria-label={`${s.label}. ${s.evidence.summary}`}
              >
                <span className="suggestion-chip-label">{s.label}</span>
                {s.evidence.summary ? (
                  <span className="suggestion-chip-evidence">{s.evidence.summary}</span>
                ) : null}
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
            id="ai-chat-compose"
            className="ai-textarea"
            placeholder={
              !isVideoLoaded
                ? "Load a video to start editing…"
                : creditsExhausted
                  ? "Out of credits — upgrade to keep chatting…"
                  : isRecording
                    ? SPEECH_COPY.chatVoiceListening
                    : "Tell me what to edit… (Enter to send)"
            }
            value={inputText}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isAIThinking || !isVideoLoaded || creditsExhausted}
            aria-label="Chat edit command"
            aria-busy={isAIThinking}
            aria-describedby={creditsExhausted ? "ai-credits-exhausted" : undefined}
          />

          <button
            className={`voice-btn ${isRecording ? "voice-btn-active" : ""}`}
            onClick={toggleVoice}
            disabled={
              !isVideoLoaded ||
              creditsExhausted ||
              (!browserVoiceAvailable && !isRecording)
            }
            aria-pressed={isRecording}
            aria-label={
              isRecording
                ? "Stop browser voice"
                : browserVoiceAvailable
                  ? SPEECH_COPY.chatVoiceLabel
                  : SPEECH_COPY.chatVoiceUnsupported
            }
            title={
              creditsExhausted
                ? "Out of credits"
                : !browserVoiceAvailable
                  ? SPEECH_COPY.chatVoiceUnsupported
                  : isRecording
                    ? "Stop browser voice"
                    : SPEECH_COPY.chatVoiceLabel
            }
          >
            {isRecording ? <MicOff size={14} /> : <Mic size={14} />}
          </button>

          <button
            className="send-btn"
            onClick={() => sendMessage(inputText)}
            disabled={!canSendChat}
            aria-label="Send"
            title={
              creditsExhausted
                ? "Out of credits — upgrade on Pricing"
                : "Send (Enter)"
            }
          >
            <Send size={13} />
          </button>
        </div>

        {creditsExhausted && (
          <p id="ai-credits-exhausted" className="voice-error" role="status">
            No credits left —{" "}
            <Link href="/pricing" className="underline font-semibold">
              upgrade to Pro
            </Link>{" "}
            to keep editing. Your timeline is safe.
          </p>
        )}

        {voiceError && <p className="voice-error">{voiceError}</p>}

        {/* Keyboard hint */}
        <div className="flex items-center justify-between px-0.5">
          <span className="text-12 text-fg-subtle">
            Enter to send · Shift+Enter for new line
          </span>
          <span className="text-12 text-fg-subtle flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-12">Shift</kbd>
            <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-12">Alt</kbd>
            <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-12">A</kbd>
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
            aria-label="Chat"
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
              {...motionProps(reduceMotion, {
                initial: { opacity: 0 },
                animate: { opacity: 1 },
                exit: { opacity: 0 },
                transition: { duration: 0.2 },
              })}
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => setAIPanelOpen(false)}
              aria-hidden
            />
            <motion.div
              key="ai-sheet"
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-label="Chat"
              {...motionProps(reduceMotion, {
                initial: { y: "100%" },
                animate: { y: 0 },
                exit: { y: "100%" },
                transition: { type: "spring", damping: 30, stiffness: 300 },
              })}
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
