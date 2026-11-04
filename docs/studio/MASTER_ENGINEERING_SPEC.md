# QUICKAI / CREATIVE OS — MASTER ENGINEERING SPECIFICATION

**Version:** 1.0 | **Date:** 2026-11-03  
**Product lineage:** QuickAI Short → QuickAI Studio → Creative OS  
**Repository:** https://github.com/HassaanFisky/quickaishort  
**Status:** Consolidated engineering baseline + target specification. This is not a claim that every target capability is already implemented.

## Evidence, scope and authority

This document consolidates accessible stored memory, relevant Library artifacts, the publicly accessible QuickAI repository README and architecture documents, and official technical references current on 2026-11-03. It is **not possible to certify that literally every historical ChatGPT conversation was inspected**; only history, summaries and files surfaced to this session were available. Details not recoverable are labelled as proposals or assumptions rather than presented as remembered facts.

Truth order: **current source code + executable tests at a pinned SHA > accepted ADRs/frozen EPs > canonical Studio docs and README > historical reports/agent outputs/brainstorms > this target-state spec.** Never silently change a frozen contract: write an ADR, prove need, provide compatible migration and test it.

Binding contracts: EP-001 is the sole capability ABI; ADR-008 Project Kernel is project-state authority; ADR-009 MediaGraph is evidence/suggestion authority; ADR-010 owns orchestration plan jobs; ADR-012/EP-006 defines Kernel-snapshot baking; ADR-016 defines Decision-Gated Edit.

### Status vocabulary

| Label | Meaning |
|---|---|
| `LIVE_DOCUMENTED` | Described as production behavior by repo docs; not independently live-smoke-tested here. |
| `IMPLEMENTED_REPO_DOCS` | Repo says implemented, possibly behind flags or in dual-run. |
| `PARTIAL` | Some execution exists; important parity/coverage/verification is missing. |
| `ROADMAP` | Desired or deferred; do not market as complete. |
| `BRANCH_ONLY / UNVERIFIED_DEPLOY` | Historical branch/work-log mention; merge/deployment unproven. |
| `PROPOSED` | Target design in this specification, not current code. |
| `HISTORICAL_HYPOTHESIS` | Old pricing/implementation proposal; re-measure before adoption. |

### Current product boundary (repository docs, not production probe)

- **QuickAI Short** is the current product: YouTube URL/local video intake, browser-side Whisper transcription, conversational editing, media-grounded suggestions, live preview, multi-track timeline visualization and final server export.
- **QuickAI Studio** is the same codebase evolving into a project-aware AI-native video editing OS, not a separate rewrite.
- Studio Kernel foundations are documented under flags/dual-run: Capability Registry, Project Document/Kernel, MediaGraph, Orchestrator plan jobs, chat-primary shell and Kernel-based Manifest bake. This does not mean every end-to-end OS workflow is complete.
- Dead-air, shorts-packaging and restore-opening have documented deterministic Decision Intelligence paths before paid Gemini. General creative chat uses the Gemini DualModelRouter in the documented baseline.
- Pre-Flight is an optional Google ADK audience-simulation skill, not the product brain. `/adk` is documented as Coming Soon, not a live creator wizard.
- Production render path in current README/roadmap: Cloud Tasks `quickai-render` → private Cloud Run `quickai-worker` (`min=0`, request CPU, low concurrency) → FFmpeg → GCS. RQ is local/dev fallback; older docs describing RQ as production authority are stale.
- GCS is primary media storage. MongoDB GridFS is legacy `/api/v1/video/*`. Firestore holds Studio/product state. Redis holds hot/ephemeral locks, status, dedupe, cancellation, cooldowns; it is not project truth.
- Browser WebCodecs/MediaRecorder are local preview/share paths where supported; server render remains the final export authority in the documented production flow.
- `AUTO_REFRAME` / speaker reframing is documented as not emit-allowed. No false success message or export claim until final-renderer parity exists.
- Full multi-turn native tool loop, Tier-1 outcome verification, unified cross-media engine, movie-length dubbing, multiplayer and broad external-app control are not proven complete in accessible docs.

---

# 1. Complete Product Ecosystem & Vision Inventory

## 1.1 One lineage, three horizons

```text
QUICKAI SHORT (today)
  Long video → candidate shorts → captions → preview → verified export
          │ same codebase, accounts, assets and users
          ▼
QUICKAI STUDIO (near-term)
  Conversational video editing OS
  User = Director | AI = Editor | Registered tools = Craft
          │ same Creative Kernel, expanded media domains
          ▼
CREATIVE OS (long-term)
  One intelligence/control layer over specialist engines:
  Video | Image | Vector | Audio | Motion | PDF/Docs | Design/Decks | 3D
```

One commercial product family: common account, workspace, project model, asset graph, registry, memory, policy, usage ledger and orchestration. Do not split this into unrelated apps or implement every engine simultaneously. Ship the video loop first, then attach engines through CTIL.

## 1.2 Product and module inventory

| Product / module | Purpose and connection | Current evidence status |
|---|---|---|
| QuickAI Short | Original commercial entry product: long-form video into short-form output. | `LIVE_DOCUMENTED` |
| QuickAI Studio | Project-aware conversational editing evolution in same codebase. | Kernel foundation `IMPLEMENTED_REPO_DOCS`; full OS incomplete. |
| Creative Kernel | Shared project, event, capability, permission and execution substrate. | Studio foundations exist; cross-engine expansion `PROPOSED`. |
| Creative Tool Intelligence Layer (CTIL) | Machine-readable product knowledge, command schemas, tool routing and proof. | `PROPOSED`, grounded in EP-001, Kernel, MediaGraph and Orchestrator. |
| Video Runtime | NLE timeline, tracks, edit ops, effects, audio, timebase and export. | Existing editor/render path; professional parity `PARTIAL`. |
| Shorts ModePack | 9:16/1:1/4:5 presets, hooks, captions, pacing, safe zones and platform rules. | Basic shorts path exists; full pack `PARTIAL/PROPOSED`. |
| Image Runtime | Non-destructive photo editing: layers, masks, exposure, curves, retouch, transforms, compositing. | `PROPOSED`; PhotoCraft candidate, not integrated. |
| Vector Runtime | Paths, bezier, nodes, boolean geometry, typography, SVG/PDF export. | `PROPOSED`; VectorCraft candidate. |
| Audio Runtime | Multitrack audio cleanup, EQ, compression, loudness, voiceover, music and SFX. | Video audio tools exist; standalone engine `PROPOSED`. |
| Motion / Effects Runtime | Titles, transitions, animation graph, keyframes, compositing and motion graphics. | Some timeline effects/keyframes partial; full runtime `PROPOSED`. |
| PDF / Document Runtime | Inspect, annotate, redact, compose and export PDF/document tasks. | `PROPOSED`; PdfCraft candidate. |
| Design / Deck / Publishing Runtime | Layout, social graphics, presentations, typography and multi-page publishing. | `PROPOSED`; DesignCraft/DeckCraft/WordCraft candidate refs. |
| 3D / Scene Runtime | Scene graph, meshes, textures, cameras, character poses, scene blocking and composition. | `PROPOSED`; ArtCraft concept reference. |
| Pre-Flight | Six-persona audience simulation and grounded consensus/quality review. | `PARTIAL`, optional ADK skill only. |
| Viral Analysis | Candidate moment/segment discovery and scoring. | Some pipeline/cache documented; coverage not guaranteed. |
| Director / Storyboard | Brief to outline, storyboard and shot-list support. | Storyboard path documented; workflow integration needs verification. |
| Script / Asset Agent | Script refinement, asset search, stock/B-roll and TTS helper tasks. | Scaffolds/helpers documented; full workflow not shipped. |
| Asset / B-roll Intelligence | Search creator library first, then licensed stock, then paid generation if approved. | B-roll automation `ROADMAP`. |
| Dub Video | Translate, synthesize target-language voice, align, subtitle and replace/overlay source audio. | ADR-014 shorts path documented code-complete; provider/deploy smoke historically gated; movie-length deferred. |
| Voice Command Plane | Voice as input modality into same decision/tool system. | On-device speech-plane branch mentioned; production deployment unverified. |
| Workflow Recipes | Repeatable multi-step edit, packaging, batch and automation jobs. | Plan jobs exist; closed loop incomplete. |
| Chrome YouTube Extension | One-click YouTube-to-editor handoff. | MV3 extension documented. |
| Creator Brand Kit | Logos, palettes, fonts, captions, safe zones and export defaults. | Mentioned retention feature; full implementation unverified. |
| Creator Memory | Explicit persistent preferences and accepted/rejected patterns. | `PROPOSED`. |
| Team / Agency workspace | Shared kits, batch jobs, approvals, roles and handoff. | EP-007 collaboration design; multiplayer founder-gated/deferred. |
| Social publishing / analytics / remix | Scheduling, post performance and repeatable format remix. | Historical retention ideas; `PROPOSED`. |

## 1.3 Shared platform contracts

All engines reuse: tenant identity and authorization; usage ledger/cost attribution; Project Kernel and monotonic revisions; asset identity/hash/provenance; CTIL registry/knowledge; DecisionRecord/DAG/execution receipts; creator/project memory; async jobs/runId/cancellation; verification/checkpoint/rollback/audit; open-format import/export.

Media models remain specialised. Video is tracks/time/keyframes, image is layers/pixels/masks, vector is paths/geometry, audio is samples/tracks, PDF is pages/objects, 3D is scenes/meshes. A unified shell and capability contract do not require a single monolithic renderer.

## 1.4 Native engines and open-source candidates

- **PhotoCraft** (`https://github.com/storytold/photocraft`): Rust photo editor. Current README describes a shared registry of 500+ commands used by UI, CLI, JSON control and MCP; CLI supports inspect/run/batch and MCP. Excellent command-first reference. Repo reports Apache-2.0 and MIT licenses as found; audit each dependency, bundled font, asset and content separately. Stars indicate interest, not professional parity.
- **FilmCraft** (`https://github.com/storytold/filmcraft`): Rust NLE. README describes command-driven editing, integer timeline ticks, GPU composition, scopes, effects, keyframes, autosave and crash recovery. Treat features as project claims until tested against real media corpus. Repo metadata reports Apache-2.0; inspect codec build flags and transitive licenses.
- **ArtCraft** (`https://github.com/storytold/artcraft`): creative IDE for AI image/video and 2D/3D compositing, scene blocking, character posing and mixed assets. Reference/integration candidate, not assumed replacement for the entire suite.
- VectorCraft, LightCraft, PdfCraft, EffectCraft, DesignCraft, SoundCraft, DeckCraft, WordCraft, CADCraft, TextureCraft and related projects are module-by-module candidates only.

**Adoption gate:** source, licence, assets, dependencies, tests, performance, formats, security, maintenance, command coverage, API stability and data portability. Pin exact commit and prove an isolated adapter before adopting/forking. Never assume every external repository is mature or production-ready.

---

# 2. Every User Workflow, Feature & UX Requirement

## 2.1 Primary interaction pattern

