import asyncio
import http.server
import json
import os
import shutil
import signal
import socketserver
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Optional

# Ensure the current directory is in sys.path for reliable module resolution
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from rq import Worker  # noqa: E402
from services.queue_service import (  # noqa: E402
    redis_conn,
    render_queue,
    JOB_TIMEOUT_SECONDS,
)
from services.logging import get_logger, log_workload, log_metric  # noqa: E402
from services.storage_service import get_storage_service  # noqa: E402
from services.events import (  # noqa: E402
    CHANNEL_EXPORT_COMPLETE,
    CHANNEL_EXPORT_FAILED,
    CHANNEL_STATS_INCREMENT,
    publish,
)
from services.render_service import (  # noqa: E402
    CanvasOverlay,
    CaptionsConfig,
    Reframing,
    RenderJob,
    RenderService,
    WatermarkConfig,
)
from services.observability import (  # noqa: E402
    track_manifest_ingest,
    track_manifest_compile,
    track_manifest_render,
)
from services.job_persistence import persist_failed_job  # noqa: E402
from services.render_queue import push_result as _rq_push_result  # noqa: E402


def validate_env():
    _REQUIRED = ["REDIS_URL", "GEMINI_API_KEY"]
    _missing = [k for k in _REQUIRED if not os.environ.get(k)]
    if _missing:
        print(f"[FATAL] Missing env vars: {_missing}", file=sys.stderr)
        sys.exit(1)
    for k in _REQUIRED:
        v = os.environ[k]
        if v.startswith(("redis://localhost", "redis://127")):
            print(
                f"[FATAL] {k} is localhost — not valid in Cloud Run. Fix Cloud Run env vars.",
                file=sys.stderr,
            )
            sys.exit(1)


logger = get_logger("render_worker")

# Recovery + run-isolation keys. All use the SYNC redis_conn: a redis.asyncio
# client would bind to the first asyncio.run() loop and break on the next job's
# fresh loop. Sync ops here are tiny and mirror the existing publish() pattern.
_META_KEY = "render:meta:{}"
_ARGS_KEY = "render:args:{}"
_RUNID_KEY = "render:runid:{}"
_LOCK_KEY = "render:lock:{}"
_RECOVERY_TTL = 7200  # 2h — recovery/run records self-expire
_STALE_THRESHOLD_S = 600  # 10 min before a 'processing' job is treated as orphaned


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
        if self.path in ("/", "/health", "/health/live"):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"status": "alive"}')
        elif self.path == "/health/ready":
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

    def do_POST(self):
        # Absorb POST probes from GCP metadata server (169.254.169.126) and
        # any other internal lifecycle checks — always 200 so Cloud Run does
        # not flag the container as unhealthy.
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status": "ok"}')


class HealthCheckServer(socketserver.TCPServer):
    allow_reuse_address = True


def run_health_server():
    port = int(os.environ.get("PORT", 8080))
    logger.info("starting_health_server", port=port)
    with HealthCheckServer(("", port), HealthCheckHandler) as httpd:
        httpd.serve_forever()


# --- Signal Handling for Preemption Safety ---
_worker_ref = None


def handle_preemption(signum, frame):
    """Gracefully handle SIGTERM from Cloud Run."""
    logger.warning("preemption_signal_received", signal=signum)
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
            center_x=float(options["salient_center_x"]), center_y=0.5, scale=1.0
        )

    captions = CaptionsConfig(
        enabled=bool(options.get("captions_enabled", False)),
        srt_content=str(options.get("captions_srt", "") or ""),
        style=str(options.get("captions_style", "")) or CaptionsConfig.style,
    )

    watermark = WatermarkConfig(
        enabled=bool(options.get("watermark_enabled", False)),
        image_path=(
            Path(options["watermark_path"]) if options.get("watermark_path") else None
        ),
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
        manifest_filter_complex=options.get("_manifest_filter_complex"),
        manifest_meta=options.get("render_manifest"),
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
    run_id: str = "",
) -> dict:
    """Entry point invoked by RQ."""
    return asyncio.run(
        _async_process_render_task(
            job_id, video_id, start_sec, end_sec, user_id, options, run_id
        )
    )


