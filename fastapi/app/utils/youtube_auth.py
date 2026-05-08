import os
import tempfile
import logging

logger = logging.getLogger(__name__)

_COOKIE_FILE_PATH = None

def get_cookie_file() -> str | None:
    global _COOKIE_FILE_PATH
    if _COOKIE_FILE_PATH and os.path.exists(_COOKIE_FILE_PATH):
        return _COOKIE_FILE_PATH

    # Prioritize the secret mount we created via Cloud Run / Secret Manager
    cookies_content = os.environ.get("YOUTUBE_COOKIES")
    if not cookies_content:
        return None

    try:
        # Netscape format files often have \n or \r\n
        fd, path = tempfile.mkstemp(prefix="yt_cookies_", suffix=".txt")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
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
    
    # Use a composite of the most hardened mobile and creator clients
    if "extractor_args" not in new_opts:
        new_opts["extractor_args"] = {}
    
    # Merging instead of overwriting to allow caller specific clients
    existing_yt_args = new_opts["extractor_args"].get("youtube", {})
    existing_clients = existing_yt_args.get("player_client", [])
    
    # Standard hardened list
    hardened_clients = ["web_creator", "mweb", "ios", "android", "android_music", "tv_embedded"]
    
    # Union of both
    unique_clients = list(dict.fromkeys(existing_clients + hardened_clients))
    
    new_opts["extractor_args"]["youtube"] = {
        "player_client": unique_clients,
        "skip": [] # CRITICAL: DASH/HLS are needed for audio-only extractions
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
