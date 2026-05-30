"""Firestore + GCS client initialization.

Replaces MongoDB/GridFS. Uses Application Default Credentials on Cloud Run.
Call init_db() at FastAPI startup (lifespan) or init_db_sync() in RQ workers.
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

from google.cloud import firestore
from google.cloud import storage as gcs

logger = logging.getLogger(__name__)

GCS_BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME", "quickaishort-agent-494304-media")

# Path-prefix constants kept for callers that import them (unchanged semantics).
EXPORTS_BUCKET = "exports"
UPLOADS_BUCKET = "uploads"

_db: Optional[firestore.Client] = None
_gcs_client: Optional[gcs.Client] = None
_gcs_bucket: Optional[gcs.Bucket] = None
_ready: bool = False


def _init() -> None:
    global _db, _gcs_client, _gcs_bucket, _ready
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "quickaishort-agent-494304")
    try:
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
        logger.error("DB init failed: %s", exc)
        _ready = False


async def init_db() -> None:
    """Async wrapper for FastAPI lifespan compatibility."""
    _init()


def init_db_sync() -> None:
    """Synchronous init for RQ render workers (no running event loop needed)."""
    _init()


async def close_db() -> None:
    global _db, _gcs_client, _gcs_bucket, _ready
    _db = None
    _gcs_client = None
    _gcs_bucket = None
    _ready = False


def get_db() -> firestore.Client:
    if _db is None:
        raise RuntimeError("Firestore is not initialized. Did the lifespan run?")
    return _db


def get_gcs_bucket() -> gcs.Bucket:
    if _gcs_bucket is None:
        raise RuntimeError("GCS bucket is not initialized.")
    return _gcs_bucket


def get_exports_bucket() -> gcs.Bucket:
    return get_gcs_bucket()


def get_uploads_bucket() -> gcs.Bucket:
    return get_gcs_bucket()


def is_ready() -> bool:
    return _ready


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
