"""EP-003 MediaGraph + grounded suggestions tests."""

from __future__ import annotations

import pytest

from models.media_graph import CreateMediaGraphRequest, UpsertFacetsRequest
from services.media_graph_service import (
    InMemoryMediaGraphStore,
    derive_suggestions,
    reset_media_graph_service_for_tests,
)

# Capability IDs that Phase-1 derive_suggestions may emit (must stay ⊆ wired set).
_WIRED_SUGGESTION_CAPS = frozenset(
    {
        "TOGGLE_CAPTIONS",
        "DUB_VIDEO",
        "REMOVE_SILENCES",
        "SEEK",
        "DETECT_VIRAL_MOMENTS",
        "TRIM",
        "SET_PLAYBACK_SPEED",
        "SET_AUDIO_BOOST",
        "SET_NOISE_REDUCTION",
        "GENERATE_HOOK_CAPTION",
        "ADD_CAPTION",
        "ADD_SFX",
        "EXPORT_CLIP",
    }
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
                "transcript": {
                    "chunks": [
                        {
                            "text": "Welcome to the biggest tip today",
                            "start": 0.2,
                            "end": 2.5,
                        }
                    ],
                    "chunk_count": 1,
                },
                "captions_present": {"enabled": False},
            }
        ),
    )
    rows = await svc.suggestions(g.graph_id, "u1")
    assert rows is not None
    assert all(
        r.capability_id is None or r.capability_id in _WIRED_SUGGESTION_CAPS
        for r in rows
    )
    caps = [r for r in rows if r.capability_id == "TOGGLE_CAPTIONS"]
    assert len(caps) == 1
    assert caps[0].interactive is True
    assert caps[0].label == "Add subtitles"
    assert "transcript" in caps[0].evidence.facet_keys
    assert "chunks" in caps[0].evidence.summary.lower() or "1" in caps[0].evidence.summary
    dub = [r for r in rows if r.capability_id == "DUB_VIDEO"]
    assert len(dub) == 1
    assert "EN transcript ready" in dub[0].evidence.summary
    assert "1 chunks" in dub[0].evidence.summary
    hook_trims = [r for r in rows if r.capability_id == "TRIM"]
    assert any("hook" in r.label.lower() for r in hook_trims)
    assert any('"' in r.label for r in hook_trims)


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
                        {"start": 1.0, "end": 2.5, "type": "silence"},
                        {"start": 5.0, "end": 5.2, "type": "silence"},
                        {"start": 0.0, "end": 1.0, "type": "keep"},
                    ]
                }
            }
        ),
    )
    rows = await svc.suggestions(g.graph_id, "u1")
    assert rows is not None
    sil = [r for r in rows if r.capability_id == "REMOVE_SILENCES"]
    assert len(sil) == 1
    assert "dead air" in sil[0].label.lower()
    assert sil[0].params["min_silence_sec"] == 0.6
    assert isinstance(sil[0].params.get("segments"), list)
    assert len(sil[0].params["segments"]) == 1  # 5.0–5.2 below threshold
    assert "0:" in sil[0].evidence.summary or "1:" in sil[0].evidence.summary
    preview = [
        r
        for r in rows
        if r.capability_id == "SEEK" and "dead air" in r.label.lower()
    ]
    assert len(preview) == 1
    assert preview[0].params["time"] == 1.0


@pytest.mark.asyncio
async def test_viral_pack_has_times_and_detect_params(svc):
    g = await svc.create("u1", CreateMediaGraphRequest())
    await svc.upsert_facets(
        g.graph_id,
        "u1",
        UpsertFacetsRequest(
            facets={
                "viral_moments": {
                    "moments": [
                        {
                            "start": 12.0,
                            "end": 24.0,
                            "score": 88,
                            "hook": "Plot twist landing",
                        },
                        {"start": 40.0, "end": 48.0, "score": 72},
                    ]
                }
            }
        ),
    )
    rows = await svc.suggestions(g.graph_id, "u1")
    assert rows is not None
    assert len(rows) <= 8
    assert all(
        r.capability_id is None or r.capability_id in _WIRED_SUGGESTION_CAPS
        for r in rows
    )
    detect = [r for r in rows if r.capability_id == "DETECT_VIRAL_MOMENTS"]
    assert len(detect) == 1
    moments = detect[0].params.get("moments") or []
    assert len(moments) >= 1
    assert moments[0]["timestamp"] == 12.0
    assert moments[0]["score"] == 88
    seek = [r for r in rows if r.capability_id == "SEEK"]
    assert any("0:12" in r.label or "best moment" in r.label.lower() for r in seek)
    trim = [r for r in rows if r.capability_id == "TRIM"]
    assert any(r.params.get("start") == 12.0 for r in trim)
    sfx = [r for r in rows if r.capability_id == "ADD_SFX"]
    assert len(sfx) == 1
    assert sfx[0].params.get("start_sec") == 12.0


