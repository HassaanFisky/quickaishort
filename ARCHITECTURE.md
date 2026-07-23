# Architecture — QuickAI Short / QuickAI Studio

**Last updated:** 2026-07-23
**Stack (verified):** Next.js 14.2.35 · FastAPI · Gemini 2.5 Flash · Google ADK (Pre-Flight agents) · Cloud Tasks · Redis · ffmpeg-python · GCS primary · NextAuth JWT

Canonical deep docs: [`docs/studio/`](docs/studio/README.md)  
Binding OS direction: [`docs/studio/PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md`](docs/studio/PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md)  
Live ops memory: [`CLAUDE.md`](CLAUDE.md) (WORKING MEMORY)

---

## Product framing

- **QuickAI Short** — production conversational AI editor (ingest → chat → preview → export).
- **QuickAI Studio** — evolution of the same system into an AI-native editing OS (Kernel + Registry + MediaGraph + Orchestrator).

Do not treat them as unrelated products.

---

## Request flow (happy path)

```text
Browser → Next.js (frontend/src/app/)
  → Next.js API routes (where used)
  → FastAPI (fastapi/main.py)
       ├─ YouTube / upload ingest
       ├─ Gemini AI Editor (+ Studio Kernel when flagged)
       ├─ Optional Pre-Flight ADK pipeline (skill)
       └─ Cloud Tasks → private request renderer (min=0) → GCS exports/
```

Realtime: Pusher + WebSocket fallback. Auth: NextAuth HS256 JWT validated in `fastapi/services/auth.py`.

---

## Conversational edit path (production)

```text
User message / suggestion chip
        ↓
POST AI editor / Studio orchestrator (flagged)
        ↓
Gemini + Luna orchestration profile → structured actions (Capability Registry ABI — EP-001)
        ↓
Client applies preview edits (Zustand NLE)
        ↓
Optional bake: RenderManifest / Kernel snapshot → Cloud Tasks → ffmpeg → GCS
```

**Suggestions:** MediaGraph-grounded only (ADR-009). Heuristic-only chip lists are retired.

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

Model: Gemini 2.5 Flash via `fastapi/services/gemini_client.py`. Luna is the
ordered tool/JSON prompt profile; Terra is the single schema-repair profile.
They are not external model providers. Redis blocks duplicate exact requests
and shares bounded 429 cooldown state across instances.

**ADK workspace UI (`/adk`):** Coming Soon — blurred, intentionally unavailable until release (ADR-013 / EP-008). Do not document it as a live script-to-video studio.

---

## Storage truth

| Store | Role |
|-------|------|
| **GCS** | Primary media — uploads, exports, TTS cache (`quickaishort-agent-494304-media`) |
| **MongoDB** | Job history, credits paths, legacy GridFS for `/api/v1/video/*` only |
| **Firestore** | ADK session state (falls back to in-memory); some stats paths |
| **Redis** | Render status, runId cancellation, locks/dedupe, tenant AI cache, Gemini 429 cooldown |

Plan admission uses a fixed trusted-tier capability matrix; there is no rolling
daily free-video pool.

Historical notes that claimed “GridFS for all media” are obsolete. See ADR-002.

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
| `ffmpegExport.worker.ts` | Client preview export path (CDN-timeout guarded) |

Production export authority: private request-bound Cloud Run renderer + GCS.

---

## Deployment

| Component | Platform |
|-----------|----------|
| Frontend | Vercel — `https://www.quickaishort.online` |
| API | Cloud Run `quickai-api` |
| Renderer | Private Cloud Run `quickai-worker` (`min=0`, request CPU, concurrency 1) |
| Durable dispatch | Cloud Tasks `quickai-render` (OIDC, 3 bounded attempts) |

Cost policy: API and renderer both scale to zero; Redis is no longer a compute wake path. See cost-efficiency rules.

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
