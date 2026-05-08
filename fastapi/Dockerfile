FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

# System deps: ffmpeg for render pipeline, Node.js for potential helper scripts
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    ca-certificates \
    curl \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Smoke-test imports
RUN AUTH_DISABLED=true NEXTAUTH_SECRET=build-check python -c "import main; print('BUILD IMPORT CHECK: PASS')" || exit 1

EXPOSE $PORT

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Start with Gunicorn for production concurrency
CMD gunicorn -c gunicorn_conf.py main:app
