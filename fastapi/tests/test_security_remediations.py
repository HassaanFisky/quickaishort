"""Automated Security Remediation Verification Suite (SEC-02, SEC-03, SEC-04).

Author: QuickAI Engineering
Milestone: M2 Security & Reliability Remediation
"""

from __future__ import annotations

import importlib
import os
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from core.rate_limit import get_real_ip
from services.signing import sign_media_url
from services.video_service import VideoService
import main


# ==============================================================================
# SEC-02: Rate-Limit IP Spoofing Prevention
# ==============================================================================

def _make_request(host: str = "192.168.1.100", headers: dict | None = None):
    req = MagicMock()
    req.client.host = host
    req.headers = headers or {}
    return req


class TestSec02RateLimitIPSpoofing:
    def test_direct_connection_ignores_client_xff(self, monkeypatch):
        """In non-proxy environments, client-supplied XFF is untrusted."""
        monkeypatch.setenv("TRUST_PROXY_HEADERS", "false")
        monkeypatch.setenv("ENVIRONMENT", "development")
        req = _make_request("192.168.1.100", {"X-Forwarded-For": "1.2.3.4"})
        assert get_real_ip(req) == "192.168.1.100"

    def test_trusted_proxy_extracts_rightmost_appended_ip(self, monkeypatch):
        """Behind Cloud Run / Vercel proxy, rightmost IP is the proxy-appended peer."""
        monkeypatch.setenv("TRUST_PROXY_HEADERS", "true")
        req = _make_request("10.0.0.1", {"X-Forwarded-For": "1.1.1.1, 203.0.113.195"})
        assert get_real_ip(req) == "203.0.113.195"

    def test_multi_hop_spoofing_attempt_defeated(self, monkeypatch):
        """Attacker prepending multiple fake hops cannot spoof rate limit key."""
        monkeypatch.setenv("TRUST_PROXY_HEADERS", "true")
        req = _make_request("10.0.0.1", {"X-Forwarded-For": "8.8.8.8, 10.0.0.5, 203.0.113.50"})
        assert get_real_ip(req) == "203.0.113.50"

    def test_whitespace_tolerance(self, monkeypatch):
        monkeypatch.setenv("TRUST_PROXY_HEADERS", "true")
        req = _make_request("10.0.0.1", {"X-Forwarded-For": "  1.1.1.1 ,   203.0.113.50   "})
        assert get_real_ip(req) == "203.0.113.50"

    def test_malformed_ip_falls_back_to_client_host(self, monkeypatch):
        monkeypatch.setenv("TRUST_PROXY_HEADERS", "true")
        req = _make_request("10.0.0.1", {"X-Forwarded-For": "malicious_injection; drop table"})
        assert get_real_ip(req) == "10.0.0.1"

    def test_production_environment_enables_proxy_resolution(self, monkeypatch):
        monkeypatch.delenv("TRUST_PROXY_HEADERS", raising=False)
        monkeypatch.setenv("ENVIRONMENT", "production")
        req = _make_request("10.0.0.1", {"X-Forwarded-For": "1.1.1.1, 198.51.100.22"})
        assert get_real_ip(req) == "198.51.100.22"

    def test_missing_client_object_falls_back_to_loopback(self, monkeypatch):
        monkeypatch.setenv("TRUST_PROXY_HEADERS", "false")
        req = MagicMock()
        req.client = None
        req.headers = {}
        assert get_real_ip(req) == "127.0.0.1"


# ==============================================================================
# SEC-03: Media Proxy Authorization Fail-Closed Default
# ==============================================================================

_SECRET = "unit-test-media-proxy-secret"
_TEST_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


