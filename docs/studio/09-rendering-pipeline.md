# 09 — Rendering Pipeline

## Components

| Piece | File |
|-------|------|
| Enqueue | `services/queue_service.py` (`render_queue`) |
| Worker | `render_worker.py` `process_render_task` |
| Core render | `services/render_service.py` |
| Streams / DLQ | `services/render_queue.py` |
| Manifest compile | `services/manifest_renderer.py` |
| Schema | `models/render_manifest.py` ↔ `frontend/src/lib/render/renderManifest.ts` |

---

## Job lifecycle (verified behaviors)

1. API enqueues RQ job with options (+ optional `run_id`).  
2. Worker checks supersede via `render:runid:*`.  
3. Idempotency lock `render:lock:{id}` around GCS upload.  
4. Writes `render:args:*` + processing marker for crash recovery.  
5. `recover_stale_jobs()` on boot for stuck >10min jobs.  
6. `push_result()` updates streams; failures may DLQ `render:dead`.  
7. Progress via Redis pubsub → API → Pusher / WS.  
8. Cancel: `DELETE /api/render/{job_id}` + runid bump.

---

## RenderManifest

**Intent:** Portable NLE description (tracks, clips, captions, overlays, effects, keyframes).

**Worker behavior:** If `options.render_manifest` present, attempt `compile_manifest_to_ffmpeg`; on failure, fall back / clear (`render_worker.py`).

**Tests exist:** `fastapi/tests/test_render_manifest.py`, `test_manifest_renderer.py`.

**Studio rule:** New export features should extend Manifest, not invent parallel option bags.

---

## Dual queue debt

| Queue | Path | Status |
|-------|------|--------|
| RQ `render_queue` | Primary exports / ADK | Active |
| Celery | `/api/v1/video/*` GridFS | Legacy — keep until deprecated |

Do not add a third queue.

---

## Quality / CRF

CLAUDE memory: tiered CRF (low=28/ultrafast, medium=23/veryfast, high=18/fast). Re-verify in `render_service.py` before documenting exact numbers in marketing.
