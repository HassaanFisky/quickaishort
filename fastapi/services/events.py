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


_redis_pub: Any = None


def get_redis() -> Redis:
    global _redis_pub
    if _redis_pub is None:
        # Use REDIS_URL (same as queue_service.py) so worker and web server
        # always talk to the same Redis instance regardless of how it's hosted.
        _redis_pub = Redis.from_url(
            os.environ.get("REDIS_URL", "redis://localhost:6379"),
            decode_responses=True,
            socket_timeout=5,
            retry_on_timeout=True,
        )
    return _redis_pub


def publish(channel: str, payload: dict[str, Any]) -> None:
    """Fire-and-forget publish from any process. Errors are logged, not raised."""
    try:
        get_redis().publish(channel, json.dumps(payload, default=str))
    except Exception as exc:
        logger.error("Redis publish to %s failed: %s", channel, exc)
