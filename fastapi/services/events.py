"""Cross-process event bus over Redis pub/sub.

The render worker runs in a separate process from the FastAPI web server, so
they cannot share a motor client. The worker publishes JSON messages on
well-known channels; the web server subscribes and translates them into
async Mongo writes + Pusher/WebSocket fan-out.
"""

import json
import logging
import os
from typing import Any

from redis import Redis

logger = logging.getLogger(__name__)

CHANNEL_EXPORT_PROGRESS = "qais:export:progress"
CHANNEL_EXPORT_COMPLETE = "qais:export:complete"
CHANNEL_EXPORT_FAILED = "qais:export:failed"
CHANNEL_STATS_INCREMENT = "qais:stats:increment"


def get_redis() -> Redis:
    return Redis(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", "6379")),
        password=os.getenv("REDIS_PASSWORD") or None,
        decode_responses=True,
    )


def publish(channel: str, payload: dict[str, Any]) -> None:
    """Fire-and-forget publish from any process. Errors are logged, not raised."""
    try:
        get_redis().publish(channel, json.dumps(payload, default=str))
    except Exception as exc:
        logger.error("Redis publish to %s failed: %s", channel, exc)