**Conversation is the control plane; canvas/timeline is the inspection and precision-control surface.** The AI understands the goal, current project and evidence; proposes operations; calls actual tools; verifies the result; updates state and explains exactly what changed.

```text
Intent → active project/assets → compact context + MediaGraph + brand/policy
  → DecisionRecord (ACT | ASK | RESEARCH | SIMULATE | DEFER | NOTHING)
  → discover relevant EP-001 capabilities → DAG plan
  → validate params/preconditions/permissions/budget
  → execute native/client/server/render tool
  → observe ToolResults → verify postconditions and artifact
  → commit ProjectEvents or compensate/rollback
  → preview + semantic history + chat receipt
```

A model's JSON, optimistic client patch, HTTP 200, queued task or file existence alone does not prove an operation succeeded.

## 2.2 One-click viral short

1. Paste eligible video URL or upload creator-owned local file.
2. Run staged ingest FSM: `identify → validate → acquire_meta → projectize → analyze → ready | failed`.
3. Reuse cached artifacts when source hash and pipeline version match.
4. Transcribe in browser Worker/local Whisper when device supports it; calculate speech regions, silence, energy and timing locally where feasible.
5. Build MediaGraph facets: duration, transcript, silence, captions, candidate moments, aspect ratio and visual observations.
6. Score candidates using evidence: hook onset, novelty, topic boundary, speech clarity, pacing, completion and context. Store provenance/confidence; model estimates are not facts.
7. Return ranked candidates with start/end timecodes and reasons.
8. Plan hook placement, pause/filler reduction, trim, captions, style, crop, audio, safe-zone and export.
9. Apply deterministic eligible steps without LLM call; ask when meaning or intent is ambiguous.
10. Auto-reframe only if `AUTO_REFRAME` is truly emit-allowed and final renderer supports it; current baseline says it is not.
11. Preview with visual cut markers and caption timing.
12. Apply Brand Kit if configured.
13. Verify preview invariants; submit server render for final export.
14. Verify actual output bytes and media streams before download/share.
15. Optionally run Pre-Flight on request; do not run a multi-agent panel on every edit.
16. Suggest title/description/hashtags/thumbnail candidates grounded in the content; frame extraction is not generative image creation.

Acceptance: source-to-verified-short with no fabricated timecodes, no silent destructive rewrite, no missing audio/video stream and no false completion.

## 2.3 Conversational semantic editing

Examples to map into structured plans only when capabilities exist:

- “Remove awkward silences, but keep natural breaths.”
- “Increase pacing without making speech unnatural.”
- “Restore the original opening.”
- “Make a premium YouTube Short.”
- “Make it brighter, preserve skin and don't wash out the window.”
- “Reduce highlights, lift shadows slightly and retain contrast.”
- “Make the image cleaner, cinematic, warmer or less harsh.”
- “Bring the subject forward without damaging skin tones.”
- “Move the hook before the explanation, but keep meaning.”
- “Shorten the outro to a 10-second CTA.”
- “Keep original dialogue and lower music under speech.”

These are semantic goals, not universal slider numbers. Map them to bounded parameter ranges and constraints using evidence. Explain which observations justify the settings. Ask or simulate when the result is subjective or materially risky.

## 2.4 Multi-track timeline / NLE

Target a professional subset, incrementally:

- Video, audio, text/caption, overlay, effect and marker tracks; linking, mute/solo/lock, track targeting, waveforms and thumbnails.
- Insert/overwrite/append, trim, split/razor, ripple delete, close gap, roll, slip, slide, rate stretch, snapping, linked selection and three-point editing.
- J-cuts/L-cuts, match frame, nested sequences, copy/paste/paste-insert, named/coloured markers and marker export.
- Time-remapping and speed ramps; interpolation choice and maintain-audio-pitch control.
- Keyframes for position, scale, rotation, anchor, opacity, effect parameters and volume; easing/value graphs when supported.
- Transitions: dissolve, dip, wipe, push, slide, zoom; each requires explicit capability status.
- Effects: blur, sharpen, chroma key, transform, stabilization, masks, colour correction, LUT-like transforms and compositing.
- Colour pipeline: exposure, contrast, temperature, tint, highlights, shadows, whites, blacks, saturation, vibrance, curves, wheels, HSL secondary, vignette, waveform and vectorscope.
- Audio: gain/fades, denoise, EQ, compression, limiter, loudness normalization, ducking, music, SFX and dialogue track management.
- Undo/redo and named checkpoints through Kernel events, plus branch-from-revision.

The FilmCraft README is a useful parity benchmark, not proof that QuickAI already implements all those functions.

## 2.5 Long-form optimization

Recovered example: “This video is 22:14; get it under 12:00 without losing key arguments.” A proposed plan may:

1. Identify repetitive segments near 4:12, 11:30 and 18:45 if semantic/transcript evidence supports removal.
2. Tighten a 1:45 intro toward 0:30 while preserving necessary setup.
3. Remove about 47 filler/pause zones only where transcript timing agrees; preserve breaths and turn-taking.
4. Flag a potentially duplicated argument for human review rather than auto-delete.
5. Detect talking-head segments over 45 seconds with low visual variety; search user library for B-roll first.
6. Tighten a 2:30 outro toward a shorter CTA if the brief supports it.
7. Generate thumbnail frame candidates by extraction; separate this from paid generative output.

Plan UI shows duration savings, source timecodes, risk, confidence, costs, dependencies and reversibility. Offer **Approve All**, **Review Step by Step**, **Modify Plan**, **Cancel**. Subjective edits should require human approval.

## 2.6 Documentary production — canonical 15-stage blueprint

A verbatim historical 15-step checklist was not recoverable from accessible files. This is the proposed canonical 15-stage workflow, not a claim that it reproduces a missing earlier list.

| Stage | Operation | Output / gate |
|---|---|---|
| 1 | Brief & audience: subject, objective, audience, runtime, platform, tone, references, constraints. | Versioned CreativeBrief; open questions. |
| 2 | Rights & source intake: user footage, interviews, archival, releases, stock and notes. | Provenance, rights attestation, asset IDs. |
| 3 | Technical ingest QC: codecs, FPS, audio, resolution, orientation, corruption and duplicates. | Media inventory / failures. |
| 4 | Transcription & speaker map: ASR, word times, diarization where available, locale and corrections. | Transcript, speaker IDs, confidence and timings. |
| 5 | Research & fact ledger: source notes, citations, claims and conflicting evidence. | Evidence ledger; inferred facts kept distinct. |
| 6 | Story architecture: thesis, acts, beats, chronology and emotional progression. | Outline and open questions. |
| 7 | Script & narration: voiceover, interview selects, transitions and quote preservation. | Script version, VO cues, fact-review flags. |
| 8 | Storyboard & shot list: scenes, shots, visual intent, camera, graphics and B-roll needs. | Storyboard, missing-shot list and estimate. |
| 9 | Selects & bins: interviews, scene selects, archive, B-roll, music and graphics. | Select reels, bins and asset index. |
| 10 | Assembly edit: dialogue, narration, picture, sequence and markers. | Frame-accurate rough cut. |
| 11 | Visual coverage: creator library first, approved stock next, generative only with approval/cost. | Linked assets and rights provenance. |
| 12 | Structure & pacing: repetition, scene order, J/L cuts, transitions, act length and clarity. | Approved plan; human gate for meaning changes. |
| 13 | Localization/subtitles: translate, dub, align, subtitle, preserve names/terms and speaker consent. | Locale tracks and QA. |
| 14 | Colour/audio/motion finish: grade, dialogue cleanup, loudness, ducking, effects, titles and credits. | Mastering settings and preview. |
| 15 | Final QC/version/delivery: file decode, runtime, FPS, audio, captions, colour, rights, safe area and platform exports. | Approved master, variants, archive and delivery receipt. |

Human gates: factual/legal claims; edits that change meaning; sensitive archive use; voice cloning; paid generative assets; final approval and publication.

## 2.7 Multi-locale dubbing

ADR-014 shorts flow documented as translate → TTS → align → preview → export with source audio mute/replace. Historical docs refer to English-source v1; movie-length dubbing is deferred.

1. Resolve source language, speaker segments and word timing.
2. Select BCP-47 target locale, voice and style; show provider/cost.
3. Translate segment-by-segment with glossary, proper-name lock and subtitle line constraints.
4. Synthesize voice only with provider and rights/consent recorded; no unauthorized real-person voice imitation.
5. Align speech; detect overlaps, gaps, speed distortion and drift.
6. Preview audio/captions; offer voiceover-only, full-dub or captions-only.
7. Render through Manifest, not a parallel option bag.
8. On TTS failure, explicitly degrade to captions-only if valid captions exist; never claim full dub.
9. QA reading speed, clipping, names, pronunciation, speaker changes and sync.
10. Cache by source hash, transcript revision, translation/model/voice/settings.

## 2.8 Brand Kit

Creator/project-level fields: brand name; logo variants and clear-space; primary/secondary/accent colours; colour profile/contrast pairs; fonts/weights/fallback and glyph coverage; licence metadata; caption font/size/stroke/background/line count/highlight/animation/position/safe-area; title/lower-third/intro/outro/CTA/bumper/end-card templates; motion/transition preference; music mood; loudness targets; platform export defaults; per-project overrides and version history. Missing font must warn rather than silently claim exact branding.

## 2.9 Voice-enabled workflows

- Push-to-talk first; opt-in microphone; visible recording/listening state, cancel and mute.
- Browser speech capture or local Whisper/WASM Worker when device supports it. No hidden paid cloud STT fallback when local-only privacy/cost policy applies.
- Resolve voice transcript into the same intent/DecisionRecord/EP-001 path.
- Ask for confirmation on destructive or paid actions; safe playback/seek/zoom can be direct.
- Support interruption, cancellation, language detection, punctuation correction and transcript editing.
- No always-on wake word without separate explicit consent.
- TTS, dubbing and voiceover are output capabilities; Gemini 4 Argon itself does not generate audio.

On-device speech plane and lazy upload/mobile share appeared in a branch/work log; production deployment is unverified.

## 2.10 Mobile/local-first UX

- All import routes use one `useIngestLifecycle` FSM.
- Cache eligible analysis in IndexedDB; restore sessions without repeat upload.
- Avoid uploading entire local source until server render, durable cloud project or explicit share needs it. Lazy upload was branch-level and must be verified before adoption.
- Feature-detect WebCodecs/MediaRecorder and codecs; offer Safari fallback. Release VideoFrames/AudioData, object URLs, workers and decode buffers.
- Large media uses proxies, thumbnails, chunked decode, bounded frame caches and incremental seek.
- Web Share is convenience, not source-of-truth save.

## 2.11 UX and visual design

- Header: project title, Kernel revision, sync state, export, account/usage.
- Left: chat, decision cards, plan inspector and history.
- Centre: preview canvas/player and synchronized timeline/waveform.
- Right: Media Inspector/MediaGraph, waveform stats, subtitle grid, capability status.
- Decision cards show evidence, expected changes, cost, risk, reversibility and approval.
- Silence segments appear over waveform; historic design proposed amber translucent overlays.
- Preview-only/unsupported badges disable execute.
- Progress must map to real FSM/job stage, not fake percentages.
- Actionable suggestions must be MediaGraph-backed, not title-keyword heuristics.
- Chat-primary; timeline/canvas for inspection and precision, not a traditional NLE with decorative AI chat.
- Historical “Hydro-Glass” concept: dark base `#08090C`, translucent slate surfaces, cyan/violet accent, amber warning, crimson error, green verified. Optional design tokens only; maintain WCAG contrast/reduced motion.

