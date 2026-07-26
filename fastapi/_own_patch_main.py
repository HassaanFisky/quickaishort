"""Ownership-pass batch patches for main.py — delete after use."""
from __future__ import annotations

from pathlib import Path

p = Path(__file__).with_name("main.py")
text = p.read_text(encoding="utf-8")
crlf = "\r\n" in text


def nl(s: str) -> str:
    return s.replace("\n", "\r\n") if crlf else s


def sub(old: str, new: str, label: str) -> None:
    global text
    for o, n in ((nl(old), nl(new)), (old, new)):
        if o in text:
            text = text.replace(o, n, 1)
            print(f"{label}: OK")
            return
    print(f"{label}: FAIL")


# 1) SlowAPIMiddleware — must register for @limiter to enforce
sub(
    """limiter = Limiter(key_func=get_real_ip, default_limits=["200/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
""",
    """limiter = Limiter(key_func=get_real_ip, default_limits=["200/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
try:
    from slowapi.middleware import SlowAPIMiddleware

    app.add_middleware(SlowAPIMiddleware)
except Exception:  # pragma: no cover — package always present in prod image
    import logging as _log

    _log.getLogger(__name__).error("SlowAPIMiddleware unavailable — rate limits inert")
""",
    "slowapi_middleware",
)

# 2) Honest /health/ready
sub(
    """@app.get("/health/ready")
async def readiness():
    # Relaxed DB check: remain ready even if DB is transiently offline
    return {"status": "ready"}
""",
    """@app.get("/health/ready")
async def readiness():
    \"\"\"Cloud Run may probe this path — require Redis so we never false-green.\"\"\"
    try:
        redis_conn.ping()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={"status": "not_ready", "dependency": "redis"},
        ) from exc
    return {"status": "ready", "redis": True}
""",
    "health_ready",
)

# 3) Stream download without buffering whole object
sub(
    """        # Reload to get size metadata for Content-Length header.
        await asyncio.to_thread(blob.reload)
        file_size = blob.size or 0

        data = await asyncio.to_thread(blob.download_as_bytes)

        async def stream_gcs():
            chunk_size = 256 * 1024
            for i in range(0, len(data), chunk_size):
                yield data[i : i + chunk_size]

        return StreamingResponse(
            stream_gcs(),
            media_type="video/mp4",
            headers={
                "Content-Disposition": f'attachment; filename="{job_id}.mp4"',
                "Content-Length": str(file_size),
            },
        )
""",
    """        # Reload to get size metadata for Content-Length header.
        await asyncio.to_thread(blob.reload)
        file_size = blob.size or 0

        # Prefer true generator via to_thread per-chunk would be chatty; use
        # sync iterator wrapped so memory stays bounded to one chunk at a time.
        def stream_gcs_sync():
            with blob.open("rb") as handle:
                while True:
                    chunk = handle.read(256 * 1024)
                    if not chunk:
                        break
                    yield chunk

        return StreamingResponse(
            stream_gcs_sync(),
            media_type="video/mp4",
            headers={
                "Content-Disposition": f'attachment; filename="{job_id}.mp4"',
                "Content-Length": str(file_size),
            },
        )
""",
    "download_stream",
)

# 4) Rate-limit legacy /api/proxy
sub(
    """@app.get("/api/proxy")
async def proxy_video(url: str):
""",
    """@limiter.limit("20/minute")
@app.get("/api/proxy")
async def proxy_video(request: Request, url: str):
""",
    "proxy_limit",
)

tmp = p.with_suffix(".py.ownpass")
tmp.write_text(text, encoding="utf-8", newline="")
tmp.replace(p)
print("WROTE", p)
