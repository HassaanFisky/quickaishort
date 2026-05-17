import os, sys
from pathlib import Path

# Ensure the current directory is in sys.path for reliable module resolution
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

def validate_env():
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
    CanvasOverlay,
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
        if self.path in ('/', '/health', '/health/live'):
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
_worker_ref = None

def handle_preemption(signum, frame):
    """Gracefully handle SIGTERM from Cloud Run."""
    logger.warning("preemption_signal_received", signal=signum)
    global _worker_ref
    if _worker_ref:
        logger.info("triggering_rq_worker_warm_shutdown")
        _worker_ref.request_stop(signum, frame)

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
    elif "salient_center_x" in options:
        # CHANGED: Added autonomous reframing fallback from viral agent analysis
        reframing = Reframing(
            center_x=float(options["salient_center_x"]),
            center_y=0.5,
            scale=1.0
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
        hook_overlay=str(options.get("hook_overlay", "")),
        emotional_peaks=list(options.get("emotional_peaks", [])),
        cinematic_style=str(options.get("cinematic_style", "Impact")),
        canvas_overlays=[
            CanvasOverlay(
                type=str(ov.get("type", "text")),
                content=str(ov.get("content", ""))[:200],
                x_pct=float(ov.get("x_pct", 0.5)),
                y_pct=float(ov.get("y_pct", 0.5)),
                scale=float(ov.get("scale", 1.0)),
                rotation=float(ov.get("rotation", 0.0)),
            )
            for ov in options.get("canvas_overlays", [])
            if isinstance(ov, dict) and ov.get("content")
        ],
        audio_boost=float(options.get("audio_boost", 85.0)),
        playback_speed=float(options.get("playback_speed", 100.0)),
        noise_suppression=float(options.get("noise_suppression", 20.0)),
        filter_name=str(options.get("filter_name", "None")),
        transition_enabled=bool(options.get("transition_enabled", False)),
        voiceover_enabled=bool(options.get("voiceover_enabled", False)),
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
    return asyncio.run(_async_process_render_task(
        job_id, video_id, start_sec, end_sec, user_id, options
    ))

async def _async_process_render_task(
    job_id: str,
    video_id: str,
    start_sec: float,
    end_sec: float,
    user_id: str,
    options: dict,
) -> dict:
    """Actual async implementation that shares a single event loop."""
    started_at = time.time()
    options = options or {}
    production_plan = options.get("production_plan")

    # C2 fix: Motor's AsyncIOMotorClient is bound to the event loop it was
    # created in. RQ calls asyncio.run() for each job, which creates a *new*
    # event loop. We must close and re-initialize the Motor client on every
    # invocation; otherwise, jobs #2+ will get "Event loop is closed" on all
    # DB operations because _client was created in the previous loop.
    from services.db import init_db, close_db
    await close_db()   # no-op if already None; releases the old closed-loop client
    await init_db()

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

    # C4 fix: Declare before try so finally always has a safe reference,
    # even if an exception is raised before the variable is first assigned.
    result_path: Optional[Path] = None

    try:
        # Pillar 5: Idempotency Check
        storage = get_storage_service()
        remote_filename = f"exports/{user_id}/{job_id}.mp4"
        
        # Check if this job was already successfully processed (e.g. retry of a successful job)
        if await storage.exists_async(remote_filename):
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

        # ---------------------------------------------------------------
        # Studio Voiceover Synthesis (ADK Studio path only)
        #
        # Triggered when the Studio UI sends `voiceover_enabled: true` and
        # `script_prompt: <text>` in the export options. We synthesize the
        # voiceover via ScriptAgent.generate_voiceover (Google Cloud TTS,
        # blocking — run in a thread to avoid the event loop), then inject
        # the local mp3 path into production_plan["voiceover_path"] so the
        # existing render_video pipeline blends it via the amix filter.
        #
        # Safe-fail: any synthesis failure logs and proceeds without a
        # voiceover overlay. The render itself is never blocked by TTS.
        #
        # Standard (single-clip) renders do not currently accept a separate
        # voiceover track — RenderJob exposes `voiceover_enabled` only for
        # vocal-band audio EQ. If the Studio toggle is ever extended to the
        # standard path, RenderService.run() will need its own integration.
        # ---------------------------------------------------------------
        if (
            production_plan is not None
            and options.get("voiceover_enabled")
            and options.get("script_prompt")
            and not production_plan.get("voiceover_path")
        ):
            try:
                from agent.script_agent import ScriptAgent
                script_prompt = str(options["script_prompt"])
                progress("Synthesizing voiceover...", 3)
                voiceover_local_path = await asyncio.to_thread(
                    ScriptAgent().generate_voiceover, script_prompt
                )
                if voiceover_local_path:
                    production_plan["voiceover_path"] = voiceover_local_path
                    logger.info(
                        "voiceover_synthesized",
                        job_id=job_id,
                        path=voiceover_local_path,
                    )
            except Exception as exc:
                # Degrade gracefully — render proceeds without the voiceover.
                logger.warning(
                    "voiceover_generation_failed",
                    job_id=job_id,
                    error=str(exc),
                )

        # Forward Smart Transitions toggle into the production_plan so
        # render_video() can switch from frame-accurate concat to a 0.5s
        # xfade chain between adjacent clips. Mirrors how voiceover_path is
        # injected above; no-op if the plan has already set its own value.
        if (
            production_plan is not None
            and options.get("transition_enabled")
            and "transition_enabled" not in production_plan
        ):
            production_plan["transition_enabled"] = True

        if production_plan:
            from services.render_service import render_video
            progress("Starting production render...", 5)
            # render_video is sync because it calls ffmpeg.run() which is blocking
            # This is fine; we are in a worker thread/process.
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
        
        gcs_uri = await storage.upload_file_async(
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
        await persist_failed_job(job_id, user_id, str(exc), {
            "video_id": video_id,
            "options": options
        })
        log_metric("render_failure", 1, user_id=user_id, metadata={"job_id": job_id, "error": str(exc)[:200]})
        
        return {"status": "error", "job_id": job_id, "error": str(exc)}


    finally:
        # C4 fix: safe cleanup regardless of where in the try block we failed
        if result_path is not None:
            try:
                if result_path.exists():
                    result_path.unlink(missing_ok=True)
                # render_video moves output out of workdir to a bare /tmp file;
                # its own workdir is cleaned in render_video's finally block.
                # For the single-clip RenderService path the workdir carries a
                # "qais-export-" prefix; clean the whole directory.
                if result_path.parent != Path(tempfile.gettempdir()) and "qais-" in str(result_path.parent):
                    shutil.rmtree(result_path.parent, ignore_errors=True)
            except Exception:
                pass

if __name__ == "__main__":
    import sys
    # Force line-buffered output for Cloud Logging
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
    validate_env()

    # Skip top-level init_db here; let process_render_task handle it per-loop
    # to avoid "Event loop is closed" errors.
    logger.info("mongodb_init_deferred_to_task_lifecycle")


    logger.info("worker_starting_production_lifecycle", queue=render_queue.name)
    
    # Start health server in background
    threading.Thread(target=run_health_server, daemon=True).start()
    
    try:
        worker = Worker([render_queue], connection=redis_conn)
        _worker_ref = worker
        worker.work(with_scheduler=True)
    except Exception as e:
        logger.error("worker_fatal_crash", error=str(e))
        sys.exit(1)
