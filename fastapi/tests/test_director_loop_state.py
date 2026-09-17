"""Regression tests for deterministic director state construction."""

from services.director_loop import _state_from_context


def test_unknown_duration_fails_closed() -> None:
    state = _state_from_context({"duration": "not-a-duration"})
    assert state.videoDuration == 0.0


def test_missing_duration_fails_closed() -> None:
    state = _state_from_context({})
    assert state.videoDuration == 0.0
