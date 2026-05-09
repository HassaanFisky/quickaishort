import os, sys
_REQUIRED = ["MONGODB_URI", "REDIS_URL", "GEMINI_API_KEY"]
_missing = [k for k in _REQUIRED if not os.environ.get(k)]
if _missing:
    print(f"[FATAL] Missing env vars: {_missing}", file=sys.stderr)
    sys.exit(1)
for k in _REQUIRED:
    v = os.environ[k]
    if v.startswith(("redis://localhost", "redis://127")):
        print(f"[FATAL] {k} is localhost — not valid in Cloud Run. Fix Cloud Run env vars.", file=sys.stderr)
        sys.exit(1)

import logging
import os
import time
import signal
import threading
import http.server
import socketserver
import shutil
import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path

from rq import Worker
from services.queue_service import redis_conn, render_queue
from services.logging import get_logger, log_workload, log_metric
from services.storage_service import get_storage_service
from services.events import (
    CHANNEL_EXPORT_COMPLETE,
    CHANNEL_EXPORT_FAILED,
    CHANNEL_STATS_INCREMENT,
    publish,
)
from services.render_service import (
    CaptionsConfig,
    Reframing,
    RenderJob,
    RenderService,
    WatermarkConfig,
)
from services.job_persistence import persist_failed_job

logger = get_logger("render_worker")

def get_mem_usage_mb() -> float:
    """Heuristic for memory pressure (Linux/Cloud Run only)."""
    try:
        with open("/proc/self/status") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    return float(line.split()[1]) / 1024.0
    except Exception:
        return 0.0

def check_memory_pressure():
    """Warn if memory usage is > 80% of typical 8GB limit."""
    mem = get_mem_usage_mb()
    if mem > 6500:
        logger.warning("memory_pressure_high", mem_mb=round(mem, 2))
    return mem

# --- Health Check Server for Cloud Run ---
class HealthCheckHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health/live':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"status": "alive"}')
        elif self.path == '/health/ready':
            # Basic readiness check: can we talk to Redis?
            try:
                redis_conn.ping()
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"status": "ready"}')
            except Exception:
                self.send_response(503)
                self.end_headers()
                self.wfile.write(b'{"status": "not_ready"}')
        else:
            self.send_response(404)
            self.end_headers()

def run_health_server():
    port = int(os.environ.get("PORT", 8080))
    logger.info("starting_health_server", port=port)
    with socketserver.TCPServer(("", port), HealthCheckHandler) as httpd:
        httpd.serve_forever()

# --- Signal Handling for Preemption Safety ---
def handle_preemption(signum, frame):
    """Gracefully handle SIGTERM from Cloud Run."""
    logger.warning("preemption_signal_received", signal=signum)
    # The worker will finish the current job if possible within the grace period (10s on Cloud Run)
    # RQ's Worker handles this partially, but we log it here for observability.
    # No os._exit(0) yet, let RQ finish current job if it can.

signal.signal(signal.SIGTERM, handle_preemption)

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

    job = RenderJob(
        video_id=video_id,
        start_sec=float(start_sec),
        end_sec=float(end_sec),
        aspect_ratio=options.get("aspect_ratio", "9:16"),
        quality=options.get("quality", "medium"),
        reframing=reframing,
        captions=captions,
        watermark=watermark,
    )

    music_id = options.get("music_id")
    if music_id:
        from services.music_service import get_music_service
        music_svc = get_music_service()
        track = music_svc.get_track(music_id)
        if track:
            job.background_music = track.url

    return job

