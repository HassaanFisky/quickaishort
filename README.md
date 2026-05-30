<div align="center">

<img src="public/qs-logo.png" alt="QuickAI Shorts" width="96" />

# QuickAI Shorts

**The AI-native short-form video studio — from raw footage to publish-ready clips.**

[![Live](https://img.shields.io/badge/Live%20at-quickaishort.online-6366f1?style=flat-square&logo=vercel&logoColor=white)](https://quickaishort.online)
[![Build](https://github.com/HassaanFisky/quickaishort/actions/workflows/ci.yml/badge.svg?style=flat-square)](https://github.com/HassaanFisky/quickaishort/actions/workflows/ci.yml)
[![Lint](https://github.com/HassaanFisky/quickaishort/actions/workflows/linter.yml/badge.svg?style=flat-square)](https://github.com/HassaanFisky/quickaishort/actions/workflows/linter.yml)
[![Google ADK](https://img.shields.io/badge/Google%20ADK-v1.0-4285F4?style=flat-square&logo=google&logoColor=white)](https://github.com/google/agent-development-kit)
[![Gemini](https://img.shields.io/badge/Gemini%202.5%20Flash-powered-8B5CF6?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](LICENSE)

> *"OpusClip shows you which clip. Pre-Flight shows you if it will actually work."*

[**Live Demo →**](https://quickaishort.online) · [Docs](docs/DEPLOYMENT_README.md) · [Security](SECURITY.md)

</div>

---

## What is this?

QuickAI Shorts is a full-stack AI video studio where creators paste a YouTube URL and get back a clip scored, validated, and ready to publish — not just exported.

The core differentiator is **Pre-Flight**: a multi-agent pipeline built on Google ADK that simulates six audience personas in parallel, runs iterative quality gates, and produces a weighted consensus viral score before a single frame is rendered. Creators ship clips that are analytically validated, not blindly guessed.

On top of Pre-Flight sits **ADK Studio** — a non-linear creator workspace where script, footage, and voice can be assembled in any order, then rendered server-side via a background RQ worker with real-time Pusher progress.

---

## Capabilities

**Pre-Flight — Multi-Agent Clip Validation**
Six audience personas (Gen Z, Millennial, Sports, Tech, Entertainment, News) run in parallel via `ParallelAgent`, score each clip candidate independently, and loop until a weighted consensus score hits the quality gate. You see the reasoning, not just a number.

**Conversational AI Editor**
A Gemini-backed chat interface in the editor lets creators instruct cuts, trims, and adjustments in natural language. Edits align to transcription timestamps — not arbitrary timecodes.

**ADK Studio — Non-Linear Creator Workspace**
Script, Media, and Voice panels are freely accessible in any order. The sticky Generate bar activates the moment a script is present, queues a full render job (voiceover synthesis → segment stitching → FFmpeg transcode → GCS upload), and streams progress in real time.

**Server-Side Rendering Pipeline**
No client-side FFmpeg hacks. Every export runs as a background RQ job: stream-clipped via yt-dlp, transcoded with ffmpeg-python, mixed with AI voiceover, and stored in Google Cloud Storage. Render results are signed and streamed back on demand.

**Real-Time Everything**
Job progress, dashboard stats, and agent reasoning traces are pushed via Pusher channels with a WebSocket polling fallback. The UI stays live without reloads.

---

## Architecture

### Pre-Flight Multi-Agent Pipeline

```
                        ┌─────────────────────────┐
                        │     QuickAI Client      │
                        └────────────┬────────────┘
                                     │ Video URL + Candidates
                                     ▼
                        ┌─────────────────────────┐
                        │    FastAPI Backend       │
                        └────────────┬────────────┘
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────┐
        │           PreFlight_Orchestrator [SequentialAgent] │
        └──────┬─────────────────┬──────────────────┬────────┘
               │                 │                  │
     ┌─────────▼──────┐  ┌───────▼────────┐  ┌──────▼──────────┐
     │ ClipCandidate  │  │ TrendGrounding │  │ Analytics       │
     │ Agent          │  │ (SerpAPI)      │  │ (YouTube v2)    │
     └────────────────┘  └────────────────┘  └─────────────────┘
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────┐
        │         AudiencePanelLoop [LoopAgent]              │
        │         iterates until consensus score ≥ 65        │
        └──────┬────────────────────────────────────┬────────┘
               │                                    │
     ┌─────────▼──────────────────────────┐  ┌──────▼──────────┐
     │  PersonaPanel [ParallelAgent × 6]  │  │ VoteAggregator  │
     │                                    │  │                 │
     │  Gen Z Creator       weight 0.25   │  │ weighted score  │
     │  Millennial Pro      weight 0.25   ├─►│ → session state │
     │  Sports Fan          weight 0.15   │  │                 │
     │  Tech Enthusiast     weight 0.15   │  └────────┬────────┘
     │  Entertainment Critic weight 0.10  │           │
     │  News Analyst        weight 0.10   │           ▼
     └────────────────────────────────────┘  ┌────────▼────────┐
                                              │ QualityGate     │
                                              │ pass / loop     │
                                              └────────┬────────┘
                                                       │
                                              ┌────────▼────────┐
                                              │ ClipRefinement  │
                                              │ AI-driven recut │
                                              └─────────────────┘
```

### ADK Primitives

| Primitive | Role |
| :--- | :--- |
| `SequentialAgent` | State preparation and pipeline orchestration |
| `ParallelAgent` | Runs all six audience personas concurrently |
| `LoopAgent` | Recursive refinement until quality threshold is met |
| `FunctionTool` | SerpAPI Google Trends grounding with result caching |
| `MCPToolset` | MongoDB Atlas analytics + trend data for historical grounding |

---

## Tech Stack

| Layer | Technology | Why |
| :--- | :--- | :--- |
| **Frontend** | Next.js 14 (App Router) · Zustand · Framer Motion · Tailwind v4 | Web Workers for in-browser processing; zero layout shift |
| **Backend** | Python 3.12 · FastAPI · RQ · ffmpeg-python | Decoupled render queue; async endpoints throughout |
| **AI** | Google ADK 1.0 · Gemini 2.5 Flash · google-genai SDK | Multi-agent orchestration + multimodal frame analysis |
| **Storage** | GCS (media) · MongoDB Atlas (state, credits, history) | No local FS dependency; horizontally scalable |
| **Realtime** | Pusher Channels · WebSocket fallback | Sub-second job progress to every connected client |
| **Cache / Queue** | Redis Cloud | Agent task queues + yt-dlp stream URL caching |
| **Auth** | NextAuth (HS256 JWT) ↔ FastAPI dependency | Single shared secret; every protected endpoint verified |
| **Deploy** | Vercel (frontend) · Google Cloud Run (API + Worker) | Auto-scaled; zero cold-start penalty on the worker |

---

## Quick Start

### Backend

```bash
cd fastapi

python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env            # fill in your credentials

uvicorn main:app --reload --port 8000

# In a separate terminal — render worker (needs Redis)
python render_worker.py
```

### Frontend

```bash
cd frontend

pnpm install

cp .env.example .env.local      # fill in your credentials

pnpm dev                         # → http://localhost:3000
```

### Minimum required env vars

| Variable | Where | Purpose |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | `fastapi/.env` | ADK agents + AI editor |
| `GOOGLE_CLOUD_PROJECT` | `fastapi/.env` | GCS + Firestore (`quickaishort-agent-494304`) |
| `GCS_BUCKET_NAME` | `fastapi/.env` | Media bucket (`quickaishort-agent-494304-media`) |
| `REDIS_URL` | `fastapi/.env` | Render job queue |
| `MONGODB_URI` | `fastapi/.env` | Job history, credits, user stats |
| `NEXTAUTH_SECRET` | both `.env` files | Must match exactly on frontend and backend |
| `NEXT_PUBLIC_API_URL` | `frontend/.env.local` | FastAPI base URL |

All optional vars (Pexels stock, Google TTS voiceover, Pusher realtime, SerpAPI trends) are documented in `fastapi/.env.example`.

---

## CI

Every pull request runs two gates before merge:

- **Lint + Type Check** — `black`, `flake8` (Python) and `tsc --noEmit` (TypeScript)
- **Build Gate** — `next build` must exit zero

No test suite currently. CI validates correctness via type safety and a full production build.

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
  <sub>Built for the <a href="https://ai.google.dev/">Google for Startups AI Agents Challenge 2026</a></sub>
</div>
