#!/usr/bin/env python3
"""Sync fastapi/capabilities/registry.v1.json → frontend/src/lib/generated/capabilities.v1.json"""

from __future__ import annotations

import hashlib
import json
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
    data = json.loads(SRC.read_text(encoding="utf-8"))
    DST_DIR.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, indent=2) + "\n"
    DST.write_text(payload, encoding="utf-8")
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
    print(f"Synced {len(data.get('capabilities', []))} capabilities -> {DST}")
    print(f"sha256_16={digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
