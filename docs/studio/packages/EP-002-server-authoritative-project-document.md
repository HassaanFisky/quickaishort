# EP-002 — Server-Authoritative Project Document

**Status:** APPROVED FOR IMPLEMENTATION — Binding Errata E1–E5 locked  
**Priority:** P0 — Phase 2 Part G step 2  
**Depends on:** EP-001 frozen (Capability Registry ABI)  
**Must not modify:** EP-001 artifacts  
**Supersedes (end-state):** ADR-001 “client as permanent timeline authority” → see ADR-008  
**Affirms:** Phase 2 Decision A10 (dual-layer), A11 (platform objects), A5e (honesty)  
**Related later:** EP-003 MediaGraph, EP-004 Orchestrator Plan Jobs, ADR-004 RenderManifest, ADR-006 native FC  
**Execution authority:** Founder operating command 2026-07-19  

---

## 0.1 Binding Errata (locked before code)

These close Critical/High gaps from the architectural validation gate. They are normative.

### E1 — Materialization (Strategy A)

On composition-mutating commands the client MAY attach:

- `proposed_manifest: RenderManifest`
- `base_snapshot_hash: string` (must equal server `snapshot_hash` at `base_revision`)

Server Kernel:

1. Validates command + EP-001 gates  
2. If `affects_manifest` and proposed_manifest present: accept it as the new materialized snapshot **only after** validation (hash/base revision match; schema validate)  
3. Persists event(s) + head update atomically  
4. Returns `snapshot_hash` of accepted manifest  

If proposed_manifest omitted for a mutating capability: reject `validation` (v1 — no silent server-side invent).  
Future: pure Python reducer (Strategy B) may make proposed_manifest optional.

### E2 — Non-event capabilities (Kernel policy; EP-001 untouched)

These never become ProjectEvents even if registry `side_effects` says `mutate_project`:

`SEEK`, `PLAY`, `PAUSE`, `SCROLL_HAND`, `TIMELINE_ZOOM`, `POINTER_SELECT`, `FORWARD_LANE_SELECT`, `BACKWARD_LANE_SELECT`, `MAGNETIC_SNAP_TOGGLE`

Transport/UI chrome stays browser-local. Kernel rejects them as project commands with `reason=validation` / detail `non_event_capability`.

### E3 — MediaAsset + transcript ownership (v1 minimal)

- `MediaAsset` doc: `studio_assets/{asset_id}` with `{ owner_user_id, gcs_uri, content_type, created_at, source: upload|youtube|adk }`  
- Project `primary_asset_id` references it  
- Transcript for expansion: command may include `transcript_chunks[]` (edge Whisper); server stores copy under project `inputs/transcript` on first compose; Kernel does not invent transcript  

### E4 — Atomic write + idempotency

- Append event + bump `revision` + update snapshot fields MUST run in a **single Firestore transaction**  
- Idempotency key scope: `(project_id, command_id)` unique; store on event + head `recent_command_ids` ring or `commands` subdoc  
- Multi-event expansion from one command: all events in same transaction; if >400 ops, reject `validation` (split plan) — Firestore 500 op limit headroom  

### E5 — Schema / export / op names

- Add `undo_stack: int[]` + `redo_stack: int[]` on head (revision markers); undo = `revert_to_revision`  
- `ProjectOp.import_adk_segments` aliased to `import_assets` with `source=adk_segments`  
- ExportRequest gains optional `project_id` + `project_revision` (legacy path remains without them)  
- Soft-delete: commands rejected when `status=deleted`  

---

## 0. Objective

Design the **10-year foundation** for QuickAI Studio composition state:

> The server owns the Project Document.  
> The browser is a low-latency projector with optimistic updates.  
> The AI edits by committing Capability-backed commands that become immutable events.  
> The timeline, chat receipts, and exports are views of the same truth.

This package is the **authoritative specification**. Implementation begins only after explicit approval.

---

## 1. Current state (verified — not redesigned here)

