# Observability & Monitoring

Comprehensive telemetry, metrics tracking, and error reporting for the QuickAI Short video processing pipeline.

## Overview

The system includes three integrated observability components:

1. **Prometheus Metrics** — Real-time performance and throughput tracking
2. **Sentry Error Tracking** — Deep error classification and alerting for FFmpeg failures
3. **Structured Logging** — Event logs via Python logging module

---

## Prometheus Metrics

### Endpoint

```bash
curl https://quickaishort-api-xxx.run.app/metrics
```

### Video Processing Metrics

#### `video_processing_duration_seconds` (Histogram)

Processing time for each video, labeled by filter type and status.

**Labels:**
- `filter_type`: `brightness`, `contrast`, `saturation`, `hue`, `blur`, `composite`, `none`
- `status`: `success`, `failure`

**Example usage (Grafana):**
```promql
rate(video_processing_duration_seconds_sum[5m]) / rate(video_processing_duration_seconds_count[5m])
```

#### `video_processing_output_bytes` (Histogram)

Output video file size distribution for successful processing.

**Labels:**
- `filter_type`: Same as above

**Example usage:**
```promql
histogram_quantile(0.99, rate(video_processing_output_bytes_bucket[5m]))
```

### Celery Task Metrics

#### `celery_task_duration_seconds` (Histogram)

Time spent executing each Celery task.

**Labels:**
- `task_name`: `process_video_render_task`, etc.
- `status`: `success`, `failure`, `timeout`

**Example usage:**
```promql
rate(celery_task_duration_seconds_sum{status="success"}[5m]) / 
  rate(celery_task_duration_seconds_count{status="success"}[5m])
```

#### `celery_task_total` (Counter)

Total tasks executed, by name and status.

**Labels:**
- `task_name`, `status`

**Example usage:**
```promql
rate(celery_task_total[5m])
```

### FFmpeg Error Metrics

#### `ffmpeg_errors_total` (Counter)

Total FFmpeg processing errors, classified by type.

**Labels:**
- `error_type`: Classified error (see below)
- `filter_type`: Filter that was being applied

**Error types:**
- `codec_h264`, `codec_vp9`, `codec_aac`, `codec_opus` — Codec errors
- `filter_blur`, `filter_hue`, `filter_brightness` — Filter errors
- `invalid_input` — Invalid or corrupted input file
- `file_not_found` — Input file missing
- `permission_denied` — File permission issue
- `out_of_memory` — Memory exhausted
- `resource_exhausted` — Too many open files
- `stream_error` — Stream or format error
- `timeout` — Timeout or truncated stream
- `unknown` — Unclassified error

**Example usage:**
```promql
rate(ffmpeg_errors_total{error_type="codec_h264"}[5m])
```

---

## Sentry Error Tracking

### Configuration

**Environment variable:** `SENTRY_DSN`

```bash
# Cloud Run
gcloud run services update quickaishort-api \
  --update-env-vars SENTRY_DSN="https://xxx@sentry.io/yyy"
```

**Features enabled:**
- FastAPI integration (API errors)
- Celery integration (worker errors)
- Performance monitoring (traces sampled at 10%)
- Error profiling (profiles sampled at 10%)

### FFmpeg Error Classification

The observability module automatically classifies FFmpeg errors into meaningful categories:

```python
from services.observability import classify_ffmpeg_error

error_type, description = classify_ffmpeg_error(ffmpeg_stderr)
# Returns: ("codec_h264", "H.264 codec error")
```

### Capturing Errors

Errors are automatically captured in two places:

**1. In worker tasks** — When FFmpeg fails:
```python
from services.observability import capture_ffmpeg_error

capture_ffmpeg_error(
    stderr=ffmpeg_error_output,
    input_file_id="507f1f77bcf86cd799439011",
    filter_type="brightness",
    extra_context={
        "frame_adjustments": {"brightness": 1.5},
    },
)
```

**2. In Sentry dashboard** — Grouped by error type:

