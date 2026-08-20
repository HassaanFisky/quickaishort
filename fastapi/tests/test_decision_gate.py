"""M0 Decision Intelligence — deterministic dead-air path. No Gemini."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from models.media_graph import FacetBlob, MediaGraph
from models.studio_decision import EvidenceItem
from models.studio_project import StudioProjectHead
from services.decision_service import (
    REMOVE_SILENCES_CAPABILITY,
    classify_objective,
    collect_evidence,
    decide_from_state,
    resolve_objective,
)
from services.media_graph_service import SILENCE_SUGGEST_MIN_SEC


DEAD_AIR_OBJECTIVE = "Remove unnecessary dead air and tighten the pacing."


def _graph(*, silence: FacetBlob | None, extra: dict | None = None) -> MediaGraph:
    now = datetime.now(timezone.utc)
    facets: dict[str, FacetBlob] = {}
    if silence is not None:
        facets["silence"] = silence
    if extra:
        facets.update(extra)
    return MediaGraph(
        graph_id="g1",
        owner_user_id="u1",
        project_id="p1",
        created_at=now,
        updated_at=now,
        status="partial" if facets else "pending",
        facets=facets,
        revision=1,
    )


def _ready_silence(*segments: dict) -> FacetBlob:
    return FacetBlob(status="ready", data={"segments": list(segments)})


def _head() -> StudioProjectHead:
    now = datetime.now(timezone.utc)
    return StudioProjectHead(
        project_id="p1",
        owner_user_id="u1",
        title="Lecture",
        created_at=now,
        updated_at=now,
        revision=3,
        media_graph_id="g1",
    )


def test_classify_dead_air_and_empty_unrelated():
    assert classify_objective(DEAD_AIR_OBJECTIVE) == "dead_air_pacing"
    assert classify_objective("  ") == "empty"
    assert classify_objective("") == "empty"
    assert classify_objective("add cinematic color grade") == "unrelated"


def test_ready_silence_act_remove_silences():
    graph = _graph(
        silence=_ready_silence(
            {"start": 1.0, "end": 2.5, "type": "silence"},
            {"start": 5.0, "end": 5.2, "type": "silence"},
        )
    )
    rec = decide_from_state(DEAD_AIR_OBJECTIVE, project_id="p1", graph=graph, head=_head())
    assert rec.mode == "ACT"
    assert rec.gemini_called is False
    assert rec.credits_charged == 0
    assert rec.plan_id is None
    assert rec.candidate_actions
    assert rec.candidate_actions[0].capability_id == REMOVE_SILENCES_CAPABILITY
    segs = rec.candidate_actions[0].params["segments"]
    assert len(segs) == 1
    assert segs[0]["start"] == 1.0
    assert rec.candidate_actions[0].params["min_silence_sec"] == SILENCE_SUGGEST_MIN_SEC
    kinds = {e.kind for e in rec.evidence}
    assert "PROJECT_OBSERVATION" in kinds
    assert "UNCERTAINTY" not in {
        e.kind for e in rec.evidence if e.reference == "silence" and e.kind != "PROJECT_OBSERVATION"
    }
    silence_obs = [
        e
        for e in rec.evidence
        if e.reference == "silence" and e.kind == "PROJECT_OBSERVATION"
    ]
    assert silence_obs
    assert rec.verification_plan
    assert "not objective success" in rec.verification_plan.lower() or "not objective" in rec.verification_plan.lower()


def test_missing_silence_ask_uncertainty():
    rec = decide_from_state(
        DEAD_AIR_OBJECTIVE, project_id="p1", graph=_graph(silence=None)
    )
    assert rec.mode == "ASK"
    assert rec.candidate_actions == []
    assert rec.plan_id is None
    assert rec.gemini_called is False
    assert rec.credits_charged == 0
    assert any(e.kind == "UNCERTAINTY" and e.reference == "silence" for e in rec.evidence)
    assert rec.missing_information
    assert any("silence" in m.lower() for m in rec.missing_information)


def test_pending_silence_research_uncertainty():
    rec = decide_from_state(
        DEAD_AIR_OBJECTIVE,
        project_id="p1",
        graph=_graph(silence=FacetBlob(status="pending", data={})),
    )
    assert rec.mode == "RESEARCH"
    assert rec.candidate_actions == []
    assert rec.plan_id is None
    assert any(e.kind == "UNCERTAINTY" for e in rec.evidence)
    assert rec.gemini_called is False


def test_no_graph_ask_does_not_invent_gaps():
    rec = decide_from_state(DEAD_AIR_OBJECTIVE, project_id="p1", graph=None)
    assert rec.mode == "ASK"
    assert rec.candidate_actions == []
    summaries = " ".join(e.summary.lower() for e in rec.evidence)
    assert "1.0" not in summaries
    assert not any(
        (e.kind == "PROJECT_OBSERVATION" and "gap" in e.summary.lower())
        for e in rec.evidence
    )


def test_empty_objective_nothing():
    rec = decide_from_state("   ", graph=_graph(silence=_ready_silence()))
    assert rec.mode == "NOTHING"
    assert rec.candidate_actions == []
    assert rec.gemini_called is False


def test_unrelated_objective_ask_not_act():
    rec = decide_from_state(
        "generate a poster image for this lecture",
        graph=_graph(
            silence=_ready_silence({"start": 1.0, "end": 3.0, "type": "silence"})
        ),
    )
    assert rec.mode == "ASK"
    assert rec.candidate_actions == []
    assert rec.objective.objective_class == "unrelated"


def test_inference_never_stored_as_verified_fact():
    graph = _graph(
        silence=_ready_silence({"start": 0.0, "end": 2.0, "type": "silence"})
    )
    items = collect_evidence(graph, _head())
    for e in items:
        if e.kind == "MODEL_INFERENCE":
            assert e.kind != "VERIFIED_FACT"
        if e.source.startswith("media_graph"):
            assert e.kind != "VERIFIED_FACT"

    rec = decide_from_state(DEAD_AIR_OBJECTIVE, graph=graph, head=_head())
    for e in rec.evidence:
        if e.kind == "MODEL_INFERENCE":
            pytest.fail("silence path must not emit MODEL_INFERENCE")
        if e.source.startswith("media_graph"):
            assert e.kind in {"PROJECT_OBSERVATION", "UNCERTAINTY"}
        if e.kind == "VERIFIED_FACT":
            assert e.source == "capability_registry"

    forged = EvidenceItem(
        evidence_id="x",
        kind="MODEL_INFERENCE",
        source="hypothetical_model",
        reference="silence",
        summary="guessed a gap",
    )
    assert forged.kind != "VERIFIED_FACT"


def test_ready_but_subthreshold_gaps_is_ask_not_invented_act():
    rec = decide_from_state(
        DEAD_AIR_OBJECTIVE,
        graph=_graph(
            silence=_ready_silence({"start": 5.0, "end": 5.2, "type": "silence"})
        ),
    )
    assert rec.mode == "ASK"
    assert rec.candidate_actions == []


@pytest.mark.asyncio
async def test_resolve_injected_state_never_calls_gemini(monkeypatch):
    calls: list[object] = []

    async def _boom(*_a, **_k):
        calls.append(1)
        raise AssertionError("Gemini must not be called on deterministic paths")

    monkeypatch.setattr("services.gemini_client.call_gemini", _boom, raising=True)
    monkeypatch.setattr(
        "services.decision_service.call_gemini", _boom, raising=False
    )

    graph = _graph(
        silence=_ready_silence({"start": 1.0, "end": 2.5, "type": "silence"})
    )
    act = await resolve_objective(
        "u1", DEAD_AIR_OBJECTIVE, project_id="p1", graph=graph, head=_head()
    )
    ask = await resolve_objective(
        "u1", DEAD_AIR_OBJECTIVE, project_id="p1", graph=_graph(silence=None)
    )
    research = await resolve_objective(
        "u1",
        DEAD_AIR_OBJECTIVE,
        graph=_graph(silence=FacetBlob(status="pending", data={})),
    )
    nothing = await resolve_objective("u1", "")
    assert calls == []
    assert act.mode == "ACT" and act.gemini_called is False and act.credits_charged == 0
    assert ask.mode == "ASK" and ask.gemini_called is False
    assert research.mode == "RESEARCH" and research.gemini_called is False
    assert nothing.mode == "NOTHING" and nothing.gemini_called is False