| Fact | Evidence |
|------|----------|
| Firestore `Projects` collection stores ADK-oriented docs | `fastapi/services/project_service.py` — `title`, `script`, `segments`, `voice_id`, `status`, `job_id` |
| CRUD via `/api/projects` | `fastapi/main.py` |
| Interactive NLE state lives in Zustand | `frontend/src/stores/editorStore.ts` — `applyAiEdits`, `aiUndoStack` |
| AI actions apply client-side after API plan | EP-001 + `useAiCommander` / `AIPanel` |
| Composition IR exists as `RenderManifest` | `fastapi/models/render_manifest.py`, `frontend/src/lib/render/renderManifest.ts` |
| Bake via RQ + optional manifest compile | `render_worker.py`, `manifest_renderer.py` |
| Capability ids are stable ABI | EP-001 `registry.v1.json` |

**Gap:** There is no append-only edit history, no server revision, no ack protocol, no reconstruction of timeline from server truth. Reload loses conversational edits unless the user somehow rehydrates local state.

---

## 2. Challenged assumptions & chosen architecture

### 2.1 Assumption: “CRDT is required for a Figma-like editor”

**Challenge:** Video NLE ops are **order-sensitive** (ripple, rolling, silence removal). Many ops are not commutative. Full CRDT for timeline graphs is research-heavy and rarely worth v1 cost.

**Decision:** **Event sourcing + optimistic concurrency (revision vector)** for EP-002.  
Multiplayer collaboration is **readiness-designed** (presence, locks, rebase), not CRDT-shipped.

**Why better for 10 years:** Deterministic replay for AI, audit, undo, automation, and bake — the Studio OS needs a linear causal log more than simultaneous character-level coediting.

### 2.2 Assumption: “Store the full Zustand blob on the server”

**Challenge:** Zustand is UI-shaped (refs, players, ephemeral flags). Persisting it couples the OS to React runtime forever.

**Decision:** Persist **Commands → Events → Materialized Manifest (+ projections)**. Zustand remains a **projector**, never the schema.

### 2.3 Assumption: “RenderManifest is the source of truth”

**Challenge:** Manifest is a **compiled composition IR** excellent for bake/preview sync (ADR-004), but lossy for undo semantics and AI receipts if used alone (you lose why/who/which capability).

**Decision:**  
- **Authoritative log** = `ProjectEvent[]`  
- **Authoritative snapshot** = materialized `RenderManifest` + `revision`  
- Manifest is always **derivable** from events (with periodic snapshots for O(1) load)

### 2.4 Assumption: “Replace Firestore with a new DB”

**Challenge:** Unjustified rewrite. Firestore already hosts Projects/stats; GCS holds media.

**Decision:** Stay on **Firestore** with:  
- `studio_projects/{projectId}` document (metadata + head revision + snapshot pointer)  
- `studio_projects/{projectId}/events/{eventId}` subcollection (append-only)  
Evolve or dual-write alongside legacy `Projects` during migration — do **not** big-bang delete ADK projects.

### 2.5 Assumption: “AI should write Zustand; server catches up later”

**Challenge:** That recreates today’s assistant model and blocks automation/collab.

**Decision:** AI / user mutations that change composition **must** go through `POST .../commands` (or internal Orchestrator → same service). Client may optimistic-apply a **projected** event, then reconcile on ack/reject.

---

## 3. Ownership model

| Object | Owner | Non-owner may |
|--------|-------|---------------|
| `StudioProject` document | Server (FastAPI Project Kernel) | Client read; patch only via Commands |
| `ProjectEvent` log | Server (append-only) | Client read (paginated); never rewrite |
| Materialized `RenderManifest` | Server (derived) | Client read; local optimistic fork until ack |
| Media blobs | GCS | Client upload via signed/presigned flows; referenced by asset ids |
| MediaGraph (EP-003) | Server analysis jobs | Client may contribute edge signals; server merges |
| Preview Zustand | Browser | Discarded on hard reload unless rehydrated from server |
| Bake jobs / MP4 | Worker + GCS | Client polls/subscribes |

