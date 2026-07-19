"""EP-008 — Ingest policy + editor onboarding APIs."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from services.auth import get_verified_user_id
from services.media_ingest_policy import get_ingest_policy
from services.studio_onboarding import (
    EditorOnboardingV1,
    get_editor_onboarding,
    put_editor_onboarding,
    should_auto_show_tour,
)

router = APIRouter(prefix="/api/studio/v1", tags=["studio-ingest"])

OnboardingStatus = Literal["not_started", "in_progress", "completed", "skipped"]


class OnboardingPutBody(BaseModel):
    status: OnboardingStatus
    step_index: int = Field(default=0, ge=0)


class OnboardingGetResponse(BaseModel):
    editor_v1: EditorOnboardingV1
    auto_show: bool


@router.get("/ingest/policy")
async def ingest_policy(_user_id: str = Depends(get_verified_user_id)):
    return get_ingest_policy()


@router.get("/me/onboarding", response_model=OnboardingGetResponse)
async def get_onboarding(user_id: str = Depends(get_verified_user_id)):
    state = await get_editor_onboarding(user_id)
    auto = await should_auto_show_tour(user_id)
    # Refresh state if soft-completed inside should_auto_show
    if not auto and state.status == "not_started":
        state = await get_editor_onboarding(user_id)
    return OnboardingGetResponse(editor_v1=state, auto_show=auto)


@router.put("/me/onboarding", response_model=EditorOnboardingV1)
async def put_onboarding(
    body: OnboardingPutBody,
    user_id: str = Depends(get_verified_user_id),
):
    return await put_editor_onboarding(
        user_id, status=body.status, step_index=body.step_index
    )
