import asyncio
import os
import logging
from services.db import is_ready as db_ready
from services.queue_service import redis_conn
from services.vault_service import get_secret
from services.logging import get_logger

logger = get_logger("diagnostics")


async def run_startup_checks():
    """Validates all critical cloud dependencies before allowing traffic."""
    logger.info("startup_diagnostics_started")

    # 1. Database Connectivity
    if not db_ready():
        # Attempt to wait briefly for connection pool
        for i in range(5):
            await asyncio.sleep(1)
            if db_ready():
                break
        if not db_ready():
            raise RuntimeError("CRITICAL_DEPENDENCY_FAILURE: MongoDB unreachable")

    # 2. Redis / Queue Connectivity
    try:
        if redis_conn:
            redis_conn.ping()
        else:
            logger.warning("REDIS_CONN_MISSING: Queue operations will be mocked")
    except Exception as e:
        logger.error(f"REDIS_PING_FAILED: {e}")
        # In autonomous mode, we log but don't crash if mock fallback is active

    # 3. Essential Production Secrets
    is_prod = os.getenv("ENVIRONMENT") == "production"
    if is_prod:
        critical_secrets = ["GEMINI_API_KEY", "MONGODB_URI", "NEXTAUTH_SECRET"]
        for secret in critical_secrets:
            if not get_secret(secret):
                logger.error(f"MISSING_CRITICAL_SECRET: {secret}")
                # We raise in prod to prevent zombie service starts
                raise RuntimeError(f"STARTUP_HALTED: Missing secret {secret}")

    # 5. Cleanup Stale Jobs
    try:
        from services.job_persistence import cleanup_stale_jobs

        await cleanup_stale_jobs()
    except Exception as e:
        logger.error(f"STALE_CLEANUP_FAILED_ON_STARTUP: {e}")

    logger.info("startup_diagnostics_passed")
    return True
