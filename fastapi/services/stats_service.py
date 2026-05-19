"""Stats service backed by Firestore, with realtime fan-out.

Replaces MongoDB/motor implementation. Uses sync Firestore client via asyncio.to_thread().
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from google.cloud import firestore

from models.user_stats import UserStats
from services.db import get_db, is_ready
from services.realtime import emit_stats_updated
from services.queue_service import async_redis_conn

logger = logging.getLogger(__name__)

COLLECTION = "UserStats"
STATS_CACHE_TTL = 300

STARTER_CREDITS = 100


def _empty(user_id: str) -> dict[str, Any]:
    return UserStats(user_id=user_id).model_dump(mode="json")


def _empty_dict(user_id: str) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "credits_balance": STARTER_CREDITS,
        "is_premium": False,
        "is_pro": False,
        "total_projects": 0,
        "total_duration_processed": 0.0,
        "export_count": 0,
        "ai_runs": 0,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }


async def increment_stats(
    user_id: str,
    *,
    duration_delta: float = 0.0,
    export_delta: int = 0,
    ai_run_delta: int = 0,
    project_delta: int = 0,
) -> dict[str, Any]:
    """Atomically increment stats and broadcast the result."""
    if not user_id:
        return _empty("anonymous")
    if not is_ready():
        logger.warning("DB not initialized; skipping stats increment for %s", user_id)
        return _empty(user_id)

    def _do() -> dict[str, Any]:
        db = get_db()
        doc_ref = db.collection(COLLECTION).document(user_id)
        snap = doc_ref.get()
        if not snap.exists:
            doc_ref.set(_empty_dict(user_id))

        updates: dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
        if duration_delta:
            updates["total_duration_processed"] = firestore.Increment(
                float(duration_delta)
            )
        if export_delta:
            updates["export_count"] = firestore.Increment(int(export_delta))
        if ai_run_delta:
            updates["ai_runs"] = firestore.Increment(int(ai_run_delta))
        if project_delta:
            updates["total_projects"] = firestore.Increment(int(project_delta))
        doc_ref.update(updates)
        return doc_ref.get().to_dict()

    doc = await asyncio.to_thread(_do)
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
    """Transactional credit deduction — prevents going negative."""
    if not user_id or user_id == "anonymous":
        return False
    if not is_ready():
        return False

    def _do() -> dict[str, Any] | None:
        db = get_db()
        doc_ref = db.collection(COLLECTION).document(user_id)

        @firestore.transactional
        def _txn(transaction: firestore.Transaction) -> dict[str, Any] | None:
            snap = doc_ref.get(transaction=transaction)
            if not snap.exists:
                return None
            data = snap.to_dict() or {}
            balance = data.get("credits_balance", 0)
            if balance < amount:
                return None
            new_balance = balance - amount
            transaction.update(
                doc_ref,
                {
                    "credits_balance": new_balance,
                    "updated_at": datetime.now(timezone.utc),
                },
            )
            return {**data, "credits_balance": new_balance}

        return _txn(db.transaction())

    doc = await asyncio.to_thread(_do)
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

    def _do() -> dict[str, Any] | None:
        snap = get_db().collection(COLLECTION).document(user_id).get()
        return snap.to_dict() if snap.exists else None

    doc = await asyncio.to_thread(_do)
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
    """Create user stats doc on first login. No-op if already exists."""
    if not is_ready():
        return

    def _do() -> None:
        doc_ref = get_db().collection(COLLECTION).document(user_id)
        snap = doc_ref.get()
        if not snap.exists:
            doc_ref.set(
                {
                    "user_id": user_id,
                    "credits_balance": amount,
                    "is_premium": False,
                    "is_pro": False,
                    "total_projects": 0,
                    "total_duration_processed": 0.0,
                    "export_count": 0,
                    "ai_runs": 0,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                }
            )

    await asyncio.to_thread(_do)


async def invalidate_premium_cache(user_id: str) -> None:
    try:
        await async_redis_conn.delete(f"premium:{user_id}")
    except Exception:
        pass


async def recalculate_user_stats(user_id: str) -> dict[str, Any]:
    """Returns current Firestore stats. Stats are maintained incrementally via increment_stats()."""
    return await get_user_stats(user_id)


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
