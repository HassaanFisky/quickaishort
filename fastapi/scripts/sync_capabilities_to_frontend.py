#!/usr/bin/env python3
"""Sync fastapi/capabilities/registry.v1.json → frontend/src/lib/generated/capabilities.v1.json

Byte-identical copy so CI ``check_registry_sync.py`` SHA-256 matches.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "fastapi" / "capabilities" / "registry.v1.json"
DST_DIR = ROOT / "frontend" / "src" / "lib" / "generated"
DST = DST_DIR / "capabilities.v1.json"


def main() -> int:
    if not SRC.is_file():
        print(f"ERROR: missing {SRC}", file=sys.stderr)
        return 1
    DST_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SRC, DST)
    raw = DST.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()[:16]
    data = json.loads(raw.decode("utf-8"))
    print(f"Synced {len(data.get('capabilities', []))} capabilities -> {DST}")
    print(f"sha256_16={digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
