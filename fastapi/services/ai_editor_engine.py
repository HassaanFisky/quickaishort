"""Gemini bridge for the AI Editor endpoint.

Builds planner prompts from the Capability Registry (EP-001),
calls Gemini in JSON mode, normalises legacy ToolName dialect,
then sanitises and returns actions.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Optional

from fastapi import HTTPException
from pydantic import TypeAdapter

from models.ai_editor import (
    AIEditorCurrentState,
    AIEditorResponse,
    AiEditorAction,
    TranscriptChunk,
    TrimAction,
    RemoveSilencesAction,
)
from services.gemini_client import DEFAULT_MODEL, call_gemini_text
from services.ai_editor_sanitiser import sanitise
from services.ai_router import get_model_for_task, TaskType, UserTier
from services.tool_registry import (
    build_orchestrator_system_prompt,
    build_planner_prompt_section,
    list_emit_allowed,
    normalize_command_actions,
)

logger = logging.getLogger(__name__)

_HARD_TIMEOUT_S = 30
_MAX_TRANSCRIPT_WORDS = 300


def _legacy_system_prompt() -> str:
    """Canonical /api/ai-edit prompt — catalogue from registry emit-allowed only."""
    catalogue = build_planner_prompt_section(list_emit_allowed())
    return f"""You are the QuickAI Studio editing kernel.
Convert natural-language editing commands into a JSON action array.
Respond ONLY with valid JSON matching this exact shape — no markdown, no prose:

{{
  "actions": [...],
  "message": "Past-tense summary, max 14 words.",
  "suggestions": ["verb + detail", "verb + detail", "verb + detail"],
  "status": "ok" | "clarification_needed" | "no_op"
}}

STATUS RULES:
- "ok"                    → actions array is non-empty, edits applied
- "no_op"                 → request is valid but no edits needed (empty actions array)
- "clarification_needed"  → request is ambiguous; clarifying question in message; empty actions

{catalogue}

