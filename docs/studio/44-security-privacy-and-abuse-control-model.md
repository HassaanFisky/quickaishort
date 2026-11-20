# 44 — Security, Privacy & Abuse-Control Model

Status: required target controls and verification checklist; not a certification or proof of current cloud configuration.  
Reviewed: 2026-11-20.

## 1. Security objective

Protect media, documents, identity, projects, payments and business funds through defense in depth, zero-trust authorization, least privilege, audit, detection, containment and tested recovery.

“Unhackable” is not a technically honest claim. Reduce attack surface, prevent common failures, detect compromise and limit blast radius.

## 2. Public repository warning

GitHub reported HassaanFisky/quickaishort as PUBLIC on 2026-11-20. Every committed file, branch, issue and pull request may be public.

Never commit secrets, keys, tokens, cookies, service-account files, customer uploads, raw transcripts, private logs, bank/payee details, personal financial instructions or confidential partner terms. Keep private owner business controls in protected configuration/private systems. Do not change repository visibility automatically; that is an owner decision.

## 3. Threat model

Cover at least:
- cross-tenant IDOR and broken object-level authorization;
- forged, replayed, duplicated, delayed or reordered payment webhooks;
- prompt injection in PDFs, subtitles, metadata, images and transcripts;
- malformed, oversized or malicious media and decompression bombs;
- SSRF through uploaded URLs, redirect chains or media importers;
- unsafe FFmpeg/yt-dlp process arguments and worker escape;
- stolen JWTs, weak admin secrets and excessive service-account privileges;
- abuse of free trials, credits, model quotas, render queues and storage;
- leakage in logs, analytics, error messages, signed URLs or model-provider prompts;
- dependency, CI, deployment and credential compromise;
- denial of service and cost exhaustion.

## 4. Identity and tenant isolation

- Authenticate at a trusted server boundary.
- Derive tenant identity from validated credentials, not a request-body user ID.
- Check ownership on every read, write, export, delete and background job.
- Bind job IDs, projects, object paths, signed URLs and webhook references to the authorized tenant.
- Keep media buckets private; use short-lived scoped signed URLs and verify real IAM/ACL.
- Separate user, worker, billing, support and administrator permissions.
- Apply least privilege to service accounts, database roles, API tokens and agents.
- Test cross-tenant access, including queue retries and replay paths.

## 5. Agent and tool security

- Model output is untrusted: validate URLs, tool args, file paths, code and payment instructions server-side.
- Uploaded content is evidence, never higher-priority instruction. A malicious document cannot override platform policy.
- Server enforces EP-001 allowlist, schema validation, sanitization, ownership, costs, risk and approval.
- Give each role minimum project data and tool permissions. Read-only analysis must not receive mutating tools.
- Finance cannot call arbitrary banking APIs. Security agents cannot grant themselves IAM/admin rights.
- Record tenant, actor/role, capability, input/output reference, policy decision, timestamps, result and correlation ID; redact secrets and unnecessary PII.
- Verify post-execution state independently. An agent's success message is not evidence.

## 6. Data protection and privacy

- Collect only what is needed for account, editing, billing, security and product reliability.
- Encrypt in transit and at rest using supported platform controls. Verify actual configuration; do not claim a specific cipher or certification without evidence.
- Keep private provider keys in managed secret storage and never log them.
- Redact transcripts, file content, email, tokens and payment data from logs.
- Define retention for uploads, intermediates, exports, transcripts, embeddings, telemetry, backups and deleted accounts.
- Test deletion across metadata, objects, caches, derived analysis and queued jobs, subject to lawful retention.
- Explain model-provider data sharing and retention. Customer media is not automatically training or marketing data.
- Behavioral Intelligence stores practical editing preferences and product-friction signals, not sensitive psychological or demographic profiles. Provide review/reset/delete controls.

## 7. Abuse-resistant free access

Never use IP address as the only or permanent user identity.

Use layered, proportionate controls: account/email verification where appropriate; server-side entitlements; per-account quotas and concurrency; upload/render caps; IP burst limits as one signal; risk-triggered bot challenge; duplicate-job protection; storage lifecycle; cost caps; privacy-reviewed device-risk signals only when necessary and disclosed; and recovery/appeal path for legitimate shared networks.

Avoid invasive fingerprinting. Do not block a shared household/mobile carrier solely because users share an IP.

## 8. Detection and incident response

- Log security events with correlation IDs and redaction.
- Alert on cross-tenant attempts, webhook anomalies, unusual credit use, queue spikes, permission changes, suspicious admin actions and payout anomalies.
- Call logs immutable only when independent write/delete protections are verified; otherwise say tamper-evident or access-controlled.
- Maintain severity, containment, credential rotation, notification assessment, recovery and post-incident review.
- Global payment/agent kill switch blocks high-risk effects while safe status/reporting remains available.
- Test backups and restore. Untested backups are not recovery guarantees.

## 9. Release security gates

Verify authentication and object-level authorization; GCS IAM/private access; signed URL scope/TTL; webhook signature/replay/idempotency/failure handling; upload validation and worker isolation; prompt-injection/tool-permission tests; log redaction and secret scanning; limits and cost kill switches; dependency/build security; deletion and restore.

Use staging and mock providers before any paid live smoke test. Live provider tests, top-ups, production IAM changes, deployments, destructive cleanup and irreversible deletion require explicit approval in the current task.

The existing docs/studio/11-security.md review is dated 2026-08-01 and lists residual items. This charter does not mark those findings closed and is not a fresh production audit.
