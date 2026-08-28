"""F-1 — signed-token authorization for the media proxy endpoints.

Why a URL token and not a JWT dependency
----------------------------------------
`/api/proxy`, `/api/proxy-video` and `/api/audio` are consumed by
`<video src>` (VideoCanvas.tsx:314 → line 628) and by a bare
`fetch(source, { signal })` in `lib/utils/audioExtractor.ts:23`. Neither can
send an Authorization header, so `Depends(get_verified_user_id)` would break
video preview and audio analysis. The credential must travel in the URL — the
same trust boundary `/api/download` already solves with `services.signing`.

These tests exercise the cryptographic primitive and the enforcement gate
directly. They deliberately do NOT assert on 200 responses from the proxy
endpoints: a 200 there depends on live yt-dlp/network and would prove nothing
about authorization. Denial (403) and token validity are what matter.
"""

from __future__ import annotations

import time

import pytest

from services.signing import (
    sign_media_url,
    verify_media_url,
    sign as sign_export,
)

_SECRET = "unit-test-signing-secret-not-real"
_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
_OTHER_URL = "https://www.youtube.com/watch?v=aaaaaaaaaaa"


@pytest.fixture(autouse=True)
def _secret_env(monkeypatch):
    monkeypatch.setenv("EXPORT_SIGNING_SECRET", _SECRET)


class TestMediaTokenPrimitive:
    def test_valid_token_verifies(self):
        token, expiry = sign_media_url(_URL, "user-1")
        assert verify_media_url(_URL, "user-1", expiry, token) is True

    def test_token_is_bound_to_the_source_url(self):
        """A token for one video must not authorize proxying another."""
        token, expiry = sign_media_url(_URL, "user-1")
        assert verify_media_url(_OTHER_URL, "user-1", expiry, token) is False

    def test_token_is_bound_to_the_user(self):
        token, expiry = sign_media_url(_URL, "user-1")
        assert verify_media_url(_URL, "user-2", expiry, token) is False

    def test_expired_token_is_rejected(self):
        past = int(time.time()) - 10
        token, _ = sign_media_url(_URL, "user-1", expires_at=past)
        assert verify_media_url(_URL, "user-1", past, token) is False

    def test_expiry_cannot_be_extended_without_resigning(self):
        """Tampering with the expiry query param must invalidate the token."""
        token, expiry = sign_media_url(_URL, "user-1")
        assert verify_media_url(_URL, "user-1", expiry + 86_400, token) is False

    def test_forged_and_empty_tokens_are_rejected(self):
        _, expiry = sign_media_url(_URL, "user-1")
        for bad in ("", "deadbeef", "0" * 64):
            assert verify_media_url(_URL, "user-1", expiry, bad) is False

    def test_missing_user_is_rejected(self):
        token, expiry = sign_media_url(_URL, "user-1")
        assert verify_media_url(_URL, "", expiry, token) is False

    def test_malformed_expiry_does_not_raise(self):
        token, _ = sign_media_url(_URL, "user-1")
        assert verify_media_url(_URL, "user-1", None, token) is False  # type: ignore[arg-type]

    def test_token_changes_when_secret_changes(self, monkeypatch):
        token, expiry = sign_media_url(_URL, "user-1")
        monkeypatch.setenv("EXPORT_SIGNING_SECRET", "a-completely-different-secret")
        assert verify_media_url(_URL, "user-1", expiry, token) is False


class TestDomainSeparation:
    def test_export_token_cannot_be_replayed_as_a_media_token(self):
        """Both are HMACs under the same secret — the domain prefix must separate them."""
        expiry = int(time.time()) + 3600
        export_token, _ = sign_export("job-1", "user-1", expires_at=expiry)
        assert verify_media_url("job-1", "user-1", expiry, export_token) is False

    def test_media_token_differs_from_export_token_for_same_inputs(self):
        expiry = int(time.time()) + 3600
        media_token, _ = sign_media_url("job-1", "user-1", expires_at=expiry)
        export_token, _ = sign_export("job-1", "user-1", expires_at=expiry)
        assert media_token != export_token


