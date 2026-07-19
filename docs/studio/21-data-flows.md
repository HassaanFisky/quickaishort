# 21 — Data Flows

## Flow A — Conversational edit (current)

```mermaid
sequenceDiagram
  participant U as User
  participant FE as AIPanel/Commander
  participant API as FastAPI ai_editor
  participant G as Gemini
  participant S as editorStore
  U->>FE: prompt / suggestion
  FE->>API: POST /api/ai-edit (JWT, state, transcript)
  API->>API: deduct_credits
  API->>G: generate_content JSON
  G-->>API: actions[]
  API->>API: sanitise
  API-->>FE: AIEditorResponse
  FE->>S: applyAiEdits
  S-->>U: preview update + message
```

## Flow B — Server export

```mermaid
sequenceDiagram
  participant FE as useServerExport
  participant API as FastAPI
  participant RQ as Redis RQ
  participant W as render_worker
  participant GCS as GCS
  participant P as Pusher
  FE->>API: POST process-video/create-video
  API->>RQ: enqueue process_render_task
  RQ->>W: job
  W->>W: acquire segment / ffmpeg / manifest?
  W->>GCS: exports/{user}/{job}.mp4
  W->>P: progress/complete (via pubsub bridge)
  FE->>API: GET download signed
```

## Flow C — Pre-Flight

```text
Clip candidate → POST /api/preflight → ADK graph → consensus score + recommendation → FE RightPanel / store
```

## Flow D — ADK Studio generate

```text
Upload GCS → enhance script → generate plan → enqueue multi-clip render → project record Firestore
```

## Flow E — Target Studio (future)

```text
Upload → AnalysisAgent (async) → SuggestionRail
Chat → Orchestrator (FC) → ToolRuntime → (ClientTools | ServerTools | RenderTools)
Optional → PreflightTool → ExportTool(manifest)
```
