"""AI exact-state cache hit counters + re-chat dedupe fingerprint."""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from middleware.cost_guard import (
    CacheLookupStatus,
    SimilarQueryCache,
    ai_cache_stats,
    reset_ai_cache_stats_for_tests,
    schema_fingerprint,
)
from pydantic import BaseModel


class _Output(BaseModel):
    answer: str


class _FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, object] = {}

    async def get(self, key: str) -> object:
        return self.store.get(key)

    async def set(
        self,
        key: str,
        value: object,
        *,
        ex: int | None = None,
        nx: bool = False,
    ) -> object:
        if nx and key in self.store:
            return False
        self.store[key] = value
        return True

    async def delete(self, key: str) -> object:
        self.store.pop(key, None)
        return 1

    async def eval(self, *_a, **_k) -> object:
        return 1


def _descriptor(query: str, *, user_id: str = "user-1"):
    from middleware.cost_guard import CacheDescriptor

    return CacheDescriptor(
        user_id=user_id,
        operation="logic",
        query=query,
        workload_id="video-1",
        tier="free",
        context={"revision": 1},
        response_schema_hash=schema_fingerprint(_Output),
    )


@pytest.mark.asyncio
async def test_ai_cache_stats_track_hit_and_miss() -> None:
    reset_ai_cache_stats_for_tests()
    cache = SimilarQueryCache(_FakeRedis())
    miss = await cache.lookup(_descriptor("add captions"))
    assert miss.status is CacheLookupStatus.MISS_RESERVED
    assert await cache.store(miss, {"answer": "done"}) is True
    hit = await cache.lookup(_descriptor("ADD   captions"))
    assert hit.status is CacheLookupStatus.HIT
    stats = ai_cache_stats()
    assert stats["misses"] == 1
    assert stats["hits"] == 1
    assert stats["hit_rate"] == 0.5


@pytest.mark.asyncio
async def test_rechat_same_command_hits_cache_not_second_miss() -> None:
    """Identical re-chat must not reserve a second model call."""
    reset_ai_cache_stats_for_tests()
    cache = SimilarQueryCache(_FakeRedis())
    first = await cache.lookup(_descriptor("trim the hook"))
    await cache.store(first, {"answer": "trimmed"})
    second = await cache.lookup(_descriptor("trim the hook"))
    third = await cache.lookup(_descriptor("trim the hook"))
    assert second.status is CacheLookupStatus.HIT
    assert third.status is CacheLookupStatus.HIT
    stats = ai_cache_stats()
    assert stats["misses"] == 1
    assert stats["hits"] == 2
