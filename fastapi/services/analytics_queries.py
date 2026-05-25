"""Agent analytics queries — BigQuery when available, MongoDB fallback.

google.adk.plugins.bigquery_agent_analytics_plugin requires google-adk > 1.0.0.
Until the package is upgraded, this module reads from the MongoDB pipeline_runs
collection written by pipeline_monitor.py.

When the BQ dataset (quickaishort-agent-494304:adk_analytics) is populated,
swap _query_bq() for real BigQuery client calls.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# MongoDB-backed queries (production fallback)
# ---------------------------------------------------------------------------


async def _get_pipeline_collection():
    from services.db import get_db

    return get_db().collection("pipeline_runs")


async def get_agent_latency(
    agent_name: Optional[str] = None, hours: int = 24
) -> dict[str, Any]:
    """Average pipeline duration from Firestore pipeline_runs."""
    try:
        from services.db import get_db
        import asyncio

        cutoff_ts = time.time() - hours * 3600

        def _query():
            col = get_db().collection("pipeline_runs")
            # Using single started_at range filter to avoid any composite index requirements
            docs = col.where("started_at", ">", cutoff_ts).stream()

            rows = []
            for d in docs:
                data = d.to_dict()
                if data.get("status") != "success":
                    continue
                if agent_name and data.get("pipeline_type") != agent_name:
                    continue
                rows.append(data)

            groups: dict[str, list[float]] = {}
            for r in rows:
                pt = r.get("pipeline_type", "unknown")
                dur = r.get("duration_ms")
                if dur is not None:
                    groups.setdefault(pt, []).append(float(dur))

            rows_aggregated = []
            for pt, durs in groups.items():
                if not durs:
                    continue
                durs_sorted = sorted(durs)
                n = len(durs)
                avg_dur = sum(durs) / n
                p95_idx = min(int(n * 0.95), n - 1)
                p95_dur = durs_sorted[p95_idx]
                rows_aggregated.append(
                    {
                        "_id": pt,
                        "avg_duration_ms": round(avg_dur, 1),
                        "count": n,
                        "p95_duration_ms": [round(p95_dur, 1)],
                    }
                )
            return rows_aggregated

        rows = await asyncio.to_thread(_query)
        return {"latency": rows, "hours": hours, "source": "firestore"}
    except Exception as exc:
        logger.warning("get_agent_latency failed: %s", exc)
        return {"latency": [], "error": str(exc), "source": "firestore"}


async def get_tool_errors(hours: int = 24) -> dict[str, Any]:
    """Failed pipeline runs from Firestore pipeline_runs."""
    try:
        from services.db import get_db
        import asyncio

        cutoff_ts = time.time() - hours * 3600

        def _query():
            col = get_db().collection("pipeline_runs")
            docs = col.where("started_at", ">", cutoff_ts).stream()

            rows = []
            for d in docs:
                data = d.to_dict()
                if data.get("status") != "failed":
                    continue
                rows.append(
                    {
                        "pipeline_type": data.get("pipeline_type"),
                        "error_details": data.get("error_details"),
                        "started_at": data.get("started_at"),
                    }
                )
            # Sort descending by started_at
            rows.sort(key=lambda x: x.get("started_at", 0), reverse=True)
            return rows[:50]

        rows = await asyncio.to_thread(_query)
        return {"errors": rows, "hours": hours, "source": "firestore"}
    except Exception as exc:
        logger.warning("get_tool_errors failed: %s", exc)
        return {"errors": [], "error": str(exc), "source": "firestore"}


async def get_token_usage(hours: int = 24) -> dict[str, Any]:
    """Token usage is not tracked in MongoDB; returns placeholder for BQ upgrade path."""
    return {
        "message": (
            "Token usage tracking requires google-adk > 1.0.0 with "
            "BigQueryAgentAnalyticsPlugin. Upgrade google-adk to activate."
        ),
        "hours": hours,
        "source": "not_available",
    }


async def get_pipeline_duration(pipeline_type: str, hours: int = 24) -> dict[str, Any]:
    """Per-pipeline timing summary."""
    return await get_agent_latency(agent_name=pipeline_type, hours=hours)
