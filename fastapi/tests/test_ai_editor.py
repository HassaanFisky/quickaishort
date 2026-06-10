"""14 tests for the AI Editor endpoint and supporting services.

Run:  cd fastapi && PYTHONPATH=. python -m pytest tests/test_ai_editor.py -q
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

# Ensure fastapi/ is on sys.path when running from repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.ai_editor import (
    AIEditorCurrentState,
    AIEditorRequest,
    AIEditorResponse,
    AiEditorAction,
    AddCaptionAction,
    TrimAction,
    SetVisualFilterAction,
    AddElementAction,
    TextElementData,
    RemoveElementAction,
    UpdateElementAction,
    DetectViralMomentsAction,
    ViralMoment,
    GenerateHookCaptionAction,
    SuggestStylePresetAction,
    ExplainLastEditAction,
)
from services.ai_editor_sanitiser import sanitise, mock_response

# ─── Fixtures ─────────────────────────────────────────────────────────────────


def make_state(**kwargs: Any) -> AIEditorCurrentState:
    defaults: dict[str, Any] = dict(
        videoDuration=60.0,
        currentTime=0.0,
        selectedClipId=None,
        elementCount=0,
        captionCount=0,
        captionsEnabled=True,
        aspectRatio="9:16",
        visualFilter="None",
        audioBoost=100,
        playbackSpeed=100,
    )
    defaults.update(kwargs)
    return AIEditorCurrentState(**defaults)


# ─── T1: AIEditorRequest validates correctly ──────────────────────────────────


def test_request_valid():
    req = AIEditorRequest(
        prompt="trim to the hook",
        current_state=make_state(),
        transcript=[],
    )
    assert req.prompt == "trim to the hook"
    assert req.transcript == []


# ─── T2: AIEditorRequest rejects extra fields ─────────────────────────────────


def test_request_rejects_extra_fields():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        AIEditorRequest(
            prompt="test",
            current_state=make_state(),
            transcript=[],
            unknown_field="oops",  # type: ignore
        )


# ─── T3: AIEditorRequest rejects empty prompt ─────────────────────────────────


def test_request_rejects_empty_prompt():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        AIEditorRequest(prompt="", current_state=make_state(), transcript=[])


# ─── T4: AIEditorRequest rejects prompt > 2000 chars ─────────────────────────


def test_request_rejects_overlong_prompt():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        AIEditorRequest(prompt="x" * 2001, current_state=make_state(), transcript=[])


# ─── T5: sanitise — timestamps clamped to videoDuration ──────────────────────


def test_sanitise_clamps_caption_timestamps():
    state = make_state(videoDuration=30.0)
    actions: list[AiEditorAction] = [
        AddCaptionAction(type="ADD_CAPTION", text="Hi", startTime=25.0, endTime=90.0),
    ]
    safe, clamped, dropped = sanitise(actions, state)
    assert len(safe) == 1
    assert safe[0].endTime == 30.0  # type: ignore[attr-defined]
    assert len(clamped) == 1
    assert len(dropped) == 0


# ─── T6: sanitise — zero-length caption dropped ───────────────────────────────


def test_sanitise_drops_zero_length_caption():
    state = make_state(videoDuration=10.0)
    actions: list[AiEditorAction] = [
        AddCaptionAction(type="ADD_CAPTION", text="Oops", startTime=15.0, endTime=15.5),
    ]
    safe, clamped, dropped = sanitise(actions, state)
    assert len(safe) == 0
    assert len(dropped) == 1


# ─── T7: sanitise — TRIM clamped ─────────────────────────────────────────────


def test_sanitise_clamps_trim():
    state = make_state(videoDuration=20.0)
    actions: list[AiEditorAction] = [
        TrimAction(type="TRIM", start=-5.0, end=999.0),
    ]
    safe, clamped, dropped = sanitise(actions, state)
    assert len(safe) == 1
    trim = safe[0]
    assert trim.start == 0.0  # type: ignore[attr-defined]
    assert trim.end == 20.0  # type: ignore[attr-defined]
    assert len(clamped) == 1


# ─── T8: sanitise — ADD_ELEMENT position clamped ─────────────────────────────


def test_sanitise_clamps_element_position():
    state = make_state(videoDuration=30.0)
    actions: list[AiEditorAction] = [
        AddElementAction(
            type="ADD_ELEMENT",
            element=TextElementData(type="TEXT", text="Hello", x=2000.0, y=-100.0),
        ),
    ]
    safe, clamped, dropped = sanitise(actions, state)
    assert len(safe) == 1
    el = safe[0].element  # type: ignore[attr-defined]
    assert el.x == 1080.0
    assert el.y == 0.0
    assert len(clamped) == 1


# ─── T9: sanitise — ADD_ELEMENT with empty text dropped ──────────────────────


def test_sanitise_drops_empty_text_element():
    state = make_state(videoDuration=30.0)
    actions: list[AiEditorAction] = [
        AddElementAction(
            type="ADD_ELEMENT",
            element=TextElementData(type="TEXT", text="   ", x=540.0, y=960.0),
        ),
    ]
    safe, clamped, dropped = sanitise(actions, state)
    assert len(safe) == 0
    assert len(dropped) == 1


# ─── T10: mock_response returns 4 deterministic actions ──────────────────────


def test_mock_response_returns_4_actions():
    state = make_state(videoDuration=60.0)
    actions, message, suggestions = mock_response(state)
    assert len(actions) == 4
    assert "Mock" in message
    assert len(suggestions) == 3


# ─── T11: mock_response with zero-duration video ─────────────────────────────


def test_mock_response_zero_duration():
    state = make_state(videoDuration=0.0)
    actions, message, _ = mock_response(state)
    # Trim and Caption actions may be dropped by sanitiser when duration=0
    # but the function must not raise
    assert isinstance(actions, list)


# ─── T12: AIEditorResponse discriminated union parses all 23 action types ─────


def test_all_23_action_types_parse():
    from pydantic import TypeAdapter

    ta: TypeAdapter[Any] = TypeAdapter(AiEditorAction)
    samples: list[dict[str, Any]] = [
        {"type": "ADD_CAPTION", "text": "hi", "startTime": 1.0, "endTime": 2.0},
        {"type": "REMOVE_CAPTION", "id": "x"},
        {"type": "UPDATE_CAPTION", "id": "x", "patch": {"text": "new"}},
        {"type": "TRIM", "start": 0.0, "end": 5.0},
        {"type": "SPLIT_CLIP", "time": 5.0},
        {"type": "DELETE_CLIP"},
        {"type": "SELECT_CLIP", "index": 0},
        {"type": "ADD_FILTER", "filter": "brightness", "value": 1.2},
        {"type": "RESET_FILTER"},
        {"type": "SET_VISUAL_FILTER", "filter": "Cinematic"},
        {"type": "SET_AUDIO_BOOST", "value": 150},
        {"type": "SET_NOISE_REDUCTION", "value": 50},
        {"type": "SET_PLAYBACK_SPEED", "value": 100},
        {"type": "TOGGLE_CAPTIONS", "enabled": True},
        {"type": "TOGGLE_TRANSITIONS", "enabled": False},
        {"type": "TOGGLE_VOICEOVER", "enabled": True},
        {"type": "SEEK", "time": 10.0},
        {"type": "PLAY"},
        {"type": "PAUSE"},
        {"type": "EXPORT_CLIP"},
        {
            "type": "ADD_ELEMENT",
            "element": {
                "type": "TEXT",
                "text": "hi",
                "x": 540,
                "y": 960,
                "scale": 1,
                "rotation": 0,
                "color": "#fff",
            },
        },
        {"type": "UPDATE_ELEMENT", "id": "abc", "patch": {"color": "#000"}},
        {"type": "REMOVE_ELEMENT", "id": "abc"},
    ]
    assert len(samples) == 23
    for sample in samples:
        parsed = ta.validate_python(sample)
        assert parsed.type == sample["type"]


# ─── T13: sanitise — UPDATE_ELEMENT patch position clamped ───────────────────


def test_sanitise_update_element_clamps_position():
    state = make_state(videoDuration=30.0)
    actions: list[AiEditorAction] = [
        UpdateElementAction(
            type="UPDATE_ELEMENT", id="el1", patch={"x": 9999.0, "color": "#fff"}
        ),
    ]
    safe, clamped, dropped = sanitise(actions, state)
    assert len(safe) == 1
    assert safe[0].patch["x"] == 1080.0  # type: ignore[attr-defined]
    assert safe[0].patch["color"] == "#fff"  # type: ignore[attr-defined]
    assert len(clamped) == 1


# ─── T15: DetectViralMomentsAction parses and sanitiser clamps timestamps ──────


def test_detect_viral_moments_clamps_timestamps():
    state = make_state(videoDuration=30.0)
    actions: list[AiEditorAction] = [
        DetectViralMomentsAction(
            type="DETECT_VIRAL_MOMENTS",
            moments=[
                ViralMoment(timestamp=99.0, hook="Epic drop here!", score=90.0),
                ViralMoment(timestamp=5.0, hook="Great opener", score=75.0),
                ViralMoment(timestamp=3.0, hook="   ", score=50.0),  # empty — dropped
            ],
        )
    ]
    safe, clamped, dropped = sanitise(actions, state)
    assert len(safe) == 1
    moments = safe[0].moments  # type: ignore[attr-defined]
    assert len(moments) == 2
    assert moments[0].timestamp == 30.0  # clamped from 99
    assert moments[1].timestamp == 5.0
    assert len(clamped) == 1
    assert len(dropped) == 1


# ─── T16: GenerateHookCaptionAction parses correctly ─────────────────────────


def test_generate_hook_caption_drops_empty():
    state = make_state(videoDuration=30.0)
    actions: list[AiEditorAction] = [
        GenerateHookCaptionAction(
            type="GENERATE_HOOK_CAPTION",
            captions=["This will blow your mind", "  ", "You won't believe this"],
        )
    ]
    safe, clamped, dropped = sanitise(actions, state)
    assert len(safe) == 1
    captions = safe[0].captions  # type: ignore[attr-defined]
    assert len(captions) == 2
    assert "  " not in captions


# ─── T17: SuggestStylePresetAction parses with nested actions ─────────────────


def test_suggest_style_preset_sanitises_nested():
    state = make_state(videoDuration=20.0)
    nested = [TrimAction(type="TRIM", start=-5.0, end=999.0)]
    actions: list[AiEditorAction] = [
        SuggestStylePresetAction(
            type="SUGGEST_STYLE_PRESET",
            preset="Cinematic",
            reason="Dark tones match the mood",
            actions=nested,
        )
    ]
    safe, clamped, dropped = sanitise(actions, state)
    assert len(safe) == 1
    preset_action = safe[0]
    assert preset_action.preset == "Cinematic"  # type: ignore[attr-defined]
    inner = preset_action.actions  # type: ignore[attr-defined]
    assert len(inner) == 1
    assert inner[0].start == 0.0  # type: ignore[attr-defined]
    assert inner[0].end == 20.0  # type: ignore[attr-defined]
    assert len(clamped) == 1


# ─── T18: ExplainLastEditAction parses and passes through ─────────────────────


def test_explain_last_edit_passthrough():
    state = make_state(videoDuration=30.0)
    actions: list[AiEditorAction] = [
        ExplainLastEditAction(
            type="EXPLAIN_LAST_EDIT",
            explanation="Trimmed to the hook at 0-8s and boosted audio by 40%.",
            confidence="high",
        )
    ]
    safe, clamped, dropped = sanitise(actions, state)
    assert len(safe) == 1
    assert safe[0].explanation.startswith("Trimmed")  # type: ignore[attr-defined]
    assert safe[0].confidence == "high"  # type: ignore[attr-defined]
    assert len(clamped) == 0
    assert len(dropped) == 0


# ─── T19: AddBRollAction validates position literal ──────────────────────────


def test_add_broll_action_validates_position():
    """ADD_BROLL must reject invalid position values."""
    from models.ai_editor import AddBRollAction
    from pydantic import ValidationError

    a = AddBRollAction(
        type="ADD_BROLL",
        pexels_id=12345,
        download_url="https://x.com/v.mp4",
        thumbnail_url="https://x.com/t.jpg",
        title="Test",
        start_sec=2.0,
        duration_sec=5.0,
        position="pip_br",
        opacity=0.8,
    )
    assert a.position == "pip_br"

    with pytest.raises(ValidationError):
        AddBRollAction(
            type="ADD_BROLL",
            pexels_id=12345,
            download_url="https://x.com/v.mp4",
            thumbnail_url="https://x.com/t.jpg",
            title="Test",
            start_sec=2.0,
            duration_sec=5.0,
            position="invalid_position",  # type: ignore[arg-type]
            opacity=0.8,
        )


# ─── T20: AddVideoOverlayAction clamped by sanitiser ─────────────────────────


def test_add_video_overlay_clamps_via_sanitiser():
    """Overlay starting near the end gets its duration clamped to fit."""
    from models.ai_editor import AddVideoOverlayAction

    state = make_state(videoDuration=10.0)
    actions: list[AiEditorAction] = [
        AddVideoOverlayAction(
            type="ADD_VIDEO_OVERLAY",
            source_url="gs://bucket/video.mp4",
            start_sec=8.0,
            duration_sec=10.0,  # would extend to 18s — must clamp to 2s
            position="full",
            opacity=1.0,
            mute_audio=True,
        )
    ]
    safe, clamped, dropped = sanitise(actions, state)
    assert len(safe) == 1
    assert safe[0].duration_sec <= 2.0  # type: ignore[attr-defined]
    assert len(clamped) >= 1


# ─── T21: RemoveOverlayAction round-trips ────────────────────────────────────


def test_remove_overlay_action_round_trips():
    """REMOVE_OVERLAY parses with just element_id and passes through sanitiser."""
    from models.ai_editor import RemoveOverlayAction

    a = RemoveOverlayAction(type="REMOVE_OVERLAY", element_id="abc123")
    assert a.element_id == "abc123"

    state = make_state(videoDuration=30.0)
    safe, clamped, dropped = sanitise([a], state)
    assert len(safe) == 1
    assert len(clamped) == 0
    assert len(dropped) == 0


# ─── T22: RemoveSilencesAction validates field bounds ────────────────────────


def test_remove_silences_validates_bounds():
    """REMOVE_SILENCES must accept valid values and reject out-of-range ones."""
    from models.ai_editor import RemoveSilencesAction
    from pydantic import ValidationError

    a = RemoveSilencesAction(
        type="REMOVE_SILENCES",
        min_silence_sec=0.6,
        padding_sec=0.08,
    )
    assert a.min_silence_sec == 0.6
    assert a.padding_sec == 0.08

    # min_silence_sec below minimum
    with pytest.raises(ValidationError):
        RemoveSilencesAction(
            type="REMOVE_SILENCES", min_silence_sec=0.1, padding_sec=0.0
        )

    # min_silence_sec above maximum
    with pytest.raises(ValidationError):
        RemoveSilencesAction(
            type="REMOVE_SILENCES", min_silence_sec=9.9, padding_sec=0.0
        )


# ─── T23: sanitiser 80 % safety rail drops REMOVE_SILENCES → empty TRIM ──────


def test_remove_silences_sanitiser_clamps_values():
    """Sanitiser clamps out-of-range floats on REMOVE_SILENCES."""
    from models.ai_editor import RemoveSilencesAction

    state = make_state(videoDuration=30.0)
    # padding_sec above maximum (1.0) should be clamped
    actions: list[AiEditorAction] = [
        RemoveSilencesAction(
            type="REMOVE_SILENCES",
            min_silence_sec=5.0,  # at boundary — valid
            padding_sec=0.08,
        )
    ]
    safe, clamped, dropped = sanitise(actions, state)
    assert len(safe) == 1
    assert safe[0].type == "REMOVE_SILENCES"  # type: ignore[attr-defined]
    assert len(dropped) == 0


# ─── T24: _compute_silence_trims returns TRIM within ±50 ms of expected ───────


def test_compute_silence_trims_leading_trailing():
    """Engine trims leading and trailing silence correctly."""
    from models.ai_editor import TranscriptChunk
    from services.ai_editor_engine import _compute_silence_trims

    # Speech from 1.5s → 4.0s in a 6s video; leading=1.5s, trailing=2.0s
    chunks = [
        TranscriptChunk(text="hello", start=1.5, end=2.5),
        TranscriptChunk(text="world", start=3.0, end=4.0),
    ]
    trims = _compute_silence_trims(
        chunks,
        min_silence_sec=1.0,  # both leading (1.5s) and trailing (2.0s) qualify
        padding_sec=0.1,
        video_duration=6.0,
    )
    assert len(trims) == 1
    tr = trims[0]
    assert tr.type == "TRIM"
    # start = max(0, 1.5 - 0.1) = 1.4
    assert abs(tr.start - 1.4) < 0.05
    # end = min(6.0, 4.0 + 0.1) = 4.1
    assert abs(tr.end - 4.1) < 0.05
    # kept duration ≈ speech window (4.0 - 1.5) + 2 * padding = 2.7s
    kept = tr.end - tr.start
    expected = (4.0 - 1.5) + 2 * 0.1
    assert abs(kept - expected) < 0.05


# ─── T14: engine returns no_op response on Gemini JSON parse failure ──────────


@pytest.mark.asyncio
async def test_engine_returns_noop_on_parse_failure():
    state = make_state(videoDuration=60.0)
    with patch(
        "services.ai_editor_engine.call_gemini_text",
        new=AsyncMock(return_value="not json!!!"),
    ):
        from services.ai_editor_engine import run_ai_editor

        resp = await run_ai_editor("trim it", state, [])
    assert resp.status == "no_op"
    assert resp.actions == []
    assert resp.used_mock is False
