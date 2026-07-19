# EP-008 — Editor First-Run Product Surface (Ingest · Onboarding · Ads Gate · UX Honesty)

**Status:** DESIGN COMPLETE — **AWAITING FOUNDER APPROVAL** (no implementation until approved)  
**Priority:** P0 — product usability / first-session completion  
**Proposed ADR:** ADR-013 (Editor Ingest Parity + Interactive Onboarding + Ads Coming Soon)  
**Depends on:** EP-001 (frozen), EP-002 Kernel (frozen), EP-003 MediaGraph (frozen), EP-005 Chat-Primary Shell  
**Must not modify:** EP-001 registry ABI files; EP-002 Kernel event model; EP-003 suggestion derivation rules (A5a)  
**ADK:** Compatible — UI emits Intents / Capabilities only; orchestration remains Coordinator + registry tools  

---

## 0. Naming conflict (mandatory challenge)

| Claim in request | Repository truth |
|------------------|------------------|
| “EP-002 Planning Package” for upload/onboarding/ads | **EP-002 already exists** and is **IMPLEMENTED / frozen**: Server-Authoritative Project Document (ADR-008). Evidence: `docs/studio/packages/EP-002-server-authoritative-project-document.md`, Canonical Memory. |

**Decision for this package:** Use **EP-008**. Reusing “EP-002” would corrupt the frozen Project Kernel authority trail.  
If founder insists on renumbering, that itself requires a separate founder decision (documentation rewrite only — not this package’s code).

---

## 1. Objective

Make a **zero-experience user** succeed at:

`Import media → see grounded suggestions → chat an edit → preview → export`

…with ChatGPT-primary feel and Premiere-grade execution path underneath (Kernel + MediaGraph + Orchestrator + bake), **without** inventing suggestions or exposing unfinished Ads.

---

## 2. Verified current state (no re-audit of whole OS)

Evidence from repository reads (2026-07-20):

| Area | Reality | Gap vs vision |
|------|---------|----------------|
| YouTube URL import | First-class in `YouTubeInputStrip` + `EditorLayout` | Strong |
| Local upload CTA | **Hidden** behind `backendFailed` as “Upload MP4 instead” (`YouTubeInputStrip.tsx` L167–180) | **Critical** — not equal to URL |
| Drag-and-drop | Shell overlay in `EditorLayout` (“MP4, WebM, or MOV”) | Exists but format copy narrow; no progress UI for GCS |
| `accept=` | `video/*` only | Incomplete vs required container list |
| Presigned GCS upload | `POST /api/video/presigned-url` exists | Not wired as primary FE ingest UX with progress |
| Client file path | `setSourceFile` + blob URL + local pipeline | Works for preview; export may still need GCS bind |
| MediaGraph suggestions | EP-003 in `AIPanel` — grounded chips | Affirm — keep; no heuristics |
| Onboarding walkthrough | **No** `OnboardingTour` component in tree (stale CLAUDE note) | **Missing** |
| Ads nav | `Sidebar` / `BottomTabBar` — Dashboard, Editor, ADK, History, Settings — **no Ads item** | **Missing** Coming Soon gate |
| Chat-primary | EP-005 implemented | Affirm |
| Timeline | Visualization / dock | Affirm — teach in onboarding, not primary |

---

## 3. Product architecture review (first-time user lens)

### 3.1 Cognitive model today (problem)

1. User lands on `/editor` (after auth).  
2. Sees URL field + **Generate** — upload looks secondary or absent.  
3. Chat empty-state says “Paste a YouTube URL…” — reinforces URL-only mental model.  
4. If they somehow upload, format messaging says MP4/WebM/MOV — contradicts “production formats” ask.  
5. No guided interaction tour after signup.  
6. Ads never appear — cannot “remain blurred” until nav entry exists.

### 3.2 Target first-session story

```text
Signup success
  → /editor + Onboarding (once)
  → Spotlight: Upload Video  (user must pick a file OR skip step via explicit Skip)
  → Spotlight: Paste URL     (equal alternative)
  → Media loads → MediaGraph facets → grounded chips
  → Spotlight: Suggestion chip (optional click) OR Chat
  → Spotlight: Chat input → user types short command → Execute
  → Spotlight: Preview
  → Spotlight: Export
  → Persist onboarding complete
```

Timeline is shown as “your edits appear here” — not a tool hunt.

---

## 4. Architecture decisions (challenged)

### D1 — Ingest parity (Upload ≡ URL)

**Decision:** Replace URL-only primacy with a dual **Import Surface**:

```text
┌─────────────────────────────────────────────┐
│  [ Upload Video ]     [ Paste YouTube URL ] │  ← equal weight, always visible when no source
│  drop zone / click    URL field + Generate  │
└─────────────────────────────────────────────┘
```

