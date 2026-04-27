"""Async stats service backed by motor + GridFS, with realtime fan-out.

This file replaces the previous sync pymongo implementation. The web app
imports `increment_stats` and `get_user_stats`; the worker process publishes
a Redis pubsub message instead (see services/events.py) which a lifespan
listener in main.py routes back here.
"""

from __future__ import annotations

import logging
from datetime import datetime
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
        "$set": {"updated_at": datetime.utcnow()},
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


async def get_user_stats(user_id: str) -> dict[str, Any]:
    if not is_ready():
        return _empty(user_id)
    doc = await get_db()[COLLECTION].find_one({"user_id": user_id})
    if doc is None:
        return _empty(user_id)
    return _serialize(doc, user_id)


def _serialize(doc: dict[str, Any] | None, user_id: str) -> dict[str, Any]:
    if doc is None:
        return _empty(user_id)
    return UserStats(
        user_id=doc.get("user_id", user_id),
        total_projects=int(doc.get("total_projects", 0)),
        total_duration_processed=float(doc.get("total_duration_processed", 0.0)),
        export_count=int(doc.get("export_count", 0)),
        ai_runs=int(doc.get("ai_runs", 0)),
        updated_at=doc.get("updated_at") or datetime.utcnow(),
    ).model_dump(mode="json")
