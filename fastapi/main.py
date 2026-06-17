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
from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    Header,
    Query,
    Request,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    FileResponse,
    JSONResponse,
    StreamingResponse,
)
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field

try:
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from services.observability import init_sentry_for_celery

    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        integrations=[FastApiIntegration()],
        traces_sample_rate=0.1,
        environment=os.getenv("ENV", "development"),
    )

    # Initialize Sentry for Celery worker error tracking
    init_sentry_for_celery(dsn=os.getenv("SENTRY_DSN"))

except ImportError:
    print("[WARN] sentry_sdk not found, skipping initialization")
except Exception as _sentry_err:
    print(f"[ERROR] Sentry initialization failed: {_sentry_err}")

from app.utils.youtube_auth import inject_ydl_bypass
from agent.viral_agent import get_viral_agent
from models.user_stats import StatsIncrement
from services.db import (
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
from services.stats_service import (
    get_user_stats,
    increment_stats,
    deduct_credits,
    recalculate_user_stats,
    is_user_premium,
    provision_credits,
)
from services.video_service import VideoService
from services.project_service import get_project_service
from services.tts_service import get_tts_service
from services.music_service import get_music_service
from services.storage_service import get_storage_service

load_dotenv()
from services.logging import setup_logging, get_logger, correlation_id

setup_logging()
logger = get_logger("api")

from services.queue_service import is_overloaded, get_job_cost_est

_STARTUP_COMPLETE = False
_AUDIO_CACHE_DIR = Path("/tmp/audio_cache")


# Validate required environment variables at startup
def _validate_env() -> None:
    required = {
        "GEMINI_API_KEY": "AI agent pipeline will not function",
        "GOOGLE_CLOUD_PROJECT": "Firestore/GCS features (stats, credits, exports) will be disabled",
        "REDIS_URL": "Background render queue will not function",
        "NEXTAUTH_SECRET": "All protected endpoints will return 503 (or set AUTH_DISABLED=true for dev)",
        "EXPORT_SIGNING_SECRET": "Download URL signing will fail — exports unreachable",
        "PUBLIC_API_URL": "Download links sent to users will be relative paths only",
    }
    missing = [
        f"  {var}: {reason}" for var, reason in required.items() if not os.getenv(var)
    ]
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
    is_prod = os.getenv("ENVIRONMENT") == "production"
    redis_url = os.getenv("REDIS_URL")
    if is_prod and not redis_url:
        logger.warning(
            "REDIS_URL not configured in production — pubsub listener disabled."
        )
        return

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
    if cid:
        correlation_id.set(cid)

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

    if channel in (
        CHANNEL_EXPORT_PROGRESS,
        CHANNEL_EXPORT_COMPLETE,
        CHANNEL_EXPORT_FAILED,
    ):
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
                from datetime import datetime, timezone as _tz

                status = "ready" if event == "complete" else "failed"
                updates: dict = {
                    "status": status,
                    "updated_at": datetime.now(_tz.utc),
                }
                if event == "error":
                    updates["error"] = payload.get("error", "Unknown error")

                def _update_project_by_job():
                    snaps = list(
                        get_db()
                        .collection("Projects")
                        .where("job_id", "==", job_id)
                        .limit(5)
                        .stream()
                    )
                    for snap in snaps:
                        if (snap.to_dict() or {}).get("user_id") == user_id:
                            snap.reference.update(updates)
                            return True
                    return False

                updated = await asyncio.to_thread(_update_project_by_job)
                if updated:
                    logger.info("project_status_updated", job_id=job_id, status=status)
            except Exception as e:
                logger.error(
                    "project_status_update_failed", job_id=job_id, error=str(e)
                )

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
    from routers.billing import _ensure_indexes as _billing_ensure_indexes

    async def _deferred_checks():
        """Runs after the worker is live so startup probes are not blocked."""
        try:
            await run_startup_checks()
            await _billing_ensure_indexes()
            global _STARTUP_COMPLETE
            _STARTUP_COMPLETE = True
        except Exception as e:
            logger.error("startup_checks_failed", error=str(e))

    asyncio.create_task(_deferred_checks())

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

from routers.billing import router as billing_router

app.include_router(billing_router)

from routers.youtube import router as youtube_router

app.include_router(youtube_router)

from app.agents.preflight import router as preflight_router

app.include_router(preflight_router)

from routers.video import router as video_router

app.include_router(video_router)

from routers.admin_cookies import router as admin_cookies_router

app.include_router(admin_cookies_router)

from routers.pipeline_router import router as pipeline_router

app.include_router(pipeline_router)

from routers.ai_editor_router import router as ai_editor_router

app.include_router(ai_editor_router)

from routers.broll_router import router as broll_router

app.include_router(broll_router)

from routers.analytics import router as analytics_router

app.include_router(analytics_router)

from routers.email_router import router as email_router

app.include_router(email_router)


def get_real_ip(request: Request) -> str:
    """
    Extract the real client IP from X-Forwarded-For (Cloud Run LB/Vercel injects this).
    Falls back to direct remote address for local development.
    """
    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        # X-Forwarded-For: client, proxy1, proxy2 — take the leftmost (first) address
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


limiter = Limiter(key_func=get_real_ip, default_limits=["200/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
origins = [
    "http://localhost:3000",
    "https://quickaishort.online",
    "https://www.quickaishort.online",
    "https://quickaishort-ls7d.vercel.app",
]
if allowed_origins_env:
    origins.extend([o.strip() for o in allowed_origins_env.split(",") if o.strip()])
# Accept any Vercel preview deployment automatically (*.vercel.app)
_vercel_url = os.getenv("VERCEL_URL", "")
if _vercel_url:
    origins.append(f"https://{_vercel_url}")

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
        # M4 Fix: Content-Security-Policy (CSP) for secure API execution and Swagger UI support
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "img-src 'self' data: https://fastapi.tiangolo.com; "
            "frame-ancestors 'none';"
        )
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


class CaptionsPayload(BaseModel):
    enabled: bool = False
    srt_content: str = ""
    style: Optional[str] = None


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
    runId: Optional[str] = None
    aspect_ratio: Literal["9:16", "1:1"] = "9:16"
    quality: Literal["low", "medium", "high"] = "medium"
    captions: CaptionsPayload = Field(default_factory=CaptionsPayload)
    watermark_enabled: bool = False
    reframing: Optional[ReframingPayload] = None
    canvas_overlays: List[CanvasOverlayPayload] = Field(default_factory=list)
    audio_boost: float = 85.0
    playback_speed: float = 100.0
    noise_suppression: float = 20.0
    filter_name: str = "None"
    transition_enabled: bool = False
    voiceover_enabled: bool = False


class PresignedUrlRequest(BaseModel):
    filename: str
    content_type: str = "video/mp4"


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
    """Service health snapshot.

    Returns both the legacy boolean fields (`mongo`, `redis`, `adk`) for any
    existing external monitors and a richer v2 shape (`*_status`,
    `agent_ready_state`) suitable for dashboards. Top-level `status` remains
    "ok" for liveness; dependency state is exposed alongside it.
    """
    firestore_ok = db_is_ready()
    redis_ok = False
    try:
        redis_conn.ping()
        redis_ok = True
    except Exception:
        pass

    return {
        "status": "ok",
        # Legacy boolean field kept for backward compatibility with external monitors.
        "mongo": firestore_ok,
        "redis": redis_ok,
        "adk": _ADK_AVAILABLE,
        # GCS is the single storage source of truth for uploads/exports. It shares
        # one init path with Firestore in services/db.py, so this mirrors that flag:
        # if the service-account credentials are missing/bad, init fails and gcs=false.
        "gcs": firestore_ok,
        # Detailed v2 fields.
        "firestore_status": "connected" if firestore_ok else "disconnected",
        "storage_status": "connected" if firestore_ok else "disconnected",
        "redis_status": "ready" if redis_ok else "unreachable",
        "agent_ready_state": "ready" if _ADK_AVAILABLE else "unavailable",
        "build_sha": os.getenv("BUILD_SHA", "dev"),
        "sentry": "configured" if os.getenv("SENTRY_DSN") else "no-op",
    }


@app.get("/ready")
def readiness_check():
    """
    Readiness probe used by Cloud Run and load balancers.

    Returns 503 when every extractor circuit is OPEN (no tier can serve
    requests). The load balancer stops routing traffic to this instance
    until the circuits recover and /ready returns 200 again.

    Intentionally does NOT trigger lazy initialization — probing must never
    block on Redis or other I/O with sub-second probe timeouts.
    """
    import services.extractor_service as _ext_mod

    instance = _ext_mod._service_instance
    if instance is None:
        # Not yet initialized — circuits are closed by default, report ready.
        return {"status": "ready"}
    if not instance.is_ready():
        raise HTTPException(
            status_code=503,
            detail="All extraction tier circuits are open — not ready to serve",
        )
    return {"status": "ready"}


@app.get("/metrics")
def prometheus_metrics():
    """
    Prometheus-compatible metrics endpoint.

    Exposes counters and histograms for extraction, video processing, and Celery:

    Extraction metrics (from extractor_service):
      - extraction_duration_seconds (per tier, per status)
      - tier_failures_total (per tier, per error_class)
      - circuit_open_total (per tier)
      - cache_hits_total / cache_misses_total
      - extraction_exhausted_total
      - extraction_success_total (per tier)

    Video processing metrics (from observability):
      - celery_task_duration_seconds (per task_name, per status)
      - celery_task_total (per task_name, per status)
      - video_processing_duration_seconds (per filter_type, per status)
      - video_processing_output_bytes (per filter_type)
      - ffmpeg_errors_total (per error_type, per filter_type)

    Scrape interval recommendation: 15s.
    """
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
    from fastapi.responses import Response

    try:
        # This will include all registered metrics from both extractor_service and observability
        metrics_output = generate_latest()
        return Response(content=metrics_output, media_type=CONTENT_TYPE_LATEST)
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="prometheus-client not installed — add it to requirements.txt",
        )
    except Exception as e:
        logger.error("Failed to generate metrics: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate metrics",
        )


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
async def analyze_video(
    request: Request,
    body: AnalyzeRequest,
    verified_user_id: str = Depends(get_verified_user_id),
):
    try:
        user_id = verified_user_id or body.userId or "anonymous"
        if not await deduct_credits(user_id, 10):
            raise HTTPException(
                status_code=402,
                detail="Insufficient credits. Please upgrade your plan to continue.",
            )

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
        raise HTTPException(
            status_code=500, detail="Analysis failed. Please try again."
        )


# ---- Export / Process ---------------------------------------------------------


@app.post("/api/process-video")
async def export_video(
    request: ExportRequest, verified_user_id: str = Depends(get_verified_user_id)
):
    user_id = verified_user_id or request.user_id

    # Pillar 1: Overload Guardrail
    if is_overloaded():
        raise HTTPException(
            status_code=503,
            detail="System currently overloaded or in maintenance. Try again later.",
        )

    # Pillar 2: Duration Limit
    duration = request.end_sec - request.start_sec
    if duration > 180:  # Max 3 minutes per export
        raise HTTPException(
            status_code=400,
            detail="Export duration exceeds maximum limit of 180 seconds.",
        )

    if not await deduct_credits(user_id, 20):
        raise HTTPException(
            status_code=402,
            detail="Insufficient credits. Please upgrade your plan to continue.",
        )

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
            raw_meta = redis_conn.hget(
                f"segment:metadata:{request.videoId}", lookup_key
            )
            if raw_meta:
                import json as _json

                meta = _json.loads(raw_meta)
                salient_center_x = float(meta.get("cx", 0.5))
                hook_overlay = meta.get("hook", "")
                emotional_peaks = meta.get("peaks", [])
                cinematic_style = meta.get("style", "Impact")
                logger.info(
                    "autonomous_metadata_hit",
                    video_id=request.videoId,
                    peaks=emotional_peaks,
                )
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
            request.runId or "",
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
        response["error"] = (
            (job.exc_info or "").splitlines()[-1] if job.exc_info else "failed"
        )

    return response


@app.get("/api/render/status/{job_id}")
async def render_stream_status(job_id: str):
    """Rich status from the Redis Streams tracking layer."""
    from services.render_queue import get_render_status

    return get_render_status(job_id)


@app.delete("/api/render/{job_id}")
async def cancel_render(
    job_id: str,
    verified_user_id: str = Depends(get_verified_user_id),
):
    """O2: Cancel a queued/running render job.

    RQ can only drop jobs that have not started executing; a job already
    running in the worker cannot be hard-killed, so we additionally (a) mark the
    meta hash 'cancelled' and (b) bump render:runid so the worker's O1 stale-run
    guard discards the in-flight upload instead of publishing it. Idempotent.
    """
    from rq.job import Job
    from rq.exceptions import NoSuchJobError

    rq_cancelled = False
    try:
        job = Job.fetch(job_id, connection=redis_conn)
        job.cancel()
        rq_cancelled = True
    except NoSuchJobError:
        pass  # already gone — treat as success
    except Exception as exc:
        logger.warning("cancel_render_fetch_failed job_id=%s error=%s", job_id, exc)

    # render:meta:{job_id} is a HASH — update status with hset, never JSON.
    try:
        redis_conn.hset(f"render:meta:{job_id}", mapping={"status": "cancelled"})
        # Supersede any in-flight worker run for this job_id (O1 guard).
        redis_conn.set(
            f"render:runid:{job_id}", f"cancelled-{uuid.uuid4().hex}", ex=7200
        )
    except Exception as exc:
        logger.warning("cancel_render_meta_failed job_id=%s error=%s", job_id, exc)

    try:
        from services.events import publish, CHANNEL_EXPORT_FAILED

        publish(
            CHANNEL_EXPORT_FAILED,
            {
                "job_id": job_id,
                "user_id": verified_user_id,
                "error": "cancelled",
                "reason": "cancelled",
            },
        )
    except Exception as exc:
        logger.warning("cancel_render_publish_failed job_id=%s error=%s", job_id, exc)

    return {"status": "cancelled", "job_id": job_id, "rq_cancelled": rq_cancelled}


@app.get("/api/render/dead")
async def render_dead_jobs(
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
):
    """List all dead-lettered render jobs."""
    if x_admin_secret != os.getenv("ADMIN_SECRET"):
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    from services.render_queue import get_dead_jobs

    return {"dead_jobs": get_dead_jobs()}


@app.post("/api/render/retry/{job_id}")
async def render_retry_dead(
    job_id: str,
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
):
    """Re-queue a dead render job."""
    if x_admin_secret != os.getenv("ADMIN_SECRET"):
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    from services.render_queue import retry_dead_job
    from render_worker import process_render_task
    from rq import Retry as RqRetry

    requeued = retry_dead_job(job_id)
    if not requeued:
        raise HTTPException(
            status_code=404, detail="Job not found or not in dead state"
        )
    # Re-enqueue with a minimal placeholder so worker re-runs from idempotency cache
    try:
        render_queue.enqueue(
            process_render_task,
            job_id,
            "",
            0.0,
            0.0,
            "",
            {},
            uuid.uuid4().hex,
            job_id=job_id,
            job_timeout=JOB_TIMEOUT_SECONDS,
            result_ttl=JOB_RESULT_TTL_SECONDS,
            failure_ttl=JOB_FAILURE_TTL_SECONDS,
            retry=RqRetry(max=2, interval=[30, 60]),
        )
    except Exception as exc:
        logger.warning("render_retry_enqueue_failed job_id=%s error=%s", job_id, exc)
    return {"status": "requeued", "job_id": job_id}


@app.get("/api/render/dlq/stats")
async def render_dlq_stats(
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
):
    """Dead-letter queue summary statistics."""
    if x_admin_secret != os.getenv("ADMIN_SECRET"):
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    from services.render_queue import get_dlq_stats

    return get_dlq_stats()


class ReferralBonusRequest(BaseModel):
    referred_user_id: str
    referrer_user_id: str
    amount: int = 100


@app.post("/api/admin/referral-bonus")
async def reward_referral_bonus(
    body: ReferralBonusRequest,
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
):
    if x_admin_secret != os.getenv("ADMIN_SECRET"):
        raise HTTPException(status_code=403, detail="Invalid admin secret")

    from google.cloud import firestore
    from datetime import timezone

    db = get_db()
    now = datetime.now(timezone.utc)

    # 1. Update referred user's stats
    referred_ref = db.collection("UserStats").document(body.referred_user_id)
    referred_snap = referred_ref.get()
    if referred_snap.exists:
        data = referred_snap.to_dict() or {}
        new_balance = data.get("credits_balance", 0) + body.amount
        referred_ref.update({
            "credits_balance": new_balance,
            "updated_at": now,
        })
    else:
        referred_ref.set({
            "user_id": body.referred_user_id,
            "credits_balance": body.amount + 100,  # starter + bonus
            "is_pro": False,
            "is_premium": False,
            "total_projects": 0,
            "total_duration_processed": 0.0,
            "export_count": 0,
            "ai_runs": 0,
            "created_at": now,
            "updated_at": now,
        })

    # 2. Update referrer's stats
    referrer_ref = db.collection("UserStats").document(body.referrer_user_id)
    referrer_snap = referrer_ref.get()
    if referrer_snap.exists:
        rdata = referrer_snap.to_dict() or {}
        r_new_balance = rdata.get("credits_balance", 0) + body.amount
        referrer_ref.update({
            "credits_balance": r_new_balance,
            "updated_at": now,
        })
    else:
        referrer_ref.set({
            "user_id": body.referrer_user_id,
            "credits_balance": body.amount + 100,  # starter + bonus
            "is_pro": False,
            "is_premium": False,
            "total_projects": 0,
            "total_duration_processed": 0.0,
            "export_count": 0,
            "ai_runs": 0,
            "created_at": now,
            "updated_at": now,
        })

    # 3. Log to Firestore referral_conversions collection for audit
    db.collection("referral_conversions").add({
        "referred_user_id": body.referred_user_id,
        "referrer_user_id": body.referrer_user_id,
        "amount": body.amount,
        "timestamp": now,
    })

    # 4. Invalidate caches for both users
    from services.stats_service import invalidate_premium_cache
    from services.queue_service import async_redis_conn
    for uid in (body.referred_user_id, body.referrer_user_id):
        try:
            await invalidate_premium_cache(uid)
            await async_redis_conn.delete(f"stats:{uid}")
        except Exception as exc:
            logger.warning("Failed to invalidate stats cache for user %s: %s", uid, exc)

    return {"status": "success"}


# ---- Admin analytics --------------------------------------------------------


def _require_admin(secret: Optional[str]) -> None:
    if secret != os.getenv("ADMIN_SECRET"):
        raise HTTPException(status_code=403, detail="Invalid admin secret")


@app.get("/api/admin/analytics/latency")
async def admin_analytics_latency(
    agent: Optional[str] = None,
    hours: int = 24,
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
):
    _require_admin(x_admin_secret)
    from services.analytics_queries import get_agent_latency

    return await get_agent_latency(agent_name=agent, hours=hours)


@app.get("/api/admin/analytics/errors")
async def admin_analytics_errors(
    hours: int = 24,
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
):
    _require_admin(x_admin_secret)
    from services.analytics_queries import get_tool_errors

    return await get_tool_errors(hours=hours)


@app.get("/api/admin/analytics/tokens")
async def admin_analytics_tokens(
    hours: int = 24,
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
):
    _require_admin(x_admin_secret)
    from services.analytics_queries import get_token_usage

    return await get_token_usage(hours=hours)


@app.get("/api/admin/pipeline/health")
async def admin_pipeline_health(
    hours: int = 24,
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
):
    """Pipeline run success rate, avg duration, and top errors."""
    _require_admin(x_admin_secret)
    from services.pipeline_monitor import get_health

    return await get_health(hours=hours)


@app.get("/api/download/{job_id}")
async def export_download(job_id: str, user_id: str, token: str, expires: int):
    """
    Serves the rendered video directly from GCS.
    """

    # Enforce HMAC token — verify() uses hmac.compare_digest (timing-safe)
    if not verify(job_id, user_id, expires, token):
        raise HTTPException(
            status_code=403, detail="Invalid or expired download token."
        )

    remote_path = f"exports/{user_id}/{job_id}.mp4"

    try:
        blob = get_exports_bucket().blob(remote_path)
        exists = await asyncio.to_thread(blob.exists)
        if not exists:
            logger.error("export_not_found_in_gcs", path=remote_path)
            raise HTTPException(status_code=404, detail="Export not found")

        # Reload to get size metadata for Content-Length header.
        await asyncio.to_thread(blob.reload)
        file_size = blob.size or 0

        data = await asyncio.to_thread(blob.download_as_bytes)

        async def stream_gcs():
            chunk_size = 256 * 1024
            for i in range(0, len(data), chunk_size):
                yield data[i : i + chunk_size]

        return StreamingResponse(
            stream_gcs(),
            media_type="video/mp4",
            headers={
                "Content-Disposition": f'attachment; filename="{job_id}.mp4"',
                "Content-Length": str(file_size),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("gcs_download_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Internal storage error")


# ---- Stats --------------------------------------------------------------------


@app.get("/api/stats")
async def stats_endpoint(
    verified_user_id: str = Depends(get_verified_user_id),
    sync: bool = False,
):
    """Returns stats for the authenticated user only."""
    await provision_credits(verified_user_id, amount=100)
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
    """
    Returns video metadata for a YouTube URL.

    Priority:
      1. YouTube oEmbed API  — no key required, always fast, works for all public videos
      2. YouTube Data API v3 — adds duration when YOUTUBE_API_KEY env var is set
      3. Static fallback     — returns thumbnail from i.ytimg.com when everything else fails

    yt-dlp is intentionally NOT used here: it is slow, fails on bot-detected videos,
    and the pipeline only needs title + thumbnail + duration at submission time.
    """
    video_id = _require_youtube_url(url)
    thumb_fallback = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

    # ── Tier 1: YouTube oEmbed (no API key, sub-second, public videos only) ──
    oembed_title: str | None = None
    oembed_thumb: str | None = None
    try:
        oembed_url = (
            f"https://www.youtube.com/oembed"
            f"?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D{video_id}"
            f"&format=json"
        )
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(oembed_url)
        if resp.status_code == 200:
            oe = resp.json()
            oembed_title = oe.get("title")
            oembed_thumb = oe.get("thumbnail_url")
    except Exception as exc:
        logger.debug("oEmbed failed for %s: %s", video_id, exc)

    # ── Tier 2: YouTube Data API v3 (adds precise duration) ──────────────────
    api_key = os.environ.get("YOUTUBE_API_KEY")
    if api_key:
        try:
            api_url = (
                f"https://www.googleapis.com/youtube/v3/videos"
                f"?part=snippet,contentDetails&id={video_id}&key={api_key}"
            )
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    api_url, headers={"Referer": "https://www.quickaishort.online"}
                )
                resp.raise_for_status()
                data = resp.json()

            if data.get("items"):
                item = data["items"][0]
                duration_iso = item["contentDetails"]["duration"]
                duration_sec = 0
                m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration_iso)
                if m:
                    h, mn, s = m.groups()
                    duration_sec = int(h or 0) * 3600 + int(mn or 0) * 60 + int(s or 0)
                thumbs = item["snippet"]["thumbnails"]
                best = thumbs.get(
                    "maxres", thumbs.get("high", thumbs.get("default", {}))
                )
                return {
                    "id": video_id,
                    "title": item["snippet"]["title"],
                    "duration": duration_sec,
                    "thumbnail": best.get("url", thumb_fallback),
                    "formats": [],
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                    "source": "youtube_data_api",
                }
        except Exception as exc:
            logger.warning("YouTube Data API failed for %s: %s", video_id, exc)

    # ── Tier 3: Return oEmbed data (or static fallback) ──────────────────────
    # Never return YOUTUBE_FETCH_FAILED for public videos — oEmbed always works.
    return {
        "id": video_id,
        "title": oembed_title or "YouTube Video",
        "duration": 0,
        "thumbnail": oembed_thumb or thumb_fallback,
        "formats": [],
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "source": "oembed" if oembed_title else "fallback",
    }


@app.get("/api/proxy")
async def proxy_video(url: str):
    _require_youtube_url(url)

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
    media_type = "audio/mp4"  # Browsers handle m4a as audio/mp4

    ydl_opts = inject_ydl_bypass(
        {
            "format": fmt,
            "quiet": True,
            "no_warnings": True,
        }
    )

    try:
        # We run blocking yt-dlp in a thread to avoid stalling the event loop
        loop = asyncio.get_event_loop()

        def _extract():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(url, download=False)

        info = await loop.run_in_executor(None, _extract)
        stream_url = info.get("url")
    except Exception as exc:
        logger.warning(f"yt-dlp failed in proxy, trying Invidious fallback: {exc}")
        video_id_match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11})", url)
        v_id = video_id_match.group(1) if video_id_match else None
        if v_id:
            for instance in ["yewtu.be", "invidious.kavin.rocks", "vid.priv.au"]:
                try:
                    async with httpx.AsyncClient(
                        timeout=5.0, follow_redirects=True
                    ) as client:
                        inv_resp = await client.get(
                            f"https://{instance}/api/v1/videos/{v_id}",
                            params={"fields": "adaptiveFormats,formatStreams"},
                        )
                        inv_resp.raise_for_status()
                        inv_data = inv_resp.json()
                        for fmt in inv_data.get("formatStreams", []):
                            if fmt.get("itag") == "18":
                                stream_url = fmt.get("url")
                                media_type = "video/mp4"
                                break
                        if not stream_url:
                            audio_fmts = [
                                f
                                for f in inv_data.get("adaptiveFormats", [])
                                if "audio" in f.get("type", "")
                            ]
                            if audio_fmts:
                                best = max(
                                    audio_fmts, key=lambda x: int(x.get("bitrate", 0))
                                )
                                stream_url = best.get("url")
                                media_type = "audio/mp4"
                        if stream_url:
                            logger.info(f"Invidious fallback succeeded via {instance}")
                            break
                except Exception as inv_exc:
                    logger.warning(f"Invidious {instance} failed: {inv_exc}")
                    continue
        if not stream_url:
            raise HTTPException(
                status_code=503,
                detail="Video stream unavailable. Please try again later.",
            )

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
        logger.exception("/api/proxy stream error: %s", exc)
        raise HTTPException(
            status_code=500, detail="Stream unavailable. Please try again."
        )


