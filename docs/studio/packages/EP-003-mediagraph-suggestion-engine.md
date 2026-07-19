# EP-003 — MediaGraph + Grounded Suggestion Engine

**Status:** APPROVED FOR IMPLEMENTATION  
**Priority:** P0 — Phase 2 Part G step 3  
**Depends on:** EP-001 frozen, EP-002 Kernel (project may link `media_graph_id`)  
**Must not modify:** EP-001 registry files  
**Affirms:** Phase 2 A5a, D1, D6, U1 (suggestions gate)  
**ADR:** ADR-009  

---

## 0. Objective

Make media understanding a first-class platform object so suggestion chips are **never** keyword/title heuristics.

> MediaGraph owns understanding.  
> Suggestion Engine only reads MediaGraph.  
> Heuristics may drive non-clickable progress UI — never creative recommendations.

---

## 1. Current state (verified)

| Fact | Evidence |
|------|----------|
| Clickable chips from title map | `frontend/src/lib/gemini-editor.ts` `INSTANT_SUGGESTIONS` + `generateImmediateSuggestions` |
| AIPanel loads instant then Gemini refine | `frontend/src/components/editor/AIPanel.tsx` |
| Edge signals exist client-side | transcript, silenceSegments, videoAnalysis in `editorStore` |
| EP-001 `requires_facets` reserved | Capability registry field (empty / unused for hard gates) |
| EP-002 project has `media_graph_id` | `StudioProjectHead.media_graph_id` |

**Gap:** No server MediaGraph document; suggestions are not grounded in analysis nodes.

---

## 2. Architecture decisions

### 2.1 Storage

- Firestore `studio_media_graphs/{graph_id}`
- Optional large payloads (full word-level transcript) → GCS `media_graphs/{graph_id}/transcript.json` with pointer on doc
- v1: keep transcript chunks inline if ≤500 chunks; else GCS pointer

### 2.2 Ownership

| Object | Owner |
|--------|-------|
| MediaGraph document | Server MediaGraph service |
| Edge facet contributions | Client may POST; server merges with provenance |
| Suggestion chips | Derived server-side; client displays |
| Timeline mutations | Still Project Kernel only (EP-002) — graph never mutates events |

### 2.3 Facet model (v1)

| Facet key | Source | Required for suggestions? |
|-----------|--------|---------------------------|
| `duration` | edge metadata | soft |
| `transcript` | edge Whisper / server | soft |
| `silence` | edge energy / transcript gaps | soft |
| `viral_moments` | existing viral heuristics / agent | soft |
| `captions_present` | project projector / edge | soft |
| `faces` | reserved EP later | — |
| `scenes` | reserved | — |

Absence is explicit: `facets.<key>.status = missing | pending | ready | error`.

### 2.4 Suggestion honesty (A5a)

Clickable suggestion MUST include:

- `suggestion_id`
- `label` (user-facing)
- `capability_id` (EP-001 id) OR `intent_kind: analyze_deeper` (non-mutating, starts analysis)
- `params` validated lightly
- `evidence`: `{ facet_keys: string[], summary: string }`
- `confidence`: 0–1

**Forbidden as clickable product chips:**

- `INSTANT_SUGGESTIONS` / title keyword maps
- Static `WITH_VIDEO_SUGGESTIONS` arrays without graph evidence
- Gemini-refined free-text chips that lack `capability_id` + evidence

**Allowed skeleton UI:** non-interactive “Analyzing media…” / facet progress bars.

### 2.5 Analysis tiers (D6)

1. **Edge upsert** — browser posts transcript/silence/duration (cheap)  
2. **Server derive** — pure functions produce suggestions (no LLM)  
3. **Optional deepen** — later Gemini vision; out of v1 scope unless already paid path exists  

v1 ships tiers 1–2 only.

---

## 3. Schemas

### 3.1 MediaGraph

