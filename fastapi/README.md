# FastAPI — QuickAI Short Backend

Python 3.12 API for **QuickAI Short** (production) and **QuickAI Studio** Kernel surfaces (same service, feature-flagged).

Canonical architecture: [`../docs/studio/`](../docs/studio/README.md) · [`../ARCHITECTURE.md`](../ARCHITECTURE.md)

---

## What this service does

- YouTube / upload ingest helpers  
- Gemini conversational AI editor + Capability Registry (EP-001)  
- Studio Kernel APIs (`/api/studio/v1/*`) when flags enabled  
- Pre-Flight / viral / director agents (Google ADK + Gemini)  
- RQ enqueue for server-side ffmpeg export → **GCS**  
- NextAuth JWT verification (`services/auth.py`)  

**Not current truth:** Firebase Auth as backend auth · GridFS as primary media · Redis/RQ removed · Cloud Run Jobs replacing RQ.

---

## Architecture (verified)

| Concern | Choice |
|---------|--------|
| Auth | NextAuth HS256 JWT |
| Media | GCS primary; GridFS legacy `/api/v1/video/*` |
| Queue | Redis + RQ (`render_worker.py`) |
| AI | Gemini 2.5 Flash; ADK for Pre-Flight topology |
| Sessions | Firestore with in-memory fallback |
| Realtime | Pusher + WebSocket fallback |

---

## Local run

```bash
python -m venv venv
# Windows: .\venv\Scripts\activate
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill secrets
uvicorn main:app --reload --port 8000
```

Worker:

```bash
python render_worker.py
```

Use the project venv for all `pip` installs. Freeze to `requirements.txt` after dependency changes.

---

## Health

- `GET /health` — API + dependency flags  
- Worker: `GET /health/ready` on worker service  

---

## Related packages

- `capabilities/` — EP-001 registry ABI (frozen)  
- `agent/` — ADK Pre-Flight and related agents  
- `routers/` — HTTP surface including Studio Kernel  
