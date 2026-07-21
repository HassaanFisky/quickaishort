# 15 — Production Readiness

## Go / No-Go for QuickAI Studio positioning

| Gate | Status | Notes |
|------|--------|-------|
| Core edit + export path code exists | **Go** | RQ + GCS + editor |
| Conversational apply path exists | **Go** | AIPanel + `sendEditorCommand` + `dispatchAIActions` / Kernel when flag on |
| Native tool orchestration | **No-Go** for “AI operates Premiere tools” claim | Prompt-JSON only (ADR-006 optional) |
| MediaGraph grounded suggestion rail | **Go** (editor chips) | EP-003 / ADR-009 — chips derive from facets + evidence; no title-heuristic rail |
| Deep vision / unified AnalysisAgent | **Conditional** | Edge facets (transcript/silence/viral) are honest; not full vision-verified scene graph |
| Auth on pipeline | **Go** | JWT + fail-closed credits |
| Docs accuracy | **Go** (2026-07-21) | CLAUDE auth/version/Gemini blocker + this table refreshed for EP-003 |
| ADK Coming Soon blur | **Go** | Google Agent Development Kit Coming Soon + IA skeleton shipped |
| Billing / credits | **Conditional** | Paddle present; AI Editor credit gate **fail-closed** (503 on stats outage; stream gated). Soft-fail only via `CREDITS_SOFT_FAIL=true` (non-prod). |
| Live Gemini generateContent | **No-Go** until founder top-up | 429 prepayment credits depleted on project `99900313102` |
| Demo / Devpost (challenge) | Per CLAUDE checklist | Separate from Studio |

---

## Existing checklist

Follow `docs/PRODUCTION_READINESS.md` for:

- `tsc --noEmit` + `pnpm build`  
- `pytest` backend tests  
- Adobe trademark grep  
- Paddle / Resend configs  

Re-run; do not trust unchecked boxes.

---

## Minimum bar before marketing “QuickAI Studio”

1. Pipeline auth fixed  
2. Single tool catalogue shipped  
3. Chat-primary default layout  
4. Suggestion rail driven by MediaGraph suggestions API (edge facets → evidence-backed chips; no title invent)  
5. Docs platform (`docs/studio`) linked from README  
6. Live `/health` green + GCS writable (billing OK)
