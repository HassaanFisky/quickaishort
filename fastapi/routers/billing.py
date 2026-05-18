"""Paddle Billing webhook router.

Handles Paddle Billing (v2) webhook events.
Signature verification uses ed25519 — the PADDLE_WEBHOOK_SECRET env var must be set
to the base64-encoded public key shown in the Paddle dashboard after registering the
webhook endpoint.

Idempotency: every processed event ID is stored in the `paddle_webhook_events`
collection so replays never double-credit a user.
"""

from __future__ import annotations

import base64
import logging
import os
from datetime import datetime, timezone

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import APIRouter, HTTPException, Request
from pymongo import ASCENDING
from bson import ObjectId

from services.db import get_db, is_ready

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])

PADDLE_WEBHOOK_EVENTS_COLLECTION = "paddle_webhook_events"
PRO_MONTHLY_CREDITS = 100


# ---------------------------------------------------------------------------
# Signature verification
# ---------------------------------------------------------------------------


def _verify_paddle_signature(
    raw_body: bytes, signature_header: str, secret: str
) -> bool:
    """
    Verify Paddle Billing ed25519 webhook signature.

    Paddle header format: ts=<unix_ts>;h1=<base64_signature>
    Signed payload:       <ts>:<raw_body_utf8>
    Public key:           base64-decoded PADDLE_WEBHOOK_SECRET
    """
    try:
        parts: dict[str, str] = {}
        for segment in signature_header.split(";"):
            if "=" in segment:
                k, v = segment.split("=", 1)
                parts[k.strip()] = v.strip()

        ts = parts.get("ts", "")
        h1 = parts.get("h1", "")
        if not ts or not h1:
            logger.warning("paddle_sig: missing ts or h1 in header")
            return False

        signed_payload = f"{ts}:{raw_body.decode('utf-8')}".encode()
        pub_key_bytes = base64.b64decode(secret)
        signature_bytes = base64.b64decode(h1)

        pub_key = Ed25519PublicKey.from_public_bytes(pub_key_bytes)
        pub_key.verify(signature_bytes, signed_payload)
        return True

    except InvalidSignature:
        logger.warning(
            "paddle_sig: signature mismatch — possible forgery or wrong secret"
        )
        return False
    except Exception as exc:
        logger.error("paddle_sig: verification error: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Idempotency helper
# ---------------------------------------------------------------------------


async def _is_event_processed(event_id: str) -> bool:
    """Return True if this event_id has already been handled."""
    if not is_ready():
        return False
    db = get_db()
    return bool(
        await db[PADDLE_WEBHOOK_EVENTS_COLLECTION].find_one({"event_id": event_id})
    )


async def _mark_event_processed(event_id: str, event_type: str) -> None:
    if not is_ready():
        return
    db = get_db()
    await db[PADDLE_WEBHOOK_EVENTS_COLLECTION].insert_one(
        {
            "event_id": event_id,
            "event_type": event_type,
            "processed_at": datetime.now(timezone.utc),
        }
    )


async def _ensure_indexes() -> None:
    """Create unique index on event_id — called once at startup."""
    if not is_ready():
        return
    try:
        db = get_db()
        await db[PADDLE_WEBHOOK_EVENTS_COLLECTION].create_index(
            [("event_id", ASCENDING)],
            unique=True,
        )
    except Exception as exc:
        logger.warning("paddle_indexes: %s", exc)


# ---------------------------------------------------------------------------
# Subscription grant helper
# ---------------------------------------------------------------------------


async def _grant_pro(user_id: str, subscription_id: str) -> None:
    """Set is_pro=True, is_premium=True, add PRO_MONTHLY_CREDITS, record subscription ID."""
    if not is_ready():
        logger.error("paddle_grant_pro: DB not ready for user %s", user_id)
        return
    db = get_db()
    result = await db["UserStats"].update_one(
        {"user_id": user_id},
        {
            "$set": {
                "is_pro": True,
                "is_premium": True,
                "paddle_subscription_id": subscription_id,
                "updated_at": datetime.now(timezone.utc),
            },
            "$inc": {"credits_balance": PRO_MONTHLY_CREDITS},
        },
        upsert=True,
    )
    logger.info(
        "paddle_grant_pro user=%s sub=%s matched=%d modified=%d",
        user_id,
        subscription_id,
        result.matched_count,
        result.modified_count,
    )

    # 2. Sync with NextAuth users collection for frontend session
    try:
        # Check if user_id is a valid ObjectId, if not use it as email
        query = (
            {"_id": ObjectId(user_id)}
            if ObjectId.is_valid(user_id)
            else {"email": user_id}
        )
        await db["users"].update_one(
            query,
            {
                "$set": {
                    "isPro": True,
                    "isPremium": True,
                    "updatedAt": datetime.now(timezone.utc),
                }
            },
        )
        logger.info("paddle_grant_pro: synced with users collection for %s", user_id)
    except Exception as exc:
        logger.warning("paddle_grant_pro: users sync failed: %s", exc)

    # 3. Invalidate Redis premium and stats caches so next API call re-reads from DB
    try:
        from services.stats_service import invalidate_premium_cache
        from services.queue_service import async_redis_conn

        await invalidate_premium_cache(user_id)
        await async_redis_conn.delete(f"stats:{user_id}")
    except Exception as exc:
        logger.warning("paddle_cache_invalidation failed: %s", exc)


async def _revoke_pro(user_id: str, subscription_id: str) -> None:
    """Revoke Pro access on cancellation."""
    if not is_ready():
        return
    db = get_db()
    await db["UserStats"].update_one(
        {"user_id": user_id},
        {
            "$set": {
                "is_pro": False,
                "is_premium": False,
                "paddle_subscription_id": None,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    logger.info("paddle_revoke_pro user=%s sub=%s", user_id, subscription_id)

    # 2. Sync with NextAuth users collection for frontend session
    try:
        query = (
            {"_id": ObjectId(user_id)}
            if ObjectId.is_valid(user_id)
            else {"email": user_id}
        )
        await db["users"].update_one(
            query,
            {
                "$set": {
                    "isPro": False,
                    "isPremium": False,
                    "updatedAt": datetime.now(timezone.utc),
                }
            },
        )
        logger.info("paddle_revoke_pro: synced with users collection for %s", user_id)
    except Exception as exc:
        logger.warning("paddle_revoke_pro: users sync failed: %s", exc)

    try:
        from services.stats_service import invalidate_premium_cache
        from services.queue_service import async_redis_conn

        await invalidate_premium_cache(user_id)
        await async_redis_conn.delete(f"stats:{user_id}")
    except Exception as exc:
        logger.warning("paddle_cache_invalidation failed: %s", exc)


# ---------------------------------------------------------------------------
# Webhook endpoint
# ---------------------------------------------------------------------------


@router.post("/webhook/paddle")
async def paddle_webhook(request: Request):
    """
    Receives and processes Paddle Billing v2 webhook events.

    Must be registered in the Paddle dashboard as:
      POST https://<your-api>/api/billing/webhook/paddle

    After registering, copy the generated webhook secret (ed25519 public key)
    into env.yaml as PADDLE_WEBHOOK_SECRET.
    """
    raw_body = await request.body()

    # ---- 1. Signature verification ----------------------------------------
    webhook_secret = os.environ.get("PADDLE_WEBHOOK_SECRET", "")
    if not webhook_secret or webhook_secret == "SET_AFTER_PADDLE_WEBHOOK_REGISTRATION":
        logger.error("PADDLE_WEBHOOK_SECRET not configured — rejecting webhook")
        raise HTTPException(status_code=503, detail="Webhook secret not configured")

    signature_header = request.headers.get("Paddle-Signature", "")
    if not signature_header:
        logger.warning("paddle_webhook: missing Paddle-Signature header")
        raise HTTPException(status_code=400, detail="Missing Paddle-Signature header")

    if not _verify_paddle_signature(raw_body, signature_header, webhook_secret):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    # ---- 2. Parse event ---------------------------------------------------
    try:
        import json

        payload = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_id: str = payload.get("event_id", "")
    event_type: str = payload.get("event_type", "")
    data: dict = payload.get("data", {})

    if not event_id or not event_type:
        raise HTTPException(status_code=400, detail="Missing event_id or event_type")

    logger.info("paddle_webhook event_id=%s type=%s", event_id, event_type)

    # ---- 3. Idempotency check --------------------------------------------
    if await _is_event_processed(event_id):
        logger.info("paddle_webhook duplicate event_id=%s — skipping", event_id)
        return {"status": "already_processed"}

    # ---- 4. Route by event type ------------------------------------------
    try:
        if event_type in ("subscription.created", "subscription.activated"):
            subscription_id: str = data.get("id", "")
            custom_data: dict = data.get("custom_data") or {}
            user_id: str = custom_data.get("userId", "")

            if not user_id:
                logger.error(
                    "paddle_webhook: no userId in custom_data for event %s — cannot grant Pro",
                    event_id,
                )
            else:
                await _grant_pro(user_id, subscription_id)

        elif event_type == "subscription.updated":
            subscription_id = data.get("id", "")
            custom_data = data.get("custom_data") or {}
            user_id = custom_data.get("userId", "")
            status = data.get("status", "")

            if user_id:
                if status == "active":
                    await _grant_pro(user_id, subscription_id)
                elif status in ("canceled", "past_due", "paused"):
                    await _revoke_pro(user_id, subscription_id)

        elif event_type == "subscription.canceled":
            subscription_id = data.get("id", "")
            custom_data = data.get("custom_data") or {}
            user_id = custom_data.get("userId", "")
            if user_id:
                await _revoke_pro(user_id, subscription_id)

        else:
            logger.debug("paddle_webhook: unhandled event type %s", event_type)

    except Exception as exc:
        logger.error("paddle_webhook handler error event=%s: %s", event_id, exc)
        # Return 200 anyway — prevents Paddle from retrying an internal error endlessly.
        # The event will NOT be marked processed so manual re-run is possible.
        return {"status": "handler_error", "detail": str(exc)}

    # ---- 5. Mark processed -----------------------------------------------
    try:
        await _mark_event_processed(event_id, event_type)
    except Exception as exc:
        # Unique-index violation = race condition double-delivery. Safe to ignore.
        logger.debug("paddle_webhook: mark_processed error (likely duplicate): %s", exc)

    return {"status": "ok"}
