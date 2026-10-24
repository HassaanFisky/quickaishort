<div align="center">

<br />
<img src="public/qs-logo.png" alt="QuickAI Short" width="320" />
<br /> <br />
### Conversational AI video editing â€” from long-form to finished short.

<br />

[![Live](https://img.shields.io/badge/quickaishort.online-live-6366f1?style=flat-square&logo=vercel&logoColor=white)](https://www.quickaishort.online)
&nbsp;
[![Build](https://img.shields.io/github/actions/workflow/status/HassaanFisky/quickaishort/linter.yml?style=flat-square&label=build)](https://github.com/HassaanFisky/quickaishort/actions/workflows/linter.yml)
&nbsp;
[![Gemini](https://img.shields.io/badge/Gemini%202.5%20Flash-8B5CF6?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)
&nbsp;
[![Google%20ADK](https://img.shields.io/badge/Google%20ADK-roadmap-4285F4?style=flat-square&logo=google&logoColor=white)](https://google.github.io/adk-docs/)
&nbsp;
[![MIT](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)

<br />

**[Live product](https://www.quickaishort.online)** آ· **[Studio docs](docs/studio/README.md)** آ· **[Architecture](ARCHITECTURE.md)** آ· **[Vision](VISION.md)** آ· **[Contributing](CONTRIBUTING.md)**

<br />

</div>

---

## QuickAI Studio -- Windows Local-First Quickstart

QuickAI Studio can be executed completely locally on Windows with **zero Docker, zero MongoDB, zero Redis daemons, and ## What it is API spend** using the built-in `LOCAL_FIRST_MODE`.

### 1. Start the FastAPI Backend (PowerShell)
```powershell
Set-Location "E:\QuickAI Short orignal\fastapi"
$env:LOCAL_FIRST_MODE = "1"
$env:MOCK_AI_MODE = "1"

# Activate Python environment and start server
.\venv\Scripts\Activate.ps1
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
* Backend runs on `http://127.0.0.1:8000`.
* Embedded SQLite database initializes in `.quickai_studio/data/quickai_studio.db`.
* Local media storage saves in `.quickai_studio/storage/` (uploads and exports).
* In-memory cache handles jobs without requiring Redis.

### 2. Start the Next.js Frontend (PowerShell)
```powershell
Set-Location "E:\QuickAI Short orignal\frontend"
pnpm dev
```
* Open your browser at `http://localhost:3000`.
* Local session authentication (`local_studio_user`) is automatically engaged without external OAuth/MongoDB blockers.

### 3. Native FFmpeg & Local AI (Optional Setup)
* **Install Native FFmpeg on Windows PATH:**
  ```powershell
  winget install Gyan.FFmpeg
  ```
  *(Enables native video encoding and audio extraction; if missing, deterministic fallback processing automatically kicks in).*
* **Optional Local Open-Source AI (Ollama / llama.cpp):**
  If you have [Ollama](https://ollama.com) running on `http://127.0.0.1:11434`, QuickAI Studio auto-detects it via ultra-fast health probes (<300ms) and uses it for local LLM planning with zero external API calls.

---

## What it is

**QuickAI Short** turns long-form video into short-form content using conversational AI.

You paste a YouTube URL or upload a local file. You chat with the AI editor. You get intelligent edit suggestions, refine them in natural language, preview the result, and export.

The AI performs the editing. You direct the creativity. The conversation is the workflow.

This is not â€œjust another AI clipper.â€‌ It is a production editor where language drives real edit operations â€” trim, captions, pacing, reframing, audio, and more â€” applied to a live timeline and exported through a server render pipeline.

---

## Who it helps

Creators, podcasters, educators, and teams who need to move from long source media to publish-ready shorts without spending hours in a traditional NLE.

---

## Product identity

| Name | Role |
|------|------|
| **QuickAI Short** | Production product today â€” conversational editor, ingest, preview, export |
| **QuickAI Studio** | Evolution of QuickAI Short into an AI-native video editing operating system |

They are one product lineage â€” not separate products. Studio Kernel work (Capability Registry, Project Document, MediaGraph, Orchestrator, chat-primary shell) already ships under feature flags; deeper ADK-powered orchestration remains the roadmap.

Canonical product and architecture truth: [`docs/studio/`](docs/studio/README.md) آ· [`PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md`](docs/studio/PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md) آ· [`CANONICAL_PROJECT_MEMORY.md`](docs/studio/CANONICAL_PROJECT_MEMORY.md)

---

## How it works

```text
YouTube URL or local upload
        â†“
Ingest + transcription (browser Whisper) + optional analysis
        â†“
Conversational AI editor
  â€¢ Deterministic director path (dead-air / shorts packaging / restore opening)
    â†’ Decision Intelligence â†’ real capabilities â†’ preview + Kernel receipt
    â†’ 0 Gemini, 0 credits
  â€¢ Other chat â†’ Gemini DualModelRouter â†’ structured edit actions (credits)
        â†“
Client NLE preview (Zustand timeline) + MediaGraph suggestions
        â†“
Export â†’ Cloud Tasks â†’ private request-bound Cloud Run renderer â†’ ffmpeg â†’ GCS signed download
```

**Optional capability â€” Pre-Flight:** Google ADK multi-agent audience simulation (six personas, trend/analytics grounding, consensus score). Available as a validation skill â€” not the productâ€™s sole identity.

**ADK workspace UI (`/adk`):** Coming Soon â€” intentionally blurred and not available until release. Do not treat it as a live creator wizard.

---

## Current capabilities (production)

- Paste YouTube URL or upload local video
- In-browser Whisper transcription (Web Worker)
- Conversational AI editor with natural-language commands
- MediaGraph-grounded suggestion chips (not hardcoded heuristic lists)
- Live preview with Web Audio chain (noise reduction + boost)
- Multi-track timeline visualization
- Server-side export via Cloud Tasks + ffmpeg-python â†’ GCS (RQ = local/dev fallback only)
- Cancel, runId isolation, render DLQ, and status observability
- Studio Kernel APIs (project document, orchestrator, media graphs) behind flags
- Staged ingest FSM (`identify â†’ â€¦ â†’ ready|failed`) as sole editor ingest path
- NextAuth JWT auth on protected backend routes

---

## Future direction (QuickAI Studio)

QuickAI Studio evolves QuickAI Short into an AI-native editing OS:

- The AI understands media
- The AI plans edits
- The AI orchestrates tools (Capability Registry ABI â€” EP-001, frozen)
- The AI performs editing through real tools
- The user guides intent
- The timeline becomes visualization â€” not the primary control surface

Deeper Google ADK orchestration, native Gemini tool-loop depth, and the ADK workspace UI are roadmap â€” not claimed as fully shipped product surfaces.

---

## Architecture (summary)

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 14.2.35 آ· App Router آ· TypeScript آ· Zustand آ· Tailwind v4 |
| Backend | Python 3.12 آ· FastAPI آ· Pydantic v2 |
| AI | Gemini 2.5 Flash آ· Google ADK for Pre-Flight agents آ· Studio Kernel orchestration |
| Queue | Cloud Tasks (`quickai-render`) â†’ private `quickai-worker` (`min=0`); Redis status/locks; RQ local fallback |
| Media storage | **GCS** primary (`quickaishort-agent-494304-media`); MongoDB GridFS = legacy `/api/v1/video/*` only |
| Data | Firestore (UserStats / credits / Studio Kernel) آ· MongoDB (export history + legacy GridFS) |
| Auth | NextAuth HS256 JWT â†” FastAPI `auth.py` |
| Deploy | Vercel (frontend) آ· Cloud Run (`quickai-api` + `quickai-worker`) |

Frozen contracts: EP-001 Capability Registry ABI آ· ADR-002 GCS آ· ADR-007 Registry آ· ADR-008 Project Document آ· ADR-009 MediaGraph suggestions آ· ADR-013 ADK Coming Soon.

---

## Cost-efficient engineering

Operational cost is a first-class acceptance criterion. Prefer event-driven / scale-to-zero where safe; deduplicate AI calls, uploads, and renders; avoid polling when streams/webhooks work; bound every expensive operation with timeout, attribution, and cancellation.

Policy: [`.cursor/rules/cost-efficient-architecture.mdc`](.cursor/rules/cost-efficient-architecture.mdc) آ· [`docs/studio/29-cost-and-oss-policy.md`](docs/studio/29-cost-and-oss-policy.md)

---

## Repository structure

```text
quickaishort/
â”œâ”€â”€ frontend/                 # Next.js app â€” editor, dashboard, AI panel
â”œâ”€â”€ fastapi/                  # API, agents, Studio Kernel, render worker
â”‚   â”œâ”€â”€ agent/                # Pre-Flight / viral / director (ADK)
â”‚   â”œâ”€â”€ capabilities/         # EP-001 registry ABI (frozen)
â”‚   â””â”€â”€ render_worker.py
â”œâ”€â”€ docs/studio/              # Canonical architecture + ADRs + EPs
â”œâ”€â”€ extension/                # Chrome MV3 â€” YouTube â†’ editor
â”œâ”€â”€ ARCHITECTURE.md           # System overview
â”œâ”€â”€ VISION.md                 # Product + Studio evolution
â””â”€â”€ CLAUDE.md                 # Agent protocol + live working memory
```

---

## Development

Frontend (`frontend/`):

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # must pass with zero TS errors
```

Backend (`fastapi/`):

```bash
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
python render_worker.py                           # requires Redis
```

Env templates: `frontend/.env.example`, `fastapi/.env.example`.  
Contributor guide: [`CONTRIBUTING.md`](CONTRIBUTING.md).  
Detailed quickstart: [`QUICKSTART.md`](QUICKSTART.md).

---

## Roadmap (high level)

| Horizon | Focus |
|---------|--------|
| **Now** | Production QuickAI Short â€” conversational editor, Kernel dual-run, reliable export |
| **Next** | Deeper native tool-loop (ADR-006), richer MediaGraph analysis, ADK workspace release when ready |
| **Later** | Multiplayer (founder-gated), legacy path cutover, broader social syndication |

Executable roadmap: [`docs/studio/ROADMAP.md`](docs/studio/ROADMAP.md)

---

## License

[MIT](LICENSE) â€” responsible disclosure in [`SECURITY.md`](SECURITY.md).

---

<div align="center">
<sub>
Built with Gemini آ· Designed to deepen with Google ADK آ· <a href="https://www.quickaishort.online">quickaishort.online</a>
</sub>
</div>
