# Integration Test Setup & Execution

## Overview

This guide walks through starting the local FastAPI server, Celery worker, and running the integration test suite end-to-end.

**Time estimate**: 5–10 minutes

---

## Prerequisites

### 1. Install Dependencies

Ensure Python 3.12+ and FastAPI dependencies are installed:

```bash
cd fastapi
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Environment Setup

Create a `.env` file in the `fastapi/` directory with test values:

```bash
cat > fastapi/.env << 'EOF'
# Development/Testing Configuration
AUTH_DISABLED=true
NEXTAUTH_SECRET=test-secret-for-local-dev-only-12345

# MongoDB (local or Atlas test instance)
MONGODB_URI=mongodb+srv://localhost:27017/quickaishort_test
MONGODB_DB=quickaishort_test

# Redis (local or Redis Cloud)
REDIS_URL=redis://localhost:6379/0

# Gemini API (optional for this test)
GEMINI_API_KEY=test-key-only

# Other optional vars
GOOGLE_CLOUD_PROJECT=quickaishort-agent
PUBLIC_API_URL=http://localhost:8000
EXPORT_SIGNING_SECRET=test-export-secret

# Disable services not needed for video test
SENTRY_DSN=
EOF
```

### 3. Check Redis Availability

**Option A: Local Redis (recommended for testing)**
```bash
# macOS (with Homebrew)
brew services start redis

# Linux (Ubuntu/Debian)
sudo systemctl start redis-server

# Windows (WSL2 or Docker)
docker run -d --name redis -p 6379:6379 redis:latest

# Verify connection
redis-cli ping  # Should return PONG
```

**Option B: Redis Cloud (if local Redis unavailable)**
- Use `REDIS_URL=redis://:<password>@<host>:<port>` from Redis Cloud console

### 4. Check MongoDB Availability

For testing, you can use:
- **Local MongoDB**: `mongodb://localhost:27017/`
- **MongoDB Atlas**: Use connection string from `MONGODB_URI` in `.env`

For this test, we'll use a local/test MongoDB instance.

---

## Startup Sequence

### Terminal 1: Start FastAPI Server

```bash
cd fastapi
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Start with auto-reload for development
uvicorn main:app --reload --port 8000 --log-level info
```

**Expected output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete
```

**Health check:**
```bash
curl http://localhost:8000/health
# Should return: {"status":"ok","mongo":true,"redis":true,"adk":false}
```

---

### Terminal 2: Start Celery Worker

```bash
cd fastapi
source venv/bin/activate

# Start Celery worker with verbose logging
celery -A workers.tasks worker --loglevel=info --concurrency=1
```

**Expected output:**
```
 ---------- celery@<hostname> v5.4.0 (opalescent)
 --- ***** -----
 -- ******* -----
 - *** --- * ----
  - ** ---------- [config]
  - ** ---------- broker:   redis://localhost:6379/0
  - ** ---------- app:      workers.tasks:0x...
  - ** ---------- autoscale: None
  celery@<hostname> ready.
```

**Verify worker is ready:**
```bash
# In another terminal
celery -A workers.tasks inspect active
# Should show: {'celery@<hostname>': {...}}
```

---

### Terminal 3: Run Integration Tests

```bash
cd fastapi

# Install test dependencies (if not already installed)
pip install httpx

# Run the test suite
python tests/test_video_api.py \
  --token "test-jwt-token-dev-only" \
  --url "http://localhost:8000"
```

**Or use the bash test script:**
```bash
bash tests/test_video_api_curl.sh "test-jwt-token-dev-only" "http://localhost:8000"
```

---

## What to Expect

### Test Execution Flow

```
1. Create 2MB test video file (dummy binary data)
2. Test 1: Upload without processing
   → Streams file to GridFS uploads bucket
   → Returns file_id
3. Test 2: Upload with frame adjustments
   → Streams file to GridFS uploads bucket
   → Enqueues Celery task
   → Returns file_id + task_id
4. Test 3: Check task status (immediate)
   → Task likely in "pending" or "processing" state
5. Test 4: Poll task until completion
   → Celery worker applies FFmpeg filters
   → Streams processed video to GridFS exports bucket
   → Task state transitions: pending → processing → success
6. Test 5: Validate frame adjustment constraints
   → Test with out-of-range values
   → Verify 400 error response
7. Test 6: Verify authentication
   → Test without Authorization header
   → Verify 401 error response
```

### Expected Output (Python Test Suite)

```
======================================================================
  VIDEO API INTEGRATION TEST SUITE
======================================================================

Base URL: http://localhost:8000
JWT Token: test-jwt-token-de...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test 1: Upload Without Processing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Response Status: 200
Response Body:
{
  "request_id": "a1b2c3d4",
  "file_id": "507f1f77bcf86cd799439011",
  "filename": "test_video.mp4",
  "task_id": null,
  "message": "Video uploaded successfully"
}

