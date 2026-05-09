"""MongoDB GridFS storage service for media exports.

Replaces GCS implementation. Uses the 'exports' bucket defined in services.db.
"""

import os
import logging
import asyncio
from pathlib import Path
from typing import Optional
from services.db import get_exports_bucket, is_ready

logger = logging.getLogger(__name__)

class StorageService:
    def __init__(self):
        # We don't need bucket_name from env anymore, it's hardcoded in db.py
        pass

    async def upload_file_async(self, local_path: Path, remote_path: str, content_type: str = "video/mp4") -> str:
        """Uploads a local file to GridFS."""
        if not is_ready():
            raise RuntimeError("Database not initialized")
            
        bucket = get_exports_bucket()
        
        logger.info(f"[Storage] Uploading {local_path} to GridFS:{remote_path}")
        
        with open(local_path, "rb") as f:
            await bucket.upload_from_stream(
                remote_path,
                f,
                metadata={"content_type": content_type}
            )
        
        return f"gridfs://{remote_path}"

    def upload_file(self, local_path: Path, remote_path: str, content_type: str = "video/mp4") -> str:
        """Sync wrapper for upload_file_async."""
        return asyncio.run(self.upload_file_async(local_path, remote_path, content_type))

    async def exists_async(self, remote_path: str) -> bool:
        """Checks if a file exists in GridFS."""
        if not is_ready():
            return False
        bucket = get_exports_bucket()
        cursor = bucket.find({"filename": remote_path})
        return await cursor.to_list(length=1) != []

    def exists(self, remote_path: str) -> bool:
        """Sync wrapper for exists_async."""
        return asyncio.run(self.exists_async(remote_path))

    def generate_signed_url(self, remote_path: str, expiration_hours: int = 24) -> Optional[str]:
        """GridFS doesn't use signed URLs. Return a proxy URL or the path."""
        # For this architecture, the API will serve the file from GridFS via /api/download/{path}
        # We return the path which the frontend will append to the API URL.
        return remote_path

    async def delete_file_async(self, remote_path: str):
        """Deletes a file from GridFS."""
        if not is_ready():
            return
        bucket = get_exports_bucket()
        cursor = bucket.find({"filename": remote_path})
        files = await cursor.to_list(length=None)
        for f in files:
            await bucket.delete(f["_id"])

    def delete_file(self, remote_path: str):
        """Sync wrapper for delete_file_async."""
        asyncio.run(self.delete_file_async(remote_path))

# Singleton instance
_storage_service: Optional[StorageService] = None

def get_storage_service() -> StorageService:
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService()
    return _storage_service

