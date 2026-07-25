"""M2 ingest FSM contract tests."""

from __future__ import annotations

import pytest

from services.ingest_fsm import (
    ALLOWED_TRANSITIONS,
    INGEST_STAGES,
    TERMINAL_STAGES,
    assert_transition,
    can_transition,
    is_terminal,
)


def test_happy_path_transitions() -> None:
    path = (
        "idle",
        "identify",
        "validate",
        "acquire_meta",
        "projectize",
        "analyze",
        "ready",
    )
    for a, b in zip(path, path[1:]):
        assert can_transition(a, b)  # type: ignore[arg-type]
        assert_transition(a, b)  # type: ignore[arg-type]


def test_reanalyze_from_terminal() -> None:
    """M3 — retry analysis without full re-ingest."""
    assert can_transition("ready", "analyze")
    assert can_transition("failed", "analyze")
    assert_transition("ready", "analyze")
    assert_transition("failed", "analyze")


def test_failed_reachable_from_non_terminal() -> None:
    for stage in INGEST_STAGES:
        if stage in TERMINAL_STAGES:
            continue
        assert can_transition(stage, "failed")


def test_illegal_skip_blocked() -> None:
    assert not can_transition("identify", "analyze")
    assert not can_transition("validate", "ready")
    with pytest.raises(ValueError, match="illegal ingest transition"):
        assert_transition("identify", "projectize")


def test_terminal_helpers() -> None:
    assert is_terminal("ready")
    assert is_terminal("failed")
    assert not is_terminal("analyze")
    assert "ready" in TERMINAL_STAGES


def test_fe_be_stage_parity() -> None:
    """Prevent FE/BE stage vocabulary drift (reads ingestFsm.ts)."""
    from pathlib import Path
    import re

    ts = (
        Path(__file__).resolve().parents[2]
        / "frontend"
        / "src"
        / "lib"
        / "studio"
        / "ingestFsm.ts"
    )
    assert ts.is_file(), f"missing FE FSM source: {ts}"
    text = ts.read_text(encoding="utf-8")
    m = re.search(
        r"export const INGEST_STAGES = \[([\s\S]*?)\] as const",
        text,
    )
    assert m, "INGEST_STAGES not found in ingestFsm.ts"
    fe_stages = re.findall(r'"([a-z_]+)"', m.group(1))
    assert fe_stages == list(INGEST_STAGES)


def test_no_orphan_stages_in_transition_map() -> None:
    assert set(ALLOWED_TRANSITIONS.keys()) == set(INGEST_STAGES)
    for targets in ALLOWED_TRANSITIONS.values():
        for t in targets:
            assert t in INGEST_STAGES

