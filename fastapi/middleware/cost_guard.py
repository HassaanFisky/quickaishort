"""Distributed AI response cache, token-bucket admission, and lifecycle-safe idle observation.

Author: QuickAI Engineering
Last modified: 2026-07-23
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
import time
import unicodedata
from enum import Enum
from typing import Callable, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, JsonValue, ValidationError

logger = logging.getLogger(__name__)

CACHE_SCHEMA_VERSION = "ai-json-v2"
DEFAULT_CACHE_TTL_SECONDS = 3600
DEFAULT_LEASE_SECONDS = 90
DEFAULT_IDLE_SECONDS = 60
DEFAULT_TOKEN_BUCKET_CAPACITY = 8
DEFAULT_TOKEN_BUCKET_REFILL_PER_SEC = 0.5
DEFAULT_DEFER_BASE_SECONDS = 2
DEFAULT_DEFER_MAX_SECONDS = 120


class CostGuardUnavailable(RuntimeError):
    """Fail-closed signal: cache state is unknown, so model spend is blocked."""


class RateLimitDeferred(RuntimeError):
    """Provider free-tier pressure; caller must RETRY_LATER / Cloud Tasks delay."""

    def __init__(self, receipt: "DeferredExecutionReceipt") -> None:
        self.receipt = receipt
        super().__init__(
            f"Rate limited. Retry after {receipt.retry_after_seconds} seconds."
        )


class AsyncRedisClient(Protocol):
    async def get(self, key: str) -> object: ...

    async def set(
        self,
        key: str,
        value: object,
        *,
        ex: int | None = None,
        nx: bool = False,
    ) -> object: ...

    async def delete(self, key: str) -> object: ...

    async def eval(
        self,
        script: str,
        number_of_keys: int,
        *keys_and_args: object,
    ) -> object: ...

    async def incr(self, key: str) -> object: ...

    async def expire(self, key: str, seconds: int) -> object: ...


class CacheDescriptor(BaseModel):
    """All inputs that can change an AI answer, including tenant and schema."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    user_id: str = Field(min_length=1, max_length=256)
    operation: str = Field(min_length=1, max_length=80)
    query: str = Field(min_length=1, max_length=8000)
    workload_id: str = Field(min_length=1, max_length=256)
    tier: Literal["free", "pro"]
    context: dict[str, JsonValue] = Field(default_factory=dict)
    response_schema_hash: str = Field(min_length=16, max_length=64)


class CacheLookupStatus(str, Enum):
    HIT = "hit"
    MISS_RESERVED = "miss_reserved"
    IN_FLIGHT = "in_flight"


