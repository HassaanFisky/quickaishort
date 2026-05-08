"""Text-to-Speech service.

Supports Google Cloud TTS and ElevenLabs with caching.
"""

import os
import logging
import hashlib
import base64
import tempfile
from pathlib import Path
from typing import Optional, Literal

import httpx

logger = logging.getLogger(__name__)

Provider = Literal["google", "elevenlabs"]

class TTSService:
    def __init__(self):
        self.google_api_key = os.getenv("GOOGLE_TTS_API_KEY")
        self.eleven_api_key = os.getenv("ELEVENLABS_API_KEY")
        self.cache_dir = Path(tempfile.gettempdir()) / "qai_tts_cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _get_cache_path(self, text: str, voice_id: str, provider: Provider) -> Path:
        hash_key = hashlib.md5(f"{provider}:{voice_id}:{text}".encode()).hexdigest()
        return self.cache_dir / f"{hash_key}.mp3"

    async def generate(
        self, 
        text: str, 
        voice_id: str = "en-US-Neural2-D", 
        provider: Provider = "google"
    ) -> Optional[str]:
        """Generates audio from text. Returns local file path."""
        if not text:
            return None

        cache_path = self._get_cache_path(text, voice_id, provider)
        if cache_path.exists():
            logger.info(f"[TTS] Cache hit for {voice_id}")
            return str(cache_path)

        if provider == "elevenlabs" and self.eleven_api_key:
            return await self._generate_elevenlabs(text, voice_id, cache_path)
        else:
            # Fallback to Google if ElevenLabs key missing or explicitly requested
            return await self._generate_google(text, voice_id, cache_path)

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

        # Voice ID for ElevenLabs is usually a hash (e.g. "21m00Tcm4TlvDq8ikWAM" for Rachel)
        # If the voice_id doesn't look like an ElevenLabs ID, we might need a mapping.
        
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
