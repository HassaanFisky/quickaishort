"""RQ worker entry point. Runs as a separate process from the FastAPI web app.

Run as a separate process: `python render_worker.py`
Deployed as a Cloud Run Job or standalone container alongside the web service.

Each task delegates to RenderService for the heavy lifting, then synchronously
uploads the result to GridFS using a per-job pymongo connection (workers do
NOT share the web app's motor pool — different process). On success/failure it
publishes to Redis pubsub so the FastAPI lifespan listener can fan out a stats
increment + Pusher event.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import gridfs
import shutil
from dotenv import load_dotenv
from pymongo import MongoClient
from rq import Worker

from services.events import (
    CHANNEL_EXPORT_COMPLETE,
    CHANNEL_EXPORT_FAILED,
    CHANNEL_STATS_INCREMENT,
    publish,
)
from services.queue_service import redis_conn, render_queue
from services.render_service import (
    CaptionsConfig,
    Reframing,
    RenderJob,
    RenderService,
    WatermarkConfig,
)

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("render_worker")

EXPORT_TTL_SECONDS = int(os.getenv("EXPORT_URL_TTL_SECONDS", str(24 * 60 * 60)))


def _gridfs_bucket() -> gridfs.GridFSBucket:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI environment variable is not set — cannot store render output")
    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    db = client.get_database("quickai_shorts")
    return gridfs.GridFSBucket(db, bucket_name="exports")


def _build_job(
    video_id: str,
    start_sec: float,
    end_sec: float,
    options: dict,
) -> RenderJob:
    reframing = None
    raw_reframe = options.get("reframing")
    if isinstance(raw_reframe, dict) and "center" in raw_reframe:
        center = raw_reframe.get("center", {})
        reframing = Reframing(
            center_x=float(center.get("x", 0.5)),
            center_y=float(center.get("y", 0.5)),
            scale=float(raw_reframe.get("scale", 1.0)),
        )

    captions = CaptionsConfig(
        enabled=bool(options.get("captions_enabled", False)),
        srt_content=str(options.get("captions_srt", "") or ""),
        style=str(options.get("captions_style", "")) or CaptionsConfig.style,
    )

    watermark = WatermarkConfig(
        enabled=bool(options.get("watermark_enabled", False)),
        image_path=Path(options["watermark_path"])
        if options.get("watermark_path")
        else None,
    )

    return RenderJob(
        video_id=video_id,
        start_sec=float(start_sec),
        end_sec=float(end_sec),
        aspect_ratio=options.get("aspect_ratio", "9:16"),
        quality=options.get("quality", "medium"),
        reframing=reframing,
        captions=captions,
        watermark=watermark,
    )


def process_render_task(
    job_id: str,
    video_id: str,
    start_sec: float,
    end_sec: float,
    user_id: str,
    options: dict,
) -> dict:
    """Entry point invoked by RQ. Returns a dict for inspection in the web app."""
    started_at = time.time()
    options = options or {}
    production_plan = options.get("production_plan")
    
    # Pillar 2: Production safety — check for existing export if idempotent (partial)
    # Note: Currently we always re-render if enqueued, but we use job_id as the stable identifier.

    result_path = None
    duration_sec = 0
    
    try:
        if production_plan:
            # Handle multi-segment production plan
            from services.render_service import render_video
            result_path = Path(render_video(production_plan))
            duration_sec = sum(
                (float(s.get("end_sec", 0)) - float(s.get("start_sec", 0))) 
                for s in production_plan.get("segments", [])
            )
        else:
            # Handle single-clip export
            service = RenderService()
            job = _build_job(video_id, start_sec, end_sec, options)
            render_result = service.run(job)
            result_path = render_result.output_path
            duration_sec = render_result.duration_sec

        # Upload to GridFS
        bucket = _gridfs_bucket()
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=EXPORT_TTL_SECONDS)
        
        with result_path.open("rb") as fh:
            grid_id = bucket.upload_from_stream(
                f"{job_id}.mp4",
                fh,
                metadata={
                    "job_id": job_id,
                    "user_id": user_id,
                    "video_id": video_id,
                    "duration_sec": duration_sec,
                    "expires_at": expires_at,
                    "is_production_plan": bool(production_plan),
                },
            )

        payload = {
            "job_id": job_id,
            "user_id": user_id,
            "gridfs_id": str(grid_id),
            "duration_sec": duration_sec,
            "file_size_bytes": result_path.stat().st_size,
            "elapsed_sec": time.time() - started_at,
        }
        
        publish(CHANNEL_EXPORT_COMPLETE, payload)
        publish(
            CHANNEL_STATS_INCREMENT,
            {
                "user_id": user_id,
                "export_delta": 1,
                "duration_delta": duration_sec,
            },
        )
        
        logger.info(f"Job {job_id} completed in {payload['elapsed_sec']:.2f}s")
        return {"status": "success", **payload}

    except Exception as exc:
        logger.exception("Render job %s failed: %s", job_id, exc)
        publish(
            CHANNEL_EXPORT_FAILED,
            {"job_id": job_id, "user_id": user_id, "error": str(exc)},
        )
        return {"status": "error", "job_id": job_id, "error": str(exc)}

    finally:
        if result_path and result_path.exists():
            # Clean up the final MP4 from local temp storage
            try:
                result_path.unlink()
                # Also try to cleanup parent workdir if it's a temp dir
                if "qais-" in str(result_path.parent):
                    shutil.rmtree(result_path.parent, ignore_errors=True)
            except Exception:
                pass


if __name__ == "__main__":
    Worker([render_queue], connection=redis_conn).work()