class CacheLookup(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    status: CacheLookupStatus
    cache_key: str
    lease_token: str | None = None
    payload: JsonValue | None = None


class CacheEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    schema_version: Literal["ai-json-v2"] = CACHE_SCHEMA_VERSION
    created_at_epoch: int = Field(ge=0)
    payload: JsonValue


class SimilarQueryCache:
    """Exact-normalized cache with cross-instance single-flight protection.

    Timeline commands are stateful. Fuzzy/embedding similarity can replay the
    wrong edit, so "similar" intentionally means Unicode/case/whitespace
    equivalent plus identical structured context and response schema.
    """

    _UNLOCK_SCRIPT = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
"""

    def __init__(
        self,
        redis_client: AsyncRedisClient,
        *,
        ttl_seconds: int = DEFAULT_CACHE_TTL_SECONDS,
        lease_seconds: int = DEFAULT_LEASE_SECONDS,
        prefix: str = "cost-guard",
    ) -> None:
        if ttl_seconds < 1:
            raise ValueError("ttl_seconds must be positive")
        if lease_seconds < 1:
            raise ValueError("lease_seconds must be positive")
        self._redis = redis_client
        self._ttl_seconds = ttl_seconds
        self._lease_seconds = lease_seconds
        self._prefix = prefix

    async def lookup(self, descriptor: CacheDescriptor) -> CacheLookup:
        cache_key = self.build_key(descriptor)
        lock_key = f"{cache_key}:lock"

        try:
            raw = await self._redis.get(cache_key)
        except Exception as exc:
            raise CostGuardUnavailable(
                "AI cache lookup failed; model call blocked to prevent unbounded spend."
            ) from exc

        if raw is not None:
            try:
                envelope = CacheEnvelope.model_validate_json(
                    _decode_redis_value(raw), strict=True
                )
                return CacheLookup(
                    status=CacheLookupStatus.HIT,
                    cache_key=cache_key,
                    payload=envelope.payload,
                )
            except (ValidationError, ValueError, TypeError):
                logger.warning("invalid_ai_cache_entry key=%s", cache_key)
                try:
                    await self._redis.delete(cache_key)
                except Exception as exc:
                    raise CostGuardUnavailable(
                        "Invalid AI cache entry could not be removed safely."
                    ) from exc

        token = secrets.token_urlsafe(24)
        try:
            acquired = await self._redis.set(
                lock_key,
                token,
                ex=self._lease_seconds,
                nx=True,
            )
        except Exception as exc:
            raise CostGuardUnavailable(
                "AI single-flight lease failed; duplicate model call blocked."
            ) from exc

        if acquired:
            return CacheLookup(
                status=CacheLookupStatus.MISS_RESERVED,
                cache_key=cache_key,
                lease_token=token,
            )
        return CacheLookup(
            status=CacheLookupStatus.IN_FLIGHT,
            cache_key=cache_key,
        )

    async def store(self, lookup: CacheLookup, payload: JsonValue) -> bool:
        """Persist validated JSON; always release the caller's lease."""

        if (
            lookup.status is not CacheLookupStatus.MISS_RESERVED
            or not lookup.lease_token
        ):
            raise ValueError("A reserved cache miss is required before store().")

        envelope = CacheEnvelope(
            created_at_epoch=int(time.time()),
            payload=payload,
        )
        encoded = json.dumps(
            envelope.model_dump(mode="json"),
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )

        stored = False
        try:
            await self._redis.set(
                lookup.cache_key,
                encoded,
                ex=self._ttl_seconds,
            )
            stored = True
        except Exception:
            # The already-paid response remains useful to this caller. Future
            # reads still fail closed while Redis is unavailable.
            logger.error("ai_cache_store_failed key=%s", lookup.cache_key)
        finally:
            await self.release(lookup)
        return stored

    async def release(self, lookup: CacheLookup) -> None:
        if not lookup.lease_token:
            return
        try:
            await self._redis.eval(
                self._UNLOCK_SCRIPT,
                1,
                f"{lookup.cache_key}:lock",
                lookup.lease_token,
            )
        except Exception:
            # Lease TTL bounds recovery; never delete a lock we cannot prove is ours.
            logger.warning("ai_cache_lease_release_failed key=%s", lookup.cache_key)

    async def invalidate(self, cache_key: str) -> None:
        """Remove a schema-invalid payload before one guarded regeneration."""

        try:
            await self._redis.delete(cache_key)
        except Exception as exc:
            raise CostGuardUnavailable(
                "Invalid AI cache payload could not be removed safely."
            ) from exc

    def build_key(self, descriptor: CacheDescriptor) -> str:
        tenant_hash = hashlib.sha256(
            descriptor.user_id.encode("utf-8")
        ).hexdigest()[:24]
        canonical = descriptor.model_dump(mode="json")
        canonical["user_id"] = tenant_hash
        canonical["query"] = normalize_query(descriptor.query)
        encoded = json.dumps(
            canonical,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
        # MD5 is used only as the requested fast, non-security fingerprint.
        # A SHA-256 guard remains in the key so an MD5 collision can never replay
        # another query's response. The tenant hash makes isolation auditable.
        fingerprint = hashlib.md5(encoded, usedforsecurity=False).hexdigest()
        collision_guard = hashlib.sha256(encoded).hexdigest()[:32]
        return (
            f"{self._prefix}:{CACHE_SCHEMA_VERSION}:{tenant_hash}:"
            f"{fingerprint}:{collision_guard}"
        )


class TokenBucketDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    allowed: bool
    tokens_remaining: float = Field(ge=0)
    retry_after_seconds: int | None = Field(default=None, ge=1, le=3600)


class RedisTokenBucket:
    """Distributed token bucket for Google AI Studio free-tier pressure control.

    Tokens refill continuously. Exhaustion never crashes the process; callers
    receive a structured deferral that can be scheduled onto Cloud Tasks.
    """

    # KEYS[1]=bucket  ARGV=capacity, refill_per_sec, now, requested
    # Returns: allowed (0|1), tokens, retry_after_ms
    _SCRIPT = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local raw = redis.call('GET', key)
local tokens = capacity
local updated = now
if raw then
  local sep = string.find(raw, ':')
  if sep then
    tokens = tonumber(string.sub(raw, 1, sep - 1))
    updated = tonumber(string.sub(raw, sep + 1))
  end
end
local elapsed = math.max(0, now - updated)
tokens = math.min(capacity, tokens + (elapsed * refill))
local allowed = 0
local retry_ms = 0
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
else
  local missing = requested - tokens
  if refill > 0 then
    retry_ms = math.ceil((missing / refill) * 1000)
  else
    retry_ms = 1000
  end
end
redis.call('SET', key, string.format('%.6f:%.6f', tokens, now), 'EX', 3600)
return {allowed, tokens, retry_ms}
"""

    def __init__(
        self,
        redis_client: AsyncRedisClient,
        *,
        capacity: float = DEFAULT_TOKEN_BUCKET_CAPACITY,
        refill_per_second: float = DEFAULT_TOKEN_BUCKET_REFILL_PER_SEC,
        prefix: str = "cost-guard:tb",
        clock: Callable[[], float] = time.time,
    ) -> None:
        if capacity < 1:
            raise ValueError("capacity must be >= 1")
        if refill_per_second <= 0:
            raise ValueError("refill_per_second must be positive")
        self._redis = redis_client
        self._capacity = float(capacity)
        self._refill = float(refill_per_second)
        self._prefix = prefix
        self._clock = clock

    async def acquire(
        self,
        *,
        tenant_id: str,
        tokens: float = 1.0,
    ) -> TokenBucketDecision:
        if tokens <= 0:
            raise ValueError("tokens must be positive")
        key = f"{self._prefix}:{hashlib.sha256(tenant_id.encode()).hexdigest()[:24]}"
        try:
            result = await self._redis.eval(
                self._SCRIPT,
                1,
                key,
                self._capacity,
                self._refill,
                float(self._clock()),
                float(tokens),
            )
        except Exception as exc:
            raise CostGuardUnavailable(
                "Token bucket state unavailable; model call blocked."
            ) from exc

        if not isinstance(result, (list, tuple)) or len(result) < 3:
            raise CostGuardUnavailable("Token bucket returned an invalid response.")

        allowed = int(result[0]) == 1
        remaining = max(0.0, float(result[1]))
        retry_ms = max(0, int(result[2]))
        retry_after = None if allowed else max(1, (retry_ms + 999) // 1000)
        return TokenBucketDecision(
            allowed=allowed,
            tokens_remaining=remaining,
            retry_after_seconds=retry_after,
        )


class DeferredExecutionReceipt(BaseModel):
    """Lifecycle-safe deferral; never terminates the Python process."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    deferred: bool = True
    retry_after_seconds: int = Field(ge=1, le=3600)
    mode: Literal["cloud_tasks", "redis_backoff"]
    task_name: str | None = None
    attempt: int = Field(ge=1, le=32)


async def defer_execution_with_backoff(
    redis_client: AsyncRedisClient,
    *,
    workload_key: str,
    payload: dict[str, JsonValue],
    retry_after_seconds: int | None = None,
    base_seconds: int = DEFAULT_DEFER_BASE_SECONDS,
    max_seconds: int = DEFAULT_DEFER_MAX_SECONDS,
) -> DeferredExecutionReceipt:
    """Record a deferred AI workload and best-effort schedule Cloud Tasks delay.

    Process lifecycle stays under the cloud runtime. This path never calls
    ``sys.exit`` and never raises unhandled provider failures for quota pressure.
    """

    attempt_key = f"cost-guard:defer:attempts:{_fingerprint(workload_key)}"
    try:
        attempt = int(await redis_client.incr(attempt_key))
        await redis_client.expire(attempt_key, 3600)
    except Exception as exc:
        raise CostGuardUnavailable(
            "Deferral counter unavailable; model call blocked."
        ) from exc

    delay = retry_after_seconds or min(
        max_seconds,
        base_seconds * (2 ** max(0, attempt - 1)),
    )
    delay = max(1, min(int(delay), max_seconds))

    envelope = {
        "workload_key": workload_key,
        "attempt": attempt,
        "retry_after_seconds": delay,
        "payload": payload,
        "created_at_epoch": int(time.time()),
    }
    defer_key = f"cost-guard:defer:payload:{_fingerprint(workload_key)}"
    try:
        await redis_client.set(
            defer_key,
            json.dumps(envelope, separators=(",", ":"), sort_keys=True),
            ex=max(delay * 2, 300),
        )
    except Exception as exc:
        raise CostGuardUnavailable(
            "Deferral payload could not be persisted."
        ) from exc

    task_name = await _try_schedule_cloud_tasks_delay(
        payload=envelope,
        delay_seconds=delay,
        workload_key=workload_key,
        attempt=attempt,
    )
    if task_name:
        return DeferredExecutionReceipt(
            retry_after_seconds=delay,
            mode="cloud_tasks",
            task_name=task_name,
            attempt=attempt,
        )
    return DeferredExecutionReceipt(
        retry_after_seconds=delay,
        mode="redis_backoff",
        task_name=None,
        attempt=attempt,
    )


async def admit_or_defer(
    redis_client: AsyncRedisClient,
    *,
    tenant_id: str,
    workload_key: str,
    payload: dict[str, JsonValue],
    bucket: RedisTokenBucket | None = None,
) -> DeferredExecutionReceipt | None:
    """Acquire a token; on denial schedule backoff instead of crashing."""

    limiter = bucket or RedisTokenBucket(redis_client)
    decision = await limiter.acquire(tenant_id=tenant_id)
    if decision.allowed:
        return None
    return await defer_execution_with_backoff(
        redis_client,
        workload_key=workload_key,
        payload=payload,
        retry_after_seconds=decision.retry_after_seconds,
    )


class IdleQueueObservation(BaseModel):
    """Pure decision output; infrastructure owns process termination."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    queue_depth: int = Field(ge=0)
    active_jobs: int = Field(ge=0)
    idle_for_seconds: float = Field(ge=0)
    scale_down_eligible: bool


class IdleQueueGuard:
    """Observe an exact idle window without killing a Cloud Run process.

    Cloud Run services scale from zero only when an HTTP/event request arrives.
    Calling process-exit helpers from an RQ listener can lose work or trigger
    restarts, so this class emits a decision for an external event-driven scaler.
    """

    def __init__(
        self,
        *,
        idle_seconds: int = DEFAULT_IDLE_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if idle_seconds < 1:
            raise ValueError("idle_seconds must be positive")
        self._idle_seconds = idle_seconds
        self._clock = clock
        self._idle_started_at: float | None = None

    def observe(
        self,
        *,
        queue_depth: int,
        active_jobs: int,
    ) -> IdleQueueObservation:
        if queue_depth < 0 or active_jobs < 0:
            raise ValueError("queue_depth and active_jobs cannot be negative")

        now = self._clock()
        if queue_depth or active_jobs:
            self._idle_started_at = None
            return IdleQueueObservation(
                queue_depth=queue_depth,
                active_jobs=active_jobs,
                idle_for_seconds=0.0,
                scale_down_eligible=False,
            )

        if self._idle_started_at is None:
            self._idle_started_at = now
        idle_for = max(0.0, now - self._idle_started_at)
        return IdleQueueObservation(
            queue_depth=queue_depth,
            active_jobs=active_jobs,
            idle_for_seconds=idle_for,
            scale_down_eligible=idle_for >= self._idle_seconds,
        )


def normalize_query(query: str) -> str:
    normalized = unicodedata.normalize("NFKC", query)
    return " ".join(normalized.casefold().split())


def schema_fingerprint(model: type[BaseModel]) -> str:
    schema = json.dumps(
        model.model_json_schema(),
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(schema).hexdigest()


def _decode_redis_value(raw: object) -> str:
    if isinstance(raw, bytes):
        return raw.decode("utf-8")
    if isinstance(raw, str):
        return raw
    raise TypeError("Redis cache value must be bytes or str")


def _fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


async def _try_schedule_cloud_tasks_delay(
    *,
    payload: dict[str, object],
    delay_seconds: int,
    workload_key: str,
    attempt: int,
) -> str | None:
    """Best-effort delayed Cloud Tasks HTTP; absent config returns None."""

    target = os.getenv("CLOUD_TASKS_AI_RETRY_URL", "").rstrip("/")
    if not target:
        return None

    try:
        import importlib

        tasks_v2 = importlib.import_module("google.cloud.tasks_v2")
        timestamp_pb2 = importlib.import_module("google.protobuf.timestamp_pb2")
        from services.render_dispatch import CloudTasksConfig, _get_cloud_tasks_client

        config = CloudTasksConfig.from_env()
        client = _get_cloud_tasks_client()
        parent = client.queue_path(config.project_id, config.location, config.queue)
        schedule = timestamp_pb2.Timestamp()
        schedule.FromSeconds(int(time.time()) + int(delay_seconds))
        digest = _fingerprint(f"{workload_key}:{attempt}")
        task_id = f"ai-retry-{digest}"
        task = {
            "name": f"{parent}/tasks/{task_id}",
            "schedule_time": schedule,
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url": target,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps(payload, separators=(",", ":")).encode("utf-8"),
                "oidc_token": {
                    "service_account_email": config.service_account_email,
                    "audience": config.oidc_audience,
                },
            },
        }
        created = await __import__("asyncio").to_thread(
            client.create_task,
            request={"parent": parent, "task": task},
        )
        return getattr(created, "name", task_id)
    except Exception:
        logger.warning(
            "cloud_tasks_ai_defer_skipped workload=%s attempt=%d",
            _fingerprint(workload_key),
            attempt,
            exc_info=True,
        )
        return None
