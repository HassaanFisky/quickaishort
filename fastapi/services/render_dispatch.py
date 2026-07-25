"""Durable render dispatch with Cloud Tasks in production and RQ in development."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import time
from functools import lru_cache
from typing import Literal

from google.api_core.exceptions import AlreadyExists
from google.cloud import tasks_v2
from google.protobuf import duration_pb2
from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator

from services.queue_service import (
    JOB_FAILURE_TTL_SECONDS,
    JOB_RESULT_TTL_SECONDS,
    JOB_TIMEOUT_SECONDS,
    redis_conn,
    render_queue,
)

logger = logging.getLogger(__name__)

_ARGS_KEY = "render:args:{}"
_META_KEY = "render:meta:{}"
_RUNID_KEY = "render:runid:{}"
_PENDING_KEY = "render:pending"
_RECORD_TTL_SECONDS = 7 * 24 * 3600
_MAX_TASK_BODY_BYTES = 750 * 1024
_TASK_ID_PATTERN = re.compile(r"[^A-Za-z0-9_-]+")
_TERMINAL_STATUSES = {"success", "dead", "cancelled", "superseded", "duplicate"}


class RenderDispatchUnavailable(RuntimeError):
    """Raised when durable render dispatch cannot accept a task."""


class RenderTaskPayload(BaseModel):
    """Strict JSON contract shared by the API and request-bound renderer."""

    model_config = ConfigDict(extra="forbid", strict=True)

    job_id: str = Field(min_length=1, max_length=256)
    video_id: str = Field(min_length=1, max_length=2048)
    start_sec: float = Field(ge=0, le=86_400)
    end_sec: float = Field(ge=0, le=86_400)
    user_id: str = Field(min_length=1, max_length=256)
    options: dict[str, JsonValue] = Field(default_factory=dict)
    run_id: str = Field(default="", max_length=256)

    @model_validator(mode="after")
    def validate_payload(self) -> "RenderTaskPayload":
        if self.end_sec and self.end_sec < self.start_sec:
            raise ValueError("end_sec must be greater than or equal to start_sec")
        if len(self.model_dump_json().encode("utf-8")) > _MAX_TASK_BODY_BYTES:
            raise ValueError("render task payload exceeds 750 KiB")
        return self


class RenderDispatchReceipt(BaseModel):
    """Stable acknowledgement returned after a durable queue accepts work."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    mode: Literal["cloud_tasks", "rq"]
    task_name: str
    deduplicated: bool = False


