"""Observability: Prometheus metrics and Sentry error tracking for Celery workers."""

import logging
import re
from typing import Optional
from prometheus_client import Counter, Histogram, Gauge
import sentry_sdk
from sentry_sdk.integrations.celery import CeleryIntegration

logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────────────────────
# PROMETHEUS METRICS for Celery Workers
# ────────────────────────────────────────────────────────────────────────────

# Task execution metrics
celery_task_duration_seconds = Histogram(
    "celery_task_duration_seconds",
    "Celery task execution duration in seconds",
    labelnames=["task_name", "status"],
    buckets=(0.5, 1.0, 2.5, 5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0),
)

celery_task_total = Counter(
    "celery_task_total",
    "Total Celery tasks executed",
    labelnames=["task_name", "status"],
)

# Video processing specific metrics
video_processing_duration_seconds = Histogram(
    "video_processing_duration_seconds",
    "Video processing time in seconds",
    labelnames=["filter_type", "status"],
    buckets=(1.0, 2.5, 5.0, 10.0, 25.0, 50.0, 100.0, 300.0),
)

video_processing_output_bytes = Histogram(
    "video_processing_output_bytes",
    "Output video file size in bytes",
    labelnames=["filter_type"],
    buckets=(1e6, 5e6, 10e6, 25e6, 50e6, 100e6, 250e6, 500e6, 1e9),
)

ffmpeg_errors_total = Counter(
    "ffmpeg_errors_total",
    "Total FFmpeg processing errors",
    labelnames=["error_type", "filter_type"],
)

# Queue depth and throughput
celery_queue_depth = Gauge(
    "celery_queue_depth",
    "Current depth of Celery task queue",
    labelnames=["queue_name"],
)

celery_worker_tasks_active = Gauge(
    "celery_worker_tasks_active",
    "Number of active tasks per worker",
    labelnames=["worker_name"],
)

# ────────────────────────────────────────────────────────────────────────────
# SENTRY CONFIGURATION with Celery Integration
# ────────────────────────────────────────────────────────────────────────────


def init_sentry_for_celery(dsn: Optional[str] = None, **kwargs) -> None:
    """Initialize Sentry with Celery integration for worker error tracking.

    Args:
        dsn: Sentry DSN. If None, reads from SENTRY_DSN env var.
        **kwargs: Additional Sentry init options.
    """
    import os

    if not dsn:
        dsn = os.getenv("SENTRY_DSN")

    if not dsn:
        logger.info("SENTRY_DSN not configured, skipping Sentry initialization")
        return

    try:
        sentry_sdk.init(
            dsn=dsn,
            integrations=[CeleryIntegration()],
            traces_sample_rate=0.1,
            profiles_sample_rate=0.1,
            **kwargs,
        )
        logger.info("Sentry initialized with Celery integration")
    except Exception as e:
        logger.error("Failed to initialize Sentry: %s", e)


# ────────────────────────────────────────────────────────────────────────────
# FFmpeg Error Classification and Tracking
# ────────────────────────────────────────────────────────────────────────────


class FFmpegError(Exception):
    """Base class for FFmpeg errors with classification."""

    def __init__(self, message: str, error_type: str = "unknown", stderr: str = ""):
        super().__init__(message)
        self.error_type = error_type
        self.stderr = stderr


