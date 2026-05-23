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


async def get_agent_latency(agent_name: Optional[str] = None, hours: int = 24) -> dict[str, Any]:
    """Average pipeline duration from MongoDB pipeline_runs."""
    try:
        from services.db import get_db
        import asyncio

        cutoff_ts = time.time() - hours * 3600

        def _query():
            col = get_db().collection("pipeline_runs")
            match: dict = {"started_at": {"$gt": cutoff_ts}, "status": "success"}
            if agent_name:
                match["pipeline_type"] = agent_name
            pipeline = [
                {"$match": match},
                {
                    "$group": {
                        "_id": "$pipeline_type",
                        "avg_duration_ms": {"$avg": "$duration_ms"},
                        "count": {"$sum": 1},
                        "p95_duration_ms": {"$percentile": {"input": "$duration_ms", "p": [0.95], "method": "approximate"}},
                    }
                },
            ]
            try:
                return list(col.aggregate(pipeline))
            except Exception:
                # $percentile may not be available on older MongoDB — simplified fallback
                pipeline[-1]["$group"].pop("p95_duration_ms", None)
                return list(col.aggregate(pipeline))

        rows = await asyncio.to_thread(_query)
        return {"latency": rows, "hours": hours, "source": "mongodb"}
    except Exception as exc:
        logger.warning("get_agent_latency failed: %s", exc)
        return {"latency": [], "error": str(exc), "source": "mongodb"}


async def get_tool_errors(hours: int = 24) -> dict[str, Any]:
    """Failed pipeline runs from MongoDB pipeline_runs."""
    try:
        from services.db import get_db
        import asyncio

        cutoff_ts = time.time() - hours * 3600

        def _query():
            col = get_db().collection("pipeline_runs")
            rows = list(
                col.find(
                    {"started_at": {"$gt": cutoff_ts}, "status": "failed"},
                    {"pipeline_type": 1, "error_details": 1, "started_at": 1, "_id": 0},
                ).sort("started_at", -1).limit(50)
            )
            return rows

        rows = await asyncio.to_thread(_query)
        return {"errors": rows, "hours": hours, "source": "mongodb"}
    except Exception as exc:
        logger.warning("get_tool_errors failed: %s", exc)
        return {"errors": [], "error": str(exc), "source": "mongodb"}


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
