# QuickAIShort.online — Pre-Flight

> **"OpusClip shows you which clip. Pre-Flight shows you if it will work."**

The only multi-agent AI system that simulates how a short-form video clip will perform — across audiences, languages, and platforms — **before** you publish.

Every competitor produces clips blind. Pre-Flight answers the one question every creator has after hitting export: *Will this one actually hit?*

Built for the **Google for Startups AI Agents Challenge 2026**.

---

## What It Does

1. Paste a YouTube URL
2. System generates top clip candidates using **multimodal vision (Gemini 2.5 Flash)** + audio energy + speech density analysis
3. **Pre-Flight runs a simulated audience panel** — 6 Gemini 2.5 Flash persona agents vote simultaneously on retention, drop-off, and share likelihood
4. A **Parallel-Async LoopAgent** iteratively refines the clip until consensus score exceeds 65%
5. BigQuery MCP grounds predictions in the creator's own channel history
6. Result: **PUBLISH** or **REFINE FIRST** — with full reasoning traces

---

## Architecture

RootAgent (SequentialAgent)

- **ClipCandidateAgent** — yt-dlp + Whisper + audio scoring
- **TrendGroundingAgent** — Google Trends API + SerpApi
- **AnalyticsGroundingAgent** — YouTube Analytics API + BigQuery MCP
- **AudiencePanelLoop** (LoopAgent, max 3 iterations)

6 PersonaAgents (Gemini 2.5 Flash)

- GenZ Creator
- Millennial Professional
- Sports Fan
- Tech Enthusiast
- Arabic Speaker
- Spanish Speaker

System Components

- **VoteAggregatorAgent** — Python consensus synthesis
- **QualityGateAgent** — escalate if score >= 65
- **ClipRefinementAgent** — re-cut based on drop-off points

ADK primitives used: `SequentialAgent`, `ParallelAgent`, `LoopAgent`, `FunctionTool`

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| Frontend | Next.js 16, Tailwind v4, Framer Motion, Zustand |
| Backend | FastAPI, Python 3.12, yt-dlp, FFmpeg, MoviePy |
| AI Agents | Google ADK 1.0.0, Gemini 2.5 Flash |
| Infrastructure | Redis (RQ), Pusher (WebSockets), MongoDB Atlas |
| Data | BigQuery, YouTube Analytics API v2 |
| Trends | SerpApi (Google Trends engine) |
| Deploy | Vercel (frontend), Cloud Native (backend) |

---

## Business Model

| Tier | Features | Price |
| :--- | :--- | :--- |
| Free | Manual editing, 3 exports, watermark | $0 |
| Pro | Pre-Flight (6 personas), BigQuery grounding, no watermark | $29–99/mo |

**Market:** $117B creator economy, $59B short-form video market (2026)

---

## Local Setup

### Backend

```bash
cd fastapi
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env         # Fill in your keys
uvicorn main:app --reload
```

### Frontend

```bash
npm install
cp .env.local.example .env.local   # Set NEXT_PUBLIC_API_URL
npm run dev
```

### Environment Variables

See `fastapi/.env.example` for required keys.

---

## API

POST `/api/preflight`

```json
{
  "youtube_url": "string",
  "user_id": "string",
  "is_premium": boolean,
  "clip_candidates": [
    {
      "start_sec": float,
      "end_sec": float,
      "score": float,
      "transcript": "string"
    }
  ]
}
```

Returns full Pre-Flight result including persona votes, consensus score, refinement trace, and publish recommendation.

---

## License

MIT — see [LICENSE](LICENSE)

---

## Hackathon

Submitted to the **Google for Startups AI Agents Challenge 2026** — Track 1: Net-New Agents.