@app.head("/api/proxy-video")
async def proxy_video_stream_head(url: str):
    """
    Immediate HEAD response — lets browsers probe the endpoint without triggering
    a full yt-dlp extraction. Returns Accept-Ranges so browsers know seeking works.
    """
    _require_youtube_url(url)
    return Response(
        status_code=200,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Type": "video/mp4",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range, Content-Type",
            "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
            "Cross-Origin-Resource-Policy": "cross-origin",
        },
    )


@app.get("/api/proxy-video")
async def proxy_video_stream(url: str, request: Request):
    """
    Range-aware YouTube video proxy.

    YouTube CDN signed URLs are IP-bound to the server that requested them.
    Redirect-to-CDN is not viable — the browser IP != Cloud Run IP → 403.
    Cloud Run resolves the URL with yt-dlp then proxies bytes from the same IP.
    Range headers are forwarded so the browser can seek and detect duration.

    Two-tier extraction:
      Tier 1 — combined formats (18/22) so a single URL serves audio+video.
      Tier 2 — any best MP4 ≤720p if combined formats are unavailable.
    """
    _require_youtube_url(url)

    video_id_match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11})", url)
    v_id = video_id_match.group(1) if video_id_match else None
    if not v_id:
        raise HTTPException(status_code=400, detail="Could not parse video ID from URL")

    stream_url: str | None = None
    found_format_id: str | None = None

    # ── yt-dlp extraction — two format tiers, 45 s timeout each ──────────
    _tiers = [
        # Tier 1: itag 18 (360p+audio) or 22 (720p+audio) — single muxed file.
        ("18/22/best[ext=mp4][acodec!=none]/best[ext=mp4]/best", "combined"),
        # Tier 2: anything ≤720p MP4 — last resort if combined not available.
        ("best[height<=720][ext=mp4]/best[ext=mp4]/best", "fallback"),
    ]

    loop = asyncio.get_event_loop()

    for fmt, tier_label in _tiers:
        if stream_url:
            break

        ydl_opts = inject_ydl_bypass(
            {
                "format": fmt,
                "quiet": True,
                "no_warnings": True,
                "socket_timeout": 20,
                "retries": 2,
            }
        )

        try:

            def _extract(opts=ydl_opts):
                with yt_dlp.YoutubeDL(opts) as ydl:
                    return ydl.extract_info(url, download=False)

            info = await asyncio.wait_for(
                loop.run_in_executor(None, _extract), timeout=45.0
            )

            vid_duration = info.get("duration", 0)
            if vid_duration and vid_duration > 1800:
                raise HTTPException(
                    status_code=400,
                    detail="Videos longer than 30 minutes are not supported.",
                )

            candidate = info.get("url")
            if not candidate:
                raise ValueError("yt-dlp returned no URL")

            stream_url = candidate
            found_format_id = info.get("format_id", "?")
            logger.info(
                "proxy-video [%s] yt-dlp ok — fmt=%s vid=%s",
                tier_label,
                found_format_id,
                v_id,
            )

        except HTTPException:
            raise
        except asyncio.TimeoutError:
            logger.warning(
                "proxy-video [%s] yt-dlp timed out (45 s) vid=%s", tier_label, v_id
            )
        except Exception as exc:
            logger.warning(
                "proxy-video [%s] yt-dlp error vid=%s: %s", tier_label, v_id, exc
            )

    if not stream_url:
        logger.error("proxy-video all tiers exhausted for vid=%s", v_id)
        raise HTTPException(
            status_code=503,
            detail="Video stream unavailable — YouTube may be blocking server access. Try again in a moment.",
        )

    # ── Proxy the stream with full Range-request forwarding ──────────────
    # Using the same Cloud Run IP that obtained the signed URL — YouTube CDN
    # accepts it even though the URL contains an embedded server IP.
    range_header = request.headers.get("range")
    upstream_headers: dict[str, str] = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.youtube.com/",
        "Origin": "https://www.youtube.com",
    }
    if range_header:
        upstream_headers["Range"] = range_header

    client = httpx.AsyncClient(
        timeout=httpx.Timeout(30.0, read=180.0),
        follow_redirects=True,
    )
    try:
        req = client.build_request("GET", stream_url, headers=upstream_headers)
        upstream = await client.send(req, stream=True)

        if upstream.status_code not in (200, 206):
            await upstream.aclose()
            await client.aclose()
            logger.error(
                "proxy-video upstream HTTP %s for vid=%s fmt=%s",
                upstream.status_code,
                v_id,
                found_format_id,
            )
            raise HTTPException(
                status_code=502,
                detail=f"Upstream CDN returned HTTP {upstream.status_code} — please try again.",
            )

        resp_headers: dict[str, str] = {
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range, Content-Type",
            "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Cache-Control": "no-store",
        }
        for hdr in ("Content-Length", "Content-Range", "Content-Type"):
            if hdr.lower() in upstream.headers:
                resp_headers[hdr] = upstream.headers[hdr.lower()]

        logger.info(
            "proxy-video streaming vid=%s fmt=%s status=%s range=%s",
            v_id,
            found_format_id,
            upstream.status_code,
            range_header or "none",
        )

        async def stream_body():
            try:
                async for chunk in upstream.aiter_bytes(32768):
                    yield chunk
            finally:
                await upstream.aclose()
                await client.aclose()

        return StreamingResponse(
            stream_body(),
            status_code=upstream.status_code,
            media_type="video/mp4",
            headers=resp_headers,
        )

    except HTTPException:
        await client.aclose()
        raise
    except Exception as exc:
        await client.aclose()
        logger.exception("proxy-video stream error vid=%s: %s", v_id, exc)
        raise HTTPException(status_code=500, detail="Stream error — please try again.")


