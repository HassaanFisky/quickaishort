#!/usr/bin/env python3
"""CI guard: BE and FE registry copies must share the same SHA-256.

Prevents silent drift between backend and frontend for the two canonical
data contracts:
  - Capability Registry (EP-001 freeze):
      fastapi/capabilities/registry.v1.json
      frontend/src/lib/generated/capabilities.v1.json
  - Locale Registry (globalization):
      fastapi/capabilities/locales.v1.json
      frontend/src/lib/generated/locales.v1.json
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PAIRS = [
    (
        "EP-001 capability registry",
        ROOT / "fastapi" / "capabilities" / "registry.v1.json",
        ROOT / "frontend" / "src" / "lib" / "generated" / "capabilities.v1.json",
        "python fastapi/scripts/sync_capabilities_to_frontend.py",
    ),
    (
        "locale registry",
        ROOT / "fastapi" / "capabilities" / "locales.v1.json",
        ROOT / "frontend" / "src" / "lib" / "generated" / "locales.v1.json",
        "python fastapi/scripts/sync_locales_to_frontend.py",
    ),
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    failed = False
    for label, be, fe, sync_cmd in PAIRS:
        if not be.is_file():
            print(f"MISSING {be}", file=sys.stderr)
            failed = True
            continue
        if not fe.is_file():
            print(f"MISSING {fe}", file=sys.stderr)
            failed = True
            continue
        be_hash = sha256(be)
        fe_hash = sha256(fe)
        if be_hash != fe_hash:
            print(f"{label} drift detected:", file=sys.stderr)
            print(f"  BE {be}: {be_hash}", file=sys.stderr)
            print(f"  FE {fe}: {fe_hash}", file=sys.stderr)
            print(f"  Sync with: {sync_cmd}", file=sys.stderr)
            failed = True
        else:
            print(f"OK {label} hash={be_hash[:16]}…")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
