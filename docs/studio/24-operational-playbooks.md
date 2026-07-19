# 24 — Operational Playbooks

## Playbook: Export stuck in processing

1. `GET /api/render/status/{job_id}`  
2. Check DLQ `/api/render/dlq/stats`  
3. If meta stuck >10min: ensure worker healthy; `recover_stale_jobs` runs on boot — restart worker revision if needed  
4. Retry `/api/render/retry/{job_id}` with admin secret if dead  
5. Check GCS billing / permissions if upload stage fails  

## Playbook: AI editor returns empty / no_op

1. `/api/ai-editor/health`  
2. Verify `GEMINI_API_KEY` on API service  
3. Check credits for user  
4. Inspect sanitiser `dropped` / `clamped` in response  
5. Confirm action types exist in FE `dispatchAIActions` / `applyAiEdits`  

## Playbook: YouTube acquisition failures

1. `/api/admin/cookies/status`  
2. Run validate endpoint  
3. Check Redis yt circuit breaker keys  
4. Confirm PoToken provider dependency healthy  

## Playbook: Pre-Flight slow / empty

1. `/api/admin/pipeline/health`  
2. SerpAPI / YouTube OAuth optional — expect soft fallback  
3. Confirm ADK import / `adk:true` on `/health`  

## Playbook: Suspected cost spike

1. Analytics tokens admin endpoint  
2. Rate limit logs  
3. Temporarily lower free tier / raise credit cost  
4. Ensure pipeline endpoint is authenticated
