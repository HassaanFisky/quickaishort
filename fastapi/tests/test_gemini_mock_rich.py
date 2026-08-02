"""Focused tests for Phase 2 MOCK multi-action richness."""

from __future__ import annotations

import json

from services.gemini_mock import build_mock_gemini_text, mock_timeline_plan_dict


def test_mock_silence_pack_is_multi_action():
    raw = build_mock_gemini_text(
        "silence_count: 3 — cut dead air please application/json",
        json_mode=True,
    )
    data = json.loads(raw)
    types = [a["type"] for a in data["actions"]]
    assert "REMOVE_SILENCES" in types
    assert "SEEK" in types
    assert len(data["actions"]) >= 2


def test_mock_viral_pack_includes_detect_and_trim():
    raw = build_mock_gemini_text(
        "viral_top highlights — find the best moment application/json",
        json_mode=True,
    )
    data = json.loads(raw)
    types = [a["type"] for a in data["actions"]]
    assert "DETECT_VIRAL_MOMENTS" in types
    assert "TRIM" in types


def test_mock_hook_pack_from_transcript_slice():
    raw = build_mock_gemini_text(
        "transcript_slice hook_line opening trim application/json",
        json_mode=True,
    )
    data = json.loads(raw)
    types = [a["type"] for a in data["actions"]]
    assert "TRIM" in types
    assert "GENERATE_HOOK_CAPTION" in types or "ADD_CAPTION" in types


def test_default_timeline_fixture_still_valid():
    plan = mock_timeline_plan_dict()
    assert plan["status"] == "ok"
    assert isinstance(plan["actions"], list)
    assert len(plan["actions"]) >= 3
