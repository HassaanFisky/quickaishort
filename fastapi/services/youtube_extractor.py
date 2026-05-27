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

import base64
import logging
import os
from typing import Any

import yt_dlp

logger = logging.getLogger(__name__)


def _classify_ydl_error(exc: Exception) -> str:
    """Return a short reason string from a yt-dlp exception for logging/messaging."""
    msg = str(exc).lower()
    if "407" in msg or "proxy authentication" in msg:
        return "proxy_auth_failure"
    if "403" in msg or "bot" in msg or "sign in" in msg or "confirm your age" in msg:
        return "bot_detection"
    if "video unavailable" in msg or "private video" in msg:
        return "video_unavailable"
    if "timed out" in msg or "timeout" in msg:
        return "timeout"
    return "unknown"


def get_proxy_url(session_suffix: str = "") -> str | None:
    """Build Decodo residential proxy URL from environment.

    Set DECODO_USERNAME and DECODO_PASSWORD in Cloud Run env vars.
    Without a proxy, GCP datacenter IPs are blocked by YouTube.
    Returns None when credentials are absent (graceful degradation).

    Args:
        session_suffix: Optional suffix appended to the username for sticky
            session rotation (e.g. "-sessionduration-60").
    """
    username = os.environ.get("DECODO_USERNAME", "")
    password = os.environ.get("DECODO_PASSWORD", "")
    endpoint = os.environ.get("DECODO_ENDPOINT", "gate.decodo.com")
    port = os.environ.get("DECODO_PORT", "7000")
    if not username or not password:
        logger.warning(
            "DECODO credentials not set; proxy disabled for YouTube extraction"
        )
        return None
    return f"http://{username}{session_suffix}:{password}@{endpoint}:{port}"


def _base_opts(*, skip_download: bool, session_suffix: str = "") -> dict[str, Any]:
    """Common yt-dlp options shared by info and download calls."""
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "nocheckcertificate": True,
        "skip_download": skip_download,
        "extractor_args": {
            "youtube": {
                # 'web' first: bgutil-ytdlp-pot-provider fires for 'web' only.
                # tv_embedded/ios are fast fallbacks on healthy residential IPs.
                "player_client": ["web", "tv_embedded", "ios"],
            }
        },
        # bgutil-ytdlp-pot-provider is auto-discovered as a yt-dlp plugin
        # and injects PoTokens transparently for the 'web' client.
        "sleep_interval": 1,
        "max_sleep_interval": 3,
    }
    proxy = get_proxy_url(session_suffix=session_suffix)
    if proxy:
        opts["proxy"] = proxy
        # Explicitly inject Proxy-Authorization so Python's transport layer
        # sends credentials with the HTTPS CONNECT tunnel request.
        # urllib omits inline URL credentials from CONNECT by default, causing
        # 407 Proxy Authentication Required on every HTTPS YouTube request.
        username = os.environ.get("DECODO_USERNAME", "")
        password = os.environ.get("DECODO_PASSWORD", "")
        if username and password:
            raw = f"{username}{session_suffix}:{password}"
            b64 = base64.b64encode(raw.encode("utf-8")).decode("ascii")
            opts.setdefault("http_headers", {})["Proxy-Authorization"] = f"Basic {b64}"
            logger.debug(
                "Proxy-Authorization injected for session_suffix=%r", session_suffix
            )
        else:
            logger.warning(
                "Proxy URL set but DECODO_USERNAME/PASSWORD absent; "
                "407 errors likely on HTTPS endpoints"
            )
    return opts


def get_video_info(video_id: str) -> dict[str, Any]:
    """Fetch YouTube video metadata (title, duration, thumbnail).

    Metadata-only — no download.  Passes through Decodo proxy + bgutil PoToken.
    Retries once with a different sticky session ID on failure.

    Args:
        video_id: 11-character YouTube video ID.

    Returns:
        Dict with title, duration (seconds), thumbnail URL, uploader.

    Raises:
        RuntimeError: If yt-dlp extraction fails after retry.
    """
    url = f"https://www.youtube.com/watch?v={video_id}"
    # First attempt uses the default session; second rotates to a new sticky session.
    attempts = [("", "attempt 1"), ("-sessionduration-60", "retry with sticky session")]
    last_exc: Exception | None = None

    for session_suffix, label in attempts:
        opts = _base_opts(skip_download=True, session_suffix=session_suffix)
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
            return {
                "title": info.get("title", "Untitled"),
                "duration": int(info.get("duration") or 0),
                "thumbnail": info.get("thumbnail", ""),
                "uploader": info.get("uploader", ""),
            }
        except Exception as exc:
            reason = _classify_ydl_error(exc)
            logger.warning(
                "yt-dlp metadata %s failed for %s [%s]: %s",
                label, video_id, reason, exc,
            )
            last_exc = exc
            if reason == "video_unavailable":
                # No point retrying — video is gone or private.
                break

    raise RuntimeError(
        f"yt-dlp metadata extraction failed [{_classify_ydl_error(last_exc)}]: {last_exc}"
    ) from last_exc


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
        reason = _classify_ydl_error(exc)
        logger.error(
            "yt-dlp clip download failed for %s [%s]: %s", video_id, reason, exc
        )
        raise RuntimeError(
            f"YouTube clip download failed [{reason}]: {exc}"
        ) from exc

    if not os.path.exists(output_path):
        raise RuntimeError(
            f"yt-dlp reported success but output file is missing: {output_path}"
        )

    return output_path
