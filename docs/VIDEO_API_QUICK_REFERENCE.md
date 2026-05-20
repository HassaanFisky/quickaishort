# Video API — Quick Reference

## Endpoints

### Upload Video
```http
POST /api/v1/video/upload
Authorization: Bearer <JWT>
Content-Type: multipart/form-data

file=@video.mp4
process_video=false          # optional, default false
frame_adjustments={...}      # optional JSON string
```

**Response:** `VideoUploadResponse`
```json
{
  "request_id": "a1b2c3d4",
  "file_id": "507f1f77bcf86cd799439011",
  "filename": "video.mp4",
  "task_id": "abc-123-def-456",
  "message": "..."
}
```

### Check Task Status
```http
GET /api/v1/video/task/{task_id}
Authorization: Bearer <JWT>
```

**Response:** Task state + result (if complete)
```json
{
  "task_id": "abc-123-def-456",
  "state": "success|pending|processing|failed",
  "result": {...},    // on success
  "error": "..."      // on failure
}
```

---

## Frame Adjustments (JSON Format)

```json
{
  "brightness": 1.0,    // 0.5–2.0 (1.0 = unchanged)
  "contrast": 1.0,      // 0.5–2.0
  "saturation": 1.0,    // 0.5–2.0
  "hue": 0.0,           // -180–180 (degrees)
  "blur": 0.0           // 0–50 (pixels)
}
```

---

## Usage Examples

### 1. Upload Only (Store in GridFS)
```bash
curl -X POST "http://localhost:8000/api/v1/video/upload" \
  -H "Authorization: Bearer $JWT" \
  -F "file=@video.mp4"
```

### 2. Upload + Process (Enqueue Celery Task)
```bash
curl -X POST "http://localhost:8000/api/v1/video/upload" \
  -H "Authorization: Bearer $JWT" \
  -F "file=@video.mp4" \
  -F "process_video=true" \
  -F 'frame_adjustments={"brightness": 1.3, "contrast": 1.2}'
```

### 3. Check Task Status
```bash
curl -X GET "http://localhost:8000/api/v1/video/task/abc-123-def-456" \
  -H "Authorization: Bearer $JWT"
```

### 4. Python Client (Sync)
```python
import httpx
import json

client = httpx.Client(
    headers={"Authorization": f"Bearer {JWT_TOKEN}"}
)

# Upload + process
with open("video.mp4", "rb") as f:
    response = client.post(
        "http://localhost:8000/api/v1/video/upload",
        files={
            "file": f,
            "process_video": (None, "true"),
            "frame_adjustments": (None, json.dumps({
                "brightness": 1.2,
                "contrast": 1.1,
            })),
        },
    )

result = response.json()
task_id = result["task_id"]

# Poll for completion
import time
while True:
    status = client.get(f"http://localhost:8000/api/v1/video/task/{task_id}").json()
    if status["state"] == "success":
        print("Done! Output file:", status["result"]["output_file_id"])
        break
    elif status["state"] == "failed":
        print("Failed:", status["error"])
        break
    time.sleep(2)
```

### 5. Python Client (Async)
```python
import asyncio
import httpx
import json

async def main():
    async with httpx.AsyncClient(
        headers={"Authorization": f"Bearer {JWT_TOKEN}"}
    ) as client:
        # Upload + process
        with open("video.mp4", "rb") as f:
            response = await client.post(
                "http://localhost:8000/api/v1/video/upload",
                files={
                    "file": f,
                    "process_video": (None, "true"),
                    "frame_adjustments": (None, json.dumps({
                        "brightness": 1.2,
                    })),
                },
            )
        
        result = response.json()
        task_id = result["task_id"]
        
        # Poll
        while True:
            status = (await client.get(
                f"http://localhost:8000/api/v1/video/task/{task_id}"
            )).json()
            
            if status["state"] in ["success", "failed"]:
                return status
            
            await asyncio.sleep(2)

asyncio.run(main())
```

---

## Integration Test Scripts

### Run Full Test Suite (Bash)
```bash
bash tests/test_video_api_curl.sh "$JWT_TOKEN" "http://localhost:8000"
```

### Run Full Test Suite (Python)
```bash
python tests/test_video_api.py \
  --token "$JWT_TOKEN" \
  --url "http://localhost:8000"
```

---

## Status Codes

| Code | Scenario |
|------|----------|
| 200 | Success (upload or task status) |
| 400 | Invalid frame adjustments |
| 401 | Missing/invalid JWT token |
| 500 | Server error (GridFS, Celery, FFmpeg) |

---

## Flow Diagram

```
User                    FastAPI Server          GridFS             Celery Worker
 │                           │                    │                      │
 ├─ POST /upload ────────────>│                    │                      │
 │   (file + adjustments)     │                    │                      │
 │                           ├─ store file ──────>│                      │
 │                           │   (uploads)        │                      │
 │                           ├─ dispatch task ──────────────────────────>│
 │                           │                    │                      │
 │<──── 200 OK ───────────────┤                    │                      │
 │  (file_id + task_id)       │                    │                      │
 │                           │                    │   apply filters    │
 │                           │                    │   + FFmpeg         │
 │                           │                    │                    │
 ├─ GET /task/{id} ─────────>│                    │<─ store output ────┤
 │   (poll)                  │                    │   (exports)        │
 │                           │ (check Celery)     │                    │
 │<──── 200 OK ───────────────┤<─ result ─────────┤                    │
 │   (state + result)        │                    │                    │
```

---

## Error Handling

### Upload fails (500 error)
- **Cause**: GridFS bucket not initialized, storage backend down
- **Action**: Check MongoDB connection, verify `init_storage()` called in main.py startup

### Task dispatch fails (500 error)
- **Cause**: Redis/Celery broker unavailable, invalid adjustments JSON
- **Action**: Check `REDIS_URL` env var, validate JSON in request

### Task fails during processing (state="failed")
- **Cause**: FFmpeg error (codec mismatch, corrupt input, insufficient disk space)
- **Action**: Check Celery worker logs, verify input video format

### Authentication fails (401)
- **Cause**: Missing Authorization header or invalid JWT
- **Action**: Ensure JWT token is valid, passed in Authorization: Bearer header

---

## Performance Notes

- **Upload latency**: 100ms–5s (depends on file size, network, storage backend)
- **Processing latency**: 10s–5min (depends on video duration, filter complexity, worker load)
- **Task timeout**: 1 hour hard limit, 55 minutes soft limit for graceful shutdown
- **File size limit**: No API limit; limited by proxy/load balancer (typically 100MB–1GB)

---

## See Also

- Full API documentation: `docs/VIDEO_API.md`
- Deployment guide: `docs/DEPLOYMENT.md`
- Architecture: `CLAUDE.md` (section: Backend Architecture)
