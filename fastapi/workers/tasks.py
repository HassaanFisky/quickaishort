"""Celery task queue configuration and background job definitions."""

import asyncio
import io
import logging
import os
import time
from typing import Optional

from celery import Celery, Task
from celery.exceptions import SoftTimeLimitExceeded

import ffmpeg

from services.observability import (
    track_celery_task,
    track_video_processing,
    capture_ffmpeg_error,
)

logger = logging.getLogger(__name__)

# Celery app configuration
redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "quickaishort_tasks",
    broker=redis_url,
    backend=redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour hard limit
    task_soft_time_limit=3300,  # 55 minutes soft limit
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=100,
)


class CallbackTask(Task):
    """Task with on_success and on_failure callbacks for result storage."""

    def on_success(self, retval, task_id, args, kwargs):
        """Log successful task completion."""
        logger.info("Task %s completed successfully", task_id)

    def on_retry(self, exc, task_id, args, kwargs, einfo):
        """Log task retry."""
        logger.warning("Task %s retrying due to: %s", task_id, exc)

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Log task failure."""
        logger.error("Task %s failed: %s", task_id, exc)


celery_app.Task = CallbackTask


def _get_filter_type(adjustments: dict) -> str:
    """Determine the primary filter type from adjustments for metrics.

    Args:
        adjustments: Frame adjustments dict

    Returns:
        Filter type string (brightness, blur, composite, or none)
    """
    filters_applied = []

    if adjustments.get("brightness", 1.0) != 1.0:
        filters_applied.append("brightness")
    if adjustments.get("contrast", 1.0) != 1.0:
        filters_applied.append("contrast")
    if adjustments.get("saturation", 1.0) != 1.0:
        filters_applied.append("saturation")
    if adjustments.get("hue", 0.0) != 0.0:
        filters_applied.append("hue")
    if adjustments.get("blur", 0.0) > 0:
        filters_applied.append("blur")

    if not filters_applied:
        return "none"
    elif len(filters_applied) == 1:
        return filters_applied[0]
    else:
        return "composite"


async def _process_video_async(
    input_file_id: str,
    frame_adjustments: Optional[dict] = None,
) -> dict:
    """Async helper for video processing with metrics and error tracking."""
    from bson import ObjectId

    from services.storage import (
        download_from_gridfs,
        upload_to_gridfs,
        get_file_metadata,
    )

    processing_start_time = time.time()
    filter_type = _get_filter_type(frame_adjustments or {})

    # Validate input file exists
    try:
        metadata = await get_file_metadata(input_file_id, bucket="uploads")
    except Exception as e:
        logger.error("Input file metadata lookup failed: %s", e)
        raise RuntimeError(f"Input file not found: {input_file_id}") from e

    logger.info(
        "Processing video render: input=%s, adjustments=%s",
        input_file_id,
        frame_adjustments or {},
    )

    # Build filter graph from frame adjustments
    filter_chain = _build_filter_chain(frame_adjustments or {})

    # Stream input from GridFS downloads
    input_buffer = io.BytesIO()
    async for chunk in download_from_gridfs(input_file_id, bucket="uploads"):
        input_buffer.write(chunk)
    input_buffer.seek(0)

    # Process video with ffmpeg and capture errors
    output_buffer = io.BytesIO()
    stdout = b""
    try:
        if filter_chain:
            stream = ffmpeg.input("pipe:0").filter(filter_chain)
        else:
            stream = ffmpeg.input("pipe:0")

        process = stream.output(
            "pipe:1", format="mp4", vcodec="libx264", acodec="aac"
        ).run_async(
            cmd="ffmpeg",
            stdin=ffmpeg.subprocess.PIPE,
            stdout=ffmpeg.subprocess.PIPE,
            stderr=ffmpeg.subprocess.PIPE,
        )

        stdout, stderr = process.communicate(input=input_buffer.getvalue())

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            logger.error("ffmpeg processing failed: %s", error_msg)

            # Capture classified FFmpeg error to Sentry
            capture_ffmpeg_error(
                stderr=error_msg,
                input_file_id=input_file_id,
                filter_type=filter_type,
                extra_context={
                    "filter_chain": filter_chain,
                    "frame_adjustments": frame_adjustments or {},
                },
            )

            raise RuntimeError(f"FFmpeg error: {error_msg[:200]}")

        output_buffer.write(stdout)
        output_buffer.seek(0)

    except RuntimeError:
        # Re-raise FFmpeg errors after logging metrics
        processing_time = time.time() - processing_start_time
        track_video_processing(
            duration_seconds=processing_time,
            output_size_bytes=0,
            filter_type=filter_type,
            status="failure",
        )
        raise

    except Exception as e:
        logger.error("Video processing failed: %s", e)
        processing_time = time.time() - processing_start_time
        track_video_processing(
            duration_seconds=processing_time,
            output_size_bytes=0,
            filter_type=filter_type,
            status="failure",
        )
        raise RuntimeError(f"Video processing failed: {str(e)[:100]}") from e

    # Upload result to GridFS exports
    output_filename = f"processed_{ObjectId()}.mp4"
    try:
        result_file_id = await upload_to_gridfs(
            output_buffer,
            output_filename,
            metadata={
                "source_file_id": input_file_id,
                "frame_adjustments": frame_adjustments or {},
                "processed_by": "process_video_render_task",
            },
            bucket="exports",
        )
    except Exception as e:
        logger.error("Failed to upload processed video: %s", e)
        processing_time = time.time() - processing_start_time
        track_video_processing(
            duration_seconds=processing_time,
            output_size_bytes=0,
            filter_type=filter_type,
            status="failure",
        )
        raise RuntimeError(f"Failed to upload result: {str(e)[:100]}") from e

    # Track successful processing metrics
    output_size = len(stdout)
    duration = metadata.get("metadata", {}).get("duration", 0.0)
    processing_time = time.time() - processing_start_time

    track_video_processing(
        duration_seconds=processing_time,
        output_size_bytes=output_size,
        filter_type=filter_type,
        status="success",
    )

    logger.info(
        "Video render completed: output=%s, size=%d bytes, duration=%.2fs",
        result_file_id,
        output_size,
        processing_time,
    )

    return {
        "status": "success",
        "input_file_id": input_file_id,
        "output_file_id": result_file_id,
        "duration": duration,
        "output_size": output_size,
        "processing_time_seconds": processing_time,
    }


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_video_render_task(
    self,
    input_file_id: str,
    frame_adjustments: Optional[dict] = None,
) -> dict:
    """Process video rendering with frame filter adjustments via ffmpeg.

    Streams binary video from GridFS uploads bucket, applies frame filters
    (brightness, contrast, saturation, hue, blur), and writes to GridFS
    exports bucket.

    Args:
        input_file_id: GridFS ObjectId (string) of input video file
        output_file_id: Optional GridFS ObjectId for output; generated if None
        frame_adjustments: Dict with brightness, contrast, saturation, hue, blur

    Returns:
        dict: {
            "status": "success",
            "input_file_id": str,
            "output_file_id": str,
            "duration": float,
            "output_size": int,
            "processing_time_seconds": float,
        }

    Raises:
        RuntimeError: If video processing fails
    """
    task_start_time = time.time()

    try:
        result = asyncio.run(_process_video_async(input_file_id, frame_adjustments))

        # Track successful task completion
        task_duration = time.time() - task_start_time
        track_celery_task(
            task_name="process_video_render_task",
            duration_seconds=task_duration,
            status="success",
        )

        return result

    except SoftTimeLimitExceeded:
        task_duration = time.time() - task_start_time
        track_celery_task(
            task_name="process_video_render_task",
            duration_seconds=task_duration,
            status="timeout",
        )
        logger.warning("Task timeout for input_file_id=%s, retrying", input_file_id)
        raise self.retry(exc=RuntimeError("Task timeout"))

    except Exception as e:
        task_duration = time.time() - task_start_time
        track_celery_task(
            task_name="process_video_render_task",
            duration_seconds=task_duration,
            status="failure",
        )

        logger.error(
            "Unexpected error in process_video_render_task: %s",
            e,
            exc_info=True,
        )

        if self.request.retries < self.max_retries:
            raise self.retry(exc=e)

        raise RuntimeError(f"Task failed after {self.max_retries} retries: {str(e)}")


def _build_filter_chain(adjustments: dict) -> Optional[str]:
    """Build FFmpeg filter graph from frame adjustments.

    Args:
        adjustments: {
            "brightness": float (0.5-2.0, default 1.0),
            "contrast": float (0.5-2.0, default 1.0),
            "saturation": float (0.5-2.0, default 1.0),
            "hue": float (-180 to 180, default 0),
            "blur": float (0-50, default 0),
        }

    Returns:
        FFmpeg filter string, or None if all adjustments are defaults
    """
    filters = []

    brightness = adjustments.get("brightness", 1.0)
    contrast = adjustments.get("contrast", 1.0)

    if brightness != 1.0 or contrast != 1.0:
        filters.append(f"eq=brightness={brightness - 1}:contrast={contrast}")

    saturation = adjustments.get("saturation", 1.0)
    hue = adjustments.get("hue", 0.0)

    if saturation != 1.0 or hue != 0.0:
        filters.append(f"hue=s={saturation}:h={hue}")

    blur = adjustments.get("blur", 0.0)
    if blur > 0:
        filters.append(f"boxblur=lr={blur / 10}:lh={blur / 10}")

    return ",".join(filters) if filters else None
