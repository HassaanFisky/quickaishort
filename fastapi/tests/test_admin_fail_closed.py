"""Admin gate must fail closed when ADMIN_SECRET is unset or mismatched."""

from __future__ import annotations

import importlib

import pytest
from fastapi import HTTPException


def _reload_main(monkeypatch: pytest.MonkeyPatch, admin_secret: str | None):
    if admin_secret is None:
        monkeypatch.delenv("ADMIN_SECRET", raising=False)
    else:
        monkeypatch.setenv("ADMIN_SECRET", admin_secret)
    import main as main_mod

    return importlib.reload(main_mod)


def test_require_admin_rejects_when_secret_unset(monkeypatch: pytest.MonkeyPatch):
    main_mod = _reload_main(monkeypatch, None)
    with pytest.raises(HTTPException) as exc:
        main_mod._require_admin(None)
    assert exc.value.status_code == 403


def test_require_admin_rejects_none_vs_none_spoof(monkeypatch: pytest.MonkeyPatch):
    """Regression: unset env + unset header must NOT pass (None == None hole)."""
    main_mod = _reload_main(monkeypatch, None)
    with pytest.raises(HTTPException) as exc:
        main_mod._require_admin(None)
    assert exc.value.status_code == 403


def test_require_admin_accepts_matching_secret(monkeypatch: pytest.MonkeyPatch):
    main_mod = _reload_main(monkeypatch, "test-admin-secret")
    main_mod._require_admin("test-admin-secret")


def test_require_admin_rejects_mismatch(monkeypatch: pytest.MonkeyPatch):
    main_mod = _reload_main(monkeypatch, "test-admin-secret")
    with pytest.raises(HTTPException) as exc:
        main_mod._require_admin("wrong")
    assert exc.value.status_code == 403
