"""EP-001 Capability Registry tests.

Run: cd fastapi && PYTHONPATH=. python -m pytest tests/test_tool_registry.py -q
"""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.ai_editor import (
    AIEditorCurrentState,
    SetKeyframeAction,
    TrimAction,
)
from services.ai_editor_sanitiser import sanitise
from services import tool_registry as tr


@pytest.fixture(autouse=True)
def _reload():
    tr.reload_registry()
    yield
    tr.reload_registry()


def make_state(**kwargs) -> AIEditorCurrentState:
    defaults = dict(
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


def test_load_registry_and_assert_valid():
    doc = tr.load_registry()
    assert doc["version"] == 1
    assert len(doc["capabilities"]) >= 70
    tr.assert_registry_valid()


def test_emit_allowed_contains_trim_not_set_keyframe():
    emit_ids = {c["id"] for c in tr.list_emit_allowed()}
    assert "TRIM" in emit_ids
    assert "SET_KEYFRAME" not in emit_ids  # emit=false in bootstrap policy


def test_resolve_alias_razor_to_blade():
    assert tr.resolve_alias("razor_tool") == "BLADE_SPLIT"
    assert tr.resolve_alias("ripple_delete") == "RIPPLE_DELETE"
    assert tr.resolve_alias("ai_extender") is None


def test_normalize_legacy_razor():
    actions, dropped = tr.normalize_command_actions(
        [{"tool": "razor_tool", "params": {"start_time": 12.5}, "order": 1}]
    )
    assert not dropped
    assert actions == [{"type": "BLADE_SPLIT", "time_sec": 12.5}]


def test_normalize_canonical_passthrough():
    actions, dropped = tr.normalize_command_actions(
        [{"type": "TRIM", "start": 0, "end": 10}]
    )
    assert dropped == []
    assert actions[0]["type"] == "TRIM"


def test_normalize_unknown_capability_dropped():
    actions, dropped = tr.normalize_command_actions(
        [{"type": "NOT_A_REAL_TOOL", "foo": 1}]
    )
    assert actions == []
    assert any(d.startswith("unknown_capability:") for d in dropped)


def test_sanitiser_drops_emit_blocked():
    state = make_state()
    # SET_KEYFRAME is in Pydantic union but orchestrator_emit=false
    actions, clamped, dropped = sanitise(
        [
            SetKeyframeAction(
                type="SET_KEYFRAME",
                clip_id="c1",
                property="opacity",
                time_ms=0,
                value=1.0,
            )
        ],
        state,
    )
    assert actions == []
    assert any("emit_blocked:SET_KEYFRAME" in d for d in dropped)


def test_sanitiser_allows_trim():
    state = make_state()
    actions, clamped, dropped = sanitise(
        [TrimAction(type="TRIM", start=0, end=10)],
        state,
    )
    assert len(actions) == 1
    assert actions[0].type == "TRIM"
    assert not any(d.startswith("emit_blocked:") for d in dropped)
    assert not any(d.startswith("unknown_capability:") for d in dropped)


def test_retrieve_and_prompt_builder():
    caps = tr.retrieve_for_intent(["timeline", "clip"], limit=10)
    assert caps
    assert all(c["orchestrator_emit"] for c in caps)
    section = tr.build_planner_prompt_section(caps)
    assert "TRIM" in section or "SPLIT_CLIP" in section or "BLADE_SPLIT" in section
    assert "AVAILABLE CAPABILITIES" in section


def test_orchestrator_prompt_no_hardcoded_seventeen():
    prompt = tr.build_orchestrator_system_prompt("trim silence and add captions")
    assert "selection_tool" not in prompt
    assert "razor_tool" not in prompt
    assert "AVAILABLE CAPABILITIES" in prompt
    assert "ADD_CAPTION" in prompt or "TRIM" in prompt or "REMOVE_SILENCES" in prompt


def test_list_capabilities_lite():
    payload = tr.list_capabilities_public(lite=True)
    assert payload["version"] == 1
    sample = payload["capabilities"][0]
    assert "id" in sample
    assert "param_schema" not in sample
