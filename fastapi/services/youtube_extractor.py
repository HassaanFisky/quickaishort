"""Tier-4 YouTube extraction service.

Architecture note (do not change without discussion):
  T1: User upload → GridFS  (PRIMARY — zero legal risk, always available)
  T2: YouTube Data API v3   (metadata only, fully compliant)
  T3: Client-side IFrame    (user-as-actor, ToS-compliant preview)
  T4: Server yt-dlp         (THIS FILE — convenience fallback, circuit-breaker on failure)

Tier-4 is the LAST resort. The circuit breaker in routers/youtube.py gates access.

Legal posture:
  - yt-dlp was reinstated by GitHub under EFF/DMCA 1201(j) defence.
  - Yout v. RIAA (2d Cir.) remains unsettled as of 2026.
  - Mitigation: Decodo residential proxy obscures server origin;
    user-initiated flow frames extraction as a user action.
  - Do NOT expose this service to unauthenticated requests.

PoToken:
  The bgutil-ytdlp-pot-provider package registers itself as a yt-dlp plugin.
  It is auto-discovered when installed — no manual extractor_args needed.
  It communicates with the bgutil Node.js sidecar on localhost:4416.
  start.sh ensures the sidecar starts before gunicorn.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import yt_dlp

logger = logging.getLogger(__name__)


def get_proxy_url() -> str | None:
    """Build Decodo residential proxy URL from environment.

    Set DECODO_USERNAME and DECODO_PASSWORD in Cloud Run env vars.
    Without a proxy, GCP datacenter IPs are blocked by YouTube.
    Returns None when credentials are absent (graceful degradation).
    """
    username = os.environ.get("DECODO_USERNAME", "")
    password = os.environ.get("DECODO_PASSWORD", "")
    endpoint = os.environ.get("DECODO_ENDPOINT", "gate.decodo.com")
    port = os.environ.get("DECODO_PORT", "7000")
    if not username or not password:
        logger.warning("DECODO credentials not set; proxy disabled for YouTube extraction")
        return None
    return f"http://{username}:{password}@{endpoint}:{port}"


def _base_opts(*, skip_download: bool) -> dict[str, Any]:
    """Common yt-dlp options shared by info and download calls."""
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": skip_download,
        "extractor_args": {
            "youtube": {
                # tv_embedded client sidesteps many bot-checks;
                # web is a secondary fallback.
                "player_client": ["tv_embedded", "web"],
            }
        },
        # bgutil-ytdlp-pot-provider is auto-discovered as a yt-dlp plugin
        # and injects PoTokens transparently — no explicit config needed.
        "sleep_interval": 1,
        "max_sleep_interval": 3,
    }
    proxy = get_proxy_url()
    if proxy:
        opts["proxy"] = proxy
    return opts


def get_video_info(video_id: str) -> dict[str, Any]:
    """Fetch YouTube video metadata (title, duration, thumbnail).

    Metadata-only — no download.  Passes through Decodo proxy + bgutil PoToken.

    Args:
        video_id: 11-character YouTube video ID.

    Returns:
        Dict with title, duration (seconds), thumbnail URL, uploader.

    Raises:
        RuntimeError: If yt-dlp extraction fails.
    """
    url = f"https://www.youtube.com/watch?v={video_id}"
    opts = _base_opts(skip_download=True)
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        raise RuntimeError(f"yt-dlp metadata extraction failed: {exc}") from exc

    return {
        "title": info.get("title", "Untitled"),
        "duration": int(info.get("duration") or 0),
        "thumbnail": info.get("thumbnail", ""),
        "uploader": info.get("uploader", ""),
    }


def download_clip(
    video_id: str,
    start_sec: float,
    end_sec: float,
    output_path: str,
    max_height: int = 720,
) -> str:
    """Download a specific time-range clip from YouTube (Tier-4, last resort).

    Args:
        video_id: 11-character YouTube video ID.
        start_sec: Clip start in seconds (inclusive).
        end_sec: Clip end in seconds (exclusive).
        output_path: Destination .mp4 path (caller must ensure parent exists).
        max_height: Max vertical resolution; capped at 720 for bandwidth budget.

    Returns:
        output_path on success.

    Raises:
        ValueError: If clip duration is invalid.
        RuntimeError: If yt-dlp download fails or output file is missing.
    """
    duration = end_sec - start_sec
    if duration <= 0:
        raise ValueError("end_sec must be greater than start_sec")
    if duration > 600:
        raise ValueError("Maximum clip duration is 10 minutes (600 seconds)")

    max_height = min(max_height, 720)
    opts = _base_opts(skip_download=False)
    opts.update(
        {
            "format": (
                f"bestvideo[height<={max_height}][ext=mp4]"
                f"+bestaudio[ext=m4a]"
                f"/best[height<={max_height}][ext=mp4]"
                f"/best[height<={max_height}]"
            ),
            "outtmpl": output_path,
            "merge_output_format": "mp4",
            "download_ranges": yt_dlp.utils.download_range_func(
                [], [(start_sec, end_sec)]
            ),
            "force_keyframes_at_cuts": True,
        }
    )

    url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])
    except Exception as exc:
        raise RuntimeError(f"YouTube clip download failed: {exc}") from exc

    if not os.path.exists(output_path):
        raise RuntimeError("yt-dlp reported success but output file is missing")

    return output_path
