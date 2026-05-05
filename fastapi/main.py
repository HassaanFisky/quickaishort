from __future__ import annotations

import warnings
# Silence deprecation and future warnings from Google SDKs
warnings.filterwarnings("ignore", category=DeprecationWarning, module="authlib")
warnings.filterwarnings("ignore", category=FutureWarning, module="google")

import asyncio
import json
import logging
import os
import re
import shutil
import tempfile
import uuid
from contextlib import asynccontextmanager
from typing import List, Literal, Optional

import httpx
import uvicorn
import yt_dlp
from app.utils.youtube_auth import get_cookie_file, inject_ydl_bypass
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field

from agent.viral_agent import get_viral_agent
from models.user_stats import StatsIncrement
from services.db import (
    EXPORTS_BUCKET,
    close_db,
    get_db,
    get_exports_bucket,
    init_db,
    is_ready as db_is_ready,
)
from services.events import (
    CHANNEL_EXPORT_COMPLETE,
    CHANNEL_EXPORT_FAILED,
    CHANNEL_EXPORT_PROGRESS,
    CHANNEL_STATS_INCREMENT,
)
from services.queue_service import (
    JOB_FAILURE_TTL_SECONDS,
    JOB_RESULT_TTL_SECONDS,
    JOB_TIMEOUT_SECONDS,
    redis_conn,
    render_queue,
)
from services.realtime import emit_export_event, ws_manager
from services.auth import get_verified_user_id
from services.signing import sign, verify
from services.stats_service import get_user_stats, increment_stats, deduct_credits, recalculate_user_stats, is_user_premium

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Validate required environment variables at startup
def _validate_env() -> None:
    required = {
        "GEMINI_API_KEY": "AI agent pipeline will not function",
        "MONGODB_URI": "Database features (stats, credits, exports) will be disabled",
        "REDIS_URL": "Background render queue will not function",
        "NEXTAUTH_SECRET": "All protected endpoints will return 503 (or set AUTH_DISABLED=true for dev)",
        "EXPORT_SIGNING_SECRET": "Download URL signing will fail — exports unreachable",
        "PUBLIC_API_URL": "Download links sent to users will be relative paths only",
    }
    missing = [f"  {var}: {reason}" for var, reason in required.items() if not os.getenv(var)]
    if missing:
        logger.warning(
            "STARTUP WARNING — missing environment variables:\n%s\n"
            "Copy fastapi/.env.example to fastapi/.env and fill in the values.",
            "\n".join(missing),
        )

_validate_env()


try:
    from agent import (
        ClipCandidate as PreflightClipCandidate,
        run_preflight_pipeline,
        run_director_pipeline,
    )

    _ADK_AVAILABLE = True
except Exception:
    _ADK_AVAILABLE = False
    PreflightClipCandidate = None  # type: ignore[assignment]
    logger.warning("google-adk unavailable — POST /api/preflight will return 503")


PUBSUB_CHANNELS = (
    CHANNEL_STATS_INCREMENT,
    CHANNEL_EXPORT_PROGRESS,
    CHANNEL_EXPORT_COMPLETE,
    CHANNEL_EXPORT_FAILED,
)


async def _pubsub_listener(stop: asyncio.Event) -> None:
    """Bridges Redis pubsub events from the worker process into async fan-out."""
    pubsub = redis_conn.pubsub(ignore_subscribe_messages=True)
    try:
        pubsub.subscribe(*PUBSUB_CHANNELS)
    except Exception as exc:
        logger.error("Pubsub subscribe failed: %s — listener disabled.", exc)
        return
    logger.info("Pubsub listener active on %s", ",".join(PUBSUB_CHANNELS))

    try:
        while not stop.is_set():
            msg = await asyncio.to_thread(pubsub.get_message, True, 1.0)
            if msg is None:
                continue
            channel = msg.get("channel")
            if isinstance(channel, bytes):
                channel = channel.decode("utf-8")
            data = msg.get("data")
            if isinstance(data, bytes):
                data = data.decode("utf-8")
            try:
                payload = json.loads(data) if isinstance(data, str) else data
            except json.JSONDecodeError:
                logger.warning("Invalid JSON on %s: %r", channel, data)
                continue
            try:
                await _route_pubsub(channel, payload)
            except Exception as exc:
                logger.exception("Pubsub handler %s failed: %s", channel, exc)
    finally:
        try:
            pubsub.close()
        except Exception:
            pass


