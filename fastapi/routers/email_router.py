"""Internal, server-to-server endpoints that trigger transactional email.

Protected by the same X-Admin-Secret header used by /api/admin/* — these are
never called from a browser directly, only from the Next.js server, which
holds ADMIN_SECRET as a server-only env var (never exposed to the client
bundle). The Next.js side must have the same ADMIN_SECRET value configured
in its own server environment for these calls to succeed.
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, field_validator

from services.email_service import send_pro_activation_email, send_welcome_email

router = APIRouter(prefix="/api/internal/email", tags=["email"])


class SendEmailRequest(BaseModel):
    email: str
    name: str = ""

    @field_validator("email")
    @classmethod
    def _basic_email_shape(cls, v: str) -> str:
        if "@" not in v or len(v) > 320:
            raise ValueError("invalid email")
        return v


def _verify_secret(x_admin_secret: Optional[str]) -> None:
    expected = os.getenv("ADMIN_SECRET")
    if not expected or x_admin_secret != expected:
        raise HTTPException(status_code=403, detail="Invalid admin secret")


@router.post("/welcome")
async def trigger_welcome_email(
    body: SendEmailRequest,
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
) -> dict:
    _verify_secret(x_admin_secret)
    sent = await send_welcome_email(body.email, body.name)
    return {"sent": sent}


@router.post("/pro-activation")
async def trigger_pro_activation_email(
    body: SendEmailRequest,
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
) -> dict:
    _verify_secret(x_admin_secret)
    sent = await send_pro_activation_email(body.email, body.name)
    return {"sent": sent}
