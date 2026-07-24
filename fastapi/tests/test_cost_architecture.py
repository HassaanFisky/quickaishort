"""Deterministic tests for AI cost routing, caching, and Free limits."""

from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Iterable
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from google.genai.errors import ClientError
from pydantic import BaseModel, ConfigDict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agent.router import (  # noqa: E402
    DualModelRouter,
    LogicRouteRequest,
    VisualFrame,
    VisualRouteRequest,
)
from core.limits import (  # noqa: E402
    ExportResolution,
    FREE_PLAN_LIMITS,
    LimitRequest,
    RedisDailyUsageStore,
    UserTier,
    enforce_user_limits,
    evaluate_static_limits,
    get_render_policy,
    resource_ceiling_detail,
)
from middleware.cost_guard import (  # noqa: E402
    CacheDescriptor,
    CacheLookupStatus,
    IdleQueueGuard,
    RedisTokenBucket,
    SimilarQueryCache,
    admit_or_defer,
    schema_fingerprint,
)
from render_worker import apply_tier_render_policy  # noqa: E402
from services.queue_service import (  # noqa: E402
    RQ_WORKER_TTL_SECONDS,
    create_worker_redis_connection,
)
from services import ai_editor_engine, gemini_client, queue_service  # noqa: E402
from services.gemini_backpressure import (  # noqa: E402
    Gemini429Kind,
    GeminiBackpressureError,
    GeminiCooldown,
    RedisGeminiBackpressure,
)
from services.render_service import (  # noqa: E402
    RenderJob,
    RenderService,
    WatermarkConfig,
)


class _Output(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    answer: str


class _FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, object] = {}
        self.sets: dict[str, set[str]] = {}

    async def get(self, key: str) -> object:
        return self.values.get(key)

    async def set(
        self,
        key: str,
        value: object,
        *,
        ex: int | None = None,
        nx: bool = False,
    ) -> object:
        _ = ex
        if nx and key in self.values:
            return None
        self.values[key] = value
        return True

    async def delete(self, *keys: str) -> int:
        deleted = 0
        for key in keys:
            deleted += int(key in self.values or key in self.sets)
            self.values.pop(key, None)
            self.sets.pop(key, None)
        return deleted

    async def incr(self, key: str) -> int:
        value = int(self.values.get(key, 0)) + 1
        self.values[key] = value
        return value

    async def expire(self, key: str, seconds: int) -> bool:
        _ = key, seconds
        return True

    async def sadd(self, key: str, *values: str) -> int:
        bucket = self.sets.setdefault(key, set())
        before = len(bucket)
        bucket.update(values)
        return len(bucket) - before

    async def scard(self, key: str) -> int:
        return len(self.sets.get(key, set()))

    async def sismember(self, key: str, value: str) -> bool:
        return value in self.sets.get(key, set())

    async def srem(self, key: str, *values: str) -> int:
        bucket = self.sets.get(key)
        if not bucket:
            return 0
        removed = 0
        for value in values:
            if value in bucket:
                bucket.remove(value)
                removed += 1
        return removed

    async def eval(
        self,
        script: str,
        number_of_keys: int,
        *keys_and_args: object,
    ) -> object:
        assert number_of_keys == 1
        key = str(keys_and_args[0])
        # Unlock script: GET/DEL token compare
        if "redis.call('DEL'" in script or 'redis.call("DEL"' in script:
            token = keys_and_args[1]
            if self.values.get(key) == token:
                self.values.pop(key, None)
                return 1
            return 0
        # Token-bucket script: capacity, refill, now, requested
        capacity = float(keys_and_args[1])
        refill = float(keys_and_args[2])
        now = float(keys_and_args[3])
        requested = float(keys_and_args[4])
        raw = self.values.get(key)
        tokens = capacity
        updated = now
        if isinstance(raw, str) and ":" in raw:
            left, right = raw.split(":", 1)
            tokens = float(left)
            updated = float(right)
        elapsed = max(0.0, now - updated)
        tokens = min(capacity, tokens + (elapsed * refill))
        if tokens >= requested:
            tokens -= requested
            self.values[key] = f"{tokens:.6f}:{now:.6f}"
            return [1, tokens, 0]
        missing = requested - tokens
        retry_ms = int((missing / refill) * 1000) if refill > 0 else 1000
        self.values[key] = f"{tokens:.6f}:{now:.6f}"
        return [0, tokens, retry_ms]