**Tenant ownership:** `owner_user_id` required. Future: `collaborators[]` with roles `owner | editor | viewer` (schema reserved; enforcement EP later).

---

## 4. Browser vs server authority

```text
┌─────────────────────────────────────────────────────────────┐
│ SERVER (authoritative)                                       │
│  Command validate → Event append → Snapshot update → Ack     │
└──────────────────────────▲──────────────────────────────────┘
                           │ ack / reject / rebase
┌──────────────────────────┴──────────────────────────────────┐
│ BROWSER (projector)                                          │
│  Optimistic apply → local revision fork → reconcile          │
│  Scrubbing / playhead / UI chrome = local-only (non-events)  │
└─────────────────────────────────────────────────────────────┘
```

### Local-only (never ProjectEvents)

- `currentTime`, `isPlaying`, panel open state, hover, scroll position  
- Transient WebAudio nodes, video element refs  
- Uncommitted text in chat input  

### Must be ProjectEvents (or bake-only side effects)

- Any Capability that mutates composition (`side_effects` includes `mutate_project`)  
- Asset attach/detach to timeline  
- Manifest-affecting export settings that define the composition (aspect, burned captions intent, etc.)

### Bake-only (worker)

- Encoding parameters that do not change creative composition may be job options, but the **Manifest snapshot revision** used for bake is always server head (or explicit pinned revision).

---

## 5. Project Document schema

### 5.1 `StudioProject` (Firestore document)

```text
studio_projects/{project_id}
  schema_version: 2
  project_id: string
  owner_user_id: string
  title: string
  created_at: timestamp
  updated_at: timestamp
  status: "active" | "archived" | "deleted"

  # Causal head
  revision: int                    # monotonic, starts at 0
  snapshot_revision: int           # revision at which snapshot_manifest was built
  snapshot_manifest: RenderManifest | null
  snapshot_hash: string | null     # hash of snapshot_manifest

  # Session / isolation
  active_run_id: string | null     # aligns with existing editor runId semantics

  # Soft links (not blobs)
  primary_asset_id: string | null
  media_graph_id: string | null    # EP-003
  legacy_adk_project_id: string | null

  # Collaboration readiness (reserved)
  collaborators: [{ user_id, role }]  # may be empty
  edit_lock: { user_id, expires_at, session_id } | null

  # Tombstones
  deleted_at: timestamp | null
```

### 5.2 Why `schema_version: 2`

Legacy ADK `Projects` remain `schema_version: 1` implicitly. Studio OS docs are v2. Migration maps 1→2 without destroying ADK history.

---

## 6. Event model

### 6.1 `ProjectEvent` (append-only subcollection)

```text
studio_projects/{project_id}/events/{event_id}

  event_id: string                 # ulid/uuid
  project_id: string
  revision: int                    # assigned by server; strictly increasing
  parent_revision: int             # must equal previous head at accept time

  ts: timestamp
  actor: {
    kind: "user" | "agent" | "system"
    user_id: string | null
    agent_id: string | null        # e.g. ai_editor_agent
    session_id: string | null
  }

  capability_id: string | null     # EP-001 id when applicable; null for system ops
  capability_version: int | null

  command_id: string               # idempotency key from client/orchestrator
  op: ProjectOp                    # see §7

  # Materialization hints
  affects_manifest: bool
  inverse: InverseSpec | null      # for undo when cheap; else null → snapshot revert

  # Integrity
  prev_snapshot_hash: string | null
  next_snapshot_hash: string | null  # after apply, if computed
```

### 6.2 Event immutability

- No updates, no deletes (except GDPR hard-delete project cascade).  
- Compensating events for undo (`op.type = "revert"` or inverse apply).  
- Corrections = new events, never rewrite history.

### 6.3 InverseSpec (optional)

```text
InverseSpec =
  | { strategy: "compensating_capability", capability_id, params }
  | { strategy: "revert_to_revision", revision }
  | { strategy: "none" }
```

Prefer compensating capability when registry marks `compensating_hint: inverse_tool`. Otherwise revert-to-revision against snapshot chain.

