"""FastAPI auth dependency — verifies NextAuth JWT tokens.

Reads Authorization: Bearer <nextauth_jwt> from incoming requests.
Decodes using NEXTAUTH_SECRET (same secret Next.js uses to sign JWTs).

Required env vars:
  NEXTAUTH_SECRET   — must match the Next.js NEXTAUTH_SECRET
"""

from __future__ import annotations

import logging
import os

from fastapi import Header, HTTPException
import jwt as _jwt  # PyJWT 2.x — replaces python-jose (Critical CVE GHSA-cjwg-qfpm-7377)

logger = logging.getLogger(__name__)

_NEXTAUTH_SECRET = os.getenv("NEXTAUTH_SECRET", "")
_ALGORITHM = "HS256"


def get_verified_user_id(
    authorization: str = Header(default=""),
) -> str:
    """FastAPI dependency. Returns verified user_id or raises 401.

    Usage in endpoint:
        user_id: str = Depends(get_verified_user_id)
    """
    if not _NEXTAUTH_SECRET:
        logger.error("NEXTAUTH_SECRET is not set. Rejecting request.")
        raise HTTPException(
            status_code=503,
            detail="Authentication service misconfigured. Contact support.",
        )

    token = ""
    if authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Missing authorization token.",
        )

    try:
        payload = _jwt.decode(
            token,
            _NEXTAUTH_SECRET,
            algorithms=[_ALGORITHM],
            leeway=30,
        )
        user_id = payload.get("sub") or payload.get("id") or ""
        if not user_id:
            raise HTTPException(status_code=401, detail="Token missing user identity.")
        return str(user_id)
    except _jwt.PyJWTError as exc:
        logger.warning("JWT verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
