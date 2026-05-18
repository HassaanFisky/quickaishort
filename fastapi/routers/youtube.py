"""YouTube ingestion router — Tier-4 (server-side, last resort).

UX contract:
  - /info   → metadata only, fast, always try this first
  - /clip   → yt-dlp download, slow, circuit-breaker gated

Circuit breaker (Redis-backed):
  5 consecutive failures within 30 min → disable for 30 min.
  Key 'yt_failures' (int, TTL 1800s) counts failures.
  Key 'yt_disabled' (1, TTL 1800s) blocks the endpoint when tripped.

Storage:
  Extracted clips are uploaded to MongoDB GridFS (bucket=exports)
  via the existing StorageService, matching the render pipeline.
  Returned gridfs:// URI is compatible with render_service.render_video().
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from services.auth import get_verified_user_id
from services.queue_service import async_redis_conn
from services.storage_service import get_storage_service
from services.youtube_extractor import download_clip, get_video_info

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/youtube", tags=["youtube"])

# ─── Circuit-breaker constants ────────────────────────────────────────────────
_FAILURE_KEY = "yt_failures"
_DISABLED_KEY = "yt_disabled"
_FAILURE_WINDOW = 1800  # 30 min TTL for failure counter
_DISABLE_WINDOW = 1800  # 30 min disable window after threshold hit
_FAILURE_THRESHOLD = 5  # failures before tripping the breaker


# ─── Request models ───────────────────────────────────────────────────────────
class InfoRequest(BaseModel):
    video_id: str

    @field_validator("video_id")
    @classmethod
    def must_be_11_chars(cls, v: str) -> str:
        v = v.strip()
        if len(v) != 11:
            raise ValueError("video_id must be exactly 11 characters")
        return v


class ClipRequest(BaseModel):
    video_id: str
    start_sec: float
    end_sec: float

    @field_validator("video_id")
    @classmethod
    def must_be_11_chars(cls, v: str) -> str:
        v = v.strip()
        if len(v) != 11:
            raise ValueError("video_id must be exactly 11 characters")
        return v


# ─── Endpoints ────────────────────────────────────────────────────────────────
@router.post("/info")
async def video_info(
    req: InfoRequest,
    verified_user_id: str = Depends(get_verified_user_id),
) -> dict:
    """Return YouTube video metadata (title, duration, thumbnail).

    ToS posture: metadata only, no download.
    Backed by yt-dlp + bgutil PoToken + Decodo residential proxy.
    Falls back gracefully if extraction fails — caller should display
    the error and prompt the user to upload their MP4 directly.
    """
    try:
        data = get_video_info(req.video_id)
        return {"success": True, "data": data}
    except Exception as exc:
        logger.warning(
            "youtube_info_failed video_id=%s user=%s: %s",
            req.video_id,
            verified_user_id,
            exc,
        )
        raise HTTPException(
            status_code=500,
            detail="Could not fetch video info. If this persists, upload your MP4 directly.",
        )


@router.post("/clip")
async def create_clip(
    req: ClipRequest,
    verified_user_id: str = Depends(get_verified_user_id),
) -> dict:
    """Extract a time-range clip from YouTube and store it in GridFS.

    Tier-4 — use sparingly. The circuit breaker disables this endpoint
    for 30 minutes after 5 consecutive failures (YouTube IP-block detection).

    On success returns:
        { "success": true, "gridfs_uri": "gridfs://exports/.../clip.mp4", "duration_sec": N }

    The gridfs_uri is directly usable by render_service.render_video() as a clip_path.
    """
    # ── Circuit breaker check ──
    if await async_redis_conn.get(_DISABLED_KEY):
        raise HTTPException(
            status_code=503,
            detail=(
                "YouTube import is temporarily unavailable (rate-limit protection). "
                "Upload your MP4 directly for instant processing."
            ),
        )

    duration = req.end_sec - req.start_sec
    if duration <= 0:
        raise HTTPException(
            status_code=400, detail="end_sec must be greater than start_sec"
        )
    if duration > 600:
        raise HTTPException(
            status_code=400, detail="Maximum clip length is 10 minutes (600 seconds)"
        )

    tmp_path: str | None = None
    try:
        # Download to a temporary file
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp_path = tmp.name

        logger.info(
            "youtube_clip_start video_id=%s user=%s start=%.1f end=%.1f",
            req.video_id,
            verified_user_id,
            req.start_sec,
            req.end_sec,
        )
        download_clip(req.video_id, req.start_sec, req.end_sec, tmp_path)

        # Upload to GridFS (exports bucket) — same path as render pipeline
        remote_path = f"clips/{verified_user_id}/{req.video_id}_{int(req.start_sec)}_{int(req.end_sec)}.mp4"
        storage = get_storage_service()
        await storage.upload_file_async(
            local_path=Path(tmp_path),
            remote_path=remote_path,
            content_type="video/mp4",
        )
        gridfs_uri = f"gridfs://{remote_path}"

        # Reset failure counter on success
        await async_redis_conn.delete(_FAILURE_KEY)

        logger.info(
            "youtube_clip_success user=%s gridfs=%s", verified_user_id, gridfs_uri
        )
        return {
            "success": True,
            "gridfs_uri": gridfs_uri,
            "duration_sec": round(duration, 2),
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "youtube_clip_failed video_id=%s user=%s: %s",
            req.video_id,
            verified_user_id,
            exc,
        )

        # Increment failure counter and trip circuit breaker if threshold reached
        failures = await async_redis_conn.incr(_FAILURE_KEY)
        await async_redis_conn.expire(_FAILURE_KEY, _FAILURE_WINDOW)
        if failures >= _FAILURE_THRESHOLD:
            await async_redis_conn.setex(_DISABLED_KEY, _DISABLE_WINDOW, "1")
            logger.warning("youtube_circuit_breaker_tripped failures=%d", failures)

        raise HTTPException(
            status_code=500,
            detail=f"YouTube clip extraction failed. Upload your MP4 directly for instant processing. ({exc})",
        )

    finally:
        # Always clean up temp file
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
