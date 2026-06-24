# QuickAI Short Agent Technical Roles & Guardrails

This document defines the technical boundaries, responsibilities, fallbacks, and environment checks for all five core agents in the QuickAI Short platform.

---

## 1. AI Timeline Editor Agent (`ai_editor_agent`)

- **Role**: Interprets natural-language user commands and maps them into a timeline editing action array.
- **Allowed Actions**:
  - Process user instructions (e.g., "delete silence", "add cinematic filter").
  - Map queries to the 17 timeline editing tools.
  - Parse transcripts and apply trim ranges or captions based on current cursor positions.
- **Forbidden Actions**:
  - Generating actions targeting times beyond `videoDuration`.
  - Referencing tool names outside the 17 listed tools.
  - Exposing system directories or credentials in the `message` response.
- **Fallback**:
  - If Gemini fails or invalid JSON is returned, fall back to a `no_op` response status with a warning message suggesting the user rephrase.
- **Memory Rules**:
  - Reads `AIEditorCurrentState` and the list of `TranscriptChunk` elements from the active request context.
- **Environment Checks**:
  - **Required**: `GEMINI_API_KEY`
  - **Optional**: `GEMINI_PRIMARY_MODEL`, `GEMINI_FREE_MODEL`

---

## 2. Pre-Flight Simulator Agent (`preflight_agent`)

- **Role**: Multi-agent audience simulation to predict virality, retention, hook strength, and share likelihood of candidate clips.
- **Allowed Actions**:
  - Parallelize trend grounding (SerpAPI) and YouTube Analytics reports.
  - Spawn Gen Z, Millennial, Tech, News, Sports, and Entertainment persona agents.
  - Iterate up to 3 times to refine clips at high-drop-off points.
- **Forbidden Actions**:
  - Throwing HTTP errors if SerpAPI or YouTube OAuth fails (must fall back to baseline).
  - Executing code or script commands.
- **Fallback**:
  - Degrade to a single-model sequential analysis using the direct Gemini or ViralAgent pipeline if ADK fails to initialize or times out.
- **Memory Rules**:
  - Reads and writes to Firestore Session Service via `FirestoreSessionService` using `session_id`.
- **Environment Checks**:
  - **Required**: `GEMINI_API_KEY`, `GOOGLE_CLOUD_PROJECT`
  - **Optional**: `SERPAPI_KEY`, `YOUTUBE_OAUTH_CREDENTIALS`

---

## 3. Viral Segment Agent (`viral_agent`)

- **Role**: Identifies viral hook moments from transcript text, scores visual/camera movements from keyframes, and calibrates scores using the historical learning loop.
- **Allowed Actions**:
  - Segment transcripts into 15-59s clip suggestions.
  - Call frame extractor to fetch keyframe JPEGs when `video_id` is supplied.
  - Calibrate with `LearningService` history and adjust decision boundaries deterministically.
- **Forbidden Actions**:
  - Reading or writing directly to unauthorized project buckets.
  - Blocking the request thread on frame decoding.
- **Fallback**:
  - Fall back to text-only Direct Gemini scoring if frame extractor or vision-grounded API calls fail.
- **Memory Rules**:
  - Reads/writes top scores and salient coordinates to Redis cache under key `viral:cache:<video_id>` and `segment:metadata:<video_id>`.
- **Environment Checks**:
  - **Required**: `GEMINI_API_KEY`, `REDIS_URL`
  - **Optional**: `GEMINI_PRIMARY_MODEL`, `GEMINI_FREE_MODEL`

---

## 4. Topic Director Agent (`director_agent`)

- **Role**: Translates scripts, ideas, or YouTube summaries into structured storyboards and clip candidates.
- **Allowed Actions**:
  - Generate scene-by-scene storyboard JSON objects conforming to the `DirectorResult` model.
  - Suggest dynamic visual descriptions and captions.
- **Forbidden Actions**:
  - Suggesting scenes longer than 7 seconds or overall duration over 60 seconds.
- **Fallback**:
  - Return empty arrays or raw dictionary response if Pydantic model validation fails.
- **Memory Rules**:
  - Firestore session state tracking via `FirestoreSessionService` for session-scoped run history.
- **Environment Checks**:
  - **Required**: `GEMINI_API_KEY`, `GOOGLE_CLOUD_PROJECT`
  - **Optional**: `GEMINI_PRIMARY_MODEL`

---

## 5. Render Worker Agent (`render_agent`)

- **Role**: Background worker that runs FFmpeg rendering commands, crops videos, applies overlays, handles reframing, and burns in subtitles.
- **Allowed Actions**:
  - Consume render jobs from redis-backed `render_queue`.
  - Query Redis to fetch salient coordinate offsets (`salientCenterX`) and hooks compiled by the viral agent.
  - Write temporary MP4 files and upload them to the GCS export bucket.
- **Forbidden Actions**:
  - Processing files that exceed the 180s export threshold.
  - Executing unsafe shell instructions.
- **Fallback**:
  - Catch render exceptions, update job status to "failed" in Firestore, and trigger the `CHANNEL_EXPORT_FAILED` Redis pubsub channel.
- **Memory Rules**:
  - Reads segment metadata and camera movement style from Redis caching keys.
- **Environment Checks**:
  - **Required**: `REDIS_URL`, `GOOGLE_CLOUD_PROJECT`, `EXPORT_SIGNING_SECRET`
  - **Optional**: `PUBLIC_API_URL`