- Collapsed “source loaded” chip keeps **Change** → expands both options.  
- Drag-drop remains global on editor shell.  
- Never hide Upload behind backend failure.

**Challenge:** Dual CTAs increase density.  
**Resolution:** One card, two peers; no third “magic” path. Mobile: stacked full-width buttons above URL field.

### D2 — Upload pipeline strategy (phased)

| Phase | Behavior | Why |
|-------|----------|-----|
| **v1 (this EP)** | Browser selects file → validate → **local `setSourceFile`** for instant preview + Whisper/MediaGraph edge facets; **parallel** GCS presigned PUT for server authority / export bind | Matches existing hybrid NLE; zero wait for first frame |
| **v1.1** | Chunked / resumable upload (GCS compose or tus) for > threshold | Avoids browser memory cliffs |
| **Out of scope** | Transcoding all exotic codecs in browser | Server FFmpeg / worker remux on bake |

**Challenge:** Some formats play in `<video>` poorly (AVI/WMV/MXF).  
**Resolution:** Accept for **ingest + upload**; if browser cannot decode, show “Uploaded — preview limited; export will process on server” and still bind GCS object. Never silent black canvas without message.

### D3 — Format validation (allowlist)

**Allowed extensions (v1):**  
`.mp4 .mov .mkv .webm .avi .m4v .mpeg .mpg .ts .mts .m2ts .wmv .flv .3gp .ogv`  
(+ MIME `video/*` when extension matches allowlist)

**Also allow** when MIME is trusted video type even if extension odd — but always check size.

**Reject with clear copy:** audio-only, image, exe, unknown.

**Limits (defaults — env-overridable):**

| Limit | Default | Notes |
|-------|---------|-------|
| Max file size | **2 GiB** client warn; hard reject **> 5 GiB** | Align with Cloud Run / GCS practicality; document in UI |
| Max duration (soft) | Warn > 30 min | Edit still allowed; export may chunk |
| Concurrent uploads | 1 | Avoid race on `runId` |

### D4 — Upload UX states (required)

| State | UI |
|-------|-----|
| idle | Dual import surface |
| validating | “Checking file…” |
| uploading | Progress % + cancel |
| processing_local | “Preparing preview…” |
| analyzing | Existing stage chips (transcribing / hooks) — non-clickable |
| ready | Collapsed source chip + chat/suggestions |
| error | Message + Retry + Switch to URL |
| cancelled | Return idle |

Retry = re-issue presigned URL + PUT; never reuse expired URL (>15 min per API).

### D5 — Onboarding (interactive, once)

**Trigger:** First successful signup → next authenticated `/editor` visit.  
**Storage:** Server preference preferred: Firestore `users/{id}.onboarding.editor_v1 = complete|skipped|in_progress` + step index.  
**Fallback:** `localStorage` key `qai_onboarding_editor_v1` only if server unavailable — reconcile on next session.

**Never** show again unless Settings → “Replay editor tour”.

**Mechanics:**

- Backdrop blur + dim  
- Spotlight cutout on `data-tour-id` targets  
- Animated pointer (CSS/Framer — no Lottie dependency required)  
- One short sentence ≤ 12 words  
- Controls: Back · Next · Skip · Finish  
- Progress `n / N`  
- **Action gates:** steps that require user action block Next until action OR “Skip this step”

**Steps (aligned to both requirement lists; Timeline = visualization):**

| # | Target `data-tour-id` | Sentence | Gate |
|---|----------------------|----------|------|
| 1 | `ingest.upload` | “Upload a video from your device.” | file chosen OR skip |
| 2 | `ingest.url` | “Or paste a YouTube link.” | URL validated OR skip |
| 3 | `ai.suggestions` | “AI suggests edits from your video.” | chip visible (or skeleton explained) |
| 4 | `ai.chat` | “Tell the AI what to change.” | focus chat OR type ≥1 char |
| 5 | `timeline.dock` | “Your edits show up here.” | expand once OR skip |
| 6 | `preview.canvas` | “Watch the result here.” | play OR skip |
| 7 | `export.button` | “Export when you’re happy.” | open export dialog OR skip |

**Challenge:** “User performs action before continuing” vs empty media on step 3.  
**Resolution:** If no media after 1–2, jump spotlight to ingest until one source exists; suggestions step waits for MediaGraph skeleton/ready (non-interactive skeleton allowed per A5a — not fake chips).

### D6 — Suggestions (reaffirm EP-003 / A5a)

- **Only** MediaGraph-derived `SuggestionIntent`  
- Each chip → structured Intent → Orchestrator Plan (`structured_steps`) → local apply + Kernel when flag on  
- Forbidden: title keyword maps, static creative lists, fabricated confidence  
- Allowed non-interactive: “Analyzing media…” skeleton  

### D7 — Ads Coming Soon

