"""Pipeline run tracking for Pre-Flight and Viral agent pipelines.

Writes to MongoDB collection `pipeline_runs`. Each document records:
  pipeline_type, user_id, video_id, status, duration_ms, error_details, started_at.

Used by /api/admin/pipeline/health and analytics_queries.py.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any, Optional

logger = logging.getLogger(__name__)


async def start_run(
    pipeline_type: str,
    user_id: str,
    video_id: str = "",
) -> str:
    """Insert a pipeline_runs document with status=running. Returns run_id."""
    run_id = str(uuid.uuid4())
    try:
        from services.db import get_db

        def _insert():
            get_db().collection("pipeline_runs").document(run_id).set(
                {
                    "run_id": run_id,
                    "pipeline_type": pipeline_type,
                    "user_id": user_id,
                    "video_id": video_id,
                    "status": "running",
                    "started_at": time.time(),
                    "duration_ms": None,
                    "error_details": None,
                }
            )

        await asyncio.to_thread(_insert)
    except Exception as exc:
        logger.warning("pipeline_monitor.start_run failed: %s", exc)
    return run_id


async def end_run(
    run_id: str,
    status: str,
    duration_ms: float,
    error_details: Optional[str] = None,
) -> None:
    """Update a pipeline_runs document with final status + duration."""
    try:
        from services.db import get_db

        update: dict[str, Any] = {
            "status": status,
            "duration_ms": round(duration_ms, 1),
            "completed_at": time.time(),
        }
        if error_details:
            update["error_details"] = error_details[:1000]

        def _update():
            get_db().collection("pipeline_runs").document(run_id).update(update)

        await asyncio.to_thread(_update)
    except Exception as exc:
        logger.warning("pipeline_monitor.end_run failed: %s", exc)


async def get_health(hours: int = 24) -> dict[str, Any]:
    """Aggregate success rate, avg duration, and error breakdown."""
    try:
        from services.db import get_db

        cutoff = time.time() - hours * 3600

        def _query():
            col = get_db().collection("pipeline_runs")
            docs = list(
                col.where("started_at", ">", cutoff)
                .order_by("started_at")
                .limit(500)
                .stream()
            )
            rows = [d.to_dict() for d in docs]

            total = len(rows)
            if total == 0:
                return {"total_runs": 0, "hours": hours}

            success = [r for r in rows if r.get("status") == "success"]
            failed = [r for r in rows if r.get("status") == "failed"]
            durations = [
                r["duration_ms"]
                for r in success
                if r.get("duration_ms") is not None
            ]
            avg_ms = round(sum(durations) / len(durations), 1) if durations else None

            error_counts: dict[str, int] = {}
            for r in failed:
                err = (r.get("error_details") or "unknown")[:80]
                error_counts[err] = error_counts.get(err, 0) + 1

            by_type: dict[str, dict] = {}
            for r in rows:
                pt = r.get("pipeline_type", "unknown")
                entry = by_type.setdefault(pt, {"total": 0, "success": 0})
                entry["total"] += 1
                if r.get("status") == "success":
                    entry["success"] += 1

            return {
                "total_runs": total,
                "success_count": len(success),
                "failed_count": len(failed),
                "success_rate_pct": round(len(success) / total * 100, 1),
                "avg_duration_ms": avg_ms,
                "top_errors": sorted(
                    error_counts.items(), key=lambda x: -x[1]
                )[:5],
                "by_pipeline_type": by_type,
                "hours": hours,
            }

        return await asyncio.to_thread(_query)
    except Exception as exc:
        logger.warning("pipeline_monitor.get_health failed: %s", exc)
        return {"error": str(exc), "hours": hours}
