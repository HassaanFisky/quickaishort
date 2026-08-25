"""M0 Decision Intelligence — deterministic WHAT/WHY in front of Orchestrator.

Reads existing Project Document + MediaGraph. Does not call Gemini, does not
create Orchestrator plans, does not invoke Pre-Flight, does not invent facts.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from models.media_graph import FacetBlob, MediaGraph
from models.studio_decision import (
    CandidateAction,
    DecisionRecord,
    EvidenceItem,
    Objective,
    ObjectiveClass,
)
from models.studio_project import StudioProjectHead
from services.media_graph_service import SILENCE_SUGGEST_MIN_SEC, _silence_gaps
from services.tool_registry import is_emit_allowed

logger = logging.getLogger(__name__)

REMOVE_SILENCES_CAPABILITY = "REMOVE_SILENCES"
TOGGLE_CAPTIONS_CAPABILITY = "TOGGLE_CAPTIONS"
TRIM_CAPABILITY = "TRIM"
ADD_CAPTION_CAPABILITY = "ADD_CAPTION"
DEAD_AIR_PADDING_SEC = 0.05
DEFAULT_SHORT_DURATION_SEC = 45.0
MIN_SHORT_DURATION_SEC = 8.0
MAX_SHORT_DURATION_SEC = 90.0

_DEAD_AIR_OBJECTIVE_EXAMPLE = "remove unnecessary dead air and tighten the pacing"

_REVISE_OPENING = re.compile(
    r"(?:keep|restore|bring\s+back|uncut).{0,48}(?:original\s+)?opening"
    r"|(?:original\s+)?opening.{0,24}(?:back|original)"
    r"|(?:don'?t|do\s+not)\s+cut\s+(?:the\s+)?(?:opening|start|beginning)",
    re.I,
)
_DURATION_SEC = re.compile(
    r"\b(\d{1,3})\s*(?:s|sec|secs|second|seconds)\b",
    re.I,
)
_SHORT_PACK = re.compile(
    r"\b(?:youtube\s+shorts?|short-form|ig\s+reels?)\b"
    r"|\bshorts\b|\breels?\b|\btiktoks?\b",
    re.I,
)
_REFRAME = re.compile(
    r"\b(?:reframe|reframing|around the speaker|face[- ]track)\b",
    re.I,
)
_ARGUMENT = re.compile(
    r"strongest argument|best argument|keep the strongest|main argument",
    re.I,
)
_HOOK = re.compile(
    r"\b(?:first few seconds|opening hook|stronger (?:open(?:ing)?|hook|start))\b",
    re.I,
)
_TEMPLATE = re.compile(
    r"generic template|look like a template|template-y|cookie[- ]cutter",
    re.I,
)
_CAPTIONS_ON = re.compile(
    r"\b(?:add|enable|show|generate|turn\s+on)\b.{0,24}\b(?:caption|subtitle)",
    re.I,
)
_DEAD_AIR_NOUN = re.compile(r"dead[-\s]?air|\bsilences?\b", re.I)
_DEAD_AIR_VERB = re.compile(r"\b(?:remove|cut|trim|tighten|delete|strip)\b", re.I)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize(text: str) -> str:
    return " ".join(str(text or "").lower().split())


def _is_dead_air_intent(n: str) -> bool:
    tighten_pacing = "tighten" in n and "pac" in n
    return bool(
        tighten_pacing
        or ("dead air" in n or "dead-air" in n)
        or (_DEAD_AIR_NOUN.search(n) and _DEAD_AIR_VERB.search(n))
    )


def _has_director_packaging_signals(n: str) -> bool:
    """Compound shorts-director clauses — captions-only and generic N-seconds are NOT this class."""
    return bool(
        _SHORT_PACK.search(n)
        or _REFRAME.search(n)
        or _ARGUMENT.search(n)
        or _HOOK.search(n)
        or _TEMPLATE.search(n)
    )


def classify_objective(text: str) -> ObjectiveClass:
    """Deterministic objective class — no LLM."""
    n = _normalize(text)
    if not n:
        return "empty"
    if _REVISE_OPENING.search(n):
        return "revise_opening"
    is_dead_air = _is_dead_air_intent(n)
    packaging = _has_director_packaging_signals(n)
    captions_on = bool(_CAPTIONS_ON.search(n))
    # Captions alone stay DualModelRouter/semantic. Captions + dead-air is a pack.
    if packaging or (is_dead_air and captions_on):
        return "director_packaging"
    if is_dead_air:
        return "dead_air_pacing"
    return "unrelated"


def parse_duration_target_sec(text: str) -> Optional[float]:
    n = _normalize(text)
    match = _DURATION_SEC.search(n)
    if not match:
        if _SHORT_PACK.search(n):
            return DEFAULT_SHORT_DURATION_SEC
        return None
    try:
        value = float(match.group(1))
    except (TypeError, ValueError):
        return None
    if value < MIN_SHORT_DURATION_SEC or value > MAX_SHORT_DURATION_SEC:
        return None
    return value


def _eid() -> str:
    return uuid4().hex


def _usable_silence_gaps(blob: Optional[FacetBlob]) -> list[dict[str, float]]:
    """Return qualifying silence gaps from a ready facet. Never invents segments."""
    if blob is None or blob.status != "ready":
        return []
    raw = blob.data.get("segments") or []
    if not isinstance(raw, list):
        return []
    gaps = _silence_gaps(raw)
    return [g for g in gaps if (g["end"] - g["start"]) >= SILENCE_SUGGEST_MIN_SEC]


def collect_evidence(
    graph: Optional[MediaGraph],
    head: Optional[StudioProjectHead],
) -> list[EvidenceItem]:
    """Typed evidence from existing state only. Missing ≠ zero."""
    items: list[EvidenceItem] = []

    if head is not None:
        items.append(
            EvidenceItem(
                evidence_id=_eid(),
                kind="PROJECT_OBSERVATION",
                source="project_kernel",
                reference=head.project_id,
                summary=(
                    f"Project '{head.title}' revision={head.revision} "
                    f"status={head.status}"
                ),
                confidence=1.0,
            )
        )

    if graph is None:
        items.append(
            EvidenceItem(
                evidence_id=_eid(),
                kind="UNCERTAINTY",
                source="media_graph",
                reference="silence",
                summary="No MediaGraph available for this project",
                confidence=None,
            )
        )
        return items

    items.append(
        EvidenceItem(
            evidence_id=_eid(),
            kind="PROJECT_OBSERVATION",
            source="media_graph",
            reference=graph.graph_id,
            summary=f"MediaGraph status={graph.status} revision={graph.revision}",
            confidence=1.0,
        )
    )

    silence = graph.facets.get("silence")
    if silence is None:
        items.append(
            EvidenceItem(
                evidence_id=_eid(),
                kind="UNCERTAINTY",
                source="media_graph.facets",
                reference="silence",
                summary="Silence facet is missing — no dead-air evidence",
                confidence=None,
            )
        )
        return items

    if silence.status in {"missing", "pending"}:
        items.append(
            EvidenceItem(
                evidence_id=_eid(),
                kind="UNCERTAINTY",
                source="media_graph.facets",
                reference="silence",
                summary=f"Silence facet status={silence.status} — not usable yet",
                confidence=None,
            )
        )
        return items

    if silence.status == "error":
        items.append(
            EvidenceItem(
                evidence_id=_eid(),
                kind="UNCERTAINTY",
                source="media_graph.facets",
                reference="silence",
                summary=(
                    "Silence facet error"
                    + (f": {silence.error}" if silence.error else "")
                ),
                confidence=None,
            )
        )
        return items

    gaps = _usable_silence_gaps(silence)
    items.append(
        EvidenceItem(
            evidence_id=_eid(),
            kind="PROJECT_OBSERVATION",
            source="media_graph.facets",
            reference="silence",
            summary=(
                f"Silence facet ready; {len(gaps)} gap(s) ≥ "
                f"{SILENCE_SUGGEST_MIN_SEC}s"
            ),
            confidence=1.0,
        )
    )
    return items


def _silence_facet_status(graph: Optional[MediaGraph]) -> Optional[str]:
    if graph is None:
        return None
    blob = graph.facets.get("silence")
    if blob is None:
        return None
    return blob.status


def _assert_no_inference_as_fact(items: list[EvidenceItem]) -> None:
    for item in items:
        if item.kind == "VERIFIED_FACT" and item.source in {
            "media_graph",
            "media_graph.facets",
        }:
            raise ValueError("media observation must not be stored as VERIFIED_FACT")


def _build_objective(text: str, project_id: Optional[str]) -> Objective:
    cls = classify_objective(text)
    criteria: list[str] = []
    if cls == "dead_air_pacing":
        criteria = [
            "Remove qualifying silent gaps from the timeline",
            "Do not invent silence that is not in MediaGraph",
        ]
    elif cls == "director_packaging":
        criteria = [
            "Execute only emit-allowed capabilities backed by existing evidence",
            "Do not invent strongest-argument or speaker-reframe without facets",
            "Leave unresolved clauses honest instead of hallucinating a full short",
        ]
    elif cls == "revise_opening":
        criteria = [
            "Restore the in-point of the current project cut when a TRIM exists",
            "Do not create a second unrelated project",
        ]
    return Objective(
        objective_id=_eid(),
        text=text,
        project_id=project_id,
        created_at=_now(),
        medium_hints=["video"] if cls != "unrelated" else [],
        success_criteria=criteria,
        objective_class=cls,
    )


def _record(
    *,
    objective: Objective,
    mode: Any,
    evidence: list[EvidenceItem],
    missing: list[str],
    rationale: str,
    candidates: Optional[list[CandidateAction]] = None,
    verification_plan: Optional[str] = None,
) -> DecisionRecord:
    _assert_no_inference_as_fact(evidence)
    return DecisionRecord(
        decision_id=_eid(),
        project_id=objective.project_id,
        objective=objective,
        mode=mode,
        evidence=evidence,
        missing_information=missing,
        rationale=rationale,
        candidate_actions=candidates or [],
        verification_plan=verification_plan,
        plan_id=None,
        actor="system",
        created_at=_now(),
        gemini_called=False,
        credits_charged=0,
    )


def _remove_silences_candidate(
    gaps: list[dict[str, float]],
) -> Optional[CandidateAction]:
    if not gaps or not is_emit_allowed(REMOVE_SILENCES_CAPABILITY):
        return None
    return CandidateAction(
        capability_id=REMOVE_SILENCES_CAPABILITY,
        params={
            "min_silence_sec": SILENCE_SUGGEST_MIN_SEC,
            "padding_sec": DEAD_AIR_PADDING_SEC,
            "segments": [
                {"start": g["start"], "end": g["end"], "type": "silence"} for g in gaps
            ],
        },
        label="Remove qualifying dead air",
    )


def _dead_air_block(
    *,
    objective: Objective,
    evidence: list[EvidenceItem],
    graph: Optional[MediaGraph],
) -> Optional[DecisionRecord]:
    """Return a blocking ASK/RESEARCH record, or None if ACT is allowed."""
    status = _silence_facet_status(graph)
    if graph is None or status is None:
        return _record(
            objective=objective,
            mode="ASK",
            evidence=evidence,
            missing=["MediaGraph silence facet"],
            rationale=(
                "Dead-air objective requires silence evidence; none is present. "
                "Do not invent gaps or analytics."
            ),
        )
    if status == "pending":
        return _record(
            objective=objective,
            mode="RESEARCH",
            evidence=evidence,
            missing=["completed silence analysis (facet still pending)"],
            rationale=(
                "Silence analysis is in progress. Research/wait for the facet; "
                "do not invent dead-air timestamps."
            ),
        )
    if status in {"missing", "error"}:
        return _record(
            objective=objective,
            mode="ASK",
            evidence=evidence,
            missing=["usable silence facet"],
            rationale=(
                f"Silence facet is {status}. Represent uncertainty; "
                "do not fabricate silence segments."
            ),
        )
    gaps = _usable_silence_gaps(graph.facets.get("silence") if graph else None)
    if not gaps:
        return _record(
            objective=objective,
            mode="ASK",
            evidence=evidence,
            missing=[f"silence gaps ≥ {SILENCE_SUGGEST_MIN_SEC}s in ready facet"],
            rationale=(
                "Silence facet is ready but no qualifying dead-air gaps were "
                "observed. Not an ACT."
            ),
        )
    if not is_emit_allowed(REMOVE_SILENCES_CAPABILITY):
        return _record(
            objective=objective,
            mode="ASK",
            evidence=evidence,
            missing=["orchestrator-emit for REMOVE_SILENCES"],
            rationale="Capability is not emit-allowed; refusing to plan it",
        )
    return None


def _media_duration_sec(
    graph: Optional[MediaGraph],
    project_context: Optional[dict[str, Any]],
) -> float:
    if graph is not None:
        blob = graph.facets.get("duration")
        if blob is not None and blob.status == "ready":
            try:
                value = float(blob.data.get("seconds") or 0)
                if value > 0:
                    return value
            except (TypeError, ValueError):
                pass
    ctx = project_context or {}
    for key in ("videoDuration", "duration"):
        try:
            value = float(ctx.get(key) or 0)
        except (TypeError, ValueError):
            continue
        if value > 0:
            return value
    return 0.0


def _transcript_chunks(graph: Optional[MediaGraph]) -> list[dict[str, Any]]:
    if graph is None:
        return []
    blob = graph.facets.get("transcript")
    if blob is None or blob.status != "ready":
        return []
    from services.media_graph_service import _chunk_list

    return _chunk_list(blob.data)


def _best_viral_window(
    graph: Optional[MediaGraph],
    target_sec: float,
    duration_sec: float,
) -> Optional[tuple[float, float, str]]:
    if graph is None:
        return None
    blob = graph.facets.get("viral_moments")
    if blob is None or blob.status != "ready":
        return None
    raw = blob.data.get("moments") or []
    if not isinstance(raw, list) or not raw:
        return None
    best: Optional[dict[str, Any]] = None
    best_score = -1.0
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            score = float(item.get("score") or 0)
            start = float(item.get("start") or item.get("timestamp") or 0)
            end = float(item.get("end") or (start + 8.0))
        except (TypeError, ValueError):
            continue
        if end <= start:
            continue
        if score > best_score:
            best_score = score
            best = {"start": start, "end": end, "score": score}
    if best is None:
        return None
    start = max(0.0, float(best["start"]))
    end = start + target_sec
    if duration_sec > 0:
        end = min(duration_sec, end)
        if end - start < target_sec and start > 0:
            start = max(0.0, end - target_sec)
    if end <= start:
        return None
    return (
        start,
        end,
        f"Highest scored moment ({int(best_score)}) in MediaGraph viral_moments",
    )


def _densest_speech_window(
    graph: Optional[MediaGraph],
    target_sec: float,
    duration_sec: float,
) -> Optional[tuple[float, float, str]]:
    chunks = _transcript_chunks(graph)
    if not chunks:
        return None
    from services.media_graph_service import _densest_window

    densest = _densest_window(chunks, window_sec=min(12.0, target_sec))
    if not densest:
        return None
    start = max(0.0, float(densest["start"]))
    end = start + target_sec
    if duration_sec > 0:
        end = min(duration_sec, end)
        if end - start < min(target_sec, duration_sec) and start > 0:
            start = max(0.0, end - target_sec)
    if end <= start:
        return None
    return (
        start,
        end,
        "Densest speech window from transcript — not a semantic argument score",
    )


def _hook_caption_candidate(graph: Optional[MediaGraph]) -> Optional[CandidateAction]:
    if not is_emit_allowed(ADD_CAPTION_CAPABILITY):
        return None
    chunks = _transcript_chunks(graph)
    if not chunks:
        return None
    from services.media_graph_service import _hook_chunk

    hook = _hook_chunk(chunks)
    if hook is None or not str(hook.get("text") or "").strip():
        return None
    text = str(hook["text"]).strip()[:120]
    start = float(hook["start"])
    end = max(start + 2.5, float(hook["end"]))
    return CandidateAction(
        capability_id=ADD_CAPTION_CAPABILITY,
        params={"text": text, "startTime": start, "endTime": min(end, start + 5.0)},
        label="Opening hook caption from transcript",
    )


def _decide_dead_air(
    objective: Objective,
    evidence: list[EvidenceItem],
    graph: Optional[MediaGraph],
) -> DecisionRecord:
    blocked = _dead_air_block(objective=objective, evidence=evidence, graph=graph)
    if blocked is not None:
        return blocked
    gaps = _usable_silence_gaps(graph.facets.get("silence") if graph else None)
    cap_fact = EvidenceItem(
        evidence_id=_eid(),
        kind="VERIFIED_FACT",
        source="capability_registry",
        reference=REMOVE_SILENCES_CAPABILITY,
        summary="REMOVE_SILENCES is registry-wired and orchestrator_emit=true",
        confidence=1.0,
    )
    candidate = _remove_silences_candidate(gaps)
    return _record(
        objective=objective,
        mode="ACT",
        evidence=[*evidence, cap_fact],
        missing=[],
        rationale=(
            f"Ready silence evidence shows {len(gaps)} qualifying gap(s). "
            "Deterministic ACT via existing REMOVE_SILENCES. 0 Gemini, 0 credits. "
            "Orchestrator gated plan may authorize steps when decision_gate=true."
        ),
        candidates=[candidate] if candidate else [],
        verification_plan=(
            "Tier 0: if/when executed, every REMOVE_SILENCES step must be "
            "Kernel-accepted; skipped/rejected steps are execution_partial/"
            "execution_failed. Plan completion is not objective success."
        ),
    )


def _decide_director(
    objective: Objective,
    evidence: list[EvidenceItem],
    graph: Optional[MediaGraph],
    project_context: Optional[dict[str, Any]],
) -> DecisionRecord:
    n = _normalize(objective.text)
    missing: list[str] = []
    rationale_bits: list[str] = []
    candidates: list[CandidateAction] = []
    duration_sec = _media_duration_sec(graph, project_context)

    if _is_dead_air_intent(n):
        blocked = _dead_air_block(objective=objective, evidence=evidence, graph=graph)
        if blocked is not None:
            # Compound: keep other mechanical clauses; silence stays unresolved.
            missing.extend(blocked.missing_information)
            rationale_bits.append(blocked.rationale)
        else:
            gaps = _usable_silence_gaps(graph.facets.get("silence") if graph else None)
            action = _remove_silences_candidate(gaps)
            if action:
                candidates.append(action)
                rationale_bits.append(
                    f"Dead air: ACT REMOVE_SILENCES ({len(gaps)} gap(s))."
                )

    if _CAPTIONS_ON.search(n) and is_emit_allowed(TOGGLE_CAPTIONS_CAPABILITY):
        already_on = bool((project_context or {}).get("captionsEnabled", True))
        if already_on:
            rationale_bits.append("Captions are already on — no TOGGLE_CAPTIONS.")
        else:
            candidates.append(
                CandidateAction(
                    capability_id=TOGGLE_CAPTIONS_CAPABILITY,
                    params={"enabled": True},
                    label="Turn captions on",
                )
            )
            rationale_bits.append("Captions: ACT TOGGLE_CAPTIONS enabled.")

    wants_argument = bool(_ARGUMENT.search(n))
    target = parse_duration_target_sec(objective.text)
    if target is not None and is_emit_allowed(TRIM_CAPABILITY):
        window = None
        if wants_argument:
            window = _best_viral_window(graph, target, duration_sec)
            if window is None:
                window = _densest_speech_window(graph, target, duration_sec)
            if window is None:
                missing.append(
                    "clip/viral/transcript evidence for strongest-argument window"
                )
                rationale_bits.append(
                    f"Need evidence to pick a {int(target)}s argument window — "
                    "not trimming 0–N."
                )
            else:
                start, end, why = window
                candidates.append(
                    CandidateAction(
                        capability_id=TRIM_CAPABILITY,
                        params={"start": round(start, 3), "end": round(end, 3)},
                        label=f"Trim to {int(end - start)}s evidence window",
                    )
                )
                rationale_bits.append(f"Duration: ACT TRIM ({why}).")
                evidence = [
                    *evidence,
                    EvidenceItem(
                        evidence_id=_eid(),
                        kind="PROJECT_OBSERVATION",
                        source="media_graph.facets",
                        reference="argument_window",
                        summary=why,
                        confidence=1.0,
                    ),
                ]
        elif duration_sec > 0:
            end = min(duration_sec, target)
            if end >= MIN_SHORT_DURATION_SEC:
                candidates.append(
                    CandidateAction(
                        capability_id=TRIM_CAPABILITY,
                        params={"start": 0.0, "end": round(end, 3)},
                        label=f"Trim to {int(end)}s",
                    )
                )
                rationale_bits.append(
                    f"Duration: ACT TRIM 0–{end:.1f}s (mechanical; no argument clause)."
                )
        else:
            missing.append("media duration for a 45s-class trim")
            rationale_bits.append("Duration target known but media duration is missing.")

    if _HOOK.search(n):
        hook = _hook_caption_candidate(graph)
        if hook is not None:
            candidates.append(hook)
            rationale_bits.append("Opening: ACT ADD_CAPTION from first transcript hook.")
        else:
            missing.append("transcript hook text for a stronger opening caption")
            rationale_bits.append(
                "Cannot strengthen the first seconds without transcript evidence."
            )

    if _REFRAME.search(n):
        missing.append("wired AUTO_REFRAME (registry emit=false / preview refuses)")
        rationale_bits.append(
            "Speaker reframe is not a wired emit capability — not faking a crop."
        )

    if _TEMPLATE.search(n):
        rationale_bits.append(
            "Template constraint noted — no cinematic/urban preset will be applied."
        )

    if not candidates:
        mode = "RESEARCH" if any("pending" in m for m in missing) else "ASK"
        return _record(
            objective=objective,
            mode=mode,
            evidence=evidence,
            missing=missing or ["evidence-backed director clauses"],
            rationale=" ".join(rationale_bits)
            or "Director packaging has no executable evidence-backed steps.",
        )

    emit_ids = {c.capability_id for c in candidates}
    for cid in emit_ids:
        evidence.append(
            EvidenceItem(
                evidence_id=_eid(),
                kind="VERIFIED_FACT",
                source="capability_registry",
                reference=cid,
                summary=f"{cid} is registry-wired and orchestrator_emit=true",
                confidence=1.0,
            )
        )

    if missing:
        rationale_bits.append("Unresolved clauses stay ASK — not invented.")

    return _record(
        objective=objective,
        mode="ACT",
        evidence=evidence,
        missing=missing,
        rationale=" ".join(rationale_bits)
        + " 0 Gemini, 0 credits. Plan completion is not objective success.",
        candidates=candidates,
        verification_plan=(
            "Tier 0: Kernel-accepted mutating steps with event_ids. "
            "Client proposed_manifest is not proof the short succeeded. "
            "Unresolved clauses must remain visible."
        ),
    )


def _marks_from_context(
    project_context: Optional[dict[str, Any]],
) -> tuple[Optional[float], Optional[float]]:
    ctx = project_context or {}
    marks = ctx.get("marks") if isinstance(ctx.get("marks"), dict) else {}
    start = ctx.get("markIn")
    end = ctx.get("markOut")
    if start is None and isinstance(marks, dict):
        start = marks.get("markIn")
    if end is None and isinstance(marks, dict):
        end = marks.get("markOut")
    try:
        start_f = float(start) if start is not None else None
    except (TypeError, ValueError):
        start_f = None
    try:
        end_f = float(end) if end is not None else None
    except (TypeError, ValueError):
        end_f = None
    return start_f, end_f


def _decide_revise_opening(
    objective: Objective,
    evidence: list[EvidenceItem],
    prior: Optional[DecisionRecord],
    project_context: Optional[dict[str, Any]],
) -> DecisionRecord:
    if not is_emit_allowed(TRIM_CAPABILITY):
        return _record(
            objective=objective,
            mode="ASK",
            evidence=evidence,
            missing=["orchestrator-emit for TRIM"],
            rationale="Cannot restore the opening — TRIM is not emit-allowed.",
        )

    last_trim: Optional[dict[str, Any]] = None
    if prior is not None:
        for action in prior.candidate_actions:
            if action.capability_id == TRIM_CAPABILITY:
                last_trim = dict(action.params)
        evidence.append(
            EvidenceItem(
                evidence_id=_eid(),
                kind="PROJECT_OBSERVATION",
                source="decision_store",
                reference=prior.decision_id,
                summary=(
                    f"Prior decision {prior.decision_id} mode={prior.mode} "
                    f"with {len(prior.candidate_actions)} candidate(s)"
                ),
                confidence=1.0,
            )
        )

    mark_in, mark_out = _marks_from_context(project_context)
    start = None
    end = None
    if last_trim is not None:
        try:
            start = float(last_trim.get("start", 0))
            end = float(last_trim.get("end", 0))
        except (TypeError, ValueError):
            start, end = None, None
    if (start is None or end is None or end <= start) and mark_in is not None:
        start = mark_in
        end = mark_out

    if start is None or end is None or end <= 0:
        return _record(
            objective=objective,
            mode="ASK",
            evidence=evidence,
            missing=["prior TRIM or mark-in on this project"],
            rationale=(
                "No opening trim is recorded on this project to restore. "
                "Not inventing a second cut."
            ),
        )

    if start <= 0.05:
        return _record(
            objective=objective,
            mode="NOTHING",
            evidence=evidence,
            missing=[],
            rationale="Opening in-point is already at 0 — nothing to restore.",
        )

    duration_sec = _media_duration_sec(None, project_context)
    restored_end = end if end > 0.05 else (duration_sec or end)
    return _record(
        objective=objective,
        mode="ACT",
        evidence=evidence,
        missing=[],
        rationale=(
            f"Restoring in-point from {start:.2f}s to 0 on the existing project. "
            "Duration may exceed the previous short target. 0 Gemini."
        ),
        candidates=[
            CandidateAction(
                capability_id=TRIM_CAPABILITY,
                params={"start": 0.0, "end": round(float(restored_end), 3)},
                label="Restore original opening",
            )
        ],
        verification_plan=(
            "Tier 0: TRIM event start must be 0. Not proof the creative opening "
            "is 'better' — only that the in-point was restored."
        ),
    )


def decide_from_state(
    text: str,
    *,
    project_id: Optional[str] = None,
    graph: Optional[MediaGraph] = None,
    head: Optional[StudioProjectHead] = None,
    project_context: Optional[dict[str, Any]] = None,
    prior_decision: Optional[DecisionRecord] = None,
) -> DecisionRecord:
    """Pure decision from already-loaded Kernel/MediaGraph state. 0 Gemini."""
    objective = _build_objective(text, project_id)
    evidence = collect_evidence(graph, head)

    if objective.objective_class == "empty":
        return _record(
            objective=objective,
            mode="NOTHING",
            evidence=evidence,
            missing=["objective text"],
            rationale="Empty objective — nothing to decide or execute",
        )

    if objective.objective_class == "unrelated":
        return _record(
            objective=objective,
            mode="ASK",
            evidence=evidence,
            missing=["actionable objective matching a known deterministic path"],
            rationale=(
                "Objective is not a deterministic director/dead-air/revise path; "
                "ask the user to clarify rather than guessing tools"
            ),
        )

    if objective.objective_class == "revise_opening":
        return _decide_revise_opening(
            objective, evidence, prior_decision, project_context
        )

    if objective.objective_class == "director_packaging":
        return _decide_director(objective, evidence, graph, project_context)

    return _decide_dead_air(objective, evidence, graph)


async def resolve_objective(
    user_id: str,
    text: str,
    project_id: Optional[str] = None,
    *,
    graph: Optional[MediaGraph] = None,
    head: Optional[StudioProjectHead] = None,
    project_context: Optional[dict[str, Any]] = None,
) -> DecisionRecord:
    """Load existing Kernel/MediaGraph when not injected, then decide.

    Injected graph/head skip I/O (tests). Never calls ensure_for_project
    (that would create an empty graph). Never calls Gemini.
    """
    loaded_head = head
    loaded_graph = graph
    prior: Optional[DecisionRecord] = None

    # I/O only when caller did not inject state (tests pass graph/head).
    if project_id and graph is None and head is None:
        loaded_head, loaded_graph = await load_project_graph_for_decision(
            user_id, project_id
        )

    if project_id and user_id:
        try:
            from services.decision_store import get_latest

            prior = get_latest(user_id, project_id)
        except Exception:  # noqa: BLE001
            prior = None

    record = decide_from_state(
        text,
        project_id=project_id,
        graph=loaded_graph,
        head=loaded_head,
        project_context=project_context,
        prior_decision=prior,
    )
    if project_id and user_id:
        try:
            from services.decision_store import put_latest

            put_latest(user_id, project_id, record)
        except Exception:  # noqa: BLE001
            pass
    logger.info(
        "decision_resolved decision_id=%s mode=%s class=%s gemini=%s credits=%s",
        record.decision_id,
        record.mode,
        record.objective.objective_class,
        record.gemini_called,
        record.credits_charged,
    )
    return record


async def _find_graph_without_create(
    svc: Any, user_id: str, project_id: str
) -> Optional[MediaGraph]:
    """Lookup only — must not create a MediaGraph."""
    import asyncio

    return await asyncio.to_thread(svc.store.find_by_project, user_id, project_id)


async def load_project_graph_for_decision(
    user_id: str,
    project_id: str,
    *,
    head: Optional[StudioProjectHead] = None,
) -> tuple[Optional[StudioProjectHead], Optional[MediaGraph]]:
    """Load Kernel head + MediaGraph without ensure_for_project. 0 Gemini."""
    from services.project_kernel import get_project_kernel
    from services.media_graph_service import get_media_graph_service

    loaded_head = head
    if loaded_head is None:
        loaded_head = await get_project_kernel().get_head(project_id, user_id)

    svc = get_media_graph_service()
    graph_id = loaded_head.media_graph_id if loaded_head else None
    if graph_id:
        loaded_graph = await svc.get(graph_id, user_id)
    else:
        loaded_graph = await _find_graph_without_create(svc, user_id, project_id)
    return loaded_head, loaded_graph


def _segment_key_set(segments: Any) -> Optional[set[tuple[float, float]]]:
    """Parse silence segments to (start, end) keys. None = unreadable (missing ≠ empty)."""
    if not isinstance(segments, list):
        return None
    keys: set[tuple[float, float]] = set()
    for seg in segments:
        if not isinstance(seg, dict):
            return None
        try:
            keys.add((round(float(seg["start"]), 6), round(float(seg["end"]), 6)))
        except (KeyError, TypeError, ValueError):
            return None
    return keys


def verify_remove_silences_params_against_graph(
    params: dict[str, Any],
    graph: Optional[MediaGraph],
) -> tuple[bool, str]:
    """Deterministic Tier 0 — every segment must exist in ready silence evidence."""
    segments = params.get("segments") or []
    intended = _segment_key_set(segments)
    if intended is None:
        return False, "invalid_segments"
    if not intended:
        return False, "no_segments_to_remove"
    if graph is None:
        return False, "no_mediagraph_for_verify"
    silence = graph.facets.get("silence")
    if silence is None or silence.status != "ready":
        return False, "silence_evidence_unavailable"
    gaps = _usable_silence_gaps(silence)
    gap_set = {(round(g["start"], 6), round(g["end"], 6)) for g in gaps}
    for key in intended:
        if key not in gap_set:
            return False, "segment_not_in_evidence"
    return True, ""


def candidate_matches_project_event(
    capability_id: str,
    intended_params: dict[str, Any],
    event: Any,
) -> tuple[bool, str]:
    """Compare intended CandidateAction vs a Kernel ProjectEvent. Missing ≠ match.

    Does not read proposed_manifest or invent MediaGraph fields.
    """
    if event is None:
        return False, "kernel_event_missing"
    ev_cap = getattr(event, "capability_id", None)
    if ev_cap != capability_id:
        return False, "kernel_event_capability_mismatch"
    op = getattr(event, "op", None)
    op_params = getattr(op, "params", None) if op is not None else None
    if not isinstance(op_params, dict):
        return False, "kernel_event_params_missing"
    if capability_id == TRIM_CAPABILITY:
        try:
            intended_start = round(float(intended_params.get("start", 0)), 3)
            intended_end = round(float(intended_params.get("end", 0)), 3)
            actual_start = round(float(op_params.get("start", 0)), 3)
            actual_end = round(float(op_params.get("end", 0)), 3)
        except (TypeError, ValueError):
            return False, "trim_params_unreadable"
        if intended_start != actual_start or intended_end != actual_end:
            return False, "kernel_event_trim_mismatch"
        return True, ""
    if capability_id == TOGGLE_CAPTIONS_CAPABILITY:
        if bool(op_params.get("enabled")) != bool(intended_params.get("enabled")):
            return False, "kernel_event_captions_mismatch"
        return True, ""
    if capability_id != REMOVE_SILENCES_CAPABILITY:
        return True, ""
    intended = _segment_key_set(intended_params.get("segments"))
    actual = _segment_key_set(op_params.get("segments"))
    if intended is None:
        return False, "intended_segments_unreadable"
    if actual is None:
        return False, "kernel_event_segments_missing"
    if intended != actual:
        return False, "kernel_event_segments_mismatch"
    return True, ""
