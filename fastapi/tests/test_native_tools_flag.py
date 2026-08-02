"""ADR-006 native FunctionDeclaration — default OFF."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.flags import is_studio_native_tools
from services.native_tools import (
    build_editor_function_declarations,
    function_calls_to_actions,
    native_tools_enabled,
)


def test_native_tools_default_off(monkeypatch):
    monkeypatch.delenv("STUDIO_NATIVE_TOOLS", raising=False)
    assert is_studio_native_tools() is False
    assert native_tools_enabled() is False


def test_native_tools_env_on(monkeypatch):
    monkeypatch.setenv("STUDIO_NATIVE_TOOLS", "1")
    assert is_studio_native_tools() is True
    assert native_tools_enabled() is True


def test_function_calls_map_to_ep001_action_shape():
    actions = function_calls_to_actions(
        [{"name": "ADD_CAPTION", "args": {"text": "hi"}}]
    )
    assert actions == [{"type": "ADD_CAPTION", "text": "hi"}]


def test_declarations_bounded_when_registry_present():
    decls = build_editor_function_declarations()
    assert isinstance(decls, list)
    assert len(decls) <= 80
