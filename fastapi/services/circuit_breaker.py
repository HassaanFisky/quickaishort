"""
Per-tier circuit breaker.

State machine: CLOSED → OPEN → HALF-OPEN → CLOSED

CLOSED   — normal operation, failures increment counter
OPEN     — tier is skipped entirely; re-examined after open_duration_s
HALF-OPEN — one probe is allowed; success closes, failure re-opens

ignore_error_classes: set of TierError.value strings that do NOT count
as failures (e.g. "rate_limited" — a slow provider is not a dead one).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Optional, Set

logger = logging.getLogger(__name__)


@dataclass
class CircuitBreaker:
    tier_name: str
    failure_threshold: int = 5
    success_threshold: int = 2
    open_duration_s: float = 120.0
    ignore_error_classes: Set[str] = field(default_factory=lambda: {"rate_limited"})

    _state: str = field(default="CLOSED", init=False, repr=False)
    _failure_count: int = field(default=0, init=False, repr=False)
    _success_count: int = field(default=0, init=False, repr=False)
    _opened_at: Optional[float] = field(default=None, init=False, repr=False)

    # ── State queries ──────────────────────────────────────────────────────────

    def is_open(self) -> bool:
        """Returns True if this tier should be skipped on this request."""
        if self._state == "OPEN":
            if time.monotonic() - self._opened_at >= self.open_duration_s:
                self._state = "HALF-OPEN"
                self._success_count = 0
                logger.info("circuit[%s] → HALF-OPEN (probe allowed)", self.tier_name)
                return False
            return True
        return False

    @property
    def state(self) -> str:
        return self._state

    # ── State transitions ──────────────────────────────────────────────────────

    def record_failure(self, error_class_value: str) -> None:
        """
        Call after a tier attempt fails.
        error_class_value is TierError.value (a string) to avoid circular imports.
        """
        if error_class_value in self.ignore_error_classes:
            # Rate limits mean "slow down", not "provider is dead".
            return

        self._failure_count += 1

        if self._state == "HALF-OPEN":
            # A single failure in probe mode re-opens immediately.
            self._open()
            return

        if self._state == "CLOSED" and self._failure_count >= self.failure_threshold:
            self._open()

    def record_success(self) -> None:
        """Call after a tier attempt succeeds and output passes validation."""
        if self._state == "HALF-OPEN":
            self._success_count += 1
            if self._success_count >= self.success_threshold:
                self._state = "CLOSED"
                self._failure_count = 0
                self._opened_at = None
                logger.info("circuit[%s] → CLOSED (recovered)", self.tier_name)
        elif self._state == "CLOSED":
            # Decay failure count on success to avoid stale accumulation.
            self._failure_count = max(0, self._failure_count - 1)

    # ── Introspection ──────────────────────────────────────────────────────────

    def state_dict(self) -> dict:
        """Snapshot suitable for /debug/tiers response."""
        return {
            "state": self._state,
            "failure_count": self._failure_count,
            "success_count": self._success_count,
            "open_duration_s": self.open_duration_s,
            "open_since_s": (
                round(time.monotonic() - self._opened_at, 1)
                if self._opened_at is not None
                else None
            ),
        }

    # ── Internal ──────────────────────────────────────────────────────────────

    def _open(self) -> None:
        self._state = "OPEN"
        self._opened_at = time.monotonic()
        self._failure_count = 0
        logger.warning(
            "circuit[%s] → OPEN for %.0fs (threshold=%d)",
            self.tier_name,
            self.open_duration_s,
            self.failure_threshold,
        )
        # Prometheus metric emitted by ExtractorService to avoid circular import.
