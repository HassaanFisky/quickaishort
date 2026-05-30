import os
import uuid
import asyncio
import httpx
import logging
import tempfile
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
from services.tts_service import get_tts_service
from services.project_service import get_project_service
from services.logging import get_logger

logger = get_logger("adk_service")

ADK_UPLOAD_DIR = Path(tempfile.gettempdir()) / "qai_adk_uploads"
_ADK_EXTENSIONS = (".mp4", ".mov", ".avi", ".webm", ".mkv")


class ADKService:
    @staticmethod
    async def generate_production_plan(
        script: str,
        voice_id: str,
        uploaded_file_ids: List[str],
        user_id: str,
        stock_query: Optional[str] = None,
        aspect_ratio: str = "9:16",
    ) -> Dict[str, Any]:
        """Orchestrates the creation of a full video production plan."""
        logger.info(
            "generating_production_plan",
            script_len=len(script),
            voice=voice_id,
            user=user_id,
        )

        # 1. Resolve uploaded clips to their real GCS object URIs.
        # /api/adk/upload stores each file at adk_uploads/{user_id}/{file_id}{ext}
        # in GCS and preserves the original extension (.mp4/.mov/.avi/.webm/.mkv).
        # We must resolve the actual blob — not assume .mp4 — otherwise the render
        # worker can't find non-mp4 uploads and falls back to a black frame.
        clip_paths: List[str] = []
        for fid in uploaded_file_ids:
            uri = await ADKService._resolve_upload_uri(user_id, fid)
            if uri:
                clip_paths.append(uri)
            else:
                logger.warning("adk_upload_not_found", user=user_id, file_id=fid)

        # 2. Pre-fetch Assets (Private GCS + Pexels)
        stock_clips: List[Dict[str, str]] = []

        # Genius Step: Search private library first
        private_assets = await ADKService._fetch_private_assets(
            stock_query or "general"
        )
        stock_clips.extend(private_assets)

        if not stock_clips and stock_query:
            stock_clips = await ADKService._fetch_stock(stock_query)

        # 3. Generate Voiceover
        tts_service = get_tts_service()
        voiceover_path = await tts_service.generate(script, voice_id)

        # 4. Segment Logic
        segments = ADKService._parse_script_to_segments(script, clip_paths, stock_clips)

        return {
            "segments": segments,
            "voiceover_path": voiceover_path,
            "aspect_ratio": aspect_ratio,
            "created_at": datetime.utcnow().isoformat(),
        }

    @staticmethod
    async def _resolve_upload_uri(user_id: str, file_id: str) -> Optional[str]:
        """Return the gs:// URI of an ADK upload, resolving its real extension.

        Uploads live at adk_uploads/{user_id}/{file_id}{ext} in the GCS bucket.
        We list by prefix instead of guessing the extension so .mov/.webm/etc.
        uploads resolve correctly for the render worker.
        """
        from services.db import get_uploads_bucket

        prefix = f"adk_uploads/{user_id}/{file_id}"
        try:
            bucket = get_uploads_bucket()
            blobs = await asyncio.to_thread(
                lambda: list(bucket.list_blobs(prefix=prefix, max_results=1))
            )
            if blobs:
                return f"gs://{bucket.name}/{blobs[0].name}"
        except Exception as e:
            logger.warning("adk_upload_resolve_failed", file_id=file_id, error=str(e))
        return None

    @staticmethod
    async def _fetch_private_assets(query: str) -> List[Dict[str, str]]:
        """Searches the private GCS bucket for assets matching the query."""
        bucket_name = os.getenv("STOCK_ASSETS_BUCKET")
        if not bucket_name:
            return []

        try:
            from google.cloud import storage

            client = storage.Client()
            bucket = client.bucket(bucket_name)
            # Find blobs that match the keyword
            blobs = list(client.list_blobs(bucket_name, max_results=5))
            return [
                {"id": b.name, "url": f"gs://{bucket_name}/{b.name}"}
                for b in blobs
                if query.lower() in b.name.lower()
            ]
        except Exception as e:
            logger.warning(f"GCS asset fetch failed: {e}")
            return []

    @staticmethod
    def _parse_script_to_segments(
        script: str, clip_paths: List[str], stock_clips: List[Dict]
    ) -> List[Dict]:
        """Split script into timed segments; round-robin assign available clips."""
        paragraphs = [p.strip() for p in script.split("\n\n") if p.strip()]
        if not paragraphs:
            paragraphs = [script.strip()]

        all_clips = clip_paths + [c.get("url", "") for c in stock_clips if c.get("url")]
        segments = []
        for i, para in enumerate(paragraphs):
            # Heuristic: 2.5 words per second
            duration = max(3.0, len(para.split()) / 2.5)
            clip = all_clips[i % len(all_clips)] if all_clips else "BLACK_FRAME"
            segments.append(
                {
                    "clip_path": clip,
                    "start_sec": 0,
                    "end_sec": round(duration, 2),
                    "text": para,
                }
            )
        return segments

    @staticmethod
    async def _fetch_stock(query: str) -> List[Dict[str, str]]:
        from services.vault_service import get_secret

        api_key = get_secret("PEXELS_API_KEY")
        if not api_key:
            logger.warning("pexels_api_key_missing_skipping_stock")
            return []

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://api.pexels.com/videos/search",
                    params={"query": query, "per_page": 6, "orientation": "portrait"},
                    headers={"Authorization": api_key},
                )
                if resp.status_code == 200:
                    stock_clips = []
                    for v in resp.json().get("videos", []):
                        files = v.get("video_files", [])
                        hd = next(
                            (f for f in files if f.get("quality") == "hd"),
                            files[0] if files else None,
                        )
                        if hd:
                            stock_clips.append({"id": str(v["id"]), "url": hd["link"]})
                    return stock_clips
        except Exception as e:
            logger.warning("stock_fetch_failed", error=str(e))
        return []
