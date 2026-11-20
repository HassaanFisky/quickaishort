# 45 — Repository Memory, Prompt & Engineering Governance

Status: binding repository operating procedure for coding agents and contributors.  
Reviewed: 2026-11-20.

## 1. One memory system, multiple tool entrypoints

AI_CONTEXT.md is the compact shared memory index. AGENTS.md, CLAUDE.md, .antigravity/AGENTS.md and .github/copilot-instructions.md route tools to it. Do not maintain competing product visions in every IDE prompt. Detailed decisions remain in accepted ADRs/EPs and docs/studio.

## 2. Authority order

1. Current founder instructions, applicable law and security constraints.
2. Current source, tests, package/config manifests and verified runtime evidence for shipped implementation.
3. Frozen EP contracts and accepted ADRs.
4. PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md for binding target architecture.
5. CANONICAL_PROJECT_MEMORY.md and ROADMAP.md for current state and sequence.
6. Documents 42–44 for future product, commerce and security direction.
7. Tool-specific prompts and historical notes, which cannot contradict the above.

A target is not a shipped feature. Source code is not proof of production deployment. A deployment URL is not proof of output quality.

## 3. Session startup

Before a non-trivial task:
1. Read AI_CONTEXT.md.
2. Inspect git status --short --branch, branch, remotes and repository root.
3. Preserve all pre-existing local modifications. Identify local-only work before editing.
4. Read Canonical Project Memory, Phase 2 truth, current Roadmap and applicable ADR/EP.
5. Use local Graft for orientation when available; then verify important facts against source/tests.
6. Read every target file before editing; search for existing implementation and callers.
7. Identify API, data, tenant, cost, performance, privacy, deployment and migration blast radius.
8. Create a small plan with assumptions, verification and rollback.

## 4. Local integrity is non-negotiable

The local worktree is a first-class asset and may differ from GitHub.
- Never run git reset --hard, git clean -fdx, destructive checkout, force push, history rewrite, mass delete or generated-file overwrite as a shortcut.
- Never stash, discard or amend the user's local work without permission.
- Never replace a project folder with a fresh clone. Use a separate worktree/branch when isolation is needed.
- Do not alter .env, .env.local, credentials, local databases, caches or user media unless required and understood.
- Verify paths, manifests, runtime versions and local changes before commands.
- Graft is local and gitignored; never commit graft/.
- Before deploy/migration identify exact project, service, branch, region and rollback path.

## 5. Engineering discipline

- Read before write, including code, docs, prompts and config.
- Prefer the smallest coherent vertical slice over parallel speculative frameworks.
- Reuse EP-001 Registry, EP-002 Project Document, EP-003 MediaGraph, EP-004 Orchestrator and EP-006 RenderManifest.
- No parallel state, ABI, queue, render plane or billing system without accepted ADR.
- Validate every model tool call on the server; model output never authorizes access, spend, money movement, deployment or destruction.
- Make async jobs idempotent, bounded, observable, cancellable and recoverable.
- Keep generated artifacts, frontend/backend registry copies, tests, docs and changelog synchronized.
- New paid vendors/services require explicit approval.

## 6. Verification

Use cheapest meaningful checks:
- docs-only: links, paths, index and diff review;
- registry/schema: generation and frontend/backend hash checks;
- backend: focused pytest, compile/type and auth tests;
- frontend: focused lint/type/build;
- end-to-end: staging mock workflow, then explicit approval for paid/live provider verification.

The repository's Cursor Cloud instruction in AGENTS.md currently says not to run lint, tests, builds, dev servers or browser sessions unless the founder explicitly asks in that same turn. Honor that narrower cloud-agent policy. In local sessions, run safe no-spend checks when environment permits. Always report what ran and what did not.

Never perform live paid-model tests, top-ups, cost-cap increases, production deployment, cloud mutations, destructive operations or irreversible data deletion without explicit approval in the current task.

## 7. Memory and historical documentation

- AI_CONTEXT.md: compact cross-session entrypoint and invariants.
- CANONICAL_PROJECT_MEMORY.md: latest verified facts and accepted decisions.
- ROADMAP.md: shipped/in-progress/blocked/deferred work with dates/evidence.
- ADRs: durable architecture choices and consequences.
- EPs/contracts: implementation boundaries and verification.
- Agent prompts: tool-specific behavior and links to canonical context.

History is append-first. Do not erase useful history or silently rewrite a binding decision. Mark old claims SUPERSEDED with date, reason and replacement link. Material architecture changes need a new/superseding ADR. Update all affected memory, roadmap, ADR and changelog documents in the same PR.

Do not save guesses, transient chat notes, credentials or personal data to project memory.

## 8. Change workflow

1. Create isolated branch from a verified base.
2. Make the smallest coherent change.
3. Inspect full diff for correctness, generated noise, secrets and deletions.
4. Run permitted relevant checks.
5. Update memory/roadmap/ADR/changelog as needed.
6. Open a reviewable PR; do not merge or deploy unless authorized.
7. Report exact files, actual tests, unverified assumptions, blockers and rollback.

## 9. Required completion report

- Done: exact changes and paths.
- Verified: checks actually run and actual results.
- Not verified: tests/services/environments not accessed.
- Risks or blockers: evidence-backed only.
- Next action: one highest-value step.

Never claim success, security, availability, profitability or production readiness without supporting evidence.
