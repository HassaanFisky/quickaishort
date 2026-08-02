# 34 — User deletion cascade (design only)

**Status:** Checklist + design tests — **NO live wipe without founder consent**  
**Date:** 2026-08-02

## Stores to clear (owner-scoped)

| Store | Keys / paths | Method | Risk |
|-------|--------------|--------|------|
| Firestore | `UserStats/{uid}`, projects under uid | Document delete | Credits/history gone |
| GCS | `uploads/{uid}/`, `exports/{uid}/`, `adk_uploads/{uid}/` | Prefix delete **after approval** | Irreversible media loss |
| Redis | `stats:{uid}`, `premium:{uid}`, render meta by job, PlanStore by owner, dub fingerprints | Key scan/delete | Ephemeral OK |
| Mongo | export history / legacy GridFS by user | Collection filter delete | Legacy path only |
| NextAuth / sessions | session tokens for uid | Invalidate | Re-login required |

## Order (safe)

1. Disable auth / block new spend for uid  
2. Cancel in-flight renders (runId bump + DELETE jobs)  
3. Soft-delete Firestore project docs  
4. **FOUNDER approve** GCS prefix `rm`  
5. Redis key purge  
6. Mongo legacy cleanup  
7. Confirm `/api/stats` 401/empty  

## Anti-scope

- Agents must not run `gsutil rm` / production deletes.  
- No “delete all users” batch jobs.  
- Tests assert **checklist completeness**, not live deletion.

## Test surface

`fastapi/tests/test_deletion_cascade_checklist.py` — asserts this doc lists GCS + Firestore + Redis + Mongo.
