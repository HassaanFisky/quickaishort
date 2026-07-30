"""Cloud Tasks dispatch and request-bound renderer contract tests."""

from __future__ import annotations

import json
import os
import re
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from google.api_core.exceptions import AlreadyExists
from pydantic import ValidationError

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import render_service_app
import render_worker
from services import render_dispatch
from services.render_dispatch import RenderTaskPayload


class _FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.hashes: dict[str, dict[str, str]] = {}
        self.pending: set[str] = set()

    def get(self, key: str):
        return self.values.get(key)

    def setex(self, key: str, _ttl: int, value: str) -> bool:
        self.values[key] = value
        return True

    def hget(self, key: str, field: str):
        return self.hashes.get(key, {}).get(field)

    def hset(self, key: str, mapping: dict[str, str]) -> int:
        self.hashes.setdefault(key, {}).update(mapping)
        return len(mapping)

    def expire(self, _key: str, _ttl: int) -> bool:
        return True

    def zadd(self, _key: str, mapping: dict[str, float]) -> int:
        self.pending.update(mapping)
        return len(mapping)

    def zrem(self, _key: str, member: str) -> int:
        existed = member in self.pending
        self.pending.discard(member)
        return int(existed)


class _FakeTasksClient:
    def __init__(self, *, duplicate: bool = False) -> None:
        self.duplicate = duplicate
        self.request = None

    def queue_path(self, project: str, location: str, queue: str) -> str:
        return f"projects/{project}/locations/{location}/queues/{queue}"

    def task_path(
        self,
        project: str,
        location: str,
        queue: str,
        task: str,
    ) -> str:
        return f"{self.queue_path(project, location, queue)}/tasks/{task}"

    def create_task(self, *, request):
        self.request = request
        if self.duplicate:
            raise AlreadyExists("task exists")
        return SimpleNamespace(name=request.task.name)


def _payload(**overrides) -> RenderTaskPayload:
    values = {
        "job_id": "job-1",
        "video_id": "video-1",
        "start_sec": 0.0,
        "end_sec": 10.0,
        "user_id": "user-1",
        "options": {"quality": "medium", "captions_enabled": True},
        "run_id": "run-1",
    }
    values.update(overrides)
    return RenderTaskPayload(**values)


@pytest.fixture
def cloud_tasks_env(monkeypatch):
    monkeypatch.setenv("RENDER_DISPATCH_MODE", "cloud_tasks")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "project-1")
    monkeypatch.setenv("CLOUD_TASKS_LOCATION", "us-central1")
    monkeypatch.setenv("CLOUD_TASKS_QUEUE", "quickai-render")
    monkeypatch.setenv("CLOUD_TASKS_RENDER_URL", "https://renderer.example.run.app")
    monkeypatch.setenv("CLOUD_TASKS_OIDC_AUDIENCE", "https://renderer.example.run.app")
    monkeypatch.setenv(
        "CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT",
        "renderer-invoker@project-1.iam.gserviceaccount.com",
    )


@pytest.mark.asyncio
async def test_production_defaults_to_cloud_tasks_without_explicit_mode(
    monkeypatch,
    cloud_tasks_env,
) -> None:
    monkeypatch.delenv("RENDER_DISPATCH_MODE", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "production")
    fake_redis = _FakeRedis()
    fake_client = _FakeTasksClient()
    monkeypatch.setattr(render_dispatch, "redis_conn", fake_redis)
    monkeypatch.setattr(render_dispatch, "_get_cloud_tasks_client", lambda: fake_client)

    receipt = await render_dispatch.dispatch_render_task(_payload())
    assert receipt.mode == "cloud_tasks"


@pytest.mark.asyncio
async def test_cloud_task_has_named_id_oidc_and_bounded_deadline(
    monkeypatch,
    cloud_tasks_env,
) -> None:
    fake_redis = _FakeRedis()
    fake_client = _FakeTasksClient()
    monkeypatch.setattr(render_dispatch, "redis_conn", fake_redis)
    monkeypatch.setattr(render_dispatch, "_get_cloud_tasks_client", lambda: fake_client)

    receipt = await render_dispatch.dispatch_render_task(_payload())

    assert receipt.mode == "cloud_tasks"
    assert receipt.deduplicated is False
    task = fake_client.request.task
    assert re.search(r"/tasks/render-job-1-[0-9a-f]{12}$", task.name)
    assert task.http_request.url == "https://renderer.example.run.app/tasks/render"
    assert task.http_request.oidc_token.audience == "https://renderer.example.run.app"
    assert task.dispatch_deadline.seconds == 900
    assert json.loads(task.http_request.body)["job_id"] == "job-1"
    assert fake_redis.hashes["render:meta:job-1"]["status"] == "queued"
    assert fake_redis.values["render:runid:job-1"] == "run-1"


@pytest.mark.asyncio
async def test_named_task_duplicate_is_successful_deduplication(
    monkeypatch,
    cloud_tasks_env,
) -> None:
    monkeypatch.setattr(render_dispatch, "redis_conn", _FakeRedis())
    monkeypatch.setattr(
        render_dispatch,
        "_get_cloud_tasks_client",
        lambda: _FakeTasksClient(duplicate=True),
    )

    receipt = await render_dispatch.dispatch_render_task(_payload())

    assert receipt.deduplicated is True
    assert receipt.mode == "cloud_tasks"


