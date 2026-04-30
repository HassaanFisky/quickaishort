import uuid
import asyncio
import os
import subprocess
import sys
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from app.auth.firebase_auth import get_current_user_id
from app.models.schemas import CreateJobRequest, JobStatusResponse
from app.db.firestore_repo import firestore_repo
from app.agents.preflight import run_preflight
from app.storage.gcs_repo import gcs_repo
from app.transcription.speech_to_text import transcribe_audio_from_gcs
from app.utils.youtube_downloader import download_youtube_audio
from app.config import settings

router = APIRouter()

# Normally we'd trigger a Cloud Run Job via the Google Cloud Run Admin API.
# For local testing/MVP fallback, we simulate it via a background task.
def trigger_cloud_run_job(job_id: str):
    project_id = settings.GCP_PROJECT_ID
    if project_id:
        cmd = [
            "gcloud", "run", "jobs", "execute", "quickaishort-render-job",
            "--region", "us-central1",
            "--project", project_id,
            "--update-env-vars", f"JOB_ID={job_id}"
        ]
        subprocess.Popen(cmd)
    else:
        # Fallback for local dev: Run the script directly
        cmd = [sys.executable, "-m", "app.jobs.render_job"]
        env = dict(os.environ, JOB_ID=job_id)
        subprocess.Popen(cmd, env=env)

@router.post("/jobs", response_model=dict)
async def create_job(request: CreateJobRequest, uid: str = Depends(get_current_user_id)):
    """
    1. Validates input & rate limits.
    2. Runs pre-flight simulation (Director + Personas + Aggregator).
    3. Saves initial job state to Firestore.
    """
    if not firestore_repo.check_rate_limit(uid, max_jobs=10, hours=1):
        raise HTTPException(status_code=429, detail="Rate limit exceeded: max 10 jobs per hour.")

    job_id = uuid.uuid4().hex
    
    # Resolve transcript if needed
    input_text = request.input_text
    if request.input_type == "youtube" and request.input_url:
        # 1. Download YouTube Audio to GCS
        gcs_uri = download_youtube_audio(request.input_url, job_id, uid)
        if gcs_uri:
            # 2. Transcribe it
            input_text = transcribe_audio_from_gcs(gcs_uri)
    elif request.input_type == "talking_head" and request.input_gcs_ref:
        input_text = transcribe_audio_from_gcs(request.input_gcs_ref)

    if not input_text:
        raise HTTPException(status_code=400, detail="Could not resolve input text.")

    # Save initial state
    firestore_repo.create_job(job_id, uid, {
        "status": "preflight",
        "current_stage": "PREFLIGHT",
        "input_type": request.input_type
    })

    # Run Pre-flight
    try:
        storyboard, decision = await run_preflight(input_text, request.input_type)
        
        # Update job with decision
        firestore_repo.update_job(job_id, {
            "status": "decision_pending",
            "current_stage": "DECISION",
            "storyboard": storyboard.model_dump(),
            "persona_results": [p.model_dump() for p in decision.persona_results],
            "viral_score": decision.viral_score,
            "decision": decision.decision,
            "refinement_notes": decision.refinement_notes
        })
        
        return {
            "job_id": job_id,
            "decision": decision.decision,
            "viral_score": decision.viral_score
        }
    except Exception as e:
        firestore_repo.update_job(job_id, {"status": "failed", "error_message": str(e)})
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job(job_id: str, uid: str = Depends(get_current_user_id)):
    job = firestore_repo.get_job(job_id)
    if not job or job.get("uid") != uid:
        raise HTTPException(status_code=404, detail="Job not found")
        
    return JobStatusResponse(
        job_id=job_id,
        status=job.get("status", "unknown"),
        current_stage=job.get("current_stage", "unknown"),
        viral_score=job.get("viral_score"),
        decision=job.get("decision"),
        error_message=job.get("error_message"),
        download_url=job.get("output_signed_url")
    )


@router.post("/jobs/{job_id}/run")
async def run_render_job(job_id: str, uid: str = Depends(get_current_user_id)):
    """
    Triggers the Cloud Run rendering job if the user accepts the pre-flight decision.
    """
    job = firestore_repo.get_job(job_id)
    if not job or job.get("uid") != uid:
        raise HTTPException(status_code=404, detail="Job not found")
        
    if job.get("status") in ["processing", "success"]:
        raise HTTPException(status_code=400, detail="Job is already processing or completed.")
        
    # Trigger CRJ
    trigger_cloud_run_job(job_id)
    
    return {"status": "render_triggered"}


@router.get("/jobs/{job_id}/events")
async def get_job_events(job_id: str, uid: str = Depends(get_current_user_id)):
    """
    Returns events for the job. 
    (In a real app, frontend would listen to Firestore directly, this is a fallback).
    """
    job = firestore_repo.get_job(job_id)
    if not job or job.get("uid") != uid:
        raise HTTPException(status_code=404, detail="Job not found")
        
    # Fetch events collection manually
    events_ref = firestore_repo.db.collection("job_events").document(job_id).collection("events")
    docs = events_ref.order_by("created_at").get()
    
    return [doc.to_dict() for doc in docs]
