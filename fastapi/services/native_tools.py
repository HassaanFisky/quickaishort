"""ADR-006 native Gemini FunctionDeclaration helpers (flag-gated).

Author: QuickAI Engineering
Last modified: 2026-07-27
"""

from __future__ import annotations

import logging
from typing import Any

from core.flags import is_studio_native_tools
from services.tool_registry import list_emit_allowed

logger = logging.getLogger(__name__)

# Hard cost ceiling — single observation step in Phase 2 canary.
_MAX_NATIVE_TOOL_STEPS = 1


def native_tools_enabled() -> bool:
    return is_studio_native_tools()


def build_editor_function_declarations() -> list[dict[str, Any]]:
    """Map emit-allowed capabilities to Gemini function declarations.

    Uses a minimal JSON-schema envelope so undeclared params stay open
    objects — sanitiser remains the trust boundary.
    """
    decls: list[dict[str, Any]] = []
    for cap in list_emit_allowed():
        cid = str(cap.get("id") or "").strip()
        if not cid:
            continue
        desc = str(cap.get("description") or cap.get("summary") or cid)[:200]
        decls.append(
            {
                "name": cid,
                "description": desc,
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": True,
                },
            }
        )
    return decls[:80]  # bound payload size


def function_calls_to_actions(function_calls: list[Any]) -> list[dict[str, Any]]:
    """Convert SDK function-call parts into canonical {type, ...} actions."""
    actions: list[dict[str, Any]] = []
    for fc in function_calls:
        name = getattr(fc, "name", None) or (
            fc.get("name") if isinstance(fc, dict) else None
        )
        if not name:
            continue
        args = getattr(fc, "args", None)
        if args is None and isinstance(fc, dict):
            args = fc.get("args") or fc.get("arguments") or {}
        if hasattr(args, "items"):
            payload = dict(args)
        elif isinstance(args, dict):
            payload = args
        else:
            payload = {}
        actions.append({"type": str(name), **payload})
    return actions


def max_native_tool_steps() -> int:
    return _MAX_NATIVE_TOOL_STEPS
