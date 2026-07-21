"""EP-002 Studio Project Kernel HTTP API — /api/studio/v1/projects."""

from __future__ import annotations

import logging
from typing import Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from models.studio_project import (
    CommandAck,
    CommandReject,
    CreateStudioProjectRequest,
    ProjectCommand,
    StudioProjectHead,
    UndoRedoRequest,
)
from services.auth import get_verified_user_id
from services.project_kernel import (
    CommandResult,
    get_project_kernel,
    kernel_enabled,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/studio/v1/projects", tags=["studio-projects"])


def _require_kernel() -> None:
    if not kernel_enabled():
        raise HTTPException(
            status_code=503,
            detail="STUDIO_PROJECT_KERNEL disabled",
        )


class HeadResponse(BaseModel):
    project_id: str
    revision: int
    snapshot_revision: int
    snapshot_hash: Optional[str] = None
    snapshot_manifest: Optional[dict] = None
    title: str
    status: str
    primary_asset_id: Optional[str] = None
    undo_stack: list[int] = []
    redo_stack: list[int] = []


def _to_head_response(h: StudioProjectHead) -> HeadResponse:
    return HeadResponse(
        project_id=h.project_id,
        revision=h.revision,
        snapshot_revision=h.snapshot_revision,
        snapshot_hash=h.snapshot_hash,
        snapshot_manifest=(
            h.snapshot_manifest.model_dump(mode="json") if h.snapshot_manifest else None
        ),
        title=h.title,
        status=h.status,
        primary_asset_id=h.primary_asset_id,
        undo_stack=list(h.undo_stack),
        redo_stack=list(h.redo_stack),
    )


@router.post("")
async def create_project(
    body: CreateStudioProjectRequest,
    user_id: str = Depends(get_verified_user_id),
):
    _require_kernel()
    kernel = get_project_kernel()
    head = await kernel.create_project(user_id, body)
    return head.model_dump(mode="json")


@router.get("")
async def list_projects(user_id: str = Depends(get_verified_user_id)):
    _require_kernel()
    kernel = get_project_kernel()
    rows = await kernel.list_projects(user_id)
    return [r.model_dump(mode="json") for r in rows]


@router.get("/{project_id}")
async def get_project(project_id: str, user_id: str = Depends(get_verified_user_id)):
    _require_kernel()
    kernel = get_project_kernel()
    head = await kernel.get_project(project_id, user_id)
    if head is None:
        raise HTTPException(status_code=404, detail="project_not_found")
    return head.model_dump(mode="json")


@router.get("/{project_id}/head")
async def get_head(project_id: str, user_id: str = Depends(get_verified_user_id)):
    _require_kernel()
    kernel = get_project_kernel()
    head = await kernel.get_head(project_id, user_id)
    if head is None:
        raise HTTPException(status_code=404, detail="project_not_found")
    return _to_head_response(head)


@router.get("/{project_id}/events")
async def get_events(
    project_id: str,
    after_revision: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user_id: str = Depends(get_verified_user_id),
):
    _require_kernel()
    kernel = get_project_kernel()
    events = await kernel.get_events(project_id, user_id, after_revision, limit)
    if events is None:
        raise HTTPException(status_code=404, detail="project_not_found")
    return [e.model_dump(mode="json") for e in events]


@router.post("/{project_id}/commands")
async def post_command(
    project_id: str,
    body: ProjectCommand,
    user_id: str = Depends(get_verified_user_id),
) -> Union[CommandAck, CommandReject]:
    _require_kernel()
    if body.project_id and body.project_id != project_id:
        raise HTTPException(status_code=400, detail="project_id_mismatch")
    body.project_id = project_id
    kernel = get_project_kernel()
    result: CommandResult = await kernel.accept_command(user_id, body)
    if isinstance(result, CommandReject):
        status = 409 if result.reason == "conflict" else 400
        if result.reason == "auth":
            status = 403
        # Return structured reject body with appropriate status
        raise HTTPException(status_code=status, detail=result.model_dump(mode="json"))
    return result


@router.post("/{project_id}/undo")
async def undo(
    project_id: str,
    body: UndoRedoRequest,
    user_id: str = Depends(get_verified_user_id),
):
    _require_kernel()
    cmd = ProjectCommand(
        command_id=body.command_id,
        project_id=project_id,
        base_revision=body.base_revision,
        actor_session_id=body.actor_session_id,
        kind="system",
        system_op="undo",
        source="ui_direct",
    )
    kernel = get_project_kernel()
    result = await kernel.accept_command(user_id, cmd)
    if isinstance(result, CommandReject):
        status = 409 if result.reason == "conflict" else 400
        raise HTTPException(status_code=status, detail=result.model_dump(mode="json"))
    return result


@router.post("/{project_id}/redo")
async def redo(
    project_id: str,
    body: UndoRedoRequest,
    user_id: str = Depends(get_verified_user_id),
):
    _require_kernel()
    cmd = ProjectCommand(
        command_id=body.command_id,
        project_id=project_id,
        base_revision=body.base_revision,
        actor_session_id=body.actor_session_id,
        kind="system",
        system_op="redo",
        source="ui_direct",
    )
    kernel = get_project_kernel()
    result = await kernel.accept_command(user_id, cmd)
    if isinstance(result, CommandReject):
        status = 409 if result.reason == "conflict" else 400
        raise HTTPException(status_code=status, detail=result.model_dump(mode="json"))
    return result


@router.delete("/{project_id}")
async def delete_project(project_id: str, user_id: str = Depends(get_verified_user_id)):
    _require_kernel()
    kernel = get_project_kernel()
    ok = await kernel.soft_delete(project_id, user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="project_not_found")
    return {"status": "deleted", "project_id": project_id}