---

## 7. Command model

### 7.1 Command (request)

```text
ProjectCommand {
  command_id: string               # client ULID; idempotent
  project_id: string
  base_revision: int               # client's last acked revision
  actor_session_id: string

  kind: "capability" | "system"
  capability_id?: string           # required if kind=capability
  params: object                   # validated against registry param_schema (evolving)
  
  # Optional AI metadata
  plan_id?: string
  intent?: string
  source: "chat" | "ui_direct" | "orchestrator" | "automation"
}
```

### 7.2 Command acceptance pipeline (server)

```text
1. AuthZ: user owns project (or collaborator editor)
2. Idempotency: if command_id seen → return prior Ack
3. Concurrency: if base_revision != head.revision → 409 Conflict { head, events_since }
4. Capability gate (EP-001):
     - capability exists
     - if source in {chat, orchestrator, automation}: orchestrator_emit must be true
     - if source == ui_direct: allow emit=false mechanical tools (user clicked)
5. Validate params + project invariants (duration bounds, clip existence, etc.)
6. Append event(s) — one command may expand to N events (e.g. REMOVE_SILENCES → many TRIMs)
7. Update materialized snapshot if affects_manifest
8. Bump revision
9. Return Ack
```

### 7.3 Ack / Reject

```text
CommandAck {
  status: "accepted"
  command_id, event_ids[], new_revision
  snapshot_manifest?: RenderManifest   # if small enough; else fetch URL
  snapshot_hash
}

CommandReject {
  status: "rejected"
  reason: "auth" | "conflict" | "emit_blocked" | "validation" | "unknown_capability"
  detail: string
  head_revision?: int
  missing_events?: ProjectEvent[]      # for rebase
}
```

---

## 8. Read / write responsibilities

| Operation | Writer | Reader |
|-----------|--------|--------|
| Create project | Server | — |
| Append command | Server only | — |
| Read head + snapshot | Server | Client, Orchestrator, Worker |
| Read event page | Server | Client (catch-up), agents |
| Optimistic UI mutate | Client local only | — |
| Compile bake | Worker from **server snapshot revision** | — |
| MediaGraph write | Analysis service (EP-003) | Project Kernel reads facets for gates |

**Forbidden:** Client `PATCH` of `snapshot_manifest` or `revision`. Legacy broad `update_project` must be narrowed during migration.

---

## 9. Optimistic updates & synchronization

### 9.1 Client algorithm

```text
onLocalIntent:
  create command_id
  optimisticEvent = projectLocally(op)   # Zustand projector
  mark pending[command_id]
  POST /commands

onAck:
  confirm pending; set acked_revision = new_revision
  replace local manifest with server snapshot if hash differs

onReject conflict:
  drop optimistic fork
  fetch events since base_revision
  rebase or reset-to-head (product policy: reset-to-head for v1)
  surface chat receipt: "Edit conflict — reapplied from server"

onReject validation/emit_blocked:
  drop optimistic fork
  show ToolResult failure in chat (honesty)
```

### 9.2 Sync channels

| Channel | Use |
|---------|-----|
| HTTP command/ack | Primary mutation |
| HTTP `GET .../head` | Cold load |
| HTTP `GET .../events?after_revision=` | Catch-up |
| Pusher/WS `project-{id}` | Optional live fanout of `{revision, event_id}` for multi-tab (reuse existing realtime infra) |

v1 may ship HTTP-only; schema must not require WS.

### 9.3 Multi-tab same user

Last accepted revision wins; other tabs catch up via events or reload head. Edit lock optional later.

---

## 10. Versioning

| Versioned artifact | Scheme |
|--------------------|--------|
| Project schema | `schema_version` int on document |
| Event log | Monotonic `revision` |
| RenderManifest | Existing `version: 1` field; bump when IR breaks |
| Capability | EP-001 `capability.version` stored on event |
| API | `/api/studio/v1/projects/...` prefix for new routes (legacy `/api/projects` untouched until migrated) |

