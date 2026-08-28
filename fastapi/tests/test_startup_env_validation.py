"""Fail-fast startup validation for critical configuration.

Guards the invariant that a production process refuses to boot when it cannot
authenticate, sign URLs, or reach its data plane — rather than booting, looking
healthy to the load balancer, and failing every real request.

Local/development behaviour must remain warn-and-continue.
"""

from __future__ import annotations

import pytest

import main

# NOTE: symbols are resolved through the `main` module on every use, never
# bound at import time. `tests/test_admin_fail_closed.py` calls
# `importlib.reload(main)`, which replaces `StartupConfigurationError` with a
# new class object; a module-level `from main import ...` would leave these
# tests holding the stale class and `pytest.raises` would stop matching
# depending on test execution order.

CRITICAL_ENV_VARS = main.CRITICAL_ENV_VARS
OPTIONAL_ENV_VARS = main.OPTIONAL_ENV_VARS


def _set_all_critical(monkeypatch) -> None:
    for var in main.CRITICAL_ENV_VARS:
        monkeypatch.setenv(var, "present-not-a-real-value")


class TestProductionFailsFast:
    @pytest.mark.parametrize("missing", sorted(CRITICAL_ENV_VARS))
    def test_each_critical_var_alone_aborts_production_startup(
        self, monkeypatch, missing
    ):
        _set_all_critical(monkeypatch)
        monkeypatch.delenv(missing, raising=False)

        with pytest.raises(main.StartupConfigurationError) as exc:
            main._validate_env(is_production=True)

        assert missing in str(exc.value)

    def test_complete_critical_config_boots_in_production(self, monkeypatch):
        _set_all_critical(monkeypatch)
        main._validate_env(is_production=True)  # must not raise

    def test_error_names_variables_but_never_leaks_values(self, monkeypatch):
        _set_all_critical(monkeypatch)
        secret = "super-secret-sentinel-value"
        monkeypatch.setenv("EXPORT_SIGNING_SECRET", secret)
        monkeypatch.delenv("NEXTAUTH_SECRET", raising=False)

        with pytest.raises(main.StartupConfigurationError) as exc:
            main._validate_env(is_production=True)

        assert secret not in str(exc.value)

    def test_missing_optional_var_does_not_block_production_startup(self, monkeypatch):
        _set_all_critical(monkeypatch)
        for var in main.OPTIONAL_ENV_VARS:
            monkeypatch.delenv(var, raising=False)

        main._validate_env(is_production=True)  # degrades, does not abort

    def test_auth_signing_and_data_plane_are_all_critical(self):
        """Regression guard: these three concerns must never be downgraded."""
        assert "NEXTAUTH_SECRET" in main.CRITICAL_ENV_VARS  # auth integrity
        assert "EXPORT_SIGNING_SECRET" in main.CRITICAL_ENV_VARS  # request signing
        assert "GOOGLE_CLOUD_PROJECT" in main.CRITICAL_ENV_VARS  # data plane
        assert "REDIS_URL" in main.CRITICAL_ENV_VARS  # render coordination

    def test_critical_and_optional_sets_are_disjoint(self):
        assert not (set(main.CRITICAL_ENV_VARS) & set(main.OPTIONAL_ENV_VARS))


class TestDevelopmentUnchanged:
    def test_missing_critical_vars_only_warn_outside_production(self, monkeypatch):
        for var in main.CRITICAL_ENV_VARS:
            monkeypatch.delenv(var, raising=False)

        main._validate_env(is_production=False)  # must not raise

    def test_environment_unset_is_treated_as_non_production(self, monkeypatch):
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        for var in main.CRITICAL_ENV_VARS:
            monkeypatch.delenv(var, raising=False)

        main._validate_env()  # autodetects; must not raise
