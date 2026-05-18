import os
import logging
from typing import Optional
from services.logging import get_logger

logger = get_logger("vault_service")


class VaultService:
    def __init__(self):
        self.is_prod = os.getenv("ENVIRONMENT") == "production"

    def get_secret(self, name: str, default: Optional[str] = None) -> Optional[str]:
        """Fetches secret from Env."""
        return os.getenv(name, default)


_vault_service = VaultService()


def get_secret(name: str, default: Optional[str] = None) -> Optional[str]:
    return _vault_service.get_secret(name, default)
