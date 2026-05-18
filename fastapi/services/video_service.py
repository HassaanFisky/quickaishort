import os
import asyncio
import logging
import tempfile
import shutil
import httpx
import re
import yt_dlp
from typing import Optional, List, Dict, Any
from pathlib import Path
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.background import BackgroundTask
from app.utils.youtube_auth import inject_ydl_bypass, get_cookie_file

logger = logging.getLogger(__name__)


class VideoService:
    # UPDATED: Reliable Piped instances as of May 2026
    PIPED_INSTANCES = [
        "https://pipedapi.kavin.rocks",
        "https://pipedapi.adminforge.de",
        "https://api-piped.mha.fi",
        "https://piped-api.garudalinux.org",
    ]

    # UPDATED: Invidious instances that still allow API access
    INVIDIOUS_INSTANCES = [
        "https://invidious.privacyredirect.com",
        "https://yewtu.be",
        "https://vid.puffyan.us",
    ]

    @staticmethod
    def extract_video_id(url: str) -> Optional[str]:
        patterns = [
            r"(?:v=|\/)([0-9A-Za-z_-]{11}).*",
            r"shorts\/([0-9A-Za-z_-]{11})",
            r"live\/([0-9A-Za-z_-]{11})",
            r"embed\/([0-9A-Za-z_-]{11})",
            r"v\/([0-9A-Za-z_-]{11})",
            r"youtu\.be\/([0-9A-Za-z_-]{11})",
        ]
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        return None

    @classmethod
    async def get_audio_response(cls, url: str):
        from services.extractor_service import get_extractor_service

        video_id = cls.extract_video_id(url)
        if not video_id:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_url", "message": "Invalid YouTube URL"},
            )

        try:
            svc = get_extractor_service()
            audio_bytes = await svc.extract_audio(url)

            # We wrap the bytes in a stream for FastAPI
            from io import BytesIO

            return StreamingResponse(
                BytesIO(audio_bytes),
                media_type="audio/mpeg",
                headers={
                    "Content-Disposition": f'attachment; filename="{video_id}.mp3"',
                },
            )
        except Exception as e:
            logger.error(f"[VideoService] Extractor failure: {str(e)}")
            return JSONResponse(
                status_code=503,
                content={
                    "error": "extraction_failed",
                    "message": f"YouTube is currently blocking extraction. Our proxies are rotating, please retry. Details: {str(e)[:100]}",
                },
            )

    @classmethod
    async def download_segment(
        cls, video_id: str, start: int, end: int, workdir: str
    ) -> Path:
        """Download a specific segment of a video for background rendering."""
        if video_id.startswith(("http://", "https://")):
            url = video_id
            video_id = cls.extract_video_id(url) or "unknown"
        else:
            url = f"https://www.youtube.com/watch?v={video_id}"

        output_path = Path(workdir) / f"{video_id}_{start}_{end}.mp4"

        # TIER 1: Native yt-dlp
        ydl_opts = {
            "format": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
            "outtmpl": str(output_path),
            "download_ranges": lambda info_dict, ydl: [
                {"start_time": start, "end_time": end}
            ],
            "force_keyframes_at_cuts": True,
            "quiet": True,
        }

        # Apply hardened bypass injection
        ydl_opts = inject_ydl_bypass(ydl_opts)

        try:
            logger.info(f"[VideoService] Tier 1 download_segment for {video_id}")
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None, lambda: yt_dlp.YoutubeDL(ydl_opts).download([url])
            )

            if output_path.exists():
                return output_path
        except Exception as e:
            logger.warning(
                f"[VideoService] yt-dlp download_segment failed, trying Cobalt: {e}"
            )

        # TIER 2: Cobalt (High resilience video API)
        try:
            video_url = await cls._fetch_cobalt(url, mode="video")
            if video_url:
                async with httpx.AsyncClient(
                    timeout=120.0, follow_redirects=True
                ) as client:
                    async with client.stream("GET", video_url) as response:
                        with open(output_path, "wb") as f:
                            async for chunk in response.aiter_bytes():
                                f.write(chunk)
                if output_path.exists():
                    return output_path
        except Exception as e:
            logger.error(f"[VideoService] Cobalt download_segment failed: {e}")

        raise Exception(
            f"Failed to download segment for {video_id} after all fallbacks"
        )

    @classmethod
    def download_segment_sync(
        cls,
        video_id: str,
        start: float,
        end: float,
        workdir,
    ) -> Path:
        """
        Fully synchronous segment downloader for use inside RQ worker.

        RQ workers must not call asyncio.run() — it raises RuntimeError
        if an event loop is already running (Python 3.12+). This method
        uses yt-dlp (already synchronous) and httpx.Client (sync) only.
        """
        if video_id.startswith(("http://", "https://")):
            url = video_id
            video_id = cls.extract_video_id(url) or "unknown"
        else:
            url = f"https://www.youtube.com/watch?v={video_id}"

        output_path = Path(workdir) / f"{video_id}_{int(start)}_{int(end)}.mp4"

        # Tier 1: yt-dlp android_music (no browser cookies, works on Cloud Run)
        ydl_opts = inject_ydl_bypass(
            {
                "format": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
                "outtmpl": str(output_path),
                "download_ranges": lambda _info, _ydl: [
                    {"start_time": start, "end_time": end}
                ],
                "force_keyframes_at_cuts": True,
                "quiet": True,
                "extractor_args": {
                    "youtube": {"player_client": ["android_music", "android"]}
                },
            }
        )
        try:
            logger.info("[VideoService] sync_download tier1 yt-dlp for %s", video_id)
            yt_dlp.YoutubeDL(ydl_opts).download([url])
            if output_path.exists() and output_path.stat().st_size > 0:
                return output_path
        except Exception as exc:
            logger.warning("[VideoService] sync_download yt-dlp failed: %s", exc)

        # Tier 2: Cobalt sync fallback
        try:
            api_url = os.getenv("COBALT_API_URL", "https://api.cobalt.tools/")
            api_key = os.getenv("COBALT_API_KEY")
            headers: dict = {
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(
                    api_url,
                    json={"url": url, "downloadMode": "video", "videoQuality": "1080"},
                    headers=headers,
                )
            if resp.status_code == 200:
                video_url = resp.json().get("url")
                if video_url:
                    logger.info(
                        "[VideoService] sync_download tier2 cobalt stream for %s",
                        video_id,
                    )
                    with httpx.Client(timeout=120.0, follow_redirects=True) as dl:
                        with dl.stream("GET", video_url) as r:
                            r.raise_for_status()
                            with open(output_path, "wb") as f:
                                for chunk in r.iter_bytes(65_536):
                                    f.write(chunk)
                    if output_path.exists() and output_path.stat().st_size > 0:
                        return output_path
        except Exception as exc:
            logger.error("[VideoService] sync_download cobalt failed: %s", exc)

        raise RuntimeError(
            f"sync_download failed for {video_id} after yt-dlp and Cobalt fallbacks"
        )

    @classmethod
    async def _fetch_yt_dlp(cls, url: str, workdir: str) -> Optional[Path]:
        output_path = Path(workdir) / "audio.mp3"

        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": str(Path(workdir) / "audio.%(ext)s"),
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "128",
                }
            ],
            "quiet": True,
            "no_warnings": True,
        }

        # Apply production hardening (Cookies + Resilient Clients)
        ydl_opts = inject_ydl_bypass(ydl_opts)

        # Ensure we use specific clients known to work in May 2026
        if "extractor_args" not in ydl_opts:
            ydl_opts["extractor_args"] = {}

        ydl_opts["extractor_args"]["youtube"] = {
            "player_client": ["ios", "web_creator", "mweb", "tv_embedded"],
            "skip": [],  # Don't skip dash/hls, we need them for audio
        }

        try:
            logger.info(f"[VideoService] Tier 2: yt-dlp for {url}")
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None, lambda: yt_dlp.YoutubeDL(ydl_opts).download([url])
            )

            # Check for any created audio file
            for ext in ["mp3", "m4a", "webm", "wav"]:
                p = Path(workdir) / f"audio.{ext}"
                if p.exists():
                    return p
            return None
        except Exception as e:
            logger.warning(f"[VideoService] yt-dlp failed: {str(e)}")
            return None

    @classmethod
    async def _fetch_cobalt(cls, url: str, mode: str = "audio") -> Optional[str]:
        api_url = os.getenv("COBALT_API_URL", "https://api.cobalt.tools/")
        api_key = os.getenv("COBALT_API_KEY")

        logger.info(f"[VideoService] Tier 3: Cobalt ({mode}) for {url}")

        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    payload = {
                        "url": url,
                        "downloadMode": mode,
                    }
                    if mode == "audio":
                        payload["audioFormat"] = "mp3"
                    else:
                        payload["videoQuality"] = "1080"

                    resp = await client.post(api_url, json=payload, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        return data.get("url")
                    elif resp.status_code == 429:
                        logger.warning(
                            f"[VideoService] Cobalt rate limited (attempt {attempt+1}/3)"
                        )
                        if attempt < 2:
                            await asyncio.sleep(2)
                            continue
                    else:
                        logger.warning(
                            f"[VideoService] Cobalt returned {resp.status_code}: {resp.text}"
                        )
                        break
            except Exception as e:
                logger.warning(f"[VideoService] Cobalt failed: {str(e)}")
                if attempt < 2:
                    await asyncio.sleep(2)
                    continue
        return None

    @classmethod
    async def _fetch_piped(cls, video_id: str) -> Optional[str]:
        import random

        instances = cls.PIPED_INSTANCES.copy()
        random.shuffle(instances)

        for instance in instances[:2]:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(f"{instance}/streams/{video_id}")
                    if resp.status_code == 200:
                        data = resp.json()
                        audio_streams = data.get("audioStreams", [])
                        if audio_streams:
                            sorted_streams = sorted(
                                audio_streams,
                                key=lambda x: x.get("bitrate", 0),
                                reverse=True,
                            )
                            return sorted_streams[0].get("url")
            except:
                continue
        return None

    @classmethod
    async def _fetch_invidious(cls, video_id: str) -> Optional[str]:
        import random

        instances = cls.INVIDIOUS_INSTANCES.copy()
        random.shuffle(instances)

        for instance in instances[:2]:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(f"{instance}/api/v1/videos/{video_id}")
                    if resp.status_code == 200:
                        data = resp.json()
                        formats = data.get("adaptiveFormats", [])
                        audio_only = [
                            f for f in formats if "audio" in f.get("type", "")
                        ]
                        if audio_only:
                            return audio_only[0].get("url")
            except:
                continue
        return None

    @staticmethod
    async def _stream_to_file_response(url: str, tmpdir: str):
        path = Path(tmpdir) / "audio.mp3"
        try:
            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                async with client.stream("GET", url) as response:
                    with open(path, "wb") as f:
                        async for chunk in response.aiter_bytes():
                            f.write(chunk)

            return FileResponse(
                path=path,
                media_type="audio/mpeg",
                background=BackgroundTask(
                    lambda: shutil.rmtree(tmpdir, ignore_errors=True)
                ),
            )
        except Exception as e:
            logger.error(f"[VideoService] Streaming failed: {str(e)}")
            shutil.rmtree(tmpdir, ignore_errors=True)
            raise
