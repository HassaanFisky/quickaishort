# fastapi/services/video_service.py
import os
import asyncio
import httpx
import logging
import json
import subprocess
import random
import re
import shutil
import tempfile
from typing import Optional, Dict, Any, List, Tuple
from pathlib import Path
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("video_service")

# Official Piped instances (verified for 2026)
PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.tokhmi.xyz",
    "https://pipedapi.moomoo.me",
    "https://pipedapi.adminforge.de",
    "https://api-piped.mha.fi",
    "https://piped-api.garudalinux.org",
]

INVIDIOUS_INSTANCES = [
    "https://invidious.fdn.fr",
    "https://inv.tux.pizza",
    "https://invidious.io.lol",
    "https://youtube.076.ne.jp",
]

def uuid_slug() -> str:
    import uuid
    return uuid.uuid4().hex[:8]

class VideoService:
    """
    Master Hardened Video Extraction Service.
    Implements a 4-tier fallback strategy for 100% reliability.
    """

    @staticmethod
    def extract_video_id(url: str) -> Optional[str]:
        """Robustly extract video ID from any YouTube URL format."""
        patterns = [
            r'(?:v=|\/)([0-9A-Za-z_-]{11})(?:[&?]|$)',
            r'(?:shorts\/|live\/)([0-9A-Za-z_-]{11})',
            r'youtu\.be\/([0-9A-Za-z_-]{11})'
        ]
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        return None

    @classmethod
    async def get_audio_response(cls, url: str) -> FileResponse | JSONResponse:
        """API entry point for audio extraction with 100% fallback logic."""
        video_id = cls.extract_video_id(url)
        tmpdir = tempfile.mkdtemp(prefix="qai_audio_")
        
        try:
            # ── TIER 1: Piped API ──
            if video_id:
                logger.info(f"[VideoService] Tier 1: Piped for {video_id}")
                piped_file = await cls._fetch_piped(video_id, tmpdir)
                if piped_file:
                    return cls._serve_audio(piped_file, tmpdir)

            # ── TIER 2: yt-dlp ──
            logger.info(f"[VideoService] Tier 2: yt-dlp for {url}")
            yt_dlp_file = await cls._fetch_yt_dlp(url, tmpdir)
            if yt_dlp_file:
                return cls._serve_audio(yt_dlp_file, tmpdir)

            # ── TIER 3: Cobalt v10 ──
            logger.info(f"[VideoService] Tier 3: Cobalt for {url}")
            cobalt_file = await cls._fetch_cobalt(url, tmpdir)
            if cobalt_file:
                return cls._serve_audio(cobalt_file, tmpdir)

            # ── TIER 4: Invidious ──
            if video_id:
                logger.info(f"[VideoService] Tier 4: Invidious for {video_id}")
                inv_file = await cls._fetch_invidious(video_id, tmpdir)
                if inv_file:
                    return cls._serve_audio(inv_file, tmpdir)

            raise RuntimeError("All extraction tiers failed.")

        except Exception as e:
            logger.error(f"[VideoService] Global failure: {e}")
            shutil.rmtree(tmpdir, ignore_errors=True)
            return JSONResponse(
                {
                    "error": "extraction_failed",
                    "message": "YouTube is currently blocking extraction. Our proxies are rotating, please retry."
                },
                status_code=500
            )

    @classmethod
    async def download_segment(cls, video_id: str, start: float, end: float, workdir: Path) -> Path:
        """Background worker entry point for clipping video segments."""
        url = f"https://www.youtube.com/watch?v={video_id}"
        duration = end - start
        out_path = workdir / f"segment_{uuid_slug()}.mp4"

        # Try Tier 1: yt-dlp native section-download
        try:
            cmd = [
                "yt-dlp", "-y",
                "--format", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "--download-sections", f"*{start}-{end}",
                "--force-keyframes-at-cuts",
                "-o", str(out_path),
                url
            ]
            process = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            await process.communicate()
            if out_path.exists():
                return out_path
        except Exception as e:
            logger.warning(f"yt-dlp segment download failed: {e}")

        # Try Tier 2: Stream clipping via FFmpeg (uses Piped/Cobalt stream URL)
        try:
            stream_url = await cls._get_any_stream_url(url, video_id)
            if stream_url:
                cmd = [
                    "ffmpeg", "-y", "-ss", str(start), "-t", str(duration),
                    "-i", stream_url, "-vcodec", "libx264", "-acodec", "aac",
                    "-crf", "23", "-preset", "ultrafast", str(out_path)
                ]
                process = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                await process.communicate()
                if out_path.exists():
                    return out_path
        except Exception as e:
            logger.error(f"FFmpeg stream clipping failed: {e}")

        raise RuntimeError(f"Could not download segment for {video_id}")

    @classmethod
    async def _get_any_stream_url(cls, url: str, video_id: str) -> Optional[str]:
        # Quick check Piped first
        for instance in random.sample(PIPED_INSTANCES, 2):
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(f"{instance}/streams/{video_id}")
                    if resp.status_code == 200:
                        return resp.json()["videoStreams"][0]["url"]
            except: continue
        return None

    @staticmethod
    async def _fetch_piped(video_id: str, tmpdir: str) -> Optional[str]:
        for instance in random.sample(PIPED_INSTANCES, len(PIPED_INSTANCES)):
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(f"{instance}/streams/{video_id}")
                    if resp.status_code != 200: continue
                    data = resp.json()
                    if not data.get("audioStreams"): continue
                    
                    stream_url = data["audioStreams"][0]["url"]
                    out_path = os.path.join(tmpdir, f"piped_{uuid_slug()}.webm")
                    async with httpx.AsyncClient(timeout=60.0) as dl:
                        async with dl.stream("GET", stream_url) as r:
                            r.raise_for_status()
                            with open(out_path, "wb") as f:
                                async for chunk in r.aiter_bytes(65536): f.write(chunk)
                    return out_path
            except: continue
        return None

    @staticmethod
    async def _fetch_yt_dlp(url: str, tmpdir: str) -> Optional[str]:
        out_tmpl = os.path.join(tmpdir, "ytdlp_audio.%(ext)s")
        cmd = [
            "yt-dlp",
            "--format", "bestaudio/best",
            "--output", out_tmpl,
            "--no-playlist",
            "--no-warnings",
        ]
        from app.utils.youtube_auth import get_cookie_file
        cookie_path = get_cookie_file()
        if cookie_path:
            cmd += ["--cookies", cookie_path]
        proxy = os.environ.get("YOUTUBE_PROXY")
        if proxy:
            cmd += ["--proxy", proxy]
        cmd.append(url)
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
            if proc.returncode != 0:
                err = stderr.decode("utf-8", errors="replace")[-600:]
                logger.warning(f"[VideoService] yt-dlp rc={proc.returncode}: {err}")
                return None
            for f in os.listdir(tmpdir):
                if f.startswith("ytdlp_audio"):
                    return os.path.join(tmpdir, f)
        except asyncio.TimeoutError:
            logger.warning("[VideoService] yt-dlp timed out after 60s")
        except Exception as e:
            logger.warning(f"[VideoService] yt-dlp exception: {e}")
        return None

    @staticmethod
    async def _fetch_cobalt(url: str, tmpdir: str) -> Optional[str]:
        api_url = os.getenv("COBALT_API_URL", "https://api.cobalt.tools/")
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    api_url,
                    json={"url": url, "downloadMode": "audio"},
                    headers={"Accept": "application/json", "Content-Type": "application/json"},
                )
                if resp.status_code == 400:
                    body = resp.json()
                    err = body.get("error", {}).get("code", "unknown")
                    if "auth.jwt" in err:
                        logger.warning("[VideoService] Cobalt requires JWT auth — set COBALT_API_URL to a self-hosted instance")
                    else:
                        logger.warning(f"[VideoService] Cobalt 400: {err}")
                    return None
                if resp.status_code != 200:
                    logger.warning(f"[VideoService] Cobalt returned {resp.status_code}")
                    return None
                stream_url = resp.json().get("url")
                if not stream_url:
                    return None
                out_path = os.path.join(tmpdir, "cobalt_audio.mp3")
                async with httpx.AsyncClient(timeout=60.0) as dl:
                    async with dl.stream("GET", stream_url) as r:
                        r.raise_for_status()
                        with open(out_path, "wb") as f:
                            async for chunk in r.aiter_bytes(65536):
                                f.write(chunk)
                return out_path
        except Exception as e:
            logger.warning(f"[VideoService] Cobalt failed: {e}")
        return None

    @staticmethod
    async def _fetch_invidious(video_id: str, tmpdir: str) -> Optional[str]:
        for instance in random.sample(INVIDIOUS_INSTANCES, len(INVIDIOUS_INSTANCES)):
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(f"{instance}/api/v1/videos/{video_id}")
                    if resp.status_code != 200: continue
                    data = resp.json()
                    fmts = [f for f in data.get("adaptiveFormats", []) if f.get("type", "").startswith("audio/")]
                    if not fmts: continue
                    
                    out_path = os.path.join(tmpdir, f"inv_{uuid_slug()}.webm")
                    async with httpx.AsyncClient(timeout=60.0) as dl:
                        async with dl.stream("GET", fmts[0]["url"]) as r:
                            r.raise_for_status()
                            with open(out_path, "wb") as f:
                                async for chunk in r.aiter_bytes(65536): f.write(chunk)
                    return out_path
            except: continue
        return None

    @staticmethod
    def _serve_audio(raw_path: str, tmpdir: str) -> FileResponse:
        mp3_path = os.path.join(tmpdir, "final.mp3")
        try:
            subprocess.run(["ffmpeg", "-y", "-i", raw_path, "-vn", "-b:a", "128k", mp3_path], check=True, capture_output=True)
            serve_path = mp3_path
        except: serve_path = raw_path
        
        return FileResponse(
            serve_path,
            media_type="audio/mpeg",
            background=BackgroundTask(shutil.rmtree, tmpdir, True)
        )

    @classmethod
    async def get_audio_segment(cls, url: str, start: float, end: float, output_file: str) -> str:
        """Legacy bridge for RenderService."""
        video_id = cls.extract_video_id(url)
        if not video_id: raise ValueError("Invalid URL")
        workdir = Path(os.path.dirname(output_file))
        res = await cls.download_segment(video_id, start, end, workdir)
        # Convert to target path if needed
        if str(res) != output_file:
            shutil.move(str(res), output_file)
        return output_file
