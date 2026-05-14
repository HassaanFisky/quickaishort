import asyncio
import concurrent.futures as _cf
import logging
from pathlib import Path
from typing import Optional, Literal

from services.db import get_exports_bucket, get_uploads_bucket, is_ready

logger = logging.getLogger(__name__)

BucketType = Literal["exports", "uploads"]

_sync_executor = _cf.ThreadPoolExecutor(max_workers=4, thread_name_prefix="storage_sync")


def _run_in_new_loop(coro):
    """Execute a coroutine in a brand-new isolated event loop."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _run_sync(coro):
    """
    Safe sync wrapper. Never touches an existing running event loop.
    Works from render workers, threads, and sync contexts safely.
    """
    try:
        asyncio.get_running_loop()
        # Running loop exists — must use a separate thread to avoid deadlock
        with _cf.ThreadPoolExecutor(max_workers=1) as ex:
            return ex.submit(_run_in_new_loop, coro).result(timeout=60)
    except RuntimeError:
        # No running loop — safe to create directly
        return _run_in_new_loop(coro)


class StorageService:
    def __init__(self):
        pass

    def _get_bucket(self, bucket_name: BucketType):
        if bucket_name == "uploads":
            return get_uploads_bucket()
        return get_exports_bucket()

    async def upload_file_async(
        self,
        local_path: Path,
        remote_path: str,
        content_type: str = "video/mp4",
        bucket_name: BucketType = "exports",
    ) -> str:
        """Uploads a local file to GridFS."""
        if not is_ready():
            raise RuntimeError("Database not initialized")

        bucket = self._get_bucket(bucket_name)
        logger.info("[Storage] Uploading %s to GridFS:%s:%s", local_path, bucket_name, remote_path)

        with open(local_path, "rb") as f:
            await bucket.upload_from_stream(
                remote_path,
                f,
                metadata={"content_type": content_type},
            )

        return f"gridfs://{remote_path}"

    def upload_file(
        self,
        local_path: Path,
        remote_path: str,
        content_type: str = "video/mp4",
        bucket_name: BucketType = "exports",
    ) -> str:
        """Sync wrapper for upload_file_async."""
        return _run_sync(self.upload_file_async(local_path, remote_path, content_type, bucket_name))

    async def download_file_async(
        self,
        remote_path: str,
        local_path: Path,
        bucket_name: BucketType = "exports",
    ) -> bool:
        """Downloads a file from GridFS to local disk."""
        if not is_ready():
            raise RuntimeError("Database not initialized")

        bucket = self._get_bucket(bucket_name)
        logger.info("[Storage] Downloading GridFS:%s:%s to %s", bucket_name, remote_path, local_path)

        cursor = bucket.find({"filename": remote_path})
        files = await cursor.to_list(length=1)
        if not files:
            logger.error("[Storage] File not found in GridFS:%s:%s", bucket_name, remote_path)
            return False

        with open(local_path, "wb") as f:
            await bucket.download_to_stream(files[0]["_id"], f)
        return True

    def download_file(
        self,
        remote_path: str,
        local_path: Path,
        bucket_name: BucketType = "exports",
    ) -> bool:
        """Sync wrapper for download_file_async."""
        return _run_sync(self.download_file_async(remote_path, local_path, bucket_name))

    async def exists_async(self, remote_path: str, bucket_name: BucketType = "exports") -> bool:
        """Checks if a file exists in GridFS."""
        if not is_ready():
            return False
        bucket = self._get_bucket(bucket_name)
        cursor = bucket.find({"filename": remote_path})
        files = await cursor.to_list(length=1)
        return len(files) > 0

    def exists(self, remote_path: str, bucket_name: BucketType = "exports") -> bool:
        """Sync wrapper for exists_async."""
        return _run_sync(self.exists_async(remote_path, bucket_name))

    def generate_signed_url(self, remote_path: str, _expiration_hours: int = 24) -> Optional[str]:
        """Legacy placeholder. URLs are now signed via services.signing and served by /api/download."""
        return remote_path

    async def delete_file_async(self, remote_path: str, bucket_name: BucketType = "exports"):
        """Deletes a file from GridFS."""
        if not is_ready():
            return
        bucket = self._get_bucket(bucket_name)
        cursor = bucket.find({"filename": remote_path})
        files = await cursor.to_list(length=None)
        for f in files:
            await bucket.delete(f["_id"])

    def delete_file(self, remote_path: str, bucket_name: BucketType = "exports"):
        """Sync wrapper for delete_file_async."""
        _run_sync(self.delete_file_async(remote_path, bucket_name))

    def download_gcs_file(self, gcs_uri: str, local_path: Path) -> bool:
        """Downloads a file from Google Cloud Storage to local disk."""
        try:
            from google.cloud import storage
            if not gcs_uri.startswith("gs://"):
                return False

            parts = gcs_uri[5:].split("/", 1)
            if len(parts) < 2:
                return False

            bucket_name, blob_name = parts
            client = storage.Client()
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(blob_name)

            logger.info("[Storage] Downloading GCS:%s to %s", gcs_uri, local_path)
            blob.download_to_filename(str(local_path))
            return True
        except Exception as e:
            logger.error("[Storage] GCS download failed for %s: %s", gcs_uri, e)
            return False


_storage_service: Optional[StorageService] = None


def get_storage_service() -> StorageService:
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService()
    return _storage_service
