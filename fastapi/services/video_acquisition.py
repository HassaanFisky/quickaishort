"""Tiered video acquisition with Redis metadata caching.

Wraps the existing VideoService.download_segment_sync() with:
- Per-tier hard timeouts (15s each) so no single yt-dlp call blocks forever
- Redis metadata cache (1 hour TTL) so identical video+range combos skip re-download
- Structured per-tier logging so failures are debuggable without reading ffmpeg stderr

Tiers:
  1. yt-dlp + cookies + PoToken sidecar   (most reliable)
  2. yt-dlp + PoToken only (no cookies)   (fallback when cookies expired)
  3. Error with diagnostics               (never hangs, always returns quickly)
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

_TIER_TIMEOUT_S = int(os.getenv("VIDEO_ACQUISITION_TIER_TIMEOUT_S", "15"))
_CACHE_TTL_S = 3600  # 1 hour
_CACHE_KEY_PREFIX = "acquisition:"


def _cache_key(video_id: str, start_sec: float, end_sec: float) -> str:
    raw = f"{video_id}:{start_sec:.2f}:{end_sec:.2f}"
    return _CACHE_KEY_PREFIX + hashlib.sha256(raw.encode()).hexdigest()[:16]


def _read_cache(video_id: str, start_sec: float, end_sec: float) -> Optional[dict]:
    try:
        from services.queue_service import redis_conn

        key = _cache_key(video_id, start_sec, end_sec)
        raw = redis_conn.get(key)
        if raw:
            data = json.loads(raw)
            if (
                data.get("status") == "ready"
                and Path(data.get("video_path", "")).exists()
            ):
                return data
    except Exception:
        pass
    return None


def _write_cache(
    video_id: str,
    start_sec: float,
    end_sec: float,
    result: dict,
) -> None:
    try:
        from services.queue_service import redis_conn

        key = _cache_key(video_id, start_sec, end_sec)
        redis_conn.setex(key, _CACHE_TTL_S, json.dumps(result))
    except Exception:
        pass


def _from_gcs(gcs_uri: str, start_sec: float, end_sec: float, workdir: Path) -> Path:
    """Download a GCS asset directly, bypassing all yt-dlp tiers."""
    import subprocess

    from services.storage_service import get_storage_service

    raw_path = workdir / "gcs_raw.mp4"
    storage = get_storage_service()
    ok = storage.download_gcs_file(gcs_uri, raw_path)
    if not ok or not raw_path.exists():
        raise RuntimeError(f"GCS asset not found or download failed: {gcs_uri}")

    duration = end_sec - start_sec
    trimmed_path = workdir / "source.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(raw_path),
            "-ss",
            str(start_sec),
            "-t",
            str(duration),
            "-c",
            "copy",
            str(trimmed_path),
        ],
        check=True,
        capture_output=True,
    )
    raw_path.unlink(missing_ok=True)
    size_mb = trimmed_path.stat().st_size / 1_048_576
    logger.info("gcs_fast_path uri=%s size=%.1fMB tier=0", gcs_uri, size_mb)
    return trimmed_path


def _try_tier1(video_id: str, start_sec: float, end_sec: float, workdir: Path) -> Path:
    """yt-dlp with cookies + PoToken (full bypass stack)."""
    from services.video_service import VideoService

    return VideoService.download_segment_sync(video_id, start_sec, end_sec, workdir)


def _try_tier2(video_id: str, start_sec: float, end_sec: float, workdir: Path) -> Path:
    """yt-dlp with PoToken only — cookies stripped from opts."""
    import yt_dlp
    from app.utils.youtube_auth import inject_ydl_bypass

    url = f"https://www.youtube.com/watch?v={video_id}"
    out_tmpl = str(workdir / "%(id)s.%(ext)s")

    opts = inject_ydl_bypass(
        {
            "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "outtmpl": out_tmpl,
            "quiet": True,
            "no_warnings": True,
            "download_ranges": yt_dlp.utils.download_range_func(
                None, [(start_sec, end_sec)]
            ),
            "force_keyframes_at_cuts": True,
        }
    )
    # Strip cookies — rely on PoToken sidecar only for this tier
    opts.pop("cookiefile", None)

    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])

    candidates = sorted(workdir.glob(f"{video_id}.*"))
    if not candidates:
        raise RuntimeError("yt-dlp tier-2 produced no output file")
    return candidates[0]


def acquire_video(
    video_id: str,
    start_sec: float,
    end_sec: float,
    workdir: Path,
    *,
    skip_cache: bool = False,
) -> dict[str, Any]:
    """
    Download a video segment with tiered fallback and Redis caching.

    Returns:
        {"status": "ready", "video_path": str, "tier": int, "metadata": {...}}
        {"status": "error", "failed_tiers": [...], "error": str}
    """
    if video_id.startswith("gcs://"):
        t0 = time.time()
        try:
            video_path = _from_gcs(video_id, start_sec, end_sec, workdir)
            return {
                "status": "ready",
                "video_path": str(video_path),
                "tier": 0,
                "metadata": {
                    "gcs_uri": video_id,
                    "start_sec": start_sec,
                    "end_sec": end_sec,
                    "elapsed_s": round(time.time() - t0, 2),
                    "acquired_at": time.time(),
                },
            }
        except Exception as exc:
            return {
                "status": "error",
                "video_id": video_id,
                "failed_tiers": [
                    {
                        "tier": 0,
                        "error": str(exc)[:300],
                        "elapsed_s": round(time.time() - t0, 2),
                    }
                ],
                "error": f"GCS download failed: {exc}",
            }

    if not skip_cache:
        cached = _read_cache(video_id, start_sec, end_sec)
        if cached:
            logger.info(
                "acquisition_cache_hit video_id=%s start=%.2f end=%.2f",
                video_id,
                start_sec,
                end_sec,
            )
            return cached

    failed_tiers: list[dict] = []

    for tier_num, tier_fn in ((1, _try_tier1), (2, _try_tier2)):
        t0 = time.time()
        try:
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(tier_fn, video_id, start_sec, end_sec, workdir)
                try:
                    video_path = future.result(timeout=_TIER_TIMEOUT_S)
                except concurrent.futures.TimeoutError:
                    raise TimeoutError(
                        f"Tier {tier_num} timed out after {_TIER_TIMEOUT_S}s"
                    )

            elapsed = time.time() - t0
            logger.info(
                "acquisition_tier_success tier=%d video_id=%s elapsed=%.2fs",
                tier_num,
                video_id,
                elapsed,
            )
            result: dict[str, Any] = {
                "status": "ready",
                "video_path": str(video_path),
                "tier": tier_num,
                "metadata": {
                    "video_id": video_id,
                    "start_sec": start_sec,
                    "end_sec": end_sec,
                    "elapsed_s": round(elapsed, 2),
                    "acquired_at": time.time(),
                },
            }
            _write_cache(video_id, start_sec, end_sec, result)
            return result

        except Exception as exc:
            elapsed = time.time() - t0
            err_msg = str(exc)[:300]
            logger.warning(
                "acquisition_tier_failed tier=%d video_id=%s elapsed=%.2fs error=%s",
                tier_num,
                video_id,
                elapsed,
                err_msg,
            )
            failed_tiers.append(
                {"tier": tier_num, "error": err_msg, "elapsed_s": round(elapsed, 2)}
            )

    return {
        "status": "error",
        "video_id": video_id,
        "failed_tiers": failed_tiers,
        "error": f"All {len(failed_tiers)} acquisition tiers failed for video {video_id}",
    }
