# 29 — Cost & Open Source Policy

## Cost principles

1. Prefer client-side / heuristic work before Gemini.  
2. Cache analysis and viral scores in Redis.  
3. `execMode=direct` tools = 0 credits.  
4. One credit per LLM plan call (current).  
5. Flash-class models only unless measured quality gap.  
6. Worker concurrency low to avoid ffmpeg OOM cost spikes.  
7. No new paid SaaS without explicit founder approval.

---

## Current cost drivers (verified)

| Driver | Where |
|--------|-------|
| Gemini AI editor calls | `ai_editor_router` + engine |
| ADK Pre-Flight multi-persona | `preflight_agent` |
| Cloud Run CPU during render | worker |
| yt-dlp egress / proxies | acquisition |
| Pusher messages | realtime |
| Firestore reads/writes | stats/projects |

---

## OSS policy

### Allowed licenses

MIT · Apache 2.0 · BSD · ISC · Unlicense  

### Avoid

GPL · AGPL · SSPL (unless isolated and approved)  

### Already in stack (representative)

| Package | Role | License habit |
|---------|------|---------------|
| Next.js | FE | MIT |
| FastAPI | BE | MIT |
| google-adk / google-genai | Agents | Apache-2.0 class |
| yt-dlp | Ingest | Unlicense |
| redis-py / rq | Queue | MIT |
| zustand | State | MIT |
| ffmpeg-python | Render glue | Apache-2.0 (FFmpeg binary LGPL/GPL components — ship as system dep, not link proprietary disclosure the same way; keep binary in container) |

**Note:** FFmpeg itself has LGPL/GPL build variants. Continue using system FFmpeg in Cloud Run images as today; do not statically link GPL into proprietary wheels carelessly. Insufficient evidence of exact FFmpeg configure flags in Dockerfile — verify before legal claims.

### Recommendation rule for new repos

Every proposal must include: exact repo URL · license · last commit recency · fit · integration point · replacement risk.
