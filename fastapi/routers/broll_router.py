"""B-Roll Library Router — Pexels-backed video search for the editor.

GET /api/broll/search?q=<query>&per_page=12

Pexels API tier: 200 requests/hour unlimited (verified Dec 2025).
Response shape matches the BRollClip Pydantic model.
"""

from __future__ import annotations

import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from models.ai_editor import BRollClip
from services.auth import get_verified_user_id

logger = logging.getLogger(__name__)
router = APIRouter(tags=["broll"])

PEXELS_ENDPOINT = "https://api.pexels.com/videos/search"


@router.get("/api/broll/search", response_model=list[BRollClip])
async def search_broll(
    q: str = Query(..., min_length=2, max_length=80),
    per_page: int = Query(default=12, ge=1, le=24),
    user_id: str = Depends(get_verified_user_id),
) -> list[BRollClip]:
    """Search Pexels for B-roll clips matching the query.

    Returns up to 24 clips per call. Free for the user; no credit deduction.
    """
    api_key = os.getenv("PEXELS_API_KEY")
    if not api_key:
        logger.warning("broll: PEXELS_API_KEY missing — returning empty list")
        return []

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                PEXELS_ENDPOINT,
                headers={"Authorization": api_key},
                params={"query": q, "per_page": per_page, "size": "medium"},
            )
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("broll: Pexels fetch failed: %s", exc)
        raise HTTPException(status_code=503, detail="B-roll search unavailable")

    out: list[BRollClip] = []
    for v in data.get("videos", [])[:per_page]:
        # Pick the file closest to 1280px wide (HD, small enough to embed quickly).
        files = sorted(
            v.get("video_files", []),
            key=lambda f: abs(f.get("width", 0) - 1280),
        )
        if not files:
            continue
        chosen = files[0]
        out.append(
            BRollClip(
                pexels_id=v["id"],
                title=v.get("user", {}).get("name", "Untitled"),
                duration_sec=float(v.get("duration", 5)),
                thumbnail_url=v.get("image", ""),
                download_url=chosen.get("link", ""),
                width=int(chosen.get("width", 1280)),
                height=int(chosen.get("height", 720)),
            )
        )

    logger.info("broll search user=%s q=%s results=%d", user_id, q, len(out))
    return out
