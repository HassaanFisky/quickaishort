"""Fail-closed plan limits for AI and export workloads.

Author: QuickAI Engineering
Last modified: 2026-07-23
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field, model_validator

logger = logging.getLogger(__name__)

FREE_STORAGE_LIMIT_BYTES = 500 * 1024 * 1024
FREE_DAILY_AI_VIDEO_LIMIT = 3
# 720p portrait/landscape long-edge lock (1280) with short-edge 720.
FREE_OUTPUT_SHORT_EDGE = 720
FREE_OUTPUT_LONG_EDGE = 1280
FREE_WATERMARK_TEXT = "Made with QuickAI"
_RESOURCE_CEILING_PREFIX = "Resource ceiling crossed"


class UserTier(str, Enum):
    FREE = "free"
    PRO = "pro"


class ExportResolution(str, Enum):
    HD_720P = "720p"
    FULL_HD_1080P = "1080p"
    UHD_4K = "4k"


class LimitActionIntent(str, Enum):
    ALLOW = "ALLOW"
    UPGRADE_PRO = "UPGRADE_PRO"


class LimitReason(str, Enum):
    ALLOWED = "allowed"
    EXPORT_RESOLUTION = "export_resolution"
    DEEP_ANALYSIS = "deep_analysis"
    STORAGE_LIMIT = "storage_limit"
    DAILY_VIDEO_LIMIT = "daily_video_limit"


class PlanLimits(BaseModel):
    """Immutable plan capabilities consumed by routers and render admission."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    max_export_resolution: ExportResolution
    watermark_required: bool
    watermark_text: str | None = Field(default=None, max_length=80)
    storage_limit_bytes: int | None = Field(default=None, ge=1)
    deep_analysis_allowed: bool
    daily_ai_video_limit: int | None = Field(default=None, ge=1)


class RenderPolicy(BaseModel):
    """Trusted worker-side output policy derived from billing tier."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    resolution: ExportResolution
    output_width: int = Field(ge=144, le=2160)
    output_height: int = Field(ge=144, le=3840)
    watermark_required: bool
    watermark_text: str | None = Field(default=None, max_length=80)


FREE_PLAN_LIMITS = PlanLimits(
    max_export_resolution=ExportResolution.HD_720P,
    watermark_required=True,
    watermark_text=FREE_WATERMARK_TEXT,
    storage_limit_bytes=FREE_STORAGE_LIMIT_BYTES,
    deep_analysis_allowed=False,
    daily_ai_video_limit=FREE_DAILY_AI_VIDEO_LIMIT,
)

PRO_PLAN_LIMITS = PlanLimits(
    max_export_resolution=ExportResolution.UHD_4K,
    watermark_required=False,
    watermark_text=None,
    storage_limit_bytes=None,
    deep_analysis_allowed=True,
    daily_ai_video_limit=None,
)

_RESOLUTION_RANK = {
    ExportResolution.HD_720P: 1,
    ExportResolution.FULL_HD_1080P: 2,
    ExportResolution.UHD_4K: 3,
}
_FOUR_K_PATTERN = re.compile(r"\b(?:4\s*k|uhd|2160p?)\b", re.IGNORECASE)
_DEEP_ANALYSIS_PATTERN = re.compile(
    r"\bdeep(?:\s+semantic)?\s+analysis\b",
    re.IGNORECASE,
)


class LimitRequest(BaseModel):
    """A single admission decision evaluated before model or render spend."""

    model_config = ConfigDict(extra="forbid", strict=True)

    workload_id: str | None = Field(default=None, min_length=1, max_length=256)
    requested_export_resolution: ExportResolution = ExportResolution.HD_720P
    deep_analysis: bool = False
    projected_storage_bytes: int | None = Field(default=None, ge=0)
    reserve_daily_video: bool = False

    @model_validator(mode="after")
    def require_workload_for_daily_reservation(self) -> "LimitRequest":
        if self.reserve_daily_video and not self.workload_id:
            raise ValueError("workload_id is required when reserve_daily_video is true")
        return self


def build_limit_request(
    *,
    query: str,
    workload_id: str | None,
    requested_export_resolution: ExportResolution = ExportResolution.HD_720P,
    deep_analysis: bool = False,
    projected_storage_bytes: int | None = None,
    reserve_daily_video: bool = False,
) -> LimitRequest:
    """Derive explicit 4K/deep intent before any model is called."""

    resolution = requested_export_resolution
    if _FOUR_K_PATTERN.search(query):
        resolution = ExportResolution.UHD_4K
    return LimitRequest(
        workload_id=workload_id,
        requested_export_resolution=resolution,
        deep_analysis=deep_analysis or bool(_DEEP_ANALYSIS_PATTERN.search(query)),
        projected_storage_bytes=projected_storage_bytes,
        reserve_daily_video=reserve_daily_video,
    )


class UsageReservation(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    user_id: str
    day_key: str
    workload_id: str
    newly_reserved: bool


class LimitDecision(BaseModel):
    """Strict JSON-safe business decision returned to API/model callers."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    allowed: bool
    action_intent: LimitActionIntent
    reason: LimitReason
    message: str
    tier: UserTier
    limits: PlanLimits
    effective_export_resolution: ExportResolution
    watermark_required: bool
    watermark_text: str | None = None
    daily_videos_used: int | None = None


