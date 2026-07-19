"""One-click pipeline: analyze transcript -> pick top clip -> enqueue render.

Adapts the sprint's "Objective 7" to the real architecture:
- There is no server-side ASR (Whisper runs in the browser), so the caller
  supplies the transcript the editor already produced.
- Clip scoring uses the real ADK viral pipeline (run_viral_pipeline), NOT the
  non-existent ExtractorService.extract_clips().
- The heavy render still runs on the RQ worker via process_render_task with its
  real positional signature; we never block a worker by polling inside it.
- Pipeline state lives in a Redis STRING key (pipeline:{id}, JSON) and is merged
  with the live render meta HASH (get_render_status) on read.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services.auth import get_verified_user_id
from services.queue_service import (
    redis_conn,
    render_queue,
    JOB_TIMEOUT_SECONDS,
    JOB_RESULT_TTL_SECONDS,
    JOB_FAILURE_TTL_SECONDS,
    is_overloaded,
)

logger = logging.getLogger(__name__)
router = APIRouter()

PIPELINE_TTL = 7200  # 2 hours


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
async def run_pipeline(
    req: PipelineRunRequest,
    verified_user_id: str = Depends(get_verified_user_id),
):
    """Analyze -> pick top clip -> enqueue render. Returns once the render is queued."""
    # AuthZ: JWT user is sole tenant id — never trust body userId (TD-LEGACY-01)
    user_id = verified_user_id
    if is_overloaded():
        raise HTTPException(
            status_code=503, detail="System overloaded. Try again later."
        )
    if not req.transcript:
        raise HTTPException(
            status_code=400, detail="transcript is required for analysis"
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

    # Step 1 - clip scoring via the real ADK viral pipeline (browser transcript).
    try:
        from agent import run_viral_pipeline

        transcript_text = " ".join(c.text for c in req.transcript)
        suggestions = await run_viral_pipeline(
            transcript_text, req.duration, video_id=req.videoId, user_id=user_id
        )
    except Exception as exc:
        logger.exception("pipeline_analysis_failed pipeline_id=%s", pipeline_id)
        _set_pipeline(
            pipeline_id,
            {
                "pipeline_id": pipeline_id,
                "status": "failed",
                "error": f"analysis failed: {exc}"[:300],
                "run_id": run_id,
            },
        )
        raise HTTPException(status_code=500, detail="Pipeline analysis failed")

    if not suggestions:
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

    # Step 2 - pick the top clip by viral score.
    top = max(suggestions, key=lambda s: s.viralAnalysis.score)

    # Step 3 - enqueue the render with the REAL positional signature:
    # (job_id, video_id, start_sec, end_sec, user_id, options, run_id).
    job_id = uuid.uuid4().hex
    options = {
        "aspect_ratio": req.aspect_ratio,
        "quality": req.quality,
        "captions_enabled": bool(top.suggestedCaptions),
    }
    try:
        from render_worker import process_render_task
        from rq import Retry as RqRetry

        render_queue.enqueue(
            process_render_task,
            job_id,
            req.videoId,
            float(top.start),
            float(top.end),
            user_id,
            options,
            run_id,
            job_id=job_id,
            job_timeout=JOB_TIMEOUT_SECONDS,
            result_ttl=JOB_RESULT_TTL_SECONDS,
            failure_ttl=JOB_FAILURE_TTL_SECONDS,
            retry=RqRetry(max=2, interval=[30, 60]),
        )
    except Exception as exc:
        logger.exception("pipeline_enqueue_failed pipeline_id=%s", pipeline_id)
        _set_pipeline(
            pipeline_id,
            {
                "pipeline_id": pipeline_id,
                "status": "failed",
                "error": f"enqueue failed: {exc}"[:300],
                "run_id": run_id,
            },
        )
        raise HTTPException(status_code=503, detail="Render queue error")

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
                "reason": top.reason,
            },
            "created_at": time.time(),
        },
    )

    return {
        "pipeline_id": pipeline_id,
        "status": "rendering",
        "render_job_id": job_id,
        "top_clip": {
            "start": top.start,
            "end": top.end,
            "score": top.viralAnalysis.score,
        },
    }


@router.get("/api/pipeline/{pipeline_id}/status")
async def get_pipeline_status(
    pipeline_id: str,
    verified_user_id: str = Depends(get_verified_user_id),
):
    """Compose the pipeline record with the live render status hash."""
    data = _get_pipeline(pipeline_id)
    if not data:
        raise HTTPException(status_code=404, detail="Pipeline not found or expired")
    if data.get("user_id") and data.get("user_id") != verified_user_id:
        raise HTTPException(status_code=404, detail="Pipeline not found or expired")

    render_job_id = data.get("render_job_id")
    if render_job_id:
        from services.render_queue import get_render_status

        render_status = get_render_status(render_job_id)
        data["render"] = render_status
        rstatus = render_status.get("status")
        if rstatus == "success":
            data["status"] = "done"
            data["rendered_url"] = render_status.get("rendered_url", "")
        elif rstatus in ("dead", "cancelled"):
            data["status"] = "failed"

    return data
