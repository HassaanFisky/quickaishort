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
| Instant | Title keyword → `INSTANT_SUGGESTIONS` map | `lib/gemini-editor.ts` `generateImmediateSuggestions` |
| Refine | Optional Gemini / `/api/ai/suggestions` fetch | same |
| Hardcoded alt panel | `WITH_VIDEO_SUGGESTIONS` / `NO_VIDEO_SUGGESTIONS` | `components/ai/AIPanel.tsx` |

**Vision gap:** Not fully dynamic from multimodal analysis. Instant layer is intentionally zero-cost (good for cost strategy) but must not remain the only intelligence.

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

## Ads / Coming Soon requirement

**User requirement:** Ads section blurred + Coming Soon.

**Current evidence:**
- Sidebar nav: Dashboard, Editor, ADK Studio, History, Settings — **no Ads item** (`Sidebar.tsx`).
- Pricing Agency tier CTA `"Coming Soon"` (`pricing/page.tsx`).

**Status:** Requirement not implemented as an Ads section. When Ads is added, enforce blur + Coming Soon gate before any unfinished UI ships.

---

## Design system

Hydro-Glass tokens documented in `CLAUDE.md` (bg `#0a0a0a`, accent purple `#a855f7`, etc.). Preserve unless explicit redesign requested.

---

## Frontend evolution rules

1. Keep Zustand as interactive source of truth for preview.  
2. Unify duplicate AI panels (`components/editor/AIPanel.tsx` vs `components/ai/AIPanel.tsx`).  
3. Make suggestion rail data-driven from Analysis Agent.  
4. Chat-primary layout default; `advanced=1` remains escape hatch for power users.
