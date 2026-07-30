"""Redis + RQ singleton with production guardrails."""

import os
import redis
import logging
from redis.retry import Retry
from redis.backoff import ExponentialBackoff
from redis.exceptions import (
    TimeoutError as RedisTimeoutError,
    ConnectionError as RedisConnectionError,
)
from rq import Queue

logger = logging.getLogger(__name__)

JOB_TIMEOUT_SECONDS = int(os.getenv("RENDER_JOB_TIMEOUT", "600"))
JOB_RESULT_TTL_SECONDS = int(os.getenv("RENDER_JOB_RESULT_TTL", "3600"))
JOB_FAILURE_TTL_SECONDS = int(os.getenv("RENDER_JOB_FAILURE_TTL", "86400"))
MAX_QUEUE_DEPTH = int(os.getenv("MAX_QUEUE_DEPTH", "50"))
SAFE_MODE = os.getenv("SAFE_MODE", "false").lower() == "true"

redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")

# Upstash and many managed Redis providers close idle connections after ~60s.
# socket_keepalive=True sends TCP-level keepalive probes so the OS detects the
# drop and reconnects instead of letting the worker silently quit.
# Retry(ExponentialBackoff) retries up to 6 times (cap=60s) on transient errors.
_retry_policy = Retry(
    ExponentialBackoff(cap=60, base=1),
    retries=6,
)
_retry_errors = [RedisTimeoutError, RedisConnectionError]

redis_conn = redis.Redis.from_url(
    redis_url,
    socket_timeout=30.0,
    socket_connect_timeout=10.0,
    socket_keepalive=True,
    retry_on_timeout=True,
    retry=_retry_policy,
    retry_on_error=_retry_errors,
    health_check_interval=30,
)

# Async connection for ExtractorService and other async paths
import redis.asyncio as async_redis

async_redis_conn = async_redis.from_url(
    redis_url,
    socket_timeout=30.0,
    socket_connect_timeout=10.0,
    socket_keepalive=True,
    retry_on_timeout=True,
    health_check_interval=30,
)

render_queue = Queue(
    "render_queue",
    connection=redis_conn,
    default_timeout=JOB_TIMEOUT_SECONDS,
)


def pending_render_depth() -> int:
    """Count in-flight Cloud Tasks / RQ renders tracked in Redis ZSET."""
    try:
        # render_dispatch writes render:pending; prune stale scores (>6h).
        cutoff = __import__("time").time() - 6 * 3600
        redis_conn.zremrangebyscore("render:pending", 0, cutoff)
        return int(redis_conn.zcard("render:pending") or 0)
    except Exception:
        return -1


def is_overloaded() -> bool:
    """Returns True if the system is too busy or in safe mode.

    Production admission uses Redis `render:pending` (Cloud Tasks reality).
    Local RQ fallback also checks RQ queue length.
    Raises RedisConnectionError / RedisTimeoutError when Redis is unreachable.
    """
    if SAFE_MODE:
        logger.warning("safe_mode_active_rejecting_tasks")
        return True

    try:
        pending = pending_render_depth()
        if pending < 0:
            # Pending key unavailable — fall through to RQ depth as secondary.
            pending = 0
        if pending >= MAX_QUEUE_DEPTH:
            logger.warning(
                "pending_render_threshold_reached depth=%s limit=%s",
                pending,
                MAX_QUEUE_DEPTH,
            )
            return True

        # Local RQ listener path — still meaningful in non-production.
        if os.environ.get("ENVIRONMENT", "").strip().lower() != "production":
            depth = len(render_queue)
            if depth >= MAX_QUEUE_DEPTH:
                logger.warning(
                    "queue_depth_threshold_reached depth=%s limit=%s",
                    depth,
                    MAX_QUEUE_DEPTH,
                )
                return True
        return False
    except (RedisConnectionError, RedisTimeoutError):
        logger.exception("redis_connection_failure_in_queue_health_check")
        raise
    except Exception as e:
        logger.error("queue_health_check_unexpected_error error=%s", e)
        return True


def get_job_cost_est(duration_sec: float) -> float:
    """Estimate compute cost for a job (heuristic)."""
    # 4CPU 8GB instance ~ $0.0001 per second
    return round(duration_sec * 0.0001, 5)
