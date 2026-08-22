"""Semantic planner contract.

The planner is a narrow deterministic fast path. These tests pin the two
properties that matter: it must never invert user intent, and it must defer to
the model whenever the request carries negation or a trade-off.
"""

import pytest

from services.semantic_edit_planner import SemanticEditPlanner
from services.tool_registry import get_capability, is_emit_allowed


def _plan(command, context=None):
    return SemanticEditPlanner.plan(command, context)


# ── Polarity: the regression that shipped inverted edits to production ───────


@pytest.mark.parametrize(
    "command,intent,value",
    [
        ("make it brighter", "brighten_clip", 1.2),
        ("brighten the shot", "brighten_clip", 1.2),
        ("the footage is too dark", "brighten_clip", 1.2),
        ("make it less dark", "brighten_clip", 1.2),
        ("make it darker", "darken_clip", 0.85),
        ("reduce the brightness", "darken_clip", 0.85),
        ("make it less bright", "darken_clip", 0.85),
        ("lower the exposure", "darken_clip", 0.85),
    ],
)
def test_brightness_axis_resolves_correct_direction(command, intent, value):
    result = _plan(command)
    assert result is not None, command
    assert result.intent == intent
    assert result.actions == [
        {"type": "ADD_FILTER", "filter": "brightness", "value": value}
    ]


@pytest.mark.parametrize(
    "command,value",
    [
        ("speed it up", 125),
        ("speed it up to 1.5x", 150),
        ("make it faster", 125),
        ("slow it down", 75),
        ("slow down the playback speed", 75),
        ("reduce the playback speed", 75),
    ],
)
def test_speed_axis_resolves_correct_direction(command, value):
    result = _plan(command)
    assert result is not None, command
    assert result.intent == "set_playback_speed"
    assert result.actions == [{"type": "SET_PLAYBACK_SPEED", "value": value}]


@pytest.mark.parametrize(
    "command,enabled",
    [
        ("add captions", True),
        ("turn on subtitles", True),
        ("remove the captions and hide subtitles", False),
        ("hide the subtitles", False),
    ],
)
def test_caption_toggle_checks_disable_before_enable(command, enabled):
    result = _plan(command)
    assert result is not None, command
    assert result.actions == [{"type": "TOGGLE_CAPTIONS", "enabled": enabled}]


# ── Deferral: ambiguity must reach the model, not a lookup table ─────────────


@pytest.mark.parametrize(
    "command",
    [
        "do not speed up the video",
        "don't make it brighter",
        "make it brighter but keep the face natural",
        "brighten the clip without washing out the window",
        "make this talking-head clip brighter but keep skin tones natural",
        "never mute the audio",
        "make the brightness different somehow",
        "write an essay about quantum physics",
        "",
    ],
)
def test_ambiguous_or_negated_requests_defer_to_model(command):
    assert _plan(command) is None


def test_bare_axis_noun_without_direction_defers():
    # "brightness" alone says nothing about which way to move.
    assert _plan("the brightness") is None


# ── Single-direction intents stay deterministic ─────────────────────────────


def test_noise_cleanup_is_single_direction():
    result = _plan("clean up the background noise")
    assert result is not None
    assert result.actions == [{"type": "SET_NOISE_REDUCTION", "value": 75}]


def test_remove_silences_requires_both_verb_and_noun():
    assert _plan("cut the dead air") is not None
    # A bare mention must not trigger a destructive timeline edit.
    assert _plan("there is dead air") is None


@pytest.mark.parametrize(
    "command,preset",
    [
        ("make it cinematic", "Cinematic"),
        ("give it a retro look", "Retro"),
        ("apply a gritty urban style", "Urban"),
    ],
)
def test_style_presets(command, preset):
    result = _plan(command)
    assert result is not None
    assert result.actions == [{"type": "SET_VISUAL_FILTER", "filter": preset}]


def test_reset_clears_filters_and_preset():
    result = _plan("reset the filters")
    assert result is not None
    assert {a["type"] for a in result.actions} == {"RESET_FILTER", "SET_VISUAL_FILTER"}


# ── Registry coupling: the planner cannot invent capabilities ───────────────


def test_every_emitted_capability_is_registered_and_emit_allowed():
    commands = [
        "make it brighter",
        "make it darker",
        "speed it up",
        "slow it down",
        "add captions",
        "hide the captions",
        "clean up the background noise",
        "mute the audio",
        "make it louder",
        "make it cinematic",
        "reset the filters",
        "cut the dead air",
        "make the colors pop",
    ]
    seen = 0
    for command in commands:
        result = _plan(command)
        if result is None:
            continue
        for action in result.actions:
            cid = action["type"]
            assert get_capability(cid) is not None, f"{cid} missing from registry"
            assert is_emit_allowed(cid), f"{cid} is not orchestrator-emit allowed"
            seen += 1
    assert seen > 0


def test_planner_never_reports_certainty():
    # Deterministic does not mean certain; confidence must leave room for the
    # user to disagree, and must never be presented as 1.0.
    for command in ["make it brighter", "add captions", "make it cinematic"]:
        result = _plan(command)
        assert result is not None
        assert 0.0 < result.confidence < 1.0
