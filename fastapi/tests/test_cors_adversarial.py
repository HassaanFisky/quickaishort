"""Adversarial CORS Verification Suite for QuickAI Studio.

Empirically challenges Starlette CORSMiddleware configuration in fastapi/main.py:
1. Unauthorized Origins:
   - Port manipulation: http://127.0.0.1:3001, http://127.0.0.1:8000, http://localhost:3001, http://localhost:8080
   - Domain spoofing & subdomains: http://127.0.0.1:3000.attacker.com, http://localhost:3000.evil.com, https://quickaishort.online.evil.com, https://notquickaishort.online
   - Vercel spoofing: https://evil-quickaishort-ls7d.vercel.app, https://quickaishort-ls7d.vercel.app.attacker.com
   - Untrusted/primitive origins: null, http://evil.com, http://[::1]:3000, https://127.0.0.1:3000 (scheme mismatch)
2. Preflight (OPTIONS) Fuzzing:
   - Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD
   - Headers: Authorization, Content-Type, X-Custom-Header, X-Requested-With, multi-headers
   - Strict rejection verification: HTTP 400 Bad Request with "Disallowed CORS origin" and absence of access-control-allow-origin
3. Credentials & Header Security:
   - Access-Control-Allow-Credentials is true ONLY with explicit allowed origin, NEVER wildcard '*'
   - Access-Control-Allow-Origin is strictly absent on disallowed origins (preventing cross-origin read)
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture(scope="module")
def client():
    return TestClient(main.app)


# Explicitly authorized origins per fastapi/main.py
AUTHORIZED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://quickaishort.online",
    "https://www.quickaishort.online",
    "https://quickaishort-ls7d.vercel.app",
]

# Adversarial & unauthorized origins designed to probe edge cases
UNAUTHORIZED_ORIGINS = [
    # Port variation attacks
    "http://127.0.0.1:3001",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:8080",
    "http://localhost:3001",
    "http://localhost:8000",
    "http://localhost:8080",
    # Domain suffix / sub-domain prefix spoofing
    "http://127.0.0.1:3000.attacker.com",
    "http://localhost:3000.evil.com",
    "https://quickaishort.online.attacker.com",
    "https://attacker.quickaishort.online",
    "https://fakequickaishort.online",
    "https://quickaishort-ls7d.vercel.app.attacker.com",
    "https://evil-quickaishort-ls7d.vercel.app",
    # Primitive & arbitrary untrusted origins
    "null",
    "http://evil.com",
    "https://evil.com",
    "http://attacker.com:3000",
    # IPv6 localhost (not in allowed list)
    "http://[::1]:3000",
    # Scheme mismatch
    "https://127.0.0.1:3000",
    "https://localhost:3000",
]

PREFLIGHT_METHODS = [
    "GET",
    "POST",
    "PUT",
    "DELETE",
    "PATCH",
    "OPTIONS",
    "HEAD",
]

HEADER_COMBINATIONS = [
    "Authorization",
    "Content-Type",
    "X-Custom-Header",
    "Authorization, Content-Type",
    "Authorization, Content-Type, X-Custom-Header, X-Requested-With",
    "X-Request-ID, Accept, Cache-Control",
]


class TestAdversarialUnauthorizedOrigins:
    """Stress tests rejection of unauthorized origins on simple (GET) and preflight (OPTIONS) requests."""

    @pytest.mark.parametrize("origin", UNAUTHORIZED_ORIGINS)
    def test_unauthorized_origin_get_strictly_omits_allow_origin(self, client: TestClient, origin: str):
        """GET request from unauthorized origin must NEVER receive access-control-allow-origin.
        
        Per WHATWG Fetch specification, omitting Access-Control-Allow-Origin prevents the browser
        from exposing the response to the calling origin.
        """
        response = client.get("/health", headers={"Origin": origin})
        assert response.status_code == 200
        assert (
            "access-control-allow-origin" not in response.headers
        ), f"Critical Security Violation: origin '{origin}' received access-control-allow-origin: {response.headers.get('access-control-allow-origin')}"

    @pytest.mark.parametrize("origin", UNAUTHORIZED_ORIGINS)
    def test_unauthorized_origin_options_preflight_rejected(self, client: TestClient, origin: str):
        """Preflight OPTIONS request from unauthorized origin must be rejected with HTTP 400 Bad Request."""
        response = client.options(
            "/health",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Authorization, Content-Type",
            },
        )
        assert (
            response.status_code == 400
        ), f"Preflight from unauthorized origin '{origin}' did not return 400: got {response.status_code}"
        assert response.text == "Disallowed CORS origin"
        assert (
            "access-control-allow-origin" not in response.headers
        ), f"Unauthorized preflight response included access-control-allow-origin for '{origin}'"


class TestAdversarialPreflightMatrix:
    """Stress tests allowed origins across HTTP methods and custom header permutations."""

    @pytest.mark.parametrize("origin", AUTHORIZED_ORIGINS)
    @pytest.mark.parametrize("method", PREFLIGHT_METHODS)
    def test_authorized_origin_preflight_methods(self, client: TestClient, origin: str, method: str):
        """Preflight OPTIONS with any standard HTTP method must succeed for authorized origins."""
        response = client.options(
            "/health",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": method,
            },
        )
        assert response.status_code == 200, f"Preflight failed for {origin} method {method}: {response.text}"
        assert response.headers.get("access-control-allow-origin") == origin
        assert response.headers.get("access-control-allow-credentials") == "true"
        allow_methods = response.headers.get("access-control-allow-methods", "")
        # Since allow_methods=["*"], Starlette mirrors the requested method or wildcard
        assert method in allow_methods or "*" in allow_methods

    @pytest.mark.parametrize("origin", ["http://127.0.0.1:3000", "http://localhost:3000"])
    @pytest.mark.parametrize("headers_str", HEADER_COMBINATIONS)
    def test_authorized_origin_preflight_headers(self, client: TestClient, origin: str, headers_str: str):
        """Preflight OPTIONS with custom headers must echo allowed headers for authorized origins."""
        response = client.options(
            "/health",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": headers_str,
            },
        )
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == origin
        assert response.headers.get("access-control-allow-credentials") == "true"
        allow_headers = response.headers.get("access-control-allow-headers", "")
        # Starlette mirrors requested headers when allow_headers=["*"]
        for hdr in [h.strip() for h in headers_str.split(",")]:
            assert hdr.lower() in allow_headers.lower() or "*" in allow_headers


class TestCredentialsAndSecurityGuarantees:
    """Verifies that CORS specification credentials security invariants hold."""

    @pytest.mark.parametrize("origin", AUTHORIZED_ORIGINS)
    def test_allow_credentials_never_paired_with_wildcard_origin(self, client: TestClient, origin: str):
        """RFC 6454 / Fetch spec invariant: Access-Control-Allow-Origin MUST NOT be '*' when Allow-Credentials is true."""
        response = client.get("/health", headers={"Origin": origin})
        assert response.status_code == 200
        allow_origin = response.headers.get("access-control-allow-origin")
        allow_cred = response.headers.get("access-control-allow-credentials")

        assert allow_cred == "true"
        assert allow_origin == origin
        assert allow_origin != "*", "Critical CORS vulnerability: Access-Control-Allow-Origin cannot be '*' when credentials are true"

    def test_unauthorized_origin_cannot_steal_authenticated_response(self, client: TestClient):
        """Simulate an authenticated endpoint call with an attacker origin and Bearer token."""
        attacker_origin = "http://127.0.0.1:3000.attacker.com"
        response = client.get(
            "/health",
            headers={
                "Origin": attacker_origin,
                "Authorization": "Bearer fake-token-123",
            },
        )
        # Even with an Authorization header, the access-control-allow-origin MUST NEVER be present for attacker origin
        assert "access-control-allow-origin" not in response.headers

    def test_vary_header_always_includes_origin(self, client: TestClient):
        """Verify Vary: Origin is present to prevent caching proxy confusion across different origins."""
        for origin in ["http://127.0.0.1:3000", "http://evil.com"]:
            response = client.get("/health", headers={"Origin": origin})
            vary = response.headers.get("vary", "")
            assert "Origin" in vary or "origin" in vary.lower(), f"Missing Vary: Origin header for {origin}"