async def _async_process_render_task(
    job_id: str,
    video_id: str,
    start_sec: float,
    end_sec: float,
    user_id: str,
    options: dict,
    run_id: str = "",
) -> dict:
    """Actual async implementation that shares a single event loop."""
    started_at = time.time()
    options = options or {}
    production_plan = options.get("production_plan")
    render_manifest = options.get("render_manifest")

    # Phase 61: Manifest compile validation
    if render_manifest:
        try:
            from services.manifest_renderer import compile_manifest_to_ffmpeg
            import time

            t0 = time.time()

            # Mock path to bypass .exists() check during initial compilation
            class MockPath:
                def __init__(self, name):
                    self.name = str(name)

                def exists(self):
                    return True

                def __truediv__(self, other):
                    return MockPath(f"{self.name}/{other}")

                def __str__(self):
                    return self.name

            filter_complex, render_meta = compile_manifest_to_ffmpeg(
                render_manifest,
                workdir=Path(tempfile.gettempdir()),
                input_resolver=lambda sid: MockPath(sid),
            )
            compile_s = time.time() - t0
            track_manifest_compile(compile_s)
            track_manifest_ingest("valid", render_meta.get("clip_count", 0))

            options["_manifest_filter_complex"] = filter_complex
            options["_manifest_meta"] = render_meta
            logger.info(
                "manifest_render_accepted",
                clip_count=render_meta.get("clip_count", 0),
                duration=render_meta.get("duration", 0.0),
                compile_ms=int(compile_s * 1000),
            )
        except Exception as e:
            logger.error("manifest_render_compile_failed", error=str(e))
            track_manifest_ingest("invalid", 0)
            # Fall back to legacy path
            render_manifest = None
            options.pop("_manifest_filter_complex", None)
            options.pop("_manifest_meta", None)
    else:
        track_manifest_ingest("missing", 0)

    logger.info("processing_render_task_start", job_id=job_id, user_id=user_id)

    def progress(status: str, progress_val: int = 0):
        # Monitor memory at every progress update
        mem = check_memory_pressure()
        from services.events import CHANNEL_EXPORT_PROGRESS

        publish(
            CHANNEL_EXPORT_PROGRESS,
            {
                "job_id": job_id,
                "user_id": user_id,
                "status": status,
                "progress": progress_val,
                "mem_usage_mb": round(mem, 2),
            },
        )

    # C4 fix: Declare before try so finally always has a safe reference,
    # even if an exception is raised before the variable is first assigned.
    result_path: Optional[Path] = None

    try:
        # Pillar 5: Idempotency Check
        storage = get_storage_service()
        remote_filename = f"exports/{user_id}/{job_id}.mp4"

        # Check if this job was already successfully processed (e.g. retry of a successful job)
        # O3: never block the render on a failed existence probe (GCS 403 from
        # billing/IAM, transient errors) — assume not-exists and proceed.
        try:
            _already_done = await storage.exists_async(remote_filename)
        except Exception as exc:
            logger.warning(
                "gcs_exists_check_failed job_id=%s error=%s — assuming not exists",
                job_id,
                str(exc)[:200],
            )
            _already_done = False
        if _already_done:
            logger.info("render_job_idempotency_hit", job_id=job_id)
            payload = {
                "job_id": job_id,
                "user_id": user_id,
                "storage_path": remote_filename,
                "status": "success",
                "idempotency_hit": True,
            }
            publish(CHANNEL_EXPORT_COMPLETE, payload)
            log_metric(
                "render_idempotency_hit",
                1,
                user_id=user_id,
                metadata={"job_id": job_id},
            )
            return payload

        # O4/O1: record crash-recovery args + 'processing' status AFTER the
        # idempotency check, so an idempotency hit never leaves a stale
        # 'processing' marker that recover_stale_jobs() would re-enqueue forever.
        try:
            redis_conn.set(
                _ARGS_KEY.format(job_id),
                json.dumps(
                    {
                        "job_id": job_id,
                        "video_id": video_id,
                        "start_sec": start_sec,
                        "end_sec": end_sec,
                        "user_id": user_id,
                        "options": options,
                        "run_id": run_id,
                    },
                    default=str,
                ),
                ex=_RECOVERY_TTL,
            )
            redis_conn.hset(
                _META_KEY.format(job_id),
                mapping={"status": "processing", "started_at": str(started_at)},
            )
            redis_conn.expire(_META_KEY.format(job_id), _RECOVERY_TTL)
            if run_id:
                redis_conn.set(_RUNID_KEY.format(job_id), run_id, ex=_RECOVERY_TTL)
        except Exception as exc:
            logger.warning(
                "recovery_marker_write_failed job_id=%s error=%s", job_id, str(exc)
            )

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
            # We wrap it in to_thread so it doesn't starve the async event loop (which could drop Redis async keepalives).
            result_path = Path(await asyncio.to_thread(render_video, production_plan))
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
            render_result = service.run(
                job, progress_callback=lambda s: progress(s, 30)
            )
            result_path = render_result.output_path
            duration_sec = render_result.duration_sec

        # Storage
        progress("Finalizing export...", 90)
        storage = get_storage_service()
        remote_filename = f"exports/{user_id}/{job_id}.mp4"

        # O1: if a newer run claimed this job_id, discard this (stale) result
        # rather than overwriting the fresh output.
        if run_id:
            _owner = redis_conn.get(_RUNID_KEY.format(job_id))
            if isinstance(_owner, (bytes, bytearray)):
                _owner = _owner.decode()
            if _owner and _owner != run_id:
                logger.warning(
                    "stale_result_discarded job_id=%s my_run=%s current=%s",
                    job_id,
                    run_id,
                    _owner,
                )
                # Mark terminal so render:meta doesn't hang at 'processing'.
                try:
                    redis_conn.hset(
                        _META_KEY.format(job_id),
                        mapping={"status": "superseded"},
                    )
                except Exception:
                    pass
                return {"status": "superseded", "job_id": job_id}

        # O3: idempotency lock — exactly one worker uploads for a given job_id,
        # preventing two concurrent runs from both passing exists_async() and
        # racing the GCS write.
        _lock_ok = redis_conn.set(_LOCK_KEY.format(job_id), "1", nx=True, ex=3600)
        if not _lock_ok:
            logger.info(
                "idempotency_lock_hit job_id=%s — duplicate upload skipped", job_id
            )
            # Mark terminal so render:meta doesn't hang at 'processing'.
            try:
                redis_conn.hset(
                    _META_KEY.format(job_id),
                    mapping={"status": "duplicate"},
                )
            except Exception:
                pass
            return {"status": "duplicate", "job_id": job_id}
        try:
            await storage.upload_file_async(
                local_path=result_path,
                remote_path=remote_filename,
                content_type="video/mp4",
            )

            # Phase 62: persist manifest
            try:
                from services.job_persistence import (
                    persist_render_manifest,
                    upload_manifest_to_gcs,
                )

                manifest = options.get("render_manifest")
                if manifest:
                    await persist_render_manifest(
                        job_id, user_id, manifest, options.get("_manifest_meta")
                    )
                    try:
                        await upload_manifest_to_gcs(job_id, user_id, manifest)
                    except Exception:
                        pass
            except Exception as e:
                logger.warning(
                    "manifest_persistence_failed_non_fatal", job_id=job_id, error=str(e)
                )
        finally:
            try:
                redis_conn.delete(_LOCK_KEY.format(job_id))
            except Exception:
                pass

        payload = {
            "job_id": job_id,
            "user_id": user_id,
            "storage_path": remote_filename,
            "duration_sec": duration_sec,
            "elapsed_sec": time.time() - started_at,
        }

        # Phase 64: render duration metric
        if options.get("render_manifest"):
            track_manifest_render(
                time.time() - started_at, quality=options.get("quality", "medium")
            )

        publish(CHANNEL_EXPORT_COMPLETE, payload)
        publish(
            CHANNEL_STATS_INCREMENT,
            {"user_id": user_id, "export_delta": 1, "duration_delta": duration_sec},
        )

        try:
            _rq_push_result(
                job_id,
                user_id,
                "success",
                rendered_url=f"exports/{user_id}/{job_id}.mp4",
                duration_ms=(time.time() - started_at) * 1000,
            )
        except Exception as redis_err:
            logger.warning("redis_success_publish_failed", error=str(redis_err))

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
        log_workload("render", payload["elapsed_sec"], user_id, {"job_id": job_id})
        log_metric(
            "render_success",
            1,
            user_id=user_id,
            metadata={
                "job_id": job_id,
                "duration_sec": duration_sec,
                "elapsed_sec": payload["elapsed_sec"],
            },
        )

        return {"status": "success", **payload}

    except Exception as exc:
        logger.exception("render_job_failed", job_id=job_id, error=str(exc))
        publish(
            CHANNEL_EXPORT_FAILED,
            {"job_id": job_id, "user_id": user_id, "error": str(exc)},
        )

        # Stream-layer DLQ tracking (attempt count from RQ job header when available)
        try:
            from rq import get_current_job as _gcj

            _rq_job = _gcj()
            _attempt = (_rq_job.retries_left if _rq_job else 0) or 0
            _attempt_number = 3 - _attempt  # retries_left counts down from max
            _rq_push_result(
                job_id, user_id, "failed", error=str(exc), attempt=_attempt_number
            )
        except Exception as redis_err:
            logger.warning("redis_dlq_publish_failed", error=str(redis_err))

        # Dead Letter Persistence (Atomic Recovery)
        await persist_failed_job(
            job_id, user_id, str(exc), {"video_id": video_id, "options": options}
        )
        log_metric(
            "render_failure",
            1,
            user_id=user_id,
            metadata={"job_id": job_id, "error": str(exc)[:200]},
        )

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
                if result_path.parent != Path(tempfile.gettempdir()) and "qais-" in str(
                    result_path.parent
                ):
                    shutil.rmtree(result_path.parent, ignore_errors=True)
            except Exception:
                pass


