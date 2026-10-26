"""Shared SlowAPI limiter — importable from routers without circular main imports.

Author: QuickAI Engineering
Last modified: 2026-10-26 (SEC-02 hardened IP resolution)
"""

from __future__ import annotations

import ipaddress
import os
from typing import Optional

from fastapi import Request
from slowapi import Limiter


def _is_trusted_proxy_enabled() -> bool:
    """Check if proxy headers should be trusted.

    Defaults to True in production (Cloud Run / Vercel), or when
    TRUST_PROXY_HEADERS / BEHIND_PROXY is explicitly enabled.
    """
    explicit = os.getenv("TRUST_PROXY_HEADERS")
    if explicit is not None:
        return explicit.strip().lower() in ("true", "1", "yes")
    behind_proxy = os.getenv("BEHIND_PROXY")
    if behind_proxy is not None:
        return behind_proxy.strip().lower() in ("true", "1", "yes")
    env = os.getenv("ENVIRONMENT", "").strip().lower()
    return env == "production"


def get_real_ip(request: Request) -> str:
    """Extract client IP safely without allowing client-controlled XFF spoofing.

    In direct mode (not behind a trusted proxy), always uses request.client.host.
    When behind a trusted proxy (e.g. Cloud Run, Vercel), uses the rightmost
    IP from X-Forwarded-For (the IP appended by the trusted ingress proxy),
    preventing clients from spoofing their IP via prepended headers.
    """
    direct_ip = request.client.host if request.client else "127.0.0.1"

    if not _is_trusted_proxy_enabled():
        return direct_ip

    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        hops = [h.strip() for h in xff.split(",") if h.strip()]
        if hops:
            try:
                proxy_count = int(os.getenv("TRUSTED_PROXIES_COUNT", "1"))
            except ValueError:
                proxy_count = 1
            idx = -proxy_count if len(hops) >= proxy_count else 0
            candidate = hops[idx]
            try:
                ipaddress.ip_address(candidate)
                return candidate
            except ValueError:
                pass

    return direct_ip


limiter = Limiter(key_func=get_real_ip, default_limits=["200/minute"])
