"""Admin endpoints for YouTube cookie health monitoring."""

from __future__ import annotations

import os

from fastapi import APIRouter, Header, HTTPException
from typing import Optional

router = APIRouter(prefix="/api/admin/cookies", tags=["admin"])


def _check_admin(secret: Optional[str]) -> None:
    admin_secret = os.getenv("ADMIN_SECRET")
    if not admin_secret or secret != admin_secret:
        raise HTTPException(status_code=403, detail="Invalid admin secret")


@router.get("/status")
async def cookie_status(
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
):
    """Return cached cookie validity (safe to poll — cached for 1 hour)."""
    _check_admin(x_admin_secret)
    from services.cookie_rotator import get_cookie_status

    return get_cookie_status()


@router.post("/validate")
async def cookie_validate(
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
):
    """Force a live yt-dlp validation against the canary video (takes ~5–20s)."""
    _check_admin(x_admin_secret)
    from services.cookie_rotator import refresh_cookies_from_env

    return refresh_cookies_from_env()


@router.post("/invalidate")
async def cookie_invalidate(
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
):
    """Drop in-process cookie health cache so the next status check re-validates."""
    _check_admin(x_admin_secret)
    from services.cookie_rotator import invalidate_cookie_cache

    invalidate_cookie_cache("admin_invalidate")
    return {"ok": True, "message": "Cookie validation cache cleared"}
