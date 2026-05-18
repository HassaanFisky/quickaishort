"""Async stats service backed by motor + GridFS, with realtime fan-out.

This file replaces the previous sync pymongo implementation. The web app
imports `increment_stats` and `get_user_stats`; the worker process publishes
a Redis pubsub message instead (see services/events.py) which a lifespan
listener in main.py routes back here.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from pymongo import ReturnDocument

from models.user_stats import UserStats
from services.db import get_db, is_ready
from services.realtime import emit_stats_updated
from services.queue_service import async_redis_conn

logger = logging.getLogger(__name__)

COLLECTION = "UserStats"
STATS_CACHE_TTL = 300  # 5 minutes

# Canonical starter-credit grant for new users. Mirrors the default in
# provision_credits() and matches billing.PRO_MONTHLY_CREDITS so a free user
# never has more headroom than a paying Pro subscriber.
STARTER_CREDITS = 100


def _empty(user_id: str) -> dict[str, Any]:
    return UserStats(user_id=user_id).model_dump(mode="json")


async def increment_stats(
    user_id: str,
    *,
    duration_delta: float = 0.0,
    export_delta: int = 0,
    ai_run_delta: int = 0,
    project_delta: int = 0,
) -> dict[str, Any]:
    """Atomically $inc the stats document and broadcast the result."""
    if not user_id:
        return _empty("anonymous")
    if not is_ready():
        logger.warning(
            "Mongo not initialized; skipping stats increment for %s", user_id
        )
        return _empty(user_id)

    db = get_db()
    inc: dict[str, Any] = {}
    if duration_delta:
        inc["total_duration_processed"] = float(duration_delta)
    if export_delta:
        inc["export_count"] = int(export_delta)
    if ai_run_delta:
        inc["ai_runs"] = int(ai_run_delta)
    if project_delta:
        inc["total_projects"] = int(project_delta)

    update: dict[str, Any] = {
        "$set": {"updated_at": datetime.now(timezone.utc)},
        "$setOnInsert": {"user_id": user_id},
    }
    if inc:
        update["$inc"] = inc

    doc = await db[COLLECTION].find_one_and_update(
        {"user_id": user_id},
        update,
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    payload = _serialize(doc, user_id)

    try:
        await async_redis_conn.delete(f"stats:{user_id}")
    except Exception:
        pass

    try:
        await emit_stats_updated(user_id, payload)
    except Exception as exc:
        logger.error("emit_stats_updated failed for %s: %s", user_id, exc)
    return payload


async def deduct_credits(user_id: str, amount: int) -> bool:
    """Atomic single-operation credit deduction. No race condition — single MongoDB op with $gte guard."""
    if not user_id or user_id == "anonymous":
        return False
    if not is_ready():
        return False

    db = get_db()
    doc = await db[COLLECTION].find_one_and_update(
        {"user_id": user_id, "credits_balance": {"$gte": amount}},
        {
            "$inc": {"credits_balance": -amount},
            "$set": {"updated_at": datetime.now(timezone.utc)},
        },
        upsert=False,
        return_document=ReturnDocument.AFTER,
    )

    if doc is None:
        logger.warning("credit_deduction_failed user_id=%s amount=%d", user_id, amount)
        return False

    payload = _serialize(doc, user_id)
    try:
        await async_redis_conn.delete(f"stats:{user_id}")
    except Exception:
        pass
    try:
        await emit_stats_updated(user_id, payload)
    except Exception:
        pass
    return True


async def get_user_stats(user_id: str) -> dict[str, Any]:
    if not is_ready():
        return _empty(user_id)

    try:
        cached = await async_redis_conn.get(f"stats:{user_id}")
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    doc = await get_db()[COLLECTION].find_one({"user_id": user_id})
    if doc is None:
        return _empty(user_id)

    payload = _serialize(doc, user_id)

    try:
        await async_redis_conn.setex(
            f"stats:{user_id}", STATS_CACHE_TTL, json.dumps(payload)
        )
    except Exception:
        pass

    return payload


async def is_user_premium(user_id: str) -> bool:
    """Redis-cached premium check with 5-minute TTL."""
    cache_key = f"premium:{user_id}"
    try:
        cached = await async_redis_conn.get(cache_key)
        if cached is not None:
            return cached == b"1"
    except Exception as _err:
        logger.warning("Redis premium cache read failed: %s", _err)

    stats = await get_user_stats(user_id)
    is_premium = stats.get("is_premium", False)

    try:
        await async_redis_conn.setex(cache_key, 300, b"1" if is_premium else b"0")
    except Exception as _err:
        logger.warning("Redis premium cache write failed: %s", _err)

    return is_premium


async def provision_credits(user_id: str, amount: int = STARTER_CREDITS) -> None:
    """Create user stats doc on first login. $setOnInsert never overwrites existing users."""
    if not is_ready():
        return
    db = get_db()
    await db[COLLECTION].update_one(
        {"user_id": user_id},
        {
            "$setOnInsert": {
                "user_id": user_id,
                "credits_balance": amount,
                "is_premium": False,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )


async def invalidate_premium_cache(user_id: str) -> None:
    """Invalidate Redis premium cache after subscription change."""
    try:
        await async_redis_conn.delete(f"premium:{user_id}")
    except Exception:
        pass


async def recalculate_user_stats(user_id: str) -> dict[str, Any]:
    """Recalculate stats from scratch using aggregation on the exports collection."""
    if not is_ready():
        return _empty(user_id)

    db = get_db()
    pipeline = [
        {"$match": {"metadata.user_id": user_id}},
        {
            "$group": {
                "_id": "$metadata.user_id",
                "total_duration": {"$sum": "$metadata.duration_sec"},
                "export_count": {"$sum": 1},
            }
        },
    ]

    cursor = db["exports.files"].aggregate(pipeline)
    result = await cursor.to_list(length=1)

    if not result:
        return await increment_stats(user_id)

    agg = result[0]
    duration = float(agg.get("total_duration", 0.0))
    count = int(agg.get("export_count", 0))

    doc = await db[COLLECTION].find_one_and_update(
        {"user_id": user_id},
        {
            "$set": {
                "total_duration_processed": duration,
                "export_count": count,
                "updated_at": datetime.now(timezone.utc),
            },
            "$setOnInsert": {"user_id": user_id, "credits_balance": STARTER_CREDITS},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )

    payload = _serialize(doc, user_id)
    await emit_stats_updated(user_id, payload)
    return payload


def _serialize(doc: dict[str, Any] | None, user_id: str) -> dict[str, Any]:
    if doc is None:
        return _empty(user_id)
    return UserStats(
        user_id=doc.get("user_id", user_id),
        credits_balance=int(doc.get("credits_balance", STARTER_CREDITS)),
        total_projects=int(doc.get("total_projects", 0)),
        total_duration_processed=float(doc.get("total_duration_processed", 0.0)),
        export_count=int(doc.get("export_count", 0)),
        ai_runs=int(doc.get("ai_runs", 0)),
        is_premium=bool(doc.get("is_premium", False)),
        is_pro=bool(doc.get("is_pro", False)),
        updated_at=doc.get("updated_at") or datetime.now(timezone.utc),
    ).model_dump(mode="json")
