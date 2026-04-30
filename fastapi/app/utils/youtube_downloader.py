import os
import subprocess
import logging
from typing import Optional
from app.storage.gcs_repo import gcs_repo

logger = logging.getLogger(__name__)

def download_youtube_audio(url: str, job_id: str, uid: str) -> Optional[str]:
    """
    Downloads audio from a YouTube URL and uploads it to GCS.
    Returns the GCS URI.
    """
    local_path = f"/tmp/{job_id}_yt_audio.mp3"
    
    # Using yt-dlp to extract best audio
    cmd = [
        "yt-dlp",
        "-x",
        "--audio-format", "mp3",
        "-o", local_path,
        url
    ]
    
    try:
        logger.info(f"Downloading YouTube audio: {url}")
        subprocess.run(cmd, check=True)
        
        # Upload to GCS
        destination_blob = f"raw_inputs/{uid}/{job_id}/youtube_audio.mp3"
        gcs_uri = gcs_repo.upload_file(destination_blob, local_path)
        
        # Cleanup
        if os.path.exists(local_path):
            os.remove(local_path)
            
        return gcs_uri
    except Exception as e:
        logger.error(f"YouTube download failed: {e}")
        return None
