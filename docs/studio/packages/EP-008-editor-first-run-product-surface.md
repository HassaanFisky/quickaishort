# EP-008 — Editor First-Run Product Surface (Ingest · Onboarding · ADK Gate · UX Honesty)

**Status:** **IMPLEMENTED** — ADK≠Ads correction shipped (`APPROVE ADK CORRECTION`) — see `EP-008-ADK-ARCHITECTURE-CORRECTION.md`  
**Priority:** P0 — product experience (not feature spam)  
**ADR:** ADR-013  
**Package ID:** **EP-008** (confirmed — do **not** rename to EP-002; Kernel history stays clean)  
**Depends on:** EP-001 frozen · EP-002 Kernel frozen · EP-003 MediaGraph frozen · EP-005 Chat-Primary  
**Must not modify:** EP-001 Capability Registry ABI files; EP-002 event model; EP-003 A5a derivation  
**Approval trail:** Founder approved EP-008 FINAL → implementation shipped → **2026-07-20 correction:** ADK ≠ Ads; design-only until founder re-approves ADK workspace UX

---

## 0. Principles (mandatory — every UX decision)

| Principle | How EP-008 satisfies it |
|-----------|-------------------------|
| Discoverable | Upload + URL equal, always visible; ADK visible as Coming Soon |
| Learnable | Interactive tour teaches by doing, ≤2 minutes |
| Predictable | Named states: validating → uploading → processing → ready / error |
| Accessible | Keyboard, SR, touch, desktop; focus trap on tour |
| Responsive | Mobile / tablet / desktop layouts for IngestSurface |
| Low cognitive load | One card, two peers; short tour sentences; no redesign |
| Professional | Hydro-Glass language; ADK Coming Soon never looks broken or temporary |
| Future-proof | Backend-authoritative ingest policy; lazy-loaded surfaces |
| AI-native OS compatible | No parallel tool dialects; agents can later drive same ingest Intents |

**Design principle:** Improve discoverability. Reduce cognitive load. **Do not redesign** the application. Every addition must feel native to QuickAI Studio.

---

## 1. Naming (locked)

| ID | Meaning | Status |
|----|---------|--------|
| EP-001 | Capability Registry ABI | Frozen |
| EP-002 | Project Kernel | Frozen / implemented |
| EP-003 | MediaGraph | Implemented |
| **EP-008** | Editor First-Run + Upload + Onboarding + ADK Coming Soon | **This package** |

Do not renumber. History stays clean.

---

## 2. Objective

A beginner completes in one session:

`Ingest (upload **or** URL) → grounded suggestions → chat edit → timeline reflects edits → export`

Architecture preserved: Capability Registry · MediaGraph · Project Document · Orchestrator · ADK-ready multi-agent path.

---

## 3. Verified gaps (unchanged facts)

| Gap | Evidence |
|-----|----------|
| Upload not first-class | `YouTubeInputStrip` shows upload only when `backendFailed` |
| Narrow format messaging | Drag overlay “MP4, WebM, or MOV”; `accept="video/*"` |
| No interactive onboarding in tree | No `OnboardingTour` component |
| ADK workspace Coming Soon | Future Google Agent Development Kit workspace must be intentionally unavailable (premium blur + reserved IA skeleton) — **not** an Ads page |
| Suggestions | MediaGraph path exists — **do not change architecture** |

---

## 4. Architecture decisions (revised)

### D1 — Ingest Surface (product, not a “feature dump”)

Equal first-class peers:

1. **Upload Video** (primary button + drop zone)  
2. **Paste YouTube URL** (field + analyze/generate)

Interactions:

| Interaction | Required |
|-------------|----------|
| Drag & drop | Yes (shell + surface) |
| Click to upload | Yes |
| Desktop file picker | Yes |
| Mobile / tablet file picker | Yes (`capture` not required; standard `input[type=file]`) |
| Paste from clipboard | Yes **where browser permits** (Clipboard API / paste event with `File` or video blob); if unsupported, no fake affordance — omit or disable with tooltip “Paste file not supported in this browser” |
| Keyboard | Upload button focusable + Enter/Space; URL field Tab order |
| Screen reader | Labels, `aria-describedby` for formats/limits, live regions for progress |
| Replace media | Explicit **Replace** when source already loaded (re-opens ingest; mints new `runId`; clears stale derived state per existing store rules) |

