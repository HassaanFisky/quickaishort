# QuickAIShort.online — Pre-Flight

> **"OpusClip shows you which clip. Pre-Flight shows you if it will work."**

The only multi-agent AI system that simulates how a short-form video clip will perform — across audiences, languages, and platforms — **before** you publish.

Every competitor produces clips blind. Pre-Flight answers the one question every creator has after hitting export: *Will this one actually hit?*

Built for the **Google for Startups AI Agents Challenge 2026**.

---

## What It Does

1. Paste a YouTube URL
2. System generates top clip candidates using **multimodal vision (Gemini 2.5 Flash)** + audio energy + speech density analysis
3. **Pre-Flight runs a simulated audience panel** — 6 Gemini 2.5 Flash persona agents fire in parallel, each voting on retention, drop-off, and share likelihood
4. A **LoopAgent** iteratively refines the clip until consensus score exceeds 65%
5. **Supabase MCP** grounds predictions against the creator's own historical preflight data
6. Result: **PUBLISH** or **REFINE FIRST** — with full reasoning traces

---

## Architecture

RootAgent (SequentialAgent)

- **ClipCandidateAgent** — yt-dlp + Whisper + audio scoring
- **TrendGroundingAgent** — Google Trends API + SerpApi
- **AnalyticsGroundingAgent** — YouTube Analytics API v2
- **SupabaseMCPAgent** — historical preflight data via Supabase MCPToolset
- **AudiencePanelLoop** (LoopAgent, max 3 iterations)

6 PersonaAgents fire in parallel (Gemini 2.5 Flash)

- Gen Z Creator
- Millennial Professional
- Sports Fan
- Tech Enthusiast
- Entertainment Fan
- News & Current Affairs

System Components

- **VoteAggregatorAgent** — Python consensus synthesis
- **QualityGateAgent** — escalate if score >= 65
- **ClipRefinementAgent** — re-cut based on drop-off points

ADK primitives used: `SequentialAgent`, `ParallelAgent`, `LoopAgent`, `BaseAgent`, `MCPToolset`

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| Frontend | Next.js 14.2.22, Tailwind v4, Framer Motion, Zustand |
| Backend | FastAPI, Python 3.12, yt-dlp, FFmpeg, MoviePy |
| AI Agents | Google ADK 1.0.0, Gemini 2.5 Flash |
| MCP | Supabase MCP (`@supabase/mcp-server-supabase`) via ADK MCPToolset |
| Infrastructure | Redis (RQ), Pusher (WebSockets), MongoDB Atlas |
| Data | YouTube Analytics API v2, Supabase (historical preflight data) |
| Trends | SerpApi (Google Trends engine) |
| Deploy | Vercel (frontend), Google Cloud Run (backend) |

---

## Business Model

| Tier | Features | Price |
| :--- | :--- | :--- |
| Free | Manual editing, 3 exports, watermark | $0 |
| Pro | Pre-Flight (4-persona parallel panel), Supabase MCP grounding, no watermark | $12/mo |

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
cp frontend/.env.example .env.local   # Set NEXT_PUBLIC_API_URL
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
