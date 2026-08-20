"""Global Gemini call budget — fail-closed before any paid generateContent.

Protects small AI Studio prepaid top-ups from runaway fan-out (retries,
analyze storms, suggestion LLM, multi-agent loops). Redis counters are
shared across every Cloud Run API instance.

Author: QuickAI Engineering
Last modified: 2026-08-02
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from typing import Callable, Protocol

logger = logging.getLogger(__name__)

_DAILY_KEY_PREFIX = "gemini:spend:daily:"
_HOURLY_KEY_PREFIX = "gemini:spend:hourly:"

# Tight canary defaults — raise via env after product is stable.
_DEFAULT_DAILY_CALL_CAP = 40
_DEFAULT_HOURLY_CALL_CAP = 12


class AsyncRedisSpendClient(Protocol):
    async def get(self, key: str) -> object: ...

    async def incr(self, key: str) -> object: ...

    async def expire(self, key: str, seconds: int) -> object: ...

    async def decr(self, key: str) -> object: ...


class GeminiSpendCapError(RuntimeError):
    """Paid Gemini call blocked by kill-switch or call-budget ceiling."""

    def __init__(
        self,
        *,
        reason: str,
        retry_after_seconds: int,
        daily_used: int | None = None,
        daily_cap: int | None = None,
        hourly_used: int | None = None,
        hourly_cap: int | None = None,
    ) -> None:
        self.reason = reason
        self.retry_after_seconds = max(1, int(retry_after_seconds))
        self.daily_used = daily_used
        self.daily_cap = daily_cap
        self.hourly_used = hourly_used
        self.hourly_cap = hourly_cap
        super().__init__(
            f"Gemini spend blocked ({reason}). "
            f"Retry after {self.retry_after_seconds} seconds."
        )


class GeminiSpendCapUnavailable(RuntimeError):
    """Redis budget state unknown — block spend fail-closed."""


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return int(str(raw).strip())
    except ValueError:
        logger.error("gemini_spend_cap_invalid_env name=%s raw=%r", name, raw)
        return default


def _env_flag(name: str, *, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def is_gemini_spend_kill_switch() -> bool:
    """Emergency hard stop — no live generateContent until founder clears env."""

    return _env_flag("GEMINI_SPEND_KILL_SWITCH", default=False)


def daily_call_cap() -> int:
    """Max live Gemini calls per UTC day (0 = unlimited for that dimension)."""

    return max(0, _env_int("GEMINI_DAILY_CALL_CAP", _DEFAULT_DAILY_CALL_CAP))


def hourly_call_cap() -> int:
    """Max live Gemini calls per UTC hour (0 = unlimited for that dimension)."""

    return max(0, _env_int("GEMINI_HOURLY_CALL_CAP", _DEFAULT_HOURLY_CALL_CAP))


class RedisGeminiSpendCap:
    """Admit-or-block gate counted before every paid Gemini HTTP call."""

    def __init__(
        self,
        redis_client: AsyncRedisSpendClient,
        *,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._redis = redis_client
        self._clock = clock

    def _utc_now(self) -> datetime:
        return datetime.fromtimestamp(self._clock(), tz=timezone.utc)

    def _daily_key(self, now: datetime) -> str:
        return f"{_DAILY_KEY_PREFIX}{now.strftime('%Y%m%d')}"

    def _hourly_key(self, now: datetime) -> str:
        return f"{_HOURLY_KEY_PREFIX}{now.strftime('%Y%m%d%H')}"

    @staticmethod
    def _seconds_until_next_utc_day(now: datetime) -> int:
        tomorrow = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        from datetime import timedelta

        tomorrow = tomorrow + timedelta(days=1)
        return max(1, int((tomorrow - now).total_seconds()))

    @staticmethod
    def _seconds_until_next_utc_hour(now: datetime) -> int:
        from datetime import timedelta

        nxt = datetime(
            now.year, now.month, now.day, now.hour, tzinfo=timezone.utc
        ) + timedelta(hours=1)
        return max(1, int((nxt - now).total_seconds()))

    async def snapshot(self) -> dict[str, object]:
        """Read-only budget state for health/UX — never raises on Redis issues."""

        now = self._utc_now()
        daily_cap = daily_call_cap()
        hourly_cap = hourly_call_cap()
        kill = is_gemini_spend_kill_switch()
        daily_used: int | None = None
        hourly_used: int | None = None
        state = "open"
        try:
            raw_d = await self._redis.get(self._daily_key(now))
            raw_h = await self._redis.get(self._hourly_key(now))
            daily_used = int(raw_d) if raw_d is not None else 0
            hourly_used = int(raw_h) if raw_h is not None else 0
        except Exception:
            return {
                "kill_switch": kill,
                "blocked": None,
                "reason": None,
                "daily_used": None,
                "daily_cap": daily_cap,
                "hourly_used": None,
                "hourly_cap": hourly_cap,
                "state": "unavailable",
            }

        reason = None
        blocked = False
        if kill:
            blocked = True
            reason = "kill_switch"
            state = "blocked"
        elif daily_cap > 0 and daily_used >= daily_cap:
            blocked = True
            reason = "daily_cap"
            state = "blocked"
        elif hourly_cap > 0 and hourly_used >= hourly_cap:
            blocked = True
            reason = "hourly_cap"
            state = "blocked"

        return {
            "kill_switch": kill,
            "blocked": blocked,
            "reason": reason,
            "daily_used": daily_used,
            "daily_cap": daily_cap,
            "hourly_used": hourly_used,
            "hourly_cap": hourly_cap,
            "state": state,
        }

    async def admit(self) -> None:
        """Consume one budget slot or raise before any paid provider call.

        Fail-closed: Redis errors and kill-switch never allow spend.
        On hourly reject after a successful daily incr, daily is decremented
        best-effort so a blocked hour does not silently eat the day budget.
        """

        if is_gemini_spend_kill_switch():
            raise GeminiSpendCapError(
                reason="kill_switch",
                retry_after_seconds=3600,
            )

        now = self._utc_now()
        d_cap = daily_call_cap()
        h_cap = hourly_call_cap()
        d_key = self._daily_key(now)
        h_key = self._hourly_key(now)

        try:
            if d_cap > 0:
                daily_used = int(await self._redis.incr(d_key))
                if daily_used == 1:
                    await self._redis.expire(
                        d_key, self._seconds_until_next_utc_day(now) + 60
                    )
                if daily_used > d_cap:
                    try:
                        await self._redis.decr(d_key)
                    except Exception:
                        logger.warning("gemini_spend_cap_daily_rollback_failed")
                    raise GeminiSpendCapError(
                        reason="daily_cap",
                        retry_after_seconds=self._seconds_until_next_utc_day(now),
                        daily_used=d_cap,
                        daily_cap=d_cap,
                    )
            else:
                daily_used = None

            if h_cap > 0:
                hourly_used = int(await self._redis.incr(h_key))
                if hourly_used == 1:
                    await self._redis.expire(
                        h_key, self._seconds_until_next_utc_hour(now) + 60
                    )
                if hourly_used > h_cap:
                    try:
                        await self._redis.decr(h_key)
                    except Exception:
                        logger.warning("gemini_spend_cap_hourly_rollback_failed")
                    if d_cap > 0:
                        try:
                            await self._redis.decr(d_key)
                        except Exception:
                            logger.warning("gemini_spend_cap_daily_compensation_failed")
                    raise GeminiSpendCapError(
                        reason="hourly_cap",
                        retry_after_seconds=self._seconds_until_next_utc_hour(now),
                        daily_used=daily_used if daily_used is not None else None,
                        daily_cap=d_cap if d_cap > 0 else None,
                        hourly_used=h_cap,
                        hourly_cap=h_cap,
                    )
        except GeminiSpendCapError:
            raise
        except Exception as exc:
            raise GeminiSpendCapUnavailable(
                "Gemini spend budget state unavailable; model call blocked."
            ) from exc

        logger.info(
            "gemini_spend_cap_admitted daily=%s/%s hourly_cap=%s",
            daily_used if daily_used is not None else "unlimited",
            d_cap if d_cap > 0 else "unlimited",
            h_cap if h_cap > 0 else "unlimited",
        )


_guard: RedisGeminiSpendCap | None = None


def get_gemini_spend_cap() -> RedisGeminiSpendCap:
    global _guard
    if _guard is None:
        from services.queue_service import async_redis_conn

        _guard = RedisGeminiSpendCap(async_redis_conn)
    return _guard
