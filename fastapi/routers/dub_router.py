"""Studio Dub Video API — translate + synthesize + preview artifacts."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from core.rate_limit import limiter
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
@limiter.limit("60/minute")
async def list_dub_languages(
    request: Request,
    verified_user_id: str = Depends(get_verified_user_id),
) -> dict:
    _ = request
    _ = verified_user_id
    return {"languages": supported_languages()}


@router.post("", response_model=DubJobStatus)
@limiter.limit("10/minute")
async def start_dub_job(
    request: Request,
    body: DubJobCreateRequest,
    verified_user_id: str = Depends(get_verified_user_id),
) -> DubJobStatus:
    _ = request
    if body.target_lang == "en" and body.mode != "captions_only":
        # English → English full dub is a no-op waste; allow captions_only only.
        raise HTTPException(
            status_code=400,
            detail="Choose a non-English target language for Dub Video.",
        )

    # Create/reuse job first so cache hits never burn credits.
    job = await create_job(body, verified_user_id)
    if job.cache_hit:
        return job

    # Fail-closed credits only for new billable work (Gemini/TTS spend).
    cost = credit_cost_for_mode(body.mode)
    try:
        from services.stats_service import deduct_credits

        ok = await deduct_credits(verified_user_id, cost)
        if not ok:
            mark_cancelled(job.job_id)
            raise HTTPException(
                status_code=402,
                detail=f"Insufficient credits. Dub Video requires {cost} credits.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        mark_cancelled(job.job_id)
        logger.exception("dub_credits_gate_failed user=%s", verified_user_id)
        raise HTTPException(
            status_code=503,
            detail="Credits service unavailable. Dub Video blocked fail-closed.",
        ) from exc

    job = _update(job, credits_charged=cost)
    try:
        await dispatch_dub_processing(
            job.job_id, verified_user_id, run_id=body.run_id or ""
        )
    except Exception as exc:
        from services.credit_guard import refund_credits_best_effort

        mark_cancelled(job.job_id)
        await refund_credits_best_effort(
            verified_user_id,
            cost,
            reason="dispatch_failed",
            route="dub",
        )
        logger.exception("dub_dispatch_failed job=%s", job.job_id)
        raise HTTPException(
            status_code=503,
            detail="Dub queue unavailable. Credits were not charged — try again.",
        ) from exc
    refreshed = load_job(job.job_id) or job
    return refreshed


@router.get("/{job_id}", response_model=DubJobStatus)
@limiter.limit("60/minute")
async def get_dub_job(
    request: Request,
    job_id: str,
    verified_user_id: str = Depends(get_verified_user_id),
) -> DubJobStatus:
    _ = request
    job = load_job(job_id)
    if job is None or job.user_id != verified_user_id:
        raise HTTPException(status_code=404, detail="Dub job not found")
    return job


@router.delete("/{job_id}", response_model=DubJobStatus)
@limiter.limit("20/minute")
async def cancel_dub_job(
    request: Request,
    job_id: str,
    verified_user_id: str = Depends(get_verified_user_id),
) -> DubJobStatus:
    _ = request
    job = load_job(job_id)
    if job is None or job.user_id != verified_user_id:
        raise HTTPException(status_code=404, detail="Dub job not found")
    if job.status in {"ready", "degraded", "failed", "cancelled"}:
        return job
    mark_cancelled(job_id)
    charged = int(job.credits_charged or 0)
    if charged > 0:
        from services.credit_guard import claim_once, refund_credits_best_effort

        if claim_once(f"dub:credit_refund:{job_id}", ttl_sec=7 * 86400):
            await refund_credits_best_effort(
                verified_user_id,
                charged,
                reason="user_cancel",
                route="dub-cancel",
            )
    return _update(job, status="cancelled", progress=100, message="Cancelled")