class _FakeGateway:
    def __init__(self, responses: Iterable[str]) -> None:
        self.responses = list(responses)
        self.models: list[str] = []
        self.contents: list[object] = []

    async def generate(
        self,
        contents: object,
        *,
        model: str,
        generation_config: dict[str, object],
    ) -> str:
        _ = generation_config
        self.contents.append(contents)
        self.models.append(model)
        return self.responses.pop(0)


async def _free_tier(_user_id: str) -> UserTier:
    return UserTier.FREE


def _descriptor(query: str) -> CacheDescriptor:
    return CacheDescriptor(
        user_id="user-1",
        operation="logic",
        query=query,
        workload_id="video-1",
        tier="free",
        context={"revision": 1},
        response_schema_hash=schema_fingerprint(_Output),
    )


@pytest.mark.asyncio
async def test_normalized_query_cache_returns_validated_hit() -> None:
    cache = SimilarQueryCache(_FakeRedis())
    first = await cache.lookup(_descriptor("  ADD   Captions "))
    assert first.status is CacheLookupStatus.MISS_RESERVED
    assert await cache.store(first, {"answer": "done"}) is True

    second = await cache.lookup(_descriptor("add captions"))
    assert second.status is CacheLookupStatus.HIT
    assert second.payload == {"answer": "done"}


def test_cache_fingerprint_is_tenant_scoped_and_collision_guarded() -> None:
    cache = SimilarQueryCache(_FakeRedis())
    first = _descriptor("add captions")
    second = first.model_copy(update={"user_id": "user-2"})

    first_key = cache.build_key(first)
    second_key = cache.build_key(second)

    assert first_key != second_key
    parts = first_key.split(":")
    assert parts[1] == "ai-json-v2"
    assert len(parts[-2]) == 32  # requested MD5 non-security fingerprint
    assert len(parts[-1]) == 32  # SHA-256 collision guard


def test_idle_guard_becomes_eligible_at_exactly_60_seconds() -> None:
    now = [100.0]
    guard = IdleQueueGuard(idle_seconds=60, clock=lambda: now[0])

    assert not guard.observe(queue_depth=0, active_jobs=0).scale_down_eligible
    now[0] = 159.999
    assert not guard.observe(queue_depth=0, active_jobs=0).scale_down_eligible
    now[0] = 160.0
    assert guard.observe(queue_depth=0, active_jobs=0).scale_down_eligible

    assert not guard.observe(queue_depth=1, active_jobs=0).scale_down_eligible


def test_free_static_limits_block_4k_and_require_watermark() -> None:
    decision = evaluate_static_limits(
        tier=UserTier.FREE,
        request=LimitRequest(
            workload_id="video-1",
            requested_export_resolution=ExportResolution.UHD_4K,
        ),
    )
    assert decision.allowed is False
    assert decision.action_intent.value == "UPGRADE_PRO"
    assert decision.watermark_required is True
    assert decision.watermark_text == "Made with QuickAI"
    assert decision.message.startswith("Resource ceiling crossed")


@pytest.mark.asyncio
async def test_daily_limit_caps_three_unique_workloads() -> None:
    assert FREE_PLAN_LIMITS.daily_ai_video_limit == 3
    store = RedisDailyUsageStore(_FakeRedis())
    for index in range(3):
        result = await enforce_user_limits(
            "user-1",
            LimitRequest(
                workload_id=f"video-{index}",
                reserve_daily_video=True,
            ),
            tier=UserTier.FREE,
            usage_store=store,
        )
        assert result.decision.allowed is True

    blocked = await enforce_user_limits(
        "user-1",
        LimitRequest(workload_id="video-overflow", reserve_daily_video=True),
        tier=UserTier.FREE,
        usage_store=store,
    )
    assert blocked.decision.allowed is False
    assert blocked.decision.action_intent.value == "UPGRADE_PRO"
    assert blocked.decision.reason.value == "daily_video_limit"
    detail = resource_ceiling_detail(blocked.decision)
    assert detail["action_intent"] == "UPGRADE_PRO"
    assert str(detail["message"]).startswith("Resource ceiling crossed")

    # Same workload may repeat without consuming another unique slot.
    repeat = await enforce_user_limits(
        "user-1",
        LimitRequest(workload_id="video-0", reserve_daily_video=True),
        tier=UserTier.FREE,
        usage_store=store,
    )
    assert repeat.decision.allowed is True


