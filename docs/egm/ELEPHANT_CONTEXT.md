# QuickAI Studio — Elephant Canonical Architecture Context (EGM)

**Authority:** QuickAI Studio Engineering Operating System  
**Framework:** Google Elephant-Goldfish Model (EGM)  
**Version:** 1.0.0 (Production Verified)  
**Last Synchronized:** 2026-11-03  

---

## 1. Product Identity & Purpose
* **Lineage:** Originated as `QuickAI Short` (`quickaishort.online`), evolved into **QuickAI Studio** (`com.quickai.studio`).
* **Core Philosophy:** AI-native conversational video editing operating system (NLE) operating under the **LNCU (Low Network / Cost Unit)** model.
* **Actor Roles:**
  * **User:** Creative Director.
  * **AI:** Assistant Editor applying concrete, non-hallucinatory timeline mutations.
  * **Timeline:** Visual inspector and real-time canvas projector (not a manual tedious drag-drop editor).
  * **Tools:** Deterministic craft (FFmpeg, Whisper, OpenCV/MediaPipe, AST parsers).

---

## 2. Dual-Engine Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│                        QUICKAI STUDIO RUNTIME                          │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌───────────────────────────────────────┐   ┌────────────────────────────────────┐
│ LOCAL-FIRST ENGINE                    │   │ CLOUD PRODUCTION ENGINE            │
│ (LOCAL_FIRST_MODE=1)                  │   │ (ENVIRONMENT=production)           │
├───────────────────────────────────────┤   ├────────────────────────────────────┤
│ • Database: SQLite                    │   │ • Database: Cloud Firestore        │
│   (.quickai_studio/data/quickai_studio.db)│ │ • Media: GCS Media Bucket          │
│ • Media: Local Filesystem Storage     │   │   (quickaishort-agent-494304-media)│
│   (.quickai_studio/storage/)          │   │ • Queues: Cloud Tasks + Redis (RQ) │
│ • Render: Native OS FFmpeg            │   │ • Render: Cloud Run Worker Pods    │
│ • Intelligence: Decision Gate         │   │ • Intelligence: Gemini 2.5 Flash   │
│   (LOCAL_DETERMINISTIC, 0 Tokens)     │   │   (Luna/Terra DualModelRouter)     │
│ • Auth: Local Studio Bypass           │   │ • Auth: NextAuth HS256 JWT + Mongo │
└───────────────────────────────────────┘   └────────────────────────────────────┘
```

---

## 3. Structural Components & Invariants

### 3.1 Backend (`fastapi/`)
* **Framework:** FastAPI on Python 3.11.
* **Routing:**
  * `/api/studio/v1/projects`: Server-authoritative Studio Project Document CRUD.
  * `/api/studio/v1/media-graphs`: MediaGraph DAG containing grounded silence, faces, and transcript facets.
  * `/api/ai-editor/command`: Natural language command parser routed via Decision Gate (`LOCAL_DETERMINISTIC`) or Gemini (`DualModelRouter`).
  * `/api/local-media/*`: Native upload, silence detection, Range streaming, and render dispatch.
  * `/api/process-video` & `/api/status/{job_id}`: Standardized video render job dispatching.
* **Key Invariants:**
  * **Zero-Hallucination Gate:** Commands such as "remove dead air" MUST verify silence evidence in the MediaGraph before emitting `REMOVE_SILENCES`.
  * **Security Sandboxing:** No direct shell calls (`shell=False` strictly enforced for `ffmpeg`/`ffprobe`). Strict path-traversal sanitization (`..` forbidden).
  * **Fail-Closed Probing:** Missing media or corrupted headers fail with HTTP 422/500 rather than fabricated fallback durations.

### 3.2 Frontend (`frontend/`)
* **Framework:** Next.js 14.2.35 (App Router, React 18, TypeScript 5, Tailwind CSS 4).
* **State Management:** Zustand 5 (`editorStore`, `shortcutsStore`, `uiStore`).
* **Ingest Lifecycle:** Canonical FSM in `hooks/useIngestLifecycle.ts`:
  `identify -> validate -> acquire_meta -> projectize -> analyze -> ready | failed`
* **Preview Plane:** Canvas overlay rendering and Web Workers (`face.worker.ts`, `whisper.worker.ts`).
* **Internationalization:** 9 locales (`en`, `es`, `fr`, `de`, `pt`, `hi`, `ur`, `ar`, `he`) with 100% key parity and BCP 47 canonicalization.

### 3.3 Desktop Shell (`desktop/`)
* **Framework:** Electron with context-isolated preload scripts.
* **Target Packaging:**
  * Windows: NSIS `.exe` and standalone `.exe` via `electron-builder.yml`.
  * macOS: `.dmg` and `.zip` for `x64` / `arm64`.

---

## 4. Architectural Boundaries & Non-Negotiables
1. **Never mock video generation:** Videos must be rendered via actual FFmpeg processes, verifying stream metadata and zero frame corruption.
2. **Never break EP-001 Registry Sync:** `fastapi/scripts/check_registry_sync.py` must always return matching hashes between Python schemas and TypeScript definitions:
   * Capability Registry Hash: `a88df92c359ce9bd`
   * Locale Registry Hash: `409a6c9d5c73a4c4`
3. **No Unbounded Cloud Spend:** Token burn is gated behind billing tier verification and local deterministic priority.
