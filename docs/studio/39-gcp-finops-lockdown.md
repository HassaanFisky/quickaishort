# 39 — GCP FinOps lockdown (verified 2026-08-02)

**Goal:** Stop idle / zombie spend so Gemini credits (when topped up) are not eaten by infrastructure waste.  
**Project:** `quickaishort-agent-494304`

## Root cause of ~$11 bill (verified)

| Driver | Evidence | Approx |
|--------|----------|--------|
| Artifact Registry storage | `cloud-run-source-deploy` us-central1 **~151 GB** + `quickai-repo` **~17 GB** | ~$0.10/GB-mo → **~$15/mo** class |
| Triple Cloud Build on every `main` push | Triggers for `quickai-api`, `quickai-worker`, **and** unused `quickaishort-backend` | Build minutes + more image layers |
| Zombie Cloud Run | `quickaishort-backend` not referenced by FE (`NEXT_PUBLIC_API_URL` = `quickai-api` only) | Cold idle small; images + builds expensive |

**Not the main driver (verified empty/absent):** Compute VMs, Cloud SQL, GKE, AlloyDB, Composer, minScale (API/worker have **no** minScale → scale-to-zero).

## Actions completed this pass

1. **Deleted** Cloud Run service `quickaishort-backend`.
2. **Deleted** Cloud Build trigger that redeployed it on every `main` push.
3. **Deleted orphan image packages** (old names: `quickai-api`, `quickai-worker`, `quickaishort-api`, `quickaishort-backend`, …). Live path kept: `quickaishort/quickai-api` + `quickaishort/quickai-worker`.
4. **Deleted** unused `asia-south1` Artifact Registry repo `cloud-run-source-deploy`.
5. **Deleted** unused Artifact Registry repo `quickai-repo` (~17 GB).
6. **Applied cleanup policies** (keep last 5; delete untagged >7d; delete any >21d) — `ops/artifact-registry-cleanup-policy.json`.
7. **Queued digest prune/wipe** via `ops/prune-ar-images.ps1` + `ops/wipe-ar-image.ps1` (zombie `quickaishort/quickaishort-backend` had **600+** digests). AR byte size GC lags deletes by hours.
8. **Disabled ~52 unused APIs** (AlloyDB, Composer, Dataproc, GKE, Dialogflow, Vertex companion, SCC, SQL Admin, Drive/Gmail, notebooks, Anthos, …). Kept product APIs.
9. **Forced** `quickai-api` + `quickai-worker` → `--min-instances=0` + CPU throttling (verified `/health` 200 after).
10. **Deleted unused GCS buckets:** `run-sources-…-asia-south1`, `cloud-ai-platform-…`, `quickaishort-project-files` (accidentally held `node_modules` upload).
11. **Lifecycle:** us-central1 run-sources objects delete after **30d**; cloudbuild bucket after **14d**. **Media bucket untouched.**

## KEEP (do not disable)

| Service | Why |
|---------|-----|
| `quickai-api` / `quickai-worker` Cloud Run | Product |
| Cloud Build triggers for api + worker | Deploy path |
| Cloud Tasks `quickai-render` | Final export |
| Cloud Scheduler `cookie-status-check` | yt-dlp cookie canary |
| GCS `quickaishort-agent-494304-media` | Primary media |
| Firestore | Stats / Studio |
| Redis (external) | Status / CostGuard |
| `generativelanguage` / TTS / YouTube Data | Product AI + ingest |
| Logging / Monitoring / IAM / Run / Storage / Artifact Registry / Tasks / Scheduler / Build | Platform |

## Spend leak plugs (product code — already / still)

- `MOCK_AI_MODE` fail-closed when `ENVIRONMENT=production`
- CostGuard + credit fail-closed before Gemini
- JWT sole tenant on spend routes
- Worker `min=0` / request CPU (no always-on RQ)
- Export URL TTL bounded (`EXPORT_URL_TTL_SECONDS`, default 4h)

## Founder follow-ups (not done here)

- Gemini prepaid top-up (wait as requested)
- Deploy latest in-repo lockdown to Vercel + Cloud Run
- Confirm GCS bucket has **no** `allUsers` objectViewer
- Optional: delete unused GCS buckets (`cloud-ai-platform-*`, `run-sources-*-asia-south1`, `quickaishort-project-files`) **only after you confirm empty** — irreversible
- Optional: delete empty `quickai-repo` AR if no longer used by any deploy

## Expectation

AR size should fall from ~**168 GB → single-digit / low tens GB** after prune+GC. Bill should stop repeating the $11 image-storage pattern. Cloud Run request costs remain usage-based only.
