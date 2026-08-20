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
_AUTH_DISABLED_WARNED = False


def verify_bearer_token(token: str) -> str:
    """Decode a raw HS256 NextAuth/backend JWT → user_id. Raises HTTPException."""
    if not _NEXTAUTH_SECRET:
        logger.error("NEXTAUTH_SECRET is not set. Rejecting request.")
        raise HTTPException(
            status_code=503,
            detail="Authentication service misconfigured. Contact support.",
        )
    if not token or not str(token).strip():
        raise HTTPException(
            status_code=401,
            detail="Missing authorization token.",
        )
    try:
        payload = _jwt.decode(
            str(token).strip(),
            _NEXTAUTH_SECRET,
            algorithms=[_ALGORITHM],
            leeway=30,
        )
        user_id = payload.get("sub") or payload.get("id") or ""
        if not user_id:
            raise HTTPException(status_code=401, detail="Token missing user identity.")
        return str(user_id)
    except HTTPException:
        raise
    except _jwt.PyJWTError as exc:
        logger.warning("JWT verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid or expired token.")


def get_verified_user_id(
    authorization: str = Header(default=""),
) -> str:
    """FastAPI dependency. Returns verified user_id or raises 401.

    Usage in endpoint:
        user_id: str = Depends(get_verified_user_id)
    """
    _warn_auth_disabled_ignored()
    token = ""
    if authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    return verify_bearer_token(token)


def _warn_auth_disabled_ignored() -> None:
    """AUTH_DISABLED is not implemented. JWT is always required.

    If set in production, log once — never skip verification.
    """
    global _AUTH_DISABLED_WARNED
    raw = os.getenv("AUTH_DISABLED", "").strip().lower()
    if raw not in {"1", "true", "yes", "on"}:
        return
    if _AUTH_DISABLED_WARNED:
        return
    _AUTH_DISABLED_WARNED = True
    env = os.getenv("ENVIRONMENT", "").strip().lower()
    if env == "production":
        logger.error(
            "AUTH_DISABLED is set in production — ignored; JWT remains required"
        )
    else:
        logger.warning(
            "AUTH_DISABLED is set but not implemented — JWT remains required"
        )


# Back-compat alias for older call sites.
verify_access_token = verify_bearer_token