Never hide Upload behind YouTube failure.

### D2 — Backend-authoritative format policy (EP-001 safe)

**Conflict to resolve:** “Define formats through the backend capability layer” vs **EP-001 freeze** (edit-tool ABI).

**Resolution (challenged & accepted for this package):**

- **Do not** put ingest MIME/extension lists into EP-001 `capabilities.v1.json` (that ABI is for *editing tools*, not media codec policy).  
- Introduce a **Media Ingest Policy** platform config (separate from Capability Registry):

```text
GET /api/studio/v1/ingest/policy
→ {
  "version": 1,
  "extensions": [".mp4", ".mov", ...],
  "mime_types": ["video/mp4", ...],
  "max_bytes": <int>,
  "warn_bytes": <int>,
  "examples_label": "MP4, MOV, MKV, WebM, …"
}
```

- **Backend validates** on `POST /api/video/presigned-url` (and any future ingest accept). Reject unsupported → structured error.  
- **Frontend** fetches policy at editor idle (cached sessionStorage TTL ≤1h); UI `accept=` + helper text from policy; client pre-check is UX-only.  
- Minimum extension set the policy **must** include (authoritative server defaults):  
  `mp4 mov mkv webm avi m4v mpeg mpg ts mts m2ts wmv flv 3gp ogv`

This is **future-proof** (ops can tighten/loosen without FE redeploy of hardcoded lists) and **does not reopen EP-001**.

### D3 — Upload / processing honesty

Required user-visible states:

| State | Feedback |
|-------|----------|
| validating | “Checking file…” |
| uploading | Determinate % when `xhr.upload` / `fetch` progress available; else indeterminate + bytes sent if known |
| processing | Local prepare preview + optional server ack; “Preparing preview…” / existing analyze stages |
| ready | Source chip + Replace |
| error | Validation / network / expired URL — actionable copy |
| retry | New presigned + PUT |
| cancel | AbortController; return idle |
| replace | Confirm if dirty timeline? **v1:** soft confirm only if `studioAckedRevision` advanced or local edits exist |

**Estimated progress:** Prefer real upload progress. If unknown, pulse + elapsed time — never fake 100%.

Pipeline (v1):

1. Client validate against cached policy  
2. Local `setSourceFile` for immediate preview when browser-decodable  
3. Parallel GCS presigned PUT for server authority / export  
4. MediaGraph facets as today  
5. Non-decodable: “Preview limited — export will process on server” + still complete GCS put  

Chunked resumable = **follow-up**, not EP-008 DoD.

### D4 — Onboarding (modern AI software feel)

| Rule | Spec |
|------|------|
| When | Only after first successful signup path; never interrupt returning users |
| Who skips auto-show | Users with `editor_v1.status ∈ {completed, skipped}` OR prior export history |
| UI | Backdrop blur · spotlight · smooth transition · animated pointer · one short universal sentence |
| Controls | Next · Back · Skip · Finish |
| Persist | Server `GET/PUT /api/studio/v1/me/onboarding` + local mirror |
| Replay | Settings “Replay editor tour” only |
| Teach | Interaction, not documentation |
| Budget | Entire flow understandable in **&lt; 2 minutes** |
| Performance | **Lazy-load** tour module; do not ship tour JS on critical editor path until `shouldShowTour === true` |

Steps:

1. Upload Video  
2. Paste YouTube URL  
3. AI Suggestions  
4. Chat  
5. Timeline  
6. Export  

(Preview may be taught inside Export/Timeline copy if density demands — primary list stays the six above.)

### D5 — AI Suggestions (architecture lock)

