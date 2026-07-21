"""FastAPI router for the AI Editor.

Provides both the legacy endpoint (POST /api/ai-edit) and the new model-routed
and streaming endpoints (POST /api/ai-editor/command, etc.).
"""

from __future__ import annotations

import logging
import time
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from services.agent_runtime import ensure_agent_ready

from models.ai_editor import (
    AIEditorRequest,
    AIEditorResponse,
    EditorCommandRequest,
    EditorCommandResponse,
)
from services.auth import get_verified_user_id
from services.ai_editor_sanitiser import MOCK_ENABLED, mock_response
from services.ai_editor_engine import (
    run_ai_editor,
    process_editor_command,
    stream_editor_command,
)
from services.tool_registry import list_capabilities_public

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI Editor"])


def _credits_soft_fail_allowed() -> bool:
    """Opt-in soft-fail for local/dev only. Production must stay fail-closed."""
    return os.getenv("CREDITS_SOFT_FAIL", "").strip().lower() in ("1", "true", "yes")


async def _require_ai_editor_credit(user_id: str, *, route: str) -> None:
    """Deduct 1 credit before any Gemini spend.

    Matches pipeline_router fail-closed policy: stats outage → 503, not free AI.
    Set CREDITS_SOFT_FAIL=true only for non-prod debugging.
    """
    try:
        from services.stats_service import deduct_credits

        ok = await deduct_credits(user_id, 1)
        if not ok:
            raise HTTPException(
                status_code=402,
                detail="Insufficient credits. Upgrade to Pro to continue.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        if _credits_soft_fail_allowed():
            logger.warning(
                "%s: credit deduction failed for %s: %s (CREDITS_SOFT_FAIL=true)",
                route,
                user_id,
                exc,
            )
            return
        logger.error(
            "%s: credit deduction failed for %s: %s",
            route,
            user_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=503,
            detail="Credit service unavailable. Try again shortly.",
        ) from exc


# ─── Legacy Endpoint ───────────────────────────────────────────────────────────


@router.post("/api/ai-edit", response_model=AIEditorResponse)
async def ai_edit(
    body: AIEditorRequest,
    user_id: str = Depends(get_verified_user_id),
) -> AIEditorResponse:
    t0 = time.perf_counter()
    ensure_agent_ready("ai_editor_agent", strict=False)

    # Mock short-circuit
    if MOCK_ENABLED:
        safe_actions, message, suggestions = mock_response(body.current_state)
        elapsed = (time.perf_counter() - t0) * 1000
        logger.info(
            "ai_edit mock user=%s actions=%d elapsed_ms=%.0f",
            user_id,
            len(safe_actions),
            elapsed,
        )
        return AIEditorResponse(
            actions=safe_actions,
            message=message,
            suggestions=suggestions,
            status="mocked",
            used_mock=True,
            model=None,
            clamped=[],
            dropped=[],
        )

    await _require_ai_editor_credit(user_id, route="ai_edit")

    # Gemini call
    try:
        response = await run_ai_editor(
            prompt=body.prompt,
            state=body.current_state,
            transcript=body.transcript,
            video_id=body.video_id,
        )
    except TimeoutError:
        raise HTTPException(
            status_code=504, detail="AI editor timed out. Try a shorter prompt."
        )
    except Exception as exc:
        logger.error(
            "ai_edit: engine error for user=%s: %s", user_id, exc, exc_info=True
        )
        raise HTTPException(
            status_code=500, detail="AI editor encountered an internal error."
        )

    elapsed = (time.perf_counter() - t0) * 1000
    logger.info(
        "ai_edit user=%s prompt_len=%d actions=%d clamped=%d dropped=%d model=%s elapsed_ms=%.0f",
        user_id,
        len(body.prompt),
        len(response.actions),
        len(response.clamped),
        len(response.dropped),
        response.model,
        elapsed,
    )
    return response


# ─── New Phase 56 Router Endpoints (prefix /api/ai-editor) ───────────────────


@router.post("/api/ai-editor/command", response_model=EditorCommandResponse)
async def handle_editor_command(
    request: EditorCommandRequest,
    user_id: str = Depends(get_verified_user_id),
):
    """
    Main endpoint: natural language command → tool action JSON
    Called from: frontend/src/lib/gemini-editor.ts
    """
    if not request.command.strip():
        raise HTTPException(status_code=400, detail="Command cannot be empty")

    await _require_ai_editor_credit(user_id, route="handle_editor_command")

    ensure_agent_ready("ai_editor_agent", strict=False)
    result = await process_editor_command(
        command=request.command,
        user_tier=request.user_tier,
        project_context=request.project_context,
    )
    return result


@router.post("/api/ai-editor/command/stream")
async def handle_editor_command_stream(
    request: EditorCommandRequest,
    user_id: str = Depends(get_verified_user_id),
):
    """
    Streaming version — for real-time AI typing effect in AIPanel
    Called from: frontend/src/components/editor/AIPanel.tsx
    """
    if not request.command.strip():
        raise HTTPException(status_code=400, detail="Command cannot be empty")

    await _require_ai_editor_credit(user_id, route="handle_editor_command_stream")

    ensure_agent_ready("ai_editor_agent", strict=False)
    return StreamingResponse(
        stream_editor_command(command=request.command, user_tier=request.user_tier),
        media_type="text/event-stream",
    )


@router.get("/api/ai-editor/health")
async def health_check_ai():
    """Check if AI editor is connected and working"""
    api_key = os.getenv("GEMINI_API_KEY")
    return {
        "status": "ok" if api_key else "missing_api_key",
        "primary_model": os.getenv("GEMINI_PRIMARY_MODEL", "gemini-2.5-flash"),
        "free_model": os.getenv("GEMINI_FREE_MODEL", "gemini-2.5-flash-lite"),
    }


@router.get("/api/capabilities")
async def get_capabilities(
    lite: bool = False,
    user_id: str = Depends(get_verified_user_id),
):
    """EP-001: Capability Registry bootstrap for FE / tooling."""
    _ = user_id
    return list_capabilities_public(lite=lite)
