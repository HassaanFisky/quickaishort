"""EP-003 MediaGraph + grounded suggestions tests."""

from __future__ import annotations

import pytest

from models.media_graph import CreateMediaGraphRequest, UpsertFacetsRequest
from services.media_graph_service import (
    InMemoryMediaGraphStore,
    derive_suggestions,
    reset_media_graph_service_for_tests,
)


@pytest.fixture
def svc():
    return reset_media_graph_service_for_tests(InMemoryMediaGraphStore())


@pytest.mark.asyncio
async def test_empty_graph_non_interactive(svc):
    g = await svc.create("u1", CreateMediaGraphRequest())
    rows = await svc.suggestions(g.graph_id, "u1")
    assert rows is not None
    assert len(rows) == 1
    assert rows[0].interactive is False
    assert rows[0].capability_id is None


@pytest.mark.asyncio
async def test_transcript_suggests_captions(svc):
    g = await svc.create("u1", CreateMediaGraphRequest())
    await svc.upsert_facets(
        g.graph_id,
        "u1",
        UpsertFacetsRequest(
            facets={
                "transcript": {"chunks": [{"text": "hi", "start": 0, "end": 1}], "chunk_count": 1},
                "captions_present": {"enabled": False},
            }
        ),
    )
    rows = await svc.suggestions(g.graph_id, "u1")
    assert rows is not None
    caps = [r for r in rows if r.capability_id == "TOGGLE_CAPTIONS"]
    assert len(caps) == 1
    assert caps[0].interactive is True
    assert "transcript" in caps[0].evidence.facet_keys


@pytest.mark.asyncio
async def test_silence_suggests_remove(svc):
    g = await svc.create("u1", CreateMediaGraphRequest())
    await svc.upsert_facets(
        g.graph_id,
        "u1",
        UpsertFacetsRequest(
            facets={
                "silence": {
                    "segments": [
                        {"start": 1.0, "end": 2.5},
                        {"start": 5.0, "end": 5.2},
                    ]
                }
            }
        ),
    )
    rows = await svc.suggestions(g.graph_id, "u1")
    assert rows is not None
    sil = [r for r in rows if r.capability_id == "REMOVE_SILENCES"]
    assert len(sil) == 1
    assert sil[0].params["min_silence_sec"] == 0.6


@pytest.mark.asyncio
async def test_authz_other_user(svc):
    g = await svc.create("u1", CreateMediaGraphRequest())
    assert await svc.get(g.graph_id, "u2") is None
    assert await svc.suggestions(g.graph_id, "u2") is None


@pytest.mark.asyncio
async def test_ensure_for_project_idempotent(svc):
    a = await svc.ensure_for_project("u1", "proj-1")
    b = await svc.ensure_for_project("u1", "proj-1")
    assert a.graph_id == b.graph_id


def test_derive_pure_no_heuristics_title():
    """Guard: derivation never takes a title string."""
    import inspect

    sig = inspect.signature(derive_suggestions)
    assert list(sig.parameters.keys()) == ["graph"]