@pytest.mark.asyncio
async def test_token_bucket_defers_instead_of_crashing() -> None:
    redis = _FakeRedis()
    bucket = RedisTokenBucket(
        redis,
        capacity=1,
        refill_per_second=0.01,
        clock=lambda: 100.0,
    )
    first = await bucket.acquire(tenant_id="user-1")
    second = await bucket.acquire(tenant_id="user-1")
    assert first.allowed is True
    assert second.allowed is False
    assert second.retry_after_seconds is not None

    receipt = await admit_or_defer(
        redis,
        tenant_id="user-1",
        workload_key="user-1:video-1:edit",
        payload={"query": "trim"},
        bucket=bucket,
    )
    assert receipt is not None
    assert receipt.deferred is True
    assert receipt.mode == "redis_backoff"
    assert receipt.retry_after_seconds >= 1


@pytest.mark.asyncio
async def test_router_cache_prevents_second_model_call() -> None:
    redis = _FakeRedis()
    gateway = _FakeGateway(['{"answer":"done"}'])
    router = DualModelRouter(
        gateway=gateway,
        cache=SimilarQueryCache(redis),
        tier_resolver=_free_tier,
        provider_admission=False,
    )
    request = LogicRouteRequest(
        user_id="user-1",
        workload_id="video-1",
        query="Add captions",
    )

    first = await router.route(request, output_model=_Output)
    second = await router.route(request, output_model=_Output)

    assert first.cached is False
    assert second.cached is True
    assert second.payload == {"answer": "done"}
    assert gateway.models == ["gemini-2.5-flash-lite"]
    assert first.profile_used == "luna-orchestration-v1"
    assert "ROUTING_PROFILE: luna-orchestration-v1" in str(gateway.contents[0])


@pytest.mark.asyncio
async def test_router_repairs_only_invalid_json_with_bounded_fallback() -> None:
    redis = _FakeRedis()
    gateway = _FakeGateway(["not-json", '{"answer":"repaired"}'])
    router = DualModelRouter(
        gateway=gateway,
        cache=SimilarQueryCache(redis),
        tier_resolver=_free_tier,
        provider_admission=False,
    )

    result = await router.route(
        LogicRouteRequest(
            user_id="user-1",
            workload_id="video-1",
            query="Trim the intro",
        ),
        output_model=_Output,
    )

    assert result.fallback_used is True
    assert result.profile_used == "luna-orchestration-v1"
    assert result.fallback_profile == "terra-json-repair-v1"
    assert result.payload == {"answer": "repaired"}
    assert gateway.models == ["gemini-2.5-flash-lite", "gemini-2.5-flash"]


@pytest.mark.asyncio
async def test_visual_route_uses_native_gemini_profile() -> None:
    gateway = _FakeGateway(['{"answer":"seen"}'])
    router = DualModelRouter(
        gateway=gateway,
        cache=SimilarQueryCache(_FakeRedis()),
        tier_resolver=_free_tier,
        provider_admission=False,
    )
    frame = VisualFrame(
        timestamp_ms=1250,
        mime_type="image/jpeg",
        data_base64=base64.b64encode(b"jpeg-bytes").decode("ascii"),
    )

    result = await router.route(
        VisualRouteRequest(
            user_id="user-1",
            workload_id="video-1",
            query="Map frame changes",
            frames=[frame],
        ),
        output_model=_Output,
    )

    assert result.profile_used == "gemini-visual-v1"
    assert result.payload == {"answer": "seen"}
    assert gateway.models == ["gemini-2.5-flash"]


@pytest.mark.asyncio
async def test_router_returns_retry_later_during_redis_cooldown() -> None:
    deferred = GeminiBackpressureError(
        GeminiCooldown(
            kind=Gemini429Kind.TRANSIENT_RATE_LIMIT,
            retry_after_seconds=4,
            blocked_until_epoch=104,
        )
    )
    gateway = SimpleNamespace(generate=AsyncMock(side_effect=deferred))
    router = DualModelRouter(
        gateway=gateway,
        cache=SimilarQueryCache(_FakeRedis()),
        tier_resolver=_free_tier,
        provider_admission=False,
    )

    result = await router.route(
        LogicRouteRequest(
            user_id="user-1",
            workload_id="video-1",
            query="Trim the intro",
        ),
        output_model=_Output,
    )

    assert result.action_intent == "RETRY_LATER"
    assert result.retry_after_seconds == 4
    assert result.payload is None


