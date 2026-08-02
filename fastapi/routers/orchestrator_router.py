"""EP-004 Orchestrator HTTP API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from core.rate_limit import limiter
from services.auth import get_verified_user_id
from services.orchestrator_service import (
    CreatePlanRequest,
    ExecutePlanRequest,
    get_orchestrator,
)

router = APIRouter(prefix="/api/studio/v1/orchestrator", tags=["studio-orchestrator"])


@router.post("/plan")
@limiter.limit("40/minute")
async def create_plan(
    request: Request,
    body: CreatePlanRequest,
    user_id: str = Depends(get_verified_user_id),
):
    _ = request
    orch = get_orchestrator()
    plan = await orch.create_plan(user_id, body)
    return plan.model_dump(mode="json")


@router.get("/plans/{plan_id}")
@limiter.limit("60/minute")
async def get_plan(
    request: Request,
    plan_id: str,
    user_id: str = Depends(get_verified_user_id),
):
    _ = request
    orch = get_orchestrator()
    plan = await orch.get_plan(plan_id, user_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="plan_not_found")
    return plan.model_dump(mode="json")


@router.post("/execute")
@limiter.limit("40/minute")
async def execute_plan(
    request: Request,
    body: ExecutePlanRequest,
    user_id: str = Depends(get_verified_user_id),
):
    _ = request
    orch = get_orchestrator()
    try:
        plan = await orch.execute_plan(user_id, body)
    except KeyError:
        raise HTTPException(status_code=404, detail="plan_not_found")
    return plan.model_dump(mode="json")
