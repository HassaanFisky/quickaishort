"""FastAPI router for POST /api/ai-edit.

Auth:        NextAuth JWT via get_verified_user_id dependency.
Credits:     Deducts 1 credit per request (skipped when MOCK_AI_EDITOR=true).
Observability: logs prompt length, action count, clamped/dropped counts, model.
Mock mode:   Set env var MOCK_AI_EDITOR=true — returns 4 deterministic actions,
             no Gemini call, no credit deduction.
"""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Depends, HTTPException

from models.ai_editor import AIEditorRequest, AIEditorResponse
from services.auth import get_verified_user_id
from services.ai_editor_sanitiser import MOCK_ENABLED, mock_response
from services.ai_editor_engine import run_ai_editor

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ai-editor"])


@router.post("/api/ai-edit", response_model=AIEditorResponse)
async def ai_edit(
    body: AIEditorRequest,
    user_id: str = Depends(get_verified_user_id),
) -> AIEditorResponse:
    t0 = time.perf_counter()

    # ── Mock short-circuit ────────────────────────────────────────────────────
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

    # ── Credit deduction ──────────────────────────────────────────────────────
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

    # ── Gemini call ───────────────────────────────────────────────────────────
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
