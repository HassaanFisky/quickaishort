"""Video processing and upload routes."""

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, File, UploadFile, Depends, HTTPException
from pydantic import BaseModel, Field

from services.auth import get_verified_user_id
from services.storage import upload_to_gridfs
from workers.tasks import process_video_render_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/video", tags=["video"])


class FrameAdjustment(BaseModel):
    """Frame filter adjustments for video processing."""

    brightness: float = Field(default=1.0, ge=0.5, le=2.0)
    contrast: float = Field(default=1.0, ge=0.5, le=2.0)
    saturation: float = Field(default=1.0, ge=0.5, le=2.0)
    hue: float = Field(default=0.0, ge=-180.0, le=180.0)
    blur: float = Field(default=0.0, ge=0.0, le=50.0)


class VideoUploadResponse(BaseModel):
    """Response from video upload endpoint."""

    request_id: str = Field(description="Unique upload request ID")
    file_id: str = Field(description="GridFS ObjectId for uploaded file")
    filename: str = Field(description="Uploaded filename")
    task_id: Optional[str] = Field(default=None, description="Celery task ID if processing requested")
    message: str = Field(description="Status message")


class VideoProcessResponse(BaseModel):
    """Response from video processing task."""

    status: str = Field(description="success or failed")
    input_file_id: str
    output_file_id: Optional[str] = None
    duration: float = 0.0
    output_size: int = 0


@router.post("/upload", response_model=VideoUploadResponse)
async def upload_video(
    file: UploadFile = File(...),
    process_video: bool = False,
    frame_adjustments: Optional[str] = None,
    verified_user_id: str = Depends(get_verified_user_id),
) -> VideoUploadResponse:
    """Upload a video file to GridFS.

    Optionally dispatches background processing task to apply frame filters
    (brightness, contrast, saturation, hue, blur).

    Args:
        file: Video file stream (UploadFile)
        process_video: If true, enqueue processing task immediately
        frame_adjustments: JSON string with brightness/contrast/saturation/hue/blur
        verified_user_id: Authenticated user ID from JWT

    Returns:
        VideoUploadResponse with file_id and optional task_id

    Raises:
        HTTPException: If upload or task dispatch fails
    """
    import io
    import json

    request_id = str(uuid.uuid4())[:8]

    try:
        # Read file stream into BytesIO buffer
        file_content = await file.read()
        file_buffer = io.BytesIO(file_content)

        # Store in GridFS uploads bucket
        try:
            file_id = await upload_to_gridfs(
                file_buffer,
                file.filename or "untitled.mp4",
                metadata={
                    "user_id": verified_user_id,
                    "original_filename": file.filename,
                    "request_id": request_id,
                    "size_bytes": len(file_content),
                },
                bucket="uploads",
            )
        except Exception as e:
            logger.error(
                "GridFS upload failed for user %s, request %s: %s",
                verified_user_id,
                request_id,
                e,
            )
            raise HTTPException(
                status_code=500,
                detail=f"File upload failed: {str(e)[:100]}",
            )

        task_id = None

        # Dispatch processing task if requested
        if process_video:
            try:
                adjustments = {}
                if frame_adjustments:
                    try:
                        adjustments = json.loads(frame_adjustments)
                    except json.JSONDecodeError:
                        logger.warning("Invalid frame_adjustments JSON: %s", frame_adjustments)

                # Validate adjustment values
                frame_adj = FrameAdjustment(**adjustments) if adjustments else FrameAdjustment()
                adjustment_dict = frame_adj.model_dump()

                # Dispatch async task (non-blocking)
                task = process_video_render_task.delay(
                    file_id,
                    frame_adjustments=adjustment_dict,
                )
                task_id = task.id

                logger.info(
                    "Video processing task enqueued: file_id=%s, task_id=%s, user=%s",
                    file_id,
                    task_id,
                    verified_user_id,
                )

            except ValueError as e:
                logger.warning("Invalid frame adjustments: %s", e)
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid frame adjustments: {str(e)}",
                )
            except Exception as e:
                logger.error(
                    "Failed to enqueue processing task: %s",
                    e,
                    exc_info=True,
                )
                raise HTTPException(
                    status_code=500,
                    detail=f"Task dispatch failed: {str(e)[:100]}",
                )

        return VideoUploadResponse(
            request_id=request_id,
            file_id=file_id,
            filename=file.filename or "untitled.mp4",
            task_id=task_id,
            message="Video uploaded successfully" + (
                f"; processing task {task_id} enqueued" if task_id else ""
            ),
        )

    except HTTPException:
        raise

    except Exception as e:
        logger.error(
            "Unexpected error in upload_video: user=%s, request=%s, error=%s",
            verified_user_id,
            request_id,
            e,
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail="Video upload failed",
        )


@router.get("/task/{task_id}", response_model=dict)
async def get_task_status(
    task_id: str,
    verified_user_id: str = Depends(get_verified_user_id),
) -> dict:
    """Get status of a video processing task.

    Args:
        task_id: Celery task ID
        verified_user_id: Authenticated user ID

    Returns:
        dict with task state, result, or error

    Raises:
        HTTPException: If task not found
    """
    try:
        task = process_video_render_task.AsyncResult(task_id)

        if task.state == "PENDING":
            return {
                "task_id": task_id,
                "state": "pending",
                "status": "Task not found or still queued",
            }

        elif task.state == "PROGRESS":
            return {
                "task_id": task_id,
                "state": "processing",
                "current": task.info.get("current"),
                "total": task.info.get("total"),
            }

        elif task.state == "SUCCESS":
            return {
                "task_id": task_id,
                "state": "success",
                "result": task.result,
            }

        elif task.state == "FAILURE":
            return {
                "task_id": task_id,
                "state": "failed",
                "error": str(task.info),
            }

        else:
            return {
                "task_id": task_id,
                "state": task.state.lower(),
            }

    except Exception as e:
        logger.error("Failed to retrieve task status: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve task status: {str(e)[:100]}",
        )