## 2.12 Semantic history and restore

Every committed mutation yields a human-readable event linked to plan, capability, command and revision. Support undo/redo via compensation/replay, named restore points, branch-from-revision, diff before restore, actor provenance and declared reversibility. Audit history is append-only; correction is a compensating event, not silent rewrite.

## 2.13 Past bugs / bottlenecks to permanently prevent

Historical findings/risk notes, not proof each bug still exists on main:

| Area | Reported risk | Permanent rule |
|---|---|---|
| Timeline/playhead | A/V sync drift. | Rational authoritative timebase; shared frame/sample conversion; regression fixtures. |
| Browser media | Large-video memory leak/jank. | Workers, bounded caches, proxy mode, deterministic cleanup and cancellation. |
| React state | `/editor` max-update-depth traced to `ServerExportHost` rewriting a new `cancelExport` callback into store each render. | Stable callback, no-op store writes suppressed, regression test. |
| Ingest | Duplicate GCS PUT / repeat analysis. | Single FSM, hash idempotency, IndexedDB cache, explicit upload lifecycle. |
| Suggestions | Static keyword chips without media proof. | MediaGraph-only action suggestions. |
| AI schema | Duplicate FE/BE tool dialects. | EP-001 only; generate types/declarations from one source. |
| API latency | Synchronous command path near 30s unsuitable for compound jobs. | Async Plan Jobs, streams, cancellation, resume. |
| Orchestration | Model action list mistaken for completed execution. | Plan → execute → observe → verify → commit/compensate. |
| Export | Manifest options diverge from preview. | Kernel snapshot + Manifest single bake IR; manifest fidelity P0. |
| Render | Audio dropped / duration drift. | ffprobe + decode/audio verification; bounded recovery. Historic proposal: one retry for >0.75s drift; calibrate per profile. |
| Queue | Duplicate or stale job overwrites newer output. | runId, revision pin, idempotency, object generation checks. |
| Legacy | Dual queue/media plane confusion. | Cloud Tasks prod SoT; RQ local/dev; retire GridFS only after traffic proof. |
| Security | Historical backlog on proxy/audio/info routes, rate limits, ADMIN_SECRET, public GCS ACL. | Re-probe and close all unauthenticated spend/bandwidth paths. |
| Acquisition | yt-dlp fragility and YouTube copyright/platform risk. | User-owned uploads, rights attestation, platform terms; no DRM/access-control bypass. |
| Billing | Retry/tab double-charging. | Atomic reserve/commit/refund ledger and idempotency. |
| Truth | Static tests presented as production proof. | Record SHA, CI, deployed revision and live smoke separately. |
| UX | `/adk` Coming Soon misrepresented as live. | Hide or clearly badge. |
| Capability | AUTO_REFRAME preview path treated as export support. | Fail-closed until handler and verifier exist. |

---

# 3. Upgraded 2026 State-of-the-Art Architecture (Future-Proof & Unbeatable)

“Unbeatable” cannot be guaranteed. The target is a defensible architecture: testable, modular, cost-aware, reliable, secure, portable and expandable without core rewrites.

## 3.1 Architecture decision

**Do not train a foundation model from scratch.** Build proprietary orchestration, CTIL, media understanding, project/creator memory, workflow recipes, verification, recovery and product UX. Use frontier models as replaceable reasoning services and specialist models as replaceable media services. Training a competitive multimodal base model requires data, compute, safety and research budgets outside a bootstrapped product. Fine-tuning may later be justified for a measured narrow task using consented data, only after retrieval/tooling approaches are evaluated.

## 3.2 Model routing

### Gemini 4 Argon (`gemini-4-argon`) candidate

As of 2026-11-03, Google documents Argon with unified 1,048,576 input/output tokens; inputs text/image/video/audio/PDF; output text; standard synchronous max output 65,536 and long decode up to 1M; function calling, structured outputs, code execution, computer use, file search, search grounding and thinking `low|medium|high`. It does **not** support image generation, audio generation or Live API. It is a planning/reasoning/orchestration candidate, not a media renderer or realtime voice engine. It is not the currently documented QuickAI runtime model; repo docs describe Gemini 2.5 Flash. Integrate only after ADR, evals, latency/cost budget and deployed smoke.

Google's then-current intro pricing through 2026-11-30: $2/1M input and $10/1M output; from 2026-12-01: $4/1M input and $20/1M output. Cached input can receive 95% discount; thinking/schema/tool tokens count. Argon is not on Free tier. Recheck price immediately before deployment.

### Tiered routing

| Workload | Route | Spend rule |
|---|---|---|
| Explicit trim/split/seek/volume/playback | Local deterministic engine | 0 LLM and 0 AI credits; device/compute is not literally free. |
| Simple intent alias | Rules or smallest reliable structured model | Call model only if ambiguity remains. |
| Compound evidence-backed edit plan | Primary orchestrator low/medium reasoning | Relevant schemas only; cache by revision/context hash. |
| Ambiguous/high-impact narrative or design choice | Argon high reasoning when justified | ASK/SIMULATE if evidence weak; human approval. |
| ASR | Browser/local Whisper, specialist ASR if opted-in | No hidden paid cloud fallback. |
| Translation/TTS | Specialist translation + TTS | Locale-specific quality/cost/consent gate. |
| Image generation | Image model/provider | Argon can plan but cannot generate image. |
| Video generation | Video specialist | Optional paid operation; bounded length/resolution. |
| Music/SFX | Audio generation provider or licensed asset | Argon cannot generate audio. |
| Media measurement | FFmpeg, WebAudio, MediaPipe/OpenCV/native | Do not ask LLM to guess measurable facts. |
| Deep code/research | Argon grounded in repo/source evidence | Compact context packet, not full unrelated history. |

0-credit means no AI/model charge and no AI-credit debit—not zero storage, CPU, network, device battery or operating cost.

### Provider abstraction

`ModelProvider` adapter requires stable task IDs, modalities/schema/version, limits, timeout, price estimator, usage receipt, structured-output validator, bounded repair, retries/cooldowns/circuit breaker, cancellation, model provenance and eval gate. Never expose keys to client or logs. A 1M context window is not a reason to send everything.

## 3.3 Agent topology

Use **one deterministic orchestration authority plus conditional specialist skills**:

- Primary Decision/Workflow Orchestrator handles intent, plans, policy and scheduling.
- Deterministic engines perform edits.
- Specialist skills: media analysis, story director, viral scoring, Pre-Flight, script/translation, B-roll search, accessibility/caption QA, render QA, security/compliance.
- Parallelize independent read-only analyses or asset searches, not writes against same project revision.
- No agent writes project state directly. All mutation: EP-001 → Kernel → receipt → verification.
- Pre-Flight's six personas run only when asked or required by publish gate.
- Optional independent reviewer for high-risk plans; no permanent agent debate loop.

## 3.4 Native command-driven engines

Preferred order: native engine API → headless CLI → JSON-lines/local authenticated control channel → MCP adapter → accessibility/keyboard automation → computer-use/mouse fallback. Mouse clicks alone are fragile and hard to verify. PhotoCraft's 500+ shared command registry pattern (UI/CLI/JSON/MCP) is the reference. Tool knowledge must include actual command schemas, version, preconditions, side effects, permissions, undo, execution locus and postconditions. A menu entry without an executable command is not an AI capability.

## 3.5 Content-addressable MediaGraph

```text
MediaAsset: asset_id, tenant_id, sha256_source, generation, media_type,
 original_filename, content_type, byte_size, rights/provenance, storage_uri, state

AnalysisArtifact: artifact_id, asset_id, source_hash, pipeline_id/version,
 provider/model/version, facet_type, locale, status, quality, output_hash, storage_uri

MediaGraph: graph_id, project_id/asset_id, monotonic revision,
 facets {duration, transcript, silence, speakers, scenes, faces, motion,
 captions, objects, composition, loudness, candidate_moments},
 each facet {status, version, provenance, confidence, time_ranges}
```

Identity is based on source bytes plus explicit metadata, not filename. Reprocessing creates a new artifact version. Cache includes source hash + pipeline version + model/provider + options. Hash does not prove ownership or legality. Missing evidence is `missing/pending/error`, not zero. Store large transcripts/waveforms/embeddings in GCS with Firestore pointers. Avoid cross-tenant hash-existence leaks.

## 3.6 Monotonic Project Revision Kernel

- `expected_revision` on every mutation; append-only events; increment `head_revision` atomically.
- Snapshot/reducer to bound event replay. RenderManifest is compiled IR for a revision, not the audit log.
- Export pins project ID + revision. Later edits cannot mutate a queued render's source state.
- NLE edits are non-commutative; use optimistic concurrency + per-project serialisation for conflicting writes. No CRDT by default in v1.
- Zustand is an optimistic UI projection/cache, not source of truth.
- ToolResult references plan/step/command/event IDs and before/after revision + verifier.

```json
{
  "event_id":"uuid", "project_id":"uuid", "revision":184,
  "expected_revision":183, "command_id":"uuid",
  "capability_id":"REMOVE_SILENCES", "actor":{"type":"ai_agent","id":"orchestrator"},
  "payload_ref":"gs://.../event-payload.json", "precondition_hash":"sha256:...",
  "result_hash":"sha256:...", "created_at":"ISO-8601",
  "reversibility":"compensatable"
}
```

## 3.7 Frame/sample exact rendering

- Store timeline time as integer ticks/rational values with explicit timebase, not float seconds.
- Convert using rational frame rates including 23.976/29.97/59.94 and drop-frame display rules.
- Audio boundaries use sample indices where sample accuracy matters.
- Preserve source PTS, timebase and edit-list interpretation; retiming/resampling explicit.
- Manifest fully defines tracks, clips, transforms, transitions, captions, overlays, effects, keyframes, audio routing, colour metadata and output profile.
- Preview/export compile from same semantic snapshot; golden media fixtures compare outcomes.
- Pin decoder/encoder versions/options; record codec, pixel format, colour primaries/transfer/matrix/range, sample rate/channel layout.
- Promise byte/pixel-exact only for proven deterministic configuration. GPU/hardware encoders may vary; otherwise define objective tolerances for timing, sync, colour, loudness and decode quality.
- Verify via ffprobe and full or policy-defined decoded-frame/sample checks, not file existence.

## 3.8 WebGPU / WebCodecs

WebCodecs allows low-level audio/video encode/decode in Dedicated Workers; runtime codec and browser support must be feature-detected. WebGPU can accelerate suitable compositing/filtering/segmentation, but is optional. Fallback: GPU/WebGPU → CPU/WASM/native → server FFmpeg according to device, performance and cost. Browser output is not automatically a reliable final master. Use proxies, bounded queues, cancellation/back-pressure and deterministic disposal of frames/buffers.

