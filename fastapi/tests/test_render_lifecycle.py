"""Render lifecycle + artifact verification tests (no live GCS / Gemini)."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from services.render_lifecycle import (
    ArtifactEvidence,
    ArtifactVerificationError,
    STATUS_ACCEPTED,
    STATUS_PROCESSING,
    STATUS_QUEUED,
    STATUS_RENDERED,
    STATUS_VERIFIED,
    can_transition,
    public_export_status,
    verify_artifact_evidence,
)


def test_lifecycle_happy_path_transitions():
    assert can_transition(None, STATUS_QUEUED)
    assert can_transition(STATUS_QUEUED, "validated")
    assert can_transition("validated", STATUS_ACCEPTED)
    assert can_transition(STATUS_ACCEPTED, STATUS_PROCESSING)
    assert can_transition(STATUS_PROCESSING, STATUS_RENDERED)
    assert can_transition(STATUS_RENDERED, STATUS_VERIFIED)
    assert not can_transition(STATUS_QUEUED, STATUS_VERIFIED)
    assert not can_transition(STATUS_ACCEPTED, STATUS_VERIFIED)
    assert not can_transition(STATUS_RENDERED, STATUS_QUEUED)
    assert not can_transition(STATUS_VERIFIED, STATUS_PROCESSING)


def test_rendered_is_not_public_finished():
    assert public_export_status(STATUS_RENDERED) == "started"
    assert public_export_status(STATUS_PROCESSING) == "started"
    assert public_export_status(STATUS_ACCEPTED) == "queued"
    assert public_export_status("validated") == "queued"
    assert public_export_status(STATUS_VERIFIED) == "finished"
    assert public_export_status("success") == "finished"
    assert public_export_status("dead") == "failed"


def test_verify_success_with_real_local_file(tmp_path: Path):
    blob = tmp_path / "export.mp4"
    blob.write_bytes(b"ftyp" + os.urandom(512))
    evidence = ArtifactEvidence(
        path="exports/u/job.mp4",
        exists=True,
        size=blob.stat().st_size,
        generation="17",
        content_type="video/mp4",
        md5_hash="abc",
        crc32c="def",
        job_id="job",
    )
    out = verify_artifact_evidence(
        evidence,
        expected_path="exports/u/job.mp4",
        expected_job_id="job",
    )
    assert out.generation == "17"
    assert out.size >= 256


def test_verify_missing_artifact():
    with pytest.raises(ArtifactVerificationError) as ei:
        verify_artifact_evidence(
            ArtifactEvidence(path="exports/u/job.mp4", exists=False),
            expected_path="exports/u/job.mp4",
        )
    assert ei.value.code == "missing"


def test_verify_wrong_path():
    with pytest.raises(ArtifactVerificationError) as ei:
        verify_artifact_evidence(
            ArtifactEvidence(
                path="exports/u/other.mp4",
                exists=True,
                size=1024,
                generation="1",
                content_type="video/mp4",
            ),
            expected_path="exports/u/job.mp4",
        )
    assert ei.value.code == "wrong_artifact"


def test_verify_too_small():
    with pytest.raises(ArtifactVerificationError) as ei:
        verify_artifact_evidence(
            ArtifactEvidence(
                path="exports/u/job.mp4",
                exists=True,
                size=12,
                generation="1",
                content_type="video/mp4",
            ),
            expected_path="exports/u/job.mp4",
        )
    assert ei.value.code == "too_small"


def test_verify_wrong_content_type():
    with pytest.raises(ArtifactVerificationError) as ei:
        verify_artifact_evidence(
            ArtifactEvidence(
                path="exports/u/job.mp4",
                exists=True,
                size=1024,
                generation="1",
                content_type="text/plain",
            ),
            expected_path="exports/u/job.mp4",
        )
    assert ei.value.code == "content_type"


def test_storage_inspect_fake_blob_then_verify(tmp_path: Path, monkeypatch):
    from services import storage_service as ss

    class _FakeBlob:
        def __init__(self) -> None:
            self.size = 0
            self.content_type = ""
            self.generation = None
            self.md5_hash = None
            self.crc32c = None
            self._exists = False

        def reload(self) -> None:
            if not self._exists:
                raise type("NotFound", (Exception,), {})("404 Not Found")

        def upload_from_filename(self, path: str, content_type: str = "") -> None:
            data = Path(path).read_bytes()
            self._exists = True
            self.size = len(data)
            self.content_type = content_type
            self.generation = 42
            self.md5_hash = "ZmFrZQ=="
            self.crc32c = "crc"

    fake = _FakeBlob()
    monkeypatch.setattr(ss, "is_ready", lambda: True)
    monkeypatch.setattr(
        ss.StorageService,
        "_blob",
        lambda self, remote_path: fake,
    )

    local = tmp_path / "out.mp4"
    local.write_bytes(b"ftyp" + b"\x00" * 400)
    svc = ss.StorageService()
    missing = svc.inspect_blob("exports/u/job.mp4")
    assert missing.exists is False
    with pytest.raises(ArtifactVerificationError):
        svc.verify_export_artifact("exports/u/job.mp4", job_id="job")

    fake.upload_from_filename(str(local), content_type="video/mp4")
    evidence = svc.verify_export_artifact("exports/u/job.mp4", job_id="job")
    assert evidence.generation == "42"
    assert evidence.size >= 256


def test_retry_does_not_mark_unverified_success():
    """Existence without evidence must not public-finish."""
    exists_only = ArtifactEvidence(
        path="exports/u/job.mp4",
        exists=True,
        size=0,
        generation="",
        content_type="video/mp4",
    )
    with pytest.raises(ArtifactVerificationError):
        verify_artifact_evidence(
            exists_only,
            expected_path="exports/u/job.mp4",
        )
    assert public_export_status("rendered") != "finished"


def test_stale_revision_is_annotated_not_impersonation():
    """A job bound to revision N stays bound; newer head does not rewrite identity."""
    bound = ArtifactEvidence(
        path="exports/u/job-n.mp4",
        exists=True,
        size=1024,
        generation="9",
        content_type="video/mp4",
        job_id="job-n",
        project_id="p1",
        project_revision="3",
        manifest_hash="abc",
    )
    out = verify_artifact_evidence(
        bound,
        expected_path="exports/u/job-n.mp4",
        expected_job_id="job-n",
    )
    assert out.project_revision == "3"
    assert out.job_id == "job-n"
    meta = out.as_meta()
    assert meta["bound_revision"] == "3"
    assert meta["bound_job_id"] == "job-n"
