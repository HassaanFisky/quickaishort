FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080

# System deps: ffmpeg (render), Node.js 20.x (bgutil PoToken sidecar),
# git + curl for build tooling. libgl1/libglib2.0 for OpenCV.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    ca-certificates \
    curl \
    git \
    libgl1 \
    libglib2.0-0 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install bgutil-ytdlp-pot-provider Node.js sidecar (PoToken generator).
# Tag 1.3.1 verified stable as of 2026. Sidecar runs on port 4416 at runtime.
# This bypasses YouTube's PoToken enforcement on server IPs.
RUN git clone --depth 1 --branch 1.3.1 \
    https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /bgutil && \
    cd /bgutil/server && npm ci && npx tsc

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Smoke-test imports (bgutil sidecar not needed at build time)
RUN AUTH_DISABLED=true NEXTAUTH_SECRET=build-check python -c "import main; print('BUILD IMPORT CHECK: PASS')" || exit 1

COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE $PORT

HEALTHCHECK --interval=30s --timeout=15s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# start.sh boots bgutil sidecar then gunicorn (see start.sh)
CMD ["/start.sh"]