class LimitEvaluation(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    decision: LimitDecision
    reservation: UsageReservation | None = None


class LimitServiceUnavailable(RuntimeError):
    """Redis usage state is unknown; admission must fail closed."""


class DailyUsageStore(Protocol):
    async def reserve_unique_workload(
        self,
        *,
        user_id: str,
        workload_id: str,
        limit: int,
    ) -> tuple[bool, int, UsageReservation | None]: ...

    async def release(self, reservation: UsageReservation) -> None: ...


class AsyncRedisDailyClient(Protocol):
    async def sadd(self, key: str, *values: str) -> object: ...

    async def scard(self, key: str) -> object: ...

    async def sismember(self, key: str, value: str) -> object: ...

    async def srem(self, key: str, *values: str) -> object: ...

    async def expire(self, key: str, seconds: int) -> object: ...


class RedisDailyUsageStore:
    """UTC-day unique-workload counter with automatic expiry past midnight."""

    def __init__(self, redis_client: AsyncRedisDailyClient) -> None:
        self._redis = redis_client

    async def reserve_unique_workload(
        self,
        *,
        user_id: str,
        workload_id: str,
        limit: int,
    ) -> tuple[bool, int, UsageReservation | None]:
        day_key = _utc_day_key()
        redis_key = f"limits:daily-videos:{_safe_user_hash(user_id)}:{day_key}"
        try:
            already = bool(await self._redis.sismember(redis_key, workload_id))
            if already:
                used = int(await self._redis.scard(redis_key))
                return True, used, None

            used_before = int(await self._redis.scard(redis_key))
            if used_before >= limit:
                return False, used_before, None

            added = int(await self._redis.sadd(redis_key, workload_id))
            used = int(await self._redis.scard(redis_key))
            await self._redis.expire(redis_key, _seconds_until_utc_rollover())
            if added == 0:
                return True, used, None
            if used > limit:
                await self._redis.srem(redis_key, workload_id)
                return False, used - 1, None
            return (
                True,
                used,
                UsageReservation(
                    user_id=user_id,
                    day_key=day_key,
                    workload_id=workload_id,
                    newly_reserved=True,
                ),
            )
        except Exception as exc:
            raise LimitServiceUnavailable(
                "Daily usage state unavailable; admission blocked."
            ) from exc

    async def release(self, reservation: UsageReservation) -> None:
        if not reservation.newly_reserved:
            return
        redis_key = (
            f"limits:daily-videos:{_safe_user_hash(reservation.user_id)}"
            f":{reservation.day_key}"
        )
        try:
            await self._redis.srem(redis_key, reservation.workload_id)
        except Exception:
            logger.warning(
                "daily_usage_release_failed user_hash=%s",
                _safe_user_hash(reservation.user_id),
            )


def get_plan_limits(tier: UserTier) -> PlanLimits:
    return PRO_PLAN_LIMITS if tier is UserTier.PRO else FREE_PLAN_LIMITS


def get_render_policy(
    tier: UserTier,
    *,
    aspect_ratio: str,
    requested_resolution: ExportResolution = ExportResolution.FULL_HD_1080P,
) -> RenderPolicy:
    """Build dimensions and watermark rules the worker must enforce."""

    resolution = (
        ExportResolution.HD_720P if tier is UserTier.FREE else requested_resolution
    )
    if resolution is ExportResolution.HD_720P:
        short_edge = FREE_OUTPUT_SHORT_EDGE
        long_edge = FREE_OUTPUT_LONG_EDGE
    else:
        short_edge = {
            ExportResolution.FULL_HD_1080P: 1080,
            ExportResolution.UHD_4K: 2160,
        }[resolution]
        long_edge = round(short_edge * 16 / 9)

    if aspect_ratio == "1:1":
        output_width = short_edge
        output_height = short_edge
    elif aspect_ratio in {"16:9", "landscape"}:
        output_width = long_edge
        output_height = short_edge
    else:
        # Default product canvas is vertical 9:16 shorts.
        output_width = short_edge
        output_height = long_edge

    limits = get_plan_limits(tier)
    return RenderPolicy(
        resolution=resolution,
        output_width=output_width,
        output_height=output_height,
        watermark_required=limits.watermark_required,
        watermark_text=limits.watermark_text,
    )


async def check_user_tier(user_id: str) -> UserTier:
    """Resolve billing state fail-closed: unknown/outage users remain Free."""

    if not user_id or user_id == "anonymous":
        return UserTier.FREE

    try:
        from services.stats_service import get_user_stats

        stats = await get_user_stats(user_id)
    except Exception:
        logger.error("tier_lookup_failed user_id_hash=%s", _safe_user_hash(user_id))
        return UserTier.FREE

    return (
        UserTier.PRO
        if bool(stats.get("is_pro") or stats.get("is_premium"))
        else UserTier.FREE
    )


def evaluate_static_limits(
    *,
    tier: UserTier,
    request: LimitRequest,
) -> LimitDecision:
    """Evaluate the fixed plan matrix without mutating external usage state."""

    limits = get_plan_limits(tier)
    common = {
        "tier": tier,
        "limits": limits,
        "effective_export_resolution": limits.max_export_resolution,
        "watermark_required": limits.watermark_required,
        "watermark_text": limits.watermark_text,
    }

    if (
        _RESOLUTION_RANK[request.requested_export_resolution]
        > _RESOLUTION_RANK[limits.max_export_resolution]
    ):
        return LimitDecision(
            allowed=False,
            action_intent=LimitActionIntent.UPGRADE_PRO,
            reason=LimitReason.EXPORT_RESOLUTION,
            message=f"{_RESOURCE_CEILING_PREFIX}. Upgrade to Pro for exports above 720p.",
            **common,
        )

    if request.deep_analysis and not limits.deep_analysis_allowed:
        return LimitDecision(
            allowed=False,
            action_intent=LimitActionIntent.UPGRADE_PRO,
            reason=LimitReason.DEEP_ANALYSIS,
            message=f"{_RESOURCE_CEILING_PREFIX}. Upgrade to Pro for Deep Analysis.",
            **common,
        )

    if (
        limits.storage_limit_bytes is not None
        and request.projected_storage_bytes is not None
        and request.projected_storage_bytes > limits.storage_limit_bytes
    ):
        return LimitDecision(
            allowed=False,
            action_intent=LimitActionIntent.UPGRADE_PRO,
            reason=LimitReason.STORAGE_LIMIT,
            message=(
                f"{_RESOURCE_CEILING_PREFIX}. Upgrade to Pro to exceed the "
                "500 MB storage allowance."
            ),
            **common,
        )

    return LimitDecision(
        allowed=True,
        action_intent=LimitActionIntent.ALLOW,
        reason=LimitReason.ALLOWED,
        message="Request allowed.",
        effective_export_resolution=request.requested_export_resolution,
        **{
            key: value
            for key, value in common.items()
            if key != "effective_export_resolution"
        },
    )


async def enforce_user_limits(
    user_id: str,
    request: LimitRequest,
    *,
    tier: UserTier | None = None,
    usage_store: DailyUsageStore | None = None,
) -> LimitEvaluation:
    """Resolve tier, static matrix, and optional daily unique-workload reservation."""

    resolved_tier = tier or await check_user_tier(user_id)
    static = evaluate_static_limits(tier=resolved_tier, request=request)
    if not static.allowed:
        return LimitEvaluation(decision=static)

    limits = static.limits
    if (
        not request.reserve_daily_video
        or limits.daily_ai_video_limit is None
        or not request.workload_id
    ):
        return LimitEvaluation(decision=static)

    store = usage_store or get_daily_usage_store()
    allowed, used, reservation = await store.reserve_unique_workload(
        user_id=user_id,
        workload_id=request.workload_id,
        limit=limits.daily_ai_video_limit,
    )
    if not allowed:
        return LimitEvaluation(
            decision=LimitDecision(
                allowed=False,
                action_intent=LimitActionIntent.UPGRADE_PRO,
                reason=LimitReason.DAILY_VIDEO_LIMIT,
                message=(
                    f"{_RESOURCE_CEILING_PREFIX}. Free plan allows "
                    f"{limits.daily_ai_video_limit} AI processing loops per day."
                ),
                tier=resolved_tier,
                limits=limits,
                effective_export_resolution=limits.max_export_resolution,
                watermark_required=limits.watermark_required,
                watermark_text=limits.watermark_text,
                daily_videos_used=used,
            )
        )

    return LimitEvaluation(
        decision=static.model_copy(update={"daily_videos_used": used}),
        reservation=reservation,
    )


async def rollback_usage_reservation(
    reservation: UsageReservation | None,
    *,
    usage_store: DailyUsageStore | None = None,
) -> None:
    if reservation is None:
        return
    store = usage_store or get_daily_usage_store()
    await store.release(reservation)


def resource_ceiling_detail(decision: LimitDecision) -> dict[str, object]:
    """Frontend-compatible 403 detail payload for Next.js upgrade dialogs."""

    message = decision.message
    if not message.startswith(_RESOURCE_CEILING_PREFIX):
        message = f"{_RESOURCE_CEILING_PREFIX}. {message}"
    return {
        "action_intent": LimitActionIntent.UPGRADE_PRO.value,
        "message": message,
        "reason": decision.reason.value,
        "tier": decision.tier.value,
    }


def raise_resource_ceiling(decision: LimitDecision) -> None:
    """Raise HTTP 403 with the stable upgrade-dialog contract."""

    from fastapi import HTTPException

    raise HTTPException(status_code=403, detail=resource_ceiling_detail(decision))


_daily_store: RedisDailyUsageStore | None = None


def get_daily_usage_store() -> RedisDailyUsageStore:
    global _daily_store
    if _daily_store is None:
        from services.queue_service import async_redis_conn

        _daily_store = RedisDailyUsageStore(async_redis_conn)
    return _daily_store


def _safe_user_hash(user_id: str) -> str:
    return hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:12]


def _utc_day_key(now: datetime | None = None) -> str:
    current = now or datetime.now(timezone.utc)
    return current.strftime("%Y-%m-%d")


def _seconds_until_utc_rollover(now: datetime | None = None) -> int:
    current = now or datetime.now(timezone.utc)
    tomorrow = datetime(
        year=current.year,
        month=current.month,
        day=current.day,
        tzinfo=timezone.utc,
    ) + timedelta(days=1)
    # Keep the key a bit past midnight so late retries still see the same day set.
    return max(int((tomorrow - current).total_seconds()) + 3600, 3600)