## 3.9 Infrastructure independence

Independence means owned interfaces, source data, project state, assets, usage ledger, export/backups and replaceable provider adapters—not rewriting databases/codecs. Keep GCS and Firestore until measurable migration case; consider S3-compatible adapter later. Postgres/pgvector or Qdrant only if measured queries justify it. Avoid additional SaaS, queue, DB, always-on GPU or permanent VM without a concrete need. Standard formats and exportable project packages protect portability.

---

# 4. The 10-System Creative Tool Intelligence Layer (CTIL) & Multi-Agent Blueprint

CTIL is the common knowledge/control layer. It does **not** create a second ABI: EP-001 remains the sole QuickAI capability registry. Extend it only through accepted ADRs.

## 4.1 System 1 — Product Knowledge Registry

Fields: `product_id`, `engine_id`, engine/adapter/doc version; app sections, menus, panels, tools, shortcuts, dialogs, params/defaults/ranges; command IDs and capability IDs; documentation source; import/export formats and known-loss limitations; plugin deps; status (`wired|partial|preview_only|deprecated|blocked|unknown`); execution locus; risk, permission, cost/latency, undo, limits and test refs; retrieval metadata (modality, task tags, version, locale, entitlement). Retrieve by intent+engine version, not whole manual. Every record has provenance and a pinned source.

## 4.2 System 2 — Executable Tool Registry

EP-001 only. Canonical IDs equal action type (`TRIM`, `RIPPLE_DELETE`, `REMOVE_SILENCES`, `TOGGLE_CAPTIONS`, `ADD_CAPTION`). Old IDs such as `SILENCE_CUT` or lower-case variants are historical/compatibility aliases only, never a second live namespace.

Each entry: ID/version/engine; JSON Schema/Pydantic params; MediaGraph facets/state preconditions; side effects; execution locus/handler; entitlements/risk/permissions/confirmation; cost/latency/resources/timeouts/retry safety; idempotency and compensation; postcondition/verifier; runtime status and `emit_allowed`; golden tests and supported version. Generate FE types, BE models, sanitizer allowlists, function declarations and docs from one source; CI fails on schema drift.

## 4.3 System 3 — Preconditions, postconditions and command contracts

```json
{
  "capability_id":"REMOVE_SILENCES", "schema_version":1,
  "params":{"segments":[{"start_tick":120000,"end_tick":240000}],"min_gap_ms":180,"preserve_breaths":true},
  "preconditions":[{"type":"facet_ready","facet":"silence"},{"type":"project_revision_matches","revision":183},{"type":"capability_emit_allowed","value":true}],
  "postconditions":[{"type":"timeline_ranges_removed","source_ranges":"params.segments"},{"type":"audio_stream_present","value":true},{"type":"duration_within_expected_bounds","tolerance_ms":250}],
  "side_effects":["project_mutation","render_required"],
  "idempotency_key":"project/revision/command/hash", "risk":"medium", "reversible":true
}
```

Reject unknown fields/enums; validate interval ranges, ownership, supported codecs/effects, keyframe bounds and resource limits. Precondition failure returns typed reason. Failed postcondition means no successful status.

## 4.4 System 4 — Topological DAG Planner

Each node has capability, params, evidence refs, dependencies, resource and cost estimate, timeout, retry policy, risk and postconditions. Validate acyclic graph/topologically sort. Parallelize independent read-only analysis only if resource and read/write sets permit; serialize conflicting project mutations. Pin plan to project + MediaGraph revision; replan on change. Insert analysis nodes if evidence missing. Plan alternatives (library vs stock vs generated B-roll; local preview vs server; captions vs dub). Approval modes: all, stepwise, modify, cancel. Templates are populated from current evidence, never blind scripts.

## 4.5 System 5 — Deterministic Execution Controller

```text
DRAFT → VALIDATING → READY → RUNNING
  ├─ WAITING_FOR_USER / WAITING_FOR_PROVIDER
  ├─ VERIFYING → COMMITTED
  └─ FAILED → RECOVERING → RETRYING | ROLLING_BACK | DEAD_LETTERED
CANCEL_REQUESTED → CANCELLING → CANCELLED
```

Only controller starts tools. It locks tenant/project, checks revision, auth, registry and spend; persists `runId/jobId/planId/stepId/idempotencyKey/input snapshot`; chooses Client/NativeLocal/Server/Render adapter; enforces timeout/concurrency/cancel; persists ToolResult receipts; streams real job state; blocks stale commits; commits only after verifier pass or marks degraded/compensates.

## 4.6 System 6 — Persistent Project Context & Memory

Separate: conversation summary; project brief/current revision; media facts/MediaGraph; creator preferences/brand; operational failure/provider state; workflow recipes/approvals. CreatorMemory fields: style preferences, brand rules, typical structure, platforms, rejected suggestions, successful edit patterns, caption/audio preference, content categories, confidence and last confirmation. Save explicit feedback/validated behaviour, not sensitive personal inference. Store scope, provenance, confidence, timestamp, version and correction. User must inspect/correct/export/delete. One-off changes do not become permanent preferences by default. Keep objective media fact separate from preference.

## 4.7 System 7 — Media Understanding Engine

Tier 0 local: metadata, waveform, silence/energy, local ASR, transcript alignment, scene boundaries and frame thumbnails. Tier 1 deterministic server: ffprobe/FFmpeg, loudness, integrity, frame extraction, subtitle parse and dedupe. Tier 2 specialists: diarization, faces, motion, object/scene labels, embeddings and visual QA. Tier 3 frontier reasoning: story architecture, complex edits and documentary synthesis. Persist versioned facets and provenance; incremental updates; hash/version cache; suggestions only when evidence facet ready.

## 4.8 System 8 — Post-render binary verifier

Check tenant ownership and immutable object generation; object existence, bytes and checksum; ffprobe duration/streams/codec/dimensions/FPS/timebase/sample rate/channels/start times/colour metadata; duration/frame count tolerance; full/policy decode; truncated bitstream; blank/black/frozen frames; aspect/safe zones; audio survival/loudness/true peak; caption presence/overflow; A/V sync; output name/MIME/download signature. Equivalent image checks: dimensions/channels/alpha/profile/decode/layer fidelity; vector: valid SVG/PDF, bounded paths, font warnings; audio: decode/duration/channels/clipping/silence/loudness/sample rate. Separate `BYTE_INTEGRITY`, `STRUCTURAL`, `SEMANTIC`, `PERCEPTUAL`, and `USER_APPROVAL`. HTTP 200 is not verification.

## 4.9 System 9 — Checkpoint / rollback / self-healing

Checkpoint before mutation; immutable temp/object output; verify before pointer promotion. Retry only transient errors and idempotent operations; exponential backoff+jitter and hard cap. Classify invalid input, missing evidence, unsupported capability, conflict, resource exhaustion, provider 429, timeout, render fault, corrupt media, failed verification and cancel. Resume after worker restart from durable job + revision + artifact refs. Bounded retry and at most one safe fallback by default; no infinite loops. Example: dropped audio or excessive duration drift → discard failed output, try safer filter/audio mapping once, re-verify stream/sync. Rollback via compensation event or immutable snapshot; external publish/payment cannot be assumed reversible. Exhaustion → DLQ and operator replay.

## 4.10 System 10 — Destructive permission / security gates

| Risk | Example | Default |
|---|---|---|
| R0 | Read/probe/list | Normal auth. |
| R1 | Reversible local preview/crop/playback | Auto if intent unambiguous. |
| R2 | Persist timeline/caption/layer change | Show plan/undo; auto only per policy. |
| R3 | Paid generation, deletion, source-audio replacement, large render | Explicit cost + confirmation. |
| R4 | Publish/share/send/account/security/billing | Explicit confirmation every time + auth/audit. |

Controls: NextAuth JWT validation; OIDC worker auth; tenant owner/role scope; strict schema; no model-generated shell/eval/Python/SQL; sandboxed non-root renderer with resource limits; parser hardening; SSRF/redirect/private-IP checks; Secret Manager and no keys in `NEXT_PUBLIC`/prompts/logs; private GCS and short signed URLs; rate limits on proxy/audio/info/spend endpoints; transcripts are untrusted content; immutable audit log; mic opt-in and voice-clone consent; source media rights attestation and no DRM/access bypass; SBOM and licence audit including FFmpeg flags/codec obligations.

## 4.11 Specialist skill contract

```text
AgentSkill { skill_id, version, purpose, input_schema, output_schema,
 allowed_capabilities[], model_policy, max_cost, max_runtime,
 required_evidence[], risk_class, retry_policy, evaluation_suite }
```

Skills propose; orchestrator validates and plans; controller executes; Kernel commits. Model tool call is never authorization.

## 4.12 CTIL exit gates

- One capability maps to one executable handler, generated schema and verifier.
- Unsupported tool fails closed end-to-end.
- Compound plan is acyclic, dependency-correct and revision-pinned.
- Every mutation has ToolResult + ProjectEvent + verified before/after state.
- Duplicate task cannot duplicate side effect; worker restart is deterministic.
- Failed verification blocks success and records diagnostic.
- Project memory is inspectable/correctable/exportable/deletable.
- Tool knowledge is version-aware and returns supporting provenance.

---

# 5. Token-Efficiency & Zero-Waste Execution Strategy

Zero-waste means minimum redundant inference/reconnaissance and bounded costs, not literally free compute.

## 5.1 Single canonical knowledge package

Keep this Master Spec, existing `PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md`, `CANONICAL_PROJECT_MEMORY.md`, `ROADMAP.md`, accepted ADR/EPs, generated capability index from `registry.v1.json`, local repository graph and short agent rules. ADRs/registry remain normative for their domain; do not copy all details into every prompt.

## 5.2 Commit-pinned task packet

Before coding, packet contains baseline SHA/branch, target behaviour/capability IDs, exact allowed file scope, adjacent contract files, relevant ADRs/EPs/tests, current truth/gaps, acceptance criteria/test commands, forbidden changes, expected diff and rollback. Read only relevant files; repeat full audit only when dependency context changes.

## 5.3 Runtime model budget

- Deterministic edit: no model.
- Simple mapping: cheapest reliable structured model.
- Complex plan: Argon low/medium; high only when risk/quality delta merits it.
- Verification: deterministic test/probe first; model review supplemental.
- Cache stable schemas/instructions where provider supports safe caching; send compact evidence packs and transcript windows.
- Track input/cached/output/thinking/schema/retry/media payload cost separately.
- Hard cap tokens, thinking, deadline, retries and per-task spend.

## 5.4 Reduce agent/prompt entropy

Retrieve top-K capabilities, not all hundreds. Summarize MediaGraph and point to transcript/frame artifacts. Use reusable plans with live evidence. Do not run Pre-Flight for ordinary edits. Parallelize only independent tasks and separate file ownership; one integration owner merges/tests. No repeated repo exploration between agents; share SHA, spec, file list and test outputs. Avoid debate loops without new evidence.

## 5.5 Coding-agent protocol

