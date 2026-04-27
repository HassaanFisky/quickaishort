"""HMAC-SHA256 signed download URLs for rendered exports."""

import hashlib
import hmac
import os
import time

DEFAULT_TTL_SECONDS = 24 * 60 * 60


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
