import multiprocessing
import os

# Gunicorn configuration for production FastAPI on GCP/Cloud Run
bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"
workers = int(os.getenv("WEB_CONCURRENCY", multiprocessing.cpu_count() * 2 + 1))
worker_class = "uvicorn.workers.UvicornWorker"

# Increase timeout for long-running I/O operations (like yt-dlp metadata extraction)
timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))
keepalive = 5

# Logging
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info")

# Performance tweaks
max_requests = 1000
max_requests_jitter = 50
