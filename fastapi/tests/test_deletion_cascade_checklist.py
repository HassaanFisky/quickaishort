"""Design-only: deletion cascade doc must stay complete (no live deletes)."""

from __future__ import annotations

from pathlib import Path

DOC = (
    Path(__file__).resolve().parents[2]
    / "docs"
    / "studio"
    / "34-user-deletion-cascade.md"
)


def test_deletion_cascade_doc_lists_all_stores() -> None:
    text = DOC.read_text(encoding="utf-8")
    for needle in (
        "Firestore",
        "GCS",
        "Redis",
        "Mongo",
        "FOUNDER",
        "uploads/{uid}/",
        "exports/{uid}/",
    ):
        assert needle in text, f"missing {needle} in deletion cascade doc"


def test_deletion_cascade_forbids_agent_gsutil_rm() -> None:
    text = DOC.read_text(encoding="utf-8")
    assert "gsutil rm" in text
    assert "must not run" in text.lower() or "Anti-scope" in text
