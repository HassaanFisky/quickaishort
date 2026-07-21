"""EP-008 Media Ingest Policy + onboarding store tests."""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.media_ingest_policy import get_ingest_policy, validate_ingest_file
from services.studio_onboarding import (
    reset_onboarding_store_for_tests,
    get_editor_onboarding,
    put_editor_onboarding,
    should_auto_show_tour,
)


def test_policy_includes_required_extensions():
    p = get_ingest_policy()
    for ext in (".mp4", ".mov", ".mkv", ".webm", ".avi", ".ogv", ".m2ts"):
        assert ext in p["extensions"]
    assert p["max_bytes"] >= p["warn_bytes"]


def test_validate_rejects_unknown_format():
    err = validate_ingest_file(
        filename="hack.exe", content_type="application/octet-stream"
    )
    assert err is not None
    assert err["code"] == "unsupported_format"


def test_validate_accepts_mp4():
    assert validate_ingest_file(filename="clip.mp4", content_type="video/mp4") is None


def test_validate_too_large():
    p = get_ingest_policy()
    err = validate_ingest_file(
        filename="big.mp4",
        content_type="video/mp4",
        byte_size=p["max_bytes"] + 1,
    )
    assert err is not None
    assert err["code"] == "too_large"


@pytest.mark.asyncio
async def test_onboarding_persist_and_auto_show():
    reset_onboarding_store_for_tests()
    assert await should_auto_show_tour("u-new") is True
    await put_editor_onboarding("u-new", status="skipped", step_index=2)
    st = await get_editor_onboarding("u-new")
    assert st.status == "skipped"
    assert await should_auto_show_tour("u-new") is False
