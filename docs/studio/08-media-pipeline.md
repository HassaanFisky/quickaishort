# 08 — Media Pipeline

## Happy path (YouTube / upload → editor)

```text
Paste URL / upload file
  → useIngestLifecycle (canonical staged FSM)
      identify → validate → acquire_meta → projectize → analyze → ready|failed
  → Kernel ensureStudioProject after acquire_meta (flag on)
  → IDB analysis artifact cache (skip Whisper+/api/analyze on hit)
  → useMediaPipeline (analyze stage only)
      → proxy/audio (/api/audio, /api/proxy*)
      → Whisper.wasm transcript (browser worker)
      → POST /api/analyze clip suggestions (existing; not an extra ingest call)
  → AI panel context updated (title + transcript slice)
```

**Entry points (all must use `useIngestLifecycle`):** `IngestSurface` Generate/upload, EditorLayout drop, query-param auto-import, session cache restore, `retry-analysis` → `retryAnalyze`.

Evidence: `useIngestLifecycle.ts`, `ingestFsm.ts`, `EditorLayout.tsx`, `useMediaPipeline.ts`.

Do **not** call `setSourceUrl` / `runPipeline` from ad-hoc UI paths.

---

## Server acquisition (export / clip download)

`services/video_acquisition.py`:

- Tiered download: proxy → cookies+PoToken → PoToken-only  
- Redis cache keyed by video segment hash  
- Chunked download for long clips (>120s) with ffmpeg concat fallback  
- Timeouts raised historically 15s→90s (CLAUDE memory)

Used by render path `_download_segment` in `render_service.py`.

---

## Audio path

`GET /api/audio` in `main.py`:
- yt-dlp bestaudio → MP3  
- Cobalt fallback (documented in CLAUDE)  
- Redis cache of paths  

---

## Upload paths

| Path | Storage | Notes |
|------|---------|-------|
| `POST /api/adk/upload` | GCS `adk_uploads/{user}/…` | Primary Studio |
| `POST /api/video/presigned-url` | GCS uploads | Editor uploads |
| `POST /api/v1/video/upload` | GridFS | Legacy |

---

## Analysis coverage vs vision

| Signal | Status |
|--------|--------|
| Transcript | Yes (browser Whisper) |
| Silence / speech density | Yes (heuristics) |
| Faces | Hook exists (`useFaceTracker`) — not full orchestration |
| Scenes | `sceneDetection.ts` — not auto pipeline mandatory |
| Beats | `beatDetection.ts` |
| Emotion / objects / composition QA | **Insufficient evidence** of production pipeline |
| Captions | Generated/applied via AI actions + export burn-in |
| Metadata | YouTube `/api/info`, `getVideoInfo` |

**Gap:** Vision wants automatic comprehensive analysis on upload. Today is **partial, client-fragmented**. Blueprint: AnalysisAgent aggregates existing signals first before buying new models.