@pytest.mark.asyncio
async def test_rich_pack_caps_at_eight_ranked(svc):
    g = await svc.create("u1", CreateMediaGraphRequest())
    await svc.upsert_facets(
        g.graph_id,
        "u1",
        UpsertFacetsRequest(
            facets={
                "duration": {"seconds": 720},
                "transcript": {
                    "chunk_count": 4,
                    "chunks": [
                        {"text": "Here is the opening hook line", "start": 0, "end": 2},
                        {
                            "text": "Then dense speech keeps going with more words here",
                            "start": 2,
                            "end": 6,
                        },
                        {
                            "text": "And even more dense wording packed tightly together",
                            "start": 6,
                            "end": 10,
                        },
                        {"text": "Closing beat with energy", "start": 10, "end": 12},
                    ],
                },
                "captions_present": {"enabled": False},
                "silence": {
                    "segments": [
                        {"start": 15.0, "end": 17.5, "type": "silence"},
                        {"start": 30.0, "end": 32.0, "type": "silence"},
                    ]
                },
                "viral_moments": {
                    "moments": [
                        {"start": 50, "end": 62, "score": 91, "hook": "Peak beat"}
                    ]
                },
            }
        ),
    )
    rows = await svc.suggestions(g.graph_id, "u1")
    assert rows is not None
    assert len(rows) <= 8
    interactive = [r for r in rows if r.interactive]
    assert len(interactive) >= 3
    confidences = [r.confidence for r in rows]
    assert confidences == sorted(confidences, reverse=True)
    for r in interactive:
        assert r.capability_id in _WIRED_SUGGESTION_CAPS
        assert r.evidence.summary
        assert r.evidence.facet_keys


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


@pytest.mark.asyncio
async def test_upsert_facets_noop_skips_revision_bump(svc):
    g = await svc.create("u1", CreateMediaGraphRequest())
    body = UpsertFacetsRequest(
        facets={"duration": {"seconds": 12.0}, "captions_present": {"enabled": False}}
    )
    first = await svc.upsert_facets(g.graph_id, "u1", body)
    assert first is not None
    rev = first.revision
    second = await svc.upsert_facets(g.graph_id, "u1", body)
    assert second is not None
    assert second.revision == rev


@pytest.mark.asyncio
async def test_ensure_binds_media_graph_id_on_project_head():
    from models.studio_project import CreateStudioProjectRequest
    from services.project_kernel import (
        InMemoryProjectStore,
        reset_project_kernel_for_tests,
    )

    kernel = reset_project_kernel_for_tests(InMemoryProjectStore())
    head = await kernel.create_project("u1", CreateStudioProjectRequest(title="t"))
    graph_svc = reset_media_graph_service_for_tests(InMemoryMediaGraphStore())
    g = await graph_svc.ensure_for_project("u1", head.project_id)
    bound = await kernel.get_project(head.project_id, "u1")
    assert bound is not None
    assert bound.media_graph_id == g.graph_id
    # Second ensure uses head pointer (same graph)
    g2 = await graph_svc.ensure_for_project("u1", head.project_id)
    assert g2.graph_id == g.graph_id


def test_derive_pure_no_heuristics_title():
    """Guard: derivation never takes a title string."""
    import inspect

    sig = inspect.signature(derive_suggestions)
    assert list(sig.parameters.keys()) == ["graph"]


def test_derive_never_emits_unwired_capability():
    from datetime import datetime, timezone

    from models.media_graph import FacetBlob, MediaGraph

    now = datetime.now(timezone.utc)
    g = MediaGraph(
        graph_id="g1",
        owner_user_id="u1",
        created_at=now,
        updated_at=now,
        facets={
            "transcript": FacetBlob(
                status="ready",
                data={
                    "chunk_count": 1,
                    "chunks": [{"text": "Hello world friends", "start": 0, "end": 1}],
                },
            ),
            "silence": FacetBlob(
                status="ready",
                data={"segments": [{"start": 2, "end": 4, "type": "silence"}]},
            ),
            "viral_moments": FacetBlob(
                status="ready",
                data={"moments": [{"start": 5, "end": 10, "score": 80}]},
            ),
            "duration": FacetBlob(status="ready", data={"seconds": 120}),
            "captions_present": FacetBlob(status="ready", data={"enabled": False}),
        },
    )
    rows = derive_suggestions(g)
    assert len(rows) <= 8
    for r in rows:
        if r.capability_id is not None:
            assert r.capability_id in _WIRED_SUGGESTION_CAPS