class TestSec03MediaProxyAuthDefault:
    def test_default_is_fail_closed_when_env_unset(self, monkeypatch):
        monkeypatch.delenv("MEDIA_PROXY_AUTH_REQUIRED", raising=False)
        monkeypatch.setenv("EXPORT_SIGNING_SECRET", _SECRET)
        import main as main_mod
        main_mod = importlib.reload(main_mod)

        assert main_mod.MEDIA_PROXY_AUTH_REQUIRED is True
        with pytest.raises(HTTPException) as exc:
            main_mod._require_media_authorization(_TEST_URL, None, None, None)
        assert exc.value.status_code == 403

    def test_valid_token_succeeds_under_default_enforcement(self, monkeypatch):
        monkeypatch.delenv("MEDIA_PROXY_AUTH_REQUIRED", raising=False)
        monkeypatch.setenv("EXPORT_SIGNING_SECRET", _SECRET)
        import main as main_mod
        main_mod = importlib.reload(main_mod)

        token, expiry = sign_media_url(_TEST_URL, "user-123")
        # Must not raise
        main_mod._require_media_authorization(_TEST_URL, "user-123", token, expiry)

    def test_can_be_explicitly_disabled_for_local_testing(self, monkeypatch):
        monkeypatch.setenv("MEDIA_PROXY_AUTH_REQUIRED", "false")
        monkeypatch.setenv("EXPORT_SIGNING_SECRET", _SECRET)
        import main as main_mod
        main_mod = importlib.reload(main_mod)

        assert main_mod.MEDIA_PROXY_AUTH_REQUIRED is False
        # Must not raise even without token
        main_mod._require_media_authorization(_TEST_URL, None, None, None)


# ==============================================================================
# SEC-04: Video URL SSRF and Domain Whitelist Validation
# ==============================================================================

class TestSec04VideoUrlSSRFValidation:
    @pytest.mark.parametrize(
        "url,expected_id",
        [
            ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "dQw4w9WgXcQ"),
            ("https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://www.youtube.com/shorts/dQw4w9WgXcQ/", "dQw4w9WgXcQ"),
            ("https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://youtu.be/dQw4w9WgXcQ?si=abcdef12345", "dQw4w9WgXcQ"),
            ("www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
            ("https://www.tiktok.com/@creator/video/7123456789012345678", "7123456789012345678"),
            ("https://vm.tiktok.com/ZMlabc123/", "ZMlabc123"),
            ("https://www.tiktok.com/t/ZTdabc123/", "ZTdabc123"),
        ],
    )
    def test_valid_allowed_urls_extract_correct_id(self, url, expected_id):
        assert VideoService.extract_video_id(url) == expected_id

    @pytest.mark.parametrize(
        "ssrf_url",
        [
            "http://169.254.169.254/latest/meta-data/abcdefghijk",
            "http://127.0.0.1:8000/api/v1/abcdefghijk",
            "http://localhost:8000/abcdefghijk",
            "http://internal-db.corp:5432/abcdefghijk",
            "http://metadata.google.internal/computeMetadata/v1/12345678901",
        ],
    )
    def test_ssrf_internal_ips_rejected(self, ssrf_url):
        assert VideoService.extract_video_id(ssrf_url) is None

    @pytest.mark.parametrize(
        "spoofed_url",
        [
            "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com.attacker.com/watch?v=dQw4w9WgXcQ",
            "https://attacker-youtube.com/watch?v=dQw4w9WgXcQ",
            "https://fake-youtu.be/dQw4w9WgXcQ",
            "https://tiktok.com.evil.com/video/7123456789012345678",
        ],
    )
    def test_domain_spoofing_attempts_rejected(self, spoofed_url):
        assert VideoService.extract_video_id(spoofed_url) is None

    def test_non_http_schemes_rejected(self):
        assert VideoService.extract_video_id("file:///etc/passwd/12345678901") is None
        assert VideoService.extract_video_id("javascript:alert(1)/12345678901") is None

    def test_require_youtube_url_raises_400_on_ssrf(self):
        with pytest.raises(HTTPException) as exc:
            main._require_youtube_url("http://169.254.169.254/abcdefghijk")
        assert exc.value.status_code == 400

    @pytest.mark.asyncio
    async def test_download_segment_raises_on_untrusted_url(self, tmp_path):
        with pytest.raises(ValueError, match="Invalid or untrusted video URL"):
            await VideoService.download_segment(
                "http://169.254.169.254/abcdefghijk",
                0,
                10,
                str(tmp_path),
            )
