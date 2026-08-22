"""Render execution lifecycle + artifact evidence checks.

Existing Redis vocabulary is extended, not replaced:

  queued     = REQUESTED
  validated  = VALIDATED
  accepted   = ACCEPTED
  processing = EXECUTING
  rendered   = object uploaded, not yet proven
  verified   = artifact evidence passed (terminal success)
  success    = alias of verified (legacy readers)
  failed / dead / cancelled / superseded / duplicate / retry_pending

A job must not be marked verified merely because a task was accepted,
the renderer returned, an API returned 200, or upload() returned.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

# Keep processing/queued so existing clients and recovery keep working.
STATUS_QUEUED = "queued"
STATUS_VALIDATED = "validated"
STATUS_ACCEPTED = "accepted"
STATUS_PROCESSING = "processing"
STATUS_RENDERED = "rendered"
STATUS_VERIFIED = "verified"
STATUS_SUCCESS = "success"  # legacy alias of verified
STATUS_FAILED = "failed"
STATUS_DEAD = "dead"
STATUS_CANCELLED = "cancelled"
STATUS_SUPERSEDED = "superseded"
STATUS_DUPLICATE = "duplicate"
STATUS_RETRY_PENDING = "retry_pending"

FAILURE_VALIDATION = "validation"
FAILURE_EXECUTION = "execution"
FAILURE_UPLOAD = "upload"
FAILURE_VERIFICATION = "verification"
FAILURE_STALE_REVISION = "stale_revision"
FAILURE_TIMEOUT = "timeout"
FAILURE_CANCELLED = "cancelled"

TERMINAL_SUCCESS = frozenset({STATUS_VERIFIED, STATUS_SUCCESS})
TERMINAL_FAILURE = frozenset(
    {STATUS_DEAD, STATUS_CANCELLED, STATUS_SUPERSEDED, STATUS_DUPLICATE}
)
TERMINAL_STATUSES = TERMINAL_SUCCESS | TERMINAL_FAILURE | {STATUS_FAILED}

# Minimum non-empty MP4 (ftyp box is 24+ bytes; reject empty/truncated uploads).
MIN_EXPORT_BYTES = 256
EXPECTED_EXPORT_CONTENT_TYPE = "video/mp4"

_ALLOWED_TRANSITIONS: dict[Optional[str], frozenset[str]] = {
    None: frozenset(
        {
            STATUS_QUEUED,
            STATUS_VALIDATED,
            STATUS_ACCEPTED,
            STATUS_PROCESSING,
        }
    ),
    STATUS_QUEUED: frozenset(
        {
            STATUS_VALIDATED,
            STATUS_ACCEPTED,
            STATUS_PROCESSING,
            STATUS_FAILED,
            STATUS_DEAD,
            STATUS_CANCELLED,
            STATUS_SUPERSEDED,
            STATUS_RETRY_PENDING,
        }
    ),
    STATUS_VALIDATED: frozenset(
        {
            STATUS_ACCEPTED,
            STATUS_PROCESSING,
            STATUS_FAILED,
            STATUS_DEAD,
            STATUS_CANCELLED,
            STATUS_SUPERSEDED,
        }
    ),
    STATUS_ACCEPTED: frozenset(
        {
            STATUS_PROCESSING,
            STATUS_FAILED,
            STATUS_DEAD,
            STATUS_CANCELLED,
            STATUS_SUPERSEDED,
            STATUS_DUPLICATE,
            STATUS_RETRY_PENDING,
        }
    ),
    STATUS_PROCESSING: frozenset(
        {
            STATUS_RENDERED,
            STATUS_VERIFIED,
            STATUS_SUCCESS,
            STATUS_FAILED,
            STATUS_DEAD,
            STATUS_CANCELLED,
            STATUS_SUPERSEDED,
            STATUS_DUPLICATE,
            STATUS_RETRY_PENDING,
        }
    ),
    STATUS_RENDERED: frozenset(
        {
            STATUS_VERIFIED,
            STATUS_SUCCESS,
            STATUS_FAILED,
            STATUS_DEAD,
            STATUS_RETRY_PENDING,
        }
    ),
    STATUS_RETRY_PENDING: frozenset(
        {
            STATUS_QUEUED,
            STATUS_ACCEPTED,
            STATUS_PROCESSING,
            STATUS_FAILED,
            STATUS_DEAD,
            STATUS_CANCELLED,
        }
    ),
    STATUS_FAILED: frozenset({STATUS_DEAD, STATUS_RETRY_PENDING, STATUS_QUEUED}),
    STATUS_VERIFIED: frozenset(),
    STATUS_SUCCESS: frozenset(),
    STATUS_DEAD: frozenset({STATUS_QUEUED}),
    STATUS_CANCELLED: frozenset(),
    STATUS_SUPERSEDED: frozenset(),
    STATUS_DUPLICATE: frozenset(),
}


class ArtifactVerificationError(ValueError):
    """Artifact exists-or-metadata proof failed."""

    def __init__(self, code: str, detail: str = "") -> None:
        self.code = code
        super().__init__(detail or code)


@dataclass(frozen=True)
class ArtifactEvidence:
    path: str
    exists: bool
    size: int = 0
    generation: str = ""
    content_type: str = ""
    md5_hash: str = ""
    crc32c: str = ""
    job_id: str = ""
    project_id: str = ""
    project_revision: str = ""
    manifest_hash: str = ""

    def as_meta(self) -> dict[str, str]:
        return {
            "artifact_path": self.path,
            "artifact_exists": "1" if self.exists else "0",
            "artifact_size": str(self.size),
            "artifact_generation": self.generation,
            "artifact_content_type": self.content_type,
            "artifact_md5": self.md5_hash,
            "artifact_crc32c": self.crc32c,
            "bound_job_id": self.job_id,
            "bound_project_id": self.project_id,
            "bound_revision": self.project_revision,
            "bound_manifest_hash": self.manifest_hash,
        }


def can_transition(current: Optional[str], nxt: str) -> bool:
    if current in TERMINAL_SUCCESS and nxt in TERMINAL_SUCCESS:
        return True
    allowed = _ALLOWED_TRANSITIONS.get(current)
    if allowed is None:
        return False
    return nxt in allowed


def public_export_status(internal: str) -> str:
    """Map Redis lifecycle onto the existing /api/status vocabulary.

    finished is reserved for verified artifacts. rendered is still running.
    """

    mapping = {
        STATUS_QUEUED: "queued",
        STATUS_VALIDATED: "queued",
        STATUS_ACCEPTED: "queued",
        STATUS_RETRY_PENDING: "queued",
        STATUS_PROCESSING: "started",
        STATUS_RENDERED: "started",
        STATUS_VERIFIED: "finished",
        STATUS_SUCCESS: "finished",
        STATUS_DEAD: "failed",
        STATUS_FAILED: "failed",
        STATUS_CANCELLED: "canceled",
        STATUS_SUPERSEDED: "canceled",
        STATUS_DUPLICATE: "failed",
    }
    return mapping.get(internal, "unknown")


def verify_artifact_evidence(
    evidence: ArtifactEvidence,
    *,
    expected_path: str,
    min_size: int = MIN_EXPORT_BYTES,
    expected_content_type: str = EXPECTED_EXPORT_CONTENT_TYPE,
    expected_job_id: str = "",
) -> ArtifactEvidence:
    if not evidence.exists:
        raise ArtifactVerificationError("missing", "artifact_missing")
    if evidence.path != expected_path:
        raise ArtifactVerificationError(
            "wrong_artifact",
            f"path_mismatch expected={expected_path} got={evidence.path}",
        )
    if evidence.size < min_size:
        raise ArtifactVerificationError(
            "too_small",
            f"size={evidence.size} min={min_size}",
        )
    if evidence.content_type and expected_content_type:
        got = evidence.content_type.split(";", 1)[0].strip().lower()
        exp = expected_content_type.split(";", 1)[0].strip().lower()
        if got and got != exp:
            raise ArtifactVerificationError(
                "content_type",
                f"content_type={evidence.content_type}",
            )
    if expected_job_id and evidence.job_id and evidence.job_id != expected_job_id:
        raise ArtifactVerificationError(
            "job_mismatch",
            f"job_id={evidence.job_id}",
        )
    if not evidence.generation and evidence.size <= 0:
        raise ArtifactVerificationError("no_generation", "generation_missing")
    return evidence
