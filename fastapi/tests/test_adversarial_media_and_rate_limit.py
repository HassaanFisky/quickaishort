"""Adversarial Stress Test Suite for Media Tenancy and Rate Limiting (Milestone 2).

Conducted by: challenger_m2_2 (Milestone 2 Adversarial Media & Rate Limit Challenger)
Scope:
1. Rate Limit Key Derivation:
   - Spoofed X-Forwarded-For with forged leftmost IPs in untrusted/direct connection modes.
   - Malformed/injected IP strings in proxy headers (SQLi, path traversal, ports, unicode, invalid octets).
   - Rate limiter live bucket cycling resistance.
2. Multi-Tenant Upload & Status Isolation:
   - User A upload vs User B upload (directory isolation under user_id, filename collision prevention).
   - Cross-tenant PUT upload overwrite attempts and path traversal attempts (HTTP 403).
   - Cross-tenant render status polling attempts (HTTP 403 Forbidden).
   - Boundary finding: PUT to non-upload destinations (e.g. exports/).
3. Corrupt Media Probing:
   - 0-byte file probing (raises ValueError, never fake 60s fallback).
   - Random binary garbage probing (raises ValueError, never fake 60s fallback).
   - Truncated MP4 / text / audio-only files (raises ValueError).
   - Missing ffprobe binary handling (raises RuntimeError, never fake 60s fallback).
   - Upload endpoint cleanup on probe rejection (HTTP 422 and unlinks invalid file).
"""

from __future__ import annotations

import io
import os
from pathlib import Path
from unittest.mock import MagicMock

import jwt
import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

import main
from core.rate_limit import _is_trusted_proxy_enabled, get_real_ip, limiter
import services.auth as auth_mod
from services.local_media_pipeline import LocalMediaPipeline, MediaProbeResult
from services.local_persistence import get_local_db

_CHALLENGER_JWT_SECRET = "challenger-m2-adversarial-test-jwt-secret-key"


@pytest.fixture(autouse=True)
def _setup_challenger_test_env(monkeypatch, tmp_path: Path):
    """Set up isolated storage directories and signing secret for challenger tests."""
    monkeypatch.setenv("NEXTAUTH_SECRET", _CHALLENGER_JWT_SECRET)
    monkeypatch.setattr(auth_mod, "_NEXTAUTH_SECRET", _CHALLENGER_JWT_SECRET)
    monkeypatch.setenv("ENVIRONMENT", "staging")
    monkeypatch.setenv("LOCAL_FIRST_MODE", "0")
    monkeypatch.setenv("LOCAL_STUDIO_AUTH", "0")

    storage_root = tmp_path / "storage"
    monkeypatch.setattr("services.local_persistence.STUDIO_STORAGE_DIR", storage_root)
    monkeypatch.setattr("routers.local_media_router.STUDIO_STORAGE_DIR", storage_root)
    (storage_root / "uploads").mkdir(parents=True, exist_ok=True)
    (storage_root / "exports").mkdir(parents=True, exist_ok=True)


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


def _mint_jwt(user_id: str) -> str:
    return jwt.encode({"sub": user_id}, _CHALLENGER_JWT_SECRET, algorithm="HS256")