async def _route_pubsub(channel: str, payload: dict) -> None:
    if channel == CHANNEL_STATS_INCREMENT:
        delta = StatsIncrement.model_validate(payload)
        await increment_stats(
            delta.user_id,
            duration_delta=delta.duration_delta,
            export_delta=delta.export_delta,
            ai_run_delta=delta.ai_run_delta,
            project_delta=delta.project_delta,
        )
        return

    if channel in (CHANNEL_EXPORT_PROGRESS, CHANNEL_EXPORT_COMPLETE, CHANNEL_EXPORT_FAILED):
        user_id = payload.get("user_id", "")
        job_id = payload.get("job_id", "")
        event = {
            CHANNEL_EXPORT_PROGRESS: "progress",
            CHANNEL_EXPORT_COMPLETE: "complete",
            CHANNEL_EXPORT_FAILED: "error",
        }[channel]
        if event == "complete":
            payload = {**payload, "download_url": _build_download_url(job_id, user_id)}
        await emit_export_event(user_id, job_id, event, payload)


def _build_download_url(job_id: str, user_id: str) -> str:
    token, expires = sign(job_id, user_id)
    base = os.getenv("PUBLIC_API_URL", "").rstrip("/")
    path = f"/api/download/{job_id}?token={token}&user_id={user_id}&expires={expires}"
    return f"{base}{path}" if base else path


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Lifespan starting: initializing database...")
    await init_db()
    logger.info("Database initialization call complete.")
    stop_event = asyncio.Event()
    listener_task = asyncio.create_task(_pubsub_listener(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        listener_task.cancel()
        try:
            await listener_task
        except (asyncio.CancelledError, Exception):
            pass
        await close_db()


app = FastAPI(lifespan=lifespan)

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
origins = [
    "http://localhost:3000",
    "https://quickaishort.online",
    "https://www.quickaishort.online",
    "https://quickaishort-ls7d.vercel.app",
    "http://localhost:8000",
]
if allowed_origins_env:
    origins.extend([o.strip() for o in allowed_origins_env.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response

app.add_middleware(SecurityHeadersMiddleware)


# ---- Pydantic request/response models ----------------------------------------


class TranscriptChunk(BaseModel):
    text: str
    start: float
    end: float


class AnalyzeRequest(BaseModel):
    videoId: str
    transcript: List[TranscriptChunk]
    duration: float
    userId: Optional[str] = "anonymous"
    isFirstProject: bool = False


class ClipCandidateRequest(BaseModel):
    start_sec: float
    end_sec: float
    score: float
    transcript: str


class PreflightRequest(BaseModel):
    youtube_url: str
    user_id: str
    is_premium: bool
    clip_candidates: List[ClipCandidateRequest]


class DirectRequest(BaseModel):
    input_text: str
    user_id: str


class CreateVideoRequest(BaseModel):
    script: str
    clip_paths: List[str]
    user_id: str


class ReframingPayload(BaseModel):
    center: dict[str, float]
    scale: float = 1.0


class CaptionsPayload(BaseModel):
    enabled: bool = False
    srt_content: str = ""
    style: Optional[str] = None


class ExportRequest(BaseModel):
    videoId: str
    start_sec: float
    end_sec: float
    user_id: str
    aspect_ratio: Literal["9:16", "1:1"] = "9:16"
    quality: Literal["low", "medium", "high"] = "medium"
    captions: CaptionsPayload = Field(default_factory=CaptionsPayload)
    watermark_enabled: bool = False
    reframing: Optional[ReframingPayload] = None


# ---- YouTube URL validation --------------------------------------------------

_YT_PATTERN = re.compile(
    r"^https?://(www\.)?(youtube\.com/watch\?.*v=|youtu\.be/)[A-Za-z0-9_-]{11}"
)


def _require_youtube_url(url: str) -> None:
    """Raise 400 if url is not a recognisable YouTube URL."""
    if not url or not _YT_PATTERN.match(url):
        raise HTTPException(
            status_code=400,
            detail="A valid YouTube URL is required (youtube.com/watch?v=... or youtu.be/...).",
        )


# ---- Health + meta -----------------------------------------------------------


@app.get("/")
def read_root():
    return {"status": "active", "service": "QuickAI Shorts Engine (Python)"}


@app.get("/health")
def health_check():
    redis_ok = False
    try:
        redis_conn.ping()
        redis_ok = True
    except Exception:
        pass
    return {
        "status": "ok",
        "mongo": db_is_ready(),
        "redis": redis_ok,
        "adk": _ADK_AVAILABLE,
    }


# ---- Analyze ------------------------------------------------------------------


@limiter.limit("10/minute")
@app.post("/api/analyze")
async def analyze_video(request: Request, body: AnalyzeRequest, _auth: str = Depends(get_verified_user_id)):
    try:
        user_id = body.userId or "anonymous"
        if not await deduct_credits(user_id, 10):
            raise HTTPException(status_code=402, detail="Insufficient AI Credits. Please upgrade or top-up.")

        agent = get_viral_agent()
        transcript_text = " ".join(c.text for c in body.transcript)
        suggestions = await agent.analyze_transcript(
            transcript_text, body.duration, video_id=body.videoId, user_id=user_id
        )

        await increment_stats(
            body.userId or "anonymous",
            duration_delta=body.duration,
            ai_run_delta=1,
            project_delta=1 if body.isFirstProject else 0,
        )

        return {
            "videoId": body.videoId,
            "suggestedClips": suggestions,
            "status": "success",
        }
    except Exception as exc:
        logger.exception("/api/analyze failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ---- Export / Process ---------------------------------------------------------


@app.post("/api/process-video")
async def export_video(request: ExportRequest, _auth: str = Depends(get_verified_user_id)):
    if not await deduct_credits(request.user_id, 20):
        raise HTTPException(status_code=402, detail="Insufficient credits for server-side export.")

    job_id = uuid.uuid4().hex
    options = {
        "aspect_ratio": request.aspect_ratio,
        "quality": request.quality,
        "captions_enabled": request.captions.enabled,
        "captions_srt": request.captions.srt_content,
        "captions_style": request.captions.style,
        "watermark_enabled": request.watermark_enabled,
        "reframing": request.reframing.model_dump() if request.reframing else None,
    }

    try:
        from render_worker import process_render_task

        render_queue.enqueue(
            process_render_task,
            job_id,
            request.videoId,
            request.start_sec,
            request.end_sec,
            request.user_id,
            options,
            job_id=job_id,
            job_timeout=JOB_TIMEOUT_SECONDS,
            result_ttl=JOB_RESULT_TTL_SECONDS,
            failure_ttl=JOB_FAILURE_TTL_SECONDS,
            retry=None,
        )
    except Exception as exc:
        logger.exception("Failed to enqueue export %s: %s", job_id, exc)
        raise HTTPException(status_code=503, detail=f"Queue error: {exc}")

    return {
        "status": "queued",
        "job_id": job_id,
        "subscribe_channel": f"export-{job_id}",
    }


@app.get("/api/status/{job_id}")
async def export_status(job_id: str, user_id: str):
    try:
        from rq.job import Job

        job = Job.fetch(job_id, connection=redis_conn)
    except Exception:
        return {"status": "unknown", "job_id": job_id}

    status = job.get_status(refresh=True) or "unknown"
    response: dict = {"status": status, "job_id": job_id}

    if status == "finished":
        response["download_url"] = _build_download_url(job_id, user_id)
        if isinstance(job.result, dict):
            response["meta"] = {
                k: job.result.get(k)
                for k in ("duration_sec", "file_size_bytes", "elapsed_sec")
            }
    elif status == "failed":
        response["error"] = (job.exc_info or "").splitlines()[-1] if job.exc_info else "failed"

    return response


@app.get("/api/download/{job_id}")
async def export_download(job_id: str, user_id: str, token: str, expires: int):
    if not verify(job_id, user_id, expires, token):
        raise HTTPException(status_code=403, detail="Invalid or expired token")
    if not db_is_ready():
        raise HTTPException(status_code=503, detail="Storage unavailable")

    db = get_db()
    file_doc = await db[f"{EXPORTS_BUCKET}.files"].find_one(
        {"metadata.job_id": job_id, "metadata.user_id": user_id}
    )
    if not file_doc:
        raise HTTPException(status_code=404, detail="Export not found or expired")

    bucket = get_exports_bucket()
    stream = await bucket.open_download_stream(file_doc["_id"])

    async def iterator():
        try:
            while True:
                chunk = await stream.readchunk()
                if not chunk:
                    break
                yield chunk
        finally:
            try:
                await stream.close()
            except Exception:
                pass

    filename = file_doc.get("filename", f"{job_id}.mp4")
    return StreamingResponse(
        iterator(),
        media_type="video/mp4",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(file_doc.get("length", "")),
        },
    )


# ---- Stats --------------------------------------------------------------------


@app.get("/api/stats")
async def stats_endpoint(user_id: str, sync: bool = False):
    if sync:
        return await recalculate_user_stats(user_id)
    return await get_user_stats(user_id)


@app.websocket("/ws/stats/{user_id}")
async def stats_ws(websocket: WebSocket, user_id: str):
    await ws_manager.connect(user_id, websocket)
    try:
        initial = await get_user_stats(user_id)
        await websocket.send_text(
            json.dumps({"event": "stats-updated", "payload": initial}, default=str)
        )
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("/ws/stats/%s closed: %s", user_id, exc)
    finally:
        await ws_manager.disconnect(user_id, websocket)


# ---- yt-dlp passthroughs (unchanged behaviour) -------------------------------


@app.get("/api/info")
async def get_video_info(url: str):
    _require_youtube_url(url)

    import httpx

    # Extract video ID from URL
    video_id_match = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11}).*', url)
    video_id = video_id_match.group(1) if video_id_match else None

    api_key = os.environ.get("YOUTUBE_API_KEY")

    if api_key and video_id:
        try:
            # Use official YouTube Data API v3
            api_url = f"https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id={video_id}&key={api_key}"
            headers = {"Referer": "https://www.quickaishort.online"}
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(api_url, headers=headers)
                response.raise_for_status()
                data = response.json()
            
            if data.get("items"):
                item = data["items"][0]
                # Parse duration (ISO 8601 to seconds)
                duration_iso = item["contentDetails"]["duration"]
                duration_sec = 0
                time_match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration_iso)
                if time_match:
                    h, m, s = time_match.groups()
                    duration_sec = int(h or 0) * 3600 + int(m or 0) * 60 + int(s or 0)
                    
                thumbnails = item["snippet"]["thumbnails"]
                best_thumb = thumbnails.get("maxres", thumbnails.get("high", thumbnails.get("default", {})))
                
                return {
                    "id": video_id,
                    "title": item["snippet"]["title"],
                    "duration": duration_sec,
                    "thumbnail": best_thumb.get("url", ""),
                    "formats": [], 
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                    "source": "youtube_data_api"
                }
        except Exception as exc:
            logger.warning(f"YouTube Data API failed, falling back to yt-dlp: {exc}")

    # Fallback to yt-dlp
    ydl_opts = inject_ydl_bypass({
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "quiet": True,
        "no_warnings": True,
    })

    try:
        loop = asyncio.get_event_loop()
        def _extract():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(url, download=False)
        
        info = await loop.run_in_executor(None, _extract)
        return {
            "id": info.get("id"),
            "title": info.get("title"),
            "duration": info.get("duration"),
            "thumbnail": info.get("thumbnail"),
            "formats": info.get("formats"),
            "url": info.get("url"),
            "source": "yt-dlp"
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/proxy")
async def proxy_video(url: str):
    _require_youtube_url(url)

    import httpx

    async def iterfile(stream_url):
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("GET", stream_url) as r:
                r.raise_for_status()
                async for chunk in r.aiter_bytes(chunk_size=16384):
                    yield chunk

    stream_url = None
    # android client gives itag=18 (360p H264+AAC) without PO Token — always available
    # audio-only formats require PO Token on android, so always fall back to combined mp4
    # browsers can extract audio from combined mp4 via decodeAudioData (AAC track)
    fmt = "best[ext=mp4]/18/best"
    media_type = "video/mp4"

    ydl_opts = inject_ydl_bypass({
        "format": fmt,
        "quiet": True,
    })
    
    try:
        # We run blocking yt-dlp in a thread to avoid stalling the event loop
        loop = asyncio.get_event_loop()
        def _extract():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(url, download=False)
        
        info = await loop.run_in_executor(None, _extract)
        stream_url = info.get("url")
    except Exception as exc:
        logger.warning(f"yt-dlp failed in proxy, falling back to Cobalt API v10: {exc}")
        try:
            cobalt_headers = {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            }
            cobalt_api_key = os.environ.get("COBALT_API_KEY")
            if cobalt_api_key:
                cobalt_headers["Authorization"] = f"Api-Key {cobalt_api_key}"

            async with httpx.AsyncClient(timeout=20.0) as client:
                cobalt_response = await client.post(
                    "https://api.cobalt.tools/",
                    json={
                        "url": url,
                        "videoQuality": "1080",
                        "downloadMode": "auto",
                        "videoCodec": "h264",
                    },
                    headers=cobalt_headers,
                )
                cobalt_response.raise_for_status()
                cobalt_data = cobalt_response.json()
                
                status = cobalt_data.get("status")
                if status in ("tunnel", "redirect"):
                    stream_url = cobalt_data.get("url")
                elif status == "picker":
                    # Take the first video-like format
                    pickers = cobalt_data.get("picker", [])
                    video_pickers = [p for p in pickers if "video" in p.get("type", "")]
                    if video_pickers:
                        stream_url = video_pickers[0].get("url")
                
                if not stream_url:
                    raise RuntimeError(f"Cobalt bad status: {status}")
        except Exception as cobalt_exc:
            logger.error(f"Cobalt fallback also failed: {cobalt_exc}")
            raise HTTPException(status_code=500, detail="Both yt-dlp and Cobalt proxy failed. Video may be unavailable.")

    if not stream_url:
        raise HTTPException(status_code=404, detail="Could not retrieve stream URL")

    try:
        return StreamingResponse(
            iterfile(stream_url),
            media_type=media_type,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cross-Origin-Resource-Policy": "cross-origin",
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/audio")
async def get_audio(url: str = Query(...)):
    _require_youtube_url(url)
    import tempfile, asyncio, os, shutil
    from fastapi.responses import FileResponse
    from starlette.background import BackgroundTask

    tmpdir = tempfile.mkdtemp(prefix="qai_audio_")
    output_template = os.path.join(tmpdir, "audio.%(ext)s")

    # Get cookie file if available
    cookie_file = None
    try:
        from app.utils.youtube_auth import get_cookie_file
        cookie_file = get_cookie_file()
    except Exception:
        pass

    cmd = ["yt-dlp"]

    if cookie_file and os.path.exists(cookie_file):
        cmd += ["--cookies", cookie_file]

    cmd += [
        "--no-playlist",
        "--max-filesize", "50m",
        "--extractor-args", "youtube:player_client=android",
        "-f", "bestaudio[ext=m4a]/bestaudio/18",
        "--no-post-overwrites",
        "-o", output_template,
        url
    ]

    logger.info(f"/api/audio: running yt-dlp for {url}")

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=tmpdir
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)
        except asyncio.TimeoutError:
            proc.kill()
            shutil.rmtree(tmpdir, ignore_errors=True)
            logger.error("/api/audio: yt-dlp timed out after 30s")
            return JSONResponse(
                {"error": "audio_timeout", "message": "Video processing timed out. Try a shorter video."},
                status_code=504
            )

        stderr_text = stderr.decode(errors="replace")
        stdout_text = stdout.decode(errors="replace")
        logger.info(f"/api/audio yt-dlp returncode={proc.returncode}")
        if proc.returncode != 0:
            logger.error(f"/api/audio yt-dlp stderr: {stderr_text[-500:]}")
            return JSONResponse(
                {"error": "yt_dlp_failed", "message": stderr_text[-300:]},
                status_code=500
            )

        # Find downloaded file (any audio format)
        output_file = None
        for fname in os.listdir(tmpdir):
            if fname.startswith("audio."):
                output_file = os.path.join(tmpdir, fname)
                break

        if not output_file or not os.path.exists(output_file):
            logger.error(f"/api/audio: no output file in {tmpdir}. Files: {os.listdir(tmpdir)}")
            return JSONResponse(
                {"error": "no_output_file", "message": "Audio file not produced"},
                status_code=500
            )

        ext = os.path.splitext(output_file)[1].lower()
        media_type = "audio/mp4" if ext == ".m4a" else "audio/mpeg"

        logger.info(f"/api/audio: serving {output_file} as {media_type}")

        return FileResponse(
            output_file,
            media_type=media_type,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cross-Origin-Resource-Policy": "cross-origin",
                "Cache-Control": "no-cache",
            },
            background=BackgroundTask(shutil.rmtree, tmpdir, True)
        )

    except Exception as e:
        shutil.rmtree(tmpdir, ignore_errors=True)
        logger.error(f"/api/audio unexpected error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


# ---- Pre-Flight ---------------------------------------------------------------


@limiter.limit("10/minute")
@app.post("/api/preflight")
async def run_preflight(request: Request, body: PreflightRequest, _auth: str = Depends(get_verified_user_id)):
    if not _ADK_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Pre-Flight pipeline unavailable — google-adk not installed on this instance",
        )

    if not body.clip_candidates:
        raise HTTPException(status_code=422, detail="clip_candidates must contain at least one clip")

    # Check if user is on a Pro plan
    is_premium_active = await is_user_premium(body.user_id)
    if not is_premium_active and len(body.clip_candidates) > 1:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "preflight_requires_premium",
                "message": "Full 6-persona panel requires a Pro subscription.",
                "upgrade_url": "/pricing",
            },
        )

    if not await deduct_credits(body.user_id, 50):
        raise HTTPException(status_code=402, detail="Insufficient AI Credits for Pre-flight analysis.")

    candidates = [
        PreflightClipCandidate(
            start_sec=c.start_sec,
            end_sec=c.end_sec,
            score=c.score,
            transcript=c.transcript,
        )
        for c in body.clip_candidates
    ]

    try:
        result = await asyncio.wait_for(
            run_preflight_pipeline(
                youtube_url=body.youtube_url,
                clip_candidates=candidates,
                is_premium=is_premium_active,
                user_id=body.user_id,
            ),
            timeout=120.0,
        )
        await increment_stats(body.user_id, ai_run_delta=1)
        return {"preflight_result": result.model_dump()}
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Pre-Flight analysis timed out after 120 seconds. Try again with a shorter clip.",
        )
    except Exception as exc:
        logger.error("POST /api/preflight failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@limiter.limit("10/minute")
@app.post("/api/direct")
async def run_director(request: Request, body: DirectRequest, _auth: str = Depends(get_verified_user_id)):
    if not _ADK_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Director pipeline unavailable — google-adk not installed",
        )

    try:
        # 1. Deduct credits for Storyboard generation
        if not await deduct_credits(body.user_id, 30):
            raise HTTPException(status_code=402, detail="Insufficient credits for Storyboard generation.")

        # 2. Run the Director Agent with timeout
        result = await asyncio.wait_for(
            run_director_pipeline(
                input_text=body.input_text,
                user_id=body.user_id
            ),
            timeout=120.0
        )

        await increment_stats(body.user_id, ai_run_delta=1)
        return {"director_result": result}
    except HTTPException:
        # Re-raise HTTP exceptions (like 402) so they aren't swallowed by the broad except
        raise
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Storyboard generation timed out after 120 seconds."
        )
    except Exception as exc:
        logger.error("POST /api/direct failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/create-video")