- Add nav item **Ads** in `Sidebar` + `BottomTabBar` (parity)  
- Route `/ads` → full-page **Coming Soon** with blur overlay + premium lock treatment (Hydro-Glass tokens)  
- No APIs, no forms, no fake metrics  
- CTA: “Notify me” optional later — **v1: no email capture required** (avoid half-feature)

### D8 — ADK compatibility

- Upload / URL / onboarding **do not** invent new tool dialects  
- All edits continue via EP-001 capability ids  
- Future Coordinator Agent can drive same ingest Intents (`IMPORT_LOCAL_MEDIA`, `IMPORT_YOUTUBE_URL` — **proposal only**; if not in registry, use existing store actions + document as UI Intent → existing capabilities).  
- **EP-001 freeze:** Do **not** add registry rows in this EP unless founder explicitly unfreezes for ingest capability ids. v1 maps UI to existing `setSourceFile` / `setSourceUrl` without new ABI.

### D9 — i18n readiness (no full i18n ship)

- All new copy via string constants module `editorCopy.ts` (English v1)  
- No hardcoded sentence soup inside tour steps beyond constants  
- RTL: spotlight uses logical CSS; defer full RTL

### D10 — Accessibility

- Tour: `role="dialog"`, `aria-modal`, focus trap, Esc = Skip confirm  
- Upload: keyboard-activable button, `aria-describedby` for formats/limits  
- Progress: `aria-valuenow`  
- Reduced motion: disable pointer animation  

---

## 5. Required ADR

**ADR-013 — Editor Ingest Parity, Interactive Onboarding, Ads Coming Soon**

Summary:

1. Upload and YouTube URL are equal first-class ingest paths.  
2. Onboarding is interactive, once-per-user, skippable, resumable.  
3. Suggestions remain MediaGraph-only (ADR-009).  
4. Ads is visible Coming Soon — never production-fake.  
5. No EP-001 ABI change in v1.  

Status: **Proposed** until founder approves EP-008.

---

## 6. Data models

### 6.1 `UserOnboardingState` (Firestore `users/{uid}` field or subdoc)

```json
{
  "editor_v1": {
    "status": "not_started | in_progress | completed | skipped",
    "step_index": 0,
    "updated_at": "ISO-8601",
    "version": 1
  }
}
```

### 6.2 `IngestJob` (optional v1.1; v1 can be client-only + GCS path)

```json
{
  "ingest_id": "hex",
  "user_id": "uid",
  "kind": "local_upload | youtube_url",
  "status": "validating | uploading | ready | failed | cancelled",
  "filename": "string?",
  "content_type": "string?",
  "byte_size": 0,
  "gcs_uri": "gs://…?",
  "run_id": "string",
  "error_code": "unsupported_format | too_large | network | expired_url | unknown?",
  "progress_pct": 0,
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

v1 may keep progress client-side only; persist `gcs_uri` on Studio project / export payload as today.

### 6.3 Format allowlist constant (shared FE)

`SUPPORTED_VIDEO_EXTENSIONS`, `MAX_UPLOAD_BYTES`, `WARN_UPLOAD_BYTES`

---

## 7. API contracts

### 7.1 Existing (reuse)

| Method | Path | Role |
|--------|------|------|
| POST | `/api/video/presigned-url` | `{ filename, content_type }` → `{ presigned_url, gcs_path, job_id, expires_in_seconds }` JWT |
| GET | `/api/info` | YouTube metadata (existing) |
| MediaGraph / Orchestrator / Kernel | unchanged | EP-002…004 |

### 7.2 New (v1 minimal)

| Method | Path | Body / Response |
|--------|------|-----------------|
| GET | `/api/studio/v1/me/onboarding` | → `UserOnboardingState.editor_v1` |
| PUT | `/api/studio/v1/me/onboarding` | `{ status, step_index }` → ack |

Auth: `get_verified_user_id`. No admin secret.

### 7.3 Future (explicitly not in DoD)

- Resumable chunked upload session API  
- Server-side media probe (`ffprobe`) endpoint  

---

## 8. Frontend contracts

### 8.1 Components (proposed)

| Component | Responsibility |
|-----------|----------------|
| `IngestSurface` | Dual Upload + URL; owns `data-tour-id`s |
| `UploadProgress` | % / cancel / error |
| `EditorOnboardingTour` | Spotlight controller |
| `ComingSoonGate` | Reusable blur + “Coming Soon” |
| `AdsPage` | `/ads` using ComingSoonGate |
| Refactor | `YouTubeInputStrip` → compose into `IngestSurface` (no duplicate URL logic) |

### 8.2 Store fields

- `ingestStatus`, `ingestProgress`, `ingestError` on `editorStore` or small `ingestStore`  
- Tour reads/writes onboarding API; local cache mirror  

### 8.3 Tour target attributes

Stable selectors: `data-tour-id="ingest.upload" | ingest.url | ai.suggestions | ai.chat | timeline.dock | preview.canvas | export.button"`

