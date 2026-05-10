import os
import logging
import hashlib
import base64
import tempfile
from pathlib import Path
from typing import Optional, Literal

import httpx
from services.storage_service import get_storage_service
from services.db import is_ready

logger = logging.getLogger(__name__)

Provider = Literal["google", "elevenlabs"]

class TTSService:
    def __init__(self):
        self.google_api_key = os.getenv("GOOGLE_TTS_API_KEY")
        self.eleven_api_key = os.getenv("ELEVENLABS_API_KEY")
        self.storage = get_storage_service()

    def _get_cache_key(self, text: str, voice_id: str, provider: Provider) -> str:
        hash_key = hashlib.md5(f"{provider}:{voice_id}:{text}".encode()).hexdigest()
        return f"tts_cache/{hash_key}.mp3"

    async def generate(
        self, 
        text: str, 
        voice_id: str = "en-US-Neural2-D", 
        provider: Provider = "google"
    ) -> Optional[str]:
        """Generates audio from text. Returns gridfs:// URI."""
        if not text:
            return None

        remote_path = self._get_cache_key(text, voice_id, provider)
        
        # Check GridFS cache
        if await self.storage.exists_async(remote_path, bucket_name="uploads"):
            logger.info(f"[TTS] Cache hit in GridFS for {voice_id}")
            return f"gridfs://{remote_path}"

        # If not in cache, generate and upload
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = Path(tmp.name)
            
        try:
            if provider == "elevenlabs" and self.eleven_api_key:
                success_path = await self._generate_elevenlabs(text, voice_id, tmp_path)
            else:
                success_path = await self._generate_google(text, voice_id, tmp_path)
            
            if success_path:
                # Upload to GridFS
                gridfs_uri = await self.storage.upload_file_async(
                    tmp_path, 
                    remote_path, 
                    content_type="audio/mpeg", 
                    bucket_name="uploads"
                )
                return gridfs_uri
            return None
        finally:
            if tmp_path.exists():
                os.remove(tmp_path)

    async def _generate_google(self, text: str, voice_id: str, cache_path: Path) -> Optional[str]:
        if not self.google_api_key:
            logger.warning("GOOGLE_TTS_API_KEY not set")
            return None

        lang = "-".join(voice_id.split("-")[:2])
        payload = {
            "input": {"text": text[:4000]},
            "voice": {"languageCode": lang, "name": voice_id},
            "audioConfig": {"audioEncoding": "MP3", "pitch": 0, "speakingRate": 1.0},
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"https://texttospeech.googleapis.com/v1/text:synthesize?key={self.google_api_key}",
                    json=payload,
                )
                resp.raise_for_status()
                audio_b64 = resp.json().get("audioContent", "")
                if not audio_b64:
                    return None
                
                audio_bytes = base64.b64decode(audio_b64)
                cache_path.write_bytes(audio_bytes)
                return str(cache_path)
        except Exception as e:
            logger.error(f"Google TTS failed: {e}")
            return None

    async def _generate_elevenlabs(self, text: str, voice_id: str, cache_path: Path) -> Optional[str]:
        if not self.eleven_api_key:
            return None

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        headers = {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": self.eleven_api_key
        }
        payload = {
            "text": text,
            "model_id": "eleven_monolingual_v1",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.5}
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                cache_path.write_bytes(resp.content)
                return str(cache_path)
        except Exception as e:
            logger.error(f"ElevenLabs TTS failed: {e}")
            return None

_tts_service: Optional[TTSService] = None

def get_tts_service() -> TTSService:
    global _tts_service
    if _tts_service is None:
        _tts_service = TTSService()
    return _tts_service
