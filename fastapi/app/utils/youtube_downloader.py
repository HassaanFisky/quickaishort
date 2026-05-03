import os
import logging
from typing import Optional
import yt_dlp
from app.storage.gcs_repo import gcs_repo
from app.utils.youtube_auth import inject_ydl_bypass

logger = logging.getLogger(__name__)

def download_youtube_audio(url: str, job_id: str, uid: str) -> Optional[str]:
    """
    Downloads audio from a YouTube URL using the yt-dlp library and uploads it to GCS.
    Returns the GCS URI.
    """
    local_path = f"/tmp/{job_id}_yt_audio.mp3"
    
    ydl_opts = inject_ydl_bypass({
        "format": "bestaudio/best",
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }],
        "outtmpl": f"/tmp/{job_id}_yt_audio.%(ext)s", # yt-dlp will append .mp3 after postprocessing
        "quiet": True,
        "no_warnings": True,
    })
    
        try:
            logger.info(f"Downloading YouTube audio: {url}")
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
            
            # yt-dlp postprocessor renames to .mp3, but let's make sure we find it
            # Sometimes it might be slightly different if outtmpl was used differently
            if not os.path.exists(local_path):
                # Check for alternative naming if it didn't match exactly
                logger.warning(f"Expected file at {local_path} not found, checking alternatives...")
                if os.path.exists(f"/tmp/{job_id}_yt_audio.mp3"):
                    local_path = f"/tmp/{job_id}_yt_audio.mp3"
                else:
                    raise FileNotFoundError(f"Failed to find downloaded audio at {local_path}")
        except Exception as ydl_e:
            logger.warning(f"yt-dlp audio download failed, attempting Cobalt fallback: {ydl_e}")
            import requests
            headers = {"Accept": "application/json", "Content-Type": "application/json"}
            payload = {"url": url, "isAudioOnly": True}
            cobalt_resp = requests.post("https://api.cobalt.tools/api/json", json=payload, headers=headers, timeout=15)
            cobalt_resp.raise_for_status()
            cobalt_data = cobalt_resp.json()
            stream_url = cobalt_data.get("url")
            if not stream_url:
                raise RuntimeError("Cobalt API returned no audio URL")
            
            # Download stream directly
            with requests.get(stream_url, stream=True, timeout=30) as r:
                r.raise_for_status()
                with open(local_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)

        # Upload to GCS
        destination_blob = f"raw_inputs/{uid}/{job_id}/youtube_audio.mp3"
        gcs_uri = gcs_repo.upload_file(destination_blob, local_path)
        
        # Cleanup
        if os.path.exists(local_path):
            os.remove(local_path)
            
        return gcs_uri
    except Exception as e:
        logger.error(f"YouTube download failed: {e}")
        # Cleanup in case of failure
        if os.path.exists(local_path):
            os.remove(local_path)
        return None
