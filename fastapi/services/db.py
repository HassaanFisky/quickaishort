"""Async MongoDB client + GridFS bucket initialization.

Single source of truth for the connection pool. Owned by the FastAPI lifespan
in main.py — call init_db() at startup, close_db() at shutdown.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import certifi
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorGridFSBucket

logger = logging.getLogger(__name__)

DB_NAME = "quickai_shorts"
EXPORTS_BUCKET = "exports"
UPLOADS_BUCKET = "uploads"

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None
_exports_bucket: Optional[AsyncIOMotorGridFSBucket] = None
_uploads_bucket: Optional[AsyncIOMotorGridFSBucket] = None


async def init_db() -> None:
    """Create the motor client, ensure indexes, and verify connectivity."""
    global _client, _db, _exports_bucket, _uploads_bucket

    uri = os.environ.get("MONGODB_URI")
    if not uri:
        logger.warning("MONGODB_URI not set — Mongo features disabled.")
        return

    _client = AsyncIOMotorClient(
        uri,
        serverSelectionTimeoutMS=10000,
        connectTimeoutMS=5000,
        socketTimeoutMS=30000,
        maxPoolSize=20,      # limit per-instance to prevent exhausting MongoDB Atlas limits
        minPoolSize=2,
        tlsCAFile=certifi.where(),
    )
    _db = _client[DB_NAME]
    _exports_bucket = AsyncIOMotorGridFSBucket(_db, bucket_name=EXPORTS_BUCKET)
    _uploads_bucket = AsyncIOMotorGridFSBucket(_db, bucket_name=UPLOADS_BUCKET)

    try:
        logger.info("Pinging MongoDB (5s timeout)...")
        await asyncio.wait_for(_client.admin.command("ping"), timeout=5.0)
        logger.info("MongoDB ping successful.")
    except Exception as exc:
        logger.error("MongoDB ping failed (cold start or whitelist issue): %s", exc)
        # We proceed anyway — the app should not fail to boot just because the ping timed out
        if _client:
            _db = _client[DB_NAME]

    try:
        await asyncio.wait_for(
            _db["UserStats"].create_index("user_id", unique=True),
            timeout=5.0,
        )
        await asyncio.wait_for(
            _db[f"{EXPORTS_BUCKET}.files"].create_index(
                "metadata.expires_at",
                expireAfterSeconds=0,
            ),
            timeout=5.0,
        )
        logger.info("MongoDB initialized (db=%s, bucket=%s, uploads=%s).", DB_NAME, EXPORTS_BUCKET, UPLOADS_BUCKET)
    except Exception as exc:
        logger.warning("MongoDB index creation failed (non-fatal): %s", exc)


async def close_db() -> None:
    global _client, _db, _exports_bucket, _uploads_bucket
    if _client is not None:
        _client.close()
    _client = None
    _db = None
    _exports_bucket = None
    _uploads_bucket = None


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("MongoDB is not initialized. Did the lifespan run?")
    return _db


def get_exports_bucket() -> AsyncIOMotorGridFSBucket:
    if _exports_bucket is None:
        raise RuntimeError("Exports GridFS bucket is not initialized.")
    return _exports_bucket


def get_uploads_bucket() -> AsyncIOMotorGridFSBucket:
    if _uploads_bucket is None:
        raise RuntimeError("Uploads GridFS bucket is not initialized.")
    return _uploads_bucket


def is_ready() -> bool:
    return _db is not None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
