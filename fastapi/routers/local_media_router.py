"""FastAPI router for local media upload, preview streaming, and render job endpoints.

Provides zero-daemon media endpoints:
- POST /api/local-media/upload: Upload local video/audio directly to LocalGCSBucket, probe & detect silence.
- PUT  /api/local-media/put/{remote_path:path}: Local presigned PUT upload receiver.
- GET  /api/local-media/{bucket_prefix}/{filename:path}: Stream media with HTTP Range support.
- POST /api/local-media/render: Dispatch a render job to the local in-process pipeline.
- GET  /api/local-media/render/status/{job_id}: Poll render job progress.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Dict
from uuid import uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from services.auth import get_verified_user_id
from services.local_media_pipeline import get_local_media_pipeline
from services.local_persistence import (
    STUDIO_STORAGE_DIR,
    get_local_bucket,
    get_local_db,
)

router = APIRouter(prefix="/api/local-media", tags=["Local Media Pipeline"])


class LocalRenderRequest(BaseModel):
    video_id: str = Field(..., min_length=1)
    start_sec: float = Field(default=0.0, ge=0.0)
    end_sec: float = Field(default=60.0, ge=0.0)
    options: Dict[str, Any] = Field(default_factory=dict)


@router.post("/upload")
async def upload_local_media(
    file: UploadFile = File(...),
    user_id: str = Depends(get_verified_user_id),
):
    """Upload media file into the local studio storage (uploads directory), probe it, and detect silence."""
    clean_filename = Path(file.filename or f"upload_{uuid4().hex[:8]}.mp4").name
    dest_path = STUDIO_STORAGE_DIR / "uploads" / user_id / clean_filename
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    dest_path.write_bytes(content)

    pipeline = get_local_media_pipeline()
    try:
        probe = await asyncio.to_thread(pipeline.probe_media, dest_path)
    except Exception as exc:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=422, detail=f"Invalid or unreadable media file: {exc}"
        ) from exc

    silences = await asyncio.to_thread(pipeline.detect_silence, dest_path)

    video_ref = f"{user_id}/{clean_filename}"
    return {
        "status": "success",
        "video_id": video_ref,
        "media_url": f"/api/local-media/uploads/{video_ref}",
        "probe": probe.to_dict(),
        "silences": [{"start": s, "end": e} for s, e in silences],
        "uploaded_by": user_id,
    }


@router.put("/put/{remote_path:path}")
async def put_local_presigned_blob(
    remote_path: str,
    request: Request,
    user_id: str = Depends(get_verified_user_id),
):
    """Accept direct PUT upload for local-first presigned upload URLs.

    SEC-05: Authenticated via get_verified_user_id. Enforces tenant scoping
    for uploads/<owner_user_id>/... paths to prevent cross-tenant overwrites.
    """
    try:
        blob = get_local_bucket().blob(remote_path)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    # Enforce tenant isolation if the path is in uploads/<tenant_user_id>/...
    clean_parts = Path(remote_path.lstrip("/\\")).parts
    if len(clean_parts) >= 2 and clean_parts[0] == "uploads":
        path_owner = clean_parts[1]
        if path_owner != user_id and user_id != "local_studio_user":
            raise HTTPException(
                status_code=403,
                detail="Forbidden: Cannot write to another tenant's upload path",
            )

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty upload body")
    await asyncio.to_thread(blob.upload_from_string, body)
    return Response(status_code=200)


@router.post("/render")
async def dispatch_local_render(
    body: LocalRenderRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_verified_user_id),
):
    """Dispatch a render job locally in the background without Cloud Tasks or external RQ."""
    job_id = f"local_render_{uuid4().hex[:12]}"
    pipeline = get_local_media_pipeline()

    # Pre-record QUEUED state
    db = get_local_db()
    db.collection("render_jobs").document(job_id).set(
        {
            "job_id": job_id,
            "video_id": body.video_id,
            "user_id": user_id,
            "status": "queued",
            "progress": 0,
            "start_sec": body.start_sec,
            "end_sec": body.end_sec,
        }
    )

    # Execute asynchronously in background
    background_tasks.add_task(
        pipeline.execute_render_job,
        job_id=job_id,
        video_id=body.video_id,
        start_sec=body.start_sec,
        end_sec=body.end_sec,
        options=body.options,
        user_id=user_id,
    )

    return {
        "status": "queued",
        "job_id": job_id,
        "poll_url": f"/api/local-media/render/status/{job_id}",
    }


@router.get("/render/status/{job_id}")
async def get_local_render_status(
    job_id: str,
    user_id: str = Depends(get_verified_user_id),
):
    """Poll render status from LocalSQLiteDB.

    SEC-07: Enforces strict tenant ownership check against authenticated user_id.
    """
    db = get_local_db()
    doc = db.collection("render_jobs").document(job_id).get()
    if not doc.exists or not doc.to_dict():
        raise HTTPException(status_code=404, detail="Render job not found")

    job_data = doc.to_dict()
    job_owner = job_data.get("user_id")
    if job_owner != user_id:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Render job does not belong to authenticated user",
        )

    return job_data


@router.get("/{bucket_prefix}/{filename:path}")
async def stream_local_media(
    bucket_prefix: str,
    filename: str,
    request: Request,
):
    """Stream media file with Range header support for video players."""
    _ = request
    clean_prefix = Path(bucket_prefix).name
    if ".." in Path(filename).parts or ".." in Path(bucket_prefix).parts:
        raise HTTPException(status_code=403, detail="Forbidden access")

    full_path = (STUDIO_STORAGE_DIR / clean_prefix / filename.lstrip("/\\")).resolve()
    if STUDIO_STORAGE_DIR.resolve() not in full_path.parents:
        raise HTTPException(status_code=403, detail="Forbidden access")

    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="Media file not found")

    clean_name = full_path.name
    media_type = "video/mp4"
    if clean_name.endswith(".srt"):
        media_type = "text/plain"
    elif clean_name.endswith(".vtt"):
        media_type = "text/vtt"
    elif clean_name.endswith(".mp3"):
        media_type = "audio/mpeg"

    return FileResponse(
        path=full_path,
        media_type=media_type,
        filename=clean_name,
    )
