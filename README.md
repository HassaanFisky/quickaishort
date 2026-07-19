<div align="center">

<br />

<img src="public/qs-logo.png" alt="QuickAI Shorts" width="88" />

<br /><br />

# QuickAI Shorts

### From YouTube URL to publish-ready short — validated before you post.

<br />

[![Live](https://img.shields.io/badge/quickaishort.online-live-6366f1?style=flat-square&logo=vercel&logoColor=white)](https://quickaishort.online)
&nbsp;
[![Build](https://img.shields.io/github/actions/workflow/status/HassaanFisky/quickaishort/ci.yml?style=flat-square&label=build)](https://github.com/HassaanFisky/quickaishort/actions/workflows/ci.yml)
&nbsp;
[![Lint](https://img.shields.io/github/actions/workflow/status/HassaanFisky/quickaishort/linter.yml?style=flat-square&label=lint)](https://github.com/HassaanFisky/quickaishort/actions/workflows/linter.yml)
&nbsp;
[![ADK](https://img.shields.io/badge/Google%20ADK-1.0-4285F4?style=flat-square&logo=google&logoColor=white)](https://google.github.io/adk-docs/)
&nbsp;
[![Gemini](https://img.shields.io/badge/Gemini%202.5%20Flash-8B5CF6?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)
&nbsp;
[![MIT](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)

<br />

> *"OpusClip shows you which clip. Pre-Flight shows you if it will actually work."*

<br />

**[Live Demo](https://quickaishort.online)** · **[Studio Architecture Docs](docs/studio/README.md)** · **[Deploy Docs](docs/DEPLOYMENT_README.md)** · **[Security](SECURITY.md)** · **[Vision](VISION.md)** · **[Studio Vision](docs/studio/01-product-vision.md)**

<br />

</div>

---

## The problem it solves

Every short-form tool on the market exports blind. You paste a URL, cut a clip, and publish hoping the algorithm picks it up.

QuickAI Shorts adds a layer that didn't exist before: **audience simulation before the post**. A multi-agent pipeline runs your clip through six demographically-distinct AI personas, stress-tests the hook timing, grounds the analysis in real Google Trends data, and produces a weighted viral consensus score — all before a single render job is queued.

Three integrated pipelines. One studio.

---

## Pipelines

### 1 · Viral Clip Discovery

Paste any YouTube URL. The system proxies the audio stream, runs in-browser Whisper transcription (via a dedicated Web Worker), detects silence segments, and scores each clip candidate on audio energy and speech density. Ranked clips with viral scores, hook text, and reasoning land in the editor in under 60 seconds — no upload required.

### 2 · Pre-Flight — Audience Validation

The core differentiator. Every clip candidate passes through a Google ADK multi-agent topology before it reaches a render queue:

```
                      ┌─────────────────────────────────────────┐
                      │    Clip Candidates + YouTube URL        │
                      └──────────────────┬──────────────────────┘
                                         │
                                         ▼
          ┌──────────────────────────────────────────────────────────┐
          │             PreFlight Orchestrator [SequentialAgent]     │
          └────────┬──────────────────┬──────────────────────┬───────┘
                   │                  │                       │
        ┌──────────▼───────┐ ┌────────▼────────┐ ┌───────────▼──────┐
        │ ClipCandidate    │ │ TrendGrounding  │ │ Analytics        │
        │ Validator        │ │ (SerpAPI)       │ │ (YouTube v2)     │
        └──────────────────┘ └─────────────────┘ └──────────────────┘
                                         │
                                         ▼
          ┌──────────────────────────────────────────────────────────┐
          │         AudiencePanelLoop [LoopAgent]                    │
          │         — iterates until consensus score ≥ 65 —         │
          └────────┬────────────────────────────────────────┬────────┘
                   │                                        │
        ┌──────────▼──────────────────────────────┐  ┌──────▼───────────┐
        │  PersonaPanel [ParallelAgent × 6]        │  │ VoteAggregator   │
        │                                          │  │                  │
        │  Gen Z Creator          weight  0.25     │  │ weighted score   │
        │  Millennial Professional weight  0.25    ├─►│ → session state  │
        │  Sports Fan             weight  0.15     │  │                  │
        │  Tech Enthusiast        weight  0.15     │  └────────┬─────────┘
        │  Entertainment Critic   weight  0.10     │           │
        │  News Analyst           weight  0.10     │           ▼
        └──────────────────────────────────────────┘  ┌────────▼─────────┐
                                                       │ QualityGate      │
                                                       │ pass / loop exit │
                                                       └────────┬─────────┘
                                                                │
                                                       ┌────────▼─────────┐
                                                       │ ClipRefinement   │
                                                       │ AI-driven recut  │
                                                       └──────────────────┘
```

Each persona carries a distinct behavioral profile, attention-span model, and scroll threshold. The aggregator applies weighted voting, writes consensus state back to Firestore, and either exits the loop or triggers a refinement pass. Creators see per-persona breakdowns, not just a final score.

**ADK primitives used:** `SequentialAgent` · `ParallelAgent` · `LoopAgent` · `FunctionTool` · `MCPToolset`

### 3 · ADK Studio — Non-Linear Creator Workspace

A script-to-video generator that runs entirely server-side. Three freely-accessible panels (Script, Media, Voice) can be assembled in any order. A sticky Generate bar activates the moment a script is present.

Under the hood: script → Google TTS voiceover synthesis → segment stitching → FFmpeg transcode (libx264 + aac, 9:16 / 1:1) → GCS upload → signed download URL. Progress is pushed via Pusher Channels with a WebSocket fallback. Pexels stock footage is auto-fetched when no B-roll is uploaded.

---

## Editor — What runs in the browser

The editor is a full non-linear suite. Heavy work runs off the main thread in four dedicated Web Workers:

| Worker | What it does |
| :--- | :--- |
| `whisper.worker.ts` | In-browser transcription via Whisper.wasm (`@xenova/transformers`) — no server round-trip |
| `face.worker.ts` | MediaPipe face detection for auto-reframing and smart crop |
| `analysis.worker.ts` | Silence detection, audio energy scoring, clip candidate generation |
| `ffmpegExport.worker.ts` | Client-side preview export via MediaRecorder API |

The `VideoCanvas` component wires a **Web Audio API chain** — `MediaElementSource → BiquadFilter (highpass 80 Hz) → GainNode → destination` — giving live noise suppression and audio boost directly in the preview. A Gemini-backed AI Copilot panel accepts natural language instructions and dispatches them as typed editor actions.

The final export path runs server-side: `POST /api/process-video` → RQ render worker → FFmpeg → GCS.

---

## Chrome Extension

A Manifest v3 extension ships alongside the web app. It injects into `youtube.com/watch` pages, reads the active video metadata, and provides a one-click path to open the clip in QuickAI Studio without copy-pasting URLs.

```
extension/
├── manifest.json       # MV3, activeTab + scripting permissions
├── content.js          # Injected on youtube.com/watch*
├── background.js       # Service worker
└── assets/             # Icons 16 · 48 · 128
```

---

## Tech Stack

| Layer | Technology | Detail |
| :--- | :--- | :--- |
| **Frontend** | Next.js 14.2 · App Router · TypeScript | Server components by default; client only where needed |
| **Styling** | Tailwind CSS v4 · Framer Motion 12 | Hydro-Glass design system; all tokens locked in `CLAUDE.md` |
| **State** | Zustand 5 | Single `editorStore` as source of truth for timeline, clips, captions, export |
| **Backend** | Python 3.12 · FastAPI · Pydantic v2 | Async throughout; typed request/response on every endpoint |
| **AI Agents** | Google ADK 1.0 · Gemini 2.5 Flash | Pre-Flight pipeline + Director Agent + Script Agent |
| **Render Queue** | Redis Cloud · RQ · ffmpeg-python | Background jobs; DLQ via Redis Streams; admin retry endpoints |
| **Storage** | GCS (`quickaishort-agent-494304-media`) | Uploads, exports, TTS cache — single bucket, signed download URLs |
| **Database** | MongoDB Atlas | Credits, job history, user stats |
| **Realtime** | Pusher Channels · WebSocket | Job progress + dashboard stats; polling fallback when Pusher is absent |
| **Auth** | NextAuth 4 · HS256 JWT ↔ FastAPI | `NEXTAUTH_SECRET` shared; all protected endpoints use `Depends(get_verified_user_id)` |
| **Deploy** | Vercel (frontend) · Cloud Run (API + Worker) | `quickai-api` + `quickai-worker`; startup probe tuned for 13 s ADK import |

---

## Quick Start

### Backend

```bash
cd fastapi

python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env              # fill in credentials (see table below)

uvicorn main:app --reload --port 8000

# Render worker — separate terminal, needs Redis
python render_worker.py
```

### Frontend

```bash
cd frontend

pnpm install

cp .env.example .env.local        # fill in credentials (see table below)

pnpm dev                           # → http://localhost:3000
```

### Required environment variables

| Variable | File | Notes |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | `fastapi/.env` | ADK agents, AI editor, script enhancement |
| `GOOGLE_CLOUD_PROJECT` | `fastapi/.env` | `quickaishort-agent-494304` |
| `GCS_BUCKET_NAME` | `fastapi/.env` | `quickaishort-agent-494304-media` |
| `REDIS_URL` | `fastapi/.env` | Render job queue |
| `MONGODB_URI` | `fastapi/.env` | Credits, job history, user stats |
| `EXPORT_SIGNING_SECRET` | `fastapi/.env` | HMAC-signed download URLs (`openssl rand -hex 32`) |
| `NEXTAUTH_SECRET` | both | Must match exactly on frontend and backend |
| `NEXT_PUBLIC_API_URL` | `frontend/.env.local` | FastAPI base URL |

All optional vars — Pexels stock footage, Google TTS voiceover, Pusher realtime, SerpAPI trends — are documented with fallback behavior in `fastapi/.env.example`.

---

## CI

Two gates run on every pull request:

- **Lint** — `black` + `flake8` (Python), `eslint` (TypeScript)
- **Build** — `tsc --noEmit` then `next build` — zero TS errors required to merge

---

## Project layout

```
quickaishort/
├── fastapi/                  # Python API + agents + render worker
│   ├── agent/                # ADK agents: preflight, viral, director, script
│   ├── services/             # Storage, TTS, render, realtime, auth, billing
│   ├── routers/              # billing, youtube, video sub-routers
│   ├── main.py               # FastAPI app — 40+ endpoints
│   └── render_worker.py      # RQ worker process
├── frontend/                 # Next.js 14 application
│   ├── src/app/              # App Router pages
│   │   ├── editor/           # Video editor (full NLE)
│   │   ├── (dashboard)/adk/  # ADK Studio creator workspace
│   │   └── (dashboard)/      # Dashboard, history, settings
│   ├── src/components/       # Editor panels, VideoCanvas, AICopilot
│   ├── src/hooks/            # useTranscription, useFaceTracker, usePreflight …
│   ├── src/workers/          # Whisper, MediaPipe, FFmpeg, analysis workers
│   └── src/stores/           # editorStore, adkStore (Zustand)
└── extension/                # Chrome MV3 extension for YouTube
```

---

## License

[MIT](LICENSE) — see [SECURITY.md](SECURITY.md) for responsible disclosure.

---

<div align="center">
<sub>
Built for the <a href="https://ai.google.dev/">Google for Startups AI Agents Challenge 2026</a>
&nbsp;·&nbsp;
<a href="https://quickaishort.online">quickaishort.online</a>
</sub>
</div>
