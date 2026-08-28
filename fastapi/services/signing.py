"""HMAC-SHA256 signed download URLs for rendered exports."""

import hashlib
import hmac
import os
import time

# L5: default shortened from 24h — override with EXPORT_URL_TTL_SECONDS.
DEFAULT_TTL_SECONDS = 4 * 60 * 60


def _secret() -> bytes:
    secret = os.environ.get("EXPORT_SIGNING_SECRET")
    if not secret:
        raise RuntimeError(
            "EXPORT_SIGNING_SECRET is not set. Generate one with `openssl rand -hex 32`."
        )
    return secret.encode("utf-8")


def _ttl() -> int:
    return int(os.environ.get("EXPORT_URL_TTL_SECONDS", str(DEFAULT_TTL_SECONDS)))


def sign(job_id: str, user_id: str, expires_at: int | None = None) -> tuple[str, int]:
    """Return (token, expiry_unix_seconds) for a job_id+user_id pair."""
    expiry = expires_at if expires_at is not None else int(time.time()) + _ttl()
    payload = f"{job_id}|{user_id}|{expiry}".encode("utf-8")
    digest = hmac.new(_secret(), payload, hashlib.sha256).hexdigest()
    return digest, expiry


def verify(job_id: str, user_id: str, expiry: int, token: str) -> bool:
    if expiry < int(time.time()):
        return False
    expected, _ = sign(job_id, user_id, expires_at=expiry)
    return hmac.compare_digest(expected, token)


# ── Media proxy tokens (F-1) ─────────────────────────────────────────────────
#
# /api/proxy, /api/proxy-video and /api/audio are consumed by browser media
# elements (`<video src>`) and by bare `fetch()` in the audio extractor. Neither
# can send an Authorization header, so a bearer JWT cannot be used — the
# credential has to travel in the URL. This is the same trust boundary
# /api/download already solves, so it reuses this module's HMAC rather than
# introducing a second signing system.
#
# Tokens are domain-separated from export tokens by the "media:v1" prefix: an
# export token can never be replayed as a media token, or vice versa, even
# though both are HMACs under EXPORT_SIGNING_SECRET.
#
# Short TTL by default — these authorize expensive egress, not durable content.
MEDIA_TOKEN_DEFAULT_TTL_SECONDS = 60 * 60
_MEDIA_DOMAIN = "media:v1"


def _media_ttl() -> int:
    return int(
        os.environ.get(
            "MEDIA_PROXY_TOKEN_TTL_SECONDS", str(MEDIA_TOKEN_DEFAULT_TTL_SECONDS)
        )
    )


def sign_media_url(
    source_url: str, user_id: str, expires_at: int | None = None
) -> tuple[str, int]:
    """Return (token, expiry_unix_seconds) binding a source URL to a user.

    The token commits to the exact `source_url`, so it cannot be reused to
    proxy a different video.
    """
    expiry = expires_at if expires_at is not None else int(time.time()) + _media_ttl()
    payload = f"{_MEDIA_DOMAIN}|{source_url}|{user_id}|{expiry}".encode("utf-8")
    digest = hmac.new(_secret(), payload, hashlib.sha256).hexdigest()
    return digest, expiry


def verify_media_url(source_url: str, user_id: str, expiry: int, token: str) -> bool:
    """Timing-safe verification of a media proxy token. Never raises on bad input."""
    if not token or not user_id:
        return False
    try:
        if int(expiry) < int(time.time()):
            return False
    except (TypeError, ValueError):
        return False
    expected, _ = sign_media_url(source_url, user_id, expires_at=int(expiry))
    return hmac.compare_digest(expected, str(token))