**Rule:** Old clients that only understand legacy Projects continue to work for ADK. Studio editor migrates to `/api/studio/v1`.

---

## 11. Undo / redo architecture

### 11.1 Reject permanent dual stacks as authority

Today: `aiUndoStack` / `aiRedoStack` in Zustand.  
Keep as **latency mirrors**, not truth.

### 11.2 Server undo

```text
UndoCommand {
  kind: system
  op: { type: "undo" } | { type: "redo" }
  base_revision
}
```

Server:

1. Pop logical undo pointer (stored on project: `undo_cursor_revision`) **or** append compensating events  
2. Preferred v1: **`revert_to_revision`** event that sets snapshot to historical snapshot (see §11.3)  
3. Redo = revert forward along redo stack of revision markers  

### 11.3 Snapshot chain

Every K events (e.g. 20) or every N seconds of wall time while dirty, persist snapshot at that revision (inline if small; else GCS `projects/{id}/snapshots/{revision}.json`).

Undo to revision R = load nearest snapshot ≤ R + replay events to R.

### 11.4 AI undo UX

Chat receipt includes `event_ids`. “Undo” in chat issues system undo command, not silent local stack pop without server ack.

---

## 12. Conflict resolution

### v1 policy (simple, correct)

- **Optimistic concurrency:** `base_revision` must match head.  
- On conflict: **reject** + return missing events.  
- Client **resets to server head** (no 3-way merge of timeline graphs in v1).  
- User/AI retries intent against fresh state.

### Why not OT/CRDT in v1

Merging `RIPPLE_DELETE` with concurrent `ADD_CAPTION` requires domain-specific transformers. Ship linear truth first; add OT/CRDT only if product metrics demand simultaneous co-editing.

### Collaboration readiness hooks (no full collab in EP-002 impl)

- `edit_lock` field  
- `collaborators[]`  
- Event `actor` stamped  
- Pusher project channel reserved  

---

## 13. Collaboration readiness (design only)

| Phase | Capability |
|-------|------------|
| EP-002 | Single-editor authoritative log; multi-tab catch-up |
| Later | Viewer role; presence cursors; soft locks |
| Later | Simultaneous editors with section locks or OT on event types marked `parallel_safe` in registry |

Do **not** block EP-002 on multiplayer UX.

---

## 14. AI editing workflow (end-to-end)

```text
User chat / suggestion Intent
  → Orchestrator (EP-004) retrieves capabilities (EP-001)
  → Plan { capability_id, params }[]
  → For each step (or batch):
        ProjectCommand(source=orchestrator|chat)
        → Project Kernel accept
        → Event(s) + snapshot
        → CommandAck
  → Client projector applies acked events (or optimistic then ack)
  → Chat ToolResult receipt { command_id, event_ids, capability_ids, revision }
  → Suggestion Engine (EP-003) may refresh from MediaGraph + new revision
```

**Honesty rule (Phase 2 A5e):** Chat never claims success without `CommandAck.status=accepted`.

**Emit policy:** Orchestrator/chat cannot commit `orchestrator_emit=false`. UI-direct may.

---

## 15. Timeline reconstruction

```text
Cold load:
  GET head → { snapshot_manifest, revision, snapshot_revision }
  if snapshot_revision < revision:
      GET events after snapshot_revision
      replay reducer → manifest'

Hot catch-up:
  apply event ops through pure reducer `applyEvent(manifest, event) -> manifest`
```

### Reducer requirements

- Pure function, no I/O  
- Shared conceptually FE/BE (TypeScript port or WASM later; v1 may implement reducer in Python and send snapshots to FE)  
- **v1 pragmatic choice:** Server is source of materialized manifest; FE applies known Capability ops optimistically using existing `dispatchAIActions` mapping; on ack, **replace** with server snapshot if hash mismatch  

This avoids dual reducer bugs early; long-term extract shared reducer module.

---

## 16. Render pipeline interaction

