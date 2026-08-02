# 35 — Log redaction checklist (privacy)

**Date:** 2026-08-02  
**Rule:** INFO logs = ids + lengths + statuses. Never raw transcripts, chat bodies, or prompts.

| Surface | Allowed at INFO | Forbidden |
|---------|-----------------|-----------|
| `gemini_client` | `model`, `elapsed_ms`, `response_chars`, `err_type` | prompt / contents text |
| `ai_editor_router` | `user_id`, `prompt_len`, action counts, `elapsed_ms` | full command / transcript arrays |
| Dub | `job_id`, `user_id`, cache hit, credit amounts | source transcript segments |
| Render | `job_id`, `user_id`, status, error class (truncated) | signed URL tokens, media bytes |
| Admin metrics | cache hit-rate, DLQ depth, circuit kind | secret headers |

**Audit sign-off (engineering):** 2026-08-02 — attribution path uses `gemini_call_ok|failed|deferred` without bodies. Re-audit after any new Gemini entrypoint (see `33-costguard-entrypoint-audit.md`).

**Founder:** rotate any secret that ever appeared in logs.
