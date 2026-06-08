"""Server-side clamping moat for AI Editor actions.

Every action from the Gemini bridge passes through sanitise() before being
returned to the client.  This ensures:
  - All timestamps are clamped to [0, video_duration].
  - All canvas positions are clamped to the 1080×1920 reference canvas.
  - Numeric slider values remain within their declared ranges.
  - Actions referencing impossible states (e.g. split past end) are dropped.

Also provides a deterministic mock provider (MOCK_AI_EDITOR=true) used in
development and CI to avoid spending Gemini quota.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from models.ai_editor import (
    AIEditorCurrentState,
    AiEditorAction,
    AddCaptionAction,
    TrimAction,
    SplitClipAction,
    SeekAction,
    AddFilterAction,
    SetVisualFilterAction,
    SetAudioBoostAction,
    SetNoiseReductionAction,
    SetPlaybackSpeedAction,
    AddElementAction,
    UpdateElementAction,
    TextElementData,
    DetectViralMomentsAction,
    ViralMoment,
    GenerateHookCaptionAction,
    SuggestStylePresetAction,
    ExplainLastEditAction,
)

logger = logging.getLogger(__name__)

MOCK_ENABLED = os.getenv("MOCK_AI_EDITOR", "false").lower() == "true"

# Reference canvas dimensions (1080p portrait)
_CANVAS_W = 1080.0
_CANVAS_H = 1920.0


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _clamp_time(t: float, duration: float) -> float:
    return _clamp(t, 0.0, max(duration, 0.0))


def _clamp_x(x: float) -> float:
    return _clamp(x, 0.0, _CANVAS_W)


def _clamp_y(y: float) -> float:
    return _clamp(y, 0.0, _CANVAS_H)


def sanitise(
    actions: list[AiEditorAction],
    state: AIEditorCurrentState,
) -> tuple[list[AiEditorAction], list[str], list[str]]:
    """Clamp or drop actions that are out of range.

    Returns:
        (safe_actions, clamped_descriptions, dropped_descriptions)
    """
    safe: list[AiEditorAction] = []
    clamped: list[str] = []
    dropped: list[str] = []
    dur = state.videoDuration

    for action in actions:
        t = action.type

        # ── Caption timestamps ────────────────────────────────────────────────
        if t == "ADD_CAPTION":
            a = action  # type: AddCaptionAction
            orig_start, orig_end = a.startTime, a.endTime
            new_start = _clamp_time(a.startTime, dur)
            new_end = _clamp_time(a.endTime, dur)
            if new_end <= new_start:
                dropped.append(
                    f"ADD_CAPTION startTime={orig_start:.1f} endTime={orig_end:.1f} — zero-length after clamp"
                )
                continue
            if new_start != orig_start or new_end != orig_end:
                clamped.append(
                    f"ADD_CAPTION startTime {orig_start:.1f}→{new_start:.1f}, endTime {orig_end:.1f}→{new_end:.1f}"
                )
                action = AddCaptionAction(
                    type="ADD_CAPTION",
                    text=a.text,
                    startTime=new_start,
                    endTime=new_end,
                    style=a.style,
                )

        # ── TRIM ──────────────────────────────────────────────────────────────
        elif t == "TRIM":
            a = action  # type: TrimAction
            ns = _clamp_time(a.start, dur)
            ne = _clamp_time(a.end, dur)
            if ne <= ns:
                dropped.append(
                    f"TRIM start={a.start:.1f} end={a.end:.1f} — invalid range after clamp"
                )
                continue
            if ns != a.start or ne != a.end:
                clamped.append(
                    f"TRIM start {a.start:.1f}→{ns:.1f}, end {a.end:.1f}→{ne:.1f}"
                )
                action = TrimAction(type="TRIM", start=ns, end=ne)

        # ── SPLIT_CLIP ────────────────────────────────────────────────────────
        elif t == "SPLIT_CLIP":
            a = action  # type: SplitClipAction
            nt = _clamp_time(a.time, dur)
            if nt <= 1.0 or nt >= dur - 1.0:
                dropped.append(
                    f"SPLIT_CLIP time={a.time:.1f} — too close to edge after clamp"
                )
                continue
            if nt != a.time:
                clamped.append(f"SPLIT_CLIP time {a.time:.1f}→{nt:.1f}")
                action = SplitClipAction(type="SPLIT_CLIP", time=nt)

        # ── SEEK ─────────────────────────────────────────────────────────────
        elif t == "SEEK":
            a = action  # type: SeekAction
            nt = _clamp_time(a.time, dur)
            if nt != a.time:
                clamped.append(f"SEEK time {a.time:.1f}→{nt:.1f}")
                action = SeekAction(type="SEEK", time=nt)

        # ── ADD_FILTER ────────────────────────────────────────────────────────
        elif t == "ADD_FILTER":
            a = action  # type: AddFilterAction
            ranges = {
                "brightness": (0.5, 2.0),
                "contrast": (0.5, 2.0),
                "saturation": (0.0, 2.0),
                "hue": (-180.0, 180.0),
                "blur": (0.0, 10.0),
            }
            lo, hi = ranges.get(a.filter, (0.0, 10.0))
            nv = _clamp(a.value, lo, hi)
            if nv != a.value:
                clamped.append(f"ADD_FILTER {a.filter} value {a.value:.2f}→{nv:.2f}")
                action = AddFilterAction(type="ADD_FILTER", filter=a.filter, value=nv)

        # ── Audio / speed sliders ─────────────────────────────────────────────
        elif t == "SET_AUDIO_BOOST":
            a = action  # type: SetAudioBoostAction
            nv = int(_clamp(a.value, 0, 200))
            if nv != a.value:
                clamped.append(f"SET_AUDIO_BOOST value {a.value}→{nv}")
                action = SetAudioBoostAction(type="SET_AUDIO_BOOST", value=nv)
        elif t == "SET_NOISE_REDUCTION":
            a = action  # type: SetNoiseReductionAction
            nv = int(_clamp(a.value, 0, 100))
            if nv != a.value:
                clamped.append(f"SET_NOISE_REDUCTION value {a.value}→{nv}")
                action = SetNoiseReductionAction(type="SET_NOISE_REDUCTION", value=nv)
        elif t == "SET_PLAYBACK_SPEED":
            a = action  # type: SetPlaybackSpeedAction
            nv = int(_clamp(a.value, 50, 200))
            if nv != a.value:
                clamped.append(f"SET_PLAYBACK_SPEED value {a.value}→{nv}")
                action = SetPlaybackSpeedAction(type="SET_PLAYBACK_SPEED", value=nv)

        # ── ADD_ELEMENT — clamp canvas position ───────────────────────────────
        elif t == "ADD_ELEMENT":
            a = action  # type: AddElementAction
            el = a.element
            el_dict = el.model_dump()
            nx = _clamp_x(el_dict.get("x", 540.0))
            ny = _clamp_y(el_dict.get("y", 960.0))
            pos_changed = nx != el_dict.get("x") or ny != el_dict.get("y")
            if pos_changed:
                clamped.append(
                    f"ADD_ELEMENT {el.type} position clamped to canvas bounds"
                )
                el_dict["x"] = nx
                el_dict["y"] = ny
                # Reconstruct with clamped coords
                from models.ai_editor import EditorElementData
                from pydantic import TypeAdapter

                ta: TypeAdapter[Any] = TypeAdapter(EditorElementData)
                new_el = ta.validate_python(el_dict)
                action = AddElementAction(type="ADD_ELEMENT", element=new_el)

            # Drop ADD_ELEMENT TEXT with empty text
            if el.type == "TEXT" and not getattr(el, "text", "").strip():
                dropped.append("ADD_ELEMENT TEXT with empty text dropped")
                continue

        # ── UPDATE_ELEMENT — clamp patch position if present ─────────────────
        elif t == "UPDATE_ELEMENT":
            a = action  # type: UpdateElementAction
            patch: dict[str, Any] = dict(a.patch)
            patched = False
            if "x" in patch:
                nx = _clamp_x(float(patch["x"]))
                if nx != patch["x"]:
                    patch["x"] = nx
                    patched = True
            if "y" in patch:
                ny = _clamp_y(float(patch["y"]))
                if ny != patch["y"]:
                    patch["y"] = ny
                    patched = True
            if patched:
                clamped.append(f"UPDATE_ELEMENT {a.id} position clamped")
                action = UpdateElementAction(
                    type="UPDATE_ELEMENT", id=a.id, patch=patch
                )

        # ── DETECT_VIRAL_MOMENTS — clamp moment timestamps ────────────────────
        elif t == "DETECT_VIRAL_MOMENTS":
            a = action  # type: DetectViralMomentsAction
            valid_moments = []
            for m in a.moments:
                if not m.hook.strip():
                    dropped.append(
                        f"DETECT_VIRAL_MOMENTS moment at {m.timestamp:.1f}s dropped — empty hook"
                    )
                    continue
                clamped_ts = _clamp_time(m.timestamp, dur)
                if clamped_ts != m.timestamp:
                    clamped.append(
                        f"DETECT_VIRAL_MOMENTS moment timestamp {m.timestamp:.1f}→{clamped_ts:.1f}"
                    )
                valid_moments.append(
                    ViralMoment(timestamp=clamped_ts, hook=m.hook, score=m.score)
                )
            if not valid_moments:
                dropped.append("DETECT_VIRAL_MOMENTS dropped — no valid moments")
                continue
            action = DetectViralMomentsAction(
                type="DETECT_VIRAL_MOMENTS", moments=valid_moments
            )

        # ── GENERATE_HOOK_CAPTION — drop empty caption strings ────────────────
        elif t == "GENERATE_HOOK_CAPTION":
            a = action  # type: GenerateHookCaptionAction
            valid_captions = [c for c in a.captions if c.strip()]
            if not valid_captions:
                dropped.append(
                    "GENERATE_HOOK_CAPTION dropped — all captions were empty"
                )
                continue
            action = GenerateHookCaptionAction(
                type="GENERATE_HOOK_CAPTION", captions=valid_captions
            )

        # ── SUGGEST_STYLE_PRESET — recursively sanitise nested actions ────────
        elif t == "SUGGEST_STYLE_PRESET":
            a = action  # type: SuggestStylePresetAction
            safe_nested, nested_clamped, nested_dropped = sanitise(a.actions, state)
            clamped.extend(nested_clamped)
            dropped.extend(nested_dropped)
            action = SuggestStylePresetAction(
                type="SUGGEST_STYLE_PRESET",
                preset=a.preset,
                reason=a.reason,
                actions=safe_nested,
            )

        # ── EXPLAIN_LAST_EDIT — pass-through (freeform text) ─────────────────
        elif t == "EXPLAIN_LAST_EDIT":
            a = action  # type: ExplainLastEditAction
            if not a.explanation.strip():
                dropped.append("EXPLAIN_LAST_EDIT dropped — empty explanation")
                continue

        safe.append(action)

    return safe, clamped, dropped


# ─── Mock provider ────────────────────────────────────────────────────────────


def mock_response(
    state: AIEditorCurrentState,
) -> tuple[list[AiEditorAction], str, list[str]]:
    """Return 4 deterministic actions without calling Gemini."""
    mid = state.videoDuration / 2 if state.videoDuration > 0 else 5.0
    actions: list[AiEditorAction] = [
        TrimAction(type="TRIM", start=0.0, end=max(state.videoDuration, 1.0)),
        AddCaptionAction(
            type="ADD_CAPTION",
            text="🔥 AI-generated hook",
            startTime=0.0,
            endTime=min(3.0, state.videoDuration),
        ),
        SetVisualFilterAction(type="SET_VISUAL_FILTER", filter="Cinematic"),
        AddElementAction(
            type="ADD_ELEMENT",
            element=TextElementData(
                type="TEXT",
                text="Subscribe for more! 🎯",
                x=540.0,
                y=1700.0,
                scale=1.2,
                color="#a855f7",
            ),
        ),
    ]

    sanitised, _, _ = sanitise(actions, state)
    suggestions = [
        "Add a zoom effect on the speaker",
        "Boost audio to 140%",
        "Split at the first scene break",
    ]
    return (
        sanitised,
        f"Mock: applied {len(sanitised)} demo edits (MOCK_AI_EDITOR=true).",
        suggestions,
    )
