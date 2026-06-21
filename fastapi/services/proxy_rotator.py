"""Residential proxy rotation for Tier 0 YouTube acquisition.

Architecture:
  - Pool lives in Redis SET `proxy:pool:active` (max 50 URLs).
  - Health state lives in Redis STRINGs `proxy:health:{url}` (TTL=300s).
  - Circuit breaker wraps the whole pool — if the pool is consistently
    exhausted or unhealthy, the breaker opens and callers fall through to T1.
  - `warm_pool()` must be called once at app startup (or on demand).
  - `acquire()` → returns one healthy proxy URL, or None (circuit open / pool empty).
  - `release(url, success)` → penalises failing proxies for 5 minutes.

Env vars:
  PROXY_POOL_URL — comma-separated list of proxy URLs in format
                   http://user:pass@host:port  OR a single aggregator URL.
                   When empty, proxy tier is silently disabled.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_POOL_KEY = "proxy:pool:active"
_HEALTH_KEY_PREFIX = "proxy:health:"
_HEALTH_TTL_S = 300          # 5-minute health cache
_CHECK_URL = "https://www.youtube.com/generate_204"
_SRANDMEMBER_N = 5            # How many candidates to draw per acquire()


def _get_circuit() -> "RedisCircuitBreaker":  # noqa: F821 — lazy import
    """Return a shared RedisCircuitBreaker for the proxy pool."""
    from services.circuit_breaker import RedisCircuitBreaker
    from services.queue_service import redis_conn

    # Use module-level singleton so we don't instantiate on every call.
    if not hasattr(_get_circuit, "_instance"):
        _get_circuit._instance = RedisCircuitBreaker(  # type: ignore[attr-defined]
            tier_name="proxy_pool",
            redis_conn=redis_conn,
            failure_threshold=10,
            open_duration_s=180,
        )
    return _get_circuit._instance  # type: ignore[attr-defined]


def _get_redis():
    from services.queue_service import redis_conn
    return redis_conn


# ── Pool bootstrap ─────────────────────────────────────────────────────────────


def _load_initial_pool() -> list[str]:
    """Parse PROXY_POOL_URL env var into a list of proxy URL strings."""
    raw = os.getenv("PROXY_POOL_URL", "")
    if not raw.strip():
        logger.info("proxy_rotator PROXY_POOL_URL not configured — proxy tier disabled")
        return []
    urls = [u.strip() for u in raw.split(",") if u.strip()]
    logger.info("proxy_rotator loaded %d proxies from PROXY_POOL_URL", len(urls))
    return urls


def warm_pool() -> None:
    """Seed the Redis proxy pool from PROXY_POOL_URL.

    Safe to call multiple times — always replaces the pool atomically.
    Call once during app startup lifespan.
    """
    urls = _load_initial_pool()
    if not urls:
        return
    r = _get_redis()
    pipe = r.pipeline()
    pipe.delete(_POOL_KEY)
    pipe.sadd(_POOL_KEY, *urls)
    pipe.execute()
    logger.info("proxy_pool_warmed count=%d", len(urls))


# ── Health check ───────────────────────────────────────────────────────────────


def _is_healthy_sync(url: str) -> bool:
    """Synchronous health check — used in the RQ worker context."""
    r = _get_redis()
    cache_key = f"{_HEALTH_KEY_PREFIX}{url}"
    cached = r.get(cache_key)
    if cached is not None:
        return cached == b"1"
    try:
        with httpx.Client(timeout=8.0, proxy=url) as c:
            resp = c.head(_CHECK_URL, follow_redirects=True)
        healthy = resp.status_code == 204
    except Exception as exc:
        logger.debug("proxy_health_check_failed url=%s err=%s", url[:40], str(exc)[:80])
        healthy = False
    r.setex(cache_key, _HEALTH_TTL_S, "1" if healthy else "0")
    return healthy


async def _is_healthy_async(url: str) -> bool:
    """Async health check — used in FastAPI async context."""
    r = _get_redis()
    cache_key = f"{_HEALTH_KEY_PREFIX}{url}"
    cached = r.get(cache_key)
    if cached is not None:
        return cached == b"1"
    try:
        async with httpx.AsyncClient(timeout=8.0, proxy=url) as c:
            resp = await c.head(_CHECK_URL, follow_redirects=True)
        healthy = resp.status_code == 204
    except Exception as exc:
        logger.debug(
            "proxy_health_check_async_failed url=%s err=%s", url[:40], str(exc)[:80]
        )
        healthy = False
    r.setex(cache_key, _HEALTH_TTL_S, "1" if healthy else "0")
    return healthy


# ── Public API ─────────────────────────────────────────────────────────────────


class ProxyPoolExhausted(Exception):
    """Raised when no healthy proxy is available in the pool."""


async def acquire() -> Optional[str]:
    """Acquire a healthy proxy URL for an outbound request.

    Returns:
        A proxy URL string on success, or None if the circuit breaker is open.

    Raises:
        ProxyPoolExhausted: when the pool has members but none are healthy.
    """
    circuit = _get_circuit()
    if circuit.is_open():
        logger.debug("proxy_circuit_open — skipping proxy tier")
        return None

    r = _get_redis()
    members = r.srandmember(_POOL_KEY, _SRANDMEMBER_N)
    if not members:
        # Pool is empty — proxy tier not configured or Redis lost state.
        logger.debug("proxy_pool_empty")
        return None

    for raw in members:
        url: str = raw.decode() if isinstance(raw, bytes) else raw
        if await _is_healthy_async(url):
            circuit.record_success()
            logger.debug("proxy_acquired url=%s", url[:40])
            return url

    circuit.record_failure("exhausted")
    raise ProxyPoolExhausted("No healthy proxy found in pool")


def acquire_sync() -> Optional[str]:
    """Synchronous variant of acquire() for RQ worker context.

    Returns:
        A proxy URL string, or None if circuit open / pool empty.

    Raises:
        ProxyPoolExhausted: when pool has members but none are healthy.
    """
    circuit = _get_circuit()
    if circuit.is_open():
        return None

    r = _get_redis()
    members = r.srandmember(_POOL_KEY, _SRANDMEMBER_N)
    if not members:
        return None

    for raw in members:
        url: str = raw.decode() if isinstance(raw, bytes) else raw
        if _is_healthy_sync(url):
            circuit.record_success()
            return url

    circuit.record_failure("exhausted")
    raise ProxyPoolExhausted("No healthy proxy found in pool (sync)")


def release(url: str, success: bool) -> None:
    """Release a proxy back to the pool and update its health state.

    On failure, the proxy is penalised for `_HEALTH_TTL_S` seconds.
    On success, marks as healthy (refreshes 5-min cache).
    """
    if not url:
        return
    r = _get_redis()
    cache_key = f"{_HEALTH_KEY_PREFIX}{url}"
    if success:
        r.setex(cache_key, _HEALTH_TTL_S, "1")
    else:
        logger.warning("proxy_penalised url=%s for %ds", url[:40], _HEALTH_TTL_S)
        r.setex(cache_key, _HEALTH_TTL_S, "0")
        # Also signal the circuit breaker.
        _get_circuit().record_failure("proxy_failure")


def pool_size() -> int:
    """Return the current number of proxies in the active pool."""
    try:
        return _get_redis().scard(_POOL_KEY)
    except Exception:
        return 0
