"""Google Cloud Storage service for media offloading.

Provides methods for uploading files and generating signed URLs.
Offloads media serving from the FastAPI process to GCS.
"""

import os
import logging
from datetime import timedelta
from pathlib import Path
from typing import Optional

from google.cloud import storage
from google.oauth2 import service_account

logger = logging.getLogger(__name__)

class StorageService:
    def __init__(self):
        self.bucket_name = os.getenv("GCS_BUCKET_NAME")
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
        
        # In production Cloud Run, credentials are automatically picked up from the service account.
        # For local dev, GOOGLE_APPLICATION_CREDENTIALS env var should point to a JSON key.
        self.client = storage.Client(project=self.project_id)
        
        if not self.bucket_name:
            logger.warning("GCS_BUCKET_NAME not set. Storage service will be limited.")

    def upload_file(self, local_path: Path, remote_path: str, content_type: str = "video/mp4") -> str:
        """Uploads a local file to GCS. Returns the GCS URI."""
        if not self.bucket_name:
            raise RuntimeError("GCS_BUCKET_NAME not configured")
            
        bucket = self.client.bucket(self.bucket_name)
        blob = bucket.blob(remote_path)
        
        logger.info(f"[Storage] Uploading {local_path} to gs://{self.bucket_name}/{remote_path}")
        blob.upload_from_filename(str(local_path), content_type=content_type)
        return f"gs://{self.bucket_name}/{remote_path}"

    def generate_signed_url(self, remote_path: str, expiration_hours: int = 24) -> Optional[str]:
        """Generates a v4 signed URL for secure file download."""
        if not self.bucket_name:
            return None
            
        bucket = self.client.bucket(self.bucket_name)
        blob = bucket.blob(remote_path)
        
        url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(hours=expiration_hours),
            method="GET",
        )
        return url

    def delete_file(self, remote_path: str):
        """Deletes a file from GCS."""
        if not self.bucket_name:
            return
            
        bucket = self.client.bucket(self.bucket_name)
        blob = bucket.blob(remote_path)
        blob.delete()

    def exists(self, remote_path: str) -> bool:
        """Checks if a file exists in GCS."""
        if not self.bucket_name:
            return False
        bucket = self.client.bucket(self.bucket_name)
        blob = bucket.blob(remote_path)
        return blob.exists()

# Singleton instance
_storage_service: Optional[StorageService] = None

def get_storage_service() -> StorageService:
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService()
    return _storage_service
