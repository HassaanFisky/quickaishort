"""HTTP integration — orchestrator_router + JWT + decision_gate.

Proves the gated Decision → Plan → Execute path over the real router,
not only OrchestratorService unit tests.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

from models.media_graph import FacetBlob, MediaGraph
from models.render_manifest import RenderManifest, RenderTimeline
from models.studio_project import CreateStudioProjectRequest, StudioProjectHead
from services.decision_service import (
    REMOVE_SILENCES_CAPABILITY,
    decide_from_state,
)
from services.orchestrator_service import reset_orchestrator_for_tests
from services.project_kernel import InMemoryProjectStore, reset_project_kernel_for_tests

DEAD_AIR_OBJECTIVE = "Remove unnecessary dead air and tighten the pacing."
_ROUTER_JWT_SECRET = "test-orchestrator-router-secret-32b"


def _graph(*, silence: FacetBlob | None) -> MediaGraph:
    now = datetime.now(timezone.utc)
    facets: dict[str, FacetBlob] = {}
    if silence is not None:
        facets["silence"] = silence
    return MediaGraph(
        graph_id="g-router",
        owner_user_id="u1",
        project_id="p1",
        created_at=now,
        updated_at=now,
        status="partial",
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
        media_graph_id="g-router",
    )


def _manifest(d: float = 10.0) -> RenderManifest:
    return RenderManifest(
        generatedAt=1,
        timeline=RenderTimeline(fps=30, width=1080, height=1920, duration=d),
    )


def _bearer(user_id: str) -> dict[str, str]:
    token = jwt.encode({"sub": user_id}, _ROUTER_JWT_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


class _FakeRedis:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}

    def set(self, key: str, value: str, nx: bool = False, ex: int | None = None):
        if nx and key in self.data:
            return False
        self.data[key] = str(value)
        return True

    def setex(self, key: str, ttl: int, value: str):
        self.data[key] = value
        return True

    def get(self, key: str):
        return self.data.get(key)


@pytest.fixture
def router_client(monkeypatch):
    import services.auth as auth_mod

    monkeypatch.setenv("NEXTAUTH_SECRET", _ROUTER_JWT_SECRET)
    monkeypatch.setattr(auth_mod, "_NEXTAUTH_SECRET", _ROUTER_JWT_SECRET)

    kernel = reset_project_kernel_for_tests(InMemoryProjectStore())
    reset_orchestrator_for_tests(kernel=kernel)

    fake_redis = _FakeRedis()
    monkeypatch.setattr("services.queue_service.redis_conn", fake_redis, raising=False)

    from main import app

    return TestClient(app), kernel


def _patch_resolve(monkeypatch, graph: MediaGraph, head: StudioProjectHead | None = None):
    async def _resolve(user_id, text, project_id=None, **kwargs):
        pid = project_id or (head.project_id if head else "p1")
        return decide_from_state(
            text,
            project_id=pid,
            graph=graph,
            head=head or _head(pid),
        )

    monkeypatch.setattr(
        "services.decision_service.resolve_objective", _resolve, raising=True
    )


def test_orchestrator_plan_requires_jwt(router_client):
    client, _ = router_client
    resp = client.post(
        "/api/studio/v1/orchestrator/plan",
        json={"decision_gate": True, "intent_text": DEAD_AIR_OBJECTIVE},
    )
    assert resp.status_code == 401


def test_orchestrator_gated_act_via_http(router_client, monkeypatch):
    client, _ = router_client
    graph = _graph(
        silence=_ready_silence({"start": 1.0, "end": 2.5, "type": "silence"})
    )
    _patch_resolve(monkeypatch, graph)

    resp = client.post(
        "/api/studio/v1/orchestrator/plan",
        headers=_bearer("u1"),
        json={
            "decision_gate": True,
            "intent_text": DEAD_AIR_OBJECTIVE,
            "project_id": "p1",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["decision_id"]
    assert body["decision_mode"] == "ACT"
    assert len(body["steps"]) == 1
    assert body["steps"][0]["capability_id"] == REMOVE_SILENCES_CAPABILITY
    assert body["execution_integrity"]["status"] == "not_executed"


def test_orchestrator_client_decision_mode_ignored_via_http(
    router_client, monkeypatch
):
    client, _ = router_client
    _patch_resolve(monkeypatch, _graph(silence=None))

    resp = client.post(
        "/api/studio/v1/orchestrator/plan",
        headers=_bearer("u1"),
        json={
            "decision_gate": True,
            "intent_text": DEAD_AIR_OBJECTIVE,
            "project_id": "p1",
            "decision_mode": "ACT",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["decision_mode"] == "ASK"
    assert body["steps"] == []


def test_orchestrator_gated_ask_execute_refused_via_http(router_client, monkeypatch):
    client, kernel = router_client
    head = asyncio.run(
        kernel.create_project(
            "u1",
            CreateStudioProjectRequest(title="T", proposed_manifest=_manifest()),
        )
    )
    _patch_resolve(monkeypatch, _graph(silence=None))

    create = client.post(
        "/api/studio/v1/orchestrator/plan",
        headers=_bearer("u1"),
        json={
            "decision_gate": True,
            "intent_text": DEAD_AIR_OBJECTIVE,
            "project_id": head.project_id,
        },
    )
    assert create.status_code == 200
    plan = create.json()
    assert plan["decision_mode"] == "ASK"
    assert plan["steps"] == []

    execute = client.post(
        "/api/studio/v1/orchestrator/execute",
        headers=_bearer("u1"),
        json={
            "plan_id": plan["plan_id"],
            "project_id": head.project_id,
            "base_revision": 0,
            "proposed_manifest": _manifest().model_dump(mode="json"),
        },
    )
    assert execute.status_code == 200
    executed = execute.json()
    assert executed["decision_mode"] == "ASK"
    assert executed["status"] == "draft"
    assert executed["execution_integrity"]["status"] == "not_executed"


def test_orchestrator_gated_plan_owner_isolation_via_http(router_client, monkeypatch):
    client, _ = router_client
    graph = _graph(
        silence=_ready_silence({"start": 1.0, "end": 2.5, "type": "silence"})
    )
    _patch_resolve(monkeypatch, graph)

    create = client.post(
        "/api/studio/v1/orchestrator/plan",
        headers=_bearer("u1"),
        json={
            "decision_gate": True,
            "intent_text": DEAD_AIR_OBJECTIVE,
            "project_id": "p1",
        },
    )
    plan_id = create.json()["plan_id"]

    get_own = client.get(
        f"/api/studio/v1/orchestrator/plans/{plan_id}",
        headers=_bearer("u1"),
    )
    assert get_own.status_code == 200

    get_other = client.get(
        f"/api/studio/v1/orchestrator/plans/{plan_id}",
        headers=_bearer("other-user"),
    )
    assert get_other.status_code == 404


def test_orchestrator_ungated_structured_via_http(router_client):
    client, _ = router_client
    resp = client.post(
        "/api/studio/v1/orchestrator/plan",
        headers=_bearer("u1"),
        json={
            "source": "suggestion",
            "structured": {
                "capability_id": "TOGGLE_CAPTIONS",
                "params": {"enabled": True},
            },
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["decision_id"] is None
    assert body["decision_mode"] is None
    assert len(body["steps"]) == 1


def test_orchestrator_auth_disabled_still_requires_jwt(router_client, monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "true")
    client, _ = router_client
    resp = client.post(
        "/api/studio/v1/orchestrator/plan",
        json={"decision_gate": True, "intent_text": DEAD_AIR_OBJECTIVE},
    )
    assert resp.status_code == 401
