"""Redis + RQ singleton with production guardrails."""

import os
import redis
import logging
from rq import Queue

logger = logging.getLogger(__name__)

JOB_TIMEOUT_SECONDS = int(os.getenv("RENDER_JOB_TIMEOUT", "600"))
JOB_RESULT_TTL_SECONDS = int(os.getenv("RENDER_JOB_RESULT_TTL", "3600"))
JOB_FAILURE_TTL_SECONDS = int(os.getenv("RENDER_JOB_FAILURE_TTL", "86400"))
MAX_QUEUE_DEPTH = int(os.getenv("MAX_QUEUE_DEPTH", "50"))
SAFE_MODE = os.getenv("SAFE_MODE", "false").lower() == "true"

redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")

# Sync connection for RQ.
# socket_timeout is raised to 10 s (was 2 s) to survive Cloud Run cold-starts:
# Upstash/Memorystore can take 3-8 s to accept the first connection on a fresh
# instance. retry_on_timeout=True prevents immediate crashes on transient
# timeouts without masking genuine connection failures.
redis_conn = redis.Redis.from_url(
    redis_url,
    socket_timeout=10.0,
    socket_connect_timeout=10.0,
    retry_on_timeout=True,
    health_check_interval=30,
)

# Async connection for ExtractorService and other async paths
import redis.asyncio as async_redis

async_redis_conn = async_redis.from_url(
    redis_url,
    socket_timeout=10.0,
    socket_connect_timeout=10.0,
    retry_on_timeout=True,
    health_check_interval=30,
)

render_queue = Queue(
    "render_queue",
    connection=redis_conn,
    default_timeout=JOB_TIMEOUT_SECONDS,
)


def is_overloaded() -> bool:
    """Returns True if the system is too busy or in safe mode."""
    if SAFE_MODE:
        logger.warning("safe_mode_active_rejecting_tasks")
        return True

    try:
        depth = len(render_queue)
        if depth >= MAX_QUEUE_DEPTH:
            logger.warning(
                "queue_depth_threshold_reached", depth=depth, limit=MAX_QUEUE_DEPTH
            )
            return True
        return False
    except Exception as e:
        logger.error("queue_health_check_failed", error=str(e))
        # Default to overloaded if we can't talk to Redis (Degraded mode)
        return True


def get_job_cost_est(duration_sec: float) -> float:
    """Estimate compute cost for a job (heuristic)."""
    # 4CPU 8GB instance ~ $0.0001 per second
    return round(duration_sec * 0.0001, 5)
