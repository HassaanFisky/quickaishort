"""Self-hosted, privacy-respecting product analytics.

No external service (GA/Mixpanel/PostHog) — events are anonymous (a random
per-browser client_id, never an account identity) and stored in this
project's own Firestore. Frontend tracker lives in frontend/src/lib/analytics.ts.
"""

from __future__ import annotations

import asyncio
import logging
import statistics
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.db import get_db, is_ready

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

COLLECTION = "analytics_events"
MAX_EVENTS_PER_BATCH = 200
SUMMARY_SCAN_LIMIT = 5000


class AnalyticsEventIn(BaseModel):
    name: str
    props: dict[str, Any] = Field(default_factory=dict)
    ts: int  # client epoch ms


class AnalyticsBatchIn(BaseModel):
    client_id: str
    events: list[AnalyticsEventIn]


@router.post("")
async def ingest_events(batch: AnalyticsBatchIn) -> dict:
    if not is_ready():
        # Telemetry must never break the app — accept-and-drop when the DB is down.
        return {"status": "db_unavailable", "accepted": 0}

    events = batch.events[:MAX_EVENTS_PER_BATCH]
    if not events:
        return {"status": "ok", "accepted": 0}

    def _do():
        db = get_db()
        col = db.collection(COLLECTION)
        batch_writer = db.batch()
        now = datetime.now(timezone.utc)
        for evt in events:
            doc_ref = col.document()
            batch_writer.set(
                doc_ref,
                {
                    "client_id": batch.client_id,
                    "name": evt.name,
                    "props": evt.props,
                    "client_ts": evt.ts,
                    "received_at": now,
                },
            )
        batch_writer.commit()

    try:
        await asyncio.to_thread(_do)
    except Exception as exc:
        logger.warning("analytics_ingest_failed: %s", exc)
        return {"status": "write_failed", "accepted": 0}

    return {"status": "ok", "accepted": len(events)}


@router.get("/summary")
async def get_summary(days: int = 7) -> dict:
    if days < 1 or days > 90:
        raise HTTPException(status_code=400, detail="days must be between 1 and 90")

    if not is_ready():
        return _empty_summary(days)

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    def _do() -> list[dict]:
        db = get_db()
        query = (
            db.collection(COLLECTION)
            .where("received_at", ">=", cutoff)
            .limit(SUMMARY_SCAN_LIMIT)
        )
        return [d.to_dict() for d in query.stream()]

    try:
        docs = await asyncio.to_thread(_do)
    except Exception as exc:
        logger.warning("analytics_summary_failed: %s", exc)
        return _empty_summary(days)

    return _aggregate(docs, days)


def _empty_summary(days: int) -> dict:
    return {
        "days": days,
        "total_exports": 0,
        "top_feature": None,
        "ai_success_rate": None,
        "avg_session_minutes": None,
        "avg_preflight_score": None,
        "sample_size": 0,
    }


def _aggregate(docs: list[dict], days: int) -> dict:
    total_exports = sum(1 for d in docs if d.get("name") == "export_completed")

    feature_counter = Counter(
        d.get("props", {}).get("featureId")
        for d in docs
        if d.get("name") == "feature_used" and d.get("props", {}).get("featureId")
    )
    top_feature = feature_counter.most_common(1)[0][0] if feature_counter else None

    ai_events = [d for d in docs if d.get("name") == "ai_command_sent"]
    ai_success_rate = (
        round(100 * sum(1 for d in ai_events if d.get("props", {}).get("success")) / len(ai_events), 1)
        if ai_events
        else None
    )

    preflight_scores = [
        d.get("props", {}).get("consensusScore")
        for d in docs
        if d.get("name") == "preflight_run" and isinstance(d.get("props", {}).get("consensusScore"), (int, float))
    ]
    avg_preflight_score = round(statistics.mean(preflight_scores), 1) if preflight_scores else None

    # Approximate session length per client_id: span between first and last
    # event timestamp within the window. Crude but dependency-free.
    spans_by_client: dict[str, list[int]] = {}
    for d in docs:
        cid = d.get("client_id")
        ts = d.get("client_ts")
        if cid and isinstance(ts, (int, float)):
            spans_by_client.setdefault(cid, []).append(ts)
    session_minutes = [
        (max(ts_list) - min(ts_list)) / 60_000
        for ts_list in spans_by_client.values()
        if len(ts_list) > 1
    ]
    avg_session_minutes = round(statistics.mean(session_minutes), 1) if session_minutes else None

    return {
        "days": days,
        "total_exports": total_exports,
        "top_feature": top_feature,
        "ai_success_rate": ai_success_rate,
        "avg_session_minutes": avg_session_minutes,
        "avg_preflight_score": avg_preflight_score,
        "sample_size": len(docs),
    }
