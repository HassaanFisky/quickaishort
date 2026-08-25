"""Deterministic director loop for typed chat — 0 Gemini, 0 credits.

Intercepts dead-air, shorts-packaging, and opening-restore objectives before
DualModelRouter. Unrelated commands return None so the existing Luna path runs.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from pydantic import TypeAdapter, ValidationError

from models.ai_editor import (
    AIEditorCurrentState,
    AiEditorAction,
    EditorCommandResponse,
)
from models.studio_decision import DecisionRecord
from services.ai_editor_sanitiser import sanitise
from services.decision_service import classify_objective, resolve_objective
from services.tool_registry import is_emit_allowed

logger = logging.getLogger(__name__)

_DETERMINISTIC_CLASSES = frozenset(
    {"dead_air_pacing", "director_packaging", "revise_opening"}
)
_MODEL_USED = "decision-intelligence"


def _project_id_from_context(ctx: Optional[dict[str, Any]]) -> Optional[str]:
    if not isinstance(ctx, dict):
        return None
    for key in ("studio_project_id", "project_id", "studioProjectId"):
        raw = ctx.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
    return None


def _state_from_context(ctx: Optional[dict[str, Any]]) -> AIEditorCurrentState:
    data = ctx or {}
    try:
        duration = float(data.get("duration") or data.get("videoDuration") or 60.0)
    except (TypeError, ValueError):
        duration = 60.0
    aspect = data.get("aspectRatio") or "9:16"
    if aspect not in {"9:16", "1:1", "16:9", "4:5"}:
        aspect = "9:16"
    visual = data.get("visualFilter") or "None"
    if visual not in {"None", "Urban", "Retro", "Cinematic"}:
        visual = "None"
    return AIEditorCurrentState(
        videoDuration=max(duration, 0.0),
        currentTime=float(data.get("currentTime") or 0.0),
        selectedClipId=data.get("selectedClipId"),
        elementCount=int(data.get("elementCount") or 0),
        captionCount=int(data.get("captionCount") or 0),
        captionsEnabled=bool(data.get("captionsEnabled", True)),
        aspectRatio=aspect,
        visualFilter=visual,
        audioBoost=int(data.get("audioBoost") or 100),
        playbackSpeed=int(data.get("playbackSpeed") or 100),
    )


def _candidate_to_action_dict(record: DecisionRecord) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    for item in record.candidate_actions:
        cid = item.capability_id
        if not is_emit_allowed(cid):
            continue
        payload = dict(item.params)
        payload["type"] = cid
        actions.append(payload)
    return actions


def _suggestions(record: DecisionRecord) -> list[str]:
    out: list[str] = []
    if record.mode == "ACT" and record.missing_information:
        out.append("Analyze the transcript so I can pick the strongest stretch")
    if any("opening" in m or "transcript hook" in m for m in record.missing_information):
        out.append("Wait for transcription, then strengthen the opening")
    if any("AUTO_REFRAME" in m or "reframe" in m.lower() for m in record.missing_information):
        out.append("Export stays 9:16 — speaker reframe is not wired yet")
    if record.mode == "ACT":
        out.append("Keep the original opening")
        out.append("Tighten pacing more")
    else:
        out.append("Remove dead air")
        out.append("Add captions")
    seen: set[str] = set()
    unique: list[str] = []
    for s in out:
        if s not in seen:
            seen.add(s)
            unique.append(s)
    return unique[:3]


async def try_deterministic_director_command(
    *,
    user_id: str,
    command: str,
    project_context: Optional[dict[str, Any]] = None,
) -> Optional[EditorCommandResponse]:
    """Return a command response when the objective is deterministic. Else None."""
    cls = classify_objective(command)
    # Captions-only / color-grade / generic chat stay DualModelRouter (credits).
    if cls not in _DETERMINISTIC_CLASSES:
        return None

    project_id = _project_id_from_context(project_context)
    record = await resolve_objective(
        user_id,
        command,
        project_id,
        project_context=project_context,
    )

    raw_actions = _candidate_to_action_dict(record) if record.mode == "ACT" else []
    ta: TypeAdapter[Any] = TypeAdapter(AiEditorAction)
    parsed: list[AiEditorAction] = []
    dropped: list[str] = []
    for item in raw_actions:
        try:
            parsed.append(ta.validate_python(item))
        except ValidationError as exc:
            dropped.append(f"{item.get('type', 'UNKNOWN')}: {exc.error_count()} schema")

    safe, clamped, sanitiser_dropped = sanitise(parsed, _state_from_context(project_context))
    dropped.extend(sanitiser_dropped)
    canonical = [a.model_dump(mode="json") for a in safe]

    if record.mode == "ACT" and not canonical:
        status = "no_op"
        message = record.rationale or "No executable steps survived validation."
    elif record.mode == "ACT":
        status = "ok"
        message = record.rationale
    elif record.mode == "NOTHING":
        status = "no_op"
        message = record.rationale
    else:
        status = "clarification_needed"
        message = record.rationale

    logger.info(
        "director_loop class=%s mode=%s actions=%d missing=%d project=%s",
        cls,
        record.mode,
        len(canonical),
        len(record.missing_information),
        project_id or "-",
    )
    return EditorCommandResponse(
        intent="edit",
        confidence=0.9 if canonical else 0.7,
        actions=canonical,
        feedback=message,
        fallback="Rephrase with a specific edit, or wait for analysis to finish.",
        model_used=_MODEL_USED,
        clamped=list(clamped),
        dropped=dropped,
        message=message,
        suggestions=_suggestions(record),
        status=status,
        cached=False,
        kernel_ack_required=bool(canonical),
        decision_id=record.decision_id,
        decision_mode=record.mode,
        unresolved=list(record.missing_information),
    )
