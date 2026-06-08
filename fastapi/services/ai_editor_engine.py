"""Gemini bridge for the AI Editor endpoint.

Builds a structured system prompt from editor state + transcript,
calls Gemini in JSON mode, then validates and returns the action list.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from models.ai_editor import (
    AIEditorCurrentState,
    AIEditorResponse,
    AiEditorAction,
    TranscriptChunk,
)
from services.gemini_client import DEFAULT_MODEL, call_gemini_text
from services.ai_editor_sanitiser import sanitise

logger = logging.getLogger(__name__)

_HARD_TIMEOUT_S = 30
_MAX_TRANSCRIPT_WORDS = 300

# ─── System prompt ────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are the QuickAI Video Editor Intelligence.
Convert natural-language editing commands into a JSON action array.
Respond ONLY with valid JSON matching this exact shape — no markdown, no prose:

{
  "actions": [...],
  "message": "Past-tense summary, max 14 words.",
  "suggestions": ["verb + detail", "verb + detail", "verb + detail"],
  "status": "ok" | "clarification_needed" | "no_op"
}

STATUS RULES:
- "ok"                    → actions array is non-empty, edits applied
- "no_op"                 → request is valid but no edits needed (empty actions array)
- "clarification_needed"  → request is ambiguous; put a clarifying question in message; empty actions

ACTION CATALOGUE (23 variants):
ADD_CAPTION      { type, text, startTime, endTime, style? }
REMOVE_CAPTION   { type, id }
UPDATE_CAPTION   { type, id, patch }
TRIM             { type, start, end }
SPLIT_CLIP       { type, time }
DELETE_CLIP      { type, id? }
SELECT_CLIP      { type, id?, index? }
ADD_FILTER       { type, filter: "brightness"|"contrast"|"saturation"|"hue"|"blur", value }
RESET_FILTER     { type }
SET_VISUAL_FILTER { type, filter: "None"|"Urban"|"Retro"|"Cinematic" }
SET_AUDIO_BOOST  { type, value: 0-200 }
SET_NOISE_REDUCTION { type, value: 0-100 }
SET_PLAYBACK_SPEED { type, value: 50-200 }
TOGGLE_CAPTIONS  { type, enabled: bool }
TOGGLE_TRANSITIONS { type, enabled: bool }
TOGGLE_VOICEOVER { type, enabled: bool }
SEEK             { type, time }
PLAY             { type }
PAUSE            { type }
EXPORT_CLIP      { type }
ADD_ELEMENT      { type, element: { type: "TEXT"|"ZOOM"|"TRIM"|"STICKER", ...fields } }
UPDATE_ELEMENT   { type, id, patch }
REMOVE_ELEMENT   { type, id }

TEXT element fields: text, x(0-1080), y(0-1920), scale(0.1-5), rotation, color, fontSize?, fontWeight?
STICKER element fields: emoji, x, y, scale, rotation
ZOOM element fields: x, y, scale(0.5-3), rotation
TRIM element fields: startTime, endTime, x, y, scale, rotation

RULES:
1. All timestamps must be within [0, videoDuration].
2. Canvas positions: x ∈ [0,1080], y ∈ [0,1920].
3. Batch multiple actions when one command implies several steps.
4. Never return partial JSON. Never add prose outside the JSON.
5. If the request is impossible given current state, use "no_op" and explain.
"""


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
    # Strip markdown code fences if present
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
        _SYSTEM_PROMPT
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
    status = raw_status if raw_status in ("ok", "clarification_needed", "no_op") else "ok"

    # Validate each action via Pydantic — drop malformed ones
    valid_actions: list[AiEditorAction] = []
    dropped_parse: list[str] = []
    for item in raw_actions_data:
        try:
            from pydantic import TypeAdapter
            ta: TypeAdapter[Any] = TypeAdapter(AiEditorAction)
            valid_actions.append(ta.validate_python(item))
        except Exception as exc:
            action_type = item.get("type", "UNKNOWN") if isinstance(item, dict) else "UNKNOWN"
            dropped_parse.append(f"{action_type}: {exc}")
            logger.debug("ai_editor: dropped malformed action %s: %s", item, exc)

    # Clamp + sanitise
    safe_actions, clamped_report, dropped_clamp = sanitise(valid_actions, state)

    # Defensive: clarification_needed must have empty actions
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
