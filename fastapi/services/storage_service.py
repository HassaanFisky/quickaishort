"""GCS-backed storage service.

Replaces GridFS. Sync GCS client wrapped with asyncio.to_thread() for FastAPI.
Sync methods are called directly from RQ render workers.
"""

import asyncio
import datetime
import logging
import os
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

    # --------------------------------------------------- presigned upload URL

    async def generate_presigned_upload_url(
        self,
        remote_path: str,
        content_type: str = "video/mp4",
        expiration_minutes: int = 15,
    ) -> str:
        """Generate a V4 PUT presigned URL for direct browser-to-GCS upload.

        The caller PUTs the video bytes to this URL directly; the backend never
        receives the raw video stream.  On Cloud Run the service account must
        have roles/iam.serviceAccountTokenCreator on itself so the IAM signBlob
        API can sign without a key file.  Set GOOGLE_SERVICE_ACCOUNT_EMAIL if
        the credential object does not expose service_account_email.
        """
        import google.auth
        import google.auth.transport.requests

        if not is_ready():
            raise RuntimeError("Storage not initialized")

        bucket = get_gcs_bucket()
        blob = bucket.blob(remote_path)

        credentials, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        auth_req = google.auth.transport.requests.Request()
        await asyncio.to_thread(credentials.refresh, auth_req)

        sa_email: str = (
            getattr(credentials, "service_account_email", "")
            or os.environ.get("GOOGLE_SERVICE_ACCOUNT_EMAIL", "")
        )
        if not sa_email:
            raise RuntimeError(
                "Cannot generate signed URL: set GOOGLE_SERVICE_ACCOUNT_EMAIL "
                "on the Cloud Run service, or ensure the ADC credentials expose "
                "service_account_email (compute engine / service account key)."
            )

        expiration = datetime.timedelta(minutes=expiration_minutes)
        url: str = await asyncio.to_thread(
            blob.generate_signed_url,
            version="v4",
            expiration=expiration,
            method="PUT",
            content_type=content_type,
            service_account_email=sa_email,
            access_token=getattr(credentials, "token", None),
        )
        logger.info(
            "[Storage] Presigned PUT URL issued: path=%s content_type=%s expires=%dm",
            remote_path,
            content_type,
            expiration_minutes,
        )
        return url

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
