"""Automated Security & Reliability Verification Suite for Local Media (M2).

Covers:
- SEC-05: Local presigned PUT receiver requires authentication and prevents tenant overwrite.
- SEC-06: Multi-tenant upload isolation scopes files under user_id without collision.
- SEC-07: Cross-user render status guard blocks unauthorized status polling with HTTP 403.
- REL-01: Fail-closed media probing rejects missing ffprobe or corrupt files.
"""

from __future__ import annotations

import io
from pathlib import Path
import jwt
import pytest
from fastapi.testclient import TestClient

import main
import services.auth as auth_mod
from services.local_media_pipeline import LocalMediaPipeline, MediaProbeResult
from services.local_persistence import STUDIO_STORAGE_DIR, get_local_db

_TEST_JWT_SECRET = "test-jwt-signing-secret-for-security-m2"


@pytest.fixture(autouse=True)
def _setup_security_env(monkeypatch, tmp_path: Path):
    """Configure strict test environment with temporary storage and test secret."""
    monkeypatch.setenv("NEXTAUTH_SECRET", _TEST_JWT_SECRET)
    monkeypatch.setattr(auth_mod, "_NEXTAUTH_SECRET", _TEST_JWT_SECRET)
    monkeypatch.setenv("ENVIRONMENT", "staging")
    monkeypatch.setenv("LOCAL_FIRST_MODE", "0")
    monkeypatch.setenv("LOCAL_STUDIO_AUTH", "0")

    # Point local storage to isolated tmp_path
    monkeypatch.setattr("services.local_persistence.STUDIO_STORAGE_DIR", tmp_path / "storage")
    monkeypatch.setattr("routers.local_media_router.STUDIO_STORAGE_DIR", tmp_path / "storage")
    (tmp_path / "storage" / "uploads").mkdir(parents=True, exist_ok=True)
    (tmp_path / "storage" / "exports").mkdir(parents=True, exist_ok=True)


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


def _token(user_id: str) -> str:
    return jwt.encode({"sub": user_id}, _TEST_JWT_SECRET, algorithm="HS256")


def _auth_header(user_id: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(user_id)}"}


# ==============================================================================
# SEC-05: Local Presigned PUT Receiver Authentication
# ==============================================================================

class TestSec05PutBlobAuth:
    """Tests for SEC-05: PUT /api/local-media/put/{remote_path}."""

    def test_unauthenticated_put_rejected_with_401(self, client: TestClient):
        """Unauthenticated PUT requests must be rejected with 401 Unauthorized."""
        resp = client.put(
            "/api/local-media/put/uploads/user_alice/video.mp4",
            content=b"sample video bytes",
        )
        assert resp.status_code == 401
        assert "authorization" in resp.json()["detail"].lower()

    def test_invalid_jwt_put_rejected_with_401(self, client: TestClient):
        """PUT requests with invalid tokens must be rejected with 401."""
        resp = client.put(
            "/api/local-media/put/uploads/user_alice/video.mp4",
            content=b"sample video bytes",
            headers={"Authorization": "Bearer invalid_garbage_token"},
        )
        assert resp.status_code == 401

    def test_authenticated_put_to_own_path_succeeds(self, client: TestClient):
        """Authenticated PUT to own path must succeed with 200."""
        user = "user_alice"
        resp = client.put(
            f"/api/local-media/put/uploads/{user}/clip1.mp4",
            content=b"valid video stream data",
            headers=_auth_header(user),
        )
        assert resp.status_code == 200

    def test_authenticated_put_to_other_tenant_rejected_with_403(self, client: TestClient):
        """Authenticated User Bob cannot overwrite User Alice's upload path."""
        resp = client.put(
            "/api/local-media/put/uploads/user_alice/clip1.mp4",
            content=b"malicious overwrite attempt",
            headers=_auth_header("user_bob"),
        )
        assert resp.status_code == 403
        assert "forbidden" in resp.json()["detail"].lower()

    def test_empty_put_body_rejected_with_400(self, client: TestClient):
        """PUT requests with empty body must be rejected with 400 Bad Request."""
        user = "user_alice"
        resp = client.put(
            f"/api/local-media/put/uploads/{user}/empty.mp4",
            content=b"",
            headers=_auth_header(user),
        )
        assert resp.status_code == 400
        assert "empty" in resp.json()["detail"].lower()

    def test_path_traversal_put_rejected_with_403(self, client: TestClient):
        """PUT paths with path traversal components must be rejected with 403."""
        user = "user_alice"
        resp = client.put(
            "/api/local-media/put/%2e%2e/etc/passwd",
            content=b"root:x:0:0",
            headers=_auth_header(user),
        )
        assert resp.status_code == 403


