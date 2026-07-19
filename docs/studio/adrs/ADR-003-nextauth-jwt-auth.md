# ADR-003 — NextAuth JWT Backend Authentication

- **Status:** Accepted  
- **Date:** 2026-07-18  

## Context

CLAUDE.md references Firebase Admin auth files that do not exist.

## Decision

Backend authentication is **NextAuth JWT** verified by `services.auth.get_verified_user_id` using `NEXTAUTH_SECRET` (HS256). Admin routes use `X-Admin-Secret`.

## Consequences

- Document AUTH_DISABLED accurately or implement it  
- Secure previously open sensitive routes (pipeline)  
- Do not reintroduce firebase-admin without explicit decision  

## Evidence

`fastapi/services/auth.py`, `frontend/src/lib/auth/options.ts`
