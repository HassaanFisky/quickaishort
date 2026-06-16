"""Transactional email via Resend.

Resend account + RESEND_API_KEY must be provisioned before sends actually
go out — see docs/SENTRY_SETUP.md sibling note in CLAUDE.md §13. Until then,
every call here logs a "skipped_no_api_key" attempt to Firestore and returns
False without raising, so signup/billing flows are never blocked by email.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone

import resend

from services.db import get_db, is_ready

logger = logging.getLogger(__name__)

EMAIL_LOG_COLLECTION = "email_log"
FROM_ADDRESS = os.environ.get(
    "RESEND_FROM_ADDRESS", "QuickAI Short <onboarding@quickaishort.online>"
)

_client_ready = False


def _ensure_client() -> bool:
    global _client_ready
    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key:
        return False
    if not _client_ready:
        resend.api_key = api_key
        _client_ready = True
    return True


async def _log_attempt(kind: str, to_email: str, status: str, detail: str = "") -> None:
    if not is_ready():
        return

    def _do():
        get_db().collection(EMAIL_LOG_COLLECTION).document().set(
            {
                "kind": kind,
                "to": to_email,
                "status": status,
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
</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>"""


async def _send(kind: str, to_email: str, subject: str, html: str) -> bool:
    if not _ensure_client():
        await _log_attempt(kind, to_email, "skipped_no_api_key")
        return False
    try:
        await asyncio.to_thread(
            resend.Emails.send,
            {"from": FROM_ADDRESS, "to": to_email, "subject": subject, "html": html},
        )
        await _log_attempt(kind, to_email, "sent")
        return True
    except Exception as exc:
        logger.warning("email_send_failed kind=%s to=%s err=%s", kind, to_email, exc)
        await _log_attempt(kind, to_email, "failed", str(exc))
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
    return await _send("pro_activation", user_email, "Welcome to QuickAI Short Pro", html)


async def send_weekly_digest(user_email: str, stats: dict) -> bool:
    """Not triggered by any scheduled job yet — the trigger (Cloud Scheduler
    + per-user opt-in check) is Phase 47/48 territory. Function exists now so
    the email template and send path are ready when that job is wired."""
    html = _brand_wrapper(
        "Your week on QuickAI Short",
        f"Exports: {stats.get('export_count', 0)} &middot; "
        f"AI runs: {stats.get('ai_runs', 0)} &middot; "
        f"Credits remaining: {stats.get('credits_balance', 0)}",
    )
    return await _send("weekly_digest", user_email, "Your week on QuickAI Short", html)