```text
READ SPEC + PIN BASELINE
 → READ RELEVANT FILES/TESTS/ADRS
 → FILE-SCOPED PLAN
 → SMALLEST COMPATIBLE DIFF
 → TARGETED TESTS
 → TYPE/LINT/BUILD AS REQUIRED
 → DIFF + SECURITY/COST REVIEW
 → RECORD EVIDENCE + REMAINING GAPS
```

No false claims of inspected files/tests. No frozen ABI/Kernel/storage/queue/auth changes without ADR. No mock success paths. No broad rewrite when narrow compatible change suffices. No GridFS removal before traffic proof.

## 5.6 Graft / repository graph

Historical workflow used local `graft/.graph/wiring.json`, pinned `@nanonets/graft@0.10.1`, kept graph gitignored and avoided deep expensive graph builds without founder approval. Treat tooling/version as needing refresh. Never commit private source map into public repo without explicit approval.

## 5.7 Evidence ledger

Each coding run records baseline/final SHA, changed files, commands/results/test counts, build/type/lint outcomes, smoke results, unverified pieces, cost/latency impact and rollback. Static inspection, unit/integration tests, deploy smoke and production telemetry are different evidence levels.

---

# 6. Backend, Database, Storage, Queue & FinOps Guardrails

## 6.1 Preserve documented production substrate

| Layer | Documented choice | Rule |
|---|---|---|
| Frontend | Next.js 14.2.35, App Router, TypeScript, Zustand, Tailwind v4 | Evolve in place. |
| API | Python 3.12, FastAPI, Pydantic v2 | Control plane. |
| AI | Gemini 2.5 Flash/DualModelRouter; ADK Pre-Flight | Argon only via ADR/eval. |
| Auth | NextAuth HS256 JWT validated by FastAPI | Preserve. |
| Product/project DB | Firestore | Project/Studio state authority. |
| Media storage | GCS bucket `quickaishort-agent-494304-media` | Primary source/derived/render storage, private. |
| Hot state | Redis/Upstash | Locks/status/dedupe/cancel/cache/cooldown only. |
| Legacy | MongoDB history and GridFS `/api/v1/video/*` | No new media writes; migrate only after dependency proof. |
| Production queue | Cloud Tasks `quickai-render` | Sole production dispatch. |
| Render worker | Private Cloud Run `quickai-worker`, `min=0`, request CPU, concurrency 1 documented | OIDC and idempotent. |
| Local/dev queue | RQ | Local/dev fallback only. |
| Media processing | FFmpeg / ffmpeg-python | Pinned build/licence; Manifest is composition source. |
| Realtime | Pusher + WebSocket fallback | Notifications, not truth. |
| Hosting | Vercel + Cloud Run | Retain until measured case to migrate. |

Cloud project/bucket identifiers belong in restricted operations config, not public logs. Never commit credentials.

## 6.2 Logical data model

Use existing Firestore naming conventions; do not duplicate already-present collections blindly.

```text
users/{user_id}: profile, tier, policy
users/{user_id}/usage_ledger/{ledger_id}: run_id, command_id, reservation,
  actual_usage, credit_delta, provider_cost, resource_cost, status
studio_projects/{project_id}: owner, tenant, title, head_revision,
  snapshot_uri, manifest_hash, media_graph_id, active_run_id, schema_version
studio_projects/{project_id}/events/{event_id}: revision, expected_revision,
  command_id, capability_id, actor, payload_ref, hashes, compensation_ref
studio_projects/{project_id}/plans/{plan_id}: intent, pinned revisions,
  steps, dependencies, estimates, approval_state, status
studio_media_graphs/{graph_id}: asset_id, project_id, revision, facets, provenance
media_assets/{asset_id}: tenant_id, sha256, type, size, source_uri,
  rights, status, generation
analysis_artifacts/{artifact_id}: source_hash, pipeline_version, facet,
  provider_version, locale, output_uri, content_hash, quality
render_jobs/{job_id}: run_id, project_id, revision, manifest_ref/hash,
  idempotency_key, output_uri, status, retry_count, cost estimate/actual
creator_profiles/{user_id}: preferences, brand_kit_ids, memory_version
brand_kits/{brand_kit_id}: owner, assets, fonts, palette, caption_presets,
  safe_zones, templates, export_defaults, version
idempotency/{scope_key}: request_hash, result_ref, state, expires_at
```

Firestore indexes: owner/project list; revision-sorted events; tenant job status; plan status; tenant-scoped asset hash; usage summaries. Large snapshots/transcripts/waveforms live in GCS with Firestore pointers.

## 6.3 Transaction/revision rules

Use Firestore transaction/CAS on `head_revision`. Event/command IDs unique within scope. Same idempotency key+same payload returns original receipt; same key+different payload rejects. Revision increments once per accepted mutation only. Event append + head update atomic. Snapshot stores its revision. Snapshot cadence configurable (historical suggestion about every 20 events is not mandatory). Use revision pagination, not timestamp alone.

## 6.4 runId/idempotency lifecycle

IDs: `requestId` API submission; `commandId` semantic mutation; `planId` plan; `runId` execution family/supersede boundary; `jobId` durable async job; `stepId` DAG node; `idempotencyKey` digest of tenant/project/revision/capability/normalized params/version.

1. Validate auth, quota, project revision, capability and params.
2. Estimate and atomically reserve credits/budget.
3. Persist plan/job with input revision, source hashes and idempotency key.
4. Create named Cloud Task with stable hashed task ID, tied to durable job.
5. Worker verifies OIDC, tenant access, current runId/revision and job state.
6. Acquire lock; return original receipt if completed; otherwise isolated scratch execution.
7. Write immutable output; verify; transactionally finalize job and ledger.
8. Check cancel/supersede between stages and immediately before commit.
9. Retry transient/idempotent error only; otherwise fail/DLQ.

Cloud Tasks is at-least-once in design terms; handler idempotency is mandatory. Task-name dedupe is not a substitute for side-effect idempotency. Never double-charge, double-publish or overwrite new output on duplicate delivery.

## 6.5 Queue/worker

```text
FastAPI: validate + reserve + persist
 → Cloud Tasks quickai-render
 → private OIDC Cloud Run quickai-worker (min=0)
 → check runId/revision/idempotency
 → isolated FFmpeg/native render
 → binary verifier
 → immutable GCS artifact + Firestore receipt/ledger commit
 → Pusher/WebSocket notification
```

Keep concurrency low (documented 1). Bound source duration/bytes/resolution/FPS/output length/CPU/wall time/temp disk/retries per tier. Limit per-tenant concurrent jobs and queue dispatch rate. Cloud Run may scale to zero; min instances >0 cost money. Cloud Tasks is asynchronous, not interactive UX. RQ remains local/dev. Recover stale jobs from durable state, not only Redis. DLQ contains failure class, attempts, source revision, artifact hashes, logs and replay controls.

## 6.6 GCS layout and lifecycle

```text
tenants/{tenant}/assets/{asset}/source/{sha256}.{ext}
tenants/{tenant}/assets/{asset}/proxies/{pipeline}/{profile}.mp4
tenants/{tenant}/assets/{asset}/analysis/{pipeline}/{artifact}.json
tenants/{tenant}/projects/{project}/snapshots/rev-{revision}.json
tenants/{tenant}/projects/{project}/manifests/rev-{revision}-{hash}.json
tenants/{tenant}/projects/{project}/renders/{run_id}/{output_hash}.mp4
tenants/{tenant}/projects/{project}/thumbnails/{revision}/{frame_hash}.jpg
```

Use immutable object keys or generation preconditions; persist object generation and checksums; short-lived signed URLs only; path prefix is not authorization. Define cleanup/retention for temp uploads, proxies, derived assets, cancelled renders and exports. Account deletion must cascade Firestore pointers, GCS objects, caches, Redis and ledger refs as legally permitted; test end-to-end.

## 6.7 Redis boundaries

Allowed: active run/cancel flags, short locks, hot idempotency cache (durable record remains Firestore), progress/pubsub, rate limits, provider cooldown, versioned analysis cache and short plan cache with durable backup. Forbidden as sole project state, credit ledger, job record, committed render record or large transcript/media store.

## 6.8 MongoDB legacy cutover

Inventory all collections/GridFS/routes/read-write traffic before deletion. Deprecate legacy `/api/v1/video/*` only after client dependency proof. Dual read/write only with migration IDs and reconciliation. Back up and restore test before removal. Mongo may remain for history if measured; do not create another state source.

## 6.9 Credits and cost accounting

Current docs refer to direct deterministic tools as 0 credits and one credit per LLM plan call under then-current policy. Historic drafts proposed 1/5/15 action tiers, 150 trial credits, 1,200 Creator credits and $12–$19/$15 plans; those are inconsistent hypotheses, not agreed pricing.

Implement independent accounting: estimate model tokens/provider/media minutes/output resolution/CPU/GPU/storage/egress; atomic reserve before paid work; commit actual after verified completion; release/refund failed/cancelled work by policy; idempotent ledger; internal money cost separate from user credits; per-user/project/global daily/monthly caps; server-authoritative checks. Set prices only after measured cost and demand; no hypothetical margin promises.

## 6.10 Free-first fallback matrix

| Task | Preferred | Fallback | Never do |
|---|---|---|---|
| Simple edit | Local deterministic engine | Server engine if device cannot | LLM for explicit trim. |
| ASR | Browser/local Whisper | Explicit opt-in paid ASR | Hidden paid fallback. |
| Silence | WebAudio/FFmpeg | Cached MediaGraph | LLM-guessed timecodes. |
| Preview | Proxy/local decode | Server proxy | Re-upload every time. |
| Final render | Cloud Tasks/Cloud Run | User-visible retry/manual path | Claim success at enqueue. |
| B-roll | Creator library | Licensed stock | Generate before searching library. |
| Translation | Cached transcript/provider | Captions-only if TTS fails | Claim dub from subtitles. |
| Image edits | Local CPU/GPU/native | Bounded server | Expensive model for crop/exposure. |
| Plan | Cached template/rules | Small model, then Argon | Whole-history prompt every turn. |

## 6.11 FinOps / observability

Measure `cost_per_successful_export`, cost/edit/user, model tokens/cache hit, render wall/CPU/memory, queue wait, retries/DLQ, output size, failures by codec/device/locale/capability/provider, ASR completion/corrections, MediaGraph cache/reanalysis, time-to-preview/export, credit leakage/refunds, A/V defects. Guardrails: global monthly spend alert/cap; per-tenant/user quota and concurrency; per-job duration/bytes/resolution/retry limits; founder approval for paid vendors/warm resources; no always-on GPU/VM at bootstrapped stage. “Free at global scale” is not supportable.

---

# 7. Unfinished Ideas, Hidden Gems & Edge Cases from Past Chats

## 7.1 Recovered high-value ideas

