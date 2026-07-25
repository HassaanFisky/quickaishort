"""Studio Dub Video API — translate + synthesize + preview artifacts."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from models.dub import DubJobCreateRequest, DubJobStatus
from services.auth import get_verified_user_id
from services.dub_service import (
    create_job,
    credit_cost_for_mode,
    dispatch_dub_processing,
    load_job,
    mark_cancelled,
    _update,
)
from services.dub_voices import supported_languages

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/studio/v1/dub", tags=["studio-dub"])


@router.get("/languages")
async def list_dub_languages(
    verified_user_id: str = Depends(get_verified_user_id),
) -> dict:
    _ = verified_user_id
    return {"languages": supported_languages()}


@router.post("", response_model=DubJobStatus)
async def start_dub_job(
    body: DubJobCreateRequest,
    verified_user_id: str = Depends(get_verified_user_id),
) -> DubJobStatus:
    if body.target_lang == "en" and body.mode != "captions_only":
        # English → English full dub is a no-op waste; allow captions_only only.
        raise HTTPException(
            status_code=400,
            detail="Choose a non-English target language for Dub Video.",
        )

    # Fail-closed credits before any Gemini/TTS spend
    cost = credit_cost_for_mode(body.mode)
    try:
        from services.stats_service import deduct_credits

        ok = await deduct_credits(verified_user_id, cost)
        if not ok:
            raise HTTPException(
                status_code=402,
                detail=f"Insufficient credits. Dub Video requires {cost} credits.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("dub_credits_gate_failed user=%s", verified_user_id)
        raise HTTPException(
            status_code=503,
            detail="Credits service unavailable. Dub Video blocked fail-closed.",
        ) from exc

    job = await create_job(body, verified_user_id)
    if job.cache_hit:
        return job

    await dispatch_dub_processing(
        job.job_id, verified_user_id, run_id=body.run_id or ""
    )
    refreshed = load_job(job.job_id) or job
    return refreshed


@router.get("/{job_id}", response_model=DubJobStatus)
async def get_dub_job(
    job_id: str,
    verified_user_id: str = Depends(get_verified_user_id),
) -> DubJobStatus:
    job = load_job(job_id)
    if job is None or job.user_id != verified_user_id:
        raise HTTPException(status_code=404, detail="Dub job not found")
    return job


@router.delete("/{job_id}", response_model=DubJobStatus)
async def cancel_dub_job(
    job_id: str,
    verified_user_id: str = Depends(get_verified_user_id),
) -> DubJobStatus:
    job = load_job(job_id)
    if job is None or job.user_id != verified_user_id:
        raise HTTPException(status_code=404, detail="Dub job not found")
    if job.status in {"ready", "degraded", "failed", "cancelled"}:
        return job
    mark_cancelled(job_id)
    return _update(job, status="cancelled", progress=100, message="Cancelled")
