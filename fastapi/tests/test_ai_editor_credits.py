"""AI Editor credit gate — fail-closed parity with pipeline_router."""

from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.ai_editor import (
    AIEditorCurrentState,
    AIEditorRequest,
    AIEditorResponse,
    EditorCommandRequest,
)
from core.limits import (
    ExportResolution,
    LimitEvaluation,
    LimitRequest,
    UserTier,
    evaluate_static_limits,
)
from routers import ai_editor_router


def _edit_req() -> AIEditorRequest:
    return AIEditorRequest(
        prompt="trim the hook",
        current_state=AIEditorCurrentState(
            videoDuration=60.0,
            currentTime=0.0,
            selectedClipId=None,
            elementCount=0,
            captionCount=0,
            captionsEnabled=True,
            aspectRatio="9:16",
            visualFilter="None",
            audioBoost=100,
            playbackSpeed=100,
        ),
        transcript=[],
    )


def _cmd_req(command: str = "add captions") -> EditorCommandRequest:
    return EditorCommandRequest(command=command, user_tier="free")


def _command_ok(**kwargs):
    return {
        "intent": "edit",
        "confidence": 1.0,
        "actions": [],
        "feedback": "ok",
        "fallback": "retry",
        "model_used": "test",
        "clamped": [],
        "dropped": [],
        "message": "ok",
        "suggestions": [],
        "status": "ok",
    }


@pytest.fixture(autouse=True)
def allow_plan_admission(monkeypatch):
    evaluation = LimitEvaluation(
        decision=evaluate_static_limits(
            tier=UserTier.FREE,
            request=LimitRequest(workload_id=None),
        )
    )
    monkeypatch.setattr(
        ai_editor_router,
        "_admit_editor_command",
        AsyncMock(return_value=(UserTier.FREE, evaluation)),
    )

    async def guarded_command(**kwargs):
        return ai_editor_router.EditorCommandResponse(**_command_ok())

    monkeypatch.setattr(
        ai_editor_router,
        "_execute_via_dual_router",
        AsyncMock(side_effect=guarded_command),
    )


@pytest.mark.asyncio
async def test_ai_edit_insufficient_credits_402(monkeypatch):
    monkeypatch.setattr(ai_editor_router, "MOCK_ENABLED", False)
    monkeypatch.setattr(ai_editor_router, "is_mock_ai_mode", lambda: False)
    with (
        patch("routers.ai_editor_router.ensure_agent_ready"),
        patch(
            "services.stats_service.deduct_credits",
            new_callable=AsyncMock,
            return_value=False,
        ),
    ):
        with pytest.raises(HTTPException) as ei:
            await ai_editor_router.ai_edit(_edit_req(), user_id="u1")
        assert ei.value.status_code == 402


@pytest.mark.asyncio
async def test_ai_edit_credit_outage_fail_closed_503(monkeypatch):
    monkeypatch.delenv("CREDITS_SOFT_FAIL", raising=False)
    monkeypatch.setattr(ai_editor_router, "MOCK_ENABLED", False)
    monkeypatch.setattr(ai_editor_router, "is_mock_ai_mode", lambda: False)
    with (
        patch("routers.ai_editor_router.ensure_agent_ready"),
        patch(
            "services.stats_service.deduct_credits",
            new_callable=AsyncMock,
            side_effect=RuntimeError("firestore down"),
        ),
    ):
        with pytest.raises(HTTPException) as ei:
            await ai_editor_router.ai_edit(_edit_req(), user_id="u1")
        assert ei.value.status_code == 503


@pytest.mark.asyncio
async def test_command_credit_outage_fail_closed_503(monkeypatch):
    monkeypatch.delenv("CREDITS_SOFT_FAIL", raising=False)
    monkeypatch.setattr(ai_editor_router, "is_mock_ai_mode", lambda: False)
    with (
        patch("routers.ai_editor_router.ensure_agent_ready"),
        patch(
            "services.stats_service.deduct_credits",
            new_callable=AsyncMock,
            side_effect=RuntimeError("firestore down"),
        ),
    ):
        with pytest.raises(HTTPException) as ei:
            await ai_editor_router.handle_editor_command(_cmd_req(), user_id="u1")
        assert ei.value.status_code == 503


