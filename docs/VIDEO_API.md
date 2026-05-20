# Video Ingestion API Documentation

## Overview

The Video Ingestion API (`/api/v1/video/*`) provides asynchronous video upload and processing with optional frame filter application via FFmpeg.

**Architecture:**
- File streaming to MongoDB GridFS (no local disk)
- Celery background task processing
- Real-time task status polling
- JWT authentication required

---

## Endpoints

### 1. POST `/api/v1/video/upload`

**Upload a video file and optionally enqueue processing.**

#### Request

```http
POST /api/v1/video/upload HTTP/1.1
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data

file=@video.mp4
process_video=false
frame_adjustments={"brightness": 1.2, "contrast": 1.1, "saturation": 1.0, "hue": 0, "blur": 0}
```

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `process_video` | bool | `false` | If `true`, enqueue Celery task for frame filter processing |
| `frame_adjustments` | string | `null` | JSON string with filter values; ignored if `process_video=false` |

#### Frame Adjustments Schema

```json
{
  "brightness": 1.0,    // Range: 0.5–2.0 (1.0 = no change)
  "contrast": 1.0,      // Range: 0.5–2.0
  "saturation": 1.0,    // Range: 0.5–2.0
  "hue": 0.0,           // Range: -180 to 180 (degrees)
  "blur": 0.0           // Range: 0–50 (pixels)
}
```

#### Response (200 OK)

```json
{
  "request_id": "a1b2c3d4",
  "file_id": "507f1f77bcf86cd799439011",
  "filename": "sample.mp4",
  "task_id": "d8c5f9a3-e2b4-4f1c-9e7a-1d5c3b2f8a9e",
  "message": "Video uploaded successfully; processing task d8c5... enqueued"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `request_id` | string | Unique upload request ID (8 hex chars) |
| `file_id` | string | MongoDB GridFS ObjectId |
| `filename` | string | Original uploaded filename |
| `task_id` | string \| null | Celery task ID if `process_video=true`; otherwise `null` |
| `message` | string | Human-readable status message |

#### Errors

| Status | Error | Reason |
|--------|-------|--------|
| 400 | `Invalid frame adjustments` | JSON parse error or validation failure |
| 401 | `Unauthorized` | Missing or invalid JWT token |
| 500 | `File upload failed` | GridFS storage error |
| 500 | `Task dispatch failed` | Celery broker unavailable |

#### Example: Upload without processing

```bash
curl -X POST "http://localhost:8000/api/v1/video/upload" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -F "file=@test.mp4"
```

#### Example: Upload with processing

```bash
curl -X POST "http://localhost:8000/api/v1/video/upload" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -F "file=@test.mp4" \
  -F "process_video=true" \
  -F 'frame_adjustments={"brightness": 1.3, "contrast": 1.2, "saturation": 1.0, "hue": 0, "blur": 0}'
```

---

### 2. GET `/api/v1/video/task/{task_id}`

**Poll the status of a video processing task.**

#### Request

```http
GET /api/v1/video/task/d8c5f9a3-e2b4-4f1c-9e7a-1d5c3b2f8a9e HTTP/1.1
Authorization: Bearer <JWT_TOKEN>
```

#### Response (200 OK) — Task Pending

```json
{
  "task_id": "d8c5f9a3-e2b4-4f1c-9e7a-1d5c3b2f8a9e",
  "state": "pending",
  "status": "Task not found or still queued"
}
```

#### Response (200 OK) — Task Processing

```json
{
  "task_id": "d8c5f9a3-e2b4-4f1c-9e7a-1d5c3b2f8a9e",
  "state": "processing",
  "current": 50,
  "total": 100
}
```

#### Response (200 OK) — Task Succeeded

```json
{
  "task_id": "d8c5f9a3-e2b4-4f1c-9e7a-1d5c3b2f8a9e",
  "state": "success",
  "result": {
    "status": "success",
    "input_file_id": "507f1f77bcf86cd799439011",
    "output_file_id": "507f1f77bcf86cd799439012",
    "duration": 45.2,
    "output_size": 5242880
  }
}
```

#### Response (200 OK) — Task Failed

```json
{
  "task_id": "d8c5f9a3-e2b4-4f1c-9e7a-1d5c3b2f8a9e",
  "state": "failed",
  "error": "FFmpeg error: Unknown codec 'h264'"
}
```

#### Response Status Codes

| State | Meaning |
|-------|---------|
| `pending` | Task queued but not yet started |
| `processing` | Task actively running |
| `success` | Task completed; result in `result` field |
| `failed` | Task failed; error in `error` field |

#### Errors

| Status | Error | Reason |
|--------|-------|--------|
| 401 | `Unauthorized` | Missing or invalid JWT token |
| 500 | `Failed to retrieve task status` | Redis/Celery backend unreachable |

#### Example: Poll task status

```bash
curl -X GET "http://localhost:8000/api/v1/video/task/d8c5f9a3-e2b4-4f1c-9e7a-1d5c3b2f8a9e" \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