✓ Upload successful
  request_id: a1b2c3d4
  file_id:    507f1f77bcf86cd799439011
  filename:   test_video.mp4

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test 2: Upload With Frame Adjustments
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Upload with processing successful
  file_id:   507f1f77bcf86cd799439012
  task_id:   d8c5f9a3-e2b4-4f1c-9e7a-1d5c3b2f8a9e
  message:   Video uploaded successfully; processing task enqueued

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test 3: Task Status (Immediate Check)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Task status retrieved
  task_id: d8c5f9a3-e2b4-4f1c-9e7a-1d5c3b2f8a9e
  state:   pending

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test 4: Task Polling (max 60s)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Poll #1 (elapsed: 0s)
  state: pending
  waiting 2s...

Poll #2 (elapsed: 2s)
  state: processing
  waiting 2s...

Poll #3 (elapsed: 4s)
  state: success

✓ Task completed successfully!

Final Result:
{
  "status": "success",
  "input_file_id": "507f1f77bcf86cd799439012",
  "output_file_id": "507f1f77bcf86cd799439013",
  "duration": 0.0,
  "output_size": 2097152
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test 5: Invalid Frame Adjustments (Validation)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Validation correctly rejected invalid adjustments
  Status: 400
  Error: Invalid frame adjustments: ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test 6: Authentication (Missing Token)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Authentication correctly enforced
  Status: 401

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✓ PASS       upload_without_processing
  ✓ PASS       upload_with_processing
  ✓ PASS       task_status_immediate
  ✓ PASS       task_polling
  ✓ PASS       validation
  ✓ PASS       authentication

Total: 6/6 tests passed
======================================================================
```

---

## Troubleshooting

### FastAPI Server Won't Start

**Error**: `ModuleNotFoundError: No module named 'fastapi'`
- **Fix**: Ensure venv is activated and `pip install -r requirements.txt` was run

**Error**: `Address already in use: ('127.0.0.1', 8000)`
- **Fix**: Kill the existing process: `lsof -ti:8000 | xargs kill -9` (macOS/Linux) or `netstat -ano | findstr :8000` (Windows)

**Error**: `NEXTAUTH_SECRET not set but AUTH_DISABLED is false`
- **Fix**: Ensure `AUTH_DISABLED=true` is set in `.env` for local testing

### Celery Worker Won't Start

**Error**: `Cannot connect to redis://...`
- **Fix**: Ensure Redis is running (`redis-cli ping` should return PONG)

**Error**: `Connection refused`
- **Fix**: Check `REDIS_URL` in `.env` matches your Redis instance

### Tests Fail with "Unauthorized"

**Error**: `401 Unauthorized`
- **Fix**: Ensure `AUTH_DISABLED=true` in `.env`; any token string will work with this mode

**Error**: `403 Forbidden`
- **Fix**: Ensure `X-User-Id` header is set (test suite does this via `get_verified_user_id`)

### Tests Fail with GridFS Error

**Error**: `GridFS bucket not initialized`
- **Fix**: Ensure MongoDB is running and `MONGODB_URI` is correct in `.env`

**Error**: `Failed to upload: ...`
- **Fix**: Check MongoDB connection: `mongosh` or MongoDB Compass

### Task Polling Timeout

**Error**: Task stuck in "processing" state for >60s
- **Cause**: Celery worker not running or FFmpeg not installed
- **Fix**: 
  1. Check Terminal 2 (Celery worker) is running and has `celery@<hostname> ready` message
  2. Verify FFmpeg is installed: `ffmpeg -version`
  3. Check Celery worker logs for FFmpeg errors

---

## Cleanup

After testing, you can:

```bash
# Stop FastAPI (Ctrl+C in Terminal 1)
# Stop Celery worker (Ctrl+C in Terminal 2)

# Clean up test files
rm -f fastapi/test_video*.mp4

# Stop Redis (if local)
redis-cli shutdown

# Deactivate venv
deactivate
```

---

## Next Steps After Successful Tests

✅ **Integration tests passed?** Now you can:

1. **Deploy to Cloud Run**
   - Build Docker image with Celery worker
   - Push to Google Cloud Registry
   - Deploy as service

2. **Integrate with Frontend**
   - Build React upload component
   - Wire `/api/v1/video/upload` endpoint
   - Implement task polling UI

3. **Add Monitoring**
   - Set up Prometheus metrics for Celery
   - Create Grafana dashboard
   - Add Sentry error tracking

4. **Load Testing**
   - Use `locust` or `k6` to simulate concurrent uploads
   - Benchmark GridFS streaming performance
   - Optimize FFmpeg settings for production

See `docs/DEPLOYMENT.md` for production deployment details.
