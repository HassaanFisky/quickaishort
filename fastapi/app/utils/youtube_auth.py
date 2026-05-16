import os
import tempfile
import logging

logger = logging.getLogger(__name__)

_COOKIE_FILE_PATH = None

def get_cookie_file():
    import tempfile, os
    cookies = os.environ.get("YOUTUBE_COOKIES", "")
    if not cookies:
        return None
    try:
        f = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
        f.write(cookies)
        f.close()
        return f.name
    except Exception:
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
        "player_skip": ["webpage", "configs"],
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
