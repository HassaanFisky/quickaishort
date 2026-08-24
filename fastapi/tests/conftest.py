"""Pins AI-mode env vars so the suite behaves the same locally and in CI.

`AGENTS.md` tells developers to put `MOCK_AI_MODE=true` in `fastapi/.env` for
no-spend local work. Application modules call `load_dotenv()`, which does not
override values already present in the environment — so setting the flags here,
at conftest import time (before any app module is imported), gives every test
the CI baseline. Tests that need a mock mode still opt in with monkeypatch.
"""

import os

for _flag in ("MOCK_AI_MODE", "MOCK_AI_EDITOR"):
    os.environ[_flag] = "false"
