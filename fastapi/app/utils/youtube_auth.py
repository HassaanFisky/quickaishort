import os
import tempfile
import logging

logger = logging.getLogger(__name__)

_COOKIE_FILE_PATH = None

def get_cookie_file() -> str | None:
    global _COOKIE_FILE_PATH
    if _COOKIE_FILE_PATH and os.path.exists(_COOKIE_FILE_PATH):
        return _COOKIE_FILE_PATH

    cookies_content = os.environ.get("YOUTUBE_COOKIES")
    if not cookies_content:
        return None

    try:
        fd, path = tempfile.mkstemp(prefix="yt_cookies_", suffix=".txt")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            # Handle potential escaped newlines if passed directly in Vercel/Cloud Run
            f.write(cookies_content.replace("\\n", "\n"))
        _COOKIE_FILE_PATH = path
        logger.info(f"Loaded YouTube cookies to {path}")
        return path
    except Exception as e:
        logger.error(f"Failed to write YouTube cookies to temp file: {e}")
        return None

def inject_ydl_bypass(opts: dict) -> dict:
    """Injects bot bypass options and cookies into yt-dlp opts."""
    new_opts = opts.copy()
    
    # ios client is currently the most resilient against "Sign in" errors
    # android is a fallback for legacy support
    new_opts["extractor_args"] = {
        "youtube": {
            "player_client": ["ios", "android"],
            "skip": ["dash", "hls"]
        }
    }
    new_opts["nocheckcertificate"] = True
    new_opts["no_warnings"] = True
    
    # Support for proxy rotation if provided in environment
    proxy = os.environ.get("YOUTUBE_PROXY")
    if proxy:
        new_opts["proxy"] = proxy
    
    cookie_path = get_cookie_file()
    if cookie_path:
        new_opts["cookiefile"] = cookie_path
        
    return new_opts
