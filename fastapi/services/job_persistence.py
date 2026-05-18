import logging
from datetime import datetime, timedelta
from typing import Any, Dict
from services.db import get_db
from services.logging import get_logger

logger = get_logger("job_persistence")


async def persist_failed_job(
    job_id: str, user_id: str, error: str, payload: Dict[str, Any]
):
    """Persists dead-letter jobs to MongoDB for later analysis or replay."""
    try:
        db = get_db()
        await db["FailedJobs"].insert_one(
            {
                "job_id": job_id,
                "user_id": user_id,
                "error": str(error),
                "payload": payload,
                "failed_at": datetime.utcnow(),
                "status": "dead_letter",
            }
        )
        logger.error(
            "job_dead_lettered", job_id=job_id, user_id=user_id, error=str(error)
        )
    except Exception as e:
        logger.error("failed_to_persist_dead_letter", error=str(e), original_job=job_id)


async def cleanup_stale_jobs():
    """Finds jobs that have been in 'processing' status for > 4 hours and marks them failed."""
    try:
        db = get_db()
        threshold = datetime.utcnow() - timedelta(hours=4)

        # Collection name must match ProjectService ("Projects")
        result = await db["Projects"].update_many(
            {"status": "processing", "updated_at": {"$lt": threshold}},
            {
                "$set": {
                    "status": "failed",
                    "error": "stale_job_cleanup_trigger",
                    "updated_at": datetime.utcnow(),
                }
            },
        )
        if result.modified_count > 0:
            logger.info("stale_jobs_cleaned", count=result.modified_count)
    except Exception as e:
        logger.error("stale_cleanup_failed", error=str(e))