def recover_stale_jobs() -> None:
    """O4: Re-enqueue jobs stuck in 'processing' longer than _STALE_THRESHOLD_S.

    Called once at worker boot. A job is orphaned when a worker dies mid-render
    after writing its 'processing' marker but before reaching a terminal status.
    Uses the sync redis_conn (boot context — no event loop running yet) and
    reads render:meta:* as a HASH (hgetall), not JSON.
    """
    now = time.time()
    cursor = 0
    recovered = 0
    try:
        while True:
            cursor, keys = redis_conn.scan(cursor, match="render:meta:*", count=100)
            for key in keys:
                key_str = key.decode() if isinstance(key, (bytes, bytearray)) else key
                raw = redis_conn.hgetall(key)
                if not raw:
                    continue
                meta = {
                    (k.decode() if isinstance(k, (bytes, bytearray)) else k): (
                        v.decode() if isinstance(v, (bytes, bytearray)) else v
                    )
                    for k, v in raw.items()
                }
                if meta.get("status") != "processing":
                    continue
                try:
                    started_at = float(meta.get("started_at", now))
                except (TypeError, ValueError):
                    started_at = now
                if (now - started_at) < _STALE_THRESHOLD_S:
                    continue

                job_id = key_str.split("render:meta:", 1)[-1]
                args_raw = redis_conn.get(_ARGS_KEY.format(job_id))
                if not args_raw:
                    logger.warning(
                        "crash_recovery_no_args job_id=%s — cannot re-enqueue", job_id
                    )
                    continue
                try:
                    args = json.loads(args_raw)
                except Exception:
                    continue

                logger.warning(
                    "crash_recovery_reenqueue job_id=%s age_s=%.0f",
                    job_id,
                    now - started_at,
                )
                render_queue.enqueue(
                    process_render_task,
                    args["job_id"],
                    args["video_id"],
                    args["start_sec"],
                    args["end_sec"],
                    args["user_id"],
                    args["options"],
                    args.get("run_id", ""),
                    job_id=args["job_id"],
                    job_timeout=JOB_TIMEOUT_SECONDS,
                )
                recovered += 1

            if cursor == 0:
                break
    except Exception as exc:
        logger.error("crash_recovery_failed error=%s", str(exc))
    logger.info("crash_recovery_complete recovered=%d", recovered)


if __name__ == "__main__":
    import sys

    # Force line-buffered output for Cloud Logging
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
    validate_env()

    # Sync clients (Firestore + GCS) are not bound to any event loop —
    # initialize once here and reuse across all RQ jobs.
    from services.db import init_db_sync

    init_db_sync()
    logger.info("gcp_clients_initialized")

    # O4: re-enqueue any jobs orphaned by a previous worker crash/restart.
    recover_stale_jobs()

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
