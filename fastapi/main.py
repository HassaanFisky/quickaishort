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

from pathlib import Path

import httpx
import uvicorn
import yt_dlp
import sentry_sdk
from datetime import datetime
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Header, Query, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse, RedirectResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field
try:
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        integrations=[FastApiIntegration()],
        traces_sample_rate=0.1,
    )
except ImportError:
    print("[WARN] sentry_sdk not found, skipping initialization")
except Exception as _sentry_err:
    print(f"[ERROR] Sentry initialization failed: {_sentry_err}")

from app.utils.youtube_auth import get_cookie_file, inject_ydl_bypass
from agent.viral_agent import get_viral_agent
from models.user_stats import StatsIncrement
from services.db import (
    EXPORTS_BUCKET,
    UPLOADS_BUCKET,
    close_db,
    get_db,
    get_exports_bucket,
    get_uploads_bucket,
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
from services.logging import log_metric
from services.stats_service import get_user_stats, increment_stats, deduct_credits, recalculate_user_stats, is_user_premium
from services.video_service import VideoService
from services.project_service import get_project_service
from services.demo_service import DemoService
from services.tts_service import get_tts_service
from services.music_service import get_music_service
from services.storage_service import get_storage_service

load_dotenv()
from services.logging import setup_logging, get_logger, correlation_id
setup_logging()
logger = get_logger("api")

from services.queue_service import is_overloaded, get_job_cost_est

_STARTUP_COMPLETE = False


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
    # Tracing
    cid = payload.get("correlation_id")
    if cid: correlation_id.set(cid)

    if channel == CHANNEL_STATS_INCREMENT:
        delta = StatsIncrement.model_validate(payload)
        from services.stats_service import increment_stats
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

        # Auto-update project status in DB if this belongs to a project
        if event in ("complete", "error"):
            try:
                db = get_db()
                status = "ready" if event == "complete" else "failed"
                updates = {"status": status}
                if event == "error":
                    updates["error"] = payload.get("error", "Unknown error")
                
                # Find project by job_id and update
                await db["Projects"].update_one(
                    {"job_id": job_id, "user_id": user_id},
                    {"$set": updates}
                )
                logger.info("project_status_updated", job_id=job_id, status=status)
            except Exception as e:
                logger.error("project_status_update_failed", job_id=job_id, error=str(e))

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
    logger.info("lifespan_starting")
    await init_db()
    from services.diagnostics import run_startup_checks
    try:
        await run_startup_checks()
        global _STARTUP_COMPLETE
        _STARTUP_COMPLETE = True
    except Exception as e:
        logger.error("startup_checks_failed", error=str(e))
    
    stop_event = asyncio.Event()
    listener_task = asyncio.create_task(_pubsub_listener(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        listener_task.cancel()
        await close_db()
        logger.info("lifespan_shutdown")


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

class ProjectCreateRequest(BaseModel):
    title: str
    script: str

class ProjectUpdateRequest(BaseModel):
    title: Optional[str] = None
    script: Optional[str] = None
    status: Optional[str] = None


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


class CanvasOverlayPayload(BaseModel):
    type: str
    content: str
    x_pct: float
    y_pct: float
    scale: float = 1.0
    rotation: float = 0.0


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
    canvas_overlays: List[CanvasOverlayPayload] = Field(default_factory=list)


# ---- YouTube URL validation --------------------------------------------------

_YT_PATTERN = re.compile(
    r"(?:https?://)?(?:www\.)?(?:youtube\.com/(?:watch\?v=|embed/|shorts/|v/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})"
)


def _require_youtube_url(url: str) -> str:
    """Raise 400 if url is not a recognisable YouTube URL. Returns extracted ID."""
    video_id = VideoService.extract_video_id(url)
    if not video_id:
        raise HTTPException(
            status_code=400,
            detail="A valid YouTube URL is required (supports watch?v=, shorts/, live/, and youtu.be/).",
        )
    return video_id


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


@app.get("/ready")
def readiness_check():
    """
    Readiness probe used by Cloud Run and load balancers.

    Returns 503 when every extractor circuit is OPEN (no tier can serve
    requests). The load balancer stops routing traffic to this instance
    until the circuits recover and /ready returns 200 again.
    Also blocks if MongoDB is down, since protected endpoints need it.
    """
    from services.extractor_service import get_extractor_service

    svc = get_extractor_service()
    if not svc.is_ready():
        raise HTTPException(
            status_code=503,
            detail="All extraction tier circuits are open — not ready to serve",
        )
    if not db_is_ready():
        raise HTTPException(
            status_code=503,
            detail="MongoDB not initialised — not ready to serve",
        )
    return {"status": "ready"}


@app.get("/metrics")
def prometheus_metrics():
    """
    Prometheus-compatible metrics endpoint.

    Exposes counters and histograms for:
      - extraction_duration_seconds (per tier, per status)
      - tier_failures_total (per tier, per error_class)
      - circuit_open_total (per tier)
      - cache_hits_total / cache_misses_total
      - extraction_exhausted_total
      - extraction_success_total (per tier)

    Scrape interval recommendation: 15s.
    """
    from services.extractor_service import METRICS_AVAILABLE, generate_latest, CONTENT_TYPE_LATEST
    from fastapi.responses import Response

    if not METRICS_AVAILABLE:
        raise HTTPException(
            status_code=501,
            detail="prometheus-client not installed — add it to requirements.txt",
        )
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)




@app.get("/debug/tiers")
def debug_tiers(request: Request):
    """
    Circuit breaker state snapshot per extraction tier.

    Returns the current state (CLOSED/OPEN/HALF-OPEN), failure count,
    and how long each circuit has been open (if applicable).

    Internal endpoint — restrict to internal traffic in production via
    Cloud Armor, IAP, or a header check (INTERNAL_SECRET env var).
    """
    from services.extractor_service import get_extractor_service

    internal_secret = os.environ.get("INTERNAL_SECRET")
    if internal_secret:
        provided = request.headers.get("X-Internal-Secret", "")
        if provided != internal_secret:
            raise HTTPException(status_code=403, detail="Forbidden")

    svc = get_extractor_service()
    return {
        "tiers": svc.tier_states(),
        "ready": svc.is_ready(),
    }


# ---- Analyze ------------------------------------------------------------------


@limiter.limit("10/minute")
@app.post("/api/analyze")
async def analyze_video(request: Request, body: AnalyzeRequest, verified_user_id: str = Depends(get_verified_user_id)):
    try:
        user_id = verified_user_id or body.userId or "anonymous"
        if not await deduct_credits(user_id, 10):
            logger.warning("Low credits for %s on /api/analyze — continuing free", user_id)

        agent = get_viral_agent()
        transcript_text = " ".join(c.text for c in body.transcript)
        suggestions = await agent.analyze_transcript(
            transcript_text, body.duration, video_id=body.videoId, user_id=user_id
        )

        await increment_stats(
            user_id,
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
async def export_video(request: ExportRequest, verified_user_id: str = Depends(get_verified_user_id)):
    user_id = verified_user_id or request.user_id
    
    # Pillar 1: Overload Guardrail
    if is_overloaded():
        raise HTTPException(status_code=503, detail="System currently overloaded or in maintenance. Try again later.")

    # Pillar 2: Duration Limit
    duration = request.end_sec - request.start_sec
    if duration > 180: # Max 3 minutes per export
        raise HTTPException(status_code=400, detail="Export duration exceeds maximum limit of 180 seconds.")

    if not await deduct_credits(user_id, 20):
        logger.warning("Low credits for %s on /api/process-video — continuing free", user_id)

    # --- Pillar 4: Safe Demo Bypass ---
    if DemoService.is_demo_url(request.videoId):
        logger.info("demo_export_triggered", user_id=user_id, video_id=request.videoId)
        return {
            "status": "queued",
            "job_id": "demo-job-showcase",
            "subscribe_channel": f"export-demo-job-showcase",
        }

    job_id = uuid.uuid4().hex
    
    # CHANGED: Autonomous metadata lookup for 'Genius' features
    # (Auto-Reframing + Auto-Hook Overlay + Cinematic Peaks)
    salient_center_x = 0.5
    hook_overlay = ""
    emotional_peaks = []
    cinematic_style = "Impact"
    
    if not request.reframing:
        try:
            lookup_key = f"{request.start_sec:.2f}:{request.end_sec:.2f}"
            raw_meta = redis_conn.hget(f"segment:metadata:{request.videoId}", lookup_key)
            if raw_meta:
                import json as _json
                meta = _json.loads(raw_meta)
                salient_center_x = float(meta.get("cx", 0.5))
                hook_overlay = meta.get("hook", "")
                emotional_peaks = meta.get("peaks", [])
                cinematic_style = meta.get("style", "Impact")
                logger.info("autonomous_metadata_hit", video_id=request.videoId, peaks=emotional_peaks)
        except Exception:
            pass

    options = {
        "aspect_ratio": request.aspect_ratio,
        "quality": request.quality,
        "captions_enabled": request.captions.enabled,
        "captions_srt": request.captions.srt_content,
        "captions_style": request.captions.style,
        "watermark_enabled": request.watermark_enabled,
        "reframing": request.reframing.model_dump() if request.reframing else None,
        "salient_center_x": salient_center_x if not request.reframing else None,
        "hook_overlay": hook_overlay,
        "emotional_peaks": emotional_peaks,
        "cinematic_style": cinematic_style,
        "canvas_overlays": [ov.model_dump() for ov in request.canvas_overlays],
    }

    try:
        from render_worker import process_render_task
        from rq import Retry as RqRetry

        render_queue.enqueue(
            process_render_task,
            job_id,
            request.videoId,
            request.start_sec,
            request.end_sec,
            user_id,
            options,
            job_id=job_id,
            job_timeout=JOB_TIMEOUT_SECONDS,
            result_ttl=JOB_RESULT_TTL_SECONDS,
            failure_ttl=JOB_FAILURE_TTL_SECONDS,
            retry=RqRetry(max=2, interval=[30, 60]),
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
    if DemoService.is_demo_job(job_id):
        payload = DemoService.get_cached_render_payload(job_id, "system")
        payload["download_url"] = _build_download_url(job_id, "system")
        return payload

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
    """
    Serves the rendered video directly from GridFS.
    """
    if DemoService.is_demo_job(job_id):
        return RedirectResponse(url="https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4")

    # Enforce HMAC token — verify() uses hmac.compare_digest (timing-safe)
    if not verify(job_id, user_id, expires, token):
        raise HTTPException(status_code=403, detail="Invalid or expired download token.")

    remote_path = f"exports/{user_id}/{job_id}.mp4"
    
    try:
        bucket = get_exports_bucket()
        # Find the file by name
        cursor = bucket.find({"filename": remote_path})
        files = await cursor.to_list(length=1)
        
        if not files:
            logger.error("export_not_found_in_gridfs", path=remote_path)
            raise HTTPException(status_code=404, detail="Export not found")
            
        file_id = files[0]["_id"]
        
        # GridFS bucket open_download_stream returns an async stream
        grid_out = await bucket.open_download_stream(file_id)
        
        async def stream_gridfs():
            while True:
                chunk = await grid_out.read(256 * 1024) # 256KB chunks
                if not chunk:
                    break
                yield chunk

        return StreamingResponse(
            stream_gridfs(),
            media_type="video/mp4",
            headers={
                "Content-Disposition": f'attachment; filename="{job_id}.mp4"',
                "Content-Length": str(files[0]["length"])
            }
        )
    except Exception as e:
        logger.error("gridfs_download_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Internal storage error")



# ---- Stats --------------------------------------------------------------------


@app.get("/api/stats")
async def stats_endpoint(
    verified_user_id: str = Depends(get_verified_user_id),
    sync: bool = False,
):
    """Returns stats for the authenticated user only."""
    if sync:
        return await recalculate_user_stats(verified_user_id)
    return await get_user_stats(verified_user_id)


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
    video_id = _require_youtube_url(url)

    if DemoService.is_demo_url(url):
        return {
            "id": video_id,
            "title": "AI Evolution: The Next Frontier (Demo)",
            "duration": 45,
            "thumbnail": f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg",
            "formats": [], 
            "url": url,
            "source": "demo_cache"
        }

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
        logger.warning(f"yt-dlp info extraction failed, trying Cobalt fallback: {exc}")
        try:
            # Import dynamically to avoid circular dependencies if any
            from services.render_service import _cobalt_get_stream_url
            
            # Use Cobalt to get at least the basic stream/ID info
            # We can't get full formats via Cobalt easy, but we can get the title and URL
            # Note: _cobalt_get_stream_url returns the direct mp4 link
            video_id_match = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11}).*', url)
            v_id = video_id_match.group(1) if video_id_match else "unknown"
            
            return {
                "id": v_id,
                "title": f"Video {v_id}",
                "duration": 0, # Cobalt doesn't always return duration in v10 response
                "thumbnail": f"https://i.ytimg.com/vi/{v_id}/maxresdefault.jpg",
                "formats": [],
                "url": url,
                "source": "cobalt_fallback"
            }
        except Exception as cobalt_exc:
            logger.error(f"Ultimate failure: Both yt-dlp and Cobalt failed: {cobalt_exc}")
            raise HTTPException(status_code=500, detail=f"YouTube extraction blocked: {str(exc)}")


@app.get("/api/proxy")
async def proxy_video(url: str):
    _require_youtube_url(url)
    
    if DemoService.is_demo_url(url):
        # Redirect to a known safe open source video for the demo
        return RedirectResponse(url="https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4")

    import httpx

    async def iterfile(stream_url):
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            async with client.stream("GET", stream_url) as r:
                r.raise_for_status()
                async for chunk in r.aiter_bytes(chunk_size=16384):
                    yield chunk

    stream_url = None
    # Prioritize itag 140 (m4a audio) for silence detection/visualization as it's MUCH smaller.
    # Fallback to itag 18 (360p combined) if audio-only is blocked.
    fmt = "140/bestaudio[ext=m4a]/best[ext=mp4]/18/best"
    media_type = "audio/mp4" # Browsers handle m4a as audio/mp4

    ydl_opts = inject_ydl_bypass({
        "format": fmt,
        "quiet": True,
        "no_warnings": True,
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

            async with httpx.AsyncClient(timeout=40.0, follow_redirects=True) as client:
                cobalt_response = await client.post(
                    os.getenv("COBALT_API_URL", "https://api.cobalt.tools/"),
                    json={
                        "url": url,
                        "downloadMode": "audio", # Get audio directly for analysis
                        "audioFormat": "mp3",
                    },
                    headers=cobalt_headers,
                )
                cobalt_response.raise_for_status()
                cobalt_data = cobalt_response.json()
                
                status = cobalt_data.get("status")
                if status in ("tunnel", "redirect"):
                    stream_url = cobalt_data.get("url")
                    media_type = "audio/mpeg" # Cobalt returns mp3 for audio mode
                elif status == "picker":
                    picker_items = cobalt_data.get("picker", [])
                    if picker_items:
                        # Prefer audio, then video
                        audio_items = [p for p in picker_items if "audio" in p.get("type", "")]
                        if audio_items:
                            stream_url = audio_items[0].get("url")
                            media_type = "audio/mpeg"
                        else:
                            stream_url = picker_items[0].get("url")
                            media_type = "video/mp4"
                
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
    """Serves the audio stream for a given YouTube URL with 100% reliability fallbacks."""
    if DemoService.is_demo_url(url):
        # Redirect to a known safe open source video for the demo audio
        return RedirectResponse(url="https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4")
    return await VideoService.get_audio_response(url)


# ---- Pre-Flight ---------------------------------------------------------------


def _viral_to_preflight_result(viral_suggestions: list, original_candidates: list) -> dict:
    """
    Adapter: converts ViralAgent output (List[ViralSuggestion]) into a
    PreflightResult-compatible dict for the degraded fallback response.

    Persona votes are empty (viral agent has no persona panel).
    Scores are normalised from 0–100 → 0–1.
    """
    clip_candidates = []
    total_score = 0.0

    for sug in viral_suggestions:
        raw_score = getattr(getattr(sug, "viralAnalysis", None), "score", 50) or 50
        score = round(raw_score / 100.0, 3)
        total_score += score
        captions = getattr(sug, "suggestedCaptions", [])
        clip_candidates.append({
            "start_sec": sug.start,
            "end_sec": sug.end,
            "score": score,
            "transcript": getattr(sug, "reason", ""),
            "recommendation": captions[0] if captions else getattr(sug, "reason", ""),
        })

    weighted = round(total_score / len(viral_suggestions), 3) if viral_suggestions else 0.0
    top = clip_candidates[0] if clip_candidates else {}

    return {
        "clip_candidates": clip_candidates,
        "weighted_consensus_score": weighted,
        "recommendation": (
            f"[Degraded — viral fallback] Top clip scores {top.get('score', 0):.0%}. "
            "Full audience simulation unavailable."
        ),
        "persona_votes": [],
        "audience_analysis": (
            "Persona panel could not run (full pipeline timed out or failed). "
            "Score is derived from ViralAgent SequentialAgent only."
        ),
    }


@limiter.limit("10/minute")
@app.post("/api/preflight")
async def run_preflight(request: Request, body: PreflightRequest, verified_user_id: str = Depends(get_verified_user_id)):
    user_id = verified_user_id or body.user_id
    if not _ADK_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Pre-Flight pipeline unavailable — google-adk not installed on this instance",
        )

    if not body.clip_candidates:
        raise HTTPException(status_code=422, detail="clip_candidates must contain at least one clip")

    is_premium_active = await is_user_premium(user_id)

    if not await deduct_credits(user_id, 50):
        logger.warning("Low credits for %s on /api/preflight — continuing free", user_id)

    # --- Pillar 4: Safe Demo Bypass ---
    if DemoService.is_demo_url(body.youtube_url):
        logger.info("demo_mode_triggered", user_id=user_id, url=body.youtube_url)
        cached_result = DemoService.get_cached_preflight()
        return {
            "preflight_result": cached_result,
            "strategy": "demo_cached",
            "degraded": False,
        }

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
                user_id=user_id,
            ),
            timeout=120.0,
        )
        await increment_stats(user_id, ai_run_delta=1)
        log_metric("preflight_success", 1, user_id=user_id, metadata={"strategy": "full"})
        return {
            "preflight_result": result.model_dump(),
            "strategy": "full",
            "degraded": False,
        }

    except (asyncio.TimeoutError, Exception) as primary_exc:
        # Classify the failure type for logging
        exc_type = (
            "timeout" if isinstance(primary_exc, asyncio.TimeoutError)
            else type(primary_exc).__name__
        )
        logger.warning(
            "preflight_primary_failed user=%s type=%s error=%s — attempting viral fallback",
            user_id, exc_type, str(primary_exc)[:200],
        )
        log_metric("preflight_fallback_activation", 1, user_id=user_id, metadata={"reason": exc_type})
        if exc_type == "timeout":
            log_metric("agent_timeout", 1, user_id=user_id, metadata={"pipeline": "preflight_primary"})

        # --- Strategy switch: degrade to ViralAgent (SequentialAgent, no MCP) ---
        # The ViralAgent is faster (<45s), simpler, and has no external service deps.
        # It produces a scored clip list the client can still act on.
        try:
            from agent.viral_agent import run_viral_pipeline

            first = candidates[0] if candidates else None
            video_id = VideoService.extract_video_id(body.youtube_url) or body.youtube_url

            viral_suggestions = await asyncio.wait_for(
                run_viral_pipeline(
                    youtube_url=body.youtube_url,
                    video_id=video_id,
                    transcript_text=first.transcript if first else "",
                    duration=(
                        (first.end_sec - first.start_sec) if first else 60.0
                    ),
                ),
                timeout=45.0,
            )

            if viral_suggestions:
                await increment_stats(user_id, ai_run_delta=1)
                log_metric("preflight_success", 1, user_id=user_id, metadata={"strategy": "viral_fallback"})
                return {
                    "preflight_result": _viral_to_preflight_result(
                        viral_suggestions, candidates
                    ),
                    "strategy": "viral_fallback",
                    "degraded": True,
                    "fallback_reason": exc_type,
                }

            # Fallback ran but returned nothing — fall through to error
            raise ValueError("Viral fallback returned no suggestions")

        except Exception as fb_exc:
            logger.error(
                "preflight_fallback_failed user=%s error=%s", user_id, str(fb_exc)[:200]
            )
            # Both strategies exhausted — now raise
            if isinstance(primary_exc, asyncio.TimeoutError):
                raise HTTPException(
                    status_code=504,
                    detail=(
                        "Pre-Flight analysis timed out and the viral fallback also failed. "
                        "Try again with a shorter clip."
                    ),
                )
            raise HTTPException(status_code=500, detail=str(primary_exc))


@limiter.limit("10/minute")
@app.post("/api/direct")
async def run_director(request: Request, body: DirectRequest, verified_user_id: str = Depends(get_verified_user_id)):
    user_id = verified_user_id or body.user_id
    if not _ADK_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Director pipeline unavailable — google-adk not installed",
        )

    try:
        if not await deduct_credits(user_id, 30):
            logger.warning("Low credits for %s on /api/direct — continuing free", user_id)

        result = await asyncio.wait_for(
            run_director_pipeline(
                input_text=body.input_text,
                user_id=user_id
            ),
            timeout=120.0
        )

        await increment_stats(user_id, ai_run_delta=1)
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
async def create_video(request: CreateVideoRequest, verified_user_id: str = Depends(get_verified_user_id)):
    """
    Runs: ScriptAgent → PreFlight → RenderService (Background)
    """
    user_id = verified_user_id or request.user_id
    try:
        from agent.script_agent import ScriptAgent
        agent = ScriptAgent()
        production_plan = await agent.run(request.script, request.clip_paths)

        import hashlib
        plan_hash = hashlib.sha256(
            json.dumps({"script": request.script, "clips": request.clip_paths}, sort_keys=True).encode()
        ).hexdigest()
        job_id = f"gen-{plan_hash[:16]}"

        viral_score = 0
        persona_votes = []

        if _ADK_AVAILABLE and production_plan["segments"]:
            try:
                is_premium_active = await is_user_premium(user_id)
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
                        user_id=user_id,
                    ),
                    timeout=60.0,
                )
                viral_score = result.weighted_consensus_score
                persona_votes = [v.model_dump() for v in result.persona_votes]
            except Exception as e:
                logger.warning(f"Pre-flight analysis failed in video creation flow: {e}")

        from render_worker import process_render_task
        options = {
            "production_plan": production_plan,
            "user_id": user_id,
        }

        try:
            from rq import Retry as RqRetry
            render_queue.enqueue(
                process_render_task,
                job_id,
                "generated",
                0, 0,
                user_id,
                options,
                job_id=job_id,
                job_timeout=JOB_TIMEOUT_SECONDS,
                result_ttl=JOB_RESULT_TTL_SECONDS,
                failure_ttl=JOB_FAILURE_TTL_SECONDS,
                retry=RqRetry(max=2, interval=[30, 60]),
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


# ---- ADK Studio ---------------------------------------------------------------

from services.adk_service import ADK_UPLOAD_DIR, _ADK_EXTENSIONS


class ADKGenerateRequest(BaseModel):
    script: str = Field(..., min_length=10, max_length=5000)
    voice_id: str = "en-US-Neural2-D"
    stock_query: Optional[str] = None
    uploaded_file_ids: List[str] = Field(default_factory=list)
    user_id: str
    aspect_ratio: Literal["9:16", "1:1"] = "9:16"
    quality: Literal["low", "medium", "high"] = "medium"


def _parse_script_to_segments(
    script: str, clip_paths: list[str], stock_clips: list[dict]
) -> list[dict]:
    """Split script into timed segments; round-robin assign available clips."""
    paragraphs = [p.strip() for p in script.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [script.strip()]

    all_clips = clip_paths + [c.get("url", "") for c in stock_clips if c.get("url")]
    segments = []
    for i, para in enumerate(paragraphs):
        duration = max(3.0, len(para.split()) / 2.5)
        clip = all_clips[i % len(all_clips)] if all_clips else "BLACK_FRAME"
        segments.append({"clip_path": clip, "start_sec": 0, "end_sec": duration, "text": para})
    # Legacy TTS removed in favor of services.tts_service
    return segments


@app.get("/health/live")
async def liveness():
    return {"status": "alive"}

@app.get("/health/ready")
async def readiness():
    if not db_is_ready():
        raise HTTPException(status_code=503, detail="DB_NOT_READY")
    return {"status": "ready"}

@app.get("/health/startup")
async def startup_check():
    if not _STARTUP_COMPLETE:
        raise HTTPException(status_code=503, detail="STARTING_UP")
    return {"status": "complete"}


@app.post("/api/adk/upload")
async def adk_upload(file: UploadFile = File(...), verified_user_id: str = Depends(get_verified_user_id)):
    """
    Uploads a media file for ADK Studio, persisting it in GridFS.
    This ensures horizontal scalability as all worker instances can access the file.
    """
    file_id = uuid.uuid4().hex
    original_name = file.filename or "upload"
    ext = Path(original_name).suffix.lower()
    if ext not in _ADK_EXTENSIONS:
        ext = ".mp4"
    
    filename = f"{file_id}{ext}"
    remote_path = f"adk_uploads/{verified_user_id}/{filename}"

    content = await file.read()
    if len(content) > 200 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 200 MB)")
    
    try:
        bucket = get_uploads_bucket()
        # CHANGED: Persist to GridFS instead of local disk
        await bucket.upload_from_stream(
            remote_path,
            content,
            metadata={
                "user_id": verified_user_id,
                "original_name": original_name,
                "uploaded_at": datetime.utcnow().isoformat()
            }
        )
        logger.info("ADK upload persisted to GridFS: %s (%d bytes)", remote_path, len(content))
    except Exception as e:
        logger.error("ADK upload to GridFS failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to store upload")

    return {
        "file_id": file_id, 
        "filename": original_name, 
        "size_bytes": len(content),
        "gridfs_path": remote_path
    }


@app.get("/api/adk/stock")
async def adk_stock_search(q: str = Query(..., min_length=1), per_page: int = Query(12, ge=1, le=20)):
    api_key = os.getenv("PEXELS_API_KEY")
    if not api_key:
        return {"videos": [], "notice": "Stock search requires PEXELS_API_KEY"}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://api.pexels.com/videos/search",
                params={"query": q, "per_page": per_page, "orientation": "portrait"},
                headers={"Authorization": api_key},
            )
            resp.raise_for_status()
            data = resp.json()

        videos = []
        for v in data.get("videos", []):
            files = v.get("video_files", [])
            hd = next((f for f in files if f.get("quality") == "hd" and f.get("width", 9999) <= 1080), files[0] if files else None)
            if hd:
                videos.append({
                    "id": str(v["id"]),
                    "url": hd["link"],
                    "thumbnail": v.get("image", ""),
                    "title": f"Stock {v['id']}",
                    "duration": v.get("duration", 5),
                })
        return {"videos": videos}
    except Exception as exc:
        logger.exception("Pexels search failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))


@limiter.limit("5/minute")
@app.post("/api/adk/generate")
async def adk_generate(request: Request, body: ADKGenerateRequest, user_id: str = Depends(get_verified_user_id)):
    # Pillar 1: Overload Guardrail
    if is_overloaded():
        raise HTTPException(status_code=503, detail="System currently overloaded or in maintenance.")

    if not await deduct_credits(user_id, 50):
        logger.warning("low_credits_continuing", user_id=user_id)

    from services.adk_service import ADKService
    plan = await ADKService.generate_production_plan(
        script=body.script,
        voice_id=body.voice_id,
        uploaded_file_ids=body.uploaded_file_ids,
        user_id=user_id,
        stock_query=body.stock_query,
        aspect_ratio=body.aspect_ratio
    )

    job_id = uuid.uuid4().hex
    project_svc = get_project_service()
    project_id = await project_svc.create_project(
        user_id, 
        f"Short - {datetime.now().strftime('%Y-%m-%d %H:%M')}", 
        body.script
    )
    
    await project_svc.update_project(project_id, user_id, {
        "status": "processing",
        "job_id": job_id,
        "segments": plan["segments"],
        "voice_id": body.voice_id,
        "aspect_ratio": body.aspect_ratio
    })

    from render_worker import process_render_task
    from rq import Retry as RqRetry
    render_queue.enqueue(
        process_render_task,
        job_id,
        "adk-generated",
        0, 0,
        user_id,
        {"production_plan": plan, "quality": body.quality, "aspect_ratio": body.aspect_ratio},
        job_id=job_id,
        job_timeout=JOB_TIMEOUT_SECONDS,
        result_ttl=JOB_RESULT_TTL_SECONDS,
        failure_ttl=JOB_FAILURE_TTL_SECONDS,
        retry=RqRetry(max=2, interval=[30, 60]),
    )

    from services.stats_service import increment_stats
    await increment_stats(user_id, ai_run_delta=1)
    return {
        "status": "queued",
        "job_id": job_id,
        "project_id": project_id,
        "subscribe_channel": f"export-{job_id}"
    }

# ---- Projects Endpoints ------------------------------------------------------

@app.get("/api/projects")
async def list_projects(verified_user_id: str = Depends(get_verified_user_id)):
    svc = get_project_service()
    return await svc.list_projects(verified_user_id)

@app.get("/api/projects/{project_id}")
async def get_project(project_id: str, verified_user_id: str = Depends(get_verified_user_id)):
    svc = get_project_service()
    project = await svc.get_project(project_id, verified_user_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@app.patch("/api/projects/{project_id}")
async def update_project(project_id: str, body: ProjectUpdateRequest, verified_user_id: str = Depends(get_verified_user_id)):
    svc = get_project_service()
    success = await svc.update_project(project_id, verified_user_id, body.model_dump(exclude_none=True))
    if not success:
        raise HTTPException(status_code=404, detail="Project not found or no changes made")
    return {"status": "success"}

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str, verified_user_id: str = Depends(get_verified_user_id)):
    svc = get_project_service()
    success = await svc.delete_project(project_id, verified_user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "success"}


# ---- Agent Trace (debug + demo visibility) ------------------------------------


@app.get("/api/agent-trace/{session_id}")
async def agent_trace(
    session_id: str,
    verified_user_id: str = Depends(get_verified_user_id),
):
    """
    Returns the ADK session state for a given session_id.

    Use this after any /api/analyze, /api/preflight, or /api/direct call
    to inspect the full multi-agent reasoning trace stored in Firestore.
    The session_id is returned in the X-ADK-Session-Id response header
    (see below) or in the job response body.

    Access is restricted to the session owner (user_id must match).
    """
    try:
        from agent.preflight_agent import preflight_runner
    except ImportError:
        preflight_runner = None

    # Resolve a Firestore session service from any available runner
    svc = None
    if preflight_runner and hasattr(preflight_runner, "session_service"):
        svc = preflight_runner.session_service
    if svc is None:
        raise HTTPException(status_code=503, detail="Session service unavailable — ADK not initialised")

    # Direct Firestore document read (session_id == doc ID)
    try:
        doc = await svc.db.collection(svc.collection_name).document(session_id).get()
    except Exception as exc:
        logger.error("agent_trace firestore error: %s", exc)
        raise HTTPException(status_code=500, detail="Firestore read failed")

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Session not found")

    data = doc.to_dict() or {}
    if data.get("user_id") != verified_user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    state = data.get("state", {})
    return {
        "session_id": session_id,
        "app_name": data.get("app_name"),
        "user_id": verified_user_id,
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
        # Key agent outputs surfaced for readability
        "summary": {
            "recommendation": state.get("recommendation"),
            "consensus_score": state.get("consensus_score"),
            "loop_iteration": state.get("loop_iteration"),
            "preflight_done": state.get("preflight_done"),
            "trend_keywords": state.get("trend_keywords"),
        },
        # Full raw state for deep inspection
        "state": state,
    }

# ---- Music Endpoints ---------------------------------------------------------

@app.get("/api/music")
async def list_music():
    svc = get_music_service()
    return svc.list_tracks()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
