"""Automated CORS Origins Verification Suite for QuickAI Studio.

Pins down:
1. Origin http://127.0.0.1:3000 receives valid Access-Control-Allow-Origin and credentials.
2. Preflight OPTIONS requests for http://127.0.0.1:3000 return 200 OK with allowed methods and headers.
3. Existing origins (http://localhost:3000, production domains) remain supported.
4. Unauthorized/malicious origins are strictly disallowed (no CORS headers, 400 on preflight).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture
def client():
    return TestClient(main.app)


class TestCorsOrigin127001:
    """Verifies http://127.0.0.1:3000 CORS support (Feature 2 / CONF-01)."""

    def test_get_request_from_127_0_0_1_returns_cors_headers(self, client):
        """GET request from http://127.0.0.1:3000 must include CORS allow headers."""
        response = client.get("/health", headers={"Origin": "http://127.0.0.1:3000"})
        assert response.status_code == 200
        assert (
            response.headers.get("access-control-allow-origin")
            == "http://127.0.0.1:3000"
        ), "CORS header access-control-allow-origin missing or mismatched for 127.0.0.1:3000"
        assert (
            response.headers.get("access-control-allow-credentials") == "true"
        ), "CORS credentials header missing for 127.0.0.1:3000"

    def test_options_preflight_from_127_0_0_1_succeeds(self, client):
        """OPTIONS preflight from http://127.0.0.1:3000 must succeed with status 200."""
        response = client.options(
            "/health",
            headers={
                "Origin": "http://127.0.0.1:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Authorization, Content-Type",
            },
        )
        assert response.status_code == 200, f"Preflight failed: {response.text}"
        assert (
            response.headers.get("access-control-allow-origin")
            == "http://127.0.0.1:3000"
        )
        assert (
            response.headers.get("access-control-allow-credentials") == "true"
        )
        allow_headers = response.headers.get("access-control-allow-headers", "").lower()
        assert "authorization" in allow_headers or "*" in allow_headers


class TestCorsPreservationAndSecurity:
    """Ensures non-regression of existing allowed origins and rejection of unauthorized origins."""

    @pytest.mark.parametrize(
        "origin",
        [
            "http://localhost:3000",
            "https://quickaishort.online",
            "https://www.quickaishort.online",
            "https://quickaishort-ls7d.vercel.app",
        ],
    )
    def test_existing_origins_preserved(self, client, origin):
        """Existing allowed origins must continue to receive access-control-allow-origin."""
        response = client.get("/health", headers={"Origin": origin})
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == origin
        assert response.headers.get("access-control-allow-credentials") == "true"

    def test_unauthorized_origin_rejected_on_get(self, client):
        """Disallowed origins must NOT receive access-control-allow-origin header."""
        response = client.get(
            "/health", headers={"Origin": "https://malicious-attacker.com"}
        )
        assert response.status_code == 200
        assert "access-control-allow-origin" not in response.headers

    def test_unauthorized_origin_rejected_on_options_preflight(self, client):
        """Disallowed origins must fail OPTIONS preflight with 400 Bad Request."""
        response = client.options(
            "/health",
            headers={
                "Origin": "https://malicious-attacker.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert response.status_code == 400
        assert response.text == "Disallowed CORS origin"
        assert "access-control-allow-origin" not in response.headers