| Step | Rule |
|------|------|
| Export request | Must include `project_id` + `revision` (default: head) |
| Worker | Loads snapshot_manifest for that revision from Project Kernel (or embedded signed snapshot) |
| Forbidden | Worker trusting client-only Zustand export payload as sole truth when `project_id` present |
| Transition | Legacy export without project_id remains for Shorts path until deprecated |
| Artifacts | Store `bake_jobs/{job_id}` → `{ project_id, revision, gcs_uri }` |

Aligns with ADR-004: Manifest is bake IR; Project Document chooses **which** Manifest revision.

---

## 17. Media Graph interaction (EP-003 boundary)

- `media_graph_id` on project points to analysis document  
- Commands may declare `requires_facets` (from EP-001); Kernel **soft-warns** in v1, **hard-gates** when EP-003 marks facets required  
- Analysis jobs never mutate timeline events directly; they write MediaGraph, optionally emit **system suggestion intents** (not silent edits)

---

## 18. Orchestrator interaction (EP-004 boundary)

- Orchestrator is a **client of Project Kernel**, same as HTTP chat  
- Plan execution uses idempotent `command_id`s per step  
- Long plans = multiple commands with observed acks between steps (true tool loop)  
- Kernel does not call Gemini; Orchestrator does not write Firestore events bypassing Kernel  

---

## 19. Capability Registry interaction (EP-001 frozen)

| Gate | Rule |
|------|------|
| Identity | `capability_id` on events/commands MUST exist in registry |
| Chat/agent emit | `orchestrator_emit == true` |
| UI direct | Allowed even if emit=false |
| Version pin | Store `capability_version` on event for replay compatibility |
| Unknown id | Reject command — never coerce |

EP-002 **must not** change registry files; only consume them.

---

## 20. Security boundaries

| Control | Spec |
|---------|------|
| AuthN | Existing NextAuth JWT → `get_verified_user_id` |
| AuthZ | `owner_user_id` match (collaborators later) |
| Command injection | Params validated; no freeform server code |
| IDOR | All reads scoped by user_id |
| Event tampering | Append-only; no client write to events collection |
| Snapshot forgery | Client cannot PATCH snapshot; hash returned on ack |
| Rate limit | Per-user command rate (slowapi) |
| Secrets | None in project docs |
| Export | Signed download unchanged; bake uses server revision |

---

## 21. Persistence strategy

| Data | Store | Rationale |
|------|-------|-----------|
| Project head | Firestore doc | Fast read of revision + small snapshot |
| Events | Firestore subcollection | Append, query by revision |
| Large snapshots | GCS | Stay under Firestore 1MiB doc limit |
| Media | GCS | Existing |
| MediaGraph | Firestore/GCS (EP-003) | — |
| Idempotency keys | Firestore `commands/{command_id}` TTL or field on event unique index | Exactly-once accept |

**Firestore caveat:** Composite indexes for `owner_user_id + updated_at`. Event queries: `revision > N order by revision`.

**Cost control:** Snapshot every 20 events; clients fetch lite head without full event history.

---

## 22. Scalability considerations

| Dimension | Approach |
|-----------|----------|
| Event volume | Snapshots + pagination; archive cold projects |
| Large manifests | GCS offload; CDN-signed read |
| Write throughput | Single-writer per project (revision transaction); shard not needed at creator scale |
| AI bursts | Command batching optional (`commands: []` transactional) later |
| Fanout | Pusher project channel; avoid polling storms |
| Reducer CPU | Snapshot to avoid O(n) replay on every load |

---

## 23. Migration path from current implementation

### Phase M0 — Dual existence (no breakage)

- Keep `Projects` + `/api/projects` for ADK Studio wizard  
- Add `studio_projects` + `/api/studio/v1/projects`  

### Phase M1 — Editor bind (EP-002 impl)

- On editor session start: `create` or `open` StudioProject; set `active_run_id` from client `runId`  
- After AI/UI composition mutation: submit ProjectCommand (parallel to today’s apply for one release)  
- Feature flag `STUDIO_PROJECT_KERNEL=true`  

### Phase M2 — Authority flip

