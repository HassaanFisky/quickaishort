# EGM Goldfish Review: Local Media Pipeline & Native FFmpeg Architecture (EGM-SPEC-001)

**Review Date:** 2026-11-03  
**Reviewer:** `egm-design` (Independent Goldfish Persona, Fresh Context)  
**Spec Document:** `docs/egm/specs/001-local-media-pipeline.md`  
**Governing Authority:** Google Elephant-Goldfish Model (EGM)  
**Initial Verdict:** FAIL (2 Blockers, 4 Major Flaws)  
**Remediation Verdict:** PASS (100% Resolved & Hardened)  

---

## 1. Executive Summary
An adversarial, cold-context Goldfish architectural and security review was conducted against `fastapi/services/local_media_pipeline.py` and `fastapi/routers/local_media_router.py`. Two security/correctness blockers and four major architectural inconsistencies were identified. All findings have been remediated, hardened, and verified with zero regression.

---

## 2. Review Findings & Remediation Matrix

| Finding ID | Severity | Subsystem / File | Description | Initial Status | Remediated Status |
|---|---|---|---|---|---|
| **EGM-FIND-001** | **BLOCKER** | `local_media_pipeline.py:115-171` | Arbitrary path traversal in `resolve_source_media` via uncontained absolute path candidates (`p.is_absolute() and p.exists()`). | FAIL | **RESOLVED**: Enforced strict `is_relative_to(storage_root)` containment on all candidates; eliminated untrusted absolute path loading; restricted recursive upload searches to authenticated tenant. |
| **EGM-FIND-002** | **BLOCKER** | `local_media_pipeline.py:263-264` | Fail-open hardcoded phantom silence fallback `[(5.0, 7.5)]` when FFmpeg is unavailable, violating Zero-Hallucination mandate. | FAIL | **RESOLVED**: Removed phantom silence fallback; raises explicit `RuntimeError` when FFmpeg is absent; safely returns `[]` only when media lacks audio streams. |
| **EGM-FIND-003** | **MAJOR** | `local_media_router.py:186-218` | `stream_local_media` permitted arbitrary directory prefixes and served files as attachments (`filename=clean_name`) rather than inline streaming. | FAIL | **RESOLVED**: Allowlisted prefixes to `{"uploads", "exports"}`; enforced strict directory jail; set `content_disposition_type="inline"` in `FileResponse`. |
| **EGM-FIND-004** | **MAJOR** | `local_media_router.py:86-116` | `put_local_presigned_blob` only guarded `uploads/` prefix, leaving `exports/` unverified against cross-tenant overwrite. | FAIL | **RESOLVED**: Enforced prefix allowlist (`uploads`, `exports`) and tenant validation across all prefix subdirectories. |
| **EGM-FIND-005** | **MAJOR** | `local_media_pipeline.py:49-75` | `MediaProbeResult.to_dict()` omitted `video_codec` and `audio_codec` fields required by EGM-SPEC-001 contract. | FAIL | **RESOLVED**: Added explicit `video_codec` and `audio_codec` detection and serialization to `MediaProbeResult`. |
| **EGM-FIND-006** | **MAJOR** | `local_media_router.py:49-84` & `local_media_pipeline.py` | Unbounded memory buffering (`await file.read()`) during uploads and un-timeouted `subprocess.run` executions. | FAIL | **RESOLVED**: Implemented 1MB chunked streaming upload with 500MB safety ceiling; added explicit `timeout=120` / `timeout=180` to all FFmpeg and FFprobe subprocess calls. |

---

## 3. Verification Evidence
1. **Security & Regression Pytest**: All tests in `test_local_media_pipeline.py`, `test_local_media_security.py`, and `test_adversarial_media_and_rate_limit.py` pass.
2. **Deterministic Registry**: `check_registry_sync.py` verified identical capability and locale registry hashes.
3. **Frontend Guardrails**: 33/33 i18n tests, 9/9 middleware adversarial tests, and 14/14 mobile navbar tests passed.
