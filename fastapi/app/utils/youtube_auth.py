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


def _parse_proxy_credentials(proxy_url: str) -> tuple[str, str]:
    """Extract (username, password) from a proxy URL. Returns ('', '') on failure."""
    try:
        from urllib.parse import urlparse

        parsed = urlparse(proxy_url)
        return parsed.username or "", parsed.password or ""
    except Exception:
        return "", ""


def _classify_ydl_error(exc: Exception) -> str:
    """Return a short human-readable reason string from a yt-dlp exception."""
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


def inject_ydl_bypass(opts: dict) -> dict:
    """Injects bot bypass options, proxy auth, and cookies into yt-dlp opts.

    The Proxy-Authorization header is force-injected into http_headers so that
    Python's transport layer sends it with the HTTPS CONNECT tunnel request.
    Without this, urllib silently omits inline proxy credentials from the CONNECT
    method, and the proxy server responds with 407 Proxy Authentication Required.
    """
    _check_cookies_once()
    new_opts = opts.copy()

    if "extractor_args" not in new_opts:
        new_opts["extractor_args"] = {}

    existing_yt_args = new_opts["extractor_args"].get("youtube", {})
    existing_clients = existing_yt_args.get("player_client", [])

    # 'web' leads because bgutil-ytdlp-pot-provider only fires for the 'web'
    # client — placing it first maximises PoToken utilisation on datacenter IPs.
    # tv_embedded/ios are fast fallbacks when a healthy residential proxy is
    # available and PoToken is not required.
    # Do NOT include player_skip — it prevents yt-dlp from fetching page configs
    # needed to decrypt signed CDN URLs, causing upstream 403s.
    hardened_clients = [
        "web",
        "tv_embedded",
        "ios",
        "android",
        "web_creator",
        "mweb",
    ]

    # Union of caller-supplied clients + hardened defaults, preserving order.
    unique_clients = list(dict.fromkeys(existing_clients + hardened_clients))
    new_opts["extractor_args"]["youtube"] = {"player_client": unique_clients}

    new_opts["nocheckcertificate"] = True
    new_opts["no_warnings"] = True

    # ── Proxy configuration ────────────────────────────────────────────────────
    proxy_url: str | None = os.environ.get("YOUTUBE_PROXY")
    cred_user: str = ""
    cred_pass: str = ""

    if proxy_url:
        # Parse credentials from the provided URL string.
        cred_user, cred_pass = _parse_proxy_credentials(proxy_url)
    else:
        # Build URL from individual DECODO_* env vars.
        cred_user = os.environ.get("DECODO_USERNAME", "")
        cred_pass = os.environ.get("DECODO_PASSWORD", "")
        if cred_user and cred_pass:
            host = os.environ.get("DECODO_ENDPOINT", "gate.decodo.com")
            port = os.environ.get("DECODO_PORT", "7000")
            proxy_url = f"http://{cred_user}:{cred_pass}@{host}:{port}"

    if proxy_url:
        new_opts["proxy"] = proxy_url

        if cred_user and cred_pass:
            # Explicitly attach credentials to the Proxy-Authorization header.
            # Python's urllib does NOT include inline URL credentials in the
            # initial HTTPS CONNECT tunnel — the proxy drops the connection with
            # 407 before the tunnel is established.  Setting this header directly
            # on the yt-dlp http_headers dict guarantees it is present on every
            # request, including CONNECT.
            raw_token = f"{cred_user}:{cred_pass}"
            b64_token = base64.b64encode(raw_token.encode("utf-8")).decode("ascii")
            new_opts.setdefault("http_headers", {})[
                "Proxy-Authorization"
            ] = f"Basic {b64_token}"
            logger.debug("Proxy-Authorization header injected")
        else:
            logger.warning(
                "Proxy URL set but credentials could not be parsed; "
                "407 errors are likely on HTTPS YouTube endpoints"
            )

    cookie_path = get_cookie_file()
    if cookie_path:
        new_opts["cookiefile"] = cookie_path

    return new_opts
