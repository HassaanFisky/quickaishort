# QuickAIShort — Production Upgrade Plan ("Precision Upgrade Path")

**Status:** Approved 2026-04-27 — awaiting GO before implementation begins.
**Owner:** Hassaan Fisky • **Deadline:** Google for Startups AI Agents Challenge submission, 2026-06-05.

---

## Context

QuickAIShort is being upgraded from prototype to production-grade SaaS. Three load-bearing weaknesses identified:

1. **Client-side `ffmpeg.wasm` export** ([src/workers/ffmpeg.worker.ts](src/workers/ffmpeg.worker.ts) + [src/hooks/useExport.ts](src/hooks/useExport.ts)) cannot reliably handle 1GB+ source videos — browsers OOM, mobile devices stall, no recovery.
2. **Dashboard metrics are fake** — `Videos Created` and `Audience Predictions` are hardcoded `"0"` ([src/app/(dashboard)/dashboard/page.tsx:80-81](src/app/(dashboard)/dashboard/page.tsx#L80-L81)). The two stats that *are* wired (`export_count`, `total_duration`) flow through Pusher, but the backend `pusher` SDK isn't even in `requirements.txt`, so the channel goes silent in production.
3. **AI pipeline is sequential and text-only** — [fastapi/agent/preflight_agent.py](fastapi/agent/preflight_agent.py) wastes an LLM round trip per loop on `VoteAggregatorAgent` (pure arithmetic); [fastapi/agent/viral_agent.py](fastapi/agent/viral_agent.py) has placeholder copy mentioning vision but never extracts frames; no retry/backoff exists, so the first 429 from Gemini crashes the request.

Exploration also revealed several pre-existing scaffolding files ([fastapi/render_worker.py](fastapi/render_worker.py), [fastapi/services/queue_service.py](fastapi/services/queue_service.py), [fastapi/services/stats_service.py](fastapi/services/stats_service.py)) that are **untracked, missing dependencies, and never wired into deployment**. The plan completes them rather than rewriting from scratch.

---

## Ground Truth (verified during exploration)

**Backend already on disk (must complete, not invent):**

- [fastapi/main.py](fastapi/main.py) — `/api/export` endpoint exists at lines 114-131 and already enqueues to RQ; `/api/stats` exists at lines 133-139.
- [fastapi/render_worker.py](fastapi/render_worker.py) — RQ worker uses `yt-dlp` with `download_ranges` + `force_keyframes_at_cuts` (good). FFmpeg post-processing is a placeholder (lines 40-41). Output hardcoded to `/tmp`. No timeout, no cleanup.
- [fastapi/services/queue_service.py](fastapi/services/queue_service.py) — Redis + RQ queue singleton.
- [fastapi/services/stats_service.py](fastapi/services/stats_service.py) — `pymongo` (sync, blocks event loop) + Pusher trigger. `MONGO_URI` env key, but `.env` defines `MONGODB_URI` → silent miss.
- [fastapi/agent/viral_agent.py](fastapi/agent/viral_agent.py) — `gemini-2.0-flash`, ScoringAgent prompt mentions vision but no frame input is ever passed.
- [fastapi/agent/preflight_agent.py](fastapi/agent/preflight_agent.py) — `SequentialAgent → ParallelAgent(trend, analytics) → LoopAgent(...)`. ParallelAgent already runs grounding in parallel inside ADK; the *Pillar 3 DAG refactor* is really about (a) bypassing ADK for the two grounding tool calls so we can use raw `asyncio.gather` and (b) replacing the LLM-based `VoteAggregatorAgent` with deterministic Python.

**Missing from `fastapi/requirements.txt` but imported in code (will break `pip install` cleanly today):**

- `redis` (imported by `queue_service.py`, `render_worker.py`)
- `rq` (same)
- `pusher` (imported by `stats_service.py`)
- `ffmpeg-python` (needed for Pillar 1 post-processing)

**Frontend already has:**

- `pusher-js@^8.5.0` and `next-auth@^4.24.13` with Google OAuth + MongoDB `User` model ([src/lib/auth/options.ts](src/lib/auth/options.ts)).
- User identity on dashboard is currently `session?.user?.email` ([src/app/(dashboard)/dashboard/page.tsx:49](src/app/(dashboard)/dashboard/page.tsx#L49)) — should be `session?.user?.id` (the MongoDB `_id`) which is already populated in the session callback at [src/lib/auth/options.ts:40-52](src/lib/auth/options.ts#L40-L52).
- `mongoose@^9.1.3` already used on the Next.js side for the `User` model.
- `@tanstack/react-query@^5.90.17` already installed (no need to add).

**FFmpeg.wasm to deprecate:**

- [src/workers/ffmpeg.worker.ts](src/workers/ffmpeg.worker.ts) (247 lines)
- [src/hooks/useExport.ts](src/hooks/useExport.ts) (149 lines)
- Trigger: `handleExport()` in [src/components/editor/RightPanel.tsx:59](src/components/editor/RightPanel.tsx#L59).
- Packages `@ffmpeg/ffmpeg` and `@ffmpeg/util` will remain in `package.json` until the new flow is verified, then be removed in a final cleanup commit.

---

## Pillar 1 — Production Export Engine (deprecate ffmpeg.wasm)

### Backend changes

1. **`fastapi/requirements.txt`** — add and pin:

   ```text
   redis==5.0.4
   rq==1.16.2
   pusher==3.3.2
   ffmpeg-python==0.2.0
   tenacity==8.2.3
   ```

   Versions are the latest stable on PyPI as of 2026-04 per CLAUDE.md Rule 3 — will run `pip index versions <pkg>` to confirm before pinning during execution.

2. **`fastapi/services/render_service.py`** *(new)* — single class `RenderService` that owns the full pipeline so `render_worker.py` becomes a thin entry point:
   - `download_segment(video_id, start, end) -> Path` — yt-dlp with `download_ranges` + `force_keyframes_at_cuts` (move existing logic out of `render_worker.py`).
   - `transcode_to_short(input_path, *, aspect_ratio, quality, captions_srt, watermark) -> Path` — `ffmpeg-python` chain mirroring [src/workers/ffmpeg.worker.ts:71-211](src/workers/ffmpeg.worker.ts#L71-L211): crop/scale/pad to 1080×1920 or 1080×1080, optional `subtitles=` filter, optional `overlay=` for watermark, libx264 (`crf 18/23/28` + preset `fast/veryfast/ultrafast`) and aac.
   - `cleanup(paths: list[Path])` — unlink temp files in a `finally`.
   - All temp files under `tempfile.mkdtemp(prefix="qais-export-")` (not hardcoded `/tmp`).
   - Final output uploaded to MongoDB GridFS (bucket `exports`) with TTL index on `expiresAt = now + 24h` so finished renders self-clean. URL surfaced as `/api/export/download/{job_id}?token=...` (HMAC-SHA256 over `job_id|user_id|expiry` using `EXPORT_SIGNING_SECRET`).

3. **`fastapi/render_worker.py`** — refactor to:

   ```python
   def process_render_task(job_id, video_id, start_sec, end_sec, user_id, options) -> dict
   ```

   - Job timeout via `Job.create(..., timeout=600)` from the enqueue side.
   - Calls `RenderService` end-to-end inside one `try/finally` that cleans temp files.
   - On success, publishes a Redis pubsub message that the FastAPI lifespan listener picks up to call `await increment_stats(..., export_delta=1, duration_delta=...)` (worker process can't safely share a motor client with web).
   - On failure, RQ's built-in retry: `Retry(max=2, interval=[10, 60])`.

4. **`fastapi/main.py` `/api/export`**:
   - Extend `ExportRequest` to include `aspect_ratio`, `quality`, `captions_srt`, `watermark_enabled`.
   - Generate `job_id = uuid.uuid4().hex` server-side.
   - `render_queue.enqueue(process_render_task, job_id=job_id, ..., job_timeout=600, retry=Retry(max=2))`.
   - Return `{"job_id": job_id, "status": "queued", "subscribe_channel": f"export-{job_id}"}`.

5. **New endpoints**:
   - `GET /api/export/status/{job_id}` → `{"status": "queued|started|finished|failed", "progress": int|null, "download_url": str|null}` (queries RQ `Job.fetch`).
   - `GET /api/export/download/{job_id}?token=...` → streams from GridFS after HMAC validation; sets `Content-Disposition: attachment`.

6. **`Procfile` + `railway.toml`** — add a worker process so RQ actually runs in production:

   ```text
   web: uvicorn main:app --host 0.0.0.0 --port $PORT
   worker: python render_worker.py
   ```

### Frontend changes

1. **New `src/hooks/useServerExport.ts`** — replaces `useExport.ts`:
   - `POST /api/export` → receive `job_id`.
   - Subscribe to Pusher channel `export-{job_id}` and bind `progress`, `complete`, `error` events.
   - Fallback poller hits `/api/export/status/{job_id}` every 3s if Pusher disconnects.
   - On `complete`, navigates an `<a download>` to the signed `download_url`.

2. **[src/components/editor/RightPanel.tsx:59](src/components/editor/RightPanel.tsx#L59)** — swap `useExport` for `useServerExport`. No other UI changes required (button label, progress bar, toasts already plumbed into the same store keys).

3. **Cleanup commit (after E2E verification)** — delete [src/workers/ffmpeg.worker.ts](src/workers/ffmpeg.worker.ts), [src/hooks/useExport.ts](src/hooks/useExport.ts), [src/hooks/useMediaEngine.ts](src/hooks/useMediaEngine.ts), and remove `@ffmpeg/ffmpeg` + `@ffmpeg/util` from `package.json`.

---

## Pillar 2 — Dynamic Dashboard & Real-Time Stats

### Backend changes

1. **`fastapi/services/db.py`** *(new)* — single async Mongo client:

   ```python
   from motor.motor_asyncio import AsyncIOMotorClient
   client = AsyncIOMotorClient(os.environ["MONGODB_URI"])  # canonical key
   db = client.get_database("quickai_shorts")
   ```

   Wired into FastAPI `lifespan` so the connection pool is created at startup and closed on shutdown. **Fixes the `MONGO_URI` vs `MONGODB_URI` env-key mismatch by standardizing on `MONGODB_URI` everywhere.**

2. **`fastapi/models/user_stats.py`** *(new)* — Pydantic v2 model:

   ```python
   class UserStats(BaseModel):
       user_id: str
       total_projects: int = 0
       total_duration_processed: float = 0.0
       export_count: int = 0
       ai_runs: int = 0
       updated_at: datetime
   ```

   Collection `UserStats` gets a unique index on `user_id` (created in `lifespan`).

3. **`fastapi/services/stats_service.py`** — rewrite as async:

   ```python
   async def increment_stats(user_id: str, *,
       duration_delta: float = 0.0,
       export_delta: int = 0,
       ai_run_delta: int = 0,
       project_delta: int = 0) -> UserStats
   ```

   Single `find_one_and_update` with `$inc`, `upsert=True`, `return_document=AFTER`. After the write, fires Pusher `user-dashboard-{user_id}` event `stats-updated` AND broadcasts to any active `/ws/stats/{user_id}` subscribers — payload is the full updated document, so clients don't need a follow-up read.

4. **Hook points** (so stats actually move):
   - `/api/analyze` success → `await increment_stats(user_id, ai_run_delta=1, duration_delta=request.duration)`.
   - `/api/preflight` success → `await increment_stats(user_id, ai_run_delta=1)`.
   - `render_worker.process_render_task` success → Redis pubsub → lifespan listener → `await increment_stats(..., export_delta=1, duration_delta=clip_duration)`.
   - First project upload → `project_delta=1` (piggyback on `/api/analyze` with a flag).

5. **`/api/stats`** — convert to async, return full `UserStats` document.

6. **`GET /ws/stats/{user_id}`** — native FastAPI WebSocket fallback that streams the same `stats-updated` payload for self-hosted/dev mode (no Pusher key needed). Pusher remains the production transport.

### Frontend changes

1. **[src/lib/auth/options.ts](src/lib/auth/options.ts)** — already populates `session.user.id` from MongoDB `_id`. Verified.

2. **[src/app/(dashboard)/dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx)**:
   - Use `session?.user?.id` instead of `session?.user?.email` for the user key (line 49).
   - Replace the four hardcoded/partial stat tiles with values from the new `UserStats` shape: `total_projects`, `ai_runs`, `export_count`, `total_duration_processed / 60`.
   - Inline `fetch` → React Query `useQuery(['stats', userId], ...)` with `staleTime: Infinity` and manual `setQueryData` from the Pusher event handler. Pusher pushes the full document, so we just call `queryClient.setQueryData(['stats', userId], payload)` — no refetch needed.
   - When `NEXT_PUBLIC_PUSHER_KEY` is unset, fall back to opening `wss://.../ws/stats/{userId}`.

3. **[src/stores/editorStore.ts](src/stores/editorStore.ts)** — no stat fields added. Stats stay React Query-managed; the editor store remains UI/session state only.

4. **`src/types/stats.ts`** *(new)* — TypeScript mirror of the `UserStats` Pydantic model.

---

## Pillar 3 — Agentic Pipeline & Multimodal Upgrade

### A. Async DAG (preflight)

The existing `ParallelAgent(TrendGrounding, AnalyticsGrounding)` already runs grounding concurrently inside ADK. The real serial bottlenecks are:

- The `VoteAggregatorAgent` is an LLM call that does pure arithmetic — should be a deterministic Python function.
- The full `Aggregator → QualityGate → Refinement` chain re-runs every loop iteration even when the gate would pass on iteration 1.

**Refactor in [fastapi/agent/preflight_agent.py](fastapi/agent/preflight_agent.py):**

1. Replace `VoteAggregatorAgent` with a deterministic `aggregate_votes(state) -> dict` (existing `_weighted_consensus` at [fastapi/agent/preflight_agent.py:199-209](fastapi/agent/preflight_agent.py#L199-L209) already implements the math — wrap it as an ADK `BaseAgent` subclass that does no LLM call). Saves one LLM round trip per loop iteration (~3× over a 3-iter run).
2. Wrap the two grounding tool calls (`fetch_trend_context`, `fetch_youtube_analytics`) in an async pre-step that runs them via `asyncio.gather` *before* invoking the orchestrator, and writes results into session state directly. Bypasses ADK's tool-call latency for I/O that has nothing to do with the LLM.
3. Add explicit `loop_iteration` short-circuit: if `consensus_score >= threshold` after iteration 1, skip the refinement agent on that iteration.

### B. Vision upgrade (viral)

1. **`fastapi/services/frame_extractor.py`** *(new)* — given a video file path and a list of `(start, end)` clip windows, sample N=5 keyframes per clip with `ffmpeg-python` and return `list[bytes]` (JPEG, 512px max side). Cached on disk by `(video_id, start, end)` hash so re-runs are free.
2. **[fastapi/agent/viral_agent.py](fastapi/agent/viral_agent.py)** — `ScoringAgent` is already prompted to use vision (lines 92, 96). Now actually pass frames:
   - `Content(parts=[Part(text=...), Part(inline_data=Blob(mime_type='image/jpeg', data=frame))])` for each sampled frame.
   - Add scored field `cameraMovement: float` to the response schema, the `ClipSuggestion` Pydantic model, and the frontend `Clip.viralAnalysis` TypeScript type at [src/types/pipeline.ts](src/types/pipeline.ts).
3. Frame extraction runs only once `/api/analyze` has the video file locally — pass the path through.

### C. Quota management (exponential backoff)

1. **`fastapi/services/gemini_client.py`** *(new)* — single helper `async def call_gemini(model, contents, **kwargs)` that wraps every direct Gemini call. Uses `tenacity`:

   ```python
   @retry(
       retry=retry_if_exception_type((ResourceExhausted, ServiceUnavailable, DeadlineExceeded)),
       wait=wait_exponential(multiplier=1, min=2, max=30),
       stop=stop_after_attempt(5),
       reraise=True,
   )
   ```

   `google-api-core` already provides `ResourceExhausted` (HTTP 429) — no new SDK needed.

2. For ADK-internal calls (which we don't directly wrap), set the lower-level `google.generativeai` client retry policy via `genai.configure(...)` at startup — verify the exact knob during execution, fall back to monkey-patching `genai.GenerativeModel.generate_content_async` if needed. Mark this 🟡 UNVERIFIED in code comments per CLAUDE.md Rule 5.

---

## Critical files to be modified

**Backend**

- [fastapi/main.py](fastapi/main.py) — extend `ExportRequest`, add lifespan + Mongo init + Redis pubsub listener, new `/api/export/status`, `/api/export/download`, `/ws/stats/{user_id}`.
- [fastapi/render_worker.py](fastapi/render_worker.py) — slim down to entry point; delegate to `RenderService`.
- [fastapi/agent/preflight_agent.py](fastapi/agent/preflight_agent.py) — replace `VoteAggregatorAgent` with deterministic function; pre-fetch grounding via `asyncio.gather`; early-exit on gate pass.
- [fastapi/agent/viral_agent.py](fastapi/agent/viral_agent.py) — accept and pass frames to ScoringAgent; add `cameraMovement` field; use `gemini_client.call_gemini`.
- [fastapi/services/stats_service.py](fastapi/services/stats_service.py) — rewrite as async motor-based `increment_stats`; dual-publish to Pusher + WS subscribers.
- [fastapi/services/queue_service.py](fastapi/services/queue_service.py) — add job-timeout + retry policy.
- [fastapi/requirements.txt](fastapi/requirements.txt) — add `redis`, `rq`, `pusher`, `ffmpeg-python`, `tenacity` with pinned versions.
- [Procfile](Procfile) + [railway.toml](railway.toml) — add `worker:` process.
- *(new)* `fastapi/services/render_service.py`, `fastapi/services/db.py`, `fastapi/services/frame_extractor.py`, `fastapi/services/gemini_client.py`, `fastapi/models/user_stats.py`.

**Frontend**

- [src/app/(dashboard)/dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx) — switch to `session.user.id`, React Query, full `UserStats` shape, all 4 tiles live; Pusher-or-WS transport switch.
- [src/components/editor/RightPanel.tsx](src/components/editor/RightPanel.tsx) — swap export hook (line 59).
- [src/lib/api.ts](src/lib/api.ts) — add `requestExport`, `getExportStatus`, `getStats` typed clients.
- [src/types/pipeline.ts](src/types/pipeline.ts) — add `cameraMovement` to `Clip.viralAnalysis`.
- *(new)* `src/hooks/useServerExport.ts`, `src/types/stats.ts`, `src/types/export.ts`.
- **Cleanup commit (post-verification)**: delete [src/workers/ffmpeg.worker.ts](src/workers/ffmpeg.worker.ts), [src/hooks/useExport.ts](src/hooks/useExport.ts), [src/hooks/useMediaEngine.ts](src/hooks/useMediaEngine.ts); remove `@ffmpeg/ffmpeg` + `@ffmpeg/util` from `package.json`.

**Reused, do not reinvent**

- `_weighted_consensus` in [fastapi/agent/preflight_agent.py:199-209](fastapi/agent/preflight_agent.py#L199-L209) → becomes the body of the new aggregator function.
- yt-dlp `download_ranges` + `force_keyframes_at_cuts` block in [fastapi/render_worker.py:28-34](fastapi/render_worker.py#L28-L34) → moves into `RenderService.download_segment`.
- FFmpeg crop/pad/subtitle/watermark filter chain in [src/workers/ffmpeg.worker.ts:71-211](src/workers/ffmpeg.worker.ts#L71-L211) → ported 1:1 into `RenderService.transcode_to_short` (Python, same filter graph).
- Pusher channel naming `user-dashboard-{user_id}` already used in [src/app/(dashboard)/dashboard/page.tsx:62](src/app/(dashboard)/dashboard/page.tsx#L62) → keep.
- React Query already in `package.json` → reuse, don't add SWR.
- NextAuth session `user.id` already populated at [src/lib/auth/options.ts:40-52](src/lib/auth/options.ts#L40-L52) → use as-is.

---

## Order of execution (one PR per pillar, in this order)

1. **PR 0 — Foundation (~1h):** Fix `MONGODB_URI` env-key inconsistency; add missing `redis`/`rq`/`pusher`/`ffmpeg-python`/`tenacity` to `requirements.txt`; add `worker:` to Procfile + railway.toml; verify `pip install -r requirements.txt` succeeds locally and on Railway. Also: scrub all secret values from `fastapi/.env` (the `GEMINI_API_KEY` was rotated and moved to Railway env vars).
2. **PR 1 — Pillar 1 (Export Engine):** Backend `RenderService` + new endpoints + frontend `useServerExport`. Keep `useExport` and ffmpeg.wasm in tree until E2E verified.
3. **PR 2 — Pillar 2 (Dashboard Stats):** Async motor + `UserStats` model + hook points + dashboard React Query rewrite + `/ws/stats` fallback.
4. **PR 3 — Pillar 3 (Agentic + Vision):** Tenacity retry wrapper, deterministic vote aggregator, frame extractor, viral vision input, preflight DAG cleanup.
5. **PR 4 — Cleanup:** Remove `ffmpeg.wasm`, `useExport`, dead workers, dead npm deps. Update `CLAUDE.md` §13 with completion log.

---

## Verification (E2E, per pillar)

**Pillar 1**

- `pip install -r fastapi/requirements.txt` — clean install on Python 3.12.
- Start Redis (`docker run -p 6379:6379 redis:7`), start `python render_worker.py`, start `uvicorn main:app`.
- `curl POST /api/export` with a real YouTube URL + 30s segment → returns `job_id`.
- `curl GET /api/export/status/{job_id}` → progresses queued → started → finished within ~60s.
- Hit `download_url` → 9:16 MP4 plays in VLC; correct duration; captions burned in if requested.
- Frontend smoke: paste a YouTube URL in the editor, click Save Your Short, file downloads via signed URL (verify in DevTools Network tab that `@ffmpeg/core` is NOT requested).

**Pillar 2**

- Open dashboard at `localhost:3000/dashboard` — initial fetch populates all 4 tiles from MongoDB.
- In another tab, run `/api/analyze` → dashboard tiles update within <1s without page refresh (Pusher event observed in DevTools WS frames).
- Run an export → `export_count` and `total_duration_processed` tick up live.
- Unset `NEXT_PUBLIC_PUSHER_KEY`, reload — `/ws/stats/{user_id}` fallback kicks in, tiles still update.

**Pillar 3**

- Run `/api/preflight` with a known-bad clip → consensus score < 65 → loop iterates → refined clip returned in <120s. Confirm only ONE LLM call per iteration for aggregation+gate (was 2).
- Run `/api/analyze` on a video with strong vs static visuals → `visualEnergy` and `cameraMovement` differ meaningfully across clips (not constant 0.5). Inspect Gemini API request logs to confirm `inline_data` parts are present.
- Force a 429 by spamming requests → tenacity retries are visible in logs, request still completes (no 500 to client).

**Cross-pillar**

- `npm run build` — zero TypeScript errors.
- `python -m py_compile fastapi/main.py fastapi/render_worker.py fastapi/agent/preflight_agent.py fastapi/agent/viral_agent.py` — clean.
- Deploy to Railway (web + worker services) and Vercel; rerun the full E2E from production URLs.

---

## Resolved decisions (locked 2026-04-27)

1. **Export storage** → MongoDB GridFS, bucket `exports`. TTL index on `expiresAt = now + 24h` so finished renders self-clean. Reuses existing `MONGODB_URI` connection pool — zero new credentials, no R2/S3 dependency.
2. **Realtime transport** → Pusher primary, FastAPI native WebSocket fallback. Backend dual-publishes inside `increment_stats`; frontend subscribes to Pusher when `NEXT_PUBLIC_PUSHER_KEY` is set, otherwise opens `wss://.../ws/stats/{user_id}`.
3. **Gemini model** → All agent files read `os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")`. Default `gemini-2.5-flash` matches the verified entry in CLAUDE.md §13 (verified 2026-04-24). Centralized in `fastapi/services/gemini_client.py` so swapping to any newer published variant later is a one-line env change.
   - 🟡 UNVERIFIED: any model name beyond `gemini-2.5-flash` / `gemini-2.5-pro` / `gemini-2.0-flash` cannot be confirmed against my knowledge cutoff. Per CLAUDE.md Rule 1, the user can flip `GEMINI_MODEL` in Railway after running `curl https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY | jq '.models[].name'` to confirm availability.

---

## Security follow-up (folded into PR 0)

The exposed `GEMINI_API_KEY` was rotated and moved to Railway env vars per the user. PR 0 will:

- Remove all secret values from `fastapi/.env` (keep `.env.example` skeleton only).
- Verify `fastapi/.env` is in `.gitignore` (it is — but double-check after rotation).
- Run a one-time `git log -p -- fastapi/.env` audit; if the rotated key ever appears in history, the rotation is sufficient (no history rewrite needed) but note it in `CLAUDE.md` §13 changelog.

---

## Awaiting GO

Per the original directive, no implementation code will be written until the user issues "GO". On GO, execution begins at PR 0.