Each action MUST use a top-level "type" field equal to a capability id above.
Do not invent capability ids. Do not use deprecated tool-name dialect.
"""


async def process_editor_command(
    command: str,
    user_tier: str = "free",
    project_context: Optional[dict] = None,
) -> dict[str, Any]:
    """NL command → canonical actions (Capability Registry ABI)."""
    tier = UserTier.PRO if user_tier == "pro" else UserTier.FREE
    model_config = get_model_for_task(
        task_type=TaskType.EDITOR_COMMAND, user_tier=tier, command=command
    )

    context_str = ""
    if project_context:
        context_str = f"\nProject context: {json.dumps(project_context, indent=2)}"

    system = build_orchestrator_system_prompt(command)
    prompt = f"{system}\n\nUser command: {command}{context_str}"

    try:
        raw = await call_gemini_text(
            prompt,
            model=model_config.model_name,
            json_mode=True,
            max_attempts=5,
        )
        parsed = _parse_gemini_json(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=422, detail=f"AI returned invalid JSON: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API error: {str(e)}")

    raw_actions = parsed.get("actions") or []
    if not isinstance(raw_actions, list):
        raw_actions = []

    # Accept legacy {tool,params,order} or canonical {type,...}
    dict_actions = [a for a in raw_actions if isinstance(a, dict)]
    normalized, norm_dropped = normalize_command_actions(dict_actions)

    state = _state_from_project_context(project_context)
    valid_actions: list[AiEditorAction] = []
    parse_dropped: list[str] = list(norm_dropped)
    ta: TypeAdapter[Any] = TypeAdapter(AiEditorAction)
    for item in normalized:
        try:
            valid_actions.append(ta.validate_python(item))
        except Exception as exc:
            action_type = item.get("type", "UNKNOWN")
            parse_dropped.append(f"{action_type}: {exc}")
            logger.debug("command_path dropped malformed action %s: %s", item, exc)

    safe_actions, clamped_report, dropped_clamp = sanitise(valid_actions, state)
    all_dropped = parse_dropped + dropped_clamp

    intent = str(parsed.get("intent") or "edit")
    try:
        confidence = float(parsed.get("confidence", 0.7))
    except (TypeError, ValueError):
        confidence = 0.7
    confidence = max(0.0, min(1.0, confidence))

    feedback = (
        parsed.get("feedback")
        or parsed.get("message")
        or ("Done." if safe_actions else "No edits applied.")
    )
    fallback = str(parsed.get("fallback") or "Rephrase the command and retry.")

    # Canonical actions for FE (plain dicts)
    canonical = [a.model_dump(mode="json") for a in safe_actions]

    return {
        "intent": intent,
        "confidence": confidence,
        "actions": canonical,
        "feedback": feedback,
        "fallback": fallback,
        "model_used": model_config.model_name,
        "clamped": clamped_report,
        "dropped": all_dropped,
        "message": parsed.get("message") or feedback,
        "suggestions": (parsed.get("suggestions") or [])[:3],
        "status": parsed.get("status") or ("ok" if canonical else "no_op"),
    }


async def stream_editor_command(
    command: str, user_tier: str = "free"
) -> AsyncGenerator[str, None]:
    tier = UserTier.PRO if user_tier == "pro" else UserTier.FREE
    model_config = get_model_for_task(
        task_type=TaskType.EDITOR_COMMAND, user_tier=tier, command=command
    )
    system = build_orchestrator_system_prompt(command)
    prompt = f"{system}\n\nUser command: {command}"
    raw = await call_gemini_text(
        prompt,
        model=model_config.model_name,
        max_attempts=5,
    )
    yield f"data: {raw}\n\n"


def _state_from_project_context(
    project_context: Optional[dict],
) -> AIEditorCurrentState:
    ctx = project_context or {}
    duration = float(ctx.get("duration") or ctx.get("videoDuration") or 60.0)
    return AIEditorCurrentState(
        videoDuration=max(duration, 0.0),
        currentTime=float(ctx.get("currentTime") or 0.0),
        selectedClipId=ctx.get("selectedClipId"),
        elementCount=int(ctx.get("elementCount") or 0),
        captionCount=int(ctx.get("captionCount") or 0),
        captionsEnabled=bool(ctx.get("captionsEnabled", True)),
        aspectRatio=ctx.get("aspectRatio") or "9:16",
        visualFilter=ctx.get("visualFilter") or "None",
        audioBoost=int(ctx.get("audioBoost") or 100),
        playbackSpeed=int(ctx.get("playbackSpeed") or 100),
    )


def _compute_silence_trims(
    transcript: list[TranscriptChunk],
    min_silence_sec: float,
    padding_sec: float,
    video_duration: float,
) -> list[TrimAction]:
    if not transcript or video_duration <= 0:
        return []

    chunks = sorted(transcript, key=lambda c: c.start)
    leading_silence = chunks[0].start
    trailing_silence = video_duration - chunks[-1].end

    trim_start = (
        max(0.0, chunks[0].start - padding_sec)
        if leading_silence >= min_silence_sec
        else 0.0
    )
    trim_end = (
        min(video_duration, chunks[-1].end + padding_sec)
        if trailing_silence >= min_silence_sec
        else video_duration
    )

    if trim_end <= trim_start:
        return []

    return [TrimAction(type="TRIM", start=trim_start, end=trim_end)]


def _build_context(
    state: AIEditorCurrentState,
    transcript: list[TranscriptChunk],
) -> str:
    lines: list[str] = [
        f"VIDEO DURATION: {state.videoDuration:.1f}s",
        f"CURRENT TIME: {state.currentTime:.1f}s",
        f"ASPECT RATIO: {state.aspectRatio}",
        f"FILTER: {state.visualFilter}",
        f"AUDIO BOOST: {state.audioBoost}%",
        f"PLAYBACK SPEED: {state.playbackSpeed}%",
        f"CAPTIONS: {'on' if state.captionsEnabled else 'off'} ({state.captionCount} captions)",
        f"ELEMENTS ON CANVAS: {state.elementCount}",
    ]
    if state.selectedClipId:
        lines.append(f"SELECTED CLIP: {state.selectedClipId}")

    if transcript:
        words: list[str] = []
        for chunk in transcript:
            words.extend(chunk.text.split())
            if len(words) >= _MAX_TRANSCRIPT_WORDS:
                break
        sample = " ".join(words[:_MAX_TRANSCRIPT_WORDS])
        lines.append(f'TRANSCRIPT SAMPLE: "{sample}"')

    return "\n".join(lines)


def _parse_gemini_json(raw: str) -> dict[str, Any]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.rsplit("```", 1)[0]
    return json.loads(cleaned.strip())


async def run_ai_editor(
    prompt: str,
    state: AIEditorCurrentState,
    transcript: list[TranscriptChunk],
    video_id: str | None = None,
) -> AIEditorResponse:
    """Call Gemini and return a validated, sanitised AIEditorResponse."""
    context = _build_context(state, transcript)
    full_prompt = (
        _legacy_system_prompt()
        + "\n\n══ CURRENT EDITOR CONTEXT ══\n"
        + context
        + f"\n\nUSER COMMAND: {prompt}"
    )

    try:
        raw = await asyncio.wait_for(
            call_gemini_text(full_prompt, json_mode=True),
            timeout=_HARD_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        logger.error("ai_editor: Gemini timeout after %ds", _HARD_TIMEOUT_S)
        raise

    try:
        parsed = _parse_gemini_json(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("ai_editor: JSON parse failed — %s | raw: %.200s", exc, raw)
        return AIEditorResponse(
            actions=[],
            message="The AI returned an unreadable response. Try rephrasing.",
            suggestions=[],
            status="no_op",
            used_mock=False,
            model=DEFAULT_MODEL,
            clamped=[],
            dropped=[],
        )

    raw_actions_data: list[Any] = parsed.get("actions", [])
    message: str = parsed.get("message", "Done.")
    suggestions: list[str] = parsed.get("suggestions", [])[:3]
    raw_status: str = parsed.get("status", "ok")
    status = (
        raw_status if raw_status in ("ok", "clarification_needed", "no_op") else "ok"
    )

    # Normalise any accidental legacy dialect in /api/ai-edit responses
    dict_actions = [a for a in raw_actions_data if isinstance(a, dict)]
    if any("tool" in a and "type" not in a for a in dict_actions):
        dict_actions, norm_dropped = normalize_command_actions(dict_actions)
    else:
        norm_dropped = []

    valid_actions: list[AiEditorAction] = []
    dropped_parse: list[str] = list(norm_dropped)
    ta: TypeAdapter[Any] = TypeAdapter(AiEditorAction)
    for item in dict_actions:
        try:
            valid_actions.append(ta.validate_python(item))
        except Exception as exc:
            action_type = (
                item.get("type", "UNKNOWN") if isinstance(item, dict) else "UNKNOWN"
            )
            dropped_parse.append(f"{action_type}: {exc}")
            logger.debug("ai_editor: dropped malformed action %s: %s", item, exc)

    safe_actions, clamped_report, dropped_clamp = sanitise(valid_actions, state)

    expanded: list[AiEditorAction] = []
    for act in safe_actions:
        if act.type == "REMOVE_SILENCES":
            rs = act  # type: RemoveSilencesAction
            trims = _compute_silence_trims(
                transcript, rs.min_silence_sec, rs.padding_sec, state.videoDuration
            )
            for tr in trims:
                if (tr.end - tr.start) >= state.videoDuration * 0.2:
                    expanded.append(tr)
                else:
                    dropped_clamp.append(
                        "REMOVE_SILENCES dropped — would remove > 80 % of video duration"
                    )
        else:
            expanded.append(act)
    safe_actions = expanded

    if status == "clarification_needed":
        safe_actions = []

    return AIEditorResponse(
        actions=safe_actions,
        message=message,
        suggestions=suggestions,
        status=status,
        used_mock=False,
        model=DEFAULT_MODEL,
        clamped=clamped_report,
        dropped=dropped_parse + dropped_clamp,
    )
