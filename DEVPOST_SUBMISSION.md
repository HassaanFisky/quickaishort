# Devpost Submission — QuickAI Short / Pre-Flight

Copy-paste these fields into the Devpost form.
All text is ready to use verbatim — edit only where marked [FILL].

---

## Project Name
QuickAI Short — Pre-Flight

---

## Tagline (max ~150 chars)
OpusClip shows you which clip. Pre-Flight shows you if it will work — before you post.

---

## Inspiration

Every creator has posted a clip that flopped. The hook felt strong. The edit was clean. But it still died in the algorithm.

The problem isn't bad editing software. It's that creators have no way to simulate how an audience will actually respond before publishing. They're flying blind.

I built Pre-Flight to solve that with a Google ADK multi-agent system: a parallel panel of six AI personas that stress-test each clip across demographics before it ever reaches a real viewer.

---

## What it does

QuickAI Short is a YouTube-to-viral-shorts SaaS platform with three integrated pipelines:

**1. Viral Clip Discovery**
Paste any YouTube URL. The system extracts audio, runs heuristic scoring (audio energy + speech density), and returns ranked clip candidates with viral scores, hooks, and reasoning — in under 60 seconds.

**2. Pre-Flight Audience Validation (ADK Multi-Agent)**
The core differentiator. Each clip candidate passes through:
- An asynchronous DAG: ClipCandidate validator → TrendGrounding agent (MongoDB Analytics) → AnalyticsGrounding agent
- A LoopAgent running a ParallelAgent of 6 personas: Gen-Z, Millennial, Sports fan, Tech enthusiast, Entertainment fan, News consumer
- An Aggregator → QualityGate → Refinement chain that produces a cross-demographic validation score and actionable notes

Built with Google ADK v1.0. Each persona runs as an independent LlmAgent on Gemini 2.5 Flash.

**3. ADK Studio**
A 4-step short-form video generator: Script (Gemini-generated) → Media (Pexels stock search) → Voice (Google TTS) → Render (ffmpeg-python via RQ worker on Cloud Run).

**Editor**
A browser-based clip editor with: timeline scrubber, caption overlay, Web Audio effects (boost, noise reduction), filter controls, conversational AI editor (Gemini), and server-side export via ffmpeg-python.

---

## How we built it

**Frontend:** Next.js 14.2.22, Tailwind v4, Framer Motion, Zustand, Whisper.wasm (in-browser transcription via Web Worker)

**Backend:** Python 3.12, FastAPI, yt-dlp, ffmpeg-python, Redis/RQ for async render jobs

**AI Layer:**
- Google ADK v1.0 — multi-agent orchestration
- Gemini 2.5 Flash — all LLM calls (viral scoring, persona simulation, script generation, conversational editor)
- Whisper base.en — in-browser audio transcription (no server round-trip)

**Infrastructure:** Cloud Run (API + render worker), Vercel (frontend), MongoDB Atlas (GridFS media storage), Pusher (real-time dashboard updates), Cloudflare DNS

---

## Challenges we ran into

- **yt-dlp bot detection:** YouTube's cookie-auth + bgutil sidecar was required. Built a full cookie-pass-through pipeline.
- **ADK cold-start timing:** google-adk + google-genai import takes 13s+. Startup probes had to be tuned (failureThreshold=20) and run_startup_checks() deferred to a background asyncio task.
- **Web Audio CORS:** Cross-origin video elements silently break MediaElementSource — required a volume-fallback path in the gain/filter chain.
- **Gemini chat history:** Google AI SDK requires chat history to start with a user turn. Leading model turns throw a silent error — required trim logic on the history array.
- **Browser FFmpeg:** FFmpeg.wasm loads from CDN; if blocked, the worker hangs silently. Added a 15s timeout that surfaces the error instead.

---

## Accomplishments that we're proud of

- A genuinely working multi-agent Pre-Flight pipeline with 6 live personas running in parallel on real Gemini calls
- End-to-end: YouTube URL → transcript → clip scoring → audience simulation → editor → export — all in one product
- Sub-60-second viral analysis with no mocked data anywhere in the demo
- Zero-error production build deployed at quickaishort.online with real traffic

---

## What we learned

- ADK LoopAgent + ParallelAgent composition is extremely powerful but requires careful session state management (Firestore session service, not in-memory, for cross-agent state)
- MongoDB as a grounding data source for ADK agents works well — query results are passed as structured context
- Google Gemini 2.5 Flash's JSON mode (`responseMimeType: "application/json"`) is reliable enough to use as a structured-output compiler for editor action arrays

---

## What's next for QuickAI Short

- A/B clip testing: upload two cuts, Pre-Flight scores both, recommends the stronger one
- Scheduled publishing integration: validate → score → post to TikTok/Reels/YouTube Shorts in one flow
- Creator analytics loop: compare Pre-Flight predicted scores against actual view/retention data to tune the persona models over time
- Subscription tier with credit-based Pre-Flight runs

---

## Built With

google-adk, gemini-2.5-flash, nextjs, fastapi, python, yt-dlp, ffmpeg, whisper, redis, mongodb, mongodb, vercel, google-cloud-run, tailwindcss, framer-motion, zustand, pusher

---

## Try It Out

- Live app: https://www.quickaishort.online
- GitHub: https://github.com/HassaanFisky/quickaishort

---

## Team

Hassaan Fisky — Solo founder, full-stack engineer
Karachi, Pakistan | amnafaraz89@gmail.com

---

## Category / Track

Google for Startups AI Agents Challenge 2026
Startup stage: Pre-seed

---

## Notes for form fields

- "Does your project use Google AI products?" → YES: Google ADK v1.0, Gemini 2.5 Flash, Google Cloud Run, Google TTS (optional)
- "GitHub repository" → https://github.com/HassaanFisky/quickaishort
- "Demo URL" → https://www.quickaishort.online
- "Demo video" → [FILL: YouTube/Vimeo link after recording]
- "Project stage" → Pre-seed / MVP deployed

---

## Checklist before submitting

- [ ] Demo video uploaded and link added above
- [ ] All screenshots added (editor view, Pre-Flight panel, ADK Studio, clip list)
- [ ] GitHub repo is public with MIT LICENSE
- [ ] quickaishort.online is live and responsive
- [ ] Google for Startups form submitted separately
