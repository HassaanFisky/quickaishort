import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from services.db import get_db
from services.logging import get_logger

logger = get_logger("job_persistence")


async def persist_failed_job(
    job_id: str, user_id: str, error: str, payload: Dict[str, Any]
):
    """Persists dead-letter jobs to Firestore for later analysis or replay."""
    try:

        def _do():
            get_db().collection("FailedJobs").document(job_id).set(
                {
                    "job_id": job_id,
                    "user_id": user_id,
                    "error": str(error),
                    "payload": payload,
                    "failed_at": datetime.now(timezone.utc),
                    "status": "dead_letter",
                }
            )

        await asyncio.to_thread(_do)
        logger.error(
            "job_dead_lettered", job_id=job_id, user_id=user_id, error=str(error)
        )
    except Exception as e:
        logger.error("failed_to_persist_dead_letter", error=str(e), original_job=job_id)


# --- Phase 62: RenderManifest persistence ---


async def persist_render_manifest(
    job_id: str,
    user_id: str,
    manifest: Dict[str, Any],
    meta: Optional[Dict[str, Any]] = None,
):
    """Store the RenderManifest used for a render job in Firestore."""
    if not manifest:
        return
    try:

        def _do():
            get_db().collection("RenderManifests").document(job_id).set(
                {
                    "job_id": job_id,
                    "user_id": user_id,
                    "manifest": manifest,
                    "meta": meta or {},
                    "created_at": datetime.now(timezone.utc),
                    "schema_version": manifest.get("version", 1),
                },
                merge=True,
            )

        await asyncio.to_thread(_do)
        logger.info(
            "manifest_persisted",
            job_id=job_id,
            clip_count=len(manifest.get("clips", [])),
        )
    except Exception as e:
        # Non-fatal – don't fail the render because manifest logging failed
        logger.error("manifest_persist_failed", job_id=job_id, error=str(e))


async def upload_manifest_to_gcs(
    job_id: str,
    user_id: str,
    manifest: Dict[str, Any],
    bucket_name: str | None = None,
):
    """Upload manifest.json to GCS exports bucket next to the video."""
    if not manifest:
        return None
    try:
        from services.storage_service import get_storage_service

        storage = get_storage_service()
        # Save it under exports/{user_id}/{job_id}_manifest.json next to exports/{user_id}/{job_id}.mp4
        remote_path = f"exports/{user_id}/{job_id}_manifest.json"
        data = json.dumps(manifest, indent=2)

        blob = storage._blob(remote_path)
        await asyncio.to_thread(
            blob.upload_from_string, data, content_type="application/json"
        )
        logger.info("manifest_gcs_uploaded", job_id=job_id, path=remote_path)
        return remote_path
    except Exception as e:
        logger.error("manifest_gcs_failed", job_id=job_id, error=str(e))
        return None


async def cleanup_stale_jobs():
    """Marks jobs in 'processing' for > 4 hours as failed."""
    try:
        threshold = datetime.now(timezone.utc) - timedelta(hours=4)

        def _do():
            db = get_db()
            snaps = (
                db.collection("Projects").where("status", "==", "processing").stream()
            )
            batch = db.batch()
            count = 0
            for snap in snaps:
                data = snap.to_dict() or {}
                updated = data.get("updated_at")
                if updated and updated < threshold:
                    batch.update(
                        snap.reference,
                        {
                            "status": "failed",
                            "error": "stale_job_cleanup_trigger",
                            "updated_at": datetime.now(timezone.utc),
                        },
                    )
                    count += 1
            if count > 0:
                batch.commit()
            return count

        count = await asyncio.to_thread(_do)
        if count > 0:
            logger.info("stale_jobs_cleaned", count=count)
    except Exception as e:
        logger.error("stale_cleanup_failed", error=str(e))
