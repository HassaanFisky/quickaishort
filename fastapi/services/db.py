"""Async MongoDB client + GridFS bucket initialization.

Single source of truth for the connection pool. Owned by the FastAPI lifespan
in main.py — call init_db() at startup, close_db() at shutdown.
"""

import logging
import os
from datetime import datetime
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorGridFSBucket

logger = logging.getLogger(__name__)

DB_NAME = "quickai_shorts"
EXPORTS_BUCKET = "exports"

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None
_exports_bucket: Optional[AsyncIOMotorGridFSBucket] = None


async def init_db() -> None:
    """Create the motor client, ensure indexes, and verify connectivity."""
    global _client, _db, _exports_bucket

    uri = os.environ.get("MONGODB_URI")
    if not uri:
        logger.warning("MONGODB_URI not set — Mongo features disabled.")
        return

    _client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)
    _db = _client[DB_NAME]
    _exports_bucket = AsyncIOMotorGridFSBucket(_db, bucket_name=EXPORTS_BUCKET)

    try:
        await _client.admin.command("ping")
    except Exception as exc:
        logger.error("MongoDB ping failed: %s", exc)
        _client = None
        _db = None
        _exports_bucket = None
        return

    await _db["UserStats"].create_index("user_id", unique=True)
    await _db[f"{EXPORTS_BUCKET}.files"].create_index(
        "metadata.expires_at",
        expireAfterSeconds=0,
    )
    logger.info("MongoDB initialized (db=%s, bucket=%s).", DB_NAME, EXPORTS_BUCKET)


async def close_db() -> None:
    global _client, _db, _exports_bucket
    if _client is not None:
        _client.close()
    _client = None
    _db = None
    _exports_bucket = None


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("MongoDB is not initialized. Did the lifespan run?")
    return _db


def get_exports_bucket() -> AsyncIOMotorGridFSBucket:
    if _exports_bucket is None:
        raise RuntimeError("Exports GridFS bucket is not initialized.")
    return _exports_bucket


def is_ready() -> bool:
    return _db is not None


def utc_now() -> datetime:
    return datetime.utcnow()
