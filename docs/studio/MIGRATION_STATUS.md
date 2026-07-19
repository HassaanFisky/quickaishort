# Migration Status

**Last updated:** 2026-07-19 (execution cycle close)

## Project storage

| Layer | Collection / API | Role | Status |
|-------|------------------|------|--------|
| Legacy ADK | Firestore `Projects` / `/api/projects` | ADK wizard projects | Live — do not break |
| Studio Kernel | Firestore `studio_projects` / `/api/studio/v1` | Authoritative edit log | **Live (code)** — dual-run |
| Dual-run | Both | BE `STUDIO_PROJECT_KERNEL` + FE `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL` | Required until cutover |

## EP-001

Registry live; FE sync copy at `frontend/src/lib/generated/capabilities.v1.json`. Frozen.  
CI enforces BE↔FE SHA-256 match via `fastapi/scripts/check_registry_sync.py`.  
Verified untouched at cycle close.

## Cutover readiness (code)

- Pipeline JWT + fail-closed credits ✅  
- Editor chat → Kernel (`structured_steps`) when FE flag on ✅  
- Export `ensureStudioProject` + `project_id` / revision bind ✅  
- Flags documented in `.env.example` ✅  
- FE accepts canonical actions only (legacy translator removed) ✅  
- EP-008 ingest policy + onboarding prefs (`studio_user_prefs`) ✅  

## EP-008 migration notes

- No destructive migration.  
- Firestore collection `studio_user_prefs` created on first onboarding write.  
- Users with prior exports skip tour automatically.  

## Prod cutover still requires

1. Vercel: `NEXT_PUBLIC_STUDIO_PROJECT_KERNEL=1`  
2. Cloud Run: Kernel not forced off  
3. Soak under real traffic  
4. **Founder approval** before deleting legacy `Projects`

## Irreversible ops

No production Firestore/GCS deletes without explicit founder consent.
