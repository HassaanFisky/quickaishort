import os
import requests
import logging
from typing import List, Dict, Optional
from app.models.schemas import Storyboard
from app.config import settings

logger = logging.getLogger(__name__)

# Note: PEXELS_API_KEY should be added to .env
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY", "")

def search_pexels_video(query: str) -> Optional[str]:
    """
    Searches Pexels for a relevant vertical video.
    Returns the URL of the video file.
    """
    if not PEXELS_API_KEY:
        logger.warning("PEXELS_API_KEY not set. Skipping search.")
        return None
        
    url = f"https://api.pexels.com/videos/search?query={query}&per_page=1&orientation=portrait"
    headers = {"Authorization": PEXELS_API_KEY}
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        videos = data.get("videos", [])
        if not videos:
            return None
            
        # Get the link for a high-quality vertical file
        video_files = videos[0].get("video_files", [])
        # Find a link that is mobile/HD
        for f in video_files:
            if f.get("width") == 1080: # Standard vertical HD
                return f.get("link")
        
        # Fallback to the first available link
        return video_files[0].get("link") if video_files else None
    except Exception as e:
        logger.error(f"Pexels search failed: {e}")
        return None

def resolve_assets(storyboard: Storyboard, user_assets: List[str] = []) -> Dict[str, str]:
    """
    Maps each scene in the storyboard to a specific asset path.
    Prioritizes Pexels API search if key is provided.
    """
    resolved = {}
    
    for idx, scene in enumerate(storyboard.scenes):
        asset_needed = scene.asset_type_needed.lower()
        
        # 1. Check user provided
        if idx < len(user_assets):
            resolved[scene.id] = user_assets[idx]
            continue
            
        # 2. Real Pexels Search
        pexels_url = search_pexels_video(asset_needed)
        if pexels_url:
            resolved[scene.id] = pexels_url
            continue
            
        # 3. Fallback
        resolved[scene.id] = "gs://quickaishort-assets/samples/stock_1.mp4"
        
    return resolved
