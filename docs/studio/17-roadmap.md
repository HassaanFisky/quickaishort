# 17 — Roadmap (QuickAI Studio)

Phased evolution. Each phase ships independently.

## Phase S0 — Truth & Safety (1–2 weeks)

- Fix pipeline auth  
- Doc drift cleanup (CLAUDE, ARCHITECTURE, README link to `docs/studio`)  
- Credit fail-closed in production  
- Inventory action coverage matrix (schema ∩ FE handler ∩ sanitiser)

## Phase S1 — Tool Unification (2–4 weeks)

- Single `tools.schema.json` (or Python source of truth) → codegen FE types  
- Merge AI panels  
- Native Gemini function declarations + JSON fallback  
- Verifier + richer undo labels  

## Phase S2 — Chat-Primary Studio UX (2–3 weeks)

- Default layout: chat column primary, timeline contextual  
- Dynamic suggestion rail from Analysis aggregate API  
- Preserve Ads Coming Soon pattern when Ads lands  
- Brand rename Shorts → Studio (copy + extension)

## Phase S3 — Analysis Depth (3–5 weeks)

- AnalysisAgent job on load (reuse Whisper, scenes, faces, silence)  
- Persist analysis to project  
- Suggestions regenerate after major edits  

## Phase S4 — Server Tool Runtime (4–6 weeks)

- Long-running tools: silence bake, loudness, B-roll fetch, TTS  
- Job status in chat  
- Expand RenderManifest compile coverage  

## Phase S5 — Project Truth (ongoing)

- Firestore project stores RenderManifest snapshots  
- Multi-device resume  
- Optional collaborative locks (later)

## Keep forever

Pre-Flight as publish gate tool; viral discovery; Chrome extension entry.

---

## Explicit non-roadmap

- Rewrite in another framework  
- Swap Gemini for OpenAI core  
- GPL media frameworks  
- Fake “AI edited” messages without `applyAiEdits` / server tool success
