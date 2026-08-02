# 40 — NLE MCP research pack (Arena) — QuickAI Studio

**Purpose:** Extract **pro NLE tool-taxonomy + agent UX patterns** into QuickAI’s own EP-001 registry / chat-first Studio.  
**Not purpose:** Ship Adobe/DaVinci as a product dependency, brand, or bundled proprietary stack.

**Product lock:** Next.js + FastAPI + Gemini-only + EP-001. No second tool ABI. Learn patterns → map to `wired` / `partial` honestly.

**Wording:** Target craft bar = **Adobe Premiere Pro–class** (user said “Premium Pro” — corrected). Never market QuickAI as Adobe/Premiere.

---

## Repo shortlist (analyze first)

| # | Repo | Why useful for QuickAI | Caution |
|---|------|------------------------|---------|
| 1 | https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP | Large, mature tool catalog (project/bins/timeline/captions/audio/export workflows) | Requires live Premiere; CEP bridge — **do not vendor into Cloud Run** |
| 2 | https://github.com/leancoderkavy/premiere-pro-mcp | Strong module split + npm package; CEP + UXP notes; capability discovery | Same — desktop host only |
| 3 | https://github.com/ayushozha/AdobePremiereProMCP | Very large tool surface (claims 1000+) — good for **gap discovery** vs our 80 caps | Verify real vs advertised; multi-lang complexity |
| 4 | https://github.com/nepfaff/premiere-pro-mcp | Thin `execute-script` style — lesson in **small ABI + powerful host** | Different design philosophy |
| 5 | https://github.com/jenkinsm13/resolve-mcp | Resolve scripting taxonomy (295+); timeline/color/render patterns | Needs Resolve running |
| 6 | https://github.com/samuelgursky/davinci-resolve-mcp | Guardrails / refuse-vs-lie culture; analysis extras | Optional heavy deps |
| 7 | https://github.com/KyaniteLabs/kinocut | **Closest to our stack:** FFmpeg MCP, typed tools, preflight, receipts — server-side friendly | Map to our Cloud Tasks renderer, not duplicate |

---

## What to steal (legal + FinOps safe)

1. **Tool names + params** → candidate EP-001 capabilities (still `partial` until FE+dispatch wired).  
2. **Workflow packs** (silence cut → captions → export readiness) → MediaGraph suggestion packs.  
3. **Refuse-honestly** patterns → keep `qai:ai-tool-refused` / Advanced open.  
4. **Export readiness checks** → pre-export chat chip.  
5. **Never:** CEP/UXP plugins into production API; Adobe branding; cloning their runtime into our SaaS.

---

## Arena prompts (copy one box at a time)

### PROMPT A — Premiere MCP catalog → QuickAI gap matrix

```text
ROLE: Senior NLE + AI tooling analyst for QuickAI Studio (chat-first YouTube/upload → chat → preview → export). Stack locked: Next.js + FastAPI + Gemini + EP-001 capability registry. Do NOT recommend adding Adobe Premiere as a runtime dependency.

TASK:
1) Clone these repos (read-only analysis):
   - https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP
   - https://github.com/leancoderkavy/premiere-pro-mcp
   - https://github.com/ayushozha/AdobePremiereProMCP
2) Extract a CLEAN list of tool categories (timeline, audio, captions, color, markers, export, media ingest, effects).
3) For each category, list 5–15 concrete operations that a SHORTS-first web editor should support.
4) Output a GAP MATRIX vs a typical 80-capability registry with ~38 wired / ~42 partial:
   - MUST HAVE for shorts chat UX (P0)
   - SHOULD HAVE (P1)
   - DESKTOP-NLE ONLY (reject for SaaS)
5) Propose NEW capability IDs in SCREAMING_SNAKE_CASE with params JSON shape — no Adobe trademarks in ID names.
6) Flag any license or “requires Premiere installed” blockers.

OUTPUT FORMAT:
- Executive summary (10 lines max)
- Category table
- P0/P1/Reject lists
- Proposed capability ID stubs (markdown table: id | params | why)
- Risks (cost, security, maintainability)
```

### PROMPT B — Resolve MCP → color/audio/marker honesty

```text
ROLE: Staff engineer comparing DaVinci Resolve MCP tool surfaces to a web chat-primary editor.

CLONE:
- https://github.com/jenkinsm13/resolve-mcp
- https://github.com/samuelgursky/davinci-resolve-mcp

TASK:
1) Summarize how they group tools (timeline vs color vs render vs analysis).
2) Extract “refuse instead of lie” / capability-discovery patterns we should copy in product UX.
3) List marker, ripple, silence, and export-readiness ideas that map to browser+FFmpeg (NOT Fusion nodes).
4) Explicitly REJECT anything that needs a desktop NLE process on the server.

OUTPUT: bullet lists + a “QuickAI-safe adaptations” section only.
```

### PROMPT C — Kinocut / FFmpeg MCP → our renderer alignment

```text
ROLE: FinOps-aware backend architect for QuickAI (Cloud Tasks → private Cloud Run ffmpeg → GCS).

CLONE:
- https://github.com/KyaniteLabs/kinocut

TASK:
1) Map Kinocut tool categories to our pipeline: preview (client) vs Final export (server ffmpeg).
2) Which guardrails (preflight, receipts, typed params) should we mirror in /api/ai-editor + render manifest?
3) Propose 8 concrete improvements to suggestion chips / chat actions that stay $0-heuristic friendly when Gemini is down.
4) Do NOT propose always-on workers or new paid SaaS.

OUTPUT: prioritized backlog (P0–P2) with effort S/M/L and cost impact.
```

### PROMPT D — Master synthesis (run AFTER A–C)

```text
You already analyzed Premiere MCP, Resolve MCP, and Kinocut.

Synthesize ONE implementation brief for QuickAI Studio:
1) Top 20 capability upgrades to promote from partial→wired (or add new IDs) for chat-first shorts.
2) Top 10 MediaGraph suggestion packs (label pattern + evidence + capability_id).
3) Hard anti-scope: what we will NEVER port from desktop NLE MCPs.
4) Success metrics: time-to-first-edit, chip apply success, export honesty, zero silent no-ops.

Constraints: Gemini-only, EP-001 single ABI, CostGuard fail-closed, no Adobe branding in UI.
```

---

## Founder decision after Arena

Bring Arena outputs back here. Next eng step = map P0 IDs into `fastapi/capabilities/registry.v1.json` + `dispatchAIActions` with tests — **patterns only**, not Premiere runtime.
