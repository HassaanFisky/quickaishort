import atexit
import base64
import logging
import os
import stat
import tempfile

logger = logging.getLogger(__name__)

# Module-level cache: cookie file is written once per process from env var.
_cached_cookie_path: str | None = None
_cookie_path_initialized: bool = False


def _secure_delete(path: str) -> None:
    """Overwrite then delete the cookie file so content is not recoverable."""
    try:
        if os.path.exists(path):
            with open(path, "w") as fh:
                fh.write("DELETED" * 128)
            os.unlink(path)
    except Exception:
        pass


def get_cookie_file() -> str | None:
    """
    Returns path to a temp cookie file populated from YOUTUBE_COOKIES env var.
    YOUTUBE_COOKIES must be base64-encoded Netscape cookie file content.
    File is created once per process, chmod 0o600, and deleted on process exit.
    Returns None when the env var is absent or empty.
    """
    global _cached_cookie_path, _cookie_path_initialized

    if _cookie_path_initialized:
        return _cached_cookie_path

    _cookie_path_initialized = True

    cookies_b64 = os.environ.get("YOUTUBE_COOKIES", "").strip()
    if not cookies_b64:
        return None

    try:
        cookie_content = base64.b64decode(cookies_b64).decode("utf-8")
    except Exception as exc:
        logger.warning("YOUTUBE_COOKIES: base64 decode failed — %s", exc)
        return None

    try:
        fd, path = tempfile.mkstemp(suffix=".txt", prefix="yt_cookies_")
        # Restrict to owner-read/write only before writing sensitive content.
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
        with os.fdopen(fd, "w") as fh:
            fh.write(cookie_content)
        atexit.register(_secure_delete, path)
        _cached_cookie_path = path
        logger.info(
            "YOUTUBE_COOKIES: cookie file ready (%d chars)", len(cookie_content)
        )
        return path
    except Exception as exc:
        logger.warning("YOUTUBE_COOKIES: failed to write cookie file — %s", exc)
        return None


_startup_cookie_checked: bool = False


def _check_cookies_once() -> None:
    """Validate cookies once per process at first yt-dlp call. Non-blocking."""
    global _startup_cookie_checked
    if _startup_cookie_checked:
        return
    _startup_cookie_checked = True
    try:
        from services.cookie_rotator import get_cookie_status
        get_cookie_status()  # result cached; CRITICAL logged if invalid
    except Exception as exc:
        logger.warning("Cookie startup check failed: %s", exc)


def inject_ydl_bypass(opts: dict) -> dict:
    """Injects bot bypass options and cookies into yt-dlp opts."""
    _check_cookies_once()
    new_opts = opts.copy()

    if "extractor_args" not in new_opts:
        new_opts["extractor_args"] = {}

    existing_yt_args = new_opts["extractor_args"].get("youtube", {})
    existing_clients = existing_yt_args.get("player_client", [])

    # tv_embedded and ios first — most reliable in server/CI environments.
    # web added for widest format compatibility.
    hardened_clients = [
        "tv_embedded",
        "ios",
        "android",
        "web",
        "android_music",
        "web_creator",
        "mweb",
    ]

    # Union of caller-supplied clients + hardened defaults, preserving order.
    unique_clients = list(dict.fromkeys(existing_clients + hardened_clients))

    # Do NOT include player_skip — it prevents yt-dlp from fetching page configs
    # needed to decrypt signed CDN URLs, causing upstream 403s.
    new_opts["extractor_args"]["youtube"] = {"player_client": unique_clients}

    new_opts["nocheckcertificate"] = True
    new_opts["no_warnings"] = True

    proxy = os.environ.get("YOUTUBE_PROXY")
    if proxy:
        new_opts["proxy"] = proxy

    cookie_path = get_cookie_file()
    if cookie_path:
        new_opts["cookiefile"] = cookie_path

    return new_opts
