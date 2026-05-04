from __future__ import annotations

import warnings
# Silence deprecation and future warnings from Google SDKs
warnings.filterwarnings("ignore", category=DeprecationWarning, module="authlib")

import asyncio
import json
import logging
import os
import re
import uuid
from contextlib import asynccontextmanager
from typing import List, Literal, Optional

import httpx
import requests
import uvicorn
import yt_dlp
from app.utils.youtube_auth import inject_ydl_bypass
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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
from services.signing import sign, verify
from services.stats_service import get_user_stats, increment_stats, deduct_credits, recalculate_user_stats, is_user_premium

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    from agent import (
        ClipCandidate as PreflightClipCandidate,
        run_preflight_pipeline,
        run_director_pipeline,
        run_viral_pipeline,
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


# ---- Health + meta -----------------------------------------------------------


@app.get("/")
def read_root():
    return {"status": "active", "service": "QuickAI Shorts Engine (Python)"}


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "mongo": db_is_ready(),
        "adk": _ADK_AVAILABLE,
    }


# ---- Analyze ------------------------------------------------------------------


@app.post("/api/analyze")
async def analyze_video(request: AnalyzeRequest):
    try:
        user_id = request.userId or "anonymous"
        if not await deduct_credits(user_id, 10):
            raise HTTPException(status_code=402, detail="Insufficient AI Credits. Please upgrade or top-up.")

        agent = get_viral_agent()
        transcript_text = " ".join(c.text for c in request.transcript)
        suggestions = await agent.analyze_transcript(
            transcript_text, request.duration, video_id=request.videoId
        )

        await increment_stats(
            request.userId or "anonymous",
            duration_delta=request.duration,
            ai_run_delta=1,
            project_delta=1 if request.isFirstProject else 0,
        )

        return {
            "videoId": request.videoId,
            "suggestedClips": suggestions,
            "status": "success",
        }
    except Exception as exc:
        logger.exception("/api/analyze failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ---- Export / Process ---------------------------------------------------------


@app.post("/api/process-video")
async def export_video(request: ExportRequest):
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
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

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
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    import httpx
    
    async def iterfile(stream_url):
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("GET", stream_url) as r:
                r.raise_for_status()
                async for chunk in r.aiter_bytes(chunk_size=16384):
                    yield chunk

    stream_url = None

    ydl_opts = inject_ydl_bypass({
        "format": "best[ext=mp4]", 
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
            async with httpx.AsyncClient(timeout=20.0) as client:
                cobalt_response = await client.post(
                    "https://api.cobalt.tools/",
                    json={
                        "url": url, 
                        "videoQuality": "1080", 
                        "downloadMode": "auto",
                        "videoCodec": "h264"  # Prefer H.264 for browser compatibility
                    },
                    headers={
                        "Accept": "application/json", 
                        "Content-Type": "application/json",
                        "User-Agent": "QuickAIShort-Production/1.0"
                    },
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
            media_type="video/mp4",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cross-Origin-Resource-Policy": "cross-origin",
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---- Pre-Flight ---------------------------------------------------------------


@app.post("/api/preflight")
async def run_preflight(request: PreflightRequest):
    if not _ADK_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Pre-Flight pipeline unavailable — google-adk not installed on this instance",
        )

    if not request.clip_candidates:
        raise HTTPException(status_code=422, detail="clip_candidates must contain at least one clip")

    # Check if user is on a Pro plan
    is_premium_active = await is_user_premium(request.user_id)
    if not is_premium_active and len(request.clip_candidates) > 1:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "preflight_requires_premium",
                "message": "Full 6-persona panel requires a Pro subscription.",
                "upgrade_url": "/pricing",
            },
        )

    if not await deduct_credits(request.user_id, 50):
        raise HTTPException(status_code=402, detail="Insufficient AI Credits for Pre-flight analysis.")

    candidates = [
        PreflightClipCandidate(
            start_sec=c.start_sec,
            end_sec=c.end_sec,
            score=c.score,
            transcript=c.transcript,
        )
        for c in request.clip_candidates
    ]

    try:
        result = await asyncio.wait_for(
            run_preflight_pipeline(
                youtube_url=request.youtube_url,
                clip_candidates=candidates,
                is_premium=is_premium_active,
                user_id=request.user_id,
            ),
            timeout=120.0,
        )
        await increment_stats(request.user_id, ai_run_delta=1)
        return {"preflight_result": result.model_dump()}
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Pre-Flight analysis timed out after 120 seconds. Try again with a shorter clip.",
        )
    except Exception as exc:
        logger.error("POST /api/preflight failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/direct")
async def run_director(request: DirectRequest):
    if not _ADK_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Director pipeline unavailable — google-adk not installed",
        )

    try:
        # 1. Deduct credits for Storyboard generation
        if not await deduct_credits(request.user_id, 30):
            raise HTTPException(status_code=402, detail="Insufficient credits for Storyboard generation.")

        # 2. Run the Director Agent with timeout
        result = await asyncio.wait_for(
            run_director_pipeline(
                input_text=request.input_text,
                user_id=request.user_id
            ),
            timeout=120.0
        )
        
        await increment_stats(request.user_id, ai_run_delta=1)
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
async def create_video(request: CreateVideoRequest):
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
