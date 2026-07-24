"""Redis-backed Gemini 429 circuit with bounded exponential cooldowns.

Author: QuickAI Engineering
Last modified: 2026-07-23
"""

from __future__ import annotations

import logging
import os
import time
from enum import Enum
from typing import Callable, Protocol

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)

_HARD_BLOCK_KEY = "gemini:backpressure:hard"
_TRANSIENT_BLOCK_KEY = "gemini:backpressure:transient"
_FAILURE_KEY = "gemini:backpressure:failures"
_FAILURE_WINDOW_SECONDS = 300
_DEFAULT_BASE_DELAY_SECONDS = 2
_DEFAULT_MAX_DELAY_SECONDS = 60
_DEFAULT_HARD_QUOTA_DELAY_SECONDS = 300


class AsyncRedisBackpressureClient(Protocol):
    async def get(self, key: str) -> object: ...

    async def set(self, key: str, value: object, *, ex: int) -> object: ...

    async def incr(self, key: str) -> object: ...

    async def expire(self, key: str, seconds: int) -> object: ...

    async def delete(self, *keys: str) -> object: ...


class Gemini429Kind(str, Enum):
    TRANSIENT_RATE_LIMIT = "transient_rate_limit"
    HARD_QUOTA = "hard_quota"


class GeminiCooldown(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    kind: Gemini429Kind
    retry_after_seconds: int = Field(ge=1, le=3600)
    blocked_until_epoch: int = Field(ge=0)


class GeminiBackpressureError(RuntimeError):
    """Model call intentionally deferred before another paid request is sent."""

    def __init__(self, cooldown: GeminiCooldown) -> None:
        self.cooldown = cooldown
        reason = (
            "Gemini quota is exhausted."
            if cooldown.kind is Gemini429Kind.HARD_QUOTA
            else "Gemini is temporarily rate limited."
        )
        super().__init__(
            f"{reason} Retry after {cooldown.retry_after_seconds} seconds."
        )


class GeminiBackpressureUnavailable(RuntimeError):
    """Redis state is unknown, so model spend is blocked fail-closed."""


class RedisGeminiBackpressure:
    """Share one provider cooldown across every Cloud Run API instance."""

    def __init__(
        self,
        redis_client: AsyncRedisBackpressureClient,
        *,
        base_delay_seconds: int = _DEFAULT_BASE_DELAY_SECONDS,
        max_delay_seconds: int = _DEFAULT_MAX_DELAY_SECONDS,
        hard_quota_delay_seconds: int = _DEFAULT_HARD_QUOTA_DELAY_SECONDS,
        clock: Callable[[], float] = time.time,
    ) -> None:
        if not 1 <= base_delay_seconds <= max_delay_seconds <= 3600:
            raise ValueError(
                "Backpressure delays must satisfy 1 <= base <= max <= 3600"
            )
        if not 1 <= hard_quota_delay_seconds <= 3600:
            raise ValueError("hard_quota_delay_seconds must be between 1 and 3600")
        self._redis = redis_client
        self._base_delay_seconds = base_delay_seconds
        self._max_delay_seconds = max_delay_seconds
        self._hard_quota_delay_seconds = hard_quota_delay_seconds
        self._clock = clock

    async def check(self) -> None:
        """Reject during an active cooldown without calling Gemini."""

        for block_key in (_HARD_BLOCK_KEY, _TRANSIENT_BLOCK_KEY):
            try:
                raw = await self._redis.get(block_key)
            except Exception as exc:
                raise GeminiBackpressureUnavailable(
                    "Gemini admission state is unavailable; model call blocked."
                ) from exc
            if raw is None:
                continue

            try:
                cooldown = GeminiCooldown.model_validate_json(
                    _decode_redis_value(raw),
                    strict=True,
                )
            except Exception as exc:
                raise GeminiBackpressureUnavailable(
                    "Gemini admission state is invalid; model call blocked."
                ) from exc

            remaining = cooldown.blocked_until_epoch - int(self._clock())
            if remaining <= 0:
                try:
                    await self._redis.delete(block_key)
                except Exception:
                    logger.warning("gemini_backpressure_expired_cleanup_failed")
                continue
            raise GeminiBackpressureError(
                cooldown.model_copy(update={"retry_after_seconds": remaining})
            )

    async def record_429(self, error: BaseException) -> GeminiBackpressureError | None:
        """Persist a hard or transient 429 cooldown; ignore non-429 failures."""

        kind = classify_gemini_429(error)
        if kind is None:
            return None

        try:
            failures = int(await self._redis.incr(_FAILURE_KEY))
            if failures == 1:
                await self._redis.expire(_FAILURE_KEY, _FAILURE_WINDOW_SECONDS)
            delay = self._delay_for(kind, failures, error)
            cooldown = GeminiCooldown(
                kind=kind,
                retry_after_seconds=delay,
                blocked_until_epoch=int(self._clock()) + delay,
            )
            block_key = (
                _HARD_BLOCK_KEY
                if kind is Gemini429Kind.HARD_QUOTA
                else _TRANSIENT_BLOCK_KEY
            )
            await self._redis.set(
                block_key,
                cooldown.model_dump_json(),
                ex=delay,
            )
        except Exception as exc:
            raise GeminiBackpressureUnavailable(
                "Gemini rate-limit state could not be persisted; calls remain blocked."
            ) from exc

        logger.warning(
            "gemini_backpressure_activated kind=%s failures=%d retry_after=%d",
            kind.value,
            failures,
            delay,
        )
        return GeminiBackpressureError(cooldown)

    async def clear_after_success(self) -> None:
        """Best-effort reset after a confirmed provider success."""

        try:
            await self._redis.delete(
                _HARD_BLOCK_KEY,
                _TRANSIENT_BLOCK_KEY,
                _FAILURE_KEY,
            )
        except Exception:
            logger.warning("gemini_backpressure_success_cleanup_failed")

    def _delay_for(
        self,
        kind: Gemini429Kind,
        failures: int,
        error: BaseException,
    ) -> int:
        if kind is Gemini429Kind.HARD_QUOTA:
            return self._hard_quota_delay_seconds
        exponent = min(max(failures - 1, 0), 10)
        computed = min(
            self._base_delay_seconds * (2**exponent),
            self._max_delay_seconds,
        )
        retry_after = _retry_after_header(error)
        return min(
            max(computed, retry_after or 0, 1),
            self._max_delay_seconds,
        )


def classify_gemini_429(error: BaseException) -> Gemini429Kind | None:
    """Separate depleted credits/billing from recoverable provider throttling."""

    if int(getattr(error, "code", 0) or 0) != 429:
        return None
    message = str(getattr(error, "message", "") or error).casefold()
    hard_markers = (
        "prepayment credits depleted",
        "billing account",
        "billing disabled",
        "insufficient balance",
        "quota limit: 0",
        "credit balance",
    )
    if any(marker in message for marker in hard_markers):
        return Gemini429Kind.HARD_QUOTA
    return Gemini429Kind.TRANSIENT_RATE_LIMIT


def _retry_after_header(error: BaseException) -> int | None:
    response = getattr(error, "response", None)
    headers = getattr(response, "headers", None)
    if not headers:
        return None
    raw = headers.get("retry-after")
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _decode_redis_value(raw: object) -> str:
    if isinstance(raw, bytes):
        return raw.decode("utf-8")
    if isinstance(raw, str):
        return raw
    raise TypeError("Redis backpressure value must be bytes or str")


_guard: RedisGeminiBackpressure | None = None


def get_gemini_backpressure() -> RedisGeminiBackpressure:
    global _guard
    if _guard is None:
        from services.queue_service import async_redis_conn

        _guard = RedisGeminiBackpressure(
            async_redis_conn,
            base_delay_seconds=int(
                os.getenv(
                    "GEMINI_BACKOFF_BASE_SECONDS",
                    str(_DEFAULT_BASE_DELAY_SECONDS),
                )
            ),
            max_delay_seconds=int(
                os.getenv(
                    "GEMINI_BACKOFF_MAX_SECONDS",
                    str(_DEFAULT_MAX_DELAY_SECONDS),
                )
            ),
            hard_quota_delay_seconds=int(
                os.getenv(
                    "GEMINI_HARD_QUOTA_COOLDOWN_SECONDS",
                    str(_DEFAULT_HARD_QUOTA_DELAY_SECONDS),
                )
            ),
        )
    return _guard
