# Architecture — QuickAI Studio

**Last updated:** 2026-10-26  
**Stack (verified):** Next.js 14.2.35 · FastAPI · Gemini 2.5 Flash · Google ADK (Pre-Flight agents) · Cloud Tasks · Redis · ffmpeg-python · GCS primary (SQLite + local filesystem in `LOCAL_FIRST_MODE`) · NextAuth JWT

Canonical deep docs: [`docs/studio/`](docs/studio/README.md)  
Binding OS direction: [`docs/studio/PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md`](docs/studio/PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md)  
Live ops memory: [`CLAUDE.md`](CLAUDE.md) (WORKING MEMORY)

---

## Product identity & lineage

- **QuickAI Studio** is the evolution of QuickAI Short into an AI-native creative execution platform: a conversational video editor (ingest → chat → preview → export) backed by a structured Studio Kernel (Capability Registry + Project Document + MediaGraph + Orchestrator).
- Internal infrastructure identifiers (`quickai-api`, `quickai-worker`, `quickaishort-agent-494304-media`, `quickaishort` database names) are preserved for operational continuity.

---

## System topology

```mermaid
flowchart TB
  subgraph Client["Browser Client (Next.js 14 App Router)"]
    UI["Editor Shell / Workspace UI\n(Zustand NLE + Canvas Preview)"]
    Workers["Browser Web Workers\n(Whisper · Face · Silence/Energy)"]
    IDB["IndexedDB Ingest Cache\n& Local Preferences"]
  end

  subgraph Edge["Next.js Server & Middleware"]
    MW["Auth Middleware\n(NextAuth HS256 JWT + Local-First Gate)"]
    NextAPI["Next.js API Routes\n(/api/auth, /api/projects, /api/exports)"]
  end

  subgraph Backend["FastAPI Execution Engine (fastapi/main.py)"]
    Auth["JWT Verifier (services/auth.py)"]
    Ingest["Ingest FSM & yt-dlp / Upload\n(services/ingest_fsm.py)"]
    AIEditor["Conversational AI Editor\n(Decision Intelligence + Gemini DualModelRouter)"]
    Kernel["Studio Kernel (/api/studio/v1)\n(EP-001 Registry · Project Doc · MediaGraph · Orchestrator)"]
    ADK["Pre-Flight ADK Skill\n(Sequential + Parallel Persona Loop)"]
  end

  subgraph StorageAndRender["Storage & Render Execution"]
    CloudPath["Cloud Production Path\nGCS + Firestore + Redis + Cloud Tasks → Cloud Run Worker"]
    LocalPath["Local-First Path (LOCAL_FIRST_MODE=1)\nSQLite (.quickai_studio) + Local Disk + Native FFmpeg"]
  end

  UI <--> Workers
  UI <--> IDB
  UI --> MW --> NextAPI
  UI -->|"Bearer JWT"| Auth
  Auth --> Ingest
  Auth --> AIEditor
  Auth --> Kernel
  Auth --> ADK
  Ingest --> StorageAndRender
  AIEditor --> Kernel
  Kernel --> StorageAndRender
```

---

## Conversational edit execution flow

```mermaid
sequenceDiagram
  autonumber
  actor User as Creator
  participant Editor as Next.js Editor (Zustand NLE)
  participant API as FastAPI (/api/ai-editor/command)
  participant DI as Decision Intelligence (0 Credits)
  participant Gemini as Gemini 2.5 Flash (Luna / Terra)
  participant Kernel as Studio Kernel (/api/studio/v1)
  participant Render as Render Pipeline (Cloud Run / Local FFmpeg)

  User->>Editor: Natural-language prompt or MediaGraph chip
  Editor->>API: POST /api/ai-editor/command (transcript, silence, clip state)
  alt Deterministic Director Intent (dead-air / shorts package / restore opening)
    API->>DI: Evaluate facets & silence segments
    DI-->>API: ASK (missing facet) or ACT (structured actions + receipt)
  else General Creative Intent
    API->>Gemini: DualModelRouter (Luna prompt profile, Terra repair fallback)
    Gemini-->>API: Validated EP-001 tool actions (emit_blocked stripped)
  end
  API-->>Editor: Structured Edit Actions + Explanation
  Editor->>Editor: Apply real-time preview mutations on timeline & canvas
  opt Studio Kernel Flag Enabled
    Editor->>Kernel: Persist Project V2 revision & MediaGraph state
  end
  User->>Editor: Click Export Final MP4
  Editor->>Render: Dispatch RenderManifest (Cloud Tasks or Local Worker)
  Render-->>Editor: Signed GCS URL or Local MP4 Stream
```

**Suggestions:** MediaGraph-grounded only (ADR-009). Heuristic-only chip lists are retired.

---

## Media ingest lifecycle (M2/M3)

Canonical FSM (FE runtime + BE contract in `services/ingest_fsm.py`):

```text
identify → validate → acquire_meta → projectize → analyze → ready | failed
```

