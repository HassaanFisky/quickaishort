# 05 — Frontend

**Root:** `frontend/`  
**Framework:** Next.js `14.2.35`, React `18.3.1`, Tailwind v4, Zustand `5.0.10`  
**Package name:** `quickai-shorts` (`package.json`)

---

## Editor composition

| Component | Path | Role |
|-----------|------|------|
| `EditorLayout` | `components/editor/EditorLayout.tsx` | Shell: canvas, dock, AI panel, advanced panels |
| `VideoCanvas` / `VideoWorkspace` | editor/ | Preview |
| `BottomDock` + `MultiTrackTimeline` | editor/ | Timeline |
| `AIPanel` | `components/editor/AIPanel.tsx` | Conversational UI |
| `LeftPanel` / `RightPanel` | editor/ | Advanced inspector / preflight (advanced mode) |
| `ExportDialog` | editor/ | Export |

### UX primacy (verified)

- `isAdvancedMode = URLSearchParams.get("advanced") === "1"` — left/right panels gated.
- Default: canvas + bottom dock + AI panel (`<AIPanel />` always mounted).
- FAB opens AI when closed (`setAIPanelOpen(true)`).

**Gap vs Studio vision:** Chat exists and is prominent, but product still *feels* like a traditional editor with AI attached — not ChatGPT-first with timeline as optional context. Closing that gap is primarily layout/IA work, not a new app.

---

## Conversational editing path

```text
User prompt / suggestion click
  → useAiCommander.execute (or AIPanel legacy path)
  → callAiEditor → POST /api/ai-edit (or /api/ai-editor/command)
  → response.actions
  → editorStore.applyAiEdits / dispatchAIActions
  → undo stack (aiUndoStack)
```

Evidence: `hooks/useAiCommander.ts`, `stores/editorStore.ts`.

---

## Suggestions

| Layer | Behavior | File |
|-------|----------|------|
| MediaGraph grounded | Facets → suggestion API → editor rail | `editor/AIPanel.tsx` + MediaGraph |
| Dashboard FAQ | Educational chips only; video → `/editor` CTA | `components/ai/AIPanel.tsx` |

**Authority:** Product edit suggestions = MediaGraph only. Dashboard must not pretend to mutate timelines.

---

## Tool catalogue

`lib/aiToolCatalog.ts` — large catalog with `execMode: "direct" | "gemini"`.

- `direct` → 0 credits, local store dispatch  
- `gemini` → 1 credit via commander  

This is the seed of the Studio Tool Runtime on the client.

---

## Media workers / libs (verified presence)

| Capability | Evidence |
|------------|----------|
| Whisper transcription | `@xenova/transformers`, `useMediaPipeline` / workers |
| Face tracking | `hooks/useFaceTracker.ts` MediaPipe |
| Scene / beat detection | `lib/sceneDetection.ts`, `lib/beatDetection.ts` |
| FFmpeg.wasm export | `@ffmpeg/ffmpeg` dependency; worker docs in CLAUDE |
| WebGPU shaders | `lib/webgpu/**` |
| Server export | `hooks/useServerExport.ts` |

---

## Auth

- NextAuth: `lib/auth/options.ts`  
- Middleware protects dashboard routes (`middleware.ts` — verify on change)  
- Backend token on session for API calls  

---

## ADK / Coming Soon requirement

**Product requirement:** Sidebar **ADK** = Google Agent Development Kit workspace — intentionally unavailable: premium blur + **Coming Soon** + short professional subtitle + reserved disabled IA skeleton (Agents, Workflows, Tools, Memory, Knowledge, MCP, Integrations, Automation). **Not Ads.**

**Correction:** Earlier docs that said “Ads section” misread ADK. See `EP-008-ADK-ARCHITECTURE-CORRECTION.md` / ADR-013.

**Note:** Pricing Agency tier CTA `"Coming Soon"` (`pricing/page.tsx`) is unrelated billing UX.

---

## Design system

Hydro-Glass tokens documented in `CLAUDE.md` (bg `#0a0a0a`, accent purple `#a855f7`, etc.). Preserve unless explicit redesign requested.

---

## Frontend evolution rules

1. Keep Zustand as interactive source of truth for preview.  
2. Unify duplicate AI panels (`components/editor/AIPanel.tsx` vs `components/ai/AIPanel.tsx`).  
3. Make suggestion rail data-driven from Analysis Agent.  
4. Chat-primary layout default; `advanced=1` remains escape hatch for power users.