- MediaGraph only (ADR-009 / Phase 2 A5a)  
- No heuristics, no placeholders as clickable recommendations, no fake suggestions  
- Non-interactive “Analyzing…” skeleton allowed  
- Every chip traceable to facets / evidence  

### D6 — ADK (Google Agent Development Kit) Coming Soon

**Correction (2026-07-20):** Prior “Ads” interpretation is **invalid**. ADK ≠ advertisements.

- Sidebar item **ADK** (Sidebar + BottomTabBar) — future Google Agent Development Kit workspace  
- Opens ADK workspace route → entire workspace behind premium blur (`ComingSoonGate` language)  
- Center: **Coming Soon** + one short professional subtitle (advanced agent orchestration in a future release)  
- **Not** a marketing/ads page; no playful art; no temporary-looking UI  
- **Reserved IA skeleton** (visible, disabled/blurred): ADK · Agents · Workflows · Tools · Memory · Knowledge · MCP · Integrations · Automation  
- Theme-consistent, responsive, no layout shift / overflow  
- **Lazy-load** ADK Coming Soon workspace chunk  
- Full correction text: `EP-008-ADK-ARCHITECTURE-CORRECTION.md`  

### D7 — Google ADK / OS compatibility

UI must not invent a second tool system. Compatible with:

- Capability Registry (edit tools)  
- Media Graph  
- Project Document (Kernel)  
- Orchestrator  
- Future autonomous tool execution  
- Future multi-agent / Coordinator / ADK workspace workflows  

Ingest actions remain UI → store / existing APIs; agents may later call the same ingest policy + project bind without UI.

### D8 — Accessibility (explicit DoD)

- Keyboard navigation for ingest + tour + ADK Coming Soon gate focus  
- Screen readers: labels, live regions for progress, dialog roles for tour  
- Responsive layouts 320→1440  
- Touch targets ≥44px on primary ingest CTAs  
- `prefers-reduced-motion` disables pointer animation  

### D9 — Performance (explicit DoD)

| Surface | Load strategy |
|---------|----------------|
| Editor shell + URL/upload chrome | Eager (minimal) |
| Onboarding tour | Dynamic `import()` only when eligible |
| ADK Coming Soon workspace | Route-level code split |
| Ingest policy | Fetch once; cache; fail-open to last-known / embedded defaults if API down (still server-validates on PUT) |
| Heavy upload helpers | Load on first file interaction |

Must not regress editor TTI meaningfully (measure: tour code absent from initial bundle when tour not shown).

---

## 5. ADR-013 (revised summary)

See `docs/studio/adrs/ADR-013-editor-ingest-onboarding-adk.md` (formerly `…-ads.md`; Ads naming retired).

Key additions: clipboard paste (best-effort), **Media Ingest Policy API** (not EP-001), replace media, lazy-load performance budget. **2026-07-20:** D6 corrected from Ads → ADK (Google Agent Development Kit) Coming Soon + reserved IA skeleton.

---

## 6. Data models

### 6.1 Media Ingest Policy

```ts
type MediaIngestPolicy = {
  version: number;
  extensions: string[];      // ".mp4", …
  mime_types: string[];
  max_bytes: number;
  warn_bytes: number;
  examples_label: string;    // short UI string
};
```

### 6.2 User onboarding

```ts
type EditorOnboardingV1 = {
  status: "not_started" | "in_progress" | "completed" | "skipped";
  step_index: number;
  version: 1;
  updated_at: string;
};
```

### 6.3 Client ingest UI state

```ts
type IngestUiStatus =
  | "idle"
  | "validating"
  | "uploading"
  | "processing"
  | "ready"
  | "error"
  | "cancelled";
```

---

