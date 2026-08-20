"""JWT sole tenant — body userId/user_id must never become billing identity.

Locks analyze / preflight against spoof after 2026-08-01 lockdown.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from starlette.requests import Request


def _starlette_request() -> Request:
    return Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/api/test",
            "raw_path": b"/api/test",
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 123),
            "server": ("test", 80),
        }
    )


@pytest.mark.asyncio
async def test_analyze_ignores_body_userid_for_credits() -> None:
    from main import AnalyzeRequest, analyze_video

    body = AnalyzeRequest(
        videoId="vid-1",
        duration=60.0,
        transcript=[],
        userId="attacker-spoof",
        isFirstProject=False,
    )
    require = AsyncMock()
    admit = AsyncMock(return_value=MagicMock())

    with (
        patch("main._admit_user_workload", admit),
        patch("services.credit_guard.require_credits", require),
        patch("main._load_agent_module") as load_mod,
        patch("main.increment_stats", AsyncMock()),
    ):
        agent = MagicMock()
        agent.analyze_transcript = AsyncMock(return_value=[])
        load_mod.return_value.get_viral_agent.return_value = agent

        await analyze_video(
            request=_starlette_request(),
            body=body,
            verified_user_id="jwt-owner",
        )

    require.assert_awaited_once()
    assert require.await_args.args[0] == "jwt-owner"
    admit.assert_awaited_once()
    assert admit.await_args.kwargs["user_id"] == "jwt-owner"


@pytest.mark.asyncio
async def test_preflight_ignores_body_user_id_for_deduct() -> None:
    from main import ClipCandidateRequest, PreflightRequest, run_preflight

    body = PreflightRequest(
        youtube_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        user_id="attacker-spoof",
        is_premium=False,
        clip_candidates=[
            ClipCandidateRequest(
                start_sec=0.0, end_sec=15.0, score=0.9, transcript="hi"
            )
        ],
    )

    with (
        patch("main.ensure_agent_ready"),
        patch("main._ADK_AVAILABLE", True),
        patch("main._admit_user_workload", AsyncMock(return_value=MagicMock())),
        patch("main.is_user_premium", AsyncMock(return_value=False)),
        patch("main.deduct_credits", AsyncMock(return_value=False)) as deduct,
    ):
        with pytest.raises(HTTPException) as exc:
            await run_preflight(
                request=_starlette_request(),
                body=body,
                verified_user_id="jwt-owner",
            )

    assert exc.value.status_code == 402
    deduct.assert_awaited_once_with("jwt-owner", 50)


def test_production_openapi_gate_flag_exists() -> None:
    import main as main_mod

    assert hasattr(main_mod, "_IS_PRODUCTION")
    assert isinstance(main_mod._IS_PRODUCTION, bool)
    if main_mod._IS_PRODUCTION:
        assert main_mod.app.docs_url is None
        assert main_mod.app.redoc_url is None
        assert main_mod.app.openapi_url is None


def test_auth_disabled_does_not_bypass_jwt(monkeypatch) -> None:
    import services.auth as auth_mod

    monkeypatch.setenv("AUTH_DISABLED", "true")
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setattr(auth_mod, "_NEXTAUTH_SECRET", "unit-test-secret-not-for-prod")
    monkeypatch.setattr(auth_mod, "_AUTH_DISABLED_WARNED", False)

    with pytest.raises(HTTPException) as exc:
        auth_mod.get_verified_user_id(authorization="")
    assert exc.value.status_code == 401


def test_mock_ai_editor_blocked_in_production(monkeypatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("MOCK_AI_EDITOR", "true")
    monkeypatch.setenv("MOCK_AI_MODE", "true")
    from core.flags import is_mock_ai_editor, is_mock_ai_mode

    assert is_mock_ai_editor() is False
    assert is_mock_ai_mode() is False
