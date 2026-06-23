"""Gemini bridge for the AI Editor endpoint.

Builds a structured system prompt from editor state + transcript,
calls Gemini in JSON mode, then validates and returns the action list.
Supports both legacy endpoint (/api/ai-edit) and the new model-routed ones.
"""

from __future__ import annotations

import os
import json
import asyncio
import logging
from typing import Any, AsyncGenerator
import google.generativeai as genai
from fastapi import HTTPException

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

logger = logging.getLogger(__name__)

_HARD_TIMEOUT_S = 30
_MAX_TRANSCRIPT_WORDS = 300

# Configure Gemini once at startup
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# ─── New Phase 56 System Prompt ──────────────────────────────────────────────

EDITOR_SYSTEM_PROMPT = """
You are the AI brain of Quick AI Studio — an AI-first video editor.

You have access to these 17 editing tools:
1. selection_tool — click and select clips
2. select_forward — select everything after cursor
3. select_backward — select everything before cursor
4. ripple_delete — cut clip and close gap automatically
5. rolling_edit — adjust cut point between two clips
6. rate_stretch — change clip speed by stretching
7. razor_tool — cut clip into two pieces
8. slip_tool — change clip content without moving it
9. slide_tool — move clip and adjust neighbors
10. pen_keyframe — add keyframe control points
11. rect_mask — draw rectangle shape overlay
12. ellipse_mask — draw circle shape overlay
13. hand_tool — pan the timeline view
14. zoom_tool — zoom timeline in or out
15. text_horizontal — add horizontal text
16. text_vertical — add vertical text
17. ai_extender — AI generate missing frames

When user gives a command:
1. Understand the intent
2. Plan the exact tool sequence
3. Return ONLY valid JSON — no explanation, no markdown

ALWAYS return this exact JSON format:
{
  "intent": "brief description of what you understood",
  "confidence": 0.0-1.0,
  "actions": [
    {
      "tool": "tool_name_from_list_above",
      "params": {
        "clip_id": "string or null",
        "start_time": 0.0,
        "end_time": 0.0,
        "value": "any extra param"
      },
      "order": 1
    }
  ],
  "feedback": "One line telling user what will happen",
  "fallback": "What to do if this fails"
}
"""


async def process_editor_command(
    command: str, user_tier: str = "free", project_context: dict = None
) -> dict:

    # Get right model based on task + user tier
    tier = UserTier.PRO if user_tier == "pro" else UserTier.FREE
    model_config = get_model_for_task(
        task_type=TaskType.EDITOR_COMMAND, user_tier=tier, command=command
    )

    # Build context string
    context_str = ""
    if project_context:
        context_str = f"\nProject context: {json.dumps(project_context, indent=2)}"

    # Call Gemini
    try:
        model = genai.GenerativeModel(
            model_name=model_config.model_name,
            system_instruction=EDITOR_SYSTEM_PROMPT,
            generation_config=genai.GenerationConfig(
                temperature=model_config.temperature,
                max_tokens=model_config.max_tokens,
                response_mime_type="application/json",
            ),
        )

        prompt = f"User command: {command}{context_str}"
        response = model.generate_content(prompt)

        # Parse JSON response
        result = json.loads(response.text)
        result["model_used"] = model_config.model_name
        return result

    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=422, detail=f"AI returned invalid JSON: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API error: {str(e)}")


async def stream_editor_command(
    command: str, user_tier: str = "free"
) -> AsyncGenerator[str, None]:

    tier = UserTier.PRO if user_tier == "pro" else UserTier.FREE
    model_config = get_model_for_task(
        task_type=TaskType.EDITOR_COMMAND, user_tier=tier, command=command
    )

    model = genai.GenerativeModel(
        model_name=model_config.model_name,
        system_instruction=EDITOR_SYSTEM_PROMPT,
        generation_config=genai.GenerationConfig(
            temperature=model_config.temperature,
            max_output_tokens=model_config.max_tokens,
        ),
    )

    response = model.generate_content(f"User command: {command}", stream=True)

    for chunk in response:
        if chunk.text:
            yield f"data: {chunk.text}\n\n"


# ─── Legacy System prompt (for run_ai_editor) ──────────────────────────────────

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

ACTION CATALOGUE (27 variants):
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
... (rest of legacy catalog omitted for brevity, referencing original)
"""


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
    status = (
        raw_status if raw_status in ("ok", "clarification_needed", "no_op") else "ok"
    )

    valid_actions: list[AiEditorAction] = []
    dropped_parse: list[str] = []
    for item in raw_actions_data:
        try:
            from pydantic import TypeAdapter

            ta: TypeAdapter[Any] = TypeAdapter(AiEditorAction)
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
            rs = act
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
