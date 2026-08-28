"""Health/readiness endpoints must not misreport dependency state.

Root defect this pins down: /health returned the Firestore readiness flag under
the `gcs` key, so a broken storage client could never surface. More broadly,
config-presence checks were reported with words ("connected") that imply a live
connection was made.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture
def client():
    return TestClient(main.app)


class TestGcsFieldIsNotFirestore:
    def test_gcs_field_tracks_the_storage_client_not_a_hardcoded_alias(
        self, client, monkeypatch
    ):
        """The bug: `gcs` was literally `firestore_ok`."""
        monkeypatch.setattr(main, "db_is_ready", lambda: False)
        body = client.get("/health").json()

        assert body["gcs"] is False
        assert body["storage_status"] == "init_failed"

    def test_storage_and_firestore_report_construction_not_connection(
        self, client, monkeypatch
    ):
        monkeypatch.setattr(main, "db_is_ready", lambda: True)
        body = client.get("/health").json()

        # "connected" would overstate: constructing a client does no network I/O.
        assert body["firestore_status"] == "initialized"
        assert body["firestore_status"] != "connected"
        assert body["storage_status"] == "initialized"


class TestChecksAreLabelled:
    def test_every_dependency_field_declares_live_or_config_only(self, client):
        body = client.get("/health").json()

        assert body["redis_check"] == "live"
        assert body["firestore_check"] == "config_only"
        assert body["storage_check"] == "config_only"
        assert body["agent_check"] == "config_only"

    def test_check_semantics_block_partitions_the_dependencies(self, client):
        semantics = client.get("/health").json()["check_semantics"]

        assert "redis" in semantics["live"]
        # Config-only checks must never be advertised as live.
        assert not set(semantics["live"]) & set(semantics["config_only"])
        for name in ("firestore", "storage", "adk"):
            assert name in semantics["config_only"]


class TestLivenessVsReadiness:
    def test_liveness_never_fails_on_a_dependency_outage(self, client, monkeypatch):
        """A liveness probe that fails on dependencies causes restart loops."""

        def _explode():
            raise RuntimeError("redis is down")

        monkeypatch.setattr(main.redis_conn, "ping", _explode)

        resp = client.get("/health/live")
        assert resp.status_code == 200
        assert resp.json()["check"] == "liveness_only"

    def test_readiness_returns_503_when_redis_is_unreachable(self, client, monkeypatch):
        def _explode():
            raise RuntimeError("redis is down")

        monkeypatch.setattr(main.redis_conn, "ping", _explode)

        resp = client.get("/health/ready")
        assert resp.status_code == 503
        assert resp.json()["detail"]["dependency"] == "redis"

    def test_top_level_status_is_liveness_and_not_a_dependency_aggregate(
        self, client, monkeypatch
    ):
        """/health 200 must not be read as "all dependencies healthy"."""

        def _explode():
            raise RuntimeError("redis is down")

        monkeypatch.setattr(main.redis_conn, "ping", _explode)
        monkeypatch.setattr(main, "db_is_ready", lambda: False)

        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert body["redis"] is False
        assert body["gcs"] is False