@pytest.mark.asyncio
async def test_router_blocks_free_4k_before_gateway_call() -> None:
    redis = _FakeRedis()
    gateway = _FakeGateway([])
    router = DualModelRouter(
        gateway=gateway,
        cache=SimilarQueryCache(redis),
        tier_resolver=_free_tier,
        provider_admission=False,
    )

    result = await router.route(
        LogicRouteRequest(
            user_id="user-1",
            workload_id="video-1",
            query="Export this in 4K",
        ),
        output_model=_Output,
    )

    assert result.action_intent == "UPGRADE_PRO"
    assert gateway.models == []


def test_free_worker_policy_forces_720_watermark_without_mutating_input() -> None:
    raw = {
        "aspect_ratio": "9:16",
        "watermark_enabled": False,
        "render_manifest": {
            "timeline": {"width": 2160, "height": 3840},
        },
        "production_plan": {
            "output_width": 2160,
            "output_height": 3840,
        },
    }

    guarded = apply_tier_render_policy(raw, UserTier.FREE)

    assert guarded["export_resolution"] == "720p"
    assert guarded["output_width"] == 720
    assert guarded["output_height"] == 1280
    assert guarded["watermark_enabled"] is True
    assert guarded["watermark_text"] == "Made with QuickAI"
    assert guarded["render_manifest"]["timeline"]["width"] == 720
    assert guarded["production_plan"]["output_height"] == 1280
    assert raw["render_manifest"]["timeline"]["width"] == 2160


def test_pro_render_policy_allows_4k_without_forced_watermark() -> None:
    policy = get_render_policy(
        UserTier.PRO,
        aspect_ratio="9:16",
        requested_resolution=ExportResolution.UHD_4K,
    )

    assert policy.output_width == 2160
    assert policy.output_height == 3840
    assert policy.watermark_required is False


def test_rq_worker_socket_outlives_blocking_dequeue() -> None:
    connection = create_worker_redis_connection()
    try:
        socket_timeout = connection.connection_pool.connection_kwargs["socket_timeout"]
        assert socket_timeout > RQ_WORKER_TTL_SECONDS - 15
    finally:
        connection.close()


@pytest.mark.asyncio
async def test_editor_cache_avoids_duplicate_model_call_and_credit(
    monkeypatch,
) -> None:
    redis = _FakeRedis()
    generated = {
        "intent": "edit",
        "confidence": 1.0,
        "actions": [],
        "feedback": "Done.",
        "fallback": "Retry.",
        "model_used": "gemini-2.5-flash-lite",
        "clamped": [],
        "dropped": [],
        "message": "Done.",
        "suggestions": [],
        "status": "no_op",
    }
    uncached = AsyncMock(return_value=generated)
    charge = AsyncMock()
    monkeypatch.setattr(queue_service, "async_redis_conn", redis)
    monkeypatch.setattr(
        ai_editor_engine,
        "_process_editor_command_uncached",
        uncached,
    )

    kwargs = {
        "command": "Add captions",
        "user_tier": "free",
        "project_context": {"duration": 60.0, "clipCount": 1},
        "user_id": "user-1",
        "workload_id": "video-1",
        "before_model": charge,
    }
    first = await ai_editor_engine.process_editor_command(**kwargs)
    second = await ai_editor_engine.process_editor_command(**kwargs)

    assert first == second
    uncached.assert_awaited_once()
    charge.assert_awaited_once()


@pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
    reason="FFmpeg binaries unavailable",
)
def test_free_render_transcodes_to_720p_with_watermark_filter() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        source = workdir / "source.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=c=blue:s=320x240:r=30",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=channel_layout=stereo:sample_rate=44100",
                "-t",
                "1",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                str(source),
            ],
            check=True,
            capture_output=True,
        )
        output = RenderService()._transcode(
            RenderJob(
                video_id="test",
                start_sec=0,
                end_sec=1,
                output_width=720,
                output_height=1280,
                quality="low",
                watermark=WatermarkConfig(
                    enabled=True,
                    text="Made with QuickAI",
                ),
            ),
            source,
            workdir,
        )
        probe = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "json",
                str(output),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        stream = json.loads(probe.stdout)["streams"][0]
        assert stream == {"width": 720, "height": 1280}


