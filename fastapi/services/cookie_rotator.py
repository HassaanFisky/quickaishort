"""YouTube cookie health-check and rotation utilities.

Runs yt-dlp against a known-good public video to verify the current cookies
are still accepted. Results are cached in-process for 1 hour so the hot path
(inject_ydl_bypass) doesn't pay the subprocess cost on every request.
"""

from __future__ import annotations

import logging
import os
import subprocess
import time
from typing import Optional

logger = logging.getLogger(__name__)

# Known public video used as canary — Rick Astley is permanently public.
_CANARY_VIDEO_ID = "dQw4w9WgXcQ"
_CANARY_URL = f"https://www.youtube.com/watch?v={_CANARY_VIDEO_ID}"

_VALIDATION_CACHE_TTL = 3600  # 1 hour

_last_check_time: float = 0.0
_last_check_valid: Optional[bool] = None
_last_check_error: Optional[str] = None


def validate_cookies() -> dict:
    """
    Run yt-dlp against the canary video with current cookies.
    Returns {valid: bool, error: str|None}.
    Does NOT update the in-process cache — callers that want caching use
    get_cookie_status().
    """
    from app.utils.youtube_auth import inject_ydl_bypass

    ydl_opts = inject_ydl_bypass(
        {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "simulate": True,
            "format": "bestaudio/best",
        }
    )

    # Build a yt-dlp CLI command from opts so we don't need yt-dlp as a library here.
    cmd = ["yt-dlp", "--quiet", "--no-warnings", "--simulate", "--skip-download"]

    cookie_path = ydl_opts.get("cookiefile")
    if cookie_path:
        cmd += ["--cookies", cookie_path]

    proxy = ydl_opts.get("proxy")
    if proxy:
        cmd += ["--proxy", proxy]

    cmd.append(_CANARY_URL)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=20,
        )
        if result.returncode == 0:
            return {"valid": True, "error": None}
        stderr = (result.stderr or b"").decode("utf-8", errors="replace")[-500:]
        return {"valid": False, "error": stderr}
    except subprocess.TimeoutExpired:
        return {"valid": False, "error": "yt-dlp validation timed out after 20s"}
    except FileNotFoundError:
        return {"valid": False, "error": "yt-dlp not found in PATH"}
    except Exception as exc:
        return {"valid": False, "error": str(exc)}


def get_cookie_status() -> dict:
    """
    Return cached cookie validity. Re-validates when the cache is stale.
    Safe to call on every request — hits subprocess at most once per hour.
    """
    global _last_check_time, _last_check_valid, _last_check_error

    age = time.time() - _last_check_time
    if _last_check_valid is not None and age < _VALIDATION_CACHE_TTL:
        return {
            "valid": _last_check_valid,
            "last_check": _last_check_time,
            "error": _last_check_error,
            "source": "env_var",
            "cache_age_s": int(age),
        }

    result = validate_cookies()
    _last_check_time = time.time()
    _last_check_valid = result["valid"]
    _last_check_error = result.get("error")

    if not _last_check_valid:
        logger.critical(
            "YOUTUBE_COOKIES invalid — yt-dlp will rely on PoToken sidecar only. "
            "Error: %s",
            _last_check_error,
        )
    else:
        logger.info("YOUTUBE_COOKIES validated successfully via canary video")

    return {
        "valid": _last_check_valid,
        "last_check": _last_check_time,
        "error": _last_check_error,
        "source": "env_var",
        "cache_age_s": 0,
    }


def refresh_cookies_from_env() -> dict:
    """
    Force a fresh validation against the current YOUTUBE_COOKIES env var.
    Useful after a Cloud Run env-var update takes effect on a new instance.
    """
    global _last_check_time
    _last_check_time = 0.0  # invalidate cache
    return get_cookie_status()
