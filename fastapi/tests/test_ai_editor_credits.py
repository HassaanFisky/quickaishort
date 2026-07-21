"""AI Editor credit gate — fail-closed parity with pipeline_router."""

from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.ai_editor import AIEditorCurrentState, AIEditorRequest, EditorCommandRequest
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


@pytest.mark.asyncio
async def test_ai_edit_insufficient_credits_402(monkeypatch):
    monkeypatch.setattr(ai_editor_router, "MOCK_ENABLED", False)
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
    deduct = AsyncMock(return_value=False)
    with (
        patch("routers.ai_editor_router.ensure_agent_ready") as ready,
        patch("services.stats_service.deduct_credits", deduct),
        patch("routers.ai_editor_router.stream_editor_command") as stream_fn,
    ):
        with pytest.raises(HTTPException) as ei:
            await ai_editor_router.handle_editor_command_stream(
                _cmd_req(), user_id="u1"
            )
        assert ei.value.status_code == 402
        deduct.assert_awaited_once_with("u1", 1)
        ready.assert_not_called()
        stream_fn.assert_not_called()


@pytest.mark.asyncio
async def test_credit_soft_fail_opt_in_allows_proceed(monkeypatch):
    monkeypatch.setenv("CREDITS_SOFT_FAIL", "true")
    monkeypatch.setattr(ai_editor_router, "MOCK_ENABLED", False)
    fake = MagicMock()
    fake.actions = []
    fake.message = "ok"
    fake.suggestions = []
    fake.status = "ok"
    fake.used_mock = False
    fake.model = "gemini-2.5-flash"
    fake.clamped = []
    fake.dropped = []
    with (
        patch("routers.ai_editor_router.ensure_agent_ready"),
        patch(
            "services.stats_service.deduct_credits",
            new_callable=AsyncMock,
            side_effect=RuntimeError("firestore down"),
        ),
        patch(
            "routers.ai_editor_router.run_ai_editor",
            new_callable=AsyncMock,
            return_value=fake,
        ),
    ):
        resp = await ai_editor_router.ai_edit(_edit_req(), user_id="u1")
        assert resp.model == "gemini-2.5-flash"
