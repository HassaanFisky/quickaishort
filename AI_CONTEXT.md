# QuickAI Studio — Persistent Project Context

Last reviewed: 2026-11-20  
Inspected GitHub main: bb6aa32d31482c7010ec8574220abf1089d9a226 (2026-11-09)  
Purpose: the compact cross-session context index for the founder, engineers, and every coding agent.

## Start every new session here

Before non-trivial work, read this file, then:

1. docs/studio/CANONICAL_PROJECT_MEMORY.md
2. docs/studio/PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md
3. docs/studio/ROADMAP.md
4. docs/studio/42-global-product-and-autonomy-charter.md
5. docs/studio/43-commerce-and-financial-control-plane.md
6. docs/studio/44-security-privacy-and-abuse-control-model.md
7. docs/studio/45-repository-memory-and-agent-governance.md
8. The applicable accepted ADR/EP, source files, tests, package manifests, and deployment config.

Tool entrypoints AGENTS.md, CLAUDE.md, .antigravity/AGENTS.md, and .github/copilot-instructions.md must route back here. They are not competing product specifications.

## Authority order

1. Current explicit founder instruction, law, and security constraints.
2. Source code, tests, package/config manifests, and verified runtime/deployment evidence for what actually exists.
3. Frozen EP contracts and accepted ADRs.
4. PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md for binding destination architecture.
5. CANONICAL_PROJECT_MEMORY.md and ROADMAP.md for project state and sequence.
6. Documents 42–44 for strategic product, commerce, and security targets.
7. Tool-specific prompts, old changelogs, historical snapshots, and archived notes.

When sources conflict, state the discrepancy and verify. A target document is not proof of implementation. Code is not proof of production deployment. A deployment URL is not proof of output quality.

## Verified repository snapshot — not a live production audit

GitHub inspection on 2026-11-20 found:
- Repository HassaanFisky/quickaishort; default branch main; visibility PUBLIC.
- Inspected main HEAD: bb6aa32d31482c7010ec8574220abf1089d9a226; latest commit date visible at inspection: 2026-11-09.
- QuickAI Short is the current product; QuickAI Studio is its evolution in the same codebase.
- Current architecture lineage: Next.js frontend, FastAPI backend, Gemini-first AI, Google ADK specialist scaffolds, GCS media, Redis/Cloud Tasks jobs, FFmpeg rendering. Verify manifests/config before changing versions.
- EP-001 Capability Registry is frozen. EP-002 Project Document, EP-003 MediaGraph, EP-004 Orchestrator, EP-005 chat shell, EP-006 manifest bake, and EP-008 onboarding are documented as implemented; verify code/tests before expanding status claims.
- Current agent scaffold documentation lists five principal roles: AI editor, Pre-Flight, viral segment, director, and render worker. Nine domains in document 42 are future responsibility areas, not nine deployed LLM agents.
- fastapi/routers/billing.py contains Paddle, Stripe, and LemonSqueezy webhook routes. frontend/src/lib/billing-plans.ts is Paddle-oriented. This does not prove all providers are approved/configured for the business, nor that a complete double-entry ledger, settlement reconciliation, partner payable or payout engine exists.
- ADR-014 documents a short-form dubbing path. Movie-length dubbing is deferred by ADR-015.
- docs/studio/11-security.md records an older review and watch-list; it is not a fresh penetration test or live IAM verification.

This is a GitHub source snapshot only. No cloud IAM, provider dashboard, live checkout, live AI call, deployment, or penetration test was checked in this documentation update.

## Product invariants

- Conversation is the primary control plane. Users express intent; the system chooses tools behind the scenes.
- User is creative director; AI executes real edits only through registered capabilities.
- Ground suggestions in MediaGraph/project evidence. Missing evidence is uncertainty, never invented facts or timestamps.
- Preserve Next.js + FastAPI + GCS + Redis/Cloud Tasks + FFmpeg and the Studio Kernel. Evolve, do not rewrite without a verified blocker and accepted ADR.
- EP-001 is the capability ABI. EP-002 is authoritative project state; EP-003 owns media evidence; EP-004 owns plan execution; EP-006 defines bake/render manifest.
- Preview, accepted plan, execution acknowledgment, rendered output, and verified success are separate states.
- Keep user UX fast, chat-first, accessible, responsive, multilingual only where validated, and simple for non-experts.
- Learn explicit editing preferences and product friction only with transparent, proportionate privacy controls. Never infer sensitive psychological traits.

## Autonomy and approval limits

Agents may analyze, plan, draft, run bounded diagnostics, and execute safe user-approved project edits inside the authenticated tenant.

No model can authorize itself. No unapproved bank transfer, new payee, ad spend, external contract, public post, production deploy, destructive cloud action, secret rotation, or irreversible deletion. Payment webhooks are not authorization to pay vendors. High-risk actions require deterministic backend policy, authenticated approval, and strong step-up authentication.

No AI role receives unrestricted bank, cloud-admin, production-deploy, or secret-store credentials.

## Cost, security, and honesty

- No paid model/API test, provider top-up, spend-cap increase, or new paid service without explicit approval in the current task.
- Prefer deterministic and mock tests; mock success is not live-provider verification.
- Fail closed on auth, tenant, entitlement, credits, and money movement.
- Never promise unhackable, perfect editing for all possible files, infinite scale, or guaranteed profit.
- Report done, actually tested, not tested, blocked, and assumptions separately.
- This repository is public. Never commit keys, customer files, private bank/payee details, personal financial instructions, or confidential partner terms.

## Local integrity

Before work inspect git status, branch, remotes, and relevant paths. Preserve every pre-existing local modification. Never run destructive reset/clean/checkout-overwrite, rewrite local history, or overwrite user files as a shortcut. Never assume a GitHub snapshot equals the local worktree.

Graft is local, regenerable, and gitignored. Use it if present; never commit graft/ and never run deep/paid graph generation without approval.

Prefer isolated branches and reviewable PRs; do not push directly to main. Before deployment/migration identify target project, service, branch, region, and rollback path.

## Close-of-session memory rule

For any durable verified decision, correction, implementation, or blocker:
1. Update CANONICAL_PROJECT_MEMORY.md with date and evidence.
2. Update ROADMAP.md only when status or sequencing changes.
3. Add or amend an ADR for architectural decisions.
4. Update the relevant changelog/history in the same PR.
5. Update this context snapshot only after actually re-inspecting the source.

Never save guesses, temporary chat details, credentials, or personal data as project memory.