| Idea | Detail | Status / next gate |
|---|---|---|
| Creator memory | Accepted/rejected styles, brand, structure, captions, platforms. | `PROPOSED`; explicit controls/evaluation. |
| B-roll intelligence | Detect static talking-head >~45s; search own library, then licensed stock, then generative with cost. | `ROADMAP`; library-first. |
| Transcript editing | Edit timeline by selecting transcript text. | `PROPOSED`, high value. |
| Semantic history | Human-readable edits, restore and branch. | Kernel-backed target; UX/tests incomplete. |
| Plan inspector | Evidence, steps, dependencies, risk, cost, approval and receipts. | `PARTIAL/target`. |
| Audience simulation | Six personas and weighted consensus/refinement. | Optional Pre-Flight, not every workflow. |
| Storyboard pipeline | Brief → outline → storyboard → shot list → selects → edit → render. | `PROPOSED`. |
| SFX/music intelligence | Library-first music/SFX discovery; beat/energy fit; generation only after approval. | Previous “SFX” preview used prerecorded assets; do not call it synthesis. |
| Multi-format exports | 9:16, 1:1, 4:5, 16:9, 3:2 variants. | Manifest profiles + verifier. |
| Batch editing | Brand/caption/export changes over many media files, partial failure receipts. | `PROPOSED`. |
| Brand-kit retention | Reapply consistent fonts, logo, captions and safe zones. | Mentioned; full implementation unverified. |
| Creator analytics | Connect content performance to hooks and structure. | `PROPOSED`; platform API and consent. |
| Remix format | Reuse a successful project structure without copying protected media. | `PROPOSED`. |
| Agency workspace | Roles, approvals, usage and volume pricing. | Collaboration deferred; pricing speculative. |
| YouTube extension | MV3 button into QuickAI editor. | Repo documents extension; verify live policy. |
| Local-first phone loop | On-device speech, deferred source upload, share with Safari fallback. | Branch/work-log only. |
| Engine marketplace | External native tools exposed through CTIL. | Long-range; security/version/licence gates. |
| Cross-media campaign | One brand brief produces video, thumbnail, vector, audio, deck and PDF assets. | `PROPOSED`, separate media aggregates under workspace. |

## 7.2 Architectural gems recovered

- Shorts is a **ModePack** over Video Runtime, not another product fork.
- Image/video share identity, asset graph, conversation, registry, project history, decisions and spend; their edit models remain distinct.
- MediaGraph is factual observation; Suggestions only read evidence. Missing evidence is not zero.
- RenderManifest is compiled composition IR, not audit history; ProjectEvents are audit/state history.
- Local preview and final server output share one semantic composition contract.
- Audit each capability end-to-end: inputs, schema, AI route, handler, execution locus, state update, preview, final renderer, undo, validation and verification.
- True moat = accumulated creator value: memory, brand, assets and repeatable workflows, not friction lock-in.
- Cache/tiered analysis/deterministic tools beat fake heuristics.
- One orchestrator with specialist skills beats unnecessary agent proliferation.

## 7.3 Historical pricing/credits — not approved

Old proposals included 1 credit simple action, 5 credits multi-track, 15 credits heavy semantic/GPU; 150 trial credits; 1,200 Creator credits; $12–$19/$15 plans and high-volume agency tier. These are assumptions, not measured unit economics. Separate model token use from infrastructure cost, collect per-workflow cost, then set pricing.

## 7.4 Edge cases

| Edge case | Required behaviour |
|---|---|
| Variable frame rate | Preserve/probe PTS and timebase; avoid float drift. |
| 23.976/29.97/drop-frame | Rational time and correct timecode display. |
| Missing audio | No audio edit; report missing facet. |
| Overlapping speakers | Preserve uncertainty; don't cut one speaker's silence as global silence. |
| Breath removal | Configurable preservation and preview. |
| Music under dialogue | Duck/gain automation only with evidence and intent. |
| Mixed sample rates/channels | Explicit resample/layout; detect clipping/sync. |
| Dub longer than source | Offer retime/rephrase/speed choice; don't silently distort. |
| Unsupported locale | Honest captions-only fallback, never fake TTS. |
| Missing font | Warn; no exact-brand claim. |
| PSD/PSB unsupported features | Preserve source/unsupported blocks where possible; disclose flattening/loss. |
| Malicious SVG/PDF | Sandbox parser, cap paths/complexity/external refs, sanitize. |
| 16/32-bit, CMYK/Lab | Validate native support and colour conversion; no silent downgrade. |
| WebGPU unavailable | CPU/WASM/server fallback with cost/performance clarity. |
| iOS codec/API gap | Feature detection + Safari fallback. |
| Local OOM | Cancel cleanly, release buffers, offer proxy/server after consent. |
| Duplicate Cloud Task | Idempotent worker and stable receipt. |
| Superseded job | Check runId/revision before commit; discard stale output. |
| Concurrent GCS overwrite | Immutable keys/generation precondition. |
| Firestore conflict | Reject and rebase; never silent overwrite. |
| Provider 429/spend cap | Cooldown, bounded retry, deterministic degradation and cost state. |
| Prompt injection in transcript | Untrusted content; never authorization. |
| Internal IP/SSRF URL | Block metadata/private ranges; validate redirects. |
| Lost client connection | Durable job/status; reconnect must not enqueue duplicate. |
| Account deletion | Tested cascade and retention. |
| Public publishing | R4 explicit target/account confirmation. |

## 7.5 Defer until demand proof

Full multiplayer/CRDT; unattended publishing; custom foundation model; 24-app parity at launch; generative media in every flow; always-on GPU; deep object/emotion/music scans on every upload; movie-length dubbing before short-form quality/cost is verified; extra DB/vector store/queue/workflow orchestrator before existing stack is measured.

---

# 8. Single-File Master Handoff Manifest (Markdown + JSON)

## 8.1 Implementation order and release gates

| Priority | Work package | Exit criteria |
|---|---|---|
| P0 Truth lock | Pin repo SHA, deployed revisions, flags, dependencies and tests; reconcile docs. | Evidence ledger separates code, tests, deploy and runtime health. |
| P0 Verified video loop | Ingest → evidence → deterministic edit → Kernel event → preview → Manifest bake → verified MP4. | One supported edit fully verified with revision receipt. |
| P0 Output verifier | ffprobe/decode, A/V sync, captions, aspect, checksum, object generation. | Failure blocks completion and creates recovery diagnostic. |
| P0 Queue/state | runId, idempotency, Cloud Tasks retries, cancel/stale recovery, ledger. | No duplicate charge/overwrite; restart recovers. |
| P1 Orchestration | Observe/verify/commit/compensate; close Tier-1 outcome gap. | Each committed step has result, event and postcondition receipt. |
| P1 Schema generation | One EP-001 source emits FE/BE/sanitizer/tool declarations/docs. | CI parity; no duplicate dialect. |
| P1 Brand/memory | Brand Kit, user-controlled memory, history/branch and transcript edit. | Persist/edit/delete; consistent application. |
| P1 Voice | Opt-in push-to-talk/local ASR, same decision gates. | Privacy, compatibility, cancel, destructive confirmation tested. |
| P1 Dub proof | Provider config, real TTS key, locale smoke, sync QA, captions-only fallback. | At least one verified dubbed locale with cost/provenance. |
| P2 Video intelligence | Speaker/scene/face/motion/candidate moments/B-roll facets. | Evidence-grounded suggestions; own library first. |
| P2 NLE depth | Timeline/keyframes/transitions/colour/audio/history. | Renderer parity and golden tests before emit-allowed. |
| P2 Mobile | WebCodecs detection, memory limits, lazy upload/share. | iOS Safari + desktop browser smoke; no duplicate upload. |
| P3 Image/vector/audio | One adapter per media family using shared CTIL and distinct document model. | One verified workflow per new engine. |
| P3 PDF/design/deck/3D | Add only after shared core gates pass. | Format, security, licence audit + end-to-end proof. |
| P4 Teams/marketplace | Roles, publishing, analytics, integrations and engine marketplace. | Demand, security and billing review. |

## 8.2 File map

`EXISTING` means described as present in accessible repository docs/tree; `VERIFY` means check current branch before touching; `PROPOSED` means add only if no equivalent exists.

| Path | Status | Purpose |
|---|---|---|
| `README.md`, `ARCHITECTURE.md`, `VISION.md` | EXISTING | Public product, topology and direction. |
| `CLAUDE.md`, `.mcp.json` | EXISTING | Agent protocol and MCP config. |
| `AGENTS.md` | VERIFY/PROPOSED | concise cross-agent entry point. |
| `docs/studio/README.md` | EXISTING | docs authority map. |
| `docs/studio/PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md` | EXISTING/BINDING | architecture law. |
| `docs/studio/CANONICAL_PROJECT_MEMORY.md` | EXISTING | current runtime truth. |
| `docs/studio/ROADMAP.md` | EXISTING | backlog/founder gates. |
| `docs/studio/adrs/ADR-001..016-*.md` | EXISTING | accepted decisions. |
| `docs/studio/packages/EP-001..008-*.md` | EXISTING | engineering package contracts. |
| `docs/studio/MASTER_ENGINEERING_SPEC.md` | PROPOSED | canonical handoff file (copy this file into repo). |
| `docs/studio/MASTER_MANIFEST.json` | OPTIONAL PROPOSED | separately extracted JSON; keep in sync. |
| `fastapi/capabilities/registry.v1.json` | EXISTING/FROZEN | sole capability ABI. |
| `fastapi/models/ai_editor.py` | EXISTING | action models/sanitizer boundary. |
| `fastapi/models/studio_decision.py` | VERIFY | DecisionRecord model described by ADR-016. |
| `fastapi/services/decision_service.py` | VERIFY | Decision Intelligence. |
| `fastapi/services/director_loop.py` | VERIFY | typed-chat deterministic path. |
| `fastapi/services/project_kernel.py` | EXISTING | Project Document transitions. |
| `fastapi/services/media_graph_service.py` | EXISTING | MediaGraph/suggestions. |
| `fastapi/services/orchestrator_service.py` | EXISTING | plan jobs/Kernel execution. |
| `fastapi/services/manifest_renderer.py` | EXISTING | Manifest compiler. |
| `fastapi/models/render_manifest.py` | EXISTING | backend composition IR. |
| `fastapi/render_worker.py` | EXISTING | render job handler. |
| `fastapi/services/queue_service.py` | EXISTING | queue dispatch. |
| `fastapi/services/render_service.py` | EXISTING | render/acquisition services. |
| `fastapi/services/ctil/knowledge_registry.py` | PROPOSED | product knowledge registry. |
| `fastapi/services/ctil/tool_discovery.py` | PROPOSED | top-K capability selection. |
| `fastapi/services/ctil/contract_validator.py` | PROPOSED | schema/pre/postcondition validation. |
| `fastapi/services/ctil/dag_planner.py` | PROPOSED | DAG/cycle/topological scheduling. |
| `fastapi/services/ctil/execution_controller.py` | PROPOSED | durable execution state machine. |
| `fastapi/services/ctil/context_memory.py` | PROPOSED | scoped memory/correction/deletion. |
| `fastapi/services/ctil/media_understanding.py` | PROPOSED | staged analysis/artifact indexing. |
| `fastapi/services/ctil/output_verifier.py` | PROPOSED | binary/media verifier. |
| `fastapi/services/ctil/recovery.py` | PROPOSED | checkpoint/retry/compensation/DLQ. |
| `fastapi/services/ctil/permission_gate.py` | PROPOSED | risk/confirmation/auth/spend. |
| `fastapi/services/model_router.py` | PROPOSED or reuse existing `ai_router.py` | provider/model routing. |
| `fastapi/services/voice/` | PROPOSED | push-to-talk and local ASR. |
| `fastapi/services/brand_kit_service.py` | PROPOSED | Brand Kit service. |
| `fastapi/services/dubbing/` | VERIFY/EXTEND | ADR-014 translation/TTS/alignment. |
| `fastapi/services/asset_search/` | PROPOSED | creator library and licensed source search. |
| `fastapi/tests/test_project_kernel.py` | EXISTING OR VERIFY | revision/event invariants. |
| `fastapi/tests/test_manifest_renderer.py` | EXISTING/VERIFY | Manifest fidelity. |
| `fastapi/tests/test_render_manifest.py` | EXISTING/VERIFY | FE/BE schema contract. |
| `fastapi/tests/test_dub_video.py` | EXISTING/VERIFY | dubbing workflow. |
| `fastapi/tests/test_ctil_*.py` | PROPOSED | CTIL DAG/security/recovery contracts. |
| `frontend/src/hooks/useIngestLifecycle.ts` | EXISTING | one ingest FSM. |
| `frontend/src/stores/editorStore.ts` | EXISTING | optimistic editor projection. |
| `frontend/src/lib/aiToolCatalog.ts` | EXISTING | frontend capability catalogue; generate from ABI. |
| `frontend/src/lib/render/renderManifest.ts` | EXISTING | frontend Manifest schema. |
| `frontend/src/components/editor/AIPanel.tsx` | EXISTING | chat-primary control plane. |
| `frontend/src/components/editor/` | EXISTING | canvas/timeline/inspector. |
| `frontend/src/lib/ctil/` | PROPOSED | client adapters/types/receipts. |
| `frontend/src/components/studio/PlanInspector.tsx` | PROPOSED | plan/evidence/cost/approval UI. |
| `frontend/src/components/studio/HistoryPanel.tsx` | PROPOSED | semantic history/restore/branch. |
| `frontend/src/components/brand/BrandKitEditor.tsx` | PROPOSED | brand presets. |
| `extension/` | EXISTING | Chrome MV3 YouTube handoff. |

