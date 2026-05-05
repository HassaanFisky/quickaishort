FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

# System deps: ffmpeg for render pipeline, Node.js for Supabase MCP npx call
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    nodejs \
    npm \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Lower TLS security level so Python's ssl can reach MongoDB Atlas M0 cipher suites
RUN printf '%s\n' \
    'openssl_conf = default_conf' \
    '' \
    '[default_conf]' \
    'ssl_conf = ssl_sect' \
    '' \
    '[ssl_sect]' \
    'system_default = system_default_sect' \
    '' \
    '[system_default_sect]' \
    'MinProtocol = TLSv1.2' \
    'CipherString = DEFAULT@SECLEVEL=1' \
    > /etc/ssl/openssl_custom.cnf

ENV OPENSSL_CONF=/etc/ssl/openssl_custom.cnf

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Smoke-test imports at build time so a broken dependency fails the build,
# not the first production request.
RUN AUTH_DISABLED=true NEXTAUTH_SECRET=build-check python -c "\
import sys; \
import main; \
print('BUILD IMPORT CHECK: PASS')" || (echo 'BUILD IMPORT CHECK: FAIL — see above' && exit 1)

EXPOSE $PORT

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