def _auth_headers(user_id: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {_mint_jwt(user_id)}"}


def _mock_req(host: str = "192.168.1.100", headers: dict[str, str] | None = None) -> Request:
    req = MagicMock(spec=Request)
    req.client = MagicMock()
    req.client.host = host
    req.headers = headers or {}
    return req


# ==============================================================================
# SECTION 1: RATE LIMIT KEY DERIVATION EMPIRICAL STRESS TESTS
# ==============================================================================

class TestAdversarialRateLimitKeyDerivation:
    """Empirical verification that forged leftmost IPs cannot bypass or corrupt rate limits."""

    @pytest.mark.parametrize(
        "env,trust_proxy,client_host,spoofed_xff",
        [
            ("development", "false", "192.168.1.50", "203.0.113.1"),
            ("development", "false", "10.0.0.99", "1.1.1.1, 8.8.8.8, 9.9.9.9"),
            ("staging", "0", "172.16.5.20", "198.51.100.1, 198.51.100.2"),
            ("staging", "no", "10.10.10.10", "4.4.4.4"),
            ("test", None, "127.0.0.1", "123.123.123.123, 203.0.113.5"),
        ],
    )
    def test_untrusted_direct_mode_strictly_uses_socket_ip(
        self, monkeypatch, env, trust_proxy, client_host, spoofed_xff
    ):
        """In untrusted/direct connection modes, leftmost XFF MUST be ignored."""
        monkeypatch.setenv("ENVIRONMENT", env)
        if trust_proxy is not None:
            monkeypatch.setenv("TRUST_PROXY_HEADERS", trust_proxy)
        else:
            monkeypatch.delenv("TRUST_PROXY_HEADERS", raising=False)
        monkeypatch.delenv("BEHIND_PROXY", raising=False)

        req = _mock_req(host=client_host, headers={"X-Forwarded-For": spoofed_xff})
        resolved = get_real_ip(req)
        assert resolved == client_host, f"Expected socket IP {client_host}, got {resolved}"

    @pytest.mark.parametrize(
        "spoofed_prefix,proxy_appended_ip",
        [
            ("1.2.3.4", "203.0.113.50"),
            ("10.0.0.1, 172.16.0.1", "198.51.100.200"),
            ("attacker.controlled.ip, 8.8.8.8", "192.0.2.1"),
            ("::1, 2001:db8::1", "203.0.113.77"),
        ],
    )
    def test_trusted_proxy_mode_binds_to_rightmost_ingress_ip(
        self, monkeypatch, spoofed_prefix, proxy_appended_ip
    ):
        """Behind trusted proxy, leftmost forged IPs are bypassed in favor of rightmost proxy hop."""
        monkeypatch.setenv("TRUST_PROXY_HEADERS", "true")
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        xff = f"{spoofed_prefix}, {proxy_appended_ip}"
        req = _mock_req(host="10.0.0.1", headers={"X-Forwarded-For": xff})
        resolved = get_real_ip(req)
        assert resolved == proxy_appended_ip, f"Expected rightmost hop {proxy_appended_ip}, got {resolved}"

    @pytest.mark.parametrize(
        "malformed_candidate",
        [
            "invalid_text_host",
            "999.999.999.999",
            "192.168.1.1:8080",
            "<script>alert(1)</script>",
            "../../etc/passwd",
            "'; DROP TABLE rate_limits; --",
            "[2001:db8::1]:80",
            "1.2.3.4.5",
            "0x7f.1",
            "256.0.0.1",
            "2001:xyz::1",
            "   ",
            ",,,",
            "\x00\x01\x02",
        ],
    )
    def test_malformed_ip_strings_in_proxy_headers_fall_back_to_socket_ip(
        self, monkeypatch, malformed_candidate
    ):
        """Malformed or malicious IP tokens must fail validation and fall back safely to socket host."""
        monkeypatch.setenv("TRUST_PROXY_HEADERS", "true")
        socket_ip = "10.0.0.5"
        req = _mock_req(host=socket_ip, headers={"X-Forwarded-For": malformed_candidate})
        resolved = get_real_ip(req)
        assert resolved == socket_ip, f"Malformed token '{malformed_candidate}' did not fall back to socket IP"

    def test_valid_ipv6_accepted_under_trusted_proxy(self, monkeypatch):
        """Valid IPv6 string appended by proxy is correctly parsed and returned."""
        monkeypatch.setenv("TRUST_PROXY_HEADERS", "true")
        ipv6 = "2001:db8:85a3::8a2e:370:7334"
        req = _mock_req(host="10.0.0.1", headers={"X-Forwarded-For": f"1.1.1.1, {ipv6}"})
        assert get_real_ip(req) == ipv6

    def test_limiter_live_bucket_cycling_defeated(self, monkeypatch):
        """Empirically test that an attacker cannot cycle rate limit buckets by changing forged leftmost XFF."""
        # Create a dedicated FastAPI app using the same limiter
        app = FastAPI()
        app.state.limiter = limiter

        @app.get("/test-rate-limit")
        @limiter.limit("2/minute")
        def _endpoint(request: Request):
            return {"status": "ok"}

        # Untrusted direct mode
        monkeypatch.setenv("TRUST_PROXY_HEADERS", "false")
        monkeypatch.setenv("ENVIRONMENT", "staging")

        test_client = TestClient(app)

        # First request (allowed)
        r1 = test_client.get("/test-rate-limit", headers={"X-Forwarded-For": "1.1.1.1"})
        assert r1.status_code == 200

        # Second request (allowed, reaches limit of 2)
        r2 = test_client.get("/test-rate-limit", headers={"X-Forwarded-For": "2.2.2.2"})
        assert r2.status_code == 200

        # Third request with a different spoofed leftmost IP must be BLOCKED (429)
        # because the limiter binds to the testclient socket IP, not the spoofed XFF.
        r3 = test_client.get("/test-rate-limit", headers={"X-Forwarded-For": "3.3.3.3"})
        assert r3.status_code == 429, f"Expected 429 RateLimitExceeded, got {r3.status_code}"


# ==============================================================================
# SECTION 2: MULTI-TENANT UPLOAD & STATUS ISOLATION EMPIRICAL TESTS
# ==============================================================================

class TestAdversarialMultiTenantIsolation:
    """Empirical verification of tenant segregation on upload, PUT, and render status."""

    def test_same_filename_uploads_isolated_in_tenant_folders(
        self, client: TestClient, monkeypatch, tmp_path: Path
    ):
        """User Alice and User Bob uploading identical filenames store into segregated folders."""
        fake_probe = MediaProbeResult(duration=12.0, width=1920, height=1080, fps=30.0)
        monkeypatch.setattr(
            "services.local_media_pipeline.LocalMediaPipeline.probe_media",
            lambda self, path: fake_probe,
        )
        monkeypatch.setattr(
            "services.local_media_pipeline.LocalMediaPipeline.detect_silence",
            lambda self, path: [],
        )

        filename = "hero_video.mp4"
        alice_data = b"ALICE_CONFIDENTIAL_CONTENT_12345"
        bob_data = b"BOB_CONFIDENTIAL_CONTENT_67890"

        # Alice uploads
        res_a = client.post(
            "/api/local-media/upload",
            files={"file": (filename, io.BytesIO(alice_data), "video/mp4")},
            headers=_auth_headers("tenant_alice"),
        )
        assert res_a.status_code == 200
        data_a = res_a.json()
        assert data_a["uploaded_by"] == "tenant_alice"
        assert data_a["video_id"] == f"tenant_alice/{filename}"

        # Bob uploads identical filename
        res_b = client.post(
            "/api/local-media/upload",
            files={"file": (filename, io.BytesIO(bob_data), "video/mp4")},
            headers=_auth_headers("tenant_bob"),
        )
        assert res_b.status_code == 200
        data_b = res_b.json()
        assert data_b["uploaded_by"] == "tenant_bob"
        assert data_b["video_id"] == f"tenant_bob/{filename}"

        # Verify separate storage on disk under tmp_path/storage without overwrite
        storage_root = tmp_path / "storage"
        alice_file = storage_root / "uploads" / "tenant_alice" / filename
        bob_file = storage_root / "uploads" / "tenant_bob" / filename

        assert alice_file.exists(), "Alice's file does not exist on disk"
        assert bob_file.exists(), "Bob's file does not exist on disk"
        assert alice_file.read_bytes() == alice_data, "Alice's file was corrupted or overwritten"
        assert bob_file.read_bytes() == bob_data, "Bob's file was corrupted or overwritten"

    def test_put_cross_tenant_overwrite_strictly_forbidden(self, client: TestClient):
        """User Bob attempting to PUT into User Alice's tenant folder receives 403."""
        target_path = "uploads/tenant_alice/clip.mp4"
        payload = b"BOB_TRYING_TO_OVERWRITE_ALICE"

        resp = client.put(
            f"/api/local-media/put/{target_path}",
            content=payload,
            headers=_auth_headers("tenant_bob"),
        )
        assert resp.status_code == 403
        assert "another tenant" in resp.json()["detail"].lower()

    @pytest.mark.parametrize(
        "traversal_path",
        [
            "uploads/tenant_bob/%2e%2e/tenant_alice/clip.mp4",
            "uploads/tenant_bob/%2e%2e/%2e%2e/etc/shadow",
            "uploads/%2e%2e/uploads/tenant_alice/clip.mp4",
            "%2e%2e/secret.txt",
        ],
    )
    def test_put_path_traversal_attempts_blocked_with_403(
        self, client: TestClient, traversal_path
    ):
        """Path traversal attempts via PUT must be blocked with HTTP 403."""
        resp = client.put(
            f"/api/local-media/put/{traversal_path}",
            content=b"malicious_traversal_data",
            headers=_auth_headers("tenant_bob"),
        )
        assert resp.status_code == 403
        assert "forbidden" in resp.json()["detail"].lower()

    def test_render_status_cross_tenant_query_forbidden(self, client: TestClient):
        """User Bob attempting to query render job belonging to User Alice returns HTTP 403."""
        db = get_local_db()
        alice_job_id = "local_render_alice_priv_123"
        db.collection("render_jobs").document(alice_job_id).set({
            "job_id": alice_job_id,
            "user_id": "tenant_alice",
            "video_id": "tenant_alice/video.mp4",
            "status": "completed",
            "progress": 100,
            "output_url": "/api/local-media/exports/alice.mp4",
        })

        # Alice querying her own job -> 200 OK
        res_alice = client.get(
            f"/api/local-media/render/status/{alice_job_id}",
            headers=_auth_headers("tenant_alice"),
        )
        assert res_alice.status_code == 200
        assert res_alice.json()["job_id"] == alice_job_id

        # Bob querying Alice's job -> 403 Forbidden
        res_bob = client.get(
            f"/api/local-media/render/status/{alice_job_id}",
            headers=_auth_headers("tenant_bob"),
        )
        assert res_bob.status_code == 403
        assert "forbidden" in res_bob.json()["detail"].lower()

        # Unauthenticated query -> 401 Unauthorized
        res_anon = client.get(f"/api/local-media/render/status/{alice_job_id}")
        assert res_anon.status_code == 401

        # Nonexistent job query -> 404 Not Found
        res_404 = client.get(
            "/api/local-media/render/status/does_not_exist_job_xyz",
            headers=_auth_headers("tenant_alice"),
        )
        assert res_404.status_code == 404


# ==============================================================================
# SECTION 3: CORRUPT MEDIA PROBING EMPIRICAL STRESS TESTS
# ==============================================================================

class TestAdversarialCorruptMediaProbing:
    """Empirical verification that 0-byte or garbage media fails closed and never fakes 60s probe."""

    def test_probe_0_byte_file_raises_value_error(self, tmp_path: Path):
        """A 0-byte file must raise ValueError, NEVER returning a fake 60s fallback probe."""
        pipeline = LocalMediaPipeline(storage_root=tmp_path)
        empty_file = tmp_path / "zero_bytes.mp4"
        empty_file.write_bytes(b"")

        with pytest.raises(ValueError) as exc:
            pipeline.probe_media(empty_file)

        msg = str(exc.value).lower()
        assert "empty" in msg or "0 bytes" in msg

    def test_probe_random_binary_garbage_raises_value_error(self, tmp_path: Path):
        """Random binary garbage must raise ValueError, NEVER returning a fake 60s fallback probe."""
        pipeline = LocalMediaPipeline(storage_root=tmp_path)
        if not pipeline.is_ffprobe_available():
            pytest.skip("ffprobe not available in test environment")

        garbage_file = tmp_path / "garbage.mp4"
        # Write 2048 bytes of pseudorandom binary garbage
        garbage_file.write_bytes(os.urandom(2048))

        with pytest.raises(ValueError) as exc:
            pipeline.probe_media(garbage_file)

        msg = str(exc.value).lower()
        assert "ffprobe failed" in msg or "no valid media streams" in msg

    def test_probe_text_file_disguised_as_mp4_raises_value_error(self, tmp_path: Path):
        """Text content with .mp4 extension must raise ValueError."""
        pipeline = LocalMediaPipeline(storage_root=tmp_path)
        if not pipeline.is_ffprobe_available():
            pytest.skip("ffprobe not available in test environment")

        fake_mp4 = tmp_path / "fake_text.mp4"
        fake_mp4.write_text("THIS IS NOT A VALID MP4 FILE CONTAINER", encoding="utf-8")

        with pytest.raises(ValueError):
            pipeline.probe_media(fake_mp4)

    def test_probe_truncated_mp4_header_raises_value_error(self, tmp_path: Path):
        """Truncated MP4 ftyp header without media data must raise ValueError."""
        pipeline = LocalMediaPipeline(storage_root=tmp_path)
        if not pipeline.is_ffprobe_available():
            pytest.skip("ffprobe not available in test environment")

        truncated = tmp_path / "truncated.mp4"
        truncated.write_bytes(b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom")

        with pytest.raises(ValueError):
            pipeline.probe_media(truncated)

    def test_probe_missing_ffprobe_raises_runtime_error_never_fake_probe(
        self, tmp_path: Path, monkeypatch
    ):
        """If ffprobe is missing from the environment, probe_media raises RuntimeError, not 60s probe."""
        pipeline = LocalMediaPipeline(storage_root=tmp_path)
        sample = tmp_path / "sample.mp4"
        sample.write_bytes(b"non empty sample content")

        monkeypatch.setattr(pipeline, "get_ffprobe_bin", lambda: None)
        monkeypatch.setattr(pipeline, "is_ffprobe_available", lambda: False)

        with pytest.raises(RuntimeError) as exc:
            pipeline.probe_media(sample)

        assert "ffprobe is not available on path" in str(exc.value).lower()

    def test_upload_endpoint_0_byte_rejected_with_400(self, client: TestClient):
        """Uploading a 0-byte file through POST /api/local-media/upload returns HTTP 400."""
        resp = client.post(
            "/api/local-media/upload",
            files={"file": ("empty.mp4", io.BytesIO(b""), "video/mp4")},
            headers=_auth_headers("tenant_alice"),
        )
        assert resp.status_code == 400
        assert "empty" in resp.json()["detail"].lower()

    def test_upload_endpoint_corrupt_file_rejected_and_purged(
        self, client: TestClient, monkeypatch, tmp_path: Path
    ):
        """Uploading corrupt binary file returns HTTP 422 and unlinks the file from storage."""
        # Ensure ffprobe fails on corrupt input
        garbage_bytes = b"CORRUPT_NOT_A_REAL_MEDIA_STREAM"
        filename = "corrupt_upload.mp4"

        resp = client.post(
            "/api/local-media/upload",
            files={"file": (filename, io.BytesIO(garbage_bytes), "video/mp4")},
            headers=_auth_headers("tenant_alice"),
        )
        # 422 Unprocessable Entity
        assert resp.status_code == 422
        assert "invalid or unreadable media file" in resp.json()["detail"].lower()

        # Verify that the corrupt file was unlinked from storage
        storage_root = tmp_path / "storage"
        stored_file = storage_root / "uploads" / "tenant_alice" / filename
        assert not stored_file.exists(), "Corrupt file was not cleaned up after probe failure"
