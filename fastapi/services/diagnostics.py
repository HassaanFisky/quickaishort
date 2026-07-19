import asyncio
import os
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
            raise RuntimeError("CRITICAL_DEPENDENCY_FAILURE: Firestore unreachable")

    # 2. Redis / Queue Connectivity
    try:
        # Prevent socket blocks on start: bypass ping if REDIS_URL is unconfigured in production
        is_prod = os.getenv("ENVIRONMENT") == "production"
        redis_url = os.getenv("REDIS_URL")
        if is_prod and not redis_url:
            logger.warning(
                "REDIS_URL not configured in production — bypassing Redis connectivity check"
            )
        elif redis_conn:
            redis_conn.ping()
        else:
            logger.warning("REDIS_CONN_MISSING: Queue operations will be mocked")
    except Exception as e:
        logger.error(f"REDIS_PING_FAILED: {e}")
        # In autonomous mode, we log but don't crash if mock fallback is active

    # 3. Essential Production Secrets
    is_prod = os.getenv("ENVIRONMENT") == "production"
    if is_prod:
        critical_secrets = ["GEMINI_API_KEY", "NEXTAUTH_SECRET"]
        for secret in critical_secrets:
            if not get_secret(secret):
                logger.error(f"MISSING_CRITICAL_SECRET: {secret}")
                # We raise in prod to prevent zombie service starts
                raise RuntimeError(f"STARTUP_HALTED: Missing secret {secret}")

    # 4. Capability Registry ABI (EP-001) — fail closed on drift
    try:
        from services.tool_registry import assert_registry_valid

        assert_registry_valid()
        logger.info("capability_registry_startup_ok")
    except Exception as e:
        logger.error(f"CAPABILITY_REGISTRY_INVALID: {e}")
        raise RuntimeError(f"STARTUP_HALTED: Capability registry invalid — {e}") from e

    # 5. Cleanup Stale Jobs
    try:
        from services.job_persistence import cleanup_stale_jobs

        await cleanup_stale_jobs()
    except Exception as e:
        logger.error(f"STALE_CLEANUP_FAILED_ON_STARTUP: {e}")

    logger.info("startup_diagnostics_passed")
    return True
