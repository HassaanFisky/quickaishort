"""EP-008 — Media Ingest Policy (authoritative formats/limits).

Separate from EP-001 Capability Registry (edit tools). Ops-tunable defaults.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

# Minimum set required by EP-008 DoD
_DEFAULT_EXTENSIONS = (
    ".mp4",
    ".mov",
    ".mkv",
    ".webm",
    ".avi",
    ".m4v",
    ".mpeg",
    ".mpg",
    ".ts",
    ".mts",
    ".m2ts",
    ".wmv",
    ".flv",
    ".3gp",
    ".ogv",
)

_DEFAULT_MIME = (
    "video/mp4",
    "video/quicktime",
    "video/x-matroska",
    "video/webm",
    "video/x-msvideo",
    "video/mpeg",
    "video/mp2t",
    "video/x-ms-wmv",
    "video/x-flv",
    "video/3gpp",
    "video/ogg",
)

# 2 GiB warn / 5 GiB hard (EP-008)
_DEFAULT_WARN_BYTES = 2 * 1024 * 1024 * 1024
_DEFAULT_MAX_BYTES = 5 * 1024 * 1024 * 1024


def get_ingest_policy() -> dict[str, Any]:
    """Return authoritative ingest policy (env-overridable sizes)."""
    warn = int(os.environ.get("STUDIO_INGEST_WARN_BYTES", str(_DEFAULT_WARN_BYTES)))
    max_b = int(os.environ.get("STUDIO_INGEST_MAX_BYTES", str(_DEFAULT_MAX_BYTES)))
    return {
        "version": 1,
        "extensions": list(_DEFAULT_EXTENSIONS),
        "mime_types": list(_DEFAULT_MIME),
        "max_bytes": max_b,
        "warn_bytes": warn,
        "examples_label": "MP4, MOV, MKV, WebM, AVI, and more",
    }


def validate_ingest_file(
    *,
    filename: str,
    content_type: str,
    byte_size: Optional[int] = None,
) -> Optional[dict[str, str]]:
    """Return error detail dict if invalid, else None.

    Shape: {"code": "unsupported_format"|"too_large", "message": "..."}
    """
    policy = get_ingest_policy()
    ext = Path(filename or "").suffix.lower()
    mime = (content_type or "").split(";")[0].strip().lower()

    ext_ok = ext in policy["extensions"] if ext else False
    mime_ok = mime in policy["mime_types"] if mime else False
    # Accept if extension OR mime matches (browsers vary on MIME for MKV/AVI)
    if not ext_ok and not mime_ok:
        return {
            "code": "unsupported_format",
            "message": (
                f"Unsupported format{f' ({ext})' if ext else ''}. "
                f"Try {policy['examples_label']}."
            ),
        }

    if byte_size is not None and byte_size > int(policy["max_bytes"]):
        max_gb = int(policy["max_bytes"]) / (1024**3)
        return {
            "code": "too_large",
            "message": f"File exceeds the {max_gb:.0f} GiB upload limit.",
        }
    return None
