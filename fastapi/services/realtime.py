"""Realtime fan-out: Pusher (production) + native WebSocket (fallback/dev).

Both transports receive the same payload. The frontend chooses whichever is
available — see src/hooks/useDashboardStats.ts.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from collections import defaultdict
from typing import Any, Optional

from fastapi import WebSocket

logger = logging.getLogger(__name__)

_pusher_client = None


def _init_pusher():
    global _pusher_client
    if _pusher_client is not None:
        return _pusher_client
    app_id = os.getenv("PUSHER_APP_ID")
    key = os.getenv("PUSHER_KEY")
    secret = os.getenv("PUSHER_SECRET")
    cluster = os.getenv("PUSHER_CLUSTER", "mt1")
    if not (app_id and key and secret):
        return None
    try:
        import pusher
        _pusher_client = pusher.Pusher(
            app_id=app_id,
            key=key,
            secret=secret,
            cluster=cluster,
            ssl=True,
        )
        return _pusher_client
    except Exception as exc:
        logger.error("Pusher init failed: %s", exc)
        return None


class WSConnectionManager:
    """Tracks active WebSocket subscribers per user_id."""

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections[user_id].add(ws)

    async def disconnect(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._connections[user_id].discard(ws)
            if not self._connections[user_id]:
                self._connections.pop(user_id, None)

    async def broadcast(self, user_id: str, event: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            sockets = list(self._connections.get(user_id, ()))
        if not sockets:
            return
        message = json.dumps({"event": event, "payload": payload}, default=str)
        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                bucket = self._connections.get(user_id)
                if bucket is not None:
                    for ws in dead:
                        bucket.discard(ws)
                    if not bucket:
                        self._connections.pop(user_id, None)


ws_manager = WSConnectionManager()


def _serializable(payload: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(payload, default=str))


async def emit_stats_updated(user_id: str, stats: dict[str, Any]) -> None:
    """Dual-publish a stats-updated event to Pusher AND native WS subscribers."""
    payload = _serializable(stats)
    client = _init_pusher()
    if client is not None:
        try:
            await asyncio.to_thread(
                client.trigger,
                f"user-dashboard-{user_id}",
                "stats-updated",
                payload,
            )
        except Exception as exc:
            logger.error("Pusher trigger failed for %s: %s", user_id, exc)
    await ws_manager.broadcast(user_id, "stats-updated", payload)


async def emit_export_event(
    user_id: str,
    job_id: str,
    event: str,
    payload: dict[str, Any],
) -> None:
    """Dual-publish a per-job export event (progress/complete/failed)."""
    payload = _serializable({**payload, "job_id": job_id})
    client = _init_pusher()
    if client is not None:
        try:
            await asyncio.to_thread(
                client.trigger,
                f"export-{job_id}",
                event,
                payload,
            )
        except Exception as exc:
            logger.error("Pusher trigger failed for export %s: %s", job_id, exc)
    await ws_manager.broadcast(user_id, f"export:{event}", payload)