def classify_ffmpeg_error(stderr: str) -> tuple[str, str]:
    """Classify FFmpeg errors by type for metrics and alerting.

    Args:
        stderr: FFmpeg stderr output

    Returns:
        Tuple of (error_type, error_description)
    """
    stderr_lower = stderr.lower()

    # Codec errors
    if "unknown codec" in stderr_lower or "codec" in stderr_lower:
        if "h264" in stderr_lower or "h.264" in stderr_lower:
            return "codec_h264", "H.264 codec error"
        elif "vp9" in stderr_lower:
            return "codec_vp9", "VP9 codec error"
        elif "aac" in stderr_lower:
            return "codec_aac", "AAC codec error"
        elif "opus" in stderr_lower:
            return "codec_opus", "Opus codec error"
        return "codec_unknown", "Unknown codec error"

    # Filter errors
    if "filter" in stderr_lower:
        if "boxblur" in stderr_lower:
            return "filter_blur", "Blur filter error"
        elif "hue" in stderr_lower:
            return "filter_hue", "Hue/saturation filter error"
        elif "eq" in stderr_lower or "brightness" in stderr_lower:
            return "filter_brightness", "Brightness/contrast filter error"
        return "filter_unknown", "Unknown filter error"

    # Input/output errors
    if "invalid" in stderr_lower or "corrupted" in stderr_lower:
        return "invalid_input", "Invalid or corrupted input file"
    if "no such file" in stderr_lower or "does not exist" in stderr_lower:
        return "file_not_found", "Input file not found"
    if "permission denied" in stderr_lower:
        return "permission_denied", "Permission denied accessing file"

    # Memory/resource errors
    if "out of memory" in stderr_lower or "enomem" in stderr_lower:
        return "out_of_memory", "Out of memory"
    if "too many open files" in stderr_lower:
        return "resource_exhausted", "Resource exhausted"

    # Stream/format errors
    if "stream" in stderr_lower or "format" in stderr_lower:
        return "stream_error", "Stream or format error"

    # Timeout or incomplete processing
    if "timeout" in stderr_lower or "truncated" in stderr_lower:
        return "timeout", "Timeout or truncated stream"

    return "unknown", "Unknown FFmpeg error"


def capture_ffmpeg_error(
    stderr: str,
    input_file_id: str,
    filter_type: str = "unknown",
    extra_context: Optional[dict] = None,
) -> None:
    """Capture and classify FFmpeg errors in Sentry with structured context.

    Args:
        stderr: FFmpeg stderr output
        input_file_id: Input file ObjectId for reference
        filter_type: Type of filter applied (brightness, contrast, etc.)
        extra_context: Additional context dict to attach to the error
    """
    error_type, error_description = classify_ffmpeg_error(stderr)

    # Track in Prometheus
    ffmpeg_errors_total.labels(error_type=error_type, filter_type=filter_type).inc()

    # Create FFmpegError and capture in Sentry
    try:
        ffmpeg_err = FFmpegError(
            message=error_description,
            error_type=error_type,
            stderr=stderr[:500],  # Truncate to avoid huge payloads
        )

        with sentry_sdk.push_scope() as scope:
            scope.set_tag("error_type", error_type)
            scope.set_tag("filter_type", filter_type)
            scope.set_context(
                "ffmpeg",
                {
                    "stderr": stderr[:1000],
                    "input_file_id": str(input_file_id),
                    "filter_type": filter_type,
                },
            )

            if extra_context:
                scope.set_context("processing", extra_context)

            sentry_sdk.capture_exception(ffmpeg_err)

        logger.error(
            "FFmpeg error: type=%s, filter=%s, input=%s",
            error_type,
            filter_type,
            input_file_id,
        )

    except Exception as e:
        logger.error("Failed to capture FFmpeg error in Sentry: %s", e)


def track_celery_task(task_name: str, duration_seconds: float, status: str) -> None:
    """Record Celery task metrics.

    Args:
        task_name: Name of the Celery task
        duration_seconds: Execution duration in seconds
        status: Task status (success, failure, timeout)
    """
    celery_task_duration_seconds.labels(task_name=task_name, status=status).observe(
        duration_seconds
    )
    celery_task_total.labels(task_name=task_name, status=status).inc()


def track_video_processing(
    duration_seconds: float,
    output_size_bytes: int,
    filter_type: str = "none",
    status: str = "success",
) -> None:
    """Record video processing metrics.

    Args:
        duration_seconds: Processing duration
        output_size_bytes: Output file size
        filter_type: Filter applied (brightness, contrast, blur, etc.)
        status: Processing status (success, failure)
    """
    video_processing_duration_seconds.labels(
        filter_type=filter_type, status=status
    ).observe(duration_seconds)

    if status == "success":
        video_processing_output_bytes.labels(filter_type=filter_type).observe(
            output_size_bytes
        )