```text
studio_media_graphs/{graph_id}
  schema_version: 1
  graph_id: string
  owner_user_id: string
  asset_id: string | null          # EP-002 MediaAsset
  project_id: string | null        # optional bind
  created_at, updated_at
  status: "pending" | "partial" | "ready" | "failed"
  facets: {
    [facet_key]: {
      status: "missing" | "pending" | "ready" | "error"
      version: int
      updated_at: timestamp
      provenance: "edge" | "server" | "agent"
      data: object                 # facet-specific
      error: string | null
    }
  }
  revision: int                    # monotonic graph revision
```

### 3.2 SuggestionIntent

```text
{
  suggestion_id: string
  label: string
  capability_id: string | null
  intent_kind: "capability" | "analyze_deeper" | "informational"
  params: object
  evidence: { facet_keys: string[], summary: string }
  confidence: float
  interactive: bool               # false → UI must not treat as clickable action
}
```

---

## 4. API

```text
POST   /api/studio/v1/media-graphs
GET    /api/studio/v1/media-graphs/{graph_id}
POST   /api/studio/v1/media-graphs/{graph_id}/facets   # upsert merge
GET    /api/studio/v1/media-graphs/{graph_id}/suggestions
POST   /api/studio/v1/media-graphs/by-project/{project_id}/ensure
```

Auth: `get_verified_user_id`. Owner-only.

---

## 5. Derivation rules (v1 — deterministic)

| Condition | Suggestion |
|-----------|------------|
| `transcript.status=ready` and not captions_present | ADD_CAPTION / TOGGLE_CAPTIONS intent with evidence transcript |
| `silence.status=ready` and ≥1 silence ≥0.6s | REMOVE_SILENCES with min_silence_sec from data |
| `viral_moments.status=ready` and top score ≥ threshold | DETECT_VIRAL_MOMENTS or TRIM to top window |
| `duration.status=ready` and duration > 600 and no viral yet | analyze_deeper informational (interactive=false) OR capability DETECT_VIRAL_MOMENTS if emit allowed |
| No ready facets | Zero clickable chips; return skeleton informational only |

All labels must cite evidence in `evidence.summary`.

---

## 6. Frontend changes

1. `AIPanel` suggestion load path: stop calling `generateImmediateSuggestions` for clickable chips.  
2. Upsert edge facets when transcript/silence/duration available.  
3. Render suggestions from `GET .../suggestions`.  
4. Non-ready: show non-clickable Analyzing state.  
5. Keep `generateImmediateSuggestions` in file marked **DEPRECATED — non-product**; may be used only in tests or behind dead code until deleted.  
6. `components/ai/AIPanel.tsx` static lists: same rule — Coming Soon / analyzing, not fake craft advice.

Flag: none required for honesty fix — A5a is product law. Soft flag `NEXT_PUBLIC_MEDIA_GRAPH=0` only for emergency rollback.

---

## 7. Project Kernel link

On ensure: if `project_id` provided, set `StudioProjectHead.media_graph_id` via Kernel system note OR direct head field update in MediaGraph service (allowed metadata patch, not event) — v1: MediaGraph service updates project head `media_graph_id` if project owned by same user (narrow metadata write documented as exception for bind only).

Prefer: return `graph_id` to client; client/Kernel `attach` later. **v1:** store bind on graph (`project_id`) only; project head update optional best-effort.

---

## 8. Out of scope

- EP-004 Orchestrator  
- Hard-gating capabilities on missing facets (soft warn only)  
- Face/scene deep models  
- Chat-primary layout rewrite  
- Deleting Whisper edge pipeline  

---

## 9. Workstreams

| WS | Deliverable |
|----|-------------|
| WS1 | Models + MediaGraph service + facet merge + suggestion derive |
| WS2 | HTTP router + tests |
| WS3 | FE upsert + AIPanel grounded rail; deprecate heuristic chips |
| WS4 | Living docs + ADR-009 |

---

## 10. Completion criteria

- [ ] No clickable chip from title heuristics in editor AIPanel  
- [ ] Suggestions API returns evidence-backed intents  
- [ ] Empty graph → non-interactive analyzing only  
- [ ] pytest green; tsc green  
- [ ] EP-001 untouched  