- Error: `Codec H.264 error`
- Context: `{"ffmpeg": {"stderr": "...", "input_file_id": "...", "filter_type": "..."}}`
- Tags: `error_type: codec_h264`, `filter_type: brightness`

### Alerting

Set up Sentry alerts for critical errors:

1. **High FFmpeg failure rate:**
   ```
   Error > 50 in last 5 minutes AND error_type matches "codec_|out_of_memory|resource_exhausted"
   ```

2. **Unknown errors (catch-all):**
   ```
   Error > 10 in last 5 minutes AND error_type == "unknown"
   ```

3. **Timeout errors:**
   ```
   Error > 5 in last 5 minutes AND error_type == "timeout"
   ```

---

## Grafana Dashboard Setup

### Create dashboard panels

**1. Video Processing Success Rate**
```promql
rate(video_processing_duration_seconds_count{status="success"}[5m]) / 
  (rate(video_processing_duration_seconds_count[5m]) + 0.001)
```

**2. Average Processing Time by Filter Type**
```promql
rate(video_processing_duration_seconds_sum[5m]) / 
  rate(video_processing_duration_seconds_count[5m])
```

**3. FFmpeg Error Rate by Type**
```promql
topk(5, rate(ffmpeg_errors_total[5m]))
```

**4. Celery Task Queue Depth**
```promql
celery_queue_depth
```

**5. Active Worker Tasks**
```promql
celery_worker_tasks_active
```

---

## Local Development Monitoring

### View metrics locally

```bash
# Terminal 1: Start FastAPI
cd fastapi
python -m uvicorn main:app --reload --port 8000

# Terminal 2: Fetch metrics
curl -s http://localhost:8000/metrics | grep video_processing
```

### Prometheus local stack

```bash
# Start Prometheus with docker-compose
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
EOF

# prometheus.yml
cat > prometheus.yml << 'EOF'
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'fastapi'
    static_configs:
      - targets: ['localhost:8000']
EOF

docker-compose up
# Visit http://localhost:9090
```

---

## Logging

### Structured logging via Python's logging module

All background tasks log events:

```python
logger.info("Video render completed: output=%s, size=%d bytes", result_file_id, output_size)
logger.error("ffmpeg processing failed: %s", error_msg)
logger.warning("Task timeout for input_file_id=%s, retrying", input_file_id)
```

### View logs in Cloud Run

```bash
gcloud run logs read quickaishort-worker --region=us-central1 --limit=100
```

---

## Metrics Summary Table

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `video_processing_duration_seconds` | Histogram | filter_type, status | Processing latency |
| `video_processing_output_bytes` | Histogram | filter_type | Output file size |
| `ffmpeg_errors_total` | Counter | error_type, filter_type | Error tracking |
| `celery_task_duration_seconds` | Histogram | task_name, status | Task execution time |
| `celery_task_total` | Counter | task_name, status | Task execution count |
| `celery_queue_depth` | Gauge | queue_name | Queue backlog |
| `celery_worker_tasks_active` | Gauge | worker_name | Active tasks |

---

## Troubleshooting

### Metrics not appearing

1. Check that `prometheus-client` is installed:
   ```bash
   pip list | grep prometheus
   ```

2. Check that `/metrics` endpoint is accessible:
   ```bash
   curl http://localhost:8000/metrics | head -20
   ```

3. Ensure observability module is imported in main.py

### Sentry not capturing errors

1. Verify `SENTRY_DSN` is set:
   ```bash
   gcloud run services describe quickaishort-api --format="value(spec.template.spec.containers[0].env[?name=='SENTRY_DSN'].value)"
   ```

2. Check Sentry dashboard for errors (they may be grouped)

3. Verify worker errors are being sent:
   ```bash
   gcloud run logs read quickaishort-worker --grep="capture_ffmpeg_error|Sentry"
   ```

---

## Performance Impact

- **Metrics overhead:** ~0.1-0.2ms per task (negligible)
- **Sentry overhead:** ~1-2ms per error (only on failure)
- **Logging overhead:** ~0.5-1ms per log statement

Total impact on 10-minute video processing: **< 0.1%**

