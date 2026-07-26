"""EP-004 Orchestrator tests."""

from __future__ import annotations

import pytest

from models.render_manifest import RenderManifest, RenderTimeline
from models.studio_project import CreateStudioProjectRequest
from services.orchestrator_service import (
    CreatePlanRequest,
    ExecutePlanRequest,
    StructuredIntent,
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
    return reset_orchestrator_for_tests(kernel=kernel), kernel


@pytest.mark.asyncio
async def test_structured_plan_no_llm(orch):
    service, _ = orch
    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            source="suggestion",
            structured=StructuredIntent(
                capability_id="TOGGLE_CAPTIONS",
                params={"enabled": True},
                label="Add captions from transcript",
            ),
        ),
    )
    assert plan.status == "draft"
    assert len(plan.steps) == 1
    assert plan.steps[0].capability_id == "TOGGLE_CAPTIONS"


@pytest.mark.asyncio
async def test_emit_blocked_for_chat_structured(orch):
    service, _ = orch
    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            source="chat",
            structured=StructuredIntent(capability_id="EXPLAIN_LAST_EDIT", params={}),
        ),
    )
    assert plan.status == "failed"
    assert plan.message in {"emit_blocked:EXPLAIN_LAST_EDIT", "no_emit_allowed_steps"}
    assert len(plan.steps) == 0


@pytest.mark.asyncio
async def test_execute_commits_kernel(orch):
    service, kernel = orch
    head = await kernel.create_project(
        "u1",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest(10)),
    )
    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            source="suggestion",
            project_id=head.project_id,
            structured=StructuredIntent(
                capability_id="TOGGLE_CAPTIONS",
                params={"enabled": True},
            ),
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
    assert executed.status == "completed"
    assert executed.steps[0].status == "accepted"
    assert executed.steps[0].event_ids
    head2 = await kernel.get_head(head.project_id, "u1")
    assert head2 is not None
    assert head2.revision == 1


@pytest.mark.asyncio
async def test_structured_steps_batch_no_llm(orch):
    service, _ = orch
    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            source="chat",
            intent_text="batch",
            structured_steps=[
                StructuredIntent(
                    capability_id="TOGGLE_CAPTIONS", params={"enabled": True}
                ),
                StructuredIntent(
                    capability_id="SET_AUDIO_BOOST", params={"value": 150}
                ),
            ],
        ),
    )
    assert plan.status == "draft"
    assert len(plan.steps) == 2


@pytest.mark.asyncio
async def test_seek_skipped_as_non_event(orch):
    service, kernel = orch
    head = await kernel.create_project(
        "u1",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest()),
    )
    plan = await service.create_plan(
        "u1",
        CreatePlanRequest(
            source="suggestion",
            structured=StructuredIntent(
                capability_id="SEEK",
                params={"time": 12.0},
            ),
        ),
    )
    executed = await service.execute_plan(
        "u1",
        ExecutePlanRequest(
            plan_id=plan.plan_id,
            project_id=head.project_id,
            base_revision=0,
            proposed_manifest=_manifest(),
        ),
    )
    assert executed.steps[0].status == "skipped"
    assert executed.status == "completed"


class _FakeRedisPlan:
    """Minimal sync Redis stand-in for RedisPlanStore unit tests."""

    def __init__(self) -> None:
        self.data: dict[str, str] = {}
        self.ttls: dict[str, int] = {}

    def setex(self, key: str, ttl: int, value: str) -> bool:
        self.data[key] = value
        self.ttls[key] = int(ttl)
        return True

    def get(self, key: str):
        return self.data.get(key)


@pytest.mark.asyncio
async def test_redis_plan_store_roundtrip_and_owner_isolation(orch):
    from services.orchestrator_service import RedisPlanStore, reset_orchestrator_for_tests
    from services.project_kernel import InMemoryProjectStore, reset_project_kernel_for_tests

    fake = _FakeRedisPlan()
    kernel = reset_project_kernel_for_tests(InMemoryProjectStore())
    service = reset_orchestrator_for_tests(
        store=RedisPlanStore(redis_client=fake, ttl_sec=120),
        kernel=kernel,
    )
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
    assert plan.plan_id in "".join(fake.data.keys()) or any(
        plan.plan_id in k for k in fake.data
    )
    assert all(ttl == 120 for ttl in fake.ttls.values())

    loaded = await service.get_plan(plan.plan_id, "u1")
    assert loaded is not None
    assert loaded.plan_id == plan.plan_id
    assert loaded.steps[0].capability_id == "TOGGLE_CAPTIONS"

    assert await service.get_plan(plan.plan_id, "other-user") is None


@pytest.mark.asyncio
async def test_redis_plan_execute_survives_fresh_service():
    """Simulate multi-instance: create on store A, execute via new service same Redis."""
    from services.orchestrator_service import (
        RedisPlanStore,
        OrchestratorService,
        reset_orchestrator_for_tests,
    )
    from services.project_kernel import InMemoryProjectStore, reset_project_kernel_for_tests

    fake = _FakeRedisPlan()
    store = RedisPlanStore(redis_client=fake, ttl_sec=600)
    kernel = reset_project_kernel_for_tests(InMemoryProjectStore())
    creator = reset_orchestrator_for_tests(store=store, kernel=kernel)

    head = await kernel.create_project(
        "u1",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest(10)),
    )
    plan = await creator.create_plan(
        "u1",
        CreatePlanRequest(
            source="suggestion",
            project_id=head.project_id,
            structured=StructuredIntent(
                capability_id="TOGGLE_CAPTIONS",
                params={"enabled": True},
            ),
        ),
    )

    # New OrchestratorService instance, same Redis — Cloud Run multi-instance shape
    executor = OrchestratorService(store=store, kernel=kernel)
    executed = await executor.execute_plan(
        "u1",
        ExecutePlanRequest(
            plan_id=plan.plan_id,
            project_id=head.project_id,
            base_revision=0,
            base_snapshot_hash=head.snapshot_hash,
            proposed_manifest=_manifest(10),
        ),
    )
    assert executed.status == "completed"
    assert executed.steps[0].status == "accepted"
