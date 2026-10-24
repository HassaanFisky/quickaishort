"""Firestore + GCS client initialization with zero-daemon local fallback.

Uses Application Default Credentials on Cloud Run.
Falls back cleanly to LocalSQLiteDB and LocalGCSBucket when in LOCAL_FIRST_MODE
or when external GCP credentials/services are uninitialized.
Call init_db() at FastAPI startup (lifespan) or init_db_sync() in RQ workers.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

GCS_BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME", "quickaishort-agent-494304-media")

# Path-prefix constants kept for callers that import them (unchanged semantics).
EXPORTS_BUCKET = "exports"
UPLOADS_BUCKET = "uploads"

_db: Any = None
_gcs_client: Any = None
_gcs_bucket: Any = None
_ready: bool = False
_is_local_mode: bool = False


def _init() -> None:
    global _db, _gcs_client, _gcs_bucket, _ready, _is_local_mode
    from services.local_persistence import (
        get_local_bucket,
        get_local_db,
        is_local_first_mode,
    )

    if is_local_first_mode():
        _db = get_local_db()
        _gcs_bucket = get_local_bucket()
        _is_local_mode = True
        _ready = True
        logger.info("Local-first persistence initialized (SQLite + Local Storage)")
        return

    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "quickaishort-agent-494304")
    try:
        from google.cloud import firestore
        from google.cloud import storage as gcs

        _db = firestore.Client(project=project)
        _gcs_client = gcs.Client(project=project)
        _gcs_bucket = _gcs_client.bucket(GCS_BUCKET_NAME)
        _ready = True
        logger.info(
            "Firestore + GCS initialized (project=%s, bucket=%s)",
            project,
            GCS_BUCKET_NAME,
        )
    except Exception as exc:
        logger.warning(
            "Cloud DB init failed (%s) -- falling back to local SQLite/Storage",
            exc,
        )
        _db = get_local_db()
        _gcs_bucket = get_local_bucket()
        _is_local_mode = True
        _ready = True


async def init_db() -> None:
    """Async wrapper for FastAPI lifespan compatibility."""
    _init()


def init_db_sync() -> None:
    """Synchronous init for RQ render workers (no running event loop needed)."""
    _init()


async def close_db() -> None:
    global _db, _gcs_client, _gcs_bucket, _ready, _is_local_mode
    _db = None
    _gcs_client = None
    _gcs_bucket = None
    _ready = False
    _is_local_mode = False


def get_db() -> Any:

    if _db is None:
        _init()
    return _db


def get_gcs_bucket() -> Any:

    if _gcs_bucket is None:
        _init()
    return _gcs_bucket


def get_exports_bucket() -> Any:
    return get_gcs_bucket()


def get_uploads_bucket() -> Any:
    return get_gcs_bucket()


def is_ready() -> bool:
    return _ready


def is_local_storage_active() -> bool:
    return _is_local_mode


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
