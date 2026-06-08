# How to Test AI Commander (G7 Manual Smoke)

## Prerequisites

- Node.js 20, pnpm, Python 3.12 with venv activated
- Redis running locally (`redis-server`)
- `fastapi/.env` with at minimum: `MOCK_AI_EDITOR=true`, `AUTH_DISABLED=true`, `NEXTAUTH_SECRET=dev`

## 1. Start backend (mock mode)

```bash
cd fastapi
MOCK_AI_EDITOR=true AUTH_DISABLED=true uvicorn main:app --reload --port 8000
```

Verify:
```bash
curl -s http://localhost:8000/health | python -m json.tool
```
Expected: `{"status": "ok", ...}`

## 2. Start frontend

```bash
cd frontend
pnpm dev
```

Open: http://localhost:3000/editor

## 3. Load a video

1. Paste a YouTube URL (e.g. `https://youtu.be/dQw4w9WgXcQ`) into the URL input.
2. Wait for "Ready" status — the transcript and waveform should appear.

## 4. Open AI Copilot → Edit mode

1. Click the **Sparkles ✨** button in the editor header to open the AI Copilot panel.
2. Click the **"Edit"** tab (next to "Chat").
3. Confirm you see the two-tab toggle and the text input area.

## 5. Execute an AI command

1. Type: `trim to the hook and add a CTA`
2. Press **Enter** (not Shift+Enter).

Expected behaviour:
- The panel input border glows purple.
- The video canvas shows a dark overlay with "AI is editing your video…"
- After ~0.5s (mock is instant), the overlay disappears.
- A purple chip appears: "Mock response — set MOCK_AI_EDITOR=false on server for real Gemini"
- In the canvas, a purple text element "Subscribe for more! 🎯" appears near the bottom.
- The "Cinematic" filter is applied to the video.
- A caption "🔥 AI-generated hook" appears at the beginning.
- The TRIM marker is set to the full video duration.
- The video scrubs to t=0.

## 6. Test Undo

1. Click the **Undo ↩** button in the Edit mode header (or press Ctrl/Cmd+Z while the input is focused).
2. Confirm: all 4 changes revert — text element disappears, filter resets, caption disappears.

## 7. Test Redo

1. Click the **Redo ↪** button (or press Ctrl/Cmd+Shift+Z).
2. Confirm: all 4 changes re-apply.

## 8. Test Cancel

1. Switch backend to real Gemini mode (remove `MOCK_AI_EDITOR=true`).
2. Type a command and immediately click **Cancel** before it completes.
3. Confirm: overlay disappears, status returns to idle, no state mutation, no snapshot pushed.

## 9. Test no-video guard (E1)

1. Refresh the editor without loading a video.
2. Switch to Edit mode.
3. Confirm the input is disabled and the amber banner "Load a video first" is shown.

## 10. Structural validators (CI equivalent)

```bash
cd frontend
node scripts/validate-interactive-text.mjs
node scripts/validate-ai-commander.mjs
npx tsc --noEmit
```

All three must exit with code 0.

## 11. Backend tests

```bash
cd fastapi
PYTHONPATH=. python -m pytest tests/test_ai_editor.py -v
```

Expected: 14 passed, 0 failed (T14 requires `pytest-asyncio`; install with `pip install pytest-asyncio`).