def process_render_task(
    job_id: str,
    video_id: str,
    start_sec: float,
    end_sec: float,
    user_id: str,
    options: dict,
) -> dict:
    """Entry point invoked by RQ."""
    started_at = time.time()
    options = options or {}
    production_plan = options.get("production_plan")
    
    logger.info("processing_render_task_start", job_id=job_id, user_id=user_id)

    def progress(status: str, progress_val: int = 0):
        # Monitor memory at every progress update
        mem = check_memory_pressure()
        from services.events import CHANNEL_EXPORT_PROGRESS
        publish(CHANNEL_EXPORT_PROGRESS, {
            "job_id": job_id, 
            "user_id": user_id, 
            "status": status, 
            "progress": progress_val,
            "mem_usage_mb": round(mem, 2)
        })

    try:
        # Pillar 5: Idempotency Check
        storage = get_storage_service()
        remote_filename = f"exports/{user_id}/{job_id}.mp4"
        
        # Check if this job was already successfully processed (e.g. retry of a successful job)
        if storage.exists(remote_filename):
            logger.info("render_job_idempotency_hit", job_id=job_id)
            payload = {
                "job_id": job_id,
                "user_id": user_id,
                "storage_path": remote_filename,
                "status": "success",
                "idempotency_hit": True
            }
            publish(CHANNEL_EXPORT_COMPLETE, payload)
            log_metric("render_idempotency_hit", 1, user_id=user_id, metadata={"job_id": job_id})
            return payload

        if production_plan:
            from services.render_service import render_video
            progress("Starting production render...", 5)
            result_path = Path(render_video(production_plan))
            duration_sec = sum(
                (float(s.get("end_sec", 0)) - float(s.get("start_sec", 0))) 
                for s in production_plan.get("segments", [])
            )
        else:
            # Pillar 2: Duration Limit Guard
            if (end_sec - start_sec) > 180:
                raise ValueError("Render duration exceeds 180s limit.")

            service = RenderService()
            job = _build_job(video_id, start_sec, end_sec, options)
            render_result = service.run(job, progress_callback=lambda s: progress(s, 30))
            result_path = render_result.output_path
            duration_sec = render_result.duration_sec

        # Storage
        progress("Finalizing export...", 90)
        storage = get_storage_service()
        remote_filename = f"exports/{user_id}/{job_id}.mp4"
        
        gcs_uri = storage.upload_file(
            local_path=result_path,
            remote_path=remote_filename,
            content_type="video/mp4"
        )

        payload = {
            "job_id": job_id,
            "user_id": user_id,
            "storage_path": remote_filename,
            "duration_sec": duration_sec,
            "elapsed_sec": time.time() - started_at,
        }
        
        publish(CHANNEL_EXPORT_COMPLETE, payload)
        publish(CHANNEL_STATS_INCREMENT, {"user_id": user_id, "export_delta": 1, "duration_delta": duration_sec})
        
        # Learning loop — write side.
        # Record this export as a positive outcome so the ScoringAgent can
        # calibrate future analyses against this user's proven score threshold.
        try:
            from services.learning_service import LearningService
            LearningService.record_outcome(
                user_id=user_id,
                video_id=video_id,
                job_id=job_id,
            )
        except Exception:
            pass  # never block the render path

        # Trace cost in logs
        log_workload("render", payload['elapsed_sec'], user_id, {"job_id": job_id})
        log_metric("render_success", 1, user_id=user_id, metadata={"job_id": job_id, "duration_sec": duration_sec, "elapsed_sec": payload['elapsed_sec']})
        
        return {"status": "success", **payload}

    except Exception as exc:
        logger.exception("render_job_failed", job_id=job_id, error=str(exc))
        publish(CHANNEL_EXPORT_FAILED, {"job_id": job_id, "user_id": user_id, "error": str(exc)})
        
        # Dead Letter Persistence (Atomic Recovery)
        asyncio.run(persist_failed_job(job_id, user_id, str(exc), {
            "video_id": video_id,
            "options": options
        }))
        log_metric("render_failure", 1, user_id=user_id, metadata={"job_id": job_id, "error": str(exc)[:200]})
        
        return {"status": "error", "job_id": job_id, "error": str(exc)}

    finally:
        if 'result_path' in locals() and result_path.exists():
            try:
                result_path.unlink()
                if "qais-" in str(result_path.parent):
                    shutil.rmtree(result_path.parent, ignore_errors=True)
            except Exception:
                pass

if __name__ == "__main__":
    # 1. Start health server
    health_thread = threading.Thread(target=run_health_server, daemon=True)
    health_thread.start()
    
    # 2. Start RQ Worker
    logger.info("worker_booting", queue="render_queue")
    Worker([render_queue], connection=redis_conn).work()
