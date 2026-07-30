"""ImprovMX outbound email API client (v3 Send API).

Auth: HTTP Basic — username ``api``, password = IMPROVMX_API_KEY.
Docs: https://improvmx.com/api/ — POST /domains/:domain/emails/outbound
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

API_BASE = "https://api.improvmx.com/v3"
DEFAULT_DOMAIN = "quickaishort.online"

# Unified verified ImprovMX channel — contact@ only (no split inboxes).
_CONTACT = "contact@quickaishort.online"
SUPPORT_EMAIL = os.environ.get("SUPPORT_EMAIL", _CONTACT) or _CONTACT
FEEDBACK_EMAIL = os.environ.get("FEEDBACK_EMAIL", _CONTACT) or _CONTACT
GENERAL_EMAIL = os.environ.get("GENERAL_EMAIL", _CONTACT) or _CONTACT


def _api_key() -> str:
    return os.environ.get("IMPROVMX_API_KEY", "").strip().strip("\r\n")


def _domain() -> str:
    return (
        os.environ.get("IMPROVMX_DOMAIN", DEFAULT_DOMAIN).strip().strip("\r\n")
        or DEFAULT_DOMAIN
    )


def default_from_alias() -> str:
    return (
        os.environ.get("IMPROVMX_FROM_ALIAS", "noreply").strip().strip("\r\n")
        or "noreply"
    )


def default_reply_to() -> str:
    return (
        os.environ.get("IMPROVMX_REPLY_TO", "").strip().strip("\r\n")
        or os.environ.get("SUPPORT_EMAIL", "").strip().strip("\r\n")
        or _CONTACT
    )


def is_configured() -> bool:
    return bool(_api_key())


async def send_email(
    *,
    to: str | list[str],
    subject: str,
    html: str | None = None,
    text: str | None = None,
    from_alias: str | None = None,
    reply_to: str | None = None,
    cc: str | list[str] | None = None,
    bcc: str | list[str] | None = None,
) -> dict[str, Any]:
    """Send one outbound email via ImprovMX. Returns API JSON on success."""
    if not is_configured():
        return {"success": False, "error": "skipped_no_api_key"}

    if not html and not text:
        return {"success": False, "error": "html_or_text_required"}

    domain = _domain()
    payload: dict[str, Any] = {
        "from": from_alias or default_from_alias(),
        "to": to,
        "subject": subject,
    }
    if html:
        payload["html"] = html
    if text:
        payload["text"] = text
    if reply_to:
        payload["reply_to"] = reply_to
    elif default_reply_to():
        payload["reply_to"] = default_reply_to()
    if cc:
        payload["cc"] = cc
    if bcc:
        payload["bcc"] = bcc

    url = f"{API_BASE}/domains/{domain}/emails/outbound"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                json=payload,
                auth=("api", _api_key()),
                headers={"Content-Type": "application/json"},
            )
        body = response.json() if response.content else {}
        if response.status_code >= 400:
            detail = body.get("errors") or body.get("error") or response.text[:300]
            logger.warning(
                "improvmx_send_failed status=%s detail=%s", response.status_code, detail
            )
            return {
                "success": False,
                "error": str(detail),
                "status_code": response.status_code,
            }
        return body if isinstance(body, dict) else {"success": True, "raw": body}
    except Exception as exc:
        logger.warning("improvmx_send_exception err=%s", exc)
        return {"success": False, "error": str(exc)}