---

## 9. Backend contracts

- Onboarding GET/PUT as above (Firestore)  
- Presigned URL: optionally validate extension allowlist server-side (reject bad suffix) — **recommended hardening**  
- No change to Kernel / MediaGraph schemas  

---

## 10. Migration strategy

1. Ship FE `IngestSurface` + tour behind no flag (UX) — Kernel flag already independent.  
2. Onboarding API: default `not_started` for existing users → **do not auto-force tour** for accounts older than cutoff; only `created_at >= EP-008 ship` OR explicit `editor_v1.status` missing **and** `export_count == 0` heuristic.  
   **Safer rule:** Show tour only if `status === not_started` **and** user has never completed an export (stats) **and** never skipped. Existing power users: set `completed` via one-time migration script optional.  
3. Ads nav: additive; no DB migration.  
4. Dual-run: ADK Studio `/adk` untouched.

---

## 11. Risk assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Large local files OOM browser | High | Size gate; GCS-first for >512MB; progress honesty |
| Codec not decodable in browser | Med | Explicit “preview limited” state |
| Tour blocks returning users | High | Strict once + skip + Settings replay only |
| Naming EP-002 collision if ignored | High | Package id **EP-008** only |
| Fake suggestions regression | High | No new suggestion sources; reuse MediaGraph only |
| Ads looks unfinished | Med | ComingSoonGate design tokens + no interactive controls |
| Presigned 15m expiry mid-upload | Med | Restart upload UX; v1.1 resumable |
| i18n later breaks tour copy | Low | Centralize strings |

---

## 12. Definition of Done

- [ ] Upload CTA always visible beside/above URL (desktop + mobile stacked)  
- [ ] Drag-drop + click-to-upload both work  
- [ ] Allowlist validation + clear errors for unsupported types  
- [ ] Upload progress + cancel + retry  
- [ ] YouTube path unchanged in success cases  
- [ ] Onboarding once after first signup path; skip/resume/finish persisted  
- [ ] Spotlight + blur + short copy + progress  
- [ ] Suggestions still MediaGraph-only (no heuristics)  
- [ ] Ads nav + blurred Coming Soon page  
- [ ] Keyboard + screen-reader pass on new surfaces  
- [ ] `tsc` / lint / critical FE smoke  
- [ ] EP-001 files untouched  
- [ ] ADR-013 accepted + package frozen  
- [ ] Implementation report filed  

**Out of DoD:** Chunked resumable protocol, full i18n, multiplayer, EP-001 new capabilities, ADK wizard redesign.

---

## 13. Implementation sequence (post-approval only)

1. Shared format/limit constants + server suffix check on presigned  
2. `IngestSurface` + wire `EditorLayout` / retire hidden upload  
3. Upload progress + GCS parallel put + error/retry  
4. `ComingSoonGate` + `/ads` + nav parity  
5. Onboarding API + `EditorOnboardingTour` + `data-tour-id` hooks  
6. Empty-state copy alignment (chat/canvas → mention Upload **or** URL)  
7. A11y + responsive QA matrix (320 / 768 / 1024 / 1440)  
8. Verification gate + freeze EP-008  

---

## 14. UI review findings → recommendations (usability only)

| Finding | Recommendation |
|---------|----------------|
| Upload discoverability fail | D1 IngestSurface |
| “Generate” jargon | Keep for URL analyze; Upload button label **Upload Video** (not Generate) |
| Format copy inconsistent | Single allowlist string in UI |
| No progress for file put | UploadProgress |
| Chat empty ignores upload | Update empty copy |
| No Ads Coming Soon | D7 |
| No tour | D5 |
| Advanced panels still optional | Keep `?advanced=1` — tour never requires them |
| Mobile URL bar crowding | Stack Upload full-width; URL row below |
| Brand “Shorts” in sidebar | Out of scope cosmetic — optional follow-up |

---

## 15. Explicit non-goals

- Visual rebrand / new design system  
- Regenerating Phase 2 audit docs  
- Implementing before approval  
- Reopening EP-001 / EP-002 Kernel  
- Shipping Ads functionality  

---

## 16. Approval gate questions for founder

Reply **APPROVE EP-008** (optionally with edits) or **REJECT** with deltas.

1. Confirm package id **EP-008** (not EP-002).  
2. Confirm max upload defaults (2 GiB warn / 5 GiB hard) OK for cost.  
3. Confirm Ads nav label exactly **“Ads”**.  
4. Confirm tour for **new users only** (existing users not forced).  
5. Confirm v1 **no** new EP-001 capability rows for ingest.

---

**STOP — awaiting approval. No implementation code in this step.**
