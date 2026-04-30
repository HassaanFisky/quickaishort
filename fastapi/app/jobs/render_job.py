import os
import sys
import logging
import asyncio
import uuid
from app.db.firestore_repo import firestore_repo
from app.models.schemas import Storyboard
from app.agents.scout import resolve_assets
from app.render.composition import compose_video
from app.storage.gcs_repo import gcs_repo

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_job(job_id: str, lock_id: str):
    logger.info(f"Starting render job for ID: {job_id} with lock {lock_id}")
    
    # 1. Fetch metadata & check retries
    job_data = firestore_repo.get_job(job_id)
    if not job_data:
        logger.error(f"Job {job_id} not found in Firestore.")
        sys.exit(1)
        
    retry_count = job_data.get("retry_count", 0)
    if retry_count >= 3:
        logger.error(f"Job {job_id} has exceeded max retries (3). Marking FAILED_PERMANENT.")
        firestore_repo.update_job(job_id, {"status": "FAILED_PERMANENT"})
        sys.exit(1)
        
    # 2. Claim Lock
    if not firestore_repo.claim_job_lock(job_id, lock_id):
        logger.warning(f"Could not claim lock for {job_id}. It may be running or already completed.")
        sys.exit(0)
        
    # Increment retry
    firestore_repo.update_job(job_id, {"retry_count": retry_count + 1})
    
    firestore_repo.append_job_event(job_id, "render_start", {"message": f"Render job started (Attempt {retry_count + 1})."})
    
    try:
        storyboard_dict = job_data.get("storyboard")
        if not storyboard_dict:
            raise ValueError("No storyboard found in job metadata.")
            
        storyboard = Storyboard(**storyboard_dict)
        uid = job_data.get("uid")
        
        # 2. Scout Assets
        resolved_assets = resolve_assets(storyboard)
        
        # 3. Render
        final_mp4 = compose_video(job_id, storyboard, resolved_assets, generate_voiceover=True)
        
        # 4. Upload to GCS
        destination_blob = f"exports/{uid}/{job_id}/final.mp4"
        gcs_uri = gcs_repo.upload_file(destination_blob, final_mp4)
        
        if not gcs_uri:
            raise RuntimeError("Failed to upload final video to GCS.")
            
        # 5. Generate Signed URL
        signed_url = gcs_repo.generate_signed_url(destination_blob, expiration_minutes=1440) # 24 hrs
        
        # 6. Mark Complete
        firestore_repo.update_job(job_id, {
            "current_stage": "COMPLETED",
            "status": "success",
            "output_gcs_path": gcs_uri,
            "output_signed_url": signed_url
        })
        firestore_repo.append_job_event(job_id, "render_complete", {"message": "Render completed successfully."})
        logger.info(f"Job {job_id} completed successfully.")
        
    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}")
        firestore_repo.update_job(job_id, {
            "current_stage": "FAILED",
            "status": "failed",
            "error_message": str(e)
        })
        firestore_repo.append_job_event(job_id, "render_failed", {"message": str(e)})
        sys.exit(1)
    finally:
        # Always unlock
        firestore_repo.unlock_job(job_id, lock_id)

if __name__ == "__main__":
    job_id = os.environ.get("JOB_ID")
    if not job_id:
        logger.error("JOB_ID environment variable not set.")
        sys.exit(1)
        
    # In Cloud Run Jobs, CLOUD_RUN_EXECUTION is unique per execution attempt
    lock_id = os.environ.get("CLOUD_RUN_EXECUTION", uuid.uuid4().hex)
        
    asyncio.run(run_job(job_id, lock_id))