async def create_video(request: CreateVideoRequest, _auth: str = Depends(get_verified_user_id)):
    """
    Day 5 — Wire Everything Together
    Runs: ScriptAgent → PreFlight → RenderService (Background)
    """
    try:
        # 1. ScriptAgent → Production Plan
        from agent.script_agent import ScriptAgent
        agent = ScriptAgent()
        production_plan = await agent.run(request.script, request.clip_paths)
        
        # 2. Idempotent Job ID (Hash of script + clips)
        import hashlib
        plan_hash = hashlib.sha256(
            json.dumps({"script": request.script, "clips": request.clip_paths}, sort_keys=True).encode()
        ).hexdigest()
        job_id = f"gen-{plan_hash[:16]}"

        # 3. Pre-Flight → Viral Score & Audience Simulation
        # (This remains in-process as it's an LLM call, but could also be backgrounded)
        viral_score = 0
        persona_votes = []
        
        if _ADK_AVAILABLE and production_plan["segments"]:
            try:
                # Check premium status for pre-flight in video creation flow
                is_premium_active = await is_user_premium(request.user_id)
                
                hero = production_plan["segments"][0]
                candidates = [
                    PreflightClipCandidate(
                        start_sec=hero["start_sec"],
                        end_sec=hero["end_sec"],
                        score=0.9,
                        transcript=hero["text"]
                    )
                ]
                
                result = await asyncio.wait_for(
                    run_preflight_pipeline(
                        youtube_url="generated-pipeline",
                        clip_candidates=candidates,
                        is_premium=is_premium_active,
                        user_id=request.user_id,
                    ),
                    timeout=60.0,
                )
                viral_score = result.weighted_consensus_score
                persona_votes = [v.model_dump() for v in result.persona_votes]
            except Exception as e:
                logger.warning(f"Pre-flight analysis failed in video creation flow: {e}")

        # 4. Enqueue Render Job (Background)
        from render_worker import process_render_task
        
        # For full production plans, we pass a special 'production_plan' option 
        # that the worker will detect and use instead of single-clip logic.
        options = {
            "production_plan": production_plan,
            "user_id": request.user_id,
        }

        try:
            render_queue.enqueue(
                process_render_task,
                job_id,
                "generated", # video_id placeholder
                0, 0, # start/end placeholders
                request.user_id,
                options,
                job_id=job_id,
                job_timeout=JOB_TIMEOUT_SECONDS,
                result_ttl=JOB_RESULT_TTL_SECONDS,
                failure_ttl=JOB_FAILURE_TTL_SECONDS,
            )
        except Exception as exc:
            logger.exception("Failed to enqueue video creation job %s: %s", job_id, exc)
            raise HTTPException(status_code=503, detail="Queue unavailable")

        return {
            "status": "queued",
            "job_id": job_id,
            "viral_score": viral_score,
            "persona_votes": persona_votes,
            "production_plan": production_plan,
            "subscribe_channel": f"export-{job_id}",
        }
    except Exception as exc:
        logger.exception("Video creation pipeline failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
