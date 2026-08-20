"""M0 Decision Intelligence — deterministic dead-air path. No Gemini."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

from models.media_graph import FacetBlob, MediaGraph
from models.studio_decision import EvidenceItem
from models.studio_project import StudioProjectHead
from services.decision_service import (
    REMOVE_SILENCES_CAPABILITY,
    candidate_matches_project_event,
    classify_objective,
    collect_evidence,
    decide_from_state,
    resolve_objective,
    verify_remove_silences_params_against_graph,
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


def _head(project_id: str = "p1") -> StudioProjectHead:
    now = datetime.now(timezone.utc)
    return StudioProjectHead(
        project_id=project_id,
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
    rec = decide_from_state(
        DEAD_AIR_OBJECTIVE, project_id="p1", graph=graph, head=_head()
    )
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
        e.kind
        for e in rec.evidence
        if e.reference == "silence" and e.kind != "PROJECT_OBSERVATION"
    }
    silence_obs = [
        e
        for e in rec.evidence
        if e.reference == "silence" and e.kind == "PROJECT_OBSERVATION"
    ]
    assert silence_obs
    assert rec.verification_plan
    assert (
        "not objective success" in rec.verification_plan.lower()
        or "not objective" in rec.verification_plan.lower()
    )


def test_missing_silence_ask_uncertainty():
    rec = decide_from_state(
        DEAD_AIR_OBJECTIVE, project_id="p1", graph=_graph(silence=None)
    )
    assert rec.mode == "ASK"
    assert rec.candidate_actions == []
    assert rec.plan_id is None
    assert rec.gemini_called is False
    assert rec.credits_charged == 0
    assert any(
        e.kind == "UNCERTAINTY" and e.reference == "silence" for e in rec.evidence
    )
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
    monkeypatch.setattr("services.decision_service.call_gemini", _boom, raising=False)

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


def test_verify_remove_silences_params_rejects_forged_segments():
    graph = _graph(
        silence=_ready_silence({"start": 1.0, "end": 2.5, "type": "silence"})
    )
    ok, _ = verify_remove_silences_params_against_graph(
        {
            "segments": [{"start": 1.0, "end": 2.5, "type": "silence"}],
        },
        graph,
    )
    assert ok is True

    forged, detail = verify_remove_silences_params_against_graph(
        {
            "segments": [{"start": 99.0, "end": 100.0, "type": "silence"}],
        },
        graph,
    )
    assert forged is False
    assert detail == "segment_not_in_evidence"


@pytest.mark.asyncio
async def test_gated_execute_rejects_tampered_plan_segments(orch, monkeypatch):
    service, kernel, mg_store = orch
    head = await kernel.create_project(
        "u1",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest(10)),
    )
    graph = _graph(
        silence=_ready_silence({"start": 1.0, "end": 2.5, "type": "silence"})
    )
    await _seed_mediagraph(kernel, mg_store, head, graph)
    _patch_resolve(monkeypatch, graph, head=_head(head.project_id))

    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            decision_gate=True,
            intent_text=DEAD_AIR_OBJECTIVE,
            project_id=head.project_id,
        ),
    )
    assert plan.decision_mode == "ACT"
    plan.steps[0].params["segments"] = [
        {"start": 99.0, "end": 100.0, "type": "silence"}
    ]
    await asyncio.to_thread(service.store.put, plan)

    executed = await service.execute_plan(
        "u1",
        ExecutePlanRequest(
            plan_id=plan.plan_id,
            project_id=head.project_id,
            base_revision=0,
            base_snapshot_hash=head.snapshot_hash,
            proposed_manifest=_manifest(10),
        ),
    )
    assert executed.status == "failed"
    assert "evidence_verify_failed" in (executed.message or "")
    assert executed.execution_integrity is not None
    assert executed.execution_integrity.status == "execution_failed"
    assert executed.steps[0].status == "rejected"


# ─── Phase B: Orchestrator ↔ Decision Intelligence wiring ───────────────────


from models.render_manifest import RenderManifest, RenderTimeline
from models.studio_project import CreateStudioProjectRequest
from services.media_graph_service import (
    InMemoryMediaGraphStore,
    reset_media_graph_service_for_tests,
)
from services.orchestrator_service import (
    CreatePlanRequest,
    ExecutePlanRequest,
    Plan,
    PlanStep,
    RedisPlanStore,
    StructuredIntent,
    _compute_execution_integrity,
    reset_orchestrator_for_tests,
)
from services.project_kernel import InMemoryProjectStore, reset_project_kernel_for_tests


def _manifest(d: float = 10.0) -> RenderManifest:
    return RenderManifest(
        generatedAt=1,
        timeline=RenderTimeline(fps=30, width=1080, height=1920, duration=d),
    )


@pytest.fixture
def orch():
    kernel = reset_project_kernel_for_tests(InMemoryProjectStore())
    mg_store = InMemoryMediaGraphStore()
    reset_media_graph_service_for_tests(mg_store)
    service = reset_orchestrator_for_tests(kernel=kernel)
    return service, kernel, mg_store


async def _seed_mediagraph(
    kernel,
    mg_store: InMemoryMediaGraphStore,
    head,
    graph: MediaGraph,
) -> MediaGraph:
    bound = graph.model_copy(
        update={
            "project_id": head.project_id,
            "owner_user_id": head.owner_user_id,
        }
    )
    mg_store.put(bound)
    await kernel.bind_media_graph_id(
        head.project_id, head.owner_user_id, bound.graph_id
    )
    return bound


def _patch_resolve(monkeypatch, graph, head=None):
    async def _resolve(user_id, text, project_id=None, **kwargs):
        return decide_from_state(
            text,
            project_id=project_id or "p1",
            graph=graph,
            head=head or _head(),
        )

    monkeypatch.setattr(
        "services.decision_service.resolve_objective", _resolve, raising=True
    )


@pytest.mark.asyncio
async def test_gated_ready_silence_act_remove_silences(orch, monkeypatch):
    service, _, _ = orch
    graph = _graph(
        silence=_ready_silence({"start": 1.0, "end": 2.5, "type": "silence"})
    )
    _patch_resolve(monkeypatch, graph)

    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            decision_gate=True,
            intent_text=DEAD_AIR_OBJECTIVE,
            project_id="p1",
        ),
    )
    assert plan.decision_id
    assert plan.decision_mode == "ACT"
    assert len(plan.steps) == 1
    assert plan.steps[0].capability_id == REMOVE_SILENCES_CAPABILITY
    assert plan.status == "draft"
    assert plan.execution_integrity is not None
    assert plan.execution_integrity.status == "not_executed"


@pytest.mark.asyncio
async def test_gated_mode_is_server_derived_not_client(orch, monkeypatch):
    service, _, _ = orch
    _patch_resolve(monkeypatch, _graph(silence=None))

    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            decision_gate=True,
            intent_text=DEAD_AIR_OBJECTIVE,
            project_id="p1",
            decision_mode="ACT",
        ),
    )
    assert plan.decision_mode == "ASK"
    assert plan.steps == []
    assert plan.decision_id


@pytest.mark.asyncio
async def test_gated_ask_research_nothing_cannot_execute(orch, monkeypatch):
    service, kernel, _ = orch
    head = await kernel.create_project(
        "u1",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest()),
    )

    async def _resolve(user_id, text, project_id=None, **kwargs):
        if "pending" in text:
            return decide_from_state(
                DEAD_AIR_OBJECTIVE,
                project_id=project_id,
                graph=_graph(silence=FacetBlob(status="pending", data={})),
            )
        return decide_from_state(
            DEAD_AIR_OBJECTIVE, project_id=project_id, graph=_graph(silence=None)
        )

    monkeypatch.setattr(
        "services.decision_service.resolve_objective", _resolve, raising=True
    )

    for intent, expected_mode in [
        (DEAD_AIR_OBJECTIVE, "ASK"),
        ("pending marker " + DEAD_AIR_OBJECTIVE, "RESEARCH"),
    ]:
        plan = await service.create_plan(
            "u1",
            CreatePlanRequest(
                decision_gate=True,
                intent_text=intent,
                project_id=head.project_id,
            ),
        )
        assert plan.decision_mode == expected_mode
        assert plan.steps == []
        executed = await service.execute_plan(
            "u1",
            ExecutePlanRequest(
                plan_id=plan.plan_id,
                project_id=head.project_id,
                base_revision=0,
                proposed_manifest=_manifest(),
            ),
        )
        assert executed.decision_mode == expected_mode
        assert executed.execution_integrity is not None
        assert executed.execution_integrity.status == "not_executed"
        assert executed.status == "draft"
        assert all(s.status == "pending" for s in executed.steps)

    async def _nothing_resolve(user_id, text, project_id=None, **kwargs):
        return decide_from_state("   ")

    monkeypatch.setattr(
        "services.decision_service.resolve_objective", _nothing_resolve, raising=True
    )
    nothing_plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            decision_gate=True,
            intent_text="placeholder for NOTHING decision",
            project_id=head.project_id,
        ),
    )
    assert nothing_plan.decision_mode == "NOTHING"
    nothing_exec = await service.execute_plan(
        "u1",
        ExecutePlanRequest(
            plan_id=nothing_plan.plan_id,
            project_id=head.project_id,
            base_revision=0,
            proposed_manifest=_manifest(),
        ),
    )
    assert nothing_exec.execution_integrity is not None
    assert nothing_exec.execution_integrity.status == "not_executed"


@pytest.mark.asyncio
async def test_gated_missing_evidence_not_act(orch, monkeypatch):
    service, _, _ = orch
    _patch_resolve(monkeypatch, _graph(silence=None))

    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            decision_gate=True,
            intent_text=DEAD_AIR_OBJECTIVE,
            project_id="p1",
        ),
    )
    assert plan.decision_mode == "ASK"
    assert plan.steps == []


@pytest.mark.asyncio
async def test_gated_deterministic_no_gemini_via_orchestrator(orch, monkeypatch):
    service, _, _ = orch
    calls: list[object] = []

    async def _boom(*_a, **_k):
        calls.append(1)
        raise AssertionError("Gemini must not be called")

    monkeypatch.setattr("services.gemini_client.call_gemini", _boom, raising=True)
    graph = _graph(
        silence=_ready_silence({"start": 1.0, "end": 2.5, "type": "silence"})
    )
    _patch_resolve(monkeypatch, graph)

    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            decision_gate=True,
            intent_text=DEAD_AIR_OBJECTIVE,
            project_id="p1",
        ),
    )
    assert calls == []
    assert plan.decision_mode == "ACT"


@pytest.mark.asyncio
async def test_ungated_structured_suggestion_unchanged(orch):
    service, _, _ = orch
    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            source="suggestion",
            structured=StructuredIntent(
                capability_id="TOGGLE_CAPTIONS",
                params={"enabled": True},
            ),
        ),
    )
    assert plan.decision_id is None
    assert plan.decision_mode is None
    assert plan.status == "draft"
    assert len(plan.steps) == 1


@pytest.mark.asyncio
async def test_old_plan_json_without_decision_fields_loads():
    from datetime import datetime, timezone

    fake_redis: dict[str, str] = {}

    class _Fake:
        def setex(self, key, ttl, value):
            fake_redis[key] = value
            return True

        def get(self, key):
            return fake_redis.get(key)

    store = RedisPlanStore(redis_client=_Fake(), ttl_sec=120)
    now = datetime.now(timezone.utc)
    legacy = Plan(
        plan_id="legacy1",
        owner_user_id="u1",
        created_at=now,
        updated_at=now,
        status="draft",
        steps=[],
    )
    store.put(legacy)
    loaded = store.get("legacy1")
    assert loaded is not None
    assert loaded.decision_id is None
    assert loaded.decision_mode is None
    assert loaded.execution_integrity is None


@pytest.mark.asyncio
async def test_gated_act_execute_integrity_not_objective_verified(orch, monkeypatch):
    service, kernel, mg_store = orch
    head = await kernel.create_project(
        "u1",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest(10)),
    )
    graph = _graph(
        silence=_ready_silence({"start": 1.0, "end": 2.5, "type": "silence"})
    )
    await _seed_mediagraph(kernel, mg_store, head, graph)
    _patch_resolve(monkeypatch, graph, head=_head(head.project_id))

    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            decision_gate=True,
            intent_text=DEAD_AIR_OBJECTIVE,
            project_id=head.project_id,
        ),
    )
    assert plan.decision_mode == "ACT"
    executed = await service.execute_plan(
        "u1",
        ExecutePlanRequest(
            plan_id=plan.plan_id,
            project_id=head.project_id,
            base_revision=0,
            base_snapshot_hash=head.snapshot_hash,
            proposed_manifest=_manifest(10),
        ),
    )
    assert executed.status in {"completed", "partial", "failed"}
    assert executed.execution_integrity is not None
    assert executed.execution_integrity.status in {
        "execution_ok",
        "execution_partial",
        "execution_failed",
    }
    assert executed.execution_integrity.status != "objective_verified"
    assert "objective_verified" not in executed.model_dump_json()
    if (
        executed.status == "completed"
        and executed.execution_integrity.status == "execution_ok"
    ):
        assert executed.execution_integrity.kernel_events_verified is True
        assert "not_objective" in (executed.execution_integrity.message or "")
        assert "client_proposed_manifest" in (
            executed.execution_integrity.message or ""
        )


@pytest.mark.asyncio
async def test_gated_plan_owner_isolation(orch, monkeypatch):
    service, _, _ = orch
    graph = _graph(
        silence=_ready_silence({"start": 1.0, "end": 2.5, "type": "silence"})
    )
    _patch_resolve(monkeypatch, graph)

    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            decision_gate=True,
            intent_text=DEAD_AIR_OBJECTIVE,
            project_id="p1",
        ),
    )
    assert await service.get_plan(plan.plan_id, "other-user") is None


class _LockFakeRedis:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}
        self.set_calls: list[tuple] = []

    def set(self, key, value, nx=False, ex=None):
        self.set_calls.append((key, value, nx, ex))
        if nx and key in self.data:
            return False
        self.data[key] = str(value)
        return True

    def get(self, key):
        return self.data.get(key)

    def setex(self, key, ttl, value):
        self.data[key] = value
        return True


@pytest.mark.asyncio
async def test_gated_double_execute_uses_lock(monkeypatch):
    from services.orchestrator_service import OrchestratorService

    fake = _LockFakeRedis()
    kernel = reset_project_kernel_for_tests(InMemoryProjectStore())
    mg_store = InMemoryMediaGraphStore()
    reset_media_graph_service_for_tests(mg_store)
    store = RedisPlanStore(redis_client=fake, ttl_sec=120)
    service = OrchestratorService(store=store, kernel=kernel)

    head = await kernel.create_project(
        "u1",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest()),
    )
    graph = _graph(
        silence=_ready_silence({"start": 1.0, "end": 2.5, "type": "silence"})
    )
    await _seed_mediagraph(kernel, mg_store, head, graph)

    async def _resolve(user_id, text, project_id=None, **kwargs):
        return decide_from_state(
            text,
            project_id=project_id,
            graph=graph,
            head=_head(project_id or head.project_id),
        )

    monkeypatch.setattr(
        "services.decision_service.resolve_objective", _resolve, raising=True
    )
    monkeypatch.setattr("services.queue_service.redis_conn", fake, raising=False)

    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            decision_gate=True,
            intent_text=DEAD_AIR_OBJECTIVE,
            project_id=head.project_id,
        ),
    )
    assert plan.decision_mode == "ACT"

    body = ExecutePlanRequest(
        plan_id=plan.plan_id,
        project_id=head.project_id,
        base_revision=0,
        base_snapshot_hash=head.snapshot_hash,
        proposed_manifest=_manifest(),
    )
    first = await service.execute_plan("u1", body)
    second = await service.execute_plan("u1", body)
    lock_keys = [c[0] for c in fake.set_calls if c[2] is True]
    assert any(k.startswith("orch:exec:") for k in lock_keys)
    assert first.status in {"completed", "partial", "failed"}
    assert second.plan_id == first.plan_id


def test_gated_execution_ok_requires_kernel_event_ids_for_mutating_steps():
    """Tier 0: accepted mutating step without event_ids is not execution_ok."""
    now = datetime.now(timezone.utc)
    plan = Plan(
        plan_id="p-ev",
        owner_user_id="u1",
        created_at=now,
        updated_at=now,
        status="completed",
        decision_id="dec-1",
        decision_mode="ACT",
        steps=[
            PlanStep(
                step_id="s1",
                capability_id=REMOVE_SILENCES_CAPABILITY,
                status="accepted",
                event_ids=[],
            )
        ],
    )
    integrity = _compute_execution_integrity(plan)
    assert integrity.status == "execution_partial"
    assert integrity.accepted == [REMOVE_SILENCES_CAPABILITY]

    plan.steps[0].event_ids = ["evt-1"]
    integrity_ok = _compute_execution_integrity(plan)
    assert integrity_ok.status == "execution_ok"


def test_candidate_matches_project_event_missing_is_not_zero():
    ok, detail = candidate_matches_project_event(
        REMOVE_SILENCES_CAPABILITY,
        {"segments": [{"start": 1.0, "end": 2.5, "type": "silence"}]},
        None,
    )
    assert ok is False
    assert detail == "kernel_event_missing"


def test_candidate_matches_project_event_segments_and_capability():
    from models.studio_project import Actor, ProjectEvent, ProjectOp

    now = datetime.now(timezone.utc)
    intended = {"segments": [{"start": 1.0, "end": 2.5, "type": "silence"}]}
    event = ProjectEvent(
        event_id="e1",
        project_id="p1",
        revision=1,
        parent_revision=0,
        ts=now,
        actor=Actor(kind="agent", user_id="u1"),
        capability_id=REMOVE_SILENCES_CAPABILITY,
        command_id="c1",
        op=ProjectOp(type=REMOVE_SILENCES_CAPABILITY, params=dict(intended)),
        affects_manifest=True,
    )
    ok, _ = candidate_matches_project_event(REMOVE_SILENCES_CAPABILITY, intended, event)
    assert ok is True

    event.capability_id = "TRIM"
    bad_cap, detail = candidate_matches_project_event(
        REMOVE_SILENCES_CAPABILITY, intended, event
    )
    assert bad_cap is False
    assert detail == "kernel_event_capability_mismatch"

    event.capability_id = REMOVE_SILENCES_CAPABILITY
    event.op = ProjectOp(type=REMOVE_SILENCES_CAPABILITY, params={})
    missing, missing_detail = candidate_matches_project_event(
        REMOVE_SILENCES_CAPABILITY, intended, event
    )
    assert missing is False
    assert missing_detail == "kernel_event_segments_missing"


@pytest.mark.asyncio
async def test_gated_act_execute_kernel_events_not_objective(orch, monkeypatch):
    """Intended CandidateAction vs Kernel events; client manifest is not proof."""
    service, kernel, mg_store = orch
    head = await kernel.create_project(
        "u1",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest(10)),
    )
    graph = _graph(
        silence=_ready_silence({"start": 1.0, "end": 2.5, "type": "silence"})
    )
    await _seed_mediagraph(kernel, mg_store, head, graph)
    _patch_resolve(monkeypatch, graph, head=_head(head.project_id))

    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            decision_gate=True,
            intent_text=DEAD_AIR_OBJECTIVE,
            project_id=head.project_id,
        ),
    )
    executed = await service.execute_plan(
        "u1",
        ExecutePlanRequest(
            plan_id=plan.plan_id,
            project_id=head.project_id,
            base_revision=0,
            base_snapshot_hash=head.snapshot_hash,
            proposed_manifest=_manifest(8.5),
        ),
    )
    assert executed.execution_integrity is not None
    assert executed.execution_integrity.status != "objective_verified"
    assert "objective_verified" not in executed.model_dump_json()
    if executed.execution_integrity.status == "execution_ok":
        assert executed.execution_integrity.kernel_events_verified is True
        msg = executed.execution_integrity.message or ""
        assert "not_objective" in msg
        assert "client_proposed_manifest" in msg
        assert executed.steps[0].event_ids
        event = await kernel.get_event_by_command(
            head.project_id, "u1", executed.steps[0].command_id or ""
        )
        assert event is not None
        assert event.capability_id == REMOVE_SILENCES_CAPABILITY


@pytest.mark.asyncio
async def test_gated_execute_project_id_mismatch_refused(orch, monkeypatch):
    service, kernel, mg_store = orch
    head = await kernel.create_project(
        "u1",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest()),
    )
    other = await kernel.create_project(
        "u1",
        CreateStudioProjectRequest(title="Other", proposed_manifest=_manifest()),
    )
    graph = _graph(
        silence=_ready_silence({"start": 1.0, "end": 2.5, "type": "silence"})
    )
    await _seed_mediagraph(kernel, mg_store, head, graph)
    _patch_resolve(monkeypatch, graph, head=_head(head.project_id))

    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            decision_gate=True,
            intent_text=DEAD_AIR_OBJECTIVE,
            project_id=head.project_id,
        ),
    )
    refused = await service.execute_plan(
        "u1",
        ExecutePlanRequest(
            plan_id=plan.plan_id,
            project_id=other.project_id,
            base_revision=0,
            proposed_manifest=_manifest(),
        ),
    )
    assert refused.message == "project_id_mismatch"
    assert refused.execution_integrity is not None
    assert refused.execution_integrity.status == "execution_failed"
    stored = await service.get_plan(plan.plan_id, "u1")
    assert stored is not None
    assert stored.status == "draft"


@pytest.mark.asyncio
async def test_gated_terminal_execute_is_idempotent(orch, monkeypatch):
    service, kernel, mg_store = orch
    head = await kernel.create_project(
        "u1",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest(10)),
    )
    graph = _graph(
        silence=_ready_silence({"start": 1.0, "end": 2.5, "type": "silence"})
    )
    await _seed_mediagraph(kernel, mg_store, head, graph)
    _patch_resolve(monkeypatch, graph, head=_head(head.project_id))

    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            decision_gate=True,
            intent_text=DEAD_AIR_OBJECTIVE,
            project_id=head.project_id,
        ),
    )
    body = ExecutePlanRequest(
        plan_id=plan.plan_id,
        project_id=head.project_id,
        base_revision=0,
        base_snapshot_hash=head.snapshot_hash,
        proposed_manifest=_manifest(10),
    )
    first = await service.execute_plan("u1", body)
    assert first.status in {"completed", "partial", "failed"}
    first_rev = (await kernel.get_head(head.project_id, "u1")).revision
    second = await service.execute_plan("u1", body)
    assert second.status == first.status
    assert second.plan_id == first.plan_id
    second_rev = (await kernel.get_head(head.project_id, "u1")).revision
    assert second_rev == first_rev


@pytest.mark.asyncio
async def test_gated_missing_kernel_event_is_partial_not_ok(orch, monkeypatch):
    service, kernel, mg_store = orch
    head = await kernel.create_project(
        "u1",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest(10)),
    )
    graph = _graph(
        silence=_ready_silence({"start": 1.0, "end": 2.5, "type": "silence"})
    )
    await _seed_mediagraph(kernel, mg_store, head, graph)
    _patch_resolve(monkeypatch, graph, head=_head(head.project_id))

    async def _missing(_project_id, _user_id, _command_id):
        return None

    monkeypatch.setattr(kernel, "get_event_by_command", _missing)

    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            decision_gate=True,
            intent_text=DEAD_AIR_OBJECTIVE,
            project_id=head.project_id,
        ),
    )
    executed = await service.execute_plan(
        "u1",
        ExecutePlanRequest(
            plan_id=plan.plan_id,
            project_id=head.project_id,
            base_revision=0,
            base_snapshot_hash=head.snapshot_hash,
            proposed_manifest=_manifest(10),
        ),
    )
    assert executed.execution_integrity is not None
    assert executed.execution_integrity.status == "execution_partial"
    assert executed.execution_integrity.kernel_events_verified is False
    assert executed.execution_integrity.status != "execution_ok"
