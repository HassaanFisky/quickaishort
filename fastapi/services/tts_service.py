import os
import logging
import hashlib
import base64
import tempfile
from pathlib import Path
from typing import Optional, Literal

import httpx
from services.storage_service import get_storage_service

logger = logging.getLogger(__name__)

Provider = Literal["google", "elevenlabs"]


def cloud_tts_skip_reason() -> Optional[str]:
    """Wallet gate before any paid TTS HTTP call.

    Returns a stable reason, or None when a new cloud synthesis may be attempted.
    Spend kill-switch is checked first so a present API key cannot burn credits.
    """
    try:
        from services.gemini_spend_cap import is_gemini_spend_kill_switch

        if is_gemini_spend_kill_switch():
            return "spend_lock"
    except Exception:
        logger.warning("cloud_tts_spend_gate_unavailable — skipping paid TTS")
        return "spend_lock"
    return None


class TTSService:
    def __init__(self):
        self.google_api_key = os.getenv("GOOGLE_TTS_API_KEY")
        self.eleven_api_key = os.getenv("ELEVENLABS_API_KEY")
        self.storage = get_storage_service()

    def _get_cache_key(
        self, text: str, voice_id: str, provider: Provider, speaking_rate: float
    ) -> str:
        rate_key = f"{speaking_rate:.2f}"
        hash_key = hashlib.md5(
            f"{provider}:{voice_id}:{rate_key}:{text}".encode()
        ).hexdigest()
        return f"tts_cache/{hash_key}.mp3"

    def _gs_uri(self, remote_path: str) -> str:
        from services.db import get_gcs_bucket

        try:
            bucket = get_gcs_bucket()
            return f"gs://{bucket.name}/{remote_path}"
        except Exception:
            return f"gs://{remote_path}"

    async def generate(
        self,
        text: str,
        voice_id: str = "en-US-Neural2-D",
        provider: Provider = "google",
        speaking_rate: float = 1.0,
    ) -> Optional[str]:
        """Generate speech audio. Returns gs:// URI (GCS primary, ADR-002).

        Cache hits reuse already-paid audio. Missing key / spend lock skip new
        paid calls and return None — callers must degrade honestly.
        """
        if not text:
            return None

        rate = max(0.25, min(4.0, float(speaking_rate or 1.0)))
        remote_path = self._get_cache_key(text, voice_id, provider, rate)

        if await self.storage.exists_async(remote_path, _bucket_name="uploads"):
            logger.info("[TTS] Cache hit for %s", voice_id)
            return self._gs_uri(remote_path)

        skip = cloud_tts_skip_reason()
        if skip:
            logger.warning("cloud_tts_skipped reason=%s", skip)
            return None

        if provider == "elevenlabs" and not self.eleven_api_key:
            logger.warning("optional_tts_provider_key_missing provider=elevenlabs")
            return None
        if provider != "elevenlabs" and not self.google_api_key:
            logger.warning("GOOGLE_TTS_API_KEY not set")
            return None

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = Path(tmp.name)

        try:
            if provider == "elevenlabs":
                success_path = await self._generate_elevenlabs(text, voice_id, tmp_path)
            else:
                success_path = await self._generate_google(
                    text, voice_id, tmp_path, speaking_rate=rate
                )

            if success_path:
                gs_uri = await self.storage.upload_file_async(
                    tmp_path,
                    remote_path,
                    content_type="audio/mpeg",
                    _bucket_name="uploads",
                )
                if isinstance(gs_uri, str) and gs_uri.startswith("gs://"):
                    return gs_uri
                return self._gs_uri(remote_path)
            return None
        finally:
            if tmp_path.exists():
                os.remove(tmp_path)

    async def _generate_google(
        self,
        text: str,
        voice_id: str,
        cache_path: Path,
        *,
        speaking_rate: float = 1.0,
    ) -> Optional[str]:
        if not self.google_api_key:
            logger.warning("GOOGLE_TTS_API_KEY not set")
            return None

        lang = "-".join(voice_id.split("-")[:2])
        payload = {
            "input": {"text": text[:4000]},
            "voice": {"languageCode": lang, "name": voice_id},
            "audioConfig": {
                "audioEncoding": "MP3",
                "pitch": 0,
                "speakingRate": speaking_rate,
            },
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
            logger.error("Cloud TTS failed: %s", e)
            return None

    async def _generate_elevenlabs(
        self, text: str, voice_id: str, cache_path: Path
    ) -> Optional[str]:
        if not self.eleven_api_key:
            return None

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        headers = {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": self.eleven_api_key,
        }
        payload = {
            "text": text,
            "model_id": "eleven_monolingual_v1",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.5},
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                cache_path.write_bytes(resp.content)
                return str(cache_path)
        except Exception as e:
            logger.error("Optional cloud TTS provider failed: %s", e)
            return None


_tts_service: Optional[TTSService] = None


def get_tts_service() -> TTSService:
    global _tts_service
    if _tts_service is None:
        _tts_service = TTSService()
    return _tts_service
