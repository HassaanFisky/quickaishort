import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from services.db import get_db
from services.logging import get_logger

logger = get_logger("job_persistence")


async def persist_failed_job(
    job_id: str, user_id: str, error: str, payload: Dict[str, Any]
):
    """Persists dead-letter jobs to Firestore for later analysis or replay."""
    try:
        def _do():
            get_db().collection("FailedJobs").document(job_id).set({
                "job_id": job_id,
                "user_id": user_id,
                "error": str(error),
                "payload": payload,
                "failed_at": datetime.now(timezone.utc),
                "status": "dead_letter",
            })

        await asyncio.to_thread(_do)
        logger.error(
            "job_dead_lettered", job_id=job_id, user_id=user_id, error=str(error)
        )
    except Exception as e:
        logger.error("failed_to_persist_dead_letter", error=str(e), original_job=job_id)


async def cleanup_stale_jobs():
    """Marks jobs in 'processing' for > 4 hours as failed."""
    try:
        threshold = datetime.now(timezone.utc) - timedelta(hours=4)

        def _do():
            db = get_db()
            # Fetch by status, filter by age in Python to avoid composite index requirement.
            snaps = db.collection("Projects").where("status", "==", "processing").stream()
            batch = db.batch()
            count = 0
            for snap in snaps:
                data = snap.to_dict() or {}
                updated = data.get("updated_at")
                if updated and updated < threshold:
                    batch.update(snap.reference, {
                        "status": "failed",
                        "error": "stale_job_cleanup_trigger",
                        "updated_at": datetime.now(timezone.utc),
                    })
                    count += 1
            if count > 0:
                batch.commit()
            return count

        count = await asyncio.to_thread(_do)
        if count > 0:
            logger.info("stale_jobs_cleaned", count=count)
    except Exception as e:
        logger.error("stale_cleanup_failed", error=str(e))
