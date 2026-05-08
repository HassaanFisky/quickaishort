import os
import time
import logging
from typing import Optional
from google.cloud import secretmanager
from services.logging import get_logger

logger = get_logger("vault_service")

class VaultService:
    def __init__(self):
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
        self.is_prod = os.getenv("ENVIRONMENT") == "production"
        try:
            self.client = secretmanager.SecretManagerServiceClient() if self.is_prod else None
        except Exception as e:
            logger.warning(f"SecretManager client init failed: {e}")
            self.client = None

    def get_secret(self, name: str, default: Optional[str] = None) -> Optional[str]:
        """Fetches secret from GSM in prod (with retries), or Env in dev."""
        if not self.is_prod or not self.client:
            return os.getenv(name, default)

        name_path = f"projects/{self.project_id}/secrets/{name}/versions/latest"
        
        # Pillar 3: Retry Logic (Exponential Backoff)
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = self.client.access_secret_version(request={"name": name_path})
                return response.payload.data.decode("UTF-8")
            except Exception as e:
                wait = (2 ** attempt)
                logger.warning("secret_fetch_retry", secret=name, attempt=attempt+1, wait=wait, error=str(e))
                if attempt < max_retries - 1:
                    time.sleep(wait)
                else:
                    logger.error("secret_fetch_permanent_failure", secret=name, error=str(e))
        
        # Fallback to env if GSM fails permanently
        return os.getenv(name, default)

_vault_service = VaultService()

def get_secret(name: str, default: Optional[str] = None) -> Optional[str]:
    return _vault_service.get_secret(name, default)
