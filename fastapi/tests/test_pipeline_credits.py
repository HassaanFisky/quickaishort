"""Pipeline credit gate — JWT tenant + fail-closed deduct (TD-LEGACY-01 soak)."""

from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routers.pipeline_router import PipelineRunRequest, run_pipeline


def _req(**kwargs):
    base = dict(
        videoId="vid1",
        transcript=[{"text": "hello", "start": 0.0, "end": 1.0}],
        duration=10.0,
        userId="attacker-body-id",
    )
    base.update(kwargs)
    return PipelineRunRequest(**base)


@pytest.mark.asyncio
async def test_insufficient_credits_402():
    with (
        patch("routers.pipeline_router.is_overloaded", return_value=False),
        patch(
            "services.stats_service.deduct_credits",
            new_callable=AsyncMock,
            return_value=False,
        ),
    ):
        with pytest.raises(HTTPException) as ei:
            await run_pipeline(_req(), verified_user_id="jwt-user")
        assert ei.value.status_code == 402


@pytest.mark.asyncio
async def test_credit_service_outage_fail_closed_503():
    with (
        patch("routers.pipeline_router.is_overloaded", return_value=False),
        patch(
            "services.stats_service.deduct_credits",
            new_callable=AsyncMock,
            side_effect=RuntimeError("firestore down"),
        ),
    ):
        with pytest.raises(HTTPException) as ei:
            await run_pipeline(_req(), verified_user_id="jwt-user")
        assert ei.value.status_code == 503


@pytest.mark.asyncio
async def test_body_userid_ignored_uses_jwt():
    """Body userId must never become the tenant for credit deduction."""
    deduct = AsyncMock(return_value=False)
    with (
        patch("routers.pipeline_router.is_overloaded", return_value=False),
        patch("services.stats_service.deduct_credits", deduct),
    ):
        with pytest.raises(HTTPException) as ei:
            await run_pipeline(_req(userId="spoofed"), verified_user_id="jwt-user")
        assert ei.value.status_code == 402
        deduct.assert_awaited_once_with("jwt-user", 20)
