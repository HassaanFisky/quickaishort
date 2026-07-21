# Architecture — QuickAI Short / QuickAI Studio

**Last updated:** 2026-07-21  
**Stack (verified):** Next.js 14.2.35 · FastAPI · Gemini 2.5 Flash · Google ADK (Pre-Flight agents) · Redis/RQ · ffmpeg-python · GCS primary · NextAuth JWT

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
       └─ RQ render jobs → render_worker.py → GCS exports/
```

Realtime: Pusher + WebSocket fallback. Auth: NextAuth HS256 JWT validated in `fastapi/services/auth.py`.

---

## Conversational edit path (production)

```text
User message / suggestion chip
        ↓
POST AI editor / Studio orchestrator (flagged)
        ↓
Gemini → structured actions (Capability Registry ABI — EP-001)
        ↓
Client applies preview edits (Zustand NLE)
        ↓
Optional bake: RenderManifest / Kernel snapshot → RQ → ffmpeg → GCS
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

Model: Gemini 2.5 Flash via `fastapi/services/gemini_client.py`.

**ADK workspace UI (`/adk`):** Coming Soon — blurred, intentionally unavailable until release (ADR-013 / EP-008). Do not document it as a live script-to-video studio.

---

## Storage truth

| Store | Role |
|-------|------|
| **GCS** | Primary media — uploads, exports, TTS cache (`quickaishort-agent-494304-media`) |
| **MongoDB** | Job history, credits paths, legacy GridFS for `/api/v1/video/*` only |
| **Firestore** | ADK session state (falls back to in-memory); some stats paths |
| **Redis** | RQ queue + status streams / locks |

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

Production export authority: server RQ worker + GCS.

---

## Deployment

| Component | Platform |
|-----------|----------|
| Frontend | Vercel — `https://www.quickaishort.online` |
| API | Cloud Run `quickai-api` |
| Worker | Cloud Run `quickai-worker` (min instances kept for RQ listener reliability) |

Cost policy: prefer API scale-to-zero; justify always-on worker for queue reliability. See cost-efficiency rules.

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
