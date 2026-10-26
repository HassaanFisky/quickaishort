"""Tests for the admin analytics endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

import main
import services.analytics_queries


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("ADMIN_SECRET", "test-secret")
    return TestClient(main.app)


@patch("services.analytics_queries.get_agent_latency", new_callable=AsyncMock)
def test_admin_analytics_latency_success(mock_get: AsyncMock, client: TestClient):
    """Test retrieving analytics latency successfully."""
    mock_get.return_value = {"latency": [{"_id": "test_agent", "avg_duration_ms": 100}]}

    resp = client.get(
        "/api/admin/analytics/latency",
        headers={"X-Admin-Secret": "test-secret"}
    )

    assert resp.status_code == 200
    assert resp.json() == {"latency": [{"_id": "test_agent", "avg_duration_ms": 100}]}
    mock_get.assert_called_once_with(agent_name=None, hours=24)


@patch("services.analytics_queries.get_agent_latency", new_callable=AsyncMock)
def test_admin_analytics_latency_with_params(mock_get: AsyncMock, client: TestClient):
    """Test retrieving analytics latency with specific query params."""
    mock_get.return_value = {"latency": []}

    resp = client.get(
        "/api/admin/analytics/latency?agent=myagent&hours=12",
        headers={"X-Admin-Secret": "test-secret"}
    )

    assert resp.status_code == 200
    assert resp.json() == {"latency": []}
    mock_get.assert_called_once_with(agent_name="myagent", hours=12)


def test_admin_analytics_latency_missing_secret(client: TestClient):
    """Test that retrieving analytics latency fails if the admin secret is missing."""
    resp = client.get("/api/admin/analytics/latency")

    assert resp.status_code == 403
    assert resp.json()["detail"] == "Invalid admin secret"


def test_admin_analytics_latency_wrong_secret(client: TestClient):
    """Test that retrieving analytics latency fails if the admin secret is wrong."""
    resp = client.get(
        "/api/admin/analytics/latency",
        headers={"X-Admin-Secret": "wrong-secret"}
    )

    assert resp.status_code == 403
    assert resp.json()["detail"] == "Invalid admin secret"
