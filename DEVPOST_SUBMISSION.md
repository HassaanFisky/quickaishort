# Devpost Submission — QuickAI Short

Copy-paste these fields into the Devpost form.
Edit only where marked [FILL].

**Product framing:** QuickAI Short = production conversational AI editor. QuickAI Studio = OS evolution on the same codebase (Kernel shipped; ADK UI Coming Soon — do not claim as live wizard).

---

## Project Name
QuickAI Short

---

## Tagline (max ~150 chars)
Conversational AI video editing — paste a URL, chat the edit, preview, export. Pre-Flight validates before you post.

---

## Inspiration

Creators waste hours cutting shorts and still guess whether a clip will land. Legacy tools either dump one-click clips with no creative control, or bury creators in NLE complexity.

I built QuickAI Short so conversation becomes the editing workflow: the AI performs real edits; the creator directs intent. Pre-Flight (Google ADK multi-agent audience simulation) is an optional validation skill — not the whole product identity.

---

## What it does

**QuickAI Short** transforms long-form video into short-form content using conversational AI.

- Paste a YouTube URL or upload a local video  
- Chat with the AI editor; get MediaGraph-grounded suggestions  
- Customize edits in natural language; preview on a live timeline  
- Export finished videos via server-side ffmpeg (RQ → GCS)  

**Pre-Flight (ADK multi-agent skill):** Six demographic personas + grounding agents produce a consensus recommendation before publish.

**QuickAI Studio (evolution):** Capability Registry, Project Document Kernel, MediaGraph, Orchestrator, and chat-primary shell already dual-run under flags. The ADK workspace UI is **Coming Soon** (intentionally blurred) — not marketed as a live creator wizard.

---

## How we built it

**Frontend:** Next.js 14.2.35, Tailwind v4, Framer Motion, Zustand, Whisper.wasm (browser Web Worker)

**Backend:** Python 3.12, FastAPI, yt-dlp, ffmpeg-python, Redis/RQ

**AI:**
- Gemini 2.5 Flash — conversational editor + agents  
- Google ADK — Pre-Flight Sequential/Parallel/Loop topology  
- Capability Registry ABI (EP-001, frozen) for edit tools  

**Infrastructure:** Cloud Run (API + worker), Vercel, GCS primary media, MongoDB, Firestore sessions, Pusher, Cloudflare DNS

---

## Challenges we ran into

- yt-dlp bot detection → cookie / PoToken tiered acquisition  
- ADK cold-start import time → tuned Cloud Run startup probes  
- Web Audio CORS → volume fallback on gain chain  
- Gemini chat history turn order requirements  
- Browser FFmpeg CDN hangs → 15s timeout path  
- Honest doc/architecture sync: GCS primary (not GridFS-for-all); ADK UI Coming Soon  

---

## Accomplishments

- Production conversational editor with structured edit actions  
- Pre-Flight multi-agent validation on real Gemini calls  
- Studio Kernel substrate (EP-001…008) without a rewrite  
- End-to-end: ingest → chat edits → preview → export  

---

## What we learned

- Product identity must stay honest: shipped vs roadmap  
- Capability Registry as ABI prevents tool drift  
- Cost and reliability are co-equal with UX for Cloud Run + Gemini  

---

## What's next

- Deeper native Gemini tool-loop (ADR-006)  
- Richer MediaGraph analysis  
- ADK workspace release when ready  
- Demo video + challenge form completion after Gemini credits top-up  

---

## Built with

Next.js · FastAPI · Gemini 2.5 Flash · Google ADK · Redis/RQ · ffmpeg · GCS · Whisper.wasm · Zustand · Tailwind · Vercel · Cloud Run

---

## Try it

https://www.quickaishort.online

---

## Screenshots checklist

- [ ] Editor + AI chat panel  
- [ ] Suggestion chips / MediaGraph moment  
- [ ] Pre-Flight persona panel (if shown in demo)  
- [ ] Export / download success  
- [ ] Do **not** present `/adk` Coming Soon blur as a finished studio wizard  

[FILL] remaining Devpost fields as needed.
