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

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI Editor"])


# ─── Legacy Endpoint ───────────────────────────────────────────────────────────

@router.post("/api/ai-edit", response_model=AIEditorResponse)
async def ai_edit(
    body: AIEditorRequest,
    user_id: str = Depends(get_verified_user_id),
) -> AIEditorResponse:
    t0 = time.perf_counter()

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

    # Credit deduction
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
        logger.warning(
            "ai_edit: credit deduction failed for %s: %s (proceeding)", user_id, exc
        )

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
async def handle_editor_command(request: EditorCommandRequest):
    """
    Main endpoint: natural language command → tool action JSON
    Called from: frontend/src/lib/gemini-editor.ts
    """
    if not request.command.strip():
        raise HTTPException(status_code=400, detail="Command cannot be empty")

    result = await process_editor_command(
        command=request.command,
        user_tier=request.user_tier,
        project_context=request.project_context
    )
    return result


@router.post("/api/ai-editor/command/stream")
async def handle_editor_command_stream(request: EditorCommandRequest):
    """
    Streaming version — for real-time AI typing effect in AIPanel
    Called from: frontend/src/components/editor/AIPanel.tsx
    """
    return StreamingResponse(
        stream_editor_command(
            command=request.command,
            user_tier=request.user_tier
        ),
        media_type="text/event-stream"
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