## 8.3 Acceptance criteria

| ID | Criterion |
|---|---|
| `CORE-001` | QuickAI Short/Studio remain one product lineage; no second rewrite. |
| `CORE-002` | Every feature state is truthfully labelled from repo evidence. |
| `INGEST-001` | One staged FSM; retries cannot double-upload. |
| `MEDIA-001` | Asset hash and analysis pipeline version persist. |
| `MEDIA-002` | MediaGraph facets expose ready/pending/missing/error and provenance. |
| `SUGGEST-001` | Actionable suggestion includes evidence + capability ID. |
| `DECISION-001` | Missing evidence triggers RESEARCH/ASK, never fabricated values. |
| `DECISION-002` | Eligible deterministic edit runs without LLM and AI credit. |
| `REGISTRY-001` | EP-001 sole ABI; FE/BE/model schemas generated or parity-tested. |
| `REGISTRY-002` | `emit_allowed=false` or missing handler fails closed. |
| `PLAN-001` | DAG acyclic, dependency-correct and revision-pinned. |
| `EXEC-001` | Every step yields ToolResult, duration, artifact refs and event IDs. |
| `KERNEL-001` | Mutation requires expected revision and atomic event/head update. |
| `KERNEL-002` | Stale plan cannot overwrite newer head. |
| `MANIFEST-001` | Bake compiles from pinned Kernel snapshot. |
| `RENDER-001` | Production Cloud Tasks → private worker; RQ local/dev only. |
| `RENDER-002` | Duplicate execution cannot duplicate side effect or billing. |
| `VERIFY-001` | Output integrity, streams, duration, FPS, resolution, audio/captions checked. |
| `VERIFY-002` | Failed verifier blocks success with diagnostic. |
| `RECOVERY-001` | Worker restart recovers from durable checkpoint/job state. |
| `RECOVERY-002` | Retries bounded and limited to retry-safe steps. |
| `SEC-001` | Tenant auth enforced for project/asset/job/media URL. |
| `SEC-002` | Model/media text cannot grant permission or execute arbitrary code. |
| `BILL-001` | Reserve/commit/refund idempotent and server-authoritative. |
| `BILL-002` | Per-user/job/global spend caps prevent runaway spend. |
| `VOICE-001` | Mic opt-in, visible, cancellable, same decision gates. |
| `DUB-001` | TTS failure degrades explicitly to captions-only. |
| `BRAND-001` | Brand styles apply consistently; font/licence warnings shown. |
| `HISTORY-001` | Committed edit inspectable and reversible/branchable per contract. |
| `MOBILE-001` | Feature detection + Safari fallback smoke tests pass. |
| `CTIL-001` | Knowledge/commands retrievable by app and engine version. |
| `CTIL-002` | Ten CTIL systems have tested contracts/readiness status. |

## 8.4 Machine-readable JSON master manifest

