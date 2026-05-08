"""
Per-tier circuit breaker.

Two implementations:
  CircuitBreaker      — in-process (single instance only)
  RedisCircuitBreaker — Redis-backed, shared across all Cloud Run instances

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


class RedisCircuitBreaker:
    """
    Redis-backed circuit breaker — state shared across all Cloud Run instances.

    Uses wall-clock time (time.time) for opened_at so timestamps are
    consistent across processes. Falls back gracefully when Redis is
    unreachable: get() returns {} → state defaults to CLOSED (all tiers
    attempted). This is the safest degraded behavior.
    """

    _PREFIX = "cb:v1:"
    _KEY_TTL = 7200  # 2 hours; keys auto-expire if a tier is never touched

    def __init__(
        self,
        tier_name: str,
        redis_conn: Any,
        failure_threshold: int = 5,
        open_duration_s: float = 120.0,
        success_threshold: int = 2,
        ignore_error_classes: Optional[Set[str]] = None,
    ) -> None:
        self.tier_name = tier_name
        self._r = redis_conn
        self.failure_threshold = failure_threshold
        self.open_duration_s = open_duration_s
        self.success_threshold = success_threshold
        self.ignore_error_classes: Set[str] = ignore_error_classes or {"rate_limited"}
        self._key = f"{self._PREFIX}{tier_name}"

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _get(self) -> dict:
        """Read state hash from Redis. Returns {} on any error."""
        try:
            return self._r.hgetall(self._key) or {}
        except Exception:
            return {}

    def _set(self, mapping: dict) -> None:
        """Write state fields and refresh TTL. Silently ignores Redis errors."""
        try:
            self._r.hset(self._key, mapping=mapping)
            self._r.expire(self._key, self._KEY_TTL)
        except Exception as exc:
            logger.warning("circuit[%s] Redis write error: %s", self.tier_name, exc)

    # ── State queries ──────────────────────────────────────────────────────────

    def is_open(self) -> bool:
        d = self._get()
        state = d.get("state", "CLOSED")
        if state == "OPEN":
            try:
                opened_at = float(d.get("opened_at", 0))
            except (TypeError, ValueError):
                opened_at = 0.0
            if time.time() - opened_at >= self.open_duration_s:
                self._set({"state": "HALF-OPEN", "success_count": "0"})
                logger.info("circuit[%s] → HALF-OPEN (probe allowed)", self.tier_name)
                return False
            return True
        return False

    @property
    def state(self) -> str:
        return self._get().get("state", "CLOSED")

    # ── State transitions ──────────────────────────────────────────────────────

    def record_failure(self, error_class_value: str) -> None:
        if error_class_value in self.ignore_error_classes:
            return
        d = self._get()
        state = d.get("state", "CLOSED")
        if state == "HALF-OPEN":
            self._open()
            return
        try:
            count = self._r.hincrby(self._key, "failure_count", 1)
            self._r.expire(self._key, self._KEY_TTL)
            if state == "CLOSED" and int(count) >= self.failure_threshold:
                self._open()
        except Exception as exc:
            logger.warning("circuit[%s] Redis hincrby error: %s", self.tier_name, exc)

    def record_success(self) -> None:
        d = self._get()
        state = d.get("state", "CLOSED")
        if state == "HALF-OPEN":
            try:
                count = self._r.hincrby(self._key, "success_count", 1)
                if int(count) >= self.success_threshold:
                    self._set({"state": "CLOSED", "failure_count": "0", "opened_at": ""})
                    logger.info("circuit[%s] → CLOSED (recovered)", self.tier_name)
            except Exception as exc:
                logger.warning("circuit[%s] Redis success error: %s", self.tier_name, exc)
        elif state == "CLOSED":
            try:
                count = int(d.get("failure_count", 0))
                if count > 0:
                    self._r.hset(self._key, "failure_count", str(max(0, count - 1)))
            except Exception:
                pass

    # ── Introspection ──────────────────────────────────────────────────────────

    def state_dict(self) -> dict:
        d = self._get()
        opened_at_raw = d.get("opened_at", "")
        try:
            opened_at_f: Optional[float] = float(opened_at_raw) if opened_at_raw else None
        except (TypeError, ValueError):
            opened_at_f = None
        return {
            "state": d.get("state", "CLOSED"),
            "failure_count": int(d.get("failure_count", 0)),
            "success_count": int(d.get("success_count", 0)),
            "open_duration_s": self.open_duration_s,
            "open_since_s": (
                round(time.time() - opened_at_f, 1)
                if opened_at_f is not None
                else None
            ),
        }

    # ── Internal ──────────────────────────────────────────────────────────────

    def _open(self) -> None:
        self._set({
            "state": "OPEN",
            "opened_at": str(time.time()),
            "failure_count": "0",
        })
        logger.warning(
            "circuit[%s] → OPEN for %.0fs (threshold=%d)",
            self.tier_name,
            self.open_duration_s,
            self.failure_threshold,
        )
