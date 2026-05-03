import os
import logging
import requests
from typing import Optional

import yt_dlp
from app.storage.gcs_repo import gcs_repo
from app.utils.youtube_auth import inject_ydl_bypass

logger = logging.getLogger(__name__)

_COBALT_API = "https://api.cobalt.tools/"


def _cobalt_get_stream_url(youtube_url: str, audio_only: bool = False) -> str:
    """
    Use Cobalt API v10 to get a direct stream URL for a YouTube video.
    Raises RuntimeError if Cobalt cannot resolve the URL.
    """
    payload = {
        "url": youtube_url,
        "downloadMode": "audio" if audio_only else "auto",
        "videoQuality": "1080",
    }
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    resp = requests.post(_COBALT_API, json=payload, headers=headers, timeout=20)
    resp.raise_for_status()
    data = resp.json()

    status = data.get("status")
    stream_url = data.get("url")

    if status in ("tunnel", "redirect") and stream_url:
        return stream_url

    raise RuntimeError(f"Cobalt API returned unexpected status: {status} — data: {data}")


def download_youtube_audio(url: str, job_id: str, uid: str) -> Optional[str]:
    """
    Downloads audio from a YouTube URL and uploads it to GCS.
    Primary: yt-dlp with android/ios bypass.
    Fallback: Cobalt API v10.
    Returns the GCS URI on success, None on total failure.
    """
    local_path = f"/tmp/{job_id}_yt_audio.mp3"

    try:
        # --- Primary: yt-dlp ---
        ydl_opts = inject_ydl_bypass({
            "format": "bestaudio/best",
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
            "outtmpl": f"/tmp/{job_id}_yt_audio.%(ext)s",
            "quiet": True,
            "no_warnings": True,
        })

        try:
            logger.info(f"[downloader] yt-dlp downloading audio: {url}")
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            if not os.path.exists(local_path):
                raise FileNotFoundError(f"yt-dlp output not found at {local_path}")

        except Exception as ydl_err:
            logger.warning(f"[downloader] yt-dlp failed ({ydl_err}), trying Cobalt fallback...")

            stream_url = _cobalt_get_stream_url(url, audio_only=True)
            logger.info(f"[downloader] Cobalt stream URL obtained, downloading...")

            with requests.get(stream_url, stream=True, timeout=60) as r:
                r.raise_for_status()
                with open(local_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)

            if not os.path.exists(local_path) or os.path.getsize(local_path) == 0:
                raise RuntimeError("Cobalt download produced an empty file")

            logger.info(f"[downloader] Cobalt fallback succeeded.")

        # --- Upload to GCS ---
        destination_blob = f"raw_inputs/{uid}/{job_id}/youtube_audio.mp3"
        gcs_uri = gcs_repo.upload_file(destination_blob, local_path)
        logger.info(f"[downloader] Uploaded to GCS: {gcs_uri}")
        return gcs_uri

    except Exception as e:
        logger.error(f"[downloader] All download methods failed: {e}")
        return None
    finally:
        if os.path.exists(local_path):
            os.remove(local_path)
