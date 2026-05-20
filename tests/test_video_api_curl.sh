#!/bin/bash
# Integration tests for Video API endpoints
# Usage: bash test_video_api_curl.sh <JWT_TOKEN> [BASE_URL]

set -e

JWT_TOKEN="${1:-}"
BASE_URL="${2:-http://localhost:8000}"

if [ -z "$JWT_TOKEN" ]; then
  echo "Error: JWT token required"
  echo "Usage: $0 <JWT_TOKEN> [BASE_URL]"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Video API Integration Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Base URL: $BASE_URL"
echo "JWT Token: ${JWT_TOKEN:0:20}..."
echo ""

# Create a test video (5MB dummy file)
TEST_VIDEO="test_video_5mb.mp4"
if [ ! -f "$TEST_VIDEO" ]; then
  echo "[1/5] Creating test video file (5MB)..."
  dd if=/dev/zero bs=1M count=5 of="$TEST_VIDEO" 2>/dev/null
  echo "✓ Test video created: $TEST_VIDEO"
else
  echo "[1/5] Test video already exists: $TEST_VIDEO"
fi
echo ""

# Test 1: Upload without processing
echo "[2/5] Test: Upload video without processing..."
UPLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/video/upload" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@$TEST_VIDEO")

echo "Response:"
echo "$UPLOAD_RESPONSE" | jq '.' 2>/dev/null || echo "$UPLOAD_RESPONSE"
echo ""

FILE_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.file_id' 2>/dev/null)
if [ -z "$FILE_ID" ] || [ "$FILE_ID" == "null" ]; then
  echo "✗ Upload failed: Could not extract file_id"
  exit 1
fi
echo "✓ File uploaded successfully"
echo "  file_id: $FILE_ID"
echo ""

# Test 2: Upload with processing
echo "[3/5] Test: Upload video with frame adjustments..."
FRAME_ADJUSTMENTS='{"brightness": 1.3, "contrast": 1.2, "saturation": 1.0, "hue": 0, "blur": 0}'
UPLOAD_PROCESS_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/video/upload" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@$TEST_VIDEO" \
  -F "process_video=true" \
  -F "frame_adjustments=$FRAME_ADJUSTMENTS")

echo "Response:"
echo "$UPLOAD_PROCESS_RESPONSE" | jq '.' 2>/dev/null || echo "$UPLOAD_PROCESS_RESPONSE"
echo ""

TASK_ID=$(echo "$UPLOAD_PROCESS_RESPONSE" | jq -r '.task_id' 2>/dev/null)
if [ -z "$TASK_ID" ] || [ "$TASK_ID" == "null" ]; then
  echo "✗ Task dispatch failed: Could not extract task_id"
  exit 1
fi
echo "✓ Video uploaded and processing task enqueued"
echo "  task_id: $TASK_ID"
echo ""

# Test 3: Poll task status (immediate check)
echo "[4/5] Test: Poll task status (immediate)..."
TASK_STATUS=$(curl -s -X GET "$BASE_URL/api/v1/video/task/$TASK_ID" \
  -H "Authorization: Bearer $JWT_TOKEN")

echo "Response:"
echo "$TASK_STATUS" | jq '.' 2>/dev/null || echo "$TASK_STATUS"
echo ""

STATE=$(echo "$TASK_STATUS" | jq -r '.state' 2>/dev/null)
echo "Task state: $STATE"
echo ""

# Test 4: Poll task status (with retries)
echo "[5/5] Test: Poll task status with retry loop..."
MAX_RETRIES=30
RETRY_DELAY=2
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  TASK_STATUS=$(curl -s -X GET "$BASE_URL/api/v1/video/task/$TASK_ID" \
    -H "Authorization: Bearer $JWT_TOKEN")

  STATE=$(echo "$TASK_STATUS" | jq -r '.state' 2>/dev/null)

  if [ "$STATE" == "success" ]; then
    echo "✓ Task completed successfully!"
    echo ""
    echo "Final Result:"
    echo "$TASK_STATUS" | jq '.result' 2>/dev/null || echo "$TASK_STATUS"
    break
  elif [ "$STATE" == "failed" ]; then
    echo "✗ Task failed!"
    echo ""
    echo "Error:"
    echo "$TASK_STATUS" | jq '.error' 2>/dev/null || echo "$TASK_STATUS"
    exit 1
  else
    RETRY_COUNT=$((RETRY_COUNT + 1))
    PERCENT=$((RETRY_COUNT * 100 / MAX_RETRIES))
    echo "  Waiting... ($RETRY_COUNT/$MAX_RETRIES) State: $STATE"
    sleep $RETRY_DELAY
  fi
done

if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
  echo "⚠ Task did not complete within timeout (${MAX_RETRIES}s)"
  echo "Current state: $STATE"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Integration tests completed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