```json
{
  "spec_id": "QUICKAI-CREATIVE-OS-MASTER-2026-11-03",
  "spec_version": "1.0.0",
  "spec_date": "2026-11-03",
  "product_lineage": ["QuickAI Short", "QuickAI Studio", "Creative OS"],
  "repository": "https://github.com/HassaanFisky/quickaishort",
  "scope_note": "Synthesized from accessible stored memory, Library artifacts, public repository docs and current official sources; not every inaccessible historical chat or production runtime was independently inspected.",
  "architecture": {
    "pattern": "one deterministic orchestration authority with conditional specialist skills and command-driven media engines",
    "primary_model_candidate": "gemini-4-argon",
    "model_candidate_status": "proposed_not_current_repo_default",
    "model_roles": ["complex intent planning", "multimodal reasoning", "tool selection", "deep research"],
    "model_non_roles": ["video rendering", "image generation", "audio generation", "Live API voice transport"],
    "routing": "deterministic_first_then_small_fast_model_then_argon_by_complexity_and_risk",
    "state_authority": "Project Kernel + append-only events + monotonic revision",
    "capability_authority": "fastapi/capabilities/registry.v1.json EP-001",
    "media_authority": "MediaGraph facets with provenance/version/status",
    "composition_ir": "RenderManifest from pinned Kernel snapshot",
    "production_render": "Cloud Tasks quickai-render -> private Cloud Run quickai-worker -> FFmpeg/native renderer -> GCS",
    "primary_database": "Firestore",
    "primary_media_storage": "GCS",
    "ephemeral_state": "Redis",
    "legacy_data": "MongoDB GridFS/history pending verified cutover",
    "browser_processing": ["Whisper/WASM", "Web Audio", "WebCodecs", "bounded Workers"]
  },
  "status_baseline": {
    "live_documented": ["QuickAI Short intake", "browser Whisper path", "conversational editor", "MediaGraph suggestion direction", "preview/multitrack timeline", "Cloud Tasks to Cloud Run FFmpeg export", "GCS primary media", "NextAuth JWT", "Chrome MV3 extension"],
    "implemented_repo_docs": ["EP-001", "EP-002 Project Kernel", "EP-003 MediaGraph", "EP-004 Orchestrator plans", "EP-005 chat shell", "EP-006 Manifest bake", "EP-008 onboarding", "ADR-016 Decision Gate Tier 0"],
    "partial_or_flagged": ["full Kernel authority cutover", "multi-turn tool observe/verify loop", "Manifest parity", "post-render outcome verification", "deep media analysis", "voice deployment", "multi-locale TTS smoke", "Brand Kit", "creator memory", "image/vector/audio runtimes"],
    "roadmap_or_deferred": ["Tier-1 outcome measurement", "AUTO_REFRAME emit-allowed", "B-roll insertion", "movie-length dubbing", "multiplayer", "cross-media engines", "social scheduling/analytics"],
    "not_claimed": ["24-app parity", "universal GUI automation", "perfect creative judgement", "zero operating cost at scale"]
  },
  "products": [
    {"id":"PROD-001","name":"QuickAI Short","status":"live_documented","modules":["ingest","transcription","viral_candidates","chat_editor","preview_timeline","captions","audio_tools","server_export"]},
    {"id":"PROD-002","name":"QuickAI Studio","status":"kernel_foundation_partial_os","modules":["creative_kernel","project_document","mediagraph","decision_intelligence","orchestrator","capability_registry","render_manifest"]},
    {"id":"PROD-003","name":"Creative OS","status":"proposed","modules":["video","image","vector","audio","motion","pdf","design","deck","3d","ctil"]},
    {"id":"SKILL-001","name":"Pre-Flight","status":"partial_optional","personas":["genz","millennial","sports","tech","entertainment","news"]},
    {"id":"SKILL-002","name":"Viral Analysis","status":"partial"},
    {"id":"SKILL-003","name":"Director / Storyboard","status":"partial"},
    {"id":"SKILL-004","name":"Script / Asset / B-roll","status":"partial_roadmap"},
    {"id":"SKILL-005","name":"Dub Video","status":"code_complete_path_live_smoke_required"},
    {"id":"SKILL-006","name":"Voice Command","status":"branch_only_unverified_deploy"}
  ],
  "ctil": [
    {"system":1,"id":"CTIL-01","name":"Product Knowledge Registry","acceptance":"CTIL-001"},
    {"system":2,"id":"CTIL-02","name":"Executable Tool Registry","acceptance":"REGISTRY-001"},
    {"system":3,"id":"CTIL-03","name":"Precondition/Postcondition Contracts","acceptance":"REGISTRY-002"},
    {"system":4,"id":"CTIL-04","name":"Topological DAG Planner","acceptance":"PLAN-001"},
    {"system":5,"id":"CTIL-05","name":"Deterministic Execution Controller","acceptance":"EXEC-001"},
    {"system":6,"id":"CTIL-06","name":"Persistent Context and Memory","acceptance":"HISTORY-001"},
    {"system":7,"id":"CTIL-07","name":"Media Understanding Engine","acceptance":"MEDIA-002"},
    {"system":8,"id":"CTIL-08","name":"Binary Output Quality Verifier","acceptance":"VERIFY-001"},
    {"system":9,"id":"CTIL-09","name":"Checkpoint/Rollback/Self-Healing","acceptance":"RECOVERY-001"},
    {"system":10,"id":"CTIL-10","name":"Permission and Security Gates","acceptance":"SEC-001"}
  ],
  "workflows": [
    {"id":"WF-VIDEO-001","name":"One-click viral short","steps":["ingest","probe","transcribe","mediagraph","rank_candidates","plan","confirm_risk","edit","preview","manifest_bake","binary_verify","download_share"]},
    {"id":"WF-VIDEO-002","name":"Long-form optimization","steps":["brief","transcript_windows","redundancy_analysis","edit_plan","human_review","library_broll","pacing","thumbnail_frames","verified_export"]},
    {"id":"WF-DOC-001","name":"15-stage documentary","steps":["brief","rights_intake","technical_qc","transcription_speakers","fact_ledger","story_architecture","script_narration","storyboard_shotlist","selects_bins","assembly","visual_coverage","structure_pacing","localization_subtitles","colour_audio_motion","final_qc_delivery"]},
    {"id":"WF-DUB-001","name":"Multi-locale dubbing","steps":["source_language","speaker_segments","translate","tts","align","preview","captions","mix","locale_qa","export"]},
    {"id":"WF-VOICE-001","name":"Voice command","steps":["opt_in_mic","push_to_talk","local_asr","intent","decision_gate","confirm_if_needed","execute","receipt"]},
    {"id":"WF-BRAND-001","name":"Brand Kit application","steps":["load_version","font_asset_licence_check","caption_style","logo_safe_zone","intro_outro","export_profile","verify"]}
  ],
  "documentary_stage_count": 15,
  "data_plane": {
    "firestore": ["project_heads","project_events","plans","decision_records","mediagraph_heads","asset_metadata","brand_kits","usage_ledger","durable_job_records"],
    "gcs": ["source_media","proxies","transcripts","waveforms","analysis_artifacts","snapshots","manifests","renders","thumbnails"],
    "redis": ["locks","run_ids","cancel_flags","progress","short_ttl_cache","cooldowns","rate_limits"],
    "mongodb": ["legacy_gridfs_and_history_pending_cutover"],
    "cloud_tasks": {"queue":"quickai-render","delivery":"at_least_once","worker":"private quickai-worker","min_instances":0,"oidc":true,"idempotent_handler":true},
    "rq": "local_dev_only"
  },
  "identifiers": ["requestId","commandId","planId","runId","jobId","stepId","idempotencyKey","projectRevision","mediaGraphRevision"],
  "model_policy": {"deterministic":"no_llm_no_ai_credit","simple":"small_fast_structured_model","complex":"Argon only when quality gain justifies cost","specialists":["ASR","translation","TTS","image_generation","video_generation","music_SFX","segmentation_tracking"],"caps":["tokens","thinking","job_cost","user_daily_spend","global_monthly_spend","timeout","retries"]},
  "modules": [
    {"id":"MOD-001","path":"docs/studio/MASTER_ENGINEERING_SPEC.md","status":"proposed","acceptance":["CORE-001","CORE-002"]},
    {"id":"MOD-002","path":"fastapi/capabilities/registry.v1.json","status":"existing_frozen","acceptance":["REGISTRY-001","REGISTRY-002"]},
    {"id":"MOD-003","path":"fastapi/services/project_kernel.py","status":"existing_verify","acceptance":["KERNEL-001","KERNEL-002"]},
    {"id":"MOD-004","path":"fastapi/services/media_graph_service.py","status":"existing_verify","acceptance":["MEDIA-001","MEDIA-002","SUGGEST-001"]},
    {"id":"MOD-005","path":"fastapi/services/decision_service.py","status":"verify","acceptance":["DECISION-001","DECISION-002"]},
    {"id":"MOD-006","path":"fastapi/services/orchestrator_service.py","status":"existing_verify","acceptance":["PLAN-001","EXEC-001"]},
    {"id":"MOD-007","path":"fastapi/services/manifest_renderer.py","status":"existing_verify","acceptance":["MANIFEST-001"]},
    {"id":"MOD-008","path":"fastapi/render_worker.py","status":"existing_verify","acceptance":["RENDER-001","RENDER-002"]},
    {"id":"MOD-009","path":"fastapi/services/ctil/contract_validator.py","status":"proposed","acceptance":["CTIL-002","REGISTRY-002"]},
    {"id":"MOD-010","path":"fastapi/services/ctil/dag_planner.py","status":"proposed","acceptance":["PLAN-001"]},
    {"id":"MOD-011","path":"fastapi/services/ctil/execution_controller.py","status":"proposed","acceptance":["EXEC-001","RECOVERY-001"]},
    {"id":"MOD-012","path":"fastapi/services/ctil/context_memory.py","status":"proposed","acceptance":["HISTORY-001"]},
    {"id":"MOD-013","path":"fastapi/services/ctil/output_verifier.py","status":"proposed","acceptance":["VERIFY-001","VERIFY-002"]},
    {"id":"MOD-014","path":"fastapi/services/ctil/permission_gate.py","status":"proposed","acceptance":["SEC-001","SEC-002"]},
    {"id":"MOD-015","path":"fastapi/services/model_router.py","status":"proposed_or_reuse_ai_router","acceptance":["BILL-002"]},
    {"id":"MOD-016","path":"fastapi/services/voice/","status":"proposed_verify_branch","acceptance":["VOICE-001"]},
    {"id":"MOD-017","path":"fastapi/services/brand_kit_service.py","status":"proposed","acceptance":["BRAND-001"]},
    {"id":"MOD-018","path":"fastapi/services/dubbing/","status":"verify_extend_adr014","acceptance":["DUB-001"]},
    {"id":"MOD-019","path":"frontend/src/hooks/useIngestLifecycle.ts","status":"existing_verify","acceptance":["INGEST-001"]},
    {"id":"MOD-020","path":"frontend/src/stores/editorStore.ts","status":"existing_evolve","acceptance":["KERNEL-001"]},
    {"id":"MOD-021","path":"frontend/src/lib/aiToolCatalog.ts","status":"existing_generate_from_abi","acceptance":["REGISTRY-001"]},
    {"id":"MOD-022","path":"frontend/src/lib/render/renderManifest.ts","status":"existing_verify_parity","acceptance":["MANIFEST-001"]},
    {"id":"MOD-023","path":"frontend/src/components/editor/AIPanel.tsx","status":"existing_evolve","acceptance":["DECISION-001","EXEC-001"]},
    {"id":"MOD-024","path":"extension/","status":"existing_verify","acceptance":["INGEST-001","SEC-001"]}
  ],
  "acceptance_criteria": ["CORE-001","CORE-002","INGEST-001","MEDIA-001","MEDIA-002","SUGGEST-001","DECISION-001","DECISION-002","REGISTRY-001","REGISTRY-002","PLAN-001","EXEC-001","KERNEL-001","KERNEL-002","MANIFEST-001","RENDER-001","RENDER-002","VERIFY-001","VERIFY-002","RECOVERY-001","RECOVERY-002","SEC-001","SEC-002","BILL-001","BILL-002","VOICE-001","DUB-001","BRAND-001","HISTORY-001","MOBILE-001","CTIL-001","CTIL-002"],
  "security": ["tenant_isolation","jwt","worker_oidc","private_gcs","short_signed_urls","ssrf_protection","no_arbitrary_shell_eval","sandbox_media_parser","secret_hygiene","rate_limits","rights_attestation","voice_consent","sbom_licence_audit","deletion_cascade"],
  "finops": ["deterministic_first","local_first_when_safe","hash_version_cache","scale_to_zero","bounded_worker_concurrency","run_id_cancel","idempotent_handlers","transactional_usage_ledger","job_user_global_caps","founder_approval_for_new_paid_services"],
  "non_goals_initial": ["train_foundation_model","all_Adobe_app_parity","mouse_only_universal_control","always_on_GPU","multiplayer_CRDT","unattended_publishing","unlimited_free_global_scale"],
  "governance": {"frozen_contracts":["EP-001","ADR-008","ADR-009","ADR-010","ADR-012","ADR-016"],"change_rule":"ADR + migration plan + tests + rollback for frozen contract changes","truth_rule":"Do not mark complete without code/test/runtime evidence at claimed level","definition_of_done":["reviewed_diff","valid_schemas","targeted_tests","type_lint_build_as_applicable","security_cost_review","tool_receipts_and_verifier","deploy_smoke_when_deployed","known_gaps_documented"]},
  "sources": [
    {"name":"QuickAI README","url":"https://github.com/HassaanFisky/quickaishort/blob/main/README.md"},
    {"name":"QuickAI Phase 2 Truth Review","url":"https://github.com/HassaanFisky/quickaishort/blob/main/docs/studio/PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md"},
    {"name":"QuickAI Canonical Project Memory","url":"https://github.com/HassaanFisky/quickaishort/blob/main/docs/studio/CANONICAL_PROJECT_MEMORY.md"},
    {"name":"QuickAI Roadmap","url":"https://github.com/HassaanFisky/quickaishort/blob/main/docs/studio/ROADMAP.md"},
    {"name":"Gemini 4 Argon","url":"https://ai.google.dev/gemini-api/docs/models/gemini-4-argon"},
    {"name":"Gemini pricing/model updates","url":"https://ai.google.dev/gemini-api/docs/latest-model"},
    {"name":"Cloud Tasks overview","url":"https://docs.cloud.google.com/tasks/docs/dual-overview"},
    {"name":"Cloud Run autoscaling","url":"https://docs.cloud.google.com/run/docs/about-instance-autoscaling"},
    {"name":"MDN WebCodecs","url":"https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API"},
    {"name":"PhotoCraft","url":"https://github.com/storytold/photocraft"},
    {"name":"FilmCraft","url":"https://github.com/storytold/filmcraft"},
    {"name":"ArtCraft","url":"https://github.com/storytold/artcraft"}
  ]
}
```

## 8.5 Single execution directive

**First build one fully verified project mutation and export loop in the existing QuickAI repository—not all of Creative OS.** Pin the live commit, reconcile source against docs, close binary verification and idempotency gaps, complete the observe/verify/commit loop, then add one new engine only after shared CTIL contracts work. This preserves product lineage and budget while creating a real platform foundation.

---

## Appendix A — Current technical references

- Gemini Argon model capability/limits: https://ai.google.dev/gemini-api/docs/models/gemini-4-argon
- Gemini pricing/migration: https://ai.google.dev/gemini-api/docs/latest-model
- Cloud Tasks asynchronous and at-least-once semantics: https://docs.cloud.google.com/tasks/docs/dual-overview
- Cloud Tasks duplicate execution pitfalls: https://docs.cloud.google.com/tasks/docs/common-pitfalls
- Cloud Run autoscaling: https://docs.cloud.google.com/run/docs/about-instance-autoscaling
- WebCodecs: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
- PhotoCraft command architecture: https://github.com/storytold/photocraft
- FilmCraft NLE architecture: https://github.com/storytold/filmcraft
- ArtCraft creative IDE: https://github.com/storytold/artcraft

## Appendix B — Repository audit checklist

- [ ] Pin branch and commit SHA.
- [ ] Read Studio README, Phase 2 Truth Review, Canonical Project Memory and Roadmap.
- [ ] Read relevant ADRs/EPs.
- [ ] Inspect `registry.v1.json`, schemas, sanitizers, handler map and renderer support.
- [ ] Trace UI → API → Kernel → capability → worker → GCS → verifier.
- [ ] Verify deployed FE/API/worker revisions and flags separately from source.
- [ ] Identify legacy routes/collections touched.
- [ ] Run targeted tests, type/lint/build and relevant media smoke tests.
- [ ] Check secrets, tenant isolation, double charge, duplicate task, SSRF and parser safety.
- [ ] Record evidence, limitations and rollback.

**End of Master Engineering Specification.**
