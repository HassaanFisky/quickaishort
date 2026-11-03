# Specification: Local Media Pipeline & Native FFmpeg Architecture (EGM-SPEC-001)

**Status:** APPROVED FOR CODEBASE ALIGNMENT AUDIT  
**Author:** QuickAI Studio Engineering Directorate (Elephant Session)  
**Target Subsystems:** `fastapi/services/local_media_pipeline.py`, `fastapi/routers/local_media_router.py`, `fastapi/services/local_persistence.py`  
**Governing Standard:** Google Elephant-Goldfish Model (EGM)  

---

## 1. Problem Statement & Motivation
QuickAI Studio requires an entirely autonomous, zero-cloud-spend media ingest, analysis, cutting, filtering, and export pipeline that operates reliably on client workstations without requiring Google Cloud Storage, Cloud Run workers, or Cloud Tasks.

---

## 2. Architectural Boundaries & Non-Goals
* **Goals:**
  1. Inspect local media with zero network roundtrips using native `ffprobe`.
  2. Extract silence boundaries deterministically using native `ffmpeg` audio filters.
  3. Stream uploaded and generated media over HTTP with Range header compliance for browser players.
  4. Render multi-segment silence cuts and visual look filters into clean H.264/AAC MP4 files.
  5. Verify rendered output against frame corruption and format validity.
* **Non-Goals:**
  1. No text-to-generative-video diffusion (e.g. Sora/Runway) in this pipeline.
  2. No cloud GCS/Firestore dependency when `LOCAL_FIRST_MODE=1`.
  3. No raw shell invocation (`shell=True` is strictly forbidden).

---

## 3. Data Models & API Contracts

### 3.1 Upload Endpoint (`POST /api/local-media/upload`)
* **Request:** Multipart form upload containing a single video file.
* **Response:**
  ```json
  {
    "status": "success",
    "video_id": "string",
    "media_url": "/api/local-media/uploads/{video_id}",
    "probe": {
      "duration": 3.0,
      "width": 640,
      "height": 360,
      "has_audio": true,
      "video_codec": "h264",
      "audio_codec": "aac"
    },
    "silences": [
      { "start": 1.0, "end": 2.0 }
    ],
    "uploaded_by": "string"
  }
  ```

### 3.2 Media Stream Endpoint (`GET /api/local-media/uploads/{filename}`)
* **Semantics:** Chunked HTTP 200 / HTTP 206 Partial Content video streaming supporting browser seek operations.
* **Security Constraints:** Path traversal check rejects any segment containing `..` or leading slashes resolving outside `.quickai_studio/storage/`.

### 3.3 Render Dispatch Endpoint (`POST /api/local-media/render`)
* **Payload:** `LocalRenderRequest` specifying `video_id`, `start_sec`, `end_sec`, and `options` (aspect ratio, visual filters, silence removal).
* **Execution:** Background asynchronous execution saving state in `LocalSQLiteDB` collection `render_jobs`.

---

## 4. Failure Modes & Recovery Strategies
1. **Corrupt Media Header:** `ffprobe` returns non-zero exit code -> Endpoints fail-closed with HTTP 422 Unprocessable Entity.
2. **Missing FFmpeg Binaries:** Engine detects executable presence in system path or user bin (`C:\Users\DELL\bin\ffmpeg.exe`) -> Raises explicit actionable `RuntimeError`.
3. **Empty Upload:** Immediate validation returns HTTP 400 Bad Request before disk allocation.

---

## 5. Verification & Acceptance Criteria
1. Media upload produces valid probe dictionary and non-empty silence segment list when silence is present.
2. Stream endpoint serves byte ranges with valid MIME type `video/mp4`.
3. Render job transitions through `queued` -> `processing` -> `success`.
4. Exported MP4 duration matches expected timeline cuts within 0.25s tolerance.
5. All tests in `fastapi/tests/test_local_media_pipeline.py` pass without regression.