@app.get("/api/audio")
async def get_audio(url: str = Query(...)):
    """Serves the audio stream for a given YouTube URL with 100% reliability fallbacks."""
    from services.cobalt_client import download_audio as cobalt_download

    video_id = VideoService.extract_video_id(url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")

    # ── Redis audio cache ─────────────────────────────────────────────────────
    cache_key = f"audio_cache:{video_id}"
    try:
        cached_bytes = redis_conn.get(cache_key)
        if cached_bytes:
            cached_file = Path(
                cached_bytes.decode()
                if isinstance(cached_bytes, bytes)
                else cached_bytes
            )
            if cached_file.exists() and cached_file.stat().st_size > 10000:
                logger.info("audio [cache HIT] vid=%s", video_id)
                return FileResponse(path=cached_file, media_type="audio/mpeg")
            redis_conn.delete(cache_key)
            logger.info("audio [cache STALE] vid=%s — re-extracting", video_id)
    except Exception as _rc_err:
        logger.warning("audio [cache] Redis lookup error vid=%s: %s", video_id, _rc_err)

    _AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmpdir = tempfile.mkdtemp()
    output_path = Path(tmpdir) / f"{video_id}.m4a"

    success = False
    last_error = ""

    # TIER 0 — Cobalt public API (fast, no cookies, no proxy needed).
    try:
        cobalt_path = Path(tmpdir) / f"{video_id}_cobalt.mp3"
        if await cobalt_download(url, str(cobalt_path)):
            output_path = cobalt_path
            success = True
            logger.info("audio [cobalt] success vid=%s", video_id)
        else:
            last_error = "cobalt returned no audio"
            logger.info(
                "audio [cobalt] failed vid=%s — falling back to yt-dlp", video_id
            )
    except Exception as _cobalt_exc:
        last_error = f"cobalt error: {_cobalt_exc}"
        logger.warning("audio [cobalt] exception vid=%s: %s", video_id, _cobalt_exc)

    # TIER 1 — yt-dlp with two client-set attempts (no player_skip).
    # Attempt A: tv_embedded + ios — most reliable without PO token on server IPs.
    # Attempt B: android + web + web_creator — different client stack as retry.
    _YDL_CLIENT_SETS = [
        ("A", ["tv_embedded", "ios"]),
        ("B", ["android", "web", "web_creator"]),
    ]
    loop = asyncio.get_event_loop()

    for _attempt_label, _clients in _YDL_CLIENT_SETS:
        if success:
            break
        # Remove stale partial file from a previous attempt.
        if output_path.exists():
            output_path.unlink(missing_ok=True)

        try:
            ydl_opts = inject_ydl_bypass(
                {
                    "format": "bestaudio/best",
                    "outtmpl": str(output_path),
                    "quiet": True,
                    "no_warnings": True,
                    "extractor_args": {"youtube": {"player_client": _clients}},
                    "socket_timeout": 30,
                    "retries": 2,
                }
            )

            logger.info(
                "audio [yt-dlp/%s] starting clients=%s vid=%s",
                _attempt_label,
                _clients,
                video_id,
            )

            def _run_yt(opts=ydl_opts):
                with yt_dlp.YoutubeDL(opts) as ydl:
                    ydl.download([url])

            await asyncio.wait_for(loop.run_in_executor(None, _run_yt), timeout=60.0)

            if output_path.exists() and output_path.stat().st_size > 10000:
                success = True
                logger.info(
                    "audio [yt-dlp/%s] success vid=%s size=%d",
                    _attempt_label,
                    video_id,
                    output_path.stat().st_size,
                )
            else:
                last_error = f"yt-dlp/{_attempt_label} produced empty file"
                logger.warning(
                    "audio [yt-dlp/%s] empty output vid=%s", _attempt_label, video_id
                )
        except asyncio.TimeoutError:
            last_error = f"yt-dlp/{_attempt_label} timed out (60s)"
            logger.warning("audio [yt-dlp/%s] timeout vid=%s", _attempt_label, video_id)
        except Exception as e:
            last_error = f"yt-dlp/{_attempt_label} failed: {e}"
            logger.warning(
                "audio [yt-dlp/%s] error vid=%s: %s", _attempt_label, video_id, e
            )

    # NOTE: Cobalt v10 now requires JWT auth (error.api.auth.jwt.missing) and
    # Piped/Invidious instances are down as of 2026-05. All removed to avoid
    # wasting 45+ seconds on guaranteed failures before the final 503.

    if not success:
        shutil.rmtree(tmpdir, ignore_errors=True)
        logger.error(
            "audio all tiers failed vid=%s last_error=%s", video_id, last_error
        )
        # Surface a specific message so the frontend shows the real cause.
        _err_lower = last_error.lower()
        if "sign in" in _err_lower or "bot" in _err_lower or "confirm" in _err_lower:
            _detail = (
                "Bot detection: this video requires browser cookies to access from our servers. "
                "Try a different video — most videos work without cookies."
            )
        elif "video unavailable" in _err_lower or "unavailable" in _err_lower:
            _detail = "This video is unavailable — it may be private, deleted, or region-locked."
        elif "timed out" in _err_lower:
            _detail = (
                "Audio extraction timed out — video may be too long or slow to access."
            )
        else:
            _detail = "Audio extraction failed — server could not download this video. Try a different video or try again."
        raise HTTPException(status_code=503, detail=_detail)

    # ── Persist to cache so next request is instant ───────────────────────────
    cache_path = _AUDIO_CACHE_DIR / f"{video_id}.mp3"
    try:
        shutil.copy2(str(output_path), str(cache_path))
        redis_conn.setex(cache_key, 3600, str(cache_path))
        logger.info("audio [cache SET] vid=%s", video_id)
    except Exception as _cw_err:
        logger.warning("audio [cache SET] failed vid=%s: %s", video_id, _cw_err)

    return FileResponse(
        path=output_path,
        media_type="audio/mpeg",
        background=BackgroundTask(lambda: shutil.rmtree(tmpdir, ignore_errors=True)),
    )


# ---- Pre-Flight ---------------------------------------------------------------


def _viral_to_preflight_result(
    viral_suggestions: list, original_candidates: list
) -> dict:
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
        clip_candidates.append(
            {
                "start_sec": sug.start,
                "end_sec": sug.end,
                "score": score,
                "transcript": getattr(sug, "reason", ""),
                "recommendation": (
                    captions[0] if captions else getattr(sug, "reason", "")
                ),
            }
        )

    weighted = (
        round(total_score / len(viral_suggestions), 3) if viral_suggestions else 0.0
    )
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
async def run_preflight(
    request: Request,
    body: PreflightRequest,
    verified_user_id: str = Depends(get_verified_user_id),
):
    user_id = verified_user_id or body.user_id
    if not _ADK_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Pre-Flight pipeline unavailable — google-adk not installed on this instance",
        )

    if not body.clip_candidates:
        raise HTTPException(
            status_code=422, detail="clip_candidates must contain at least one clip"
        )

    is_premium_active = await is_user_premium(user_id)

    if not await deduct_credits(user_id, 50):
        raise HTTPException(
            status_code=402,
            detail="Insufficient credits. Please upgrade your plan to continue.",
        )

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
        log_metric(
            "preflight_success", 1, user_id=user_id, metadata={"strategy": "full"}
        )
        return {
            "preflight_result": result.model_dump(),
            "strategy": "full",
            "degraded": False,
        }

    except (asyncio.TimeoutError, Exception) as primary_exc:
        # Classify the failure type for logging
        exc_type = (
            "timeout"
            if isinstance(primary_exc, asyncio.TimeoutError)
            else type(primary_exc).__name__
        )
        logger.warning(
            "preflight_primary_failed user=%s type=%s error=%s — attempting viral fallback",
            user_id,
            exc_type,
            str(primary_exc)[:200],
        )
        log_metric(
            "preflight_fallback_activation",
            1,
            user_id=user_id,
            metadata={"reason": exc_type},
        )
        if exc_type == "timeout":
            log_metric(
                "agent_timeout",
                1,
                user_id=user_id,
                metadata={"pipeline": "preflight_primary"},
            )

        # --- Strategy switch: degrade to ViralAgent (SequentialAgent, no MCP) ---
        # The ViralAgent is faster (<45s), simpler, and has no external service deps.
        # It produces a scored clip list the client can still act on.
        try:
            from agent.viral_agent import run_viral_pipeline

            first = candidates[0] if candidates else None
            video_id = (
                VideoService.extract_video_id(body.youtube_url) or body.youtube_url
            )

            viral_suggestions = await asyncio.wait_for(
                run_viral_pipeline(
                    youtube_url=body.youtube_url,
                    video_id=video_id,
                    transcript_text=first.transcript if first else "",
                    duration=((first.end_sec - first.start_sec) if first else 60.0),
                ),
                timeout=45.0,
            )

            if viral_suggestions:
                await increment_stats(user_id, ai_run_delta=1)
                log_metric(
                    "preflight_success",
                    1,
                    user_id=user_id,
                    metadata={"strategy": "viral_fallback"},
                )
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
async def run_director(
    request: Request,
    body: DirectRequest,
    verified_user_id: str = Depends(get_verified_user_id),
):
    user_id = verified_user_id or body.user_id
    if not _ADK_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Director pipeline unavailable — google-adk not installed",
        )

    try:
        if not await deduct_credits(user_id, 30):
            raise HTTPException(
                status_code=402,
                detail="Insufficient credits. Please upgrade your plan to continue.",
            )

        result = await asyncio.wait_for(
            run_director_pipeline(input_text=body.input_text, user_id=user_id),
            timeout=120.0,
        )

        await increment_stats(user_id, ai_run_delta=1)
        return {"director_result": result}
    except HTTPException:
        # Re-raise HTTP exceptions (like 402) so they aren't swallowed by the broad except
        raise
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504, detail="Storyboard generation timed out after 120 seconds."
        )
    except Exception as exc:
        logger.error("POST /api/direct failed: %s", exc)
        raise HTTPException(
            status_code=500, detail="Storyboard generation failed. Please try again."
        )


