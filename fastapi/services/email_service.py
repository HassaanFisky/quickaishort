"""Transactional email via ImprovMX Send API with Resend fallback.

ImprovMX free = inbound only (send_ready=false). Until Light/Premium is
purchased, outbound uses Resend when RESEND_API_KEY is set so signup /
billing emails are not silently dropped.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx

from services.db import get_db, is_ready
from services.improvmx_service import (
    GENERAL_EMAIL,
    is_configured as improvmx_configured,
    send_email as improvmx_send,
)

logger = logging.getLogger(__name__)

EMAIL_LOG_COLLECTION = "email_log"
RESEND_API_URL = "https://api.resend.com/emails"


async def _log_attempt(
    kind: str, to_email: str, status: str, detail: str = "", provider: str = ""
) -> None:
    if not is_ready():
        return

    def _do() -> None:
        get_db().collection(EMAIL_LOG_COLLECTION).document().set(
            {
                "kind": kind,
                "to": to_email,
                "status": status,
                "provider": provider,
                "detail": detail[:300],
                "sent_at": datetime.now(timezone.utc),
            }
        )

    try:
        await asyncio.to_thread(_do)
    except Exception as exc:
        logger.warning("email_log_write_failed: %s", exc)


def _brand_wrapper(title: str, body_html: str) -> str:
    return f"""<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:Inter,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#111113;border:1px solid #26262b;border-radius:16px;overflow:hidden;">
<tr><td style="padding:32px;">
<p style="margin:0 0 24px;font-weight:900;font-size:14px;letter-spacing:0.1em;color:#a855f7;text-transform:uppercase;">QuickAI Short</p>
<h1 style="margin:0 0 16px;font-size:22px;color:#f4f4f5;">{title}</h1>
<div style="color:#a1a1aa;font-size:14px;line-height:1.6;">{body_html}</div>
<p style="margin:32px 0 0;font-size:11px;color:#52525b;">
You're receiving this because you have an account at quickaishort.online.
Questions? Reply to {GENERAL_EMAIL}.
</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>"""


def _resend_configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY", "").strip())


def _improvmx_unavailable(error: str) -> bool:
    e = error.lower()
    return any(
        token in e
        for token in (
            "premium",
            "forbidden",
            "not found",
            "404",
            "403",
            "send_ready",
            "not configured for sending",
            "skipped_no_api_key",
        )
    )


async def _send_resend(to_email: str, subject: str, html: str) -> dict[str, Any]:
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    if not api_key:
        return {"success": False, "error": "skipped_no_resend_key"}

    domain = os.environ.get("IMPROVMX_DOMAIN", "quickaishort.online").strip()
    alias = os.environ.get("IMPROVMX_FROM_ALIAS", "noreply").strip() or "noreply"
    from_addr = (
        os.environ.get("RESEND_FROM_EMAIL", "").strip() or f"{alias}@{domain}"
    )
    reply_to = (
        os.environ.get("IMPROVMX_REPLY_TO", "").strip()
        or os.environ.get("SUPPORT_EMAIL", "").strip()
        or os.environ.get("GENERAL_EMAIL", "").strip()
        or "contact@quickaishort.online"
    )

    payload = {
        "from": from_addr,
        "to": [to_email],
        "subject": subject,
        "html": html,
        "reply_to": reply_to,
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                RESEND_API_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
        body = response.json() if response.content else {}
        if response.status_code >= 400:
            detail = body.get("message") or body.get("name") or response.text[:300]
            return {"success": False, "error": str(detail), "status_code": response.status_code}
        return {"success": True, "id": body.get("id"), "provider": "resend"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


async def email_provider_status() -> dict[str, Any]:
    """Lightweight readiness snapshot for ops (no secrets)."""
    return {
        "improvmx_configured": improvmx_configured(),
        "resend_configured": _resend_configured(),
        "from_alias": os.environ.get("IMPROVMX_FROM_ALIAS", "noreply").strip() or "noreply",
        "domain": os.environ.get("IMPROVMX_DOMAIN", "quickaishort.online").strip(),
        "support_email": os.environ.get("SUPPORT_EMAIL", "contact@quickaishort.online"),
        "note": (
            "ImprovMX free cannot send (daily_send=0). "
            "Outbound uses Resend fallback until ImprovMX Light/Premium."
        ),
    }


async def _send(kind: str, to_email: str, subject: str, html: str) -> bool:
    if improvmx_configured():
        try:
            result = await improvmx_send(to=to_email, subject=subject, html=html)
            if result.get("success") is not False and not result.get("error"):
                await _log_attempt(kind, to_email, "sent", provider="improvmx")
                return True
            detail = str(result.get("error", "send_failed"))
            await _log_attempt(kind, to_email, "failed", detail, provider="improvmx")
            if not _improvmx_unavailable(detail) and not _resend_configured():
                return False
        except Exception as exc:
            logger.warning("improvmx_send_failed kind=%s err=%s", kind, exc)
            await _log_attempt(kind, to_email, "failed", str(exc), provider="improvmx")
    else:
        await _log_attempt(kind, to_email, "skipped_no_api_key", provider="improvmx")

    if _resend_configured():
        result = await _send_resend(to_email, subject, html)
        if result.get("success"):
            await _log_attempt(
                kind, to_email, "sent", "fallback_after_improvmx", provider="resend"
            )
            logger.info("email_sent_via_resend_fallback kind=%s", kind)
            return True
        await _log_attempt(
            kind,
            to_email,
            "failed",
            str(result.get("error", "resend_failed")),
            provider="resend",
        )
        return False

    await _log_attempt(
        kind,
        to_email,
        "failed",
        "no_outbound_provider: upgrade ImprovMX or set RESEND_API_KEY",
        provider="none",
    )
    return False


async def send_welcome_email(user_email: str, user_name: str) -> bool:
    html = _brand_wrapper(
        f"Welcome, {user_name or 'there'}",
        "Your browser-native AI video editor is ready. Paste a YouTube URL or upload a clip to "
        "start editing — everything runs on your device, no upload wait."
        '<br><br><a href="https://quickaishort.online/editor" style="color:#a855f7;font-weight:700;">'
        "Open the editor →</a>",
    )
    return await _send("welcome", user_email, "Welcome to QuickAI Short", html)


async def send_pro_activation_email(user_email: str, user_name: str) -> bool:
    html = _brand_wrapper(
        "Welcome to Pro",
        f"Hi {user_name or 'there'} — Elite Viral Intelligence, unlimited Pre-Flight runs, and "
        "priority processing are unlocked on your account."
        '<br><br><a href="https://quickaishort.online/editor?welcome=1" style="color:#a855f7;font-weight:700;">'
        "Start editing →</a>",
    )
    return await _send(
        "pro_activation", user_email, "Welcome to QuickAI Short Pro", html
    )


async def send_weekly_digest(user_email: str, stats: dict) -> bool:
    """Not triggered by any scheduled job yet — template ready for Phase 47/48."""
    html = _brand_wrapper(
        "Your week on QuickAI Short",
        f"Exports: {stats.get('export_count', 0)} &middot; "
        f"AI runs: {stats.get('ai_runs', 0)} &middot; "
        f"Credits remaining: {stats.get('credits_balance', 0)}",
    )
    return await _send("weekly_digest", user_email, "Your week on QuickAI Short", html)
