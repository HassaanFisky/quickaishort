"""FastAPI auth dependency — verifies NextAuth JWT tokens.

Reads Authorization: Bearer <nextauth_jwt> from incoming requests.
Decodes using NEXTAUTH_SECRET (same secret Next.js uses to sign JWTs).
Falls back safely: if AUTH_DISABLED=true in env, skips verification and
returns the user_id from the request body (dev/testing only).

Required env vars:
  NEXTAUTH_SECRET   — must match the Next.js NEXTAUTH_SECRET
  AUTH_DISABLED     — set to "true" to bypass auth (development only)
"""

from __future__ import annotations

import logging
import os

from fastapi import Header, HTTPException
from jose import JWTError, jwt

logger = logging.getLogger(__name__)

_AUTH_DISABLED = os.getenv("AUTH_DISABLED", "false").lower() == "true"
_NEXTAUTH_SECRET = os.getenv("NEXTAUTH_SECRET", "")
_ALGORITHM = "HS256"


def get_verified_user_id(
    authorization: str = Header(default=""),
    x_user_id: str = Header(default="", alias="X-User-Id"),
) -> str:
    """FastAPI dependency. Returns verified user_id or raises 401.

    Usage in endpoint:
        user_id: str = Depends(get_verified_user_id)
    """
    if _AUTH_DISABLED:
        # Dev bypass — caller must still supply a non-empty user_id via X-User-Id header
        # or fall back to anonymous.  No security guarantee in this mode.
        logger.debug("Auth bypassed (AUTH_DISABLED=true)")
        return x_user_id or "anonymous"

    if not _NEXTAUTH_SECRET:
        # Secret not configured — refuse all requests to prevent silent data leaks.
        logger.error("NEXTAUTH_SECRET not set but AUTH_DISABLED is false. Rejecting request.")
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
        payload = jwt.decode(token, _NEXTAUTH_SECRET, algorithms=[_ALGORITHM])
        user_id = payload.get("sub") or payload.get("id") or ""
        if not user_id:
            raise HTTPException(status_code=401, detail="Token missing user identity.")
        return str(user_id)
    except JWTError as exc:
        logger.warning("JWT verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