@pytest.mark.asyncio
async def test_gemini_quota_error_is_never_retried(monkeypatch) -> None:
    quota_error = ClientError(
        429,
        {
            "error": {
                "code": 429,
                "status": "RESOURCE_EXHAUSTED",
                "message": "prepayment credits depleted",
            }
        },
    )
    generate = AsyncMock(side_effect=quota_error)
    client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(
        generate_content=generate
    )))
    guard = RedisGeminiBackpressure(_FakeRedis(), clock=lambda: 100.0)
    monkeypatch.setattr(gemini_client, "get_client", lambda: client)
    monkeypatch.setattr(gemini_client, "_get_backpressure_guard", lambda: guard)

    with pytest.raises(GeminiBackpressureError) as first:
        await gemini_client.call_gemini("prompt", max_attempts=3)
    assert first.value.cooldown.kind is Gemini429Kind.HARD_QUOTA

    with pytest.raises(GeminiBackpressureError):
        await gemini_client.call_gemini("prompt", max_attempts=3)

    generate.assert_awaited_once()


@pytest.mark.asyncio
async def test_transient_429_uses_bounded_exponential_redis_cooldown() -> None:
    redis = _FakeRedis()
    guard = RedisGeminiBackpressure(
        redis,
        base_delay_seconds=2,
        max_delay_seconds=8,
        clock=lambda: 100.0,
    )
    rate_error = ClientError(
        429,
        {
            "error": {
                "code": 429,
                "status": "RESOURCE_EXHAUSTED",
                "message": "Requests per minute exceeded",
            }
        },
    )

    first = await guard.record_429(rate_error)
    second = await guard.record_429(rate_error)

    assert first is not None
    assert second is not None
    assert first.cooldown.kind is Gemini429Kind.TRANSIENT_RATE_LIMIT
    assert first.cooldown.retry_after_seconds == 2
    assert second.cooldown.retry_after_seconds == 4


@pytest.mark.asyncio
async def test_gemini_retry_count_is_hard_capped(monkeypatch) -> None:
    generate = AsyncMock()
    client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(
        generate_content=generate
    )))
    monkeypatch.setattr(gemini_client, "get_client", lambda: client)

    with pytest.raises(ValueError):
        await gemini_client.call_gemini("prompt", max_attempts=4)

    generate.assert_not_awaited()


@pytest.mark.asyncio
async def test_mock_ai_mode_short_circuits_gemini_http(monkeypatch) -> None:
    generate = AsyncMock()
    client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    )
    monkeypatch.setenv("MOCK_AI_MODE", "true")
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.setattr(gemini_client, "get_client", lambda: client)

    response = await gemini_client.call_gemini_text(
        "ROUTING_PROFILE: luna-orchestration-v1\nTrim the intro",
        json_mode=True,
        max_attempts=1,
    )
    payload = json.loads(response)

    assert payload["status"] == "ok"
    assert isinstance(payload["actions"], list)
    assert payload["actions"][0]["type"] == "TRIM"
    generate.assert_not_awaited()


@pytest.mark.asyncio
async def test_mock_ai_mode_blocked_in_production(monkeypatch) -> None:
    generate = AsyncMock(
        return_value=SimpleNamespace(text='{"ok":true}')
    )
    client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    )
    guard = RedisGeminiBackpressure(_FakeRedis(), clock=lambda: 100.0)
    monkeypatch.setenv("MOCK_AI_MODE", "true")
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setattr(gemini_client, "get_client", lambda: client)
    monkeypatch.setattr(gemini_client, "_get_backpressure_guard", lambda: guard)

    text = await gemini_client.call_gemini_text("hello", json_mode=False, max_attempts=1)

    assert text == '{"ok":true}'
    generate.assert_awaited_once()


@pytest.mark.asyncio
async def test_router_mock_ai_mode_returns_timeline_without_gateway(
    monkeypatch,
) -> None:
    from agent.router import TimelinePlanOutput

    monkeypatch.setenv("MOCK_AI_MODE", "true")
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    gateway = _FakeGateway([])
    router = DualModelRouter(
        gateway=gateway,
        cache=SimilarQueryCache(_FakeRedis()),
        tier_resolver=_free_tier,
        provider_admission=False,
    )

    result = await router.route(
        LogicRouteRequest(
            user_id="user-1",
            workload_id="video-1",
            query="Add captions and trim",
        ),
        output_model=TimelinePlanOutput,
    )

    assert result.action_intent == "EXECUTE"
    assert result.model_used == "mock-ai-mode"
    assert result.profile_used == "luna-orchestration-v1"
    assert result.payload is not None
    assert result.payload["status"] == "ok"
    assert result.payload["actions"][0]["type"] == "TRIM"
    assert gateway.models == []


def test_mock_ai_mode_default_is_false() -> None:
    from core import flags

    assert flags.MOCK_AI_MODE is False