@app.post("/api/create-video")
async def create_video(
    request: CreateVideoRequest, verified_user_id: str = Depends(get_verified_user_id)
):
    """
    Runs: ScriptAgent → PreFlight → RenderService (Background)
    """
    user_id = verified_user_id or request.user_id
    try:
        from agent.script_agent import ScriptAgent

        agent = ScriptAgent()
        production_plan = await agent.run(request.script, request.clip_paths)

        job_id = f"gen-{uuid.uuid4().hex}"

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
                        transcript=hero["text"],
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
                logger.warning(
                    f"Pre-flight analysis failed in video creation flow: {e}"
                )

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
                0,
                0,
                user_id,
                options,
                uuid.uuid4().hex,
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
        raise HTTPException(
            status_code=500, detail="Video creation failed. Please try again."
        )


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
        segments.append(
            {"clip_path": clip, "start_sec": 0, "end_sec": duration, "text": para}
        )
    # Legacy TTS removed in favor of services.tts_service
    return segments


@app.get("/health/live")
async def liveness():
    return {"status": "alive"}


@app.get("/health/ready")
async def readiness():
    # Relaxed DB check: remain ready even if DB is transiently offline
    return {"status": "ready"}


@app.get("/health/startup")
async def startup_check():
    if not _STARTUP_COMPLETE:
        raise HTTPException(status_code=503, detail="STARTING_UP")
    return {"status": "complete"}


