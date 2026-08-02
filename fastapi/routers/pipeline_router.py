"""One-click pipeline: analyze transcript -> pick top clip -> enqueue render.

Adapts the sprint's "Objective 7" to the real architecture:
- There is no server-side ASR (Whisper runs in the browser), so the caller
  supplies the transcript the editor already produced.
- Clip scoring uses the real ADK viral pipeline (run_viral_pipeline).
- Production render dispatch is Cloud Tasks via dispatch_render_task (RQ local only).
- Pipeline state lives in a Redis STRING key (pipeline:{id}, JSON) and is merged
  with the live render meta HASH (get_render_status) on read.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from core.rate_limit import limiter
from services.auth import get_verified_user_id
from services.credit_guard import refund_credits_best_effort, require_credits
from services.queue_service import is_overloaded, redis_conn
from services.render_dispatch import RenderTaskPayload, dispatch_render_task

logger = logging.getLogger(__name__)
router = APIRouter()

PIPELINE_TTL = 7200  # 2 hours
PIPELINE_CREDIT_COST = 20


class PipelineTranscriptChunk(BaseModel):
    text: str
    start: float = 0.0
    end: float = 0.0


class PipelineRunRequest(BaseModel):
    videoId: str
    transcript: List[PipelineTranscriptChunk]
    duration: float
    userId: str = "anonymous"
    runId: Optional[str] = None
    aspect_ratio: str = "9:16"
    quality: str = "medium"


def _set_pipeline(pipeline_id: str, data: dict) -> None:
    redis_conn.setex(
        f"pipeline:{pipeline_id}", PIPELINE_TTL, json.dumps(data, default=str)
    )


def _get_pipeline(pipeline_id: str) -> Optional[dict]:
    raw = redis_conn.get(f"pipeline:{pipeline_id}")
    if not raw:
        return None
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode()
    try:
        return json.loads(raw)
    except Exception:
        return None


@router.post("/api/pipeline/run")
@limiter.limit("5/minute")
async def run_pipeline(
    request: Request,
    req: PipelineRunRequest,
    verified_user_id: str = Depends(get_verified_user_id),
):
    """Analyze -> pick top clip -> enqueue render. Returns once the render is queued."""
    _ = request
    user_id = verified_user_id
    if is_overloaded():
        raise HTTPException(
            status_code=503, detail="System overloaded. Try again later."
        )
    if not req.transcript:
        raise HTTPException(
            status_code=400, detail="transcript is required for analysis"
        )

    await require_credits(
        user_id,
        PIPELINE_CREDIT_COST,
        route="pipeline",
        detail="Insufficient credits. Please upgrade your plan to continue.",
    )

    pipeline_id = uuid.uuid4().hex
    run_id = req.runId or uuid.uuid4().hex
    _set_pipeline(
        pipeline_id,
        {
            "pipeline_id": pipeline_id,
            "status": "analyzing",
            "video_id": req.videoId,
            "user_id": user_id,
            "run_id": run_id,
            "created_at": time.time(),
        },
    )

    try:
        from agent import run_viral_pipeline

        transcript_text = " ".join(c.text for c in req.transcript)
        suggestions = await run_viral_pipeline(
            transcript_text, req.duration, video_id=req.videoId, user_id=user_id
        )
    except Exception as exc:
        logger.exception("pipeline_analysis_failed pipeline_id=%s", pipeline_id)
        await refund_credits_best_effort(
            user_id,
            PIPELINE_CREDIT_COST,
            reason="analysis_failed",
            route="pipeline",
        )
        _set_pipeline(
            pipeline_id,
            {
                "pipeline_id": pipeline_id,
                "status": "failed",
                "error": "analysis failed",
                "run_id": run_id,
            },
        )
        raise HTTPException(status_code=500, detail="Pipeline analysis failed") from exc

    if not suggestions:
        await refund_credits_best_effort(
            user_id,
            PIPELINE_CREDIT_COST,
            reason="no_clips",
            route="pipeline",
        )
        _set_pipeline(
            pipeline_id,
            {
                "pipeline_id": pipeline_id,
                "status": "failed",
                "error": "No clips found",
                "run_id": run_id,
            },
        )
        raise HTTPException(
            status_code=422, detail="No viable clips found in transcript"
        )

    top = max(suggestions, key=lambda s: s.viralAnalysis.score)
    job_id = uuid.uuid4().hex
    options = {
        "aspect_ratio": req.aspect_ratio,
        "quality": req.quality,
        "captions_enabled": bool(top.suggestedCaptions),
    }
    try:
        await dispatch_render_task(
            RenderTaskPayload(
                job_id=job_id,
                video_id=req.videoId,
                start_sec=float(top.start),
                end_sec=float(top.end),
                user_id=user_id,
                options=options,
                run_id=run_id,
            )
        )
    except Exception as exc:
        logger.exception("pipeline_enqueue_failed pipeline_id=%s", pipeline_id)
        await refund_credits_best_effort(
            user_id,
            PIPELINE_CREDIT_COST,
            reason="dispatch_failed",
            route="pipeline",
        )
        _set_pipeline(
            pipeline_id,
            {
                "pipeline_id": pipeline_id,
                "status": "failed",
                "error": "enqueue failed",
                "run_id": run_id,
            },
        )
        raise HTTPException(
            status_code=503,
            detail="Render queue unavailable. Credits were not charged — try again.",
        ) from exc

    try:
        redis_conn.hset(
            f"render:meta:{job_id}",
            mapping={"credits_charged": str(PIPELINE_CREDIT_COST)},
        )
    except Exception as exc:
        logger.warning("pipeline_credits_stamp_failed job_id=%s err=%s", job_id, exc)

    _set_pipeline(
        pipeline_id,
        {
            "pipeline_id": pipeline_id,
            "status": "rendering",
            "video_id": req.videoId,
            "user_id": user_id,
            "run_id": run_id,
            "render_job_id": job_id,
            "top_clip": {
                "start": top.start,
                "end": top.end,
                "score": top.viralAnalysis.score,
            },
            "created_at": time.time(),
        },
    )
    return {
        "pipeline_id": pipeline_id,
        "status": "rendering",
        "job_id": job_id,
        "run_id": run_id,
        "top_clip": {
            "start": top.start,
            "end": top.end,
            "score": top.viralAnalysis.score,
        },
    }


@router.get("/api/pipeline/{pipeline_id}/status")
@limiter.limit("60/minute")
async def pipeline_status(
    request: Request,
    pipeline_id: str,
    verified_user_id: str = Depends(get_verified_user_id),
):
    _ = request
    data = _get_pipeline(pipeline_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    if data.get("user_id") and data["user_id"] != verified_user_id:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    render_job_id = data.get("render_job_id")
    if render_job_id:
        try:
            from services.render_queue import get_render_status

            meta = get_render_status(render_job_id)
            data["render"] = meta
            internal = meta.get("status")
            if internal == "success":
                data["status"] = "completed"
            elif internal in {"dead", "cancelled", "superseded", "duplicate"}:
                data["status"] = "failed"
        except Exception:
            pass
    return data