class CloudTasksConfig(BaseModel):
    """Validated runtime configuration for Cloud Tasks HTTP dispatch."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    project_id: str = Field(min_length=1)
    location: str = Field(min_length=1)
    queue: str = Field(min_length=1)
    render_url: str = Field(pattern=r"^https://")
    oidc_audience: str = Field(pattern=r"^https://")
    service_account_email: str = Field(pattern=r"^[^@\s]+@[^@\s]+$")
    dispatch_deadline_seconds: int = Field(ge=15, le=1800)

    @classmethod
    def from_env(cls) -> "CloudTasksConfig":
        base_url = os.environ.get("CLOUD_TASKS_RENDER_URL", "").rstrip("/")
        audience = os.environ.get("CLOUD_TASKS_OIDC_AUDIENCE", "").rstrip("/")
        return cls(
            project_id=os.environ.get("GOOGLE_CLOUD_PROJECT", ""),
            location=os.environ.get("CLOUD_TASKS_LOCATION", "us-central1"),
            queue=os.environ.get("CLOUD_TASKS_QUEUE", "quickai-render"),
            render_url=f"{base_url}/tasks/render" if base_url else "",
            oidc_audience=audience or base_url,
            service_account_email=os.environ.get(
                "CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT", ""
            ),
            dispatch_deadline_seconds=int(
                os.environ.get("CLOUD_TASKS_DISPATCH_DEADLINE_SECONDS", "900")
            ),
        )


@lru_cache(maxsize=1)
def _get_cloud_tasks_client() -> tasks_v2.CloudTasksClient:
    return tasks_v2.CloudTasksClient()


def _task_id(job_id: str, suffix: str | None = None) -> str:
    safe_job_id = _TASK_ID_PATTERN.sub("-", job_id).strip("-_")
    digest = hashlib.sha256(job_id.encode("utf-8")).hexdigest()[:12]
    base = safe_job_id[:430] or digest
    task_id = f"render-{base}-{digest}"
    if suffix:
        safe_suffix = _TASK_ID_PATTERN.sub("-", suffix).strip("-_")[:40]
        if safe_suffix:
            task_id = f"{task_id}-{safe_suffix}"
    return task_id[:500]


def _record_dispatch(payload: RenderTaskPayload, receipt: RenderDispatchReceipt) -> None:
    """Persist status/recovery metadata without overwriting terminal outcomes."""

    now = time.time()
    meta_key = _META_KEY.format(payload.job_id)
    raw_status = redis_conn.hget(meta_key, "status")
    if isinstance(raw_status, (bytes, bytearray)):
        raw_status = raw_status.decode()

    redis_conn.setex(
        _ARGS_KEY.format(payload.job_id),
        _RECORD_TTL_SECONDS,
        payload.model_dump_json(),
    )
    if raw_status not in _TERMINAL_STATUSES:
        mapping = {
            "job_id": payload.job_id,
            "video_id": payload.video_id,
            "user_id": payload.user_id,
            "quality": str(payload.options.get("quality", "medium")),
            "dispatch_mode": receipt.mode,
            "task_name": receipt.task_name,
            "submitted_at": str(now),
        }
        if not raw_status:
            mapping["status"] = "queued"
        redis_conn.hset(
            meta_key,
            mapping=mapping,
        )
        redis_conn.expire(meta_key, _RECORD_TTL_SECONDS)
        redis_conn.zadd(_PENDING_KEY, {payload.job_id: now})
    if payload.run_id:
        redis_conn.setex(
            _RUNID_KEY.format(payload.job_id),
            _RECORD_TTL_SECONDS,
            payload.run_id,
        )


def mark_render_terminal(job_id: str) -> None:
    """Remove a terminal task from bounded pending-work accounting."""

    redis_conn.zrem(_PENDING_KEY, job_id)


def _claim_run_id(payload: RenderTaskPayload) -> None:
    """Publish the run owner before a task can start or observe cancellation."""

    if payload.run_id:
        redis_conn.setex(
            _RUNID_KEY.format(payload.job_id),
            _RECORD_TTL_SECONDS,
            payload.run_id,
        )


def load_render_task_payload(job_id: str) -> RenderTaskPayload | None:
    """Load the original strict payload for an explicit DLQ retry."""

    raw = redis_conn.get(_ARGS_KEY.format(job_id))
    if not raw:
        return None
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode()
    try:
        return RenderTaskPayload.model_validate_json(raw)
    except Exception:
        logger.exception("render_retry_payload_invalid job_id=%s", job_id)
        return None


def _enqueue_rq(payload: RenderTaskPayload) -> RenderDispatchReceipt:
    """Legacy/local fallback; production uses Cloud Tasks exclusively."""

    from render_worker import process_render_task
    from rq import Retry as RqRetry

    render_queue.enqueue(
        process_render_task,
        payload.job_id,
        payload.video_id,
        payload.start_sec,
        payload.end_sec,
        payload.user_id,
        payload.options,
        payload.run_id,
        job_id=payload.job_id,
        job_timeout=JOB_TIMEOUT_SECONDS,
        result_ttl=JOB_RESULT_TTL_SECONDS,
        failure_ttl=JOB_FAILURE_TTL_SECONDS,
        retry=RqRetry(max=2, interval=[30, 60]),
    )
    return RenderDispatchReceipt(mode="rq", task_name=payload.job_id)


def _enqueue_cloud_task(
    payload: RenderTaskPayload,
    *,
    retry_suffix: str | None,
) -> RenderDispatchReceipt:
    config = CloudTasksConfig.from_env()
    client = _get_cloud_tasks_client()
    parent = client.queue_path(config.project_id, config.location, config.queue)
    task_name = client.task_path(
        config.project_id,
        config.location,
        config.queue,
        _task_id(payload.job_id, retry_suffix),
    )
    deadline = duration_pb2.Duration(seconds=config.dispatch_deadline_seconds)
    task = tasks_v2.Task(
        name=task_name,
        http_request=tasks_v2.HttpRequest(
            http_method=tasks_v2.HttpMethod.POST,
            url=config.render_url,
            headers={"Content-Type": "application/json"},
            oidc_token=tasks_v2.OidcToken(
                service_account_email=config.service_account_email,
                audience=config.oidc_audience,
            ),
            body=payload.model_dump_json().encode("utf-8"),
        ),
        dispatch_deadline=deadline,
    )

    try:
        created = client.create_task(
            request=tasks_v2.CreateTaskRequest(parent=parent, task=task)
        )
        receipt = RenderDispatchReceipt(
            mode="cloud_tasks",
            task_name=created.name or task_name,
        )
    except AlreadyExists:
        receipt = RenderDispatchReceipt(
            mode="cloud_tasks",
            task_name=task_name,
            deduplicated=True,
        )

    return receipt


async def dispatch_render_task(
    payload: RenderTaskPayload,
    *,
    retry_suffix: str | None = None,
) -> RenderDispatchReceipt:
    """Durably enqueue one render without blocking the FastAPI event loop."""

    # Production defaults to Cloud Tasks so a missing env cannot silently enqueue
    # into RQ with no listener (worker is request-bound / min=0).
    explicit = os.environ.get("RENDER_DISPATCH_MODE", "").strip().lower()
    if explicit:
        mode = explicit
    elif os.environ.get("ENVIRONMENT", "").strip().lower() == "production":
        mode = "cloud_tasks"
    else:
        mode = "rq"
    try:
        await asyncio.to_thread(_claim_run_id, payload)
        if mode == "cloud_tasks":
            receipt = await asyncio.to_thread(
                _enqueue_cloud_task,
                payload,
                retry_suffix=retry_suffix,
            )
        elif mode == "rq":
            receipt = await asyncio.to_thread(_enqueue_rq, payload)
        else:
            raise RenderDispatchUnavailable(
                f"Unsupported RENDER_DISPATCH_MODE: {mode}"
            )
    except RenderDispatchUnavailable:
        raise
    except Exception as exc:
        logger.exception(
            "render_dispatch_failed job_id=%s mode=%s", payload.job_id, mode
        )
        raise RenderDispatchUnavailable("Render dispatch is unavailable.") from exc

    try:
        await asyncio.to_thread(_record_dispatch, payload, receipt)
    except Exception:
        # The task is already durable. Failing the API now could roll back user
        # admission while paid work still runs, so metadata is best-effort here.
        logger.exception(
            "render_dispatch_metadata_failed job_id=%s task=%s",
            payload.job_id,
            receipt.task_name,
        )

    logger.info(
        "render_dispatched job_id=%s mode=%s deduplicated=%s",
        payload.job_id,
        receipt.mode,
        receipt.deduplicated,
    )
    return receipt


def _enqueue_dub_cloud_task(payload: "DubTaskPayload") -> RenderDispatchReceipt:
    from models.dub import DubTaskPayload as _DubTaskPayload

    assert isinstance(payload, _DubTaskPayload)
    config = CloudTasksConfig.from_env()
    base = os.environ.get("CLOUD_TASKS_RENDER_URL", "").rstrip("/")
    dub_url = f"{base}/tasks/dub"
    client = _get_cloud_tasks_client()
    parent = client.queue_path(config.project_id, config.location, config.queue)
    task_name = client.task_path(
        config.project_id,
        config.location,
        config.queue,
        _task_id(f"dub-{payload.job_id}"),
    )
    deadline = duration_pb2.Duration(seconds=config.dispatch_deadline_seconds)
    task = tasks_v2.Task(
        name=task_name,
        http_request=tasks_v2.HttpRequest(
            http_method=tasks_v2.HttpMethod.POST,
            url=dub_url,
            headers={"Content-Type": "application/json"},
            oidc_token=tasks_v2.OidcToken(
                service_account_email=config.service_account_email,
                audience=config.oidc_audience,
            ),
            body=payload.model_dump_json().encode("utf-8"),
        ),
        dispatch_deadline=deadline,
    )
    try:
        created = client.create_task(
            request=tasks_v2.CreateTaskRequest(parent=parent, task=task)
        )
        return RenderDispatchReceipt(
            mode="cloud_tasks",
            task_name=created.name or task_name,
        )
    except AlreadyExists:
        return RenderDispatchReceipt(
            mode="cloud_tasks",
            task_name=task_name,
            deduplicated=True,
        )


async def dispatch_dub_task(payload: "DubTaskPayload") -> RenderDispatchReceipt:
    """Enqueue Dub Video synthesize/align work on the private request renderer."""

    receipt = await asyncio.to_thread(_enqueue_dub_cloud_task, payload)
    logger.info(
        "dub_dispatched job_id=%s mode=%s deduplicated=%s",
        payload.job_id,
        receipt.mode,
        receipt.deduplicated,
    )
    return receipt
