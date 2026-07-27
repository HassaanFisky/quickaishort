"""Private request-bound Cloud Run renderer invoked only by Cloud Tasks."""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Header, HTTPException

from services.render_dispatch import RenderTaskPayload, mark_render_terminal

logger = logging.getLogger(__name__)

_MAX_ATTEMPTS = int(os.environ.get("CLOUD_TASKS_MAX_ATTEMPTS", "3"))
_clients_initialized = False
_init_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Listen immediately; initialize heavy GCP clients on the first paid request."""

    yield

    if _clients_initialized:
        from services.db import close_db

        await close_db()


app = FastAPI(
    title="QuickAI Request-Bound Renderer",
    version="1.0.0",
    lifespan=lifespan,
)


async def _ensure_clients() -> None:
    global _clients_initialized
    if _clients_initialized:
        return
    async with _init_lock:
        if _clients_initialized:
            return
        from services.db import init_db_sync, is_ready

        await asyncio.to_thread(init_db_sync)
        if not is_ready():
            raise RuntimeError("Renderer storage clients failed to initialize.")
        _clients_initialized = True
        logger.info("request_renderer_clients_initialized")


def _attempt_number(retry_count: str | None) -> int:
    try:
        return max(1, int(retry_count or "0") + 1)
    except (TypeError, ValueError):
        return 1


async def _execute_render(
    payload: RenderTaskPayload,
    *,
    attempt_number: int,
) -> dict:
    from render_worker import _async_process_render_task

    return await _async_process_render_task(
        payload.job_id,
        payload.video_id,
        payload.start_sec,
        payload.end_sec,
        payload.user_id,
        payload.options,
        payload.run_id,
        attempt_number=attempt_number,
    )


async def _record_failed_attempt(
    payload: RenderTaskPayload,
    error: Exception,
    *,
    attempt_number: int,
) -> None:
    """Cover failures raised before the render engine's internal DLQ guard."""

    from services.render_queue import get_render_status, push_result

    status = await asyncio.to_thread(get_render_status, payload.job_id)
    current_status = status.get("status")
    try:
        current_attempt = int(status.get("attempt", "0") or 0)
    except (TypeError, ValueError):
        current_attempt = 0
    if current_status == "dead":
        return
    if current_status == "retry_pending" and current_attempt >= attempt_number:
        return

    await asyncio.to_thread(
        push_result,
        payload.job_id,
        payload.user_id,
        "failed",
        error=str(error),
        attempt=attempt_number,
    )
    if attempt_number < _MAX_ATTEMPTS:
        return

    from services.events import CHANNEL_EXPORT_FAILED, publish
    from services.job_persistence import persist_failed_job

    await asyncio.to_thread(
        publish,
        CHANNEL_EXPORT_FAILED,
        {
            "job_id": payload.job_id,
            "user_id": payload.user_id,
            "error": str(error),
        },
    )
    await persist_failed_job(
        payload.job_id,
        payload.user_id,
        str(error),
        payload.model_dump(mode="json"),
    )


@app.get("/")
@app.get("/health")
@app.get("/health/live")
async def health_live() -> dict[str, object]:
    return {
        "status": "alive",
        "service": "quickai-request-renderer",
        "request_bound": True,
    }


@app.get("/health/ready")
async def health_ready() -> dict[str, object]:
    try:
        from services.queue_service import redis_conn

        await asyncio.to_thread(redis_conn.ping)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={"status": "not_ready", "dependency": "redis"},
        ) from exc
    return {
        "status": "ready",
        "service": "quickai-request-renderer",
        "redis": True,
        "dispatch": "cloud_tasks",
    }


@app.post("/tasks/render")
async def handle_render_task(
    payload: RenderTaskPayload,
    task_name: str | None = Header(default=None, alias="X-CloudTasks-TaskName"),
    retry_count: str | None = Header(default=None, alias="X-CloudTasks-TaskRetryCount"),
) -> dict[str, object]:
    """Acknowledge only completed/terminal work; 5xx triggers bounded retry."""

    if os.environ.get("ENVIRONMENT", "").lower() == "production" and not task_name:
        raise HTTPException(status_code=403, detail="Cloud Tasks request required.")

    attempt = _attempt_number(retry_count)
    try:
        await _ensure_clients()
        result = await _execute_render(payload, attempt_number=attempt)
    except Exception as exc:
        try:
            await _record_failed_attempt(
                payload,
                exc,
                attempt_number=attempt,
            )
        except Exception:
            logger.exception(
                "request_render_failure_status_failed job_id=%s attempt=%d",
                payload.job_id,
                attempt,
            )
        if attempt >= _MAX_ATTEMPTS:
            try:
                await asyncio.to_thread(mark_render_terminal, payload.job_id)
            except Exception:
                logger.exception(
                    "render_pending_cleanup_failed job_id=%s", payload.job_id
                )
        logger.exception(
            "request_render_attempt_failed job_id=%s attempt=%d task=%s",
            payload.job_id,
            attempt,
            task_name or "local",
        )
        # Never return internal details. Any non-2xx response is retried by the
        # queue according to its bounded retry policy.
        raise HTTPException(
            status_code=500,
            detail={"status": "retryable_failure", "attempt": attempt},
        ) from exc

    try:
        await asyncio.to_thread(mark_render_terminal, payload.job_id)
    except Exception:
        logger.exception("render_pending_cleanup_failed job_id=%s", payload.job_id)

    return {
        "status": "acknowledged",
        "job_id": payload.job_id,
        "result_status": result.get("status", "success"),
        "attempt": attempt,
    }


@app.post("/tasks/dub")
async def handle_dub_task(
    payload: dict,
    task_name: str | None = Header(default=None, alias="X-CloudTasks-TaskName"),
    retry_count: str | None = Header(default=None, alias="X-CloudTasks-TaskRetryCount"),
) -> dict[str, object]:
    """Process Dub Video synthesize/align stages (Cloud Tasks → private worker)."""

    if os.environ.get("ENVIRONMENT", "").lower() == "production" and not task_name:
        raise HTTPException(status_code=403, detail="Cloud Tasks request required.")

    from models.dub import DubTaskPayload
    from services.dub_service import process_dub_job

    attempt = _attempt_number(retry_count)
    try:
        body = DubTaskPayload.model_validate(payload)
        await _ensure_clients()
        result = await process_dub_job(body.job_id)
    except Exception as exc:
        logger.exception(
            "request_dub_attempt_failed attempt=%d task=%s",
            attempt,
            task_name or "local",
        )
        raise HTTPException(
            status_code=500,
            detail={"status": "retryable_failure", "attempt": attempt},
        ) from exc

    return {
        "status": "acknowledged",
        "job_id": body.job_id,
        "result_status": result.status,
        "attempt": attempt,
    }
