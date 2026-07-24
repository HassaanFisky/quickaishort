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

_TRUE_VALUES = frozenset({"1", "true", "yes", "on"})


def _env_flag(name: str, *, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in _TRUE_VALUES


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
