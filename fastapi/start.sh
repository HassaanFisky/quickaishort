#!/bin/bash
set -e

echo "[$(date -u)] Starting bgutil PoToken server on port 4416..."
cd /bgutil/server
node dist/server.js &
BGUTIL_PID=$!

echo "[$(date -u)] Waiting 6s for bgutil to initialize..."
sleep 6

if ! kill -0 $BGUTIL_PID 2>/dev/null; then
  echo "[$(date -u)] WARNING: bgutil failed to start. Proceeding without PoToken support."
  # Decodo residential proxy may allow extraction without PoToken for many videos
fi

echo "[$(date -u)] Starting gunicorn (bgutil PID=$BGUTIL_PID)..."
cd /app
exec gunicorn -c gunicorn_conf.py main:app
