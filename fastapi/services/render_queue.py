"""Redis Streams render job queue with retry + dead-letter queue.

Supplements the RQ-based worker loop with a durable status/DLQ layer:
- Jobs are tracked in render:results (success) or render:dead (exhausted retries).
- Admin endpoints can list dead jobs, view stats, and re-queue individual failures.
- The actual heavy-lifting (ffmpeg, yt-dlp) still runs via RQ workers;
  this module only handles status bookkeeping and DLQ operations.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any, Optional

import redis as _redis

from services.queue_service import redis_conn

logger = logging.getLogger(__name__)

STREAM_JOBS = "render:jobs"
STREAM_RESULTS = "render:results"
STREAM_DEAD = "render:dead"
CONSUMER_GROUP = "render-workers"

# Per-job Redis hash: render:meta:{job_id}
_META_KEY = "render:meta:{}"
_META_TTL = 7 * 24 * 3600  # 7 days

MAX_RETRIES = 3
_BACKOFF = [1, 4, 16]  # seconds


def _ensure_group() -> None:
    """Create consumer group on render:jobs if it doesn't already exist."""
    try:
        redis_conn.xgroup_create(STREAM_JOBS, CONSUMER_GROUP, id="0", mkstream=True)
    except _redis.exceptions.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


def add_render_job(
    job_id: str,
    video_id: str,
    user_id: str,
    options: dict,
    quality: str = "medium",
) -> str:
    """
    Register a job in the Streams layer for status tracking.
    Returns the Redis Stream message ID.
    This does NOT enqueue to RQ — the caller still uses render_queue.enqueue().
    """
    _ensure_group()
    payload = {
        "job_id": job_id,
        "video_id": video_id,
        "user_id": user_id,
        "quality": quality,
        "submitted_at": str(time.time()),
        "attempt": "0",
    }
    msg_id = redis_conn.xadd(STREAM_JOBS, payload)

    # Write searchable metadata hash
    meta_key = _META_KEY.format(job_id)
    redis_conn.hset(
        meta_key,
        mapping={
            "job_id": job_id,
            "video_id": video_id,
            "user_id": user_id,
            "quality": quality,
            "status": "queued",
            "attempt": "0",
            "stream_msg_id": msg_id,
            "submitted_at": str(time.time()),
        },
    )
    redis_conn.expire(meta_key, _META_TTL)
    logger.info("render_job_registered job_id=%s msg_id=%s", job_id, msg_id)
    return msg_id


def push_result(
    job_id: str,
    user_id: str,
    status: str,
    *,
    rendered_url: Optional[str] = None,
    error: Optional[str] = None,
    duration_ms: Optional[float] = None,
    attempt: int = 1,
) -> None:
    """
    Record a terminal job outcome.
    - status "success" → XADD to render:results
    - status "failed" with attempt < MAX_RETRIES → update meta for retry
    - status "failed" with attempt >= MAX_RETRIES → XADD to render:dead
    """
    meta_key = _META_KEY.format(job_id)
    now = str(time.time())

    if status == "success":
        redis_conn.xadd(
            STREAM_RESULTS,
            {
                "job_id": job_id,
                "user_id": user_id,
                "rendered_url": rendered_url or "",
                "duration_ms": str(duration_ms or 0),
                "completed_at": now,
            },
        )
        redis_conn.hset(
            meta_key,
            mapping={
                "status": "success",
                "rendered_url": rendered_url or "",
                "completed_at": now,
            },
        )
        redis_conn.expire(meta_key, _META_TTL)
        logger.info("render_result_pushed_success job_id=%s", job_id)

    elif status == "failed":
        if attempt >= MAX_RETRIES:
            redis_conn.xadd(
                STREAM_DEAD,
                {
                    "job_id": job_id,
                    "user_id": user_id,
                    "error": (error or "unknown")[:500],
                    "attempt_count": str(attempt),
                    "failed_at": now,
                },
            )
            redis_conn.hset(
                meta_key,
                mapping={
                    "status": "dead",
                    "error": (error or "")[:500],
                    "attempt_count": str(attempt),
                    "failed_at": now,
                },
            )
            redis_conn.expire(meta_key, _META_TTL)
            logger.error(
                "render_job_dead_lettered job_id=%s attempts=%d error=%s",
                job_id,
                attempt,
                (error or "")[:200],
            )
        else:
            backoff = _BACKOFF[min(attempt - 1, len(_BACKOFF) - 1)]
            redis_conn.hset(
                meta_key,
                mapping={
                    "status": "retry_pending",
                    "attempt": str(attempt),
                    "error": (error or "")[:500],
                    "next_retry_at": str(time.time() + backoff),
                },
            )
            redis_conn.expire(meta_key, _META_TTL)
            logger.warning(
                "render_job_retry_scheduled job_id=%s attempt=%d backoff=%ds",
                job_id,
                attempt,
                backoff,
            )


def get_render_status(job_id: str) -> dict[str, Any]:
    """Return current status from the metadata hash."""
    meta_key = _META_KEY.format(job_id)
    raw = redis_conn.hgetall(meta_key)
    if not raw:
        return {"job_id": job_id, "status": "unknown"}
    return {k.decode(): v.decode() for k, v in raw.items()}


def get_dead_jobs(max_count: int = 100) -> list[dict[str, Any]]:
    """Return all entries from render:dead stream."""
    try:
        entries = redis_conn.xrange(STREAM_DEAD, count=max_count)
        result = []
        for msg_id, fields in entries:
            row = {k.decode(): v.decode() for k, v in fields.items()}
            row["stream_msg_id"] = msg_id.decode()
            result.append(row)
        return result
    except Exception as exc:
        logger.warning("get_dead_jobs failed: %s", exc)
        return []


def retry_dead_job(job_id: str) -> bool:
    """Re-queue a dead job's metadata status so the caller can re-enqueue to RQ."""
    meta_key = _META_KEY.format(job_id)
    raw = redis_conn.hgetall(meta_key)
    if not raw:
        return False
    status = raw.get(b"status", b"").decode()
    if status != "dead":
        return False
    redis_conn.hset(
        meta_key,
        mapping={
            "status": "queued",
            "attempt": "0",
            "requeued_at": str(time.time()),
        },
    )
    redis_conn.expire(meta_key, _META_TTL)
    logger.info("render_dead_job_requeued job_id=%s", job_id)
    return True


def get_dlq_stats() -> dict[str, Any]:
    """Summary statistics for the dead-letter stream."""
    try:
        dead = get_dead_jobs()
        if not dead:
            return {"dead_count": 0, "last_error": None, "last_failed_at": None}
        last = dead[-1]
        return {
            "dead_count": len(dead),
            "last_error": last.get("error"),
            "last_failed_at": last.get("failed_at"),
            "last_job_id": last.get("job_id"),
        }
    except Exception as exc:
        logger.warning("get_dlq_stats failed: %s", exc)
        return {"dead_count": -1, "error": str(exc)}