@pytest.mark.asyncio
async def test_stream_requires_credits_before_gemini(monkeypatch):
    monkeypatch.delenv("CREDITS_SOFT_FAIL", raising=False)
    monkeypatch.setattr(ai_editor_router, "is_mock_ai_mode", lambda: False)
    deduct = AsyncMock(return_value=False)
    with (
        patch("routers.ai_editor_router.ensure_agent_ready") as ready,
        patch("services.stats_service.deduct_credits", deduct),
        patch(
            "routers.ai_editor_router._execute_via_dual_router",
            new_callable=AsyncMock,
        ) as dual_fn,
    ):
        with pytest.raises(HTTPException) as ei:
            await ai_editor_router.handle_editor_command_stream(
                _cmd_req(), user_id="u1"
            )
        assert ei.value.status_code == 402
        deduct.assert_awaited_once_with("u1", 1)
        ready.assert_called_once_with("ai_editor_agent", strict=False)
        dual_fn.assert_not_called()


@pytest.mark.asyncio
async def test_credit_soft_fail_opt_in_allows_proceed(monkeypatch):
    monkeypatch.setenv("CREDITS_SOFT_FAIL", "true")
    monkeypatch.setattr(ai_editor_router, "MOCK_ENABLED", False)
    monkeypatch.setattr(ai_editor_router, "is_mock_ai_mode", lambda: False)
    fake = AIEditorResponse(
        actions=[],
        message="ok",
        suggestions=[],
        status="ok",
        used_mock=False,
        model="gemini-2.5-flash",
        clamped=[],
        dropped=[],
    )
    with (
        patch("routers.ai_editor_router.ensure_agent_ready"),
        patch(
            "services.stats_service.deduct_credits",
            new_callable=AsyncMock,
            side_effect=RuntimeError("firestore down"),
        ),
        patch(
            "routers.ai_editor_router._execute_ai_edit_via_dual_router",
            new_callable=AsyncMock,
            return_value=fake,
        ),
    ):
        resp = await ai_editor_router.ai_edit(_edit_req(), user_id="u1")
        assert resp.model == "gemini-2.5-flash"


@pytest.mark.asyncio
async def test_free_4k_command_returns_upgrade_without_credit(monkeypatch):
    blocked = LimitEvaluation(
        decision=evaluate_static_limits(
            tier=UserTier.FREE,
            request=LimitRequest(
                workload_id=None,
                requested_export_resolution=ExportResolution.UHD_4K,
            ),
        )
    )
    monkeypatch.setattr(
        ai_editor_router,
        "_admit_editor_command",
        AsyncMock(return_value=(UserTier.FREE, blocked)),
    )
    deduct = AsyncMock(return_value=True)
    monkeypatch.setattr("services.stats_service.deduct_credits", deduct)

    response = await ai_editor_router.handle_editor_command(
        _cmd_req("Export this in 4K"),
        user_id="u1",
    )

    assert response.intent == "UPGRADE_PRO"
    assert response.status == "blocked"
    deduct.assert_not_awaited()


@pytest.mark.asyncio
async def test_command_ignores_client_tier_and_uses_trusted_tier(monkeypatch):
    captured: dict[str, str] = {}

    async def capture_tier(**kwargs):
        captured["tier"] = kwargs["user_tier"]
        return ai_editor_router.EditorCommandResponse(**_command_ok())

    monkeypatch.setattr(ai_editor_router, "_execute_via_dual_router", capture_tier)
    monkeypatch.setattr(ai_editor_router, "is_mock_ai_mode", lambda: False)
    monkeypatch.setattr(
        "services.stats_service.deduct_credits",
        AsyncMock(return_value=True),
    )

    await ai_editor_router.handle_editor_command(
        EditorCommandRequest(command="Add captions", user_tier="pro"),
        user_id="u1",
    )

    assert captured["tier"] == "free"
