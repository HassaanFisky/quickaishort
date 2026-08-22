"""Tests for SemanticEditPlanner and Creative Kernel capability execution."""

import pytest
from services.semantic_edit_planner import SemanticEditPlanner


def test_semantic_planner_brighten_intent():
    res = SemanticEditPlanner.plan("Make this video brighter and fix dark areas")
    assert res is not None
    assert res.matched is True
    assert res.intent == "brighten_and_lift_shadows"
    assert any(a["type"] == "ADD_FILTER" and a["filter"] == "brightness" for a in res.actions)
    assert any(a["type"] == "ADD_FILTER" and a["filter"] == "contrast" for a in res.actions)


def test_semantic_planner_cinematic_look():
    res = SemanticEditPlanner.plan("Make it look cinematic like a Hollywood film")
    assert res is not None
    assert res.matched is True
    assert res.intent == "apply_cinematic_look"
    assert any(a["type"] == "SET_VISUAL_FILTER" and a["filter"] == "Cinematic" for a in res.actions)


def test_semantic_planner_warm_temperature():
    res = SemanticEditPlanner.plan("Warm up the tone and make it golden hour")
    assert res is not None
    assert res.matched is True
    assert res.intent == "warm_temperature_grade"
    assert any(a["type"] == "ADD_FILTER" and a["filter"] == "hue" for a in res.actions)


def test_semantic_planner_audio_cleanup():
    res = SemanticEditPlanner.plan("Clean up background noise and make the voice crisp")
    assert res is not None
    assert res.matched is True
    assert res.intent == "audio_noise_suppression_and_clarity"
    assert any(a["type"] == "SET_NOISE_REDUCTION" for a in res.actions)
    assert any(a["type"] == "SET_AUDIO_BOOST" for a in res.actions)


def test_semantic_planner_speed_adjustment():
    res = SemanticEditPlanner.plan("Make this video faster, 1.5x speed")
    assert res is not None
    assert res.matched is True
    assert res.intent == "increase_playback_speed"
    assert any(a["type"] == "SET_PLAYBACK_SPEED" and a["value"] == 150 for a in res.actions)


def test_semantic_planner_remove_silences():
    res = SemanticEditPlanner.plan("Cut dead air and tighten pacing")
    assert res is not None
    assert res.matched is True
    assert res.intent == "remove_silences_and_dead_air"
    assert any(a["type"] == "REMOVE_SILENCES" for a in res.actions)


def test_semantic_planner_captions_toggle():
    res = SemanticEditPlanner.plan("Turn on subtitles and add captions")
    assert res is not None
    assert res.matched is True
    assert res.intent == "enable_and_style_captions"
    assert any(a["type"] == "TOGGLE_CAPTIONS" and a["enabled"] is True for a in res.actions)


def test_semantic_planner_fade_effects():
    res = SemanticEditPlanner.plan("Add smooth fade in and fade from black", context={"duration": 45.0})
    assert res is not None
    assert res.matched is True
    assert res.intent == "add_fade_in_transition"
    assert any(a["type"] == "ADD_FADE_IN" for a in res.actions)


def test_semantic_planner_unmatched_falls_back():
    res = SemanticEditPlanner.plan("Write an essay about quantum physics")
    assert res is None
