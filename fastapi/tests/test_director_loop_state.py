"""Regression tests for deterministic director state construction."""

from services.director_loop import _state_from_context


def test_unknown_duration_fails_closed() -> None:
    state = _state_from_context({"duration": "not-a-duration"})
    assert state.videoDuration == 0.0


def test_missing_duration_fails_closed() -> None:
    state = _state_from_context({})
    assert state.videoDuration == 0.0

    state2 = _state_from_context({"duration": None})
    assert state2.videoDuration == 0.0


def test_duration_fallback() -> None:
    state = _state_from_context({"videoDuration": 45.0})
    assert state.videoDuration == 45.0

    state2 = _state_from_context({"duration": 30.0, "videoDuration": 45.0})
    assert state2.videoDuration == 30.0


def test_duration_zero_is_allowed() -> None:
    state = _state_from_context({"duration": 0.0})
    assert state.videoDuration == 0.0


def test_empty_duration_uses_video_duration() -> None:
    state = _state_from_context({"duration": "", "videoDuration": 45.0})
    assert state.videoDuration == 45.0


def test_invalid_primary_duration_uses_video_duration() -> None:
    state = _state_from_context({"duration": "invalid", "videoDuration": 45.0})
    assert state.videoDuration == 45.0


def test_non_finite_duration_uses_video_duration() -> None:
    state = _state_from_context({"duration": float("inf"), "videoDuration": 45.0})
    assert state.videoDuration == 45.0

    state2 = _state_from_context({"duration": float("nan"), "videoDuration": 45.0})
    assert state2.videoDuration == 45.0


def test_negative_duration_fails_closed_or_uses_video_duration() -> None:
    state = _state_from_context({"duration": -10.0, "videoDuration": 45.0})
    assert state.videoDuration == 45.0


def test_both_durations_missing_or_invalid() -> None:
    state = _state_from_context(
        {"duration": "invalid", "videoDuration": "also-invalid"}
    )
    assert state.videoDuration == 0.0
