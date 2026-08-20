"""M0 Decision Intelligence — deterministic WHAT/WHY in front of Orchestrator.

Reads existing Project Document + MediaGraph. Does not call Gemini, does not
create Orchestrator plans, does not invoke Pre-Flight, does not invent facts.
"""

from __future__ import annotations

import logging
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
DEAD_AIR_PADDING_SEC = 0.05

_DEAD_AIR_OBJECTIVE_EXAMPLE = (
    "remove unnecessary dead air and tighten the pacing"
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize(text: str) -> str:
    return " ".join(str(text or "").lower().split())


def classify_objective(text: str) -> ObjectiveClass:
    """Deterministic objective class — no LLM."""
    n = _normalize(text)
    if not n:
        return "empty"
    dead_air = "dead air" in n or "dead-air" in n
    silence = "silence" in n or "silences" in n
    remove = "remove" in n or "cut" in n
    tighten_pacing = "tighten" in n and "pac" in n
    if dead_air or (silence and remove) or tighten_pacing:
        return "dead_air_pacing"
    return "unrelated"


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
    return [
        g
        for g in gaps
        if (g["end"] - g["start"]) >= SILENCE_SUGGEST_MIN_SEC
    ]


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
    return Objective(
        objective_id=_eid(),
        text=text,
        project_id=project_id,
        created_at=_now(),
        medium_hints=["video"] if cls == "dead_air_pacing" else [],
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


def decide_from_state(
    text: str,
    *,
    project_id: Optional[str] = None,
    graph: Optional[MediaGraph] = None,
    head: Optional[StudioProjectHead] = None,
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
                "Objective is not the M0 dead-air/pacing path; "
                "ask the user to clarify rather than guessing tools"
            ),
        )

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

    gaps = _usable_silence_gaps(graph.facets.get("silence"))
    if not gaps:
        return _record(
            objective=objective,
            mode="ASK",
            evidence=evidence,
            missing=[
                f"silence gaps ≥ {SILENCE_SUGGEST_MIN_SEC}s in ready facet"
            ],
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

    cap_fact = EvidenceItem(
        evidence_id=_eid(),
        kind="VERIFIED_FACT",
        source="capability_registry",
        reference=REMOVE_SILENCES_CAPABILITY,
        summary="REMOVE_SILENCES is registry-wired and orchestrator_emit=true",
        confidence=1.0,
    )
    evidence = [*evidence, cap_fact]

    candidates = [
        CandidateAction(
            capability_id=REMOVE_SILENCES_CAPABILITY,
            params={
                "min_silence_sec": SILENCE_SUGGEST_MIN_SEC,
                "padding_sec": DEAD_AIR_PADDING_SEC,
                "segments": [
                    {"start": g["start"], "end": g["end"], "type": "silence"}
                    for g in gaps
                ],
            },
            label="Remove qualifying dead air",
        )
    ]
    return _record(
        objective=objective,
        mode="ACT",
        evidence=evidence,
        missing=[],
        rationale=(
            f"Ready silence evidence shows {len(gaps)} qualifying gap(s). "
            "Deterministic ACT via existing REMOVE_SILENCES. 0 Gemini, 0 credits. "
            "No Orchestrator plan created in M0."
        ),
        candidates=candidates,
        verification_plan=(
            "Tier 0: if/when executed, every REMOVE_SILENCES step must be "
            "Kernel-accepted; skipped/rejected steps are execution_partial/"
            "execution_failed. Plan completion is not objective success."
        ),
    )


async def resolve_objective(
    user_id: str,
    text: str,
    project_id: Optional[str] = None,
    *,
    graph: Optional[MediaGraph] = None,
    head: Optional[StudioProjectHead] = None,
) -> DecisionRecord:
    """Load existing Kernel/MediaGraph when not injected, then decide.

    Injected graph/head skip I/O (tests). Never calls ensure_for_project
    (that would create an empty graph). Never calls Gemini.
    """
    loaded_head = head
    loaded_graph = graph

    # I/O only when caller did not inject state (tests pass graph/head).
    if project_id and graph is None and head is None:
        from services.project_kernel import get_project_kernel

        loaded_head = await get_project_kernel().get_head(project_id, user_id)
        from services.media_graph_service import get_media_graph_service

        svc = get_media_graph_service()
        graph_id = loaded_head.media_graph_id if loaded_head else None
        if graph_id:
            loaded_graph = await svc.get(graph_id, user_id)
        else:
            loaded_graph = await _find_graph_without_create(
                svc, user_id, project_id
            )

    record = decide_from_state(
        text,
        project_id=project_id,
        graph=loaded_graph,
        head=loaded_head,
    )
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

    return await asyncio.to_thread(
        svc.store.find_by_project, user_id, project_id
    )