def test_render_payload_rejects_extra_fields_and_non_json_options() -> None:
    with pytest.raises(ValidationError):
        _payload(untrusted=True)
    with pytest.raises(ValidationError):
        _payload(options={"bad": object()})


@pytest.mark.asyncio
async def test_cancelled_task_exits_before_tier_lookup_or_render(monkeypatch) -> None:
    fake_redis = _FakeRedis()
    fake_redis.values["render:runid:job-1"] = "cancelled-run"
    monkeypatch.setattr(render_worker, "redis_conn", fake_redis)
    monkeypatch.setattr(render_dispatch, "redis_conn", fake_redis)
    storage_factory = AsyncMock(side_effect=AssertionError("must not start render"))
    monkeypatch.setattr(render_worker, "get_storage_service", storage_factory)

    result = await render_worker._async_process_render_task(
        "job-1",
        "video-1",
        0.0,
        10.0,
        "user-1",
        {},
        "original-run",
        attempt_number=1,
    )

    assert result == {"status": "superseded", "job_id": "job-1"}
    storage_factory.assert_not_called()
    assert fake_redis.hashes["render:meta:job-1"]["status"] == "superseded"
    # Cancel owner must remain — worker must not reclaim the run id.
    assert fake_redis.values["render:runid:job-1"] == "cancelled-run"


@pytest.mark.asyncio
async def test_renderer_acknowledges_terminal_result(monkeypatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setattr(
        render_service_app, "_require_task_invocation", lambda **_: None
    )
    monkeypatch.setattr(render_service_app, "_ensure_clients", AsyncMock())
    monkeypatch.setattr(
        render_service_app,
        "_execute_render",
        AsyncMock(return_value={"status": "success"}),
    )
    cleanup = AsyncMock()

    async def _to_thread(_function, *args) -> None:
        await cleanup(*args)

    monkeypatch.setattr(
        render_service_app.asyncio,
        "to_thread",
        _to_thread,
    )

    result = await render_service_app.handle_render_task(
        _payload(),
        task_name="projects/p/locations/l/queues/q/tasks/t",
        retry_count="0",
    )

    assert result["status"] == "acknowledged"
    assert result["attempt"] == 1
    cleanup.assert_awaited_once_with("job-1")


@pytest.mark.asyncio
async def test_renderer_final_failure_is_5xx_and_cleans_pending(monkeypatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setattr(
        render_service_app, "_require_task_invocation", lambda **_: None
    )
    monkeypatch.setattr(render_service_app, "_ensure_clients", AsyncMock())
    record_failure = AsyncMock()
    monkeypatch.setattr(
        render_service_app,
        "_record_failed_attempt",
        record_failure,
    )
    monkeypatch.setattr(
        render_service_app,
        "_execute_render",
        AsyncMock(side_effect=RuntimeError("ffmpeg failed")),
    )
    cleanup = AsyncMock()

    async def _to_thread(_function, *args) -> None:
        await cleanup(*args)

    monkeypatch.setattr(render_service_app.asyncio, "to_thread", _to_thread)

    with pytest.raises(HTTPException) as exc_info:
        await render_service_app.handle_render_task(
            _payload(),
            task_name="projects/p/locations/l/queues/q/tasks/t",
            retry_count="2",
        )

    assert exc_info.value.status_code == 500
    record_failure.assert_awaited_once()
    cleanup.assert_awaited_once_with("job-1")


@pytest.mark.asyncio
async def test_renderer_intermediate_failure_keeps_pending_for_retry(
    monkeypatch,
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setattr(
        render_service_app, "_require_task_invocation", lambda **_: None
    )
    monkeypatch.setattr(render_service_app, "_ensure_clients", AsyncMock())
    monkeypatch.setattr(
        render_service_app,
        "_execute_render",
        AsyncMock(side_effect=RuntimeError("transient failure")),
    )
    record_failure = AsyncMock()
    monkeypatch.setattr(
        render_service_app,
        "_record_failed_attempt",
        record_failure,
    )
    cleanup = AsyncMock()

    async def _to_thread(_function, *args) -> None:
        await cleanup(*args)

    monkeypatch.setattr(render_service_app.asyncio, "to_thread", _to_thread)

    with pytest.raises(HTTPException) as exc_info:
        await render_service_app.handle_render_task(
            _payload(),
            task_name="projects/p/locations/l/queues/q/tasks/t",
            retry_count="0",
        )

    assert exc_info.value.status_code == 500
    record_failure.assert_awaited_once()
    cleanup.assert_not_awaited()


@pytest.mark.asyncio
async def test_renderer_rejects_non_task_request_in_production(monkeypatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")

    with pytest.raises(HTTPException) as exc_info:
        await render_service_app.handle_render_task(
            _payload(),
            task_name=None,
            retry_count=None,
        )

    assert exc_info.value.status_code == 403