class TestEnforcementGate:
    """`_require_media_authorization` is the single chokepoint on every proxy route."""

    def _reload_main(self, monkeypatch, required: str):
        import importlib

        monkeypatch.setenv("MEDIA_PROXY_AUTH_REQUIRED", required)
        monkeypatch.setenv("EXPORT_SIGNING_SECRET", _SECRET)
        import main as main_mod

        return importlib.reload(main_mod)

    def test_disabled_by_default_preserves_current_behaviour(self, monkeypatch):
        """Deploying this code must not break the already-deployed frontend."""
        main_mod = self._reload_main(monkeypatch, "false")
        assert main_mod.MEDIA_PROXY_AUTH_REQUIRED is False
        # No token supplied, yet must not raise.
        main_mod._require_media_authorization(_URL, None, None, None)

    def test_enabled_rejects_missing_token(self, monkeypatch):
        from fastapi import HTTPException

        main_mod = self._reload_main(monkeypatch, "true")
        assert main_mod.MEDIA_PROXY_AUTH_REQUIRED is True
        with pytest.raises(HTTPException) as exc:
            main_mod._require_media_authorization(_URL, None, None, None)
        assert exc.value.status_code == 403

    def test_enabled_accepts_a_valid_token(self, monkeypatch):
        main_mod = self._reload_main(monkeypatch, "true")
        token, expiry = sign_media_url(_URL, "user-1")
        main_mod._require_media_authorization(_URL, "user-1", token, expiry)

    def test_enabled_rejects_token_minted_for_another_url(self, monkeypatch):
        from fastapi import HTTPException

        main_mod = self._reload_main(monkeypatch, "true")
        token, expiry = sign_media_url(_OTHER_URL, "user-1")
        with pytest.raises(HTTPException) as exc:
            main_mod._require_media_authorization(_URL, "user-1", token, expiry)
        assert exc.value.status_code == 403


class TestRoutesAreWired:
    """Every costly media route must accept the token params and call the gate."""

    GUARDED = {
        "/api/proxy": ("GET",),
        "/api/proxy-video": ("GET", "HEAD"),
        "/api/audio": ("GET",),
    }

    def test_guarded_routes_accept_token_query_params(self):
        import inspect

        from fastapi.routing import APIRoute

        import main

        seen = set()
        for r in main.app.routes:
            if isinstance(r, APIRoute) and r.path in self.GUARDED:
                params = inspect.signature(r.endpoint).parameters
                # slowapi wraps the endpoint; unwrap to the real function.
                fn = getattr(r.endpoint, "__wrapped__", r.endpoint)
                params = inspect.signature(fn).parameters
                for required in ("user_id", "token", "expires"):
                    assert (
                        required in params
                    ), f"{r.path} is missing '{required}' — it cannot be authorized"
                seen.add(r.path)
        assert seen == set(self.GUARDED), f"missing routes: {set(self.GUARDED) - seen}"

    def test_every_guarded_route_calls_the_authorization_gate(self):
        """Static guard: a new proxy route must not forget the check."""
        from pathlib import Path

        src = (Path(__file__).resolve().parents[1] / "main.py").read_text()
        # One call per guarded handler (3 handlers: proxy, proxy-video GET+HEAD, audio)
        assert (
            src.count("_require_media_authorization(") >= 5
        ), "expected the gate to be called in every proxy handler plus its definition"

    def test_media_token_endpoint_requires_authentication(self):
        import inspect

        from fastapi.routing import APIRoute

        import main

        for r in main.app.routes:
            if isinstance(r, APIRoute) and r.path == "/api/media-token":
                fn = getattr(r.endpoint, "__wrapped__", r.endpoint)
                deps = {
                    getattr(p.default, "dependency", None).__name__
                    for p in inspect.signature(fn).parameters.values()
                    if getattr(p.default, "dependency", None) is not None
                }
                assert (
                    "get_verified_user_id" in deps
                ), "/api/media-token mints credentials and MUST verify JWT"
                return
        pytest.fail("/api/media-token is not registered")