- Hook: `frontend/src/hooks/useIngestLifecycle.ts` — **only** Studio ingest entry.
- Re-analysis: `ready|failed → analyze` via `retryAnalyze` (no duplicate Gemini on cache hit).
- Artifacts: IndexedDB (`ingestArtifacts.ts`); URL session restore via `sessionStorage` (no extra cloud).
- GCS file upload owned by lifecycle; pipeline must not double-PUT.

---

## Pre-Flight (ADK skill — not sole product identity)

Backend topology (agents live in `fastapi/agent/`):

```text
SequentialAgent (PreFlight Orchestrator)
  ├─ ClipCandidate · TrendGrounding · AnalyticsGrounding
  └─ LoopAgent (AudiencePanelLoop)
        ├─ ParallelAgent × 6 personas
        ├─ VoteAggregator
        ├─ QualityGate
        └─ ClipRefinement
```

Model: Gemini 2.5 Flash via `fastapi/services/gemini_client.py`. Luna is the ordered tool/JSON prompt profile; Terra is the single schema-repair profile. They are not external model providers. Redis blocks duplicate exact requests and shares bounded 429 cooldown state across instances.

**ADK workspace UI (`/adk`):** Coming Soon — blurred, intentionally unavailable until release (ADR-013 / EP-008). Do not document it as a live script-to-video studio.

---

## Storage & runtime modes

| Store / Mode | Cloud Production Role | Local-First Role (`LOCAL_FIRST_MODE=1`) |
|--------------|-----------------------|-----------------------------------------|
| **Primary Media** | **GCS** (`quickaishort-agent-494304-media`) — uploads, exports, TTS cache | `.quickai_studio/storage/` local filesystem |
| **Project & Kernel State** | **Firestore** — Studio Kernel project docs, user stats, ADK state | **SQLite** (`.quickai_studio/data/quickai_studio.db`) |
| **Auth & Job History** | **MongoDB** — NextAuth users, export history, legacy GridFS (`/api/v1/video/*`) | Explicit `LOCAL_FIRST_DEV_NO_AUTH=1` local session + SQLite |
| **Coordination & Cache** | **Redis** — render status, `runId` cancellation, locks/dedupe, Gemini 429 cooldown | In-memory cache & local process coordination |

Plan admission uses a fixed trusted-tier capability matrix (`fastapi/core/limits.py`):
Free = 720p + forced watermark + 500 MB storage + no deep analysis + `daily_ai_video_limit=3`; Pro unlocks 4K / no watermark / deep analysis / unlimited daily AI loops.

Historical notes that claimed "GridFS for all media" are obsolete. See ADR-002.

---

## Studio Kernel (shipped substrate)

| Package | Status |
|---------|--------|
| EP-001 Capability Registry ABI | **Frozen** |
| EP-002 Project Document | Implemented |
| EP-003 MediaGraph + suggestions | Implemented |
| EP-004 Orchestrator plan jobs | Implemented |
| EP-005 Chat-primary shell | Implemented |
| EP-006 Manifest bake from Kernel | Implemented |
| EP-007 Workflows / collab readiness | Design-locked (no multiplayer without approval) |
| EP-008 Editor first-run + ADK CS | Implemented |

Runtime surfaces (when flags on): `/api/studio/v1/projects`, `/media-graphs`, `/orchestrator`, ingest policy, onboarding.

Never bypass EP-001. Never invent a second tool ABI.

---

## Frontend workers

| Worker | Role |
|--------|------|
| `whisper.worker.ts` | In-browser transcription |
| `face.worker.ts` | MediaPipe face tracking |
| `analysis.worker.ts` | Silence / energy analysis |
| `_archive/workers/ffmpegExport.worker.ts` | **Quarantined** (orphan VideoWorkspace only) — not live `/editor`; never Final |

**Live client export:** WebCodecs (`ExportDialog`) + MediaRecorder fallback.  
**Final shareable MP4:** Cloud Tasks → private Cloud Run renderer → GCS (or native local FFmpeg in `LOCAL_FIRST_MODE`).

---

## Deployment

| Component | Platform |
|-----------|----------|
| Frontend | Vercel — `https://www.quickaishort.online` |
| API | Cloud Run `quickai-api` |
| Renderer | Private Cloud Run `quickai-worker` (`min=0`, request CPU, concurrency 1) |
| Durable dispatch | Cloud Tasks `quickai-render` (OIDC, 3 bounded attempts) |

Cost policy: API and renderer both scale to zero; Redis is no longer a compute wake path.

---

## Authority order (for agents and humans)

1. Phase 2 Architectural Truth Review  
2. Accepted ADRs + frozen EP-001 + Canonical Project Memory  
3. `docs/studio/` subsystem docs  
4. `CLAUDE.md` WORKING MEMORY (ops)  
5. This file + root README (must not contradict 1–2)

---

## Related

- [`docs/studio/03-architecture.md`](docs/studio/03-architecture.md)  
- [`docs/studio/22-component-diagrams.md`](docs/studio/22-component-diagrams.md)  
- [`docs/studio/23-sequence-diagrams.md`](docs/studio/23-sequence-diagrams.md)  
- [`docs/studio/adrs/`](docs/studio/adrs/)  