## 7. API contracts

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/studio/v1/ingest/policy` | Public-to-authed; JWT optional vs required — **v1: JWT required** (same as editor) |
| POST | `/api/video/presigned-url` | **Harden:** validate filename/ext/MIME against policy; 400 `unsupported_format` / `too_large` |
| GET | `/api/studio/v1/me/onboarding` | Editor tour state |
| PUT | `/api/studio/v1/me/onboarding` | Persist status/step |
| Existing | MediaGraph / Orchestrator / Kernel | Unchanged |

Error shape (presigned / policy violations):

```json
{ "detail": { "code": "unsupported_format", "message": "…" } }
```

---

## 8. Frontend contracts

| Piece | Role |
|-------|------|
| `IngestSurface` | Dual peer UI; replace; tour ids |
| `useIngestPolicy` | Fetch + cache policy |
| `UploadProgress` | Progress / cancel / retry |
| `EditorOnboardingTour` | Lazy spotlight controller |
| `ComingSoonGate` | ADK Coming Soon + reusable |
| ADK workspace route | Lazy route; blurred + reserved IA skeleton (Agents…Automation) |
| Empty-state copy | Upload **or** URL |

`data-tour-id`: `ingest.upload` · `ingest.url` · `ai.suggestions` · `ai.chat` · `timeline.dock` · `export.button`

---

## 9. Migration strategy

1. Ship policy endpoint with server defaults (list above).  
2. FE switches from hardcoded allowlists to policy.  
3. Onboarding: new users `not_started`; returning users with exports → auto `completed` (no interrupt).  
4. ADK Coming Soon workspace additive (never Ads).  
5. No Kernel / MediaGraph / EP-001 migrations.

---

## 10. Risk assessment

| Risk | Mitigation |
|------|------------|
| Hardcoded FE list drifts | Policy API authoritative |
| Clipboard paste unsupported | Feature-detect; no fake button |
| Tour hurts TTI | Lazy-load |
| Large file OOM | warn/max bytes from policy |
| EP-001 confusion | Ingest policy ≠ capability registry |
| Returning users annoyed | Export-history / status gates |

---

## 11. Definition of Done

- [ ] IngestSurface: Upload ≡ URL; D&D; click; mobile/desktop pickers; keyboard/SR  
- [ ] Clipboard paste when permitted  
- [ ] Backend ingest policy + presigned validation  
- [ ] FE uses policy (examples in UI only)  
- [ ] Progress / processing / errors / retry / cancel / replace  
- [ ] Onboarding once, skippable, persisted, lazy-loaded, &lt;2 min learnability target  
- [ ] Suggestions MediaGraph-only (no architecture change)  
- [ ] ADK visible Coming Soon, blurred, theme-native, reserved IA skeleton, lazy route (**not Ads**)  
- [ ] ADK/OS contracts unbroken; EP-001 untouched  
- [ ] A11y + responsive matrix  
- [ ] Performance: tour / ADK Coming Soon not on critical path when unused  
- [ ] Tests + tsc/lint + implementation report  
- [ ] Package freeze after ship  

**Out of DoD:** Chunked resumable upload, full i18n, live ADK agent orchestration features, EP-001 new edit capabilities, visual rebrand.

---

## 12. Implementation sequence (only after **final** APPROVE)

1. Ingest policy service + GET + harden presigned  
2. `useIngestPolicy` + `IngestSurface` + replace/progress  
3. Clipboard paste path (feature-detect)  
4. ComingSoonGate + ADK Coming Soon workspace + nav (lazy; reserved IA skeleton) — **after ADK≠Ads correction approved**  
5. Onboarding API + lazy tour  
6. Empty-state copy + a11y pass  
7. Verification + report + freeze  
8. **Correction follow-up:** remove invalid `/ads` Ads surface from product (code deferred until approval) 

---

## 13. Re-approval gate

Founder previously: **95/100** with mandatory additions.  
This document incorporates those additions.

**Do not implement until founder replies:**

`APPROVE EP-008 FINAL`

or

`REJECT EP-008` + deltas.

Optional confirms:

1. Media Ingest Policy API (separate from EP-001) accepted?  
2. Clipboard paste best-effort OK?  
3. Returning users never auto-toured OK?  

---

**STOP — specification updated. Awaiting FINAL approval. No implementation code in this step.**
