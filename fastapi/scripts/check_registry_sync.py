#!/usr/bin/env python3
"""CI guard: BE and FE Capability Registry copies must share the same SHA-256.

EP-001 freeze — prevents silent drift between:
  fastapi/capabilities/registry.v1.json
  frontend/src/lib/generated/capabilities.v1.json
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BE = ROOT / "fastapi" / "capabilities" / "registry.v1.json"
FE = ROOT / "frontend" / "src" / "lib" / "generated" / "capabilities.v1.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    if not BE.is_file():
        print(f"MISSING {BE}", file=sys.stderr)
        return 1
    if not FE.is_file():
        print(f"MISSING {FE}", file=sys.stderr)
        return 1
    be_hash = sha256(BE)
    fe_hash = sha256(FE)
    if be_hash != fe_hash:
        print("EP-001 registry drift detected:", file=sys.stderr)
        print(f"  BE {BE}: {be_hash}", file=sys.stderr)
        print(f"  FE {FE}: {fe_hash}", file=sys.stderr)
        print(
            "Sync with: python fastapi/scripts/sync_capabilities_to_frontend.py",
            file=sys.stderr,
        )
        return 1
    print(f"OK registry hash={be_hash[:16]}…")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