@app.post("/api/adk/upload")
async def adk_upload(
    file: UploadFile = File(...), verified_user_id: str = Depends(get_verified_user_id)
):
    """
    Uploads a media file for ADK Studio, persisting it in GCS.
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
        blob = get_uploads_bucket().blob(remote_path)
        await asyncio.to_thread(
            blob.upload_from_string,
            content,
            content_type=file.content_type or "application/octet-stream",
        )
        logger.info(
            "ADK upload persisted to GCS: %s (%d bytes)", remote_path, len(content)
        )
    except Exception as e:
        logger.error("ADK upload to GCS failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to store upload")

    return {
        "file_id": file_id,
        "filename": original_name,
        "size_bytes": len(content),
        "gcs_path": remote_path,
    }


@app.get("/api/adk/stock")
async def adk_stock_search(
    q: str = Query(..., min_length=1), per_page: int = Query(12, ge=1, le=20)
):
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
            hd = next(
                (
                    f
                    for f in files
                    if f.get("quality") == "hd" and f.get("width", 9999) <= 1080
                ),
                files[0] if files else None,
            )
            if hd:
                videos.append(
                    {
                        "id": str(v["id"]),
                        "url": hd["link"],
                        "thumbnail": v.get("image", ""),
                        "title": f"Stock {v['id']}",
                        "duration": v.get("duration", 5),
                    }
                )
        return {"videos": videos}
    except Exception as exc:
        logger.exception("Pexels search failed: %s", exc)
        raise HTTPException(
            status_code=502, detail="Stock video search unavailable. Please try again."
        )


class ADKEnhanceRequest(BaseModel):
    topic: str = Field(..., min_length=5, max_length=1000)


@app.post("/api/adk/enhance")
@limiter.limit("5/minute")
async def adk_enhance(
    request: Request,
    body: ADKEnhanceRequest,
    _user_id: str = Depends(get_verified_user_id),
):
    """Rewrites a simple topic into a viral script using the ScriptAgent."""
    try:
        from agent.script_agent import ScriptAgent

        agent = ScriptAgent()
        enhanced_text = await agent.enhance_script(body.topic)
        return {"enhanced_script": enhanced_text}
    except Exception as e:
        logger.error(f"ADK Enhance failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to enhance script")


@app.post("/api/adk/generate")
async def adk_generate(
    request: Request,
    body: ADKGenerateRequest,
    user_id: str = Depends(get_verified_user_id),
):
    # Pillar 1: Overload Guardrail
    if is_overloaded():
        raise HTTPException(
            status_code=503, detail="System currently overloaded or in maintenance."
        )

    if not await deduct_credits(user_id, 50):
        logger.warning("low_credits_continuing", user_id=user_id)

    from services.adk_service import ADKService

    plan = await ADKService.generate_production_plan(
        script=body.script,
        voice_id=body.voice_id,
        uploaded_file_ids=body.uploaded_file_ids,
        user_id=user_id,
        stock_query=body.stock_query,
        aspect_ratio=body.aspect_ratio,
    )

    job_id = uuid.uuid4().hex
    project_svc = get_project_service()
    project_id = await project_svc.create_project(
        user_id, f"Short - {datetime.now().strftime('%Y-%m-%d %H:%M')}", body.script
    )

    await project_svc.update_project(
        project_id,
        user_id,
        {
            "status": "processing",
            "job_id": job_id,
            "segments": plan["segments"],
            "voice_id": body.voice_id,
            "aspect_ratio": body.aspect_ratio,
        },
    )

    from render_worker import process_render_task
    from rq import Retry as RqRetry

    render_queue.enqueue(
        process_render_task,
        job_id,
        "adk-generated",
        0,
        0,
        user_id,
        {
            "production_plan": plan,
            "quality": body.quality,
            "aspect_ratio": body.aspect_ratio,
        },
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
        "subscribe_channel": f"export-{job_id}",
    }


# ---- Projects Endpoints ------------------------------------------------------


@app.get("/api/projects")
async def list_projects(verified_user_id: str = Depends(get_verified_user_id)):
    svc = get_project_service()
    return await svc.list_projects(verified_user_id)


@app.get("/api/projects/{project_id}")
async def get_project(
    project_id: str, verified_user_id: str = Depends(get_verified_user_id)
):
    svc = get_project_service()
    project = await svc.get_project(project_id, verified_user_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@app.patch("/api/projects/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectUpdateRequest,
    verified_user_id: str = Depends(get_verified_user_id),
):
    svc = get_project_service()
    success = await svc.update_project(
        project_id, verified_user_id, body.model_dump(exclude_none=True)
    )
    if not success:
        raise HTTPException(
            status_code=404, detail="Project not found or no changes made"
        )
    return {"status": "success"}


@app.delete("/api/projects/{project_id}")
async def delete_project(
    project_id: str, verified_user_id: str = Depends(get_verified_user_id)
):
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
        raise HTTPException(
            status_code=503, detail="Session service unavailable — ADK not initialised"
        )

    try:
        session = await svc.get_session(
            app_name="QuickAIShort_PreFlight",
            user_id=verified_user_id,
            session_id=session_id,
        )
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found.")
        state = session.state if hasattr(session, "state") else {}
        return {
            "session_id": session_id,
            "state": state,
            "events": (
                [e.model_dump() for e in session.events]
                if hasattr(session, "events")
                else []
            ),
            "summary": {
                "recommendation": state.get("recommendation"),
                "consensus_score": state.get("consensus_score"),
                "loop_iteration": state.get("loop_iteration"),
                "preflight_done": state.get("preflight_done"),
                "trend_keywords": state.get("trend_keywords"),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Trace fetch error session %s: %s", session_id, e)
        raise HTTPException(status_code=500, detail="Could not retrieve session trace.")


# ---- Presigned upload URL ----------------------------------------------------


@app.post("/api/video/presigned-url")
async def get_presigned_upload_url(
    body: PresignedUrlRequest,
    verified_user_id: str = Depends(get_verified_user_id),
):
    """Generate a GCS V4 presigned PUT URL for direct browser-to-GCS upload.

    The browser PUTs the video file directly; the backend never receives the
    raw stream.  On completion the client passes `gcs_path` as the videoId
    in the export request so the render worker reads directly from GCS.
    """
    job_id = uuid.uuid4().hex
    ext = Path(body.filename).suffix.lower() or ".mp4"
    remote_path = f"uploads/{verified_user_id}/{job_id}{ext}"

    try:
        storage = get_storage_service()
        url = await storage.generate_presigned_upload_url(
            remote_path=remote_path,
            content_type=body.content_type,
            expiration_minutes=15,
        )
    except RuntimeError as exc:
        logger.error("presigned_url_failed user=%s: %s", verified_user_id, exc)
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.exception("presigned_url_unexpected user=%s: %s", verified_user_id, exc)
        raise HTTPException(status_code=500, detail="Could not generate upload URL")

    return {
        "presigned_url": url,
        "gcs_path": f"gs://{remote_path}",
        "job_id": job_id,
        "expires_in_seconds": 900,
    }


# ---- Music Endpoints ---------------------------------------------------------


@app.get("/api/music")
async def list_music():
    svc = get_music_service()
    return svc.list_tracks()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
