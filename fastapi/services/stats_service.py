"""Async stats service backed by motor + GridFS, with realtime fan-out.

This file replaces the previous sync pymongo implementation. The web app
imports `increment_stats` and `get_user_stats`; the worker process publishes
a Redis pubsub message instead (see services/events.py) which a lifespan
listener in main.py routes back here.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from pymongo import ReturnDocument

from models.user_stats import UserStats
from services.db import get_db, is_ready
from services.realtime import emit_stats_updated

logger = logging.getLogger(__name__)

COLLECTION = "UserStats"


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
        logger.warning("Mongo not initialized; skipping stats increment for %s", user_id)
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
        await emit_stats_updated(user_id, payload)
    except Exception as exc:
        logger.error("emit_stats_updated failed for %s: %s", user_id, exc)
    return payload


async def deduct_credits(user_id: str, amount: int) -> bool:
    """Atomically deduct credits if sufficient balance exists. Returns True if successful."""
    if not user_id or user_id == "anonymous":
        return False
    if not is_ready():
        return False

    db = get_db()
    
    # Check if user exists. If not, they have the default 5000 credits.
    # We use find_one_and_update with a condition to ensure they don't go negative.
    
    # First, ensure the document exists with the default 5000 credits if it's missing.
    # This is a bit tricky with atomic operations, so we'll do an upsert with $setOnInsert first.
    await db[COLLECTION].update_one(
        {"user_id": user_id},
        {"$setOnInsert": {"user_id": user_id, "credits_balance": 5000}},
        upsert=True
    )
    
    # Now atomically decrement ONLY IF balance >= amount
    doc = await db[COLLECTION].find_one_and_update(
        {"user_id": user_id, "credits_balance": {"$gte": amount}},
        {
            "$inc": {"credits_balance": -amount},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        },
        return_document=ReturnDocument.AFTER,
    )
    
    if doc is None:
        return False  # Insufficient credits
        
    payload = _serialize(doc, user_id)
    try:
        await emit_stats_updated(user_id, payload)
    except Exception as exc:
        pass
    return True


async def get_user_stats(user_id: str) -> dict[str, Any]:
    if not is_ready():
        return _empty(user_id)
    doc = await get_db()[COLLECTION].find_one({"user_id": user_id})
    if doc is None:
        return _empty(user_id)
    return _serialize(doc, user_id)


async def recalculate_user_stats(user_id: str) -> dict[str, Any]:
    """Recalculate stats from scratch using aggregation on the exports collection."""
    if not is_ready():
        return _empty(user_id)
    
    db = get_db()
    # exports are in GridFS, metadata is in exports.files
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
        return await increment_stats(user_id)  # Returns default/empty
        
    agg = result[0]
    duration = float(agg.get("total_duration", 0.0))
    count = int(agg.get("export_count", 0))
    
    # Sync the UserStats document
    doc = await db[COLLECTION].find_one_and_update(
        {"user_id": user_id},
        {
            "$set": {
                "total_duration_processed": duration,
                "export_count": count,
                "updated_at": datetime.now(timezone.utc)
            },
            "$setOnInsert": {"user_id": user_id, "credits_balance": 5000}
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
        credits_balance=int(doc.get("credits_balance", 5000)),
        total_projects=int(doc.get("total_projects", 0)),
        total_duration_processed=float(doc.get("total_duration_processed", 0.0)),
        export_count=int(doc.get("export_count", 0)),
        ai_runs=int(doc.get("ai_runs", 0)),
        updated_at=doc.get("updated_at") or datetime.now(timezone.utc),
    ).model_dump(mode="json")
