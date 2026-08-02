"""Deterministic Gemini response fixtures for MOCK_AI_MODE.

Zero-cost local validation only. Never used when ENVIRONMENT=production.
Phase 2: multi-action plans mirror MediaGraph suggestion richness
(transcript hook, silence surgery, viral pack, caption craft, SFX).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

# Multi-track editor fixture aligned with TimelinePlanOutput action ABI.
_MOCK_TIMELINE_ACTIONS: list[dict[str, Any]] = [
    {"type": "TRIM", "start": 0.0, "end": 15.0},
    {
        "type": "ADD_CAPTION",
        "text": "Mock hook caption",
        "startTime": 0.0,
        "endTime": 3.0,
    },
    {"type": "SET_VISUAL_FILTER", "filter": "Cinematic"},
    {
        "type": "ADD_ELEMENT",
        "element": {
            "type": "TEXT",
            "text": "Multi-track composition mock",
            "x": 540.0,
            "y": 1600.0,
            "scale": 1.1,
            "color": "#a855f7",
        },
    },
    {"type": "SET_AUDIO_BOOST", "value": 120},
    {"type": "TIMELINE_ZOOM", "zoom_factor": 1.0},
]

# Rich multi-action packs matching suggestion-engine evidence (heuristic / $0).
_MOCK_SILENCE_PACK: list[dict[str, Any]] = [
    {
        "type": "REMOVE_SILENCES",
        "min_silence_sec": 0.6,
        "padding_sec": 0.08,
        "segments": [
            {"start": 4.2, "end": 6.8, "type": "silence"},
            {"start": 18.0, "end": 21.5, "type": "silence"},
        ],
    },
    {"type": "SEEK", "time": 4.0},
    {
        "type": "ADD_CAPTION",
        "text": "Cut the dead air",
        "startTime": 3.5,
        "endTime": 5.5,
    },
]

_MOCK_VIRAL_PACK: list[dict[str, Any]] = [
    {
        "type": "DETECT_VIRAL_MOMENTS",
        "moments": [
            {
                "timestamp": 2.0,
                "hook": "Mock viral hook",
                "score": 86,
            },
            {
                "timestamp": 40.0,
                "hook": "Mock payoff",
                "score": 74,
            },
        ],
    },
    {"type": "TRIM", "start": 2.0, "end": 17.0},
    {"type": "SEEK", "time": 2.0},
    {
        "type": "GENERATE_HOOK_CAPTION",
        "captions": ["Wait for it", "This changes everything"],
    },
]

_MOCK_HOOK_PACK: list[dict[str, Any]] = [
    {"type": "TRIM", "start": 0.0, "end": 12.0},
    {
        "type": "ADD_CAPTION",
        "text": "Hook line from transcript",
        "startTime": 0.0,
        "endTime": 2.8,
    },
    {
        "type": "GENERATE_HOOK_CAPTION",
        "captions": ["You won't believe this", "Watch till the end"],
    },
    {"type": "SET_PLAYBACK_SPEED", "value": 110},
]

_MOCK_AUDIO_PACK: list[dict[str, Any]] = [
    {"type": "SET_AUDIO_BOOST", "value": 130},
    {"type": "SET_NOISE_REDUCTION", "value": 40},
    {"type": "ADD_SFX", "sfx_id": "impact-thud", "start_sec": 2.0, "volume": 0.9},
]

_MOCK_MARKS_PACK: list[dict[str, Any]] = [
    {"type": "MARK_IN", "time_sec": 2.0},
    {"type": "MARK_OUT", "time_sec": 17.0},
    {"type": "RANGE_MARK", "in_sec": 2.0, "out_sec": 17.0},
    {"type": "SEEK", "time": 2.0},
]


def mock_timeline_plan_dict() -> dict[str, Any]:
    """Structure-compliant timeline JSON for Luna / AI-editor paths."""

    return {
        "actions": list(_MOCK_TIMELINE_ACTIONS),
        "message": "Mock AI applied a multi-track timeline plan.",
        "suggestions": [
            "Split at the first beat drop",
            "Boost audio to 140%",
            "Add a zoom on the speaker",
        ],
        "status": "ok",
        # Extra keys tolerated by loose JSON consumers (editor command path).
        "intent": "edit",
        "confidence": 0.92,
        "feedback": "Mock AI applied a multi-track timeline plan.",
        "fallback": "Disable MOCK_AI_MODE and retry with live Gemini.",
        "tracks": [
            {
                "id": "v1",
                "kind": "video",
                "clips": [{"id": "clip-mock-1", "start": 0.0, "end": 15.0}],
            },
            {
                "id": "a1",
                "kind": "audio",
                "clips": [{"id": "audio-mock-1", "start": 0.0, "end": 15.0}],
            },
            {
                "id": "c1",
                "kind": "caption",
                "clips": [
                    {
                        "id": "caption-mock-1",
                        "start": 0.0,
                        "end": 3.0,
                        "text": "Mock hook caption",
                    }
                ],
            },
        ],
        "composition": {
            "engine": "local-multitrack-mock",
            "width": 1080,
            "height": 1920,
            "fps": 30,
            "duration_sec": 15.0,
        },
    }


def mock_rich_plan_dict(
    actions: list[dict[str, Any]],
    *,
    message: str,
    suggestions: list[str],
) -> dict[str, Any]:
    """Multi-action plan fixture matching suggestion-pack richness."""

    base = mock_timeline_plan_dict()
    base["actions"] = list(actions)
    base["message"] = message
    base["feedback"] = message
    base["suggestions"] = suggestions
    base["intent"] = "edit"
    base["confidence"] = 0.9
    return base


def mock_visual_analysis_dict() -> dict[str, Any]:
    """Structure-compliant visual analysis for gemini-visual-v1."""

    return {
        "summary": "Mock visual pass: balanced lighting, usable sharpness, steady framing.",
        "overall_lighting": "balanced",
        "visual_energy": 0.62,
        "camera_movement": 0.28,
        "findings": [
            {
                "timestamp_ms": 0,
                "description": "Opening frame — subject centered, mock sandbox.",
                "lighting": "balanced",
                "sharpness": "usable",
                "subject_center_x": 0.5,
            }
        ],
        "recommended_edits": [
            "Trim dead air before the first gesture",
            "Add a punch-in on the peak energy beat",
        ],
    }


def mock_viral_segments_dict() -> list[dict[str, Any]]:
    return [
        {
            "start": 2.0,
            "end": 17.0,
            "reason": "Mock hook segment for local validation",
        },
        {
            "start": 40.0,
            "end": 58.0,
            "reason": "Mock payoff segment for local validation",
        },
    ]


def mock_viral_clips_dict() -> list[dict[str, Any]]:
    return [
        {
            "id": "mock-clip-1",
            "start": 2.0,
            "end": 17.0,
            "confidence": 0.88,
            "reason": "Mock viral hook",
            "viralAnalysis": {
                "score": 78,
                "hookStrength": 0.8,
                "retentionPotential": 0.74,
                "visualEnergy": 0.66,
                "cameraMovement": 0.4,
                "salientCenterX": 0.5,
                "hookOverlay": "WAIT FOR IT",
                "emotionalPeaks": [4.0, 11.0],
                "cinematicStyle": "Impact",
                "emotionalTriggers": ["Curiosity"],
                "reasoning": "Deterministic MOCK_AI_MODE fixture — not live Gemini.",
            },
            "suggestedCaptions": ["This changes everything", "Watch till the end"],
            "aspectRatio": "9:16",
        }
    ]


def _contents_blob(contents: Any) -> str:
    if contents is None:
        return ""
    if isinstance(contents, str):
        return contents
    if isinstance(contents, (bytes, bytearray)):
        return bytes(contents).decode("utf-8", errors="replace")
    if isinstance(contents, dict):
        return json.dumps(contents, ensure_ascii=False)
    if isinstance(contents, (list, tuple)):
        return "\n".join(_contents_blob(part) for part in contents)
    # google.genai Content / Part objects — best-effort stringification
    text = getattr(contents, "text", None)
    if isinstance(text, str) and text:
        return text
    parts = getattr(contents, "parts", None)
    if parts is not None:
        return _contents_blob(list(parts))
    return str(contents)


def _select_rich_editor_plan(blob: str) -> dict[str, Any]:
    """Pick a multi-action MOCK pack from command / context keywords."""

    if any(
        k in blob
        for k in (
            "silence",
            "dead air",
            "remove_silences",
            "cut silence",
            "silence_count",
        )
    ):
        return mock_rich_plan_dict(
            _MOCK_SILENCE_PACK,
            message="Mock cut dead air and previewed the first gap.",
            suggestions=[
                "Preview the next silence gap",
                "Boost audio after the cut",
                "Export Final",
            ],
        )
    if any(
        k in blob
        for k in (
            "viral",
            "highlight",
            "detect_viral",
            "viral_top",
            "best moment",
        )
    ):
        return mock_rich_plan_dict(
            _MOCK_VIRAL_PACK,
            message="Mock found highlights and trimmed to the top moment.",
            suggestions=[
                "Seek to the payoff beat",
                "Add a hook caption",
                "Export Final",
            ],
        )
    if any(
        k in blob
        for k in (
            "hook",
            "opening",
            "truncate",
            "first line",
            "hook_line",
            "transcript_slice",
        )
    ):
        return mock_rich_plan_dict(
            _MOCK_HOOK_PACK,
            message="Mock trimmed to the hook and drafted captions.",
            suggestions=[
                "Toggle captions on",
                "Speed up pacing slightly",
                "Export Final",
            ],
        )
    if any(
        k in blob
        for k in (
            "boost",
            "noise",
            "audio",
            "sfx",
            "louder",
            "volume",
        )
    ):
        return mock_rich_plan_dict(
            _MOCK_AUDIO_PACK,
            message="Mock boosted audio, reduced noise, and previewed SFX.",
            suggestions=[
                "Cut dead air next",
                "Find viral moments",
                "Export Final",
            ],
        )
    if any(
        k in blob
        for k in (
            "mark in",
            "mark out",
            "range_mark",
            "mark_in",
            "i/o",
            "in and out",
        )
    ):
        return mock_rich_plan_dict(
            _MOCK_MARKS_PACK,
            message="Mock set in/out marks on the highlight range.",
            suggestions=[
                "Trim to marks",
                "Export Final",
                "Add a hook caption",
            ],
        )
    return mock_timeline_plan_dict()


def build_mock_gemini_text(
    contents: Any,
    *,
    json_mode: bool = False,
) -> str:
    """Return deterministic text/JSON without calling Google AI Studio."""

    blob = _contents_blob(contents).lower()
    wants_json = json_mode or "application/json" in blob or "schema:" in blob

    if not wants_json:
        return "Mock AI mode: Gemini HTTP short-circuited (MOCK_AI_MODE=true)."

    if "gemini-visual-v1" in blob or (
        "overall_lighting" in blob and "findings" in blob
    ):
        payload: Any = mock_visual_analysis_dict()
    elif "luna-orchestration-v1" in blob or "terra-json-repair-v1" in blob:
        # DualModelRouter TimelinePlanOutput is extra=forbid — keep the 4 ABI fields.
        rich = _select_rich_editor_plan(blob)
        payload = {
            "actions": rich["actions"],
            "message": rich["message"],
            "suggestions": rich["suggestions"],
            "status": rich["status"],
        }
    elif "find 3-7 viral segments" in blob or "viral segments" in blob:
        payload = mock_viral_segments_dict()
    elif "score these viral" in blob or "hookstrength" in blob:
        payload = mock_viral_clips_dict()
    else:
        # AI editor / command path — keyword-rich multi-action fixtures.
        payload = _select_rich_editor_plan(blob)

    return json.dumps(payload, ensure_ascii=False)


def build_mock_output_model(
    output_model: type[BaseModel],
    *,
    task: str = "logic",
) -> BaseModel:
    """Build a strict Pydantic instance for DualModelRouter mock short-circuit."""

    name = output_model.__name__
    candidates: list[dict[str, Any]] = []
    if task == "visual" or "Visual" in name:
        candidates.append(mock_visual_analysis_dict())
    timeline = mock_timeline_plan_dict()
    candidates.append(
        {
            "actions": timeline["actions"],
            "message": timeline["message"],
            "suggestions": timeline["suggestions"],
            "status": timeline["status"],
        }
    )
    # Rich packs as secondary candidates for looser schemas.
    for pack in (
        _MOCK_SILENCE_PACK,
        _MOCK_VIRAL_PACK,
        _MOCK_HOOK_PACK,
        _MOCK_AUDIO_PACK,
    ):
        rich = mock_rich_plan_dict(
            pack,
            message="Mock multi-action plan.",
            suggestions=["Export Final"],
        )
        candidates.append(
            {
                "actions": rich["actions"],
                "message": rich["message"],
                "suggestions": rich["suggestions"],
                "status": rich["status"],
            }
        )
    candidates.append(timeline)
    candidates.append({"answer": "mock-ai-mode"})
    candidates.append(mock_visual_analysis_dict())

    last_error: ValidationError | None = None
    for candidate in candidates:
        try:
            return output_model.model_validate(candidate, strict=True)
        except ValidationError as exc:
            last_error = exc
            continue

    logger.error(
        "MOCK_AI_MODE has no fixture for output_model=%s task=%s",
        name,
        task,
    )
    raise RuntimeError(
        f"MOCK_AI_MODE cannot satisfy output_model={name}"
    ) from last_error
