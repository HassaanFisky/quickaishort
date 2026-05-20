"""Asynchronous MongoDB GridFS storage service using motor.

Provides AsyncIOMotorGridFSBucket for streaming large binary video artifacts
directly to/from GridFS without local file system storage.
"""

from __future__ import annotations

import io
import logging
import os
from typing import Optional, AsyncIterator

import motor.motor_asyncio
from gridfs import GridFS
from gridfs.errors import NoFile

logger = logging.getLogger(__name__)

# MongoDB connection pool
_client: Optional[motor.motor_asyncio.AsyncIOMotorClient] = None
_db: Optional[motor.motor_asyncio.AsyncIOMotorDatabase] = None
_gridfs_exports: Optional[motor.motor_asyncio.AsyncIOMotorGridFSBucket] = None
_gridfs_uploads: Optional[motor.motor_asyncio.AsyncIOMotorGridFSBucket] = None


async def init_storage() -> None:
    """Initialize MongoDB Atlas connection and GridFS buckets."""
    global _client, _db, _gridfs_exports, _gridfs_uploads

    mongodb_uri = os.environ.get(
        "MONGODB_URI",
        "mongodb+srv://localhost:27017/quickaishort",
    )
    db_name = os.environ.get("MONGODB_DB", "quickaishort")

    try:
        _client = motor.motor_asyncio.AsyncIOMotorClient(
            mongodb_uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
        )

        # Test connection
        await _client.admin.command("ping")

        _db = _client[db_name]

        # Initialize GridFS buckets
        _gridfs_exports = motor.motor_asyncio.AsyncIOMotorGridFSBucket(
            _db, bucket_name="exports"
        )
        _gridfs_uploads = motor.motor_asyncio.AsyncIOMotorGridFSBucket(
            _db, bucket_name="uploads"
        )

        logger.info(
            "MongoDB Atlas connected: %s (db=%s)",
            mongodb_uri.split("@")[-1] if "@" in mongodb_uri else "local",
            db_name,
        )

    except Exception as exc:
        logger.error("MongoDB initialization failed: %s", exc)
        raise RuntimeError(f"Failed to initialize MongoDB: {exc}")


async def close_storage() -> None:
    """Close MongoDB connection."""
    global _client, _db, _gridfs_exports, _gridfs_uploads

    if _client:
        _client.close()
        _client = None
        _db = None
        _gridfs_exports = None
        _gridfs_uploads = None
        logger.info("MongoDB connection closed")


def get_gridfs_exports() -> motor.motor_asyncio.AsyncIOMotorGridFSBucket:
    """Get GridFS bucket for exports."""
    if _gridfs_exports is None:
        raise RuntimeError("GridFS exports bucket not initialized. Did init_storage() run?")
    return _gridfs_exports


def get_gridfs_uploads() -> motor.motor_asyncio.AsyncIOMotorGridFSBucket:
    """Get GridFS bucket for uploads."""
    if _gridfs_uploads is None:
        raise RuntimeError("GridFS uploads bucket not initialized. Did init_storage() run?")
    return _gridfs_uploads


# ────────────────────────────────────────────────────────────────────────────
# GridFS Operations
# ────────────────────────────────────────────────────────────────────────────


async def upload_to_gridfs(
    file_stream: io.BytesIO,
    filename: str,
    metadata: dict | None = None,
    bucket: str = "uploads",
) -> str:
    """Upload a file stream to GridFS and return the file ID.

    Args:
        file_stream: BytesIO stream containing binary data
        filename: Name of the file
        metadata: Optional metadata dict to store with the file
        bucket: GridFS bucket name ("uploads" or "exports")

    Returns:
        str: The GridFS ObjectId as a string

    Raises:
        RuntimeError: If GridFS is not initialized
        Exception: If upload fails
    """
    gridfs_bucket = (
        get_gridfs_uploads() if bucket == "uploads" else get_gridfs_exports()
    )

    try:
        file_stream.seek(0)
        file_id = await gridfs_bucket.upload_from_stream(
            filename,
            file_stream,
            metadata=metadata or {},
        )
        logger.info(
            "Uploaded to GridFS: filename=%s, file_id=%s, bucket=%s",
            filename,
            file_id,
            bucket,
        )
        return str(file_id)

    except Exception as exc:
        logger.error("GridFS upload failed: %s", exc)
        raise


async def download_from_gridfs(
    file_id: str,
    bucket: str = "uploads",
    chunk_size: int = 262144,  # 256KB chunks
) -> AsyncIterator[bytes]:
    """Download a file from GridFS as an async stream.

    Args:
        file_id: GridFS ObjectId as string
        bucket: GridFS bucket name ("uploads" or "exports")
        chunk_size: Size of chunks to yield

    Yields:
        bytes: Chunks of the file

    Raises:
        NoFile: If file not found in GridFS
        Exception: If download fails
    """
    from bson import ObjectId

    gridfs_bucket = (
        get_gridfs_uploads() if bucket == "uploads" else get_gridfs_exports()
    )

    try:
        obj_id = ObjectId(file_id)
        grid_out = await gridfs_bucket.open_download_stream(obj_id)

        while True:
            chunk = await grid_out.read(chunk_size)
            if not chunk:
                break
            yield chunk

        await grid_out.close()

    except Exception as exc:
        logger.error("GridFS download failed: file_id=%s, error=%s", file_id, exc)
        raise


async def delete_from_gridfs(
    file_id: str,
    bucket: str = "uploads",
) -> None:
    """Delete a file from GridFS.

    Args:
        file_id: GridFS ObjectId as string
        bucket: GridFS bucket name ("uploads" or "exports")

    Raises:
        NoFile: If file not found
        Exception: If deletion fails
    """
    from bson import ObjectId

    gridfs_bucket = (
        get_gridfs_uploads() if bucket == "uploads" else get_gridfs_exports()
    )

    try:
        obj_id = ObjectId(file_id)
        await gridfs_bucket.delete(obj_id)
        logger.info("Deleted from GridFS: file_id=%s, bucket=%s", file_id, bucket)

    except Exception as exc:
        logger.error("GridFS deletion failed: file_id=%s, error=%s", file_id, exc)
        raise


async def get_file_metadata(
    file_id: str,
    bucket: str = "uploads",
) -> dict:
    """Retrieve file metadata from GridFS.

    Args:
        file_id: GridFS ObjectId as string
        bucket: GridFS bucket name ("uploads" or "exports")

    Returns:
        dict: File metadata including filename, length, uploadDate, custom metadata

    Raises:
        NoFile: If file not found
    """
    from bson import ObjectId

    gridfs_bucket = (
        get_gridfs_uploads() if bucket == "uploads" else get_gridfs_exports()
    )

    try:
        obj_id = ObjectId(file_id)
        grid_out = await gridfs_bucket.open_download_stream(obj_id)

        metadata = {
            "file_id": str(grid_out._id),
            "filename": grid_out.filename,
            "length": grid_out.length,
            "upload_date": grid_out.upload_date,
            "metadata": grid_out.metadata or {},
        }

        await grid_out.close()
        return metadata

    except Exception as exc:
        logger.error("Failed to retrieve metadata: file_id=%s, error=%s", file_id, exc)
        raise
