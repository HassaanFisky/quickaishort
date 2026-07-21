# PRODUCTION_STATUS — Historical Snapshot

> **Note (2026-07-21):** This file is a **point-in-time deploy log** from 2026-05-24.  
> For current product identity and architecture, use [`README.md`](README.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), and [`docs/studio/CANONICAL_PROJECT_MEMORY.md`](docs/studio/CANONICAL_PROJECT_MEMORY.md).  
> Media truth: **GCS primary**; GridFS = legacy `/api/v1/video/*` only. Auth: NextAuth JWT (`services/auth.py`).

---

# PRODUCTION STATUS — 2026-05-24

## Deployment Summary

**Timestamp:** 2026-05-24T04:30Z  
**Commit:** `209f8ab` (fix: restore celery==5.4.0)  
**Builds:** 3 × SUCCESS (quickai-api, quickai-worker, quickaishort-backend)  

---

## google-adk Version Change

| Before | After |
|--------|-------|
| `google-adk==1.0.0` | `google-adk[bigquery]>=2.1.0` (installed: 2.1.0) |

---

## Cloud Build Trigger Status

| Build | Image | Status | Duration |
|-------|-------|--------|----------|
| `602b1145` | `quickai-api:209f8ab` | SUCCESS | 3m55s |
| `671fe3b3` | `quickai-worker:209f8ab` | SUCCESS | 4m2s |
| `afbfcc71` | `quickaishort-backend:209f8ab` | SUCCESS | 4m1s |

Previous failed builds (now superseded):

| Build | Commit | Failure reason |
|-------|--------|---------------|
| `694cb20d`–`0825c504` | `4f9ce34` | `ModuleNotFoundError: No module named 'motor'` |
| `ab41c755`–`3f5365bb` | `b1a8fbe` | `ModuleNotFoundError: No module named 'celery'` |

---

## Endpoint Test Results (post-deploy)

| # | Endpoint | Status | Response |
|---|----------|--------|----------|
| 1 | `GET /health` | **PASS** | `{status:ok, mongo:true, redis:true, adk:true, firestore_status:connected}` |
| 2 | `GET /api/admin/cookies/status` | **PASS** | `{valid:true, source:env_var}` |
| 3 | `GET /api/admin/pipeline/health` | **PASS** | `{total_runs:0, hours:24}` |
| 4 | `GET /api/render/dlq/stats` | **PASS** | `{dead_count:0}` |
| 5 | `GET /api/admin/analytics/latency` | **PASS** | `{latency:[], source:firestore}` |
| 6 | `GET /api/admin/analytics/errors` | **PASS** | `{errors:[], source:firestore}` |

---

## Issues Encountered and Fixes

### 1. motor/pymongo removed prematurely
- **Root cause:** Dependencies removed while `services/storage.py` still imports `motor` for **legacy** GridFS (`/api/v1/video/*`).
- **Fix:** Restored `motor==3.5.0` and `pymongo==4.8.0` in `requirements.txt`.
- **Commit:** `b1a8fbe`

### 2. celery removed prematurely
- **Root cause:** `workers/__init__.py` re-exports Celery app used by legacy video router.
- **Fix:** Restored `celery==5.4.0` in `requirements.txt`.
- **Commit:** `209f8ab`

### 3. BigQueryAgentAnalyticsPlugin missing dependency
- **Root cause:** `google-adk[bigquery]` extra does not pull `google-cloud-bigquery` directly.
- **Fix:** Added `google-cloud-bigquery>=3.25.0` explicitly to requirements.txt.
- **Status:** BQ plugin loads; dataset may remain empty until pipeline traffic.

### 4. Firestore database created
- **Action:** Created `(default)` Firestore Native database in `us-central1` for project `quickaishort-agent-494304`.

### 5. Firestore IAM propagation delay
- **Symptom:** Transient `403` after IAM grant.
- **Resolution:** Self-resolved after ~3 minutes.

---

## Known Issues (Non-Critical)

See live WORKING MEMORY in [`CLAUDE.md`](CLAUDE.md) for current blockers (e.g. Gemini prepayment credits). Historical rows below are frozen as of 2026-05-24.
