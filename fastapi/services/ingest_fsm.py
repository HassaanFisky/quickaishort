"""Staged media ingest lifecycle (M2) — shared stage vocabulary.

Frontend owns the runtime FSM. This module is the typed contract for docs,
policy payloads, and pytest so FE/BE never drift on stage names.
"""

from __future__ import annotations

from typing import Final, Literal

IngestStage = Literal[
    "idle",
    "identify",
    "validate",
    "acquire_meta",
    "projectize",
    "analyze",
    "ready",
    "failed",
]

INGEST_STAGES: Final[tuple[IngestStage, ...]] = (
    "idle",
    "identify",
    "validate",
    "acquire_meta",
    "projectize",
    "analyze",
    "ready",
    "failed",
)

TERMINAL_STAGES: Final[frozenset[IngestStage]] = frozenset({"ready", "failed"})

# Allowed forward edges. Cancel / hard errors may jump to failed from any
# non-terminal stage (validated separately).
ALLOWED_TRANSITIONS: Final[dict[IngestStage, frozenset[IngestStage]]] = {
    "idle": frozenset({"identify", "failed"}),
    "identify": frozenset({"validate", "failed"}),
    "validate": frozenset({"acquire_meta", "failed"}),
    "acquire_meta": frozenset({"projectize", "failed"}),
    "projectize": frozenset({"analyze", "failed"}),
    "analyze": frozenset({"ready", "failed"}),
    # ready/failed → analyze = re-analysis without full re-ingest (M3 recovery)
    "ready": frozenset({"identify", "idle", "analyze"}),
    "failed": frozenset({"identify", "idle", "analyze"}),
}


def is_terminal(stage: IngestStage) -> bool:
    return stage in TERMINAL_STAGES


def can_transition(current: IngestStage, nxt: IngestStage) -> bool:
    """True if nxt is an allowed edge from current (or same-stage no-op)."""
    if current == nxt:
        return True
    if nxt == "failed" and current not in TERMINAL_STAGES:
        return True
    return nxt in ALLOWED_TRANSITIONS.get(current, frozenset())


def assert_transition(current: IngestStage, nxt: IngestStage) -> None:
    if not can_transition(current, nxt):
        raise ValueError(f"illegal ingest transition: {current} → {nxt}")
