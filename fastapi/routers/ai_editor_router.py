"""FastAPI router for the AI Editor.

Wires live `/api/ai-edit` and `/api/ai-editor/command` endpoints to
``DualModelRouter.execute`` (multi-track TimelinePlanOutput). Heavy Google
SDKs stay behind importlib inside the dual-model stack — never imported here.
"""

from __future__ import annotations

import importlib
import logging
import os
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import TypeAdapter

from core.flags import is_mock_ai_mode
from core.limits import (
    LimitEvaluation,
    UserTier,
    build_limit_request,
    check_user_tier,
    enforce_user_limits,
    raise_resource_ceiling,
)
from models.ai_editor import (
    AIEditorCurrentState,
    AIEditorRequest,
    AIEditorResponse,
    AiEditorAction,
    EditorCommandRequest,
    EditorCommandResponse,
)
from services.agent_runtime import ensure_agent_ready
from services.ai_editor_sanitiser import MOCK_ENABLED, mock_response, sanitise
from services.auth import get_verified_user_id
from services.gemini_backpressure import (
    GeminiBackpressureError,
    GeminiBackpressureUnavailable,
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


async def _admit_editor_command(
    *,
    user_id: str,
    command: str,
    workload_id: str | None,
) -> tuple[UserTier, LimitEvaluation]:
    """Resolve trusted tier and apply the immutable plan matrix before AI spend."""

    tier = await check_user_tier(user_id)
    evaluation = await enforce_user_limits(
        user_id,
        build_limit_request(
            query=command,
            workload_id=workload_id,
            reserve_daily_video=bool(workload_id),
        ),
        tier=tier,
    )
    return tier, evaluation


def _blocked_command_response(evaluation: LimitEvaluation) -> EditorCommandResponse:
    decision = evaluation.decision
    return EditorCommandResponse(
        intent=decision.action_intent.value,
        confidence=1.0,
        actions=[],
        feedback=decision.message,
        fallback="Upgrade to Pro to unlock this request.",
        model_used="policy",
        message=decision.message,
        suggestions=[],
        status="blocked",
    )


def _state_from_context(
    project_context: Optional[dict[str, Any]],
    fallback: AIEditorCurrentState | None = None,
) -> AIEditorCurrentState:
    if fallback is not None and not project_context:
        return fallback
    ctx = project_context or {}
    duration = float(ctx.get("duration") or ctx.get("videoDuration") or 60.0)
    return AIEditorCurrentState(
        videoDuration=max(duration, 0.0),
        currentTime=float(ctx.get("currentTime") or 0.0),
        selectedClipId=ctx.get("selectedClipId"),
        elementCount=int(ctx.get("elementCount") or 0),
        captionCount=int(ctx.get("captionCount") or 0),
        captionsEnabled=bool(ctx.get("captionsEnabled", True)),
        aspectRatio=ctx.get("aspectRatio") or "9:16",
        visualFilter=ctx.get("visualFilter") or "None",
        audioBoost=int(ctx.get("audioBoost") or 100),
        playbackSpeed=int(ctx.get("playbackSpeed") or 100),
    )


def _actions_from_payload(payload: dict[str, Any] | None) -> list[AiEditorAction]:
    raw = (payload or {}).get("actions") or []
    if not isinstance(raw, list):
        return []
    ta: TypeAdapter[Any] = TypeAdapter(AiEditorAction)
    valid: list[AiEditorAction] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            valid.append(ta.validate_python(item))
        except Exception as exc:
            logger.debug("dual_router dropped malformed action %s: %s", item, exc)
    return valid


async def _execute_via_dual_router(
    *,
    user_id: str,
    command: str,
    workload_id: str | None,
    user_tier: str,
    project_context: Optional[dict[str, Any]] = None,
    editor_state: AIEditorCurrentState | None = None,
) -> EditorCommandResponse:
    """Call DualModelRouter.execute and map to the FE Action Intent schema."""

    _ = user_tier  # trusted tier already resolved by caller; kept for test hooks
    dual = importlib.import_module("agent.router")
    request = dual.LogicRouteRequest(
        user_id=user_id,
        workload_id=workload_id or "unscoped",
        query=command,
        context=project_context or {},
        # Daily/static ceiling already enforced by `_admit_editor_command`.
        reserve_daily_video=False,
    )
    result = await dual.execute(request, output_model=dual.TimelinePlanOutput)

    if result.action_intent == "UPGRADE_PRO":
        return EditorCommandResponse(
            intent="UPGRADE_PRO",
            confidence=1.0,
            actions=[],
            feedback=result.message,
            fallback="Upgrade to Pro to unlock this request.",
            model_used=result.model_used or "policy",
            message=result.message,
            suggestions=[],
            status="blocked",
        )

    if result.action_intent == "RETRY_LATER":
        headers = (
            {"Retry-After": str(result.retry_after_seconds)}
            if result.retry_after_seconds
            else {}
        )
        raise HTTPException(
            status_code=429,
            detail=result.message,
            headers=headers or None,
        )

    payload = result.payload if isinstance(result.payload, dict) else {}
    actions = _actions_from_payload(payload)
    state = _state_from_context(project_context, editor_state)
    safe_actions, clamped, dropped = sanitise(actions, state)
    canonical = [a.model_dump(mode="json") for a in safe_actions]
    status = str(payload.get("status") or ("ok" if canonical else "no_op"))
    if status not in {"ok", "clarification_needed", "no_op", "blocked"}:
        status = "ok" if canonical else "no_op"
    message = str(payload.get("message") or result.message or "Done.")
    suggestions = list(payload.get("suggestions") or [])[:3]
    # Attach multi-track execution sheet when present (white-label timeline graph).
    sheet = payload.get("execution_sheet")
    feedback = message
    if isinstance(sheet, dict):
        feedback = f"{message} (multi-track sheet applied)"

    return EditorCommandResponse(
        intent="edit",
        confidence=(
            0.92 if result.cached or result.model_used == "mock-ai-mode" else 0.85
        ),
        actions=canonical,
        feedback=feedback,
        fallback="Rephrase the command and retry.",
        model_used=result.model_used or "gemini-2.5-flash",
        clamped=clamped,
        dropped=dropped,
        message=message,
        suggestions=suggestions,
        status=status,
    )


async def _execute_ai_edit_via_dual_router(
    *,
    user_id: str,
    body: AIEditorRequest,
    user_tier: str,
) -> AIEditorResponse:
    """Legacy `/api/ai-edit` envelope built from DualModelRouter TimelinePlanOutput."""

    command = await _execute_via_dual_router(
        user_id=user_id,
        command=body.prompt,
        workload_id=body.video_id,
        user_tier=user_tier,
        project_context={
            "videoDuration": body.current_state.videoDuration,
            "currentTime": body.current_state.currentTime,
            "selectedClipId": body.current_state.selectedClipId,
            "elementCount": body.current_state.elementCount,
            "captionCount": body.current_state.captionCount,
            "captionsEnabled": body.current_state.captionsEnabled,
            "aspectRatio": body.current_state.aspectRatio,
            "visualFilter": body.current_state.visualFilter,
            "audioBoost": body.current_state.audioBoost,
            "playbackSpeed": body.current_state.playbackSpeed,
            "transcript": [c.model_dump(mode="json") for c in body.transcript],
            "run_id": body.run_id,
        },
        editor_state=body.current_state,
    )
    status = command.status or "ok"
    if status == "blocked":
        raise HTTPException(
            status_code=403,
            detail={
                "action_intent": "UPGRADE_PRO",
                "message": command.message
                or "Resource ceiling crossed. Upgrade to Pro to continue.",
            },
        )
    used_mock = bool(is_mock_ai_mode() or command.model_used == "mock-ai-mode")
    mapped_status = (
        "mocked"
        if used_mock
        else (status if status in {"ok", "clarification_needed", "no_op"} else "ok")
    )
    ta: TypeAdapter[Any] = TypeAdapter(AiEditorAction)
    actions: list[AiEditorAction] = []
    for item in command.actions:
        try:
            actions.append(ta.validate_python(item))
        except Exception:
            continue
    return AIEditorResponse(
        actions=actions,
        message=command.message or command.feedback,
        suggestions=command.suggestions,
        status=mapped_status,  # type: ignore[arg-type]
        used_mock=used_mock,
        model=None if used_mock else command.model_used,
        clamped=command.clamped,
        dropped=command.dropped,
    )


# ─── Legacy Endpoint (FE proxy: /api/ai/editor → /api/ai-edit) ────────────────


@router.post("/api/ai-edit", response_model=AIEditorResponse)
async def ai_edit(
    body: AIEditorRequest,
    user_id: str = Depends(get_verified_user_id),
) -> AIEditorResponse:
    t0 = time.perf_counter()

    # Legacy MOCK_AI_EDITOR short-circuit (no DualModelRouter / no credits).
    if MOCK_ENABLED and not is_mock_ai_mode():
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

    tier, evaluation = await _admit_editor_command(
        user_id=user_id,
        command=body.prompt,
        workload_id=body.video_id,
    )
    if not evaluation.decision.allowed:
        raise_resource_ceiling(evaluation.decision)

    try:
        if not is_mock_ai_mode():
            ensure_agent_ready("ai_editor_agent", strict=False)
            await _require_ai_editor_credit(user_id, route="ai_edit")
        response = await _execute_ai_edit_via_dual_router(
            user_id=user_id,
            body=body,
            user_tier=tier.value,
        )
    except HTTPException:
        raise
    except TimeoutError:
        raise HTTPException(
            status_code=504, detail="AI editor timed out. Try a shorter prompt."
        )
    except GeminiBackpressureError as exc:
        raise HTTPException(
            status_code=429,
            detail=str(exc),
            headers={"Retry-After": str(exc.cooldown.retry_after_seconds)},
        ) from exc
    except GeminiBackpressureUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.error(
            "ai_edit: engine error for user=%s: %s", user_id, exc, exc_info=True
        )
        raise HTTPException(
            status_code=500, detail="AI editor encountered an internal error."
        ) from exc

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


# ─── Primary FE command path ───────────────────────────────────────────────────


@router.post("/api/ai-editor/command", response_model=EditorCommandResponse)
async def handle_editor_command(
    request: EditorCommandRequest,
    user_id: str = Depends(get_verified_user_id),
):
    """Natural-language command → multi-track action JSON via DualModelRouter."""
    if not request.command.strip():
        raise HTTPException(status_code=400, detail="Command cannot be empty")

    tier, evaluation = await _admit_editor_command(
        user_id=user_id,
        command=request.command,
        workload_id=request.workload_id,
    )
    if not evaluation.decision.allowed:
        return _blocked_command_response(evaluation)

    if not is_mock_ai_mode():
        ensure_agent_ready("ai_editor_agent", strict=False)
        await _require_ai_editor_credit(user_id, route="handle_editor_command")

    return await _execute_via_dual_router(
        user_id=user_id,
        command=request.command,
        workload_id=request.workload_id,
        user_tier=tier.value,
        project_context=request.project_context,
    )


@router.post("/api/ai-editor/edit", response_model=EditorCommandResponse)
async def handle_editor_edit(
    request: EditorCommandRequest,
    user_id: str = Depends(get_verified_user_id),
):
    """Alias for `/api/ai-editor/command` (edit surface)."""
    return await handle_editor_command(request, user_id=user_id)


@router.post("/api/ai-editor/generate", response_model=EditorCommandResponse)
async def handle_editor_generate(
    request: EditorCommandRequest,
    user_id: str = Depends(get_verified_user_id),
):
    """Alias for `/api/ai-editor/command` (generate surface)."""
    return await handle_editor_command(request, user_id=user_id)


@router.post("/api/ai-editor/command/stream")
async def handle_editor_command_stream(
    request: EditorCommandRequest,
    user_id: str = Depends(get_verified_user_id),
):
    """Streaming path — DualModelRouter plan emitted as one SSE JSON event."""
    if not request.command.strip():
        raise HTTPException(status_code=400, detail="Command cannot be empty")

    tier, evaluation = await _admit_editor_command(
        user_id=user_id,
        command=request.command,
        workload_id=request.workload_id,
    )
    if not evaluation.decision.allowed:
        raise_resource_ceiling(evaluation.decision)

    if not is_mock_ai_mode():
        ensure_agent_ready("ai_editor_agent", strict=False)
        await _require_ai_editor_credit(user_id, route="handle_editor_command_stream")

    async def guarded_stream():
        try:
            result = await _execute_via_dual_router(
                user_id=user_id,
                command=request.command,
                workload_id=request.workload_id,
                user_tier=tier.value,
                project_context=request.project_context,
            )
            yield f"data: {result.model_dump_json()}\n\n"
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
            yield f'data: {{"error": {detail!r}, "status": {exc.status_code}}}\n\n'

    return StreamingResponse(
        guarded_stream(),
        media_type="text/event-stream",
    )


@router.get("/api/ai-editor/health")
async def health_check_ai():
    """Check if AI editor is connected and working."""
    api_key = os.getenv("GEMINI_API_KEY")
    return {
        "status": "ok" if api_key or is_mock_ai_mode() else "missing_api_key",
        "mock_ai_mode": is_mock_ai_mode(),
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