- Flag on: reject silent local-only composition persistence for Studio mode  
- Export path prefers `project_id+revision`  
- Zustand undo becomes mirror of server undo  

### Phase M3 — Legacy freeze

- ADK `Projects` remain for script/segment jobs  
- Optional link `legacy_adk_project_id`  
- No deletion of GridFS/ADK paths in EP-002  

### Data mapping (ADK → StudioProject)

| Legacy field | Studio field |
|--------------|--------------|
| `_id` | `legacy_adk_project_id` (or migrate id) |
| `title` | `title` |
| `script` | MediaGraph / assets note — not timeline |
| `segments` | Seed clips in initial Manifest event `op: import_adk_segments` |
| `job_id` | bake job link |

---

## 24. API surface (spec only — not implemented)

```text
POST   /api/studio/v1/projects
GET    /api/studio/v1/projects
GET    /api/studio/v1/projects/{id}
POST   /api/studio/v1/projects/{id}/commands
GET    /api/studio/v1/projects/{id}/head
GET    /api/studio/v1/projects/{id}/events?after_revision=&limit=
POST   /api/studio/v1/projects/{id}/undo
POST   /api/studio/v1/projects/{id}/redo
DELETE /api/studio/v1/projects/{id}          # soft delete
```

All JWT-protected. No anonymous project mutation.

---

## 25. `ProjectOp` vocabulary (initial)

Keep ops **capability-aligned** where possible:

```text
ProjectOp =
  | { type: "capability_apply", capability_id, params }  # dominant path
  | { type: "import_assets", asset_ids[] }
  | { type: "set_title", title }
  | { type: "revert_to_revision", revision }
  | { type: "snapshot_marker" }
  | { type: "link_media_graph", media_graph_id }
```

Most edits should be `capability_apply` so EP-001 remains the ABI. Avoid a second parallel op taxonomy.

---

## 26. Risks & non-goals

### Non-goals for EP-002 implementation (when approved)

- Full multiplayer OT/CRDT  
- Chat-primary CSS shell  
- MediaGraph computation  
- Native Gemini function calling  
- Rewriting RQ/GCS  
- Modifying EP-001 registry policy  

### Risks

| Risk | Mitigation |
|------|------------|
| Firestore doc size | Snapshot offload to GCS |
| Dual truth during flag rollout | Explicit flag; export pin revision |
| Optimistic UI desync | Hash compare on ack; reset-to-head |
| Reducer divergence FE/BE | v1 server snapshot replace strategy |
| Migration complexity | Dual collections; no big-bang |

---

## 27. Engineering package checklist (for future implementation EP)

When implementation is approved, the implementation package must include the standard 10 sections (Objective → Definition of Done) **without changing this architecture** unless a Critical defect is found.

Suggested impl order (preview — not authorization to start):

1. Firestore models + repository  
2. Command service + idempotency  
3. Head/events read APIs  
4. FE projector hook (flagged)  
5. Wire AI apply path through commands  
6. Undo/redo system ops  
7. Export revision pin  
8. Tests: concurrency, idempotency, emit gate, replay  

---

## 28. ADR to file on approval

On approval of this design, implementers shall add:

`docs/studio/adrs/ADR-008-server-authoritative-project-document.md`

Status: Accepted — summarizing Decision A10 operationalized as event-sourced Project Kernel on Firestore.

---

## 29. Definition of Done for **this design package**

- [x] Ownership, schemas, events, commands specified  
- [x] Browser vs server authority specified  
- [x] Optimistic sync, versioning, undo, conflicts specified  
- [x] Collab readiness without shipping CRDT  
- [x] AI / timeline / render / MediaGraph / Orchestrator / Registry boundaries specified  
- [x] Security, persistence, scalability, migration specified  
- [x] Assumptions challenged; alternatives rejected with rationale  
- [x] No implementation code written  
- [x] EP-001 untouched  

---

## 30. Execution status

**EP-002 design + Binding Errata approved for implementation.**

Do **not** modify EP-001.

Implementation proceeds via workstreams in `EP-002-IMPLEMENTATION.md`.
