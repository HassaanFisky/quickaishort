"""Redis + RQ singleton.

Default job timeout is 10 minutes (renders may take a while on cold yt-dlp
fetches). Failure retry is configured per-enqueue in main.py.
"""

import os
import redis
from rq import Queue

JOB_TIMEOUT_SECONDS = int(os.getenv("RENDER_JOB_TIMEOUT", "600"))
JOB_RESULT_TTL_SECONDS = int(os.getenv("RENDER_JOB_RESULT_TTL", "3600"))
JOB_FAILURE_TTL_SECONDS = int(os.getenv("RENDER_JOB_FAILURE_TTL", "86400"))

redis_conn = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"), decode_responses=True)
render_queue = Queue(
    "render_queue",
    connection=redis_conn,
    default_timeout=JOB_TIMEOUT_SECONDS,
)
