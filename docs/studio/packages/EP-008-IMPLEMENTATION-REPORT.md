# EP-008 Implementation Report

**Date:** 2026-07-20  
**Status:** IMPLEMENTED — pending freeze after verification  
**ADR:** ADR-013  
**Approval:** `APPROVE EP-008 FINAL`

## Summary

Shipped Editor First-Run Product Surface: backend-authoritative Media Ingest Policy, equal Upload/URL IngestSurface, upload progress/cancel/retry/replace, clipboard paste (best-effort), lazy interactive onboarding tour, Ads Coming Soon nav+page, empty-state copy updates. EP-001 / Kernel / MediaGraph suggestion architecture untouched.

## Files (primary)

### Backend
- `fastapi/services/media_ingest_policy.py` (new)
- `fastapi/services/studio_onboarding.py` (new)
- `fastapi/routers/studio_ingest_router.py` (new)
- `fastapi/main.py` — router include + presigned validation harden
- `fastapi/tests/test_media_ingest_policy.py` (new)

### Frontend
- `frontend/src/lib/studio/ingestPolicy.ts` (new)
- `frontend/src/lib/studio/onboarding.ts` (new)
- `frontend/src/components/editor/IngestSurface.tsx` (new)
- `frontend/src/components/editor/EditorOnboardingTour.tsx` (new)
- `frontend/src/components/shared/ComingSoonGate.tsx` (new)
- `frontend/src/app/(dashboard)/ads/page.tsx` (new)
- `frontend/src/components/editor/EditorLayout.tsx`
- `frontend/src/components/editor/AIPanel.tsx`
- `frontend/src/components/editor/BottomDock.tsx`
- `frontend/src/components/editor/VideoCanvas.tsx`
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/components/layout/BottomTabBar.tsx`
- `frontend/src/app/(dashboard)/settings/page.tsx` — Replay tour
- `frontend/src/middleware.ts` — protect `/ads`
- `frontend/src/hooks/useMediaPipeline.ts` — skip duplicate GCS if path set
- `frontend/src/lib/api.ts` — AbortSignal on GCS PUT

## API

| Method | Path |
|--------|------|
| GET | `/api/studio/v1/ingest/policy` |
| GET | `/api/studio/v1/me/onboarding` |
| PUT | `/api/studio/v1/me/onboarding` |
| POST | `/api/video/presigned-url` (hardened) |

## Migration notes

- No DB schema migration required.
- Onboarding stored in Firestore `studio_user_prefs/{userId}` (in-memory fallback for tests).
- Users with `export_count > 0` auto-complete onboarding (never interrupted).
- FE caches ingest policy in `sessionStorage` (1h TTL).

## Verification

| Check | Result |
|-------|--------|
| `pytest tests/test_media_ingest_policy.py` | 5 passed |
| `npx tsc --noEmit` | exit 0 |
| EP-001 registry files | unmodified |
| Suggestions | MediaGraph-only (unchanged) |

## Production readiness checklist

- [x] Upload ≡ URL discoverable  
- [x] Policy backend-authoritative  
- [x] Progress / cancel / retry / replace  
- [x] Clipboard best-effort  
- [x] Onboarding lazy + once + Settings replay  
- [x] Ads Coming Soon (blurred, non-interactive)  
- [x] Auth middleware includes `/ads`  
- [x] Tour/Ads lazy-loaded  
- [ ] Staging smoke: real file upload + tour + Ads nav (founder)  
- [ ] Confirm Cloud Run has Firestore access for `studio_user_prefs`  

## Architectural impact

None on EP-001 ABI, Kernel events, or MediaGraph derivation. Ingest Policy is a separate platform config surface (ADR-013).
