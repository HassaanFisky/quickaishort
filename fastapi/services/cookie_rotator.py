"""YouTube cookie health-check and rotation utilities.

Runs yt-dlp against a known-good public video to verify the current cookies
are still accepted. Results are cached in-process for 1 hour so the hot path
(inject_ydl_bypass) doesn't pay the subprocess cost on every request.

Honest degrade: when cookies are missing or expired, callers should fall
through to PoToken-only / Cobalt — never claim CAPTCHA bypass capability.
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
_VALIDATION_TIMEOUT_S = int(os.getenv("YOUTUBE_COOKIE_VALIDATE_TIMEOUT_S", "20"))

_last_check_time: float = 0.0
_last_check_valid: Optional[bool] = None
_last_check_error: Optional[str] = None


def cookies_configured() -> bool:
    """True when YOUTUBE_COOKIES (inline or file path) is present in the env."""
    raw = (os.getenv("YOUTUBE_COOKIES") or "").strip()
    cookie_file = (os.getenv("YOUTUBE_COOKIE_FILE") or "").strip()
    return bool(raw or cookie_file)


def invalidate_cookie_cache(reason: str = "") -> None:
    """Force the next get_cookie_status() call to re-validate (e.g. after 403)."""
    global _last_check_time, _last_check_valid, _last_check_error
    _last_check_time = 0.0
    _last_check_valid = None
    _last_check_error = reason or None
    if reason:
        logger.warning("youtube_cookie_cache_invalidated reason=%s", reason[:200])


def _classify_cookie_error(stderr: str) -> str:
    low = (stderr or "").lower()
    if "sign in" in low or "cookies are no longer valid" in low or "login required" in low:
        return (
            "YouTube cookies expired or rejected. Update YOUTUBE_COOKIES on Cloud Run; "
            "acquisition will degrade to PoToken-only until refreshed."
        )
    if "403" in low or "429" in low:
        return (
            "YouTube rate-limited or blocked this cookie session (403/429). "
            "Retry later or rotate cookies; PoToken fallback may still work."
        )
    if "bot" in low or "confirm you're not a bot" in low:
        return (
            "YouTube bot-check triggered. Cookie refresh required — "
            "no CAPTCHA solver is integrated; fail honestly."
        )
    if not stderr:
        return "Cookie validation failed with no detail from yt-dlp."
    return stderr[-400:]


def validate_cookies() -> dict:
    """
    Run yt-dlp against the canary video with current cookies.
    Returns {valid: bool, error: str|None, cookies_configured: bool}.
    Does NOT update the in-process cache — callers that want caching use
    get_cookie_status().
    """
    configured = cookies_configured()
    if not configured:
        return {
            "valid": False,
            "error": "YOUTUBE_COOKIES not configured — PoToken-only / Cobalt degrade path.",
            "cookies_configured": False,
        }

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
            timeout=_VALIDATION_TIMEOUT_S,
        )
        if result.returncode == 0:
            return {"valid": True, "error": None, "cookies_configured": True}
        stderr = (result.stderr or b"").decode("utf-8", errors="replace")[-500:]
        return {
            "valid": False,
            "error": _classify_cookie_error(stderr),
            "cookies_configured": True,
        }
    except subprocess.TimeoutExpired:
        return {
            "valid": False,
            "error": f"yt-dlp validation timed out after {_VALIDATION_TIMEOUT_S}s",
            "cookies_configured": True,
        }
    except FileNotFoundError:
        return {
            "valid": False,
            "error": "yt-dlp not found in PATH",
            "cookies_configured": True,
        }
    except Exception as exc:
        return {
            "valid": False,
            "error": str(exc),
            "cookies_configured": True,
        }


def get_cookie_status() -> dict:
    """
    Return cached cookie validity. Re-validates when the cache is stale.
    Safe to call on every request — hits subprocess at most once per hour.
    """
    global _last_check_time, _last_check_valid, _last_check_error

    configured = cookies_configured()
    age = time.time() - _last_check_time
    if _last_check_valid is not None and age < _VALIDATION_CACHE_TTL:
        return {
            "valid": _last_check_valid,
            "last_check": _last_check_time,
            "error": _last_check_error,
            "source": "env_var",
            "cache_age_s": int(age),
            "cookies_configured": configured,
            "degraded": not _last_check_valid,
            "hint": (
                None
                if _last_check_valid
                else "Cookies invalid/missing — acquisition uses PoToken-only fallback. No CAPTCHA solver."
            ),
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
        "cookies_configured": configured,
        "degraded": not _last_check_valid,
        "hint": (
            None
            if _last_check_valid
            else "Cookies invalid/missing — acquisition uses PoToken-only fallback. No CAPTCHA solver."
        ),
    }


def refresh_cookies_from_env() -> dict:
    """
    Force a fresh validation against the current YOUTUBE_COOKIES env var.
    Useful after a Cloud Run env-var update takes effect on a new instance.
    """
    invalidate_cookie_cache("refresh_from_env")
    return get_cookie_status()
