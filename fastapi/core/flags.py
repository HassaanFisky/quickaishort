"""Production-safe feature flags for local validation only.

Author: QuickAI Engineering
Last modified: 2026-07-23
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

# Canonical default — production core setup never enables mocks unless env
# explicitly opts in, and never inside ENVIRONMENT=production.
MOCK_AI_MODE: bool = False
STUDIO_NATIVE_TOOLS: bool = False

_TRUE_VALUES = frozenset({"1", "true", "yes", "on"})


def _env_flag(name: str, *, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in _TRUE_VALUES


def is_mock_ai_editor() -> bool:
    """Local/CI mock for AI Editor — blocked in ENVIRONMENT=production."""
    if not _env_flag("MOCK_AI_EDITOR", default=False):
        return False
    if os.getenv("ENVIRONMENT", "").strip().lower() == "production":
        logger.error(
            "MOCK_AI_EDITOR is set but ENVIRONMENT=production — mock sandbox blocked"
        )
        return False
    return True


def is_mock_ai_mode() -> bool:
    """Return True only for explicit local/dev mock short-circuits.

    Production is fail-closed: even if MOCK_AI_MODE is set, this returns False
    when ENVIRONMENT=production so depleted-credit bypasses cannot ship live.
    """

    if not _env_flag("MOCK_AI_MODE", default=MOCK_AI_MODE):
        return False
    if os.getenv("ENVIRONMENT", "").strip().lower() == "production":
        logger.error(
            "MOCK_AI_MODE is set but ENVIRONMENT=production — mock sandbox blocked"
        )
        return False
    return True


def is_studio_native_tools() -> bool:
    """ADR-006 native FunctionDeclaration tool-loop — default OFF until canary.

    Set STUDIO_NATIVE_TOOLS=1 to enable. Production canary only; prompt-JSON
    Luna path remains the default when this returns False.
    """

    return _env_flag("STUDIO_NATIVE_TOOLS", default=STUDIO_NATIVE_TOOLS)
