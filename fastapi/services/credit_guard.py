"""Shared credit charge/refund helpers for fail-closed paid routes."""

from __future__ import annotations

import logging
from typing import Awaitable, Callable, TypeVar

from fastapi import HTTPException

logger = logging.getLogger(__name__)

T = TypeVar("T")


def claim_once(key: str, *, ttl_sec: int = 86_400) -> bool:
    """Redis SETNX — True only for the first caller (idempotent refunds/locks)."""
    if not key:
        return False
    try:
        from services.queue_service import redis_conn

        return bool(redis_conn.set(key, "1", nx=True, ex=ttl_sec))
    except Exception as exc:
        logger.error("claim_once_failed key=%s err=%s", key, exc, exc_info=True)
        # Fail closed for refunds: without a lock, skip to avoid double-refund storms.
        return False


async def refund_credits_best_effort(
    user_id: str,
    amount: int,
    *,
    reason: str,
    route: str,
) -> bool:
    """Never raise — log loudly if refund cannot complete."""
    if amount <= 0 or not user_id or user_id == "anonymous":
        return False
    try:
        from services.stats_service import refund_credits

        ok = await refund_credits(user_id, amount)
        if ok:
            logger.info(
                "credits_refunded user=%s amount=%d route=%s reason=%s",
                user_id,
                amount,
                route,
                reason,
            )
        else:
            logger.error(
                "credits_refund_failed user=%s amount=%d route=%s reason=%s",
                user_id,
                amount,
                route,
                reason,
            )
        return ok
    except Exception as exc:
        logger.error(
            "credits_refund_error user=%s amount=%d route=%s reason=%s err=%s",
            user_id,
            amount,
            route,
            reason,
            exc,
            exc_info=True,
        )
        return False


async def require_credits(
    user_id: str,
    amount: int,
    *,
    route: str,
    detail: str | None = None,
) -> None:
    """Deduct credits or raise 402/503. Callers must refund on non-billable failure."""
    try:
        from services.stats_service import deduct_credits

        ok = await deduct_credits(user_id, amount)
        if not ok:
            raise HTTPException(
                status_code=402,
                detail=detail
                or "Insufficient credits. Please upgrade your plan to continue.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "credits_deduct_failed user=%s amount=%d route=%s err=%s",
            user_id,
            amount,
            route,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=503,
            detail="Credit service unavailable. Try again shortly.",
        ) from exc
