"""Shared SlowAPI limiter — importable from routers without circular main imports.

Author: QuickAI Engineering
Last modified: 2026-08-02
"""

from __future__ import annotations

from fastapi import Request
from slowapi import Limiter


def get_real_ip(request: Request) -> str:
    """Cloud Run / Vercel: leftmost X-Forwarded-For; else direct peer."""
    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


limiter = Limiter(key_func=get_real_ip, default_limits=["200/minute"])