---

## Authentication

All endpoints require a valid JWT token in the `Authorization: Bearer <TOKEN>` header.

**Token source:** NextAuth session or Firebase ID token (validated by `get_verified_user_id` dependency).

---

## Data Models (Pydantic)

### FrameAdjustment

```python
class FrameAdjustment(BaseModel):
    brightness: float = Field(default=1.0, ge=0.5, le=2.0)
    contrast: float = Field(default=1.0, ge=0.5, le=2.0)
    saturation: float = Field(default=1.0, ge=0.5, le=2.0)
    hue: float = Field(default=0.0, ge=-180.0, le=180.0)
    blur: float = Field(default=0.0, ge=0.0, le=50.0)
```

### VideoUploadResponse

```python
class VideoUploadResponse(BaseModel):
    request_id: str
    file_id: str
    filename: str
    task_id: Optional[str] = None
    message: str
```

### VideoProcessResponse

```python
class VideoProcessResponse(BaseModel):
    status: str  # "success" or "failed"
    input_file_id: str
    output_file_id: Optional[str] = None
    duration: float = 0.0
    output_size: int = 0
```

---

## Integration Flow

### Scenario 1: Upload Only (No Processing)

```
1. Client: POST /api/v1/video/upload (file, process_video=false)
2. Server: Stream file to GridFS uploads bucket
3. Server: Return 200 with file_id
4. Result: File stored in GridFS, ready for manual processing
```

### Scenario 2: Upload + Process

```
1. Client: POST /api/v1/video/upload (file, process_video=true, frame_adjustments=...)
2. Server: Stream file to GridFS uploads bucket
3. Server: Enqueue Celery task (process_video_render_task)
4. Server: Return 200 with file_id + task_id
5. Client: Poll GET /api/v1/video/task/{task_id} every 5s
6. Server: Return task state (pending → processing → success/failed)
7. Result: Processed video stored in GridFS exports bucket (on success)
```

---

## Rate Limiting & Quotas

- No explicit rate limit on video endpoints (inherited from global FastAPI limiter)
- File size: No hard limit enforced at API level (limited by proxy/load balancer)
- Task timeout: 1 hour (hard limit), 55 minutes (soft limit for graceful shutdown)

---

## Deployment Notes

### Local Development

```bash
# Terminal 1: FastAPI server
cd fastapi
uvicorn main:app --reload --port 8000

# Terminal 2: Celery worker
cd fastapi
celery -A workers.tasks worker --loglevel=info

# Terminal 3: Redis (if not using Redis Cloud)
redis-server
```

### Production (Cloud Run)

- FastAPI deployed as main service (no Celery integration in container)
- Celery worker deployed as separate Cloud Run service
- Redis Cloud backend (via `REDIS_URL` env var)
- MongoDB Atlas (via `MONGODB_URI` env var)

See `docs/DEPLOYMENT.md` for full setup.

---

## Monitoring & Debugging

### Task Monitoring

```bash
# Inspect active tasks
celery -A workers.tasks inspect active

# Inspect task statistics
celery -A workers.tasks inspect stats

# Monitor worker in real-time
celery -A workers.tasks events
```

### Logs

All operations are logged to:
- **FastAPI**: `root` logger → stderr → Cloud Logging (production)
- **Celery**: `workers.tasks` logger → stdout → Cloud Logging (production)

Search logs by:
- `request_id`: Unique 8-hex identifier for upload tracking
- `task_id`: Celery task UUID for processing tracking
- `user_id`: User context for all operations

---

## Examples

See `tests/test_video_api.py` for complete integration test suite.
