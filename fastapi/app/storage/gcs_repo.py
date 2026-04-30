import datetime
import logging
from typing import Optional
from google.cloud import storage
from app.config import settings

logger = logging.getLogger(__name__)

# Initialize GCS client
try:
    storage_client = storage.Client()
    bucket_name = settings.GCS_BUCKET_NAME
except Exception as e:
    logger.warning(f"Failed to initialize GCS client automatically: {e}")
    storage_client = None
    bucket_name = ""

def get_bucket():
    if not storage_client or not bucket_name:
        return None
    return storage_client.bucket(bucket_name)

class GCSRepo:
    def generate_signed_url(self, blob_name: str, expiration_minutes: int = 60) -> Optional[str]:
        """Generates a V4 signed URL for downloading a blob."""
        bucket = get_bucket()
        if not bucket:
            return None
        
        blob = bucket.blob(blob_name)
        try:
            url = blob.generate_signed_url(
                version="v4",
                expiration=datetime.timedelta(minutes=expiration_minutes),
                method="GET"
            )
            return url
        except Exception as e:
            logger.error(f"Failed to generate signed URL for {blob_name}: {e}")
            return None

    def upload_file(self, destination_blob_name: str, source_file_path: str) -> Optional[str]:
        """Uploads a file to the bucket."""
        bucket = get_bucket()
        if not bucket:
            return None
        
        blob = bucket.blob(destination_blob_name)
        try:
            blob.upload_from_filename(source_file_path)
            logger.info(f"File {source_file_path} uploaded to {destination_blob_name}.")
            return f"gs://{bucket_name}/{destination_blob_name}"
        except Exception as e:
            logger.error(f"Failed to upload {source_file_path} to GCS: {e}")
            return None

    def download_file(self, source_blob_name: str, destination_file_path: str) -> bool:
        """Downloads a blob from the bucket."""
        bucket = get_bucket()
        if not bucket:
            return False
        
        blob = bucket.blob(source_blob_name)
        try:
            blob.download_to_filename(destination_file_path)
            logger.info(f"Blob {source_blob_name} downloaded to {destination_file_path}.")
            return True
        except Exception as e:
            logger.error(f"Failed to download {source_blob_name} from GCS: {e}")
            return False

gcs_repo = GCSRepo()
