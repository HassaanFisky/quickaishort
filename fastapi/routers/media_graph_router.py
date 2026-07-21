"""EP-003 MediaGraph HTTP API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from models.media_graph import CreateMediaGraphRequest, UpsertFacetsRequest
from services.auth import get_verified_user_id
from services.media_graph_service import get_media_graph_service

router = APIRouter(prefix="/api/studio/v1/media-graphs", tags=["studio-media-graph"])


@router.post("")
async def create_graph(
    body: CreateMediaGraphRequest,
    user_id: str = Depends(get_verified_user_id),
):
    svc = get_media_graph_service()
    g = await svc.create(user_id, body)
    return g.model_dump(mode="json")


@router.post("/by-project/{project_id}/ensure")
async def ensure_for_project(
    project_id: str,
    user_id: str = Depends(get_verified_user_id),
):
    svc = get_media_graph_service()
    g = await svc.ensure_for_project(user_id, project_id)
    return g.model_dump(mode="json")


@router.get("/{graph_id}")
async def get_graph(graph_id: str, user_id: str = Depends(get_verified_user_id)):
    svc = get_media_graph_service()
    g = await svc.get(graph_id, user_id)
    if g is None:
        raise HTTPException(status_code=404, detail="graph_not_found")
    return g.model_dump(mode="json")


@router.post("/{graph_id}/facets")
async def upsert_facets(
    graph_id: str,
    body: UpsertFacetsRequest,
    user_id: str = Depends(get_verified_user_id),
):
    svc = get_media_graph_service()
    g = await svc.upsert_facets(graph_id, user_id, body)
    if g is None:
        raise HTTPException(status_code=404, detail="graph_not_found")
    return g.model_dump(mode="json")


@router.get("/{graph_id}/suggestions")
async def get_suggestions(
    graph_id: str, user_id: str = Depends(get_verified_user_id)
):
    svc = get_media_graph_service()
    # Ownership + derive in one service call (avoid duplicate Firestore reads).
    rows = await svc.suggestions(graph_id, user_id)
    if rows is None:
        raise HTTPException(status_code=404, detail="graph_not_found")
    return {
        "graph_id": graph_id,
        "suggestions": [s.model_dump(mode="json") for s in rows],
    }