# ==============================================================================
# SEC-06: Multi-Tenant Upload File Overwrite
# ==============================================================================

class TestSec06UploadTenantIsolation:
    """Tests for SEC-06: POST /api/local-media/upload."""

    def test_unauthenticated_upload_rejected_with_401(self, client: TestClient):
        """Upload without authentication must return 401."""
        file_payload = {"file": ("test.mp4", io.BytesIO(b"data"), "video/mp4")}
        resp = client.post("/api/local-media/upload", files=file_payload)
        assert resp.status_code == 401

    def test_upload_creates_tenant_namespaced_directory(
        self, client: TestClient, monkeypatch
    ):
        """Upload must write to STUDIO_STORAGE_DIR / uploads / user_id / filename."""
        fake_probe = MediaProbeResult(duration=10.0, width=1280, height=720, fps=30.0)
        monkeypatch.setattr(
            "services.local_media_pipeline.LocalMediaPipeline.probe_media",
            lambda self, path: fake_probe,
        )
        monkeypatch.setattr(
            "services.local_media_pipeline.LocalMediaPipeline.detect_silence",
            lambda self, path: [(1.0, 2.0)],
        )

        user = "tenant_user_001"
        filename = "unique_video.mp4"
        file_content = b"fake video bytes for tenant 1"
        file_payload = {"file": (filename, io.BytesIO(file_content), "video/mp4")}

        resp = client.post(
            "/api/local-media/upload",
            files=file_payload,
            headers=_auth_header(user),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["uploaded_by"] == user
        assert f"uploads/{user}/{filename}" in data["media_url"]
        assert data["video_id"] == f"{user}/{filename}"

    def test_concurrent_same_name_uploads_do_not_overwrite(
        self, client: TestClient, monkeypatch
    ):
        """Alice and Bob uploading same filename must result in separate files."""
        fake_probe = MediaProbeResult(duration=5.0, width=1280, height=720, fps=30.0)
        monkeypatch.setattr(
            "services.local_media_pipeline.LocalMediaPipeline.probe_media",
            lambda self, path: fake_probe,
        )
        monkeypatch.setattr(
            "services.local_media_pipeline.LocalMediaPipeline.detect_silence",
            lambda self, path: [],
        )

        shared_name = "presentation.mp4"
        alice_bytes = b"Alice Presentation Content"
        bob_bytes = b"Bob Presentation Content"

        # Alice uploads
        resp_a = client.post(
            "/api/local-media/upload",
            files={"file": (shared_name, io.BytesIO(alice_bytes), "video/mp4")},
            headers=_auth_header("alice_123"),
        )
        assert resp_a.status_code == 200

        # Bob uploads
        resp_b = client.post(
            "/api/local-media/upload",
            files={"file": (shared_name, io.BytesIO(bob_bytes), "video/mp4")},
            headers=_auth_header("bob_456"),
        )
        assert resp_b.status_code == 200

        # Stream back Alice's file
        stream_a = client.get("/api/local-media/uploads/alice_123/presentation.mp4")
        assert stream_a.status_code == 200
        assert stream_a.content == alice_bytes

        # Stream back Bob's file
        stream_b = client.get("/api/local-media/uploads/bob_456/presentation.mp4")
        assert stream_b.status_code == 200
        assert stream_b.content == bob_bytes


# ==============================================================================
# SEC-07: Cross-User Render Status Guard
# ==============================================================================

class TestSec07RenderStatusGuard:
    """Tests for SEC-07: GET /api/local-media/render/status/{job_id}."""

    def test_unauthenticated_status_poll_rejected_with_401(self, client: TestClient):
        """Status check without token returns 401."""
        resp = client.get("/api/local-media/render/status/render_job_123")
        assert resp.status_code == 401

    def test_nonexistent_job_returns_404(self, client: TestClient):
        """Status check on non-existent job_id returns 404."""
        resp = client.get(
            "/api/local-media/render/status/nonexistent_job",
            headers=_auth_header("alice_123"),
        )
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Render job not found"

    def test_owner_can_poll_own_render_status(self, client: TestClient):
        """Owner can poll their own render job progress."""
        job_id = "job_alice_001"
        db = get_local_db()
        db.collection("render_jobs").document(job_id).set({
            "job_id": job_id,
            "video_id": "alice_123/video.mp4",
            "user_id": "alice_123",
            "status": "queued",
            "progress": 0,
        })

        resp = client.get(
            f"/api/local-media/render/status/{job_id}",
            headers=_auth_header("alice_123"),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["job_id"] == job_id
        assert data["status"] == "queued"

    def test_other_user_blocked_with_403(self, client: TestClient):
        """User Bob polling User Alice's render job receives HTTP 403 Forbidden."""
        job_id = "job_alice_secret"
        db = get_local_db()
        db.collection("render_jobs").document(job_id).set({
            "job_id": job_id,
            "video_id": "alice_123/confidential.mp4",
            "user_id": "alice_123",
            "status": "running",
            "progress": 45,
        })

        resp = client.get(
            f"/api/local-media/render/status/{job_id}",
            headers=_auth_header("bob_456"),
        )
        assert resp.status_code == 403
        assert "forbidden" in resp.json()["detail"].lower()


# ==============================================================================
# REL-01: Fail-Closed Media Probing
# ==============================================================================

class TestRel01FailClosedProbing:
    """Tests for REL-01: LocalMediaPipeline.probe_media."""

    def test_probing_fails_closed_when_ffprobe_unavailable(
        self, tmp_path: Path, monkeypatch
    ):
        """When ffprobe is unavailable, probe_media must raise RuntimeError, never fake 60s probe."""
        pipeline = LocalMediaPipeline(storage_root=tmp_path)
        fake_file = tmp_path / "sample.mp4"
        fake_file.write_bytes(b"non empty dummy video bytes")

        # Mock is_ffprobe_available to False and get_ffprobe_bin to None
        monkeypatch.setattr(pipeline, "is_ffprobe_available", lambda: False)
        monkeypatch.setattr(pipeline, "get_ffprobe_bin", lambda: None)

        with pytest.raises(RuntimeError) as exc_info:
            pipeline.probe_media(fake_file)

        assert "ffprobe is not available on path" in str(exc_info.value).lower()

    def test_probing_rejects_empty_file_with_value_error(self, tmp_path: Path):
        """0-byte file must raise ValueError."""
        pipeline = LocalMediaPipeline(storage_root=tmp_path)
        empty_file = tmp_path / "empty.mp4"
        empty_file.write_bytes(b"")

        with pytest.raises(ValueError) as exc:
            pipeline.probe_media(empty_file)
        assert "empty" in str(exc.value).lower()

    def test_probing_rejects_missing_file_with_file_not_found(self, tmp_path: Path):
        """Missing file must raise FileNotFoundError."""
        pipeline = LocalMediaPipeline(storage_root=tmp_path)
        missing = tmp_path / "missing.mp4"

        with pytest.raises(FileNotFoundError):
            pipeline.probe_media(missing)

    def test_probing_rejects_corrupt_file_with_value_error(self, tmp_path: Path):
        """Corrupt media headers must raise ValueError when probed with ffprobe."""
        pipeline = LocalMediaPipeline(storage_root=tmp_path)
        if not pipeline.is_ffprobe_available():
            pytest.skip("ffprobe not available in test environment")

        corrupt_video = tmp_path / "corrupt.mp4"
        corrupt_video.write_bytes(b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom")

        with pytest.raises(ValueError):
            pipeline.probe_media(corrupt_video)
