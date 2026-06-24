"""Tests for Agent Runtime Guardrails & Scaffold Verification.

Run: cd fastapi && PYTHONPATH=. python -m pytest tests/test_agent_runtime.py -v
"""

from __future__ import annotations

import os
import sys
import json
import pytest
from unittest.mock import patch

# Ensure fastapi/ is on sys.path when running from repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.agent_runtime import (
    validate_scaffolds,
    check_environment_for_agent,
    get_agent_runtime_report,
    ensure_agent_ready,
    load_scaffold_file,
)
from fastapi.testclient import TestClient
from main import app


def test_load_scaffold_file():
    """Verify loading valid scaffold files works and blocks directory traversal."""
    # Test valid load
    content = load_scaffold_file("SOUL.md")
    assert "Constitutional Soul" in content

    # Test directory traversal blocks
    with pytest.raises(FileNotFoundError):
        load_scaffold_file("../../../secrets.txt")


def test_validate_scaffolds_no_placeholders():
    """Ensure that the live scaffolds do not have any placeholder patterns."""
    issues = validate_scaffolds()
    assert len(issues) == 0, f"Expected clean scaffolds, found issues: {issues}"


def test_validate_scaffolds_placeholder_detection():
    """Verify placeholder scanner triggers correctly for all targeted patterns."""
    dummies = [
        ("This is a [TODO] item.", "[TODO]"),
        ("Value is [PLACEHOLDER]", "[PLACEHOLDER]"),
        ("Use YOUR_API_KEY here", "YOUR_"),
        ("Please CHANGE_ME later", "CHANGE_ME")
    ]

    for content, pattern in dummies:
        with patch("pathlib.Path.exists", return_value=True), \
             patch("pathlib.Path.read_text", return_value=content):
            issues = validate_scaffolds()
            assert len(issues) > 0, f"Expected placeholder detection for pattern '{pattern}'"
            assert any(pattern in i["message"] for i in issues)


def test_check_environment_for_agent_validation():
    """Verify env checker reports missing variables based on config rules."""
    # Scenario 1: Empty environment
    with patch.dict(os.environ, {}, clear=True):
        issues = check_environment_for_agent("ai_editor_agent")
        # Required key GEMINI_API_KEY must be reported as error
        assert any(i["type"] == "error" and i["variable"] == "GEMINI_API_KEY" for i in issues)
        # Optional variables reported as warnings
        assert any(i["type"] == "warning" and i["variable"] == "GEMINI_PRIMARY_MODEL" for i in issues)

    # Scenario 2: Partially populated environment
    with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=True):
        issues = check_environment_for_agent("ai_editor_agent")
        # Required keys met
        assert not any(i["type"] == "error" for i in issues)
        # Warnings for optional elements still returned
        assert any(i["type"] == "warning" and i["variable"] == "GEMINI_PRIMARY_MODEL" for i in issues)

    # Scenario 3: fully populated environment
    full_env = {
        "GEMINI_API_KEY": "test-key",
        "GEMINI_PRIMARY_MODEL": "gemini-2.5-flash",
        "GEMINI_FREE_MODEL": "gemini-2.5-flash-lite"
    }
    with patch.dict(os.environ, full_env, clear=True):
        issues = check_environment_for_agent("ai_editor_agent")
        assert len(issues) == 0


def test_ensure_agent_ready_modes():
    """Ensure strict=False never raises, and strict=True raises on missing required fields."""
    # Mode 1: non-strict mode
    with patch.dict(os.environ, {}, clear=True):
        # Even with missing GEMINI_API_KEY, strict=False should return False instead of raising
        verdict = ensure_agent_ready("ai_editor_agent", strict=False)
        assert verdict is False

    # Mode 2: strict mode
    with patch.dict(os.environ, {}, clear=True):
        with pytest.raises(RuntimeError) as exc_info:
            ensure_agent_ready("ai_editor_agent", strict=True)
        assert "is not ready" in str(exc_info.value)

    # Mode 3: Success condition in strict mode
    with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=True):
        with patch("services.agent_runtime.validate_scaffolds", return_value=[]):
            verdict = ensure_agent_ready("ai_editor_agent", strict=True)
            assert verdict is True


def test_agent_runtime_report_structure():
    """Verify compilation and format of report output."""
    with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=True):
        report = get_agent_runtime_report("ai_editor_agent")
        assert "timestamp" in report
        assert "scaffolds_status" in report
        assert "environment_issues" in report
        assert "readiness" in report
        assert report["readiness"]["ai_editor_agent"]["status"] == "ready"


def test_router_health_endpoints():
    """Verify routes are registered and return correct payload structures without exposing env secrets."""
    client = TestClient(app)

    # Endpoint 1: GET /api/agent-runtime/health
    response = client.get("/api/agent-runtime/health")
    assert response.status_code == 200
    data = response.json()
    assert "scaffolds_status" in data
    assert "readiness" in data
    assert "ai_editor_agent" in data["readiness"]

    # Verify no secret values are leaked
    raw_str = json.dumps(data)
    assert "test-key" not in raw_str
    # No actual values should reside in lists or dict fields
    for agent_issues in data.get("environment_issues", {}).values():
        for issue in agent_issues:
            assert "value" not in issue

    # Endpoint 2: GET /api/agent-runtime/health/{agent_name}
    response = client.get("/api/agent-runtime/health/ai_editor_agent")
    assert response.status_code == 200
    data = response.json()
    assert "readiness" in data
    assert "ai_editor_agent" in data["readiness"]

    # Scenario 3: GET with invalid name
    response = client.get("/api/agent-runtime/health/unknown_agent")
    assert response.status_code == 404
