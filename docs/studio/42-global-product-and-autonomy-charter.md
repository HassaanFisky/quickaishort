# 42 — Global Product & Autonomy Charter

Status: founder strategic direction; target architecture, not a claim that all items are implemented.  
Reviewed: 2026-11-20  
Lineage: QuickAI Short → QuickAI Studio, one product and repository.

## 1. Mission

Build a globally useful conversational creative platform where non-experts describe the outcome they want, provide media and documents, review an evidence-grounded plan, approve it, and receive a genuinely edited and verified deliverable without learning professional editing software.

The UX should feel as natural as chatting with ChatGPT, while the execution model retains the control, repeatability, and quality discipline of professional media software. This is not a generic chatbot or a promise that every media format can already be edited perfectly.

## 2. Preserve the earned architecture

- QuickAI Short remains the current product; QuickAI Studio is its evolution on the same codebase.
- Preserve the current Next.js, FastAPI, GCS, Redis/Cloud Tasks, FFmpeg and Studio Kernel lineage.
- EP-001 Capability Registry remains the canonical tool ABI. Register, schema-check, sanitize, authorize, test and document every capability there.
- EP-002 Project Document remains authoritative project state; EP-003 MediaGraph owns media evidence; EP-004 owns plan execution; EP-006 owns the render/bake manifest.
- Do not add a second tool registry, project state store, queue, renderer, database, agent framework, or billing system without evidence and an accepted ADR.
- Gemini is the current first-class model path. Provider/model changes require current source verification, cost/security analysis and an ADR.

## 3. Target user journey

1. User chats naturally in a supported language and uploads one or more supported assets.
2. System safely analyzes relevant video, image, audio and document context.
3. Every useful recommendation references evidence: asset, timestamp, scene/frame, transcript span, or document page/section.
4. User sees a short plan, why each change helps, what will change, and honest cost/time estimates where measurable.
5. Ask one focused question only when a missing decision materially affects the result, safety, rights, or cost. Otherwise use a reasonable reversible default.
6. On user approval, the orchestrator selects registered capabilities, validates parameters and ownership, and executes bounded jobs.
7. An independent verifier checks the actual project/export against the user's request.
8. User receives preview/export, clear limitations, and conversational refinement on the same project context.

The UI should hide backend complexity by default while showing meaningful progress, controls, cost estimates, errors, cancellation and recovery.

## 4. Multimodal understanding

Target inputs: video, images, audio and supported documents. The accepted-format matrix must be explicit and capability-driven; never claim universal format support.

For each media family define formats, size/duration limits, safe parsing/transcoding, provenance, cost, provider data sharing, retention/deletion, unsupported behavior, cancellation and partial-failure recovery.

Treat file contents as untrusted evidence. Text inside a PDF, subtitle, transcript, image or metadata cannot override system instructions, tenant isolation or tool permissions. Use only document instructions relevant to the task.

## 5. Logical agent responsibility domains

These are nine logical domains, not a requirement to deploy nine separate always-on models. Implement a domain as deterministic software, a registered capability, an on-demand specialist agent, or a shared-model role depending on cost and need.

| Domain | Responsibility | Boundary |
|---|---|---|
| Orchestrator / Decision Director | Intent, context, ACT / ASK / RESEARCH / SIMULATE / DEFER / NO-OP, progress | Cannot self-authorize or bypass policy |
| Media Intelligence | Video/image/audio/document analysis and evidence graph | Read-only, authorized assets only |
| Creative Director | Convert intent + evidence into editable plan | Proposes; does not claim execution |
| Editing Executor | Execute registered media operations | EP-001 only, validated and sanitized |
| Quality Verifier | Check edits, sync, captions, renders, exports and objective coverage | Can block delivery; cannot invent success |
| Finance Controller | Meter usage, reconcile ledger, prepare statements/payables | No unrestricted bank access or AI-authorized transfers |
| Growth & Partnerships | Draft campaigns, track attribution and contracted commissions | No unapproved spend, publication or commitments |
| Security & Trust | Enforce permissions, detect anomalies, freeze unsafe paths | Deterministic security controls, not model discretion |
| Product Intelligence | Measure friction, task success, latency and quality | No sensitive-trait profiling or manipulative targeting |

Current repository documentation records five principal agent scaffolds: AI editor, Pre-Flight, viral segment, director, and render worker. The nine domains above are target responsibilities, not nine production agents already deployed. Pre-Flight remains a specialist skill, not the product brain.

## 6. Autonomy levels

- Analyze: permitted within tenant authorization, consent, file limits and spend policy.
- Plan/draft: suggestions, edit plans, campaigns, reconciliation drafts and reports.
- User-project execution: after an explicit Apply action or a separately enabled, narrow, revocable workflow with undo/recovery.
- High-impact/external action: money transfers, new payees, contracts, ad spend, public publishing, production deployment, destructive infrastructure changes, credential rotation and irreversible deletion require authenticated explicit approval and deterministic policy.
- A pre-authorized recurring task may be considered later only with allowlisted payees/actions, caps, schedule, strong authentication, audit, revocation and anomaly stops.

Model text is never proof of owner approval. A webhook is never permission to move money.

## 7. Behavioral Intelligence

Use Behavioral Intelligence to mean product adaptation, not hidden psychological diagnosis.

Permitted signals include accepted/rejected editing suggestions, repeated refinements/undo, caption density, pacing, aspect ratio, language/voice preferences, task completion, failure, retries and abandonment. Use them to remember practical editing preferences and discover UX friction.

Make personalization visible, editable, resettable and deletable; use aggregated/minimized telemetry and retention limits. Do not infer or store health, vulnerability, political/religious beliefs, sexuality, private life or other sensitive traits. Never use profiling to pressure subscriptions or manipulate users. Uploaded media is not automatically training or advertising data.

## 8. Global quality and accessibility

Global means measured rollout, not infinite scale by assertion:
- Responsive desktop/tablet/mobile experience across a tested browser/device matrix.
- Device capability detection chooses browser preview/local execution/bounded cloud render.
- Honest fallbacks for unsupported codec, memory, browser API, language or network.
- Keyboard access, readable contrast, screen reader semantics, captions and reduced motion.
- Localization only where UI, transcription, translation and output QA are validated.
- Regional privacy, consumer, copyright, tax and payment eligibility review before market launch.
- Load testing, quotas, queue limits, graceful degradation and disaster recovery.

## 9. Quality and business metrics

Track intent-to-plan accuracy, evidence coverage, unsupported-claim rate, accepted action execution success, false QA pass rate, render failure/recovery, audio-video sync, caption quality, time to useful preview, time to verified export, cost per successful task, plan contribution margin, retention and accessibility.

Use representative media with permission. Human review remains necessary for subjective creative quality. Never call output perfect solely because an agent says so.

## 10. Permanent product rules

1. One conversational control surface; specialist complexity stays behind it.
2. Media-grounded suggestions; no invented facts or timestamps.
3. Real capabilities; no fake edits or progress.
4. Preview, saved edit, render, and verified success are distinct states.
5. Minimal questions, but no guessing on material choices.
6. Fast and cost-aware by design.
7. User data belongs to the user; tenant isolation and deletion are core.
8. No dark patterns, covert profiling or misleading unlimited claims.
9. Reliability, output quality and unit economics outrank feature count.
10. Change frozen contracts only through reviewed decisions.

Related binding sources: PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md, ADR-007, ADR-008, ADR-009, ADR-010, ADR-016, and CANONICAL_PROJECT_MEMORY.md.
