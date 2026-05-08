"""Background music service.

Provides a catalog of royalty-free music tracks for the render pipeline.
"""

import logging
from pathlib import Path
from typing import List, Dict, Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)

class MusicTrack(BaseModel):
    id: str
    name: str
    url: str
    mood: str
    genre: str

# In production, this would be a database or a remote bucket index.
DEFAULT_TRACKS = [
    {
        "id": "lofi-beat-1",
        "name": "Chill Lofi",
        "url": "https://storage.googleapis.com/qai-assets/music/chill-lofi.mp3",
        "mood": "relaxing",
        "genre": "Lofi"
    },
    {
        "id": "energetic-synth-1",
        "name": "Power Up",
        "url": "https://storage.googleapis.com/qai-assets/music/power-up.mp3",
        "mood": "energetic",
        "genre": "Synthwave"
    },
    {
        "id": "suspense-drone-1",
        "name": "The Mystery",
        "url": "https://storage.googleapis.com/qai-assets/music/mystery.mp3",
        "mood": "suspenseful",
        "genre": "Ambient"
    }
]

class MusicService:
    def __init__(self):
        self.tracks = [MusicTrack(**t) for t in DEFAULT_TRACKS]

    def list_tracks(self) -> List[MusicTrack]:
        return self.tracks

    def get_track(self, track_id: str) -> Optional[MusicTrack]:
        return next((t for t in self.tracks if t.id == track_id), None)

_music_service: Optional[MusicService] = None

def get_music_service() -> MusicService:
    global _music_service
    if _music_service is None:
        _music_service = MusicService()
    return _music_service
