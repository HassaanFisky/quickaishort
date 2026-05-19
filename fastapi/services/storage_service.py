"""GCS-backed storage service.

Replaces GridFS. Sync GCS client wrapped with asyncio.to_thread() for FastAPI.
Sync methods are called directly from RQ render workers.
"""

import asyncio
import logging
from pathlib import Path
from typing import Optional, Literal

from services.db import get_gcs_bucket, is_ready

logger = logging.getLogger(__name__)

BucketType = Literal["exports", "uploads"]


class StorageService:
    def _blob(self, remote_path: str):
        return get_gcs_bucket().blob(remote_path)

    # ------------------------------------------------------------------ upload

    async def upload_file_async(
        self,
        local_path: Path,
        remote_path: str,
        content_type: str = "video/mp4",
        _bucket_name: BucketType = "exports",
    ) -> str:
        if not is_ready():
            raise RuntimeError("Storage not initialized")
        blob = self._blob(remote_path)
        logger.info("[Storage] Uploading %s → GCS:%s", local_path, remote_path)
        await asyncio.to_thread(
            blob.upload_from_filename, str(local_path), content_type=content_type
        )
        return f"gs://{get_gcs_bucket().name}/{remote_path}"

    def upload_file(
        self,
        local_path: Path,
        remote_path: str,
        content_type: str = "video/mp4",
        _bucket_name: BucketType = "exports",
    ) -> str:
        if not is_ready():
            raise RuntimeError("Storage not initialized")
        blob = self._blob(remote_path)
        logger.info("[Storage] Uploading %s → GCS:%s", local_path, remote_path)
        blob.upload_from_filename(str(local_path), content_type=content_type)
        return f"gs://{get_gcs_bucket().name}/{remote_path}"

    # ---------------------------------------------------------------- download

    async def download_file_async(
        self,
        remote_path: str,
        local_path: Path,
        _bucket_name: BucketType = "exports",
    ) -> bool:
        if not is_ready():
            raise RuntimeError("Storage not initialized")
        blob = self._blob(remote_path)
        logger.info("[Storage] Downloading GCS:%s → %s", remote_path, local_path)
        exists = await asyncio.to_thread(blob.exists)
        if not exists:
            logger.error("[Storage] File not found in GCS: %s", remote_path)
            return False
        await asyncio.to_thread(blob.download_to_filename, str(local_path))
        return True

    def download_file(
        self,
        remote_path: str,
        local_path: Path,
        _bucket_name: BucketType = "exports",
    ) -> bool:
        blob = self._blob(remote_path)
        if not blob.exists():
            return False
        blob.download_to_filename(str(local_path))
        return True

    # ------------------------------------------------------------------ exists

    async def exists_async(
        self, remote_path: str, _bucket_name: BucketType = "exports"
    ) -> bool:
        if not is_ready():
            return False
        return await asyncio.to_thread(self._blob(remote_path).exists)

    def exists(self, remote_path: str, _bucket_name: BucketType = "exports") -> bool:
        if not is_ready():
            return False
        return self._blob(remote_path).exists()

    # ------------------------------------------------------------------ delete

    async def delete_file_async(
        self, remote_path: str, _bucket_name: BucketType = "exports"
    ) -> None:
        if not is_ready():
            return
        try:
            await asyncio.to_thread(self._blob(remote_path).delete)
        except Exception:
            pass

    def delete_file(
        self, remote_path: str, _bucket_name: BucketType = "exports"
    ) -> None:
        try:
            self._blob(remote_path).delete()
        except Exception:
            pass

    # ----------------------------------------------------------- legacy compat

    def generate_signed_url(
        self, remote_path: str, _expiration_hours: int = 24
    ) -> Optional[str]:
        return remote_path

    def download_gcs_file(self, gcs_uri: str, local_path: Path) -> bool:
        """Download a gs:// URI or bare blob path to local disk."""
        if gcs_uri.startswith("gs://"):
            parts = gcs_uri[5:].split("/", 1)
            remote_path = parts[1] if len(parts) == 2 else gcs_uri
        else:
            remote_path = gcs_uri
        return self.download_file(remote_path, local_path)


_storage_service: Optional[StorageService] = None


def get_storage_service() -> StorageService:
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService()
    return _storage_service
