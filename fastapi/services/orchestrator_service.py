"""EP-004 Orchestrator — Plan creation + Kernel-mediated execute."""

from __future__ import annotations

import asyncio
import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any, Literal, Optional, Protocol, Union
from uuid import uuid4

from pydantic import BaseModel, Field

from models.render_manifest import RenderManifest
from models.studio_decision import (
    DecisionMode,
    ExecutionIntegrity,
    ExecutionIntegrityStatus,
)
from models.studio_project import CommandAck, CommandReject, ProjectCommand
from services.project_kernel import (
    NON_EVENT_CAPABILITIES,
    InMemoryProjectStore,
    ProjectKernel,
    get_project_kernel,
)
from services.tool_registry import get_capability, is_emit_allowed

logger = logging.getLogger(__name__)

PlanStatus = Literal["draft", "executing", "completed", "failed", "partial"]
StepStatus = Literal["pending", "accepted", "rejected", "skipped"]
PlanSource = Literal["suggestion", "chat", "automation"]


class PlanStep(BaseModel):
    step_id: str
    capability_id: str
    params: dict[str, Any] = Field(default_factory=dict)
    status: StepStatus = "pending"
    command_id: Optional[str] = None
    event_ids: list[str] = Field(default_factory=list)
    reject_reason: Optional[str] = None
    reject_detail: Optional[str] = None


class Plan(BaseModel):
    plan_id: str
    owner_user_id: str
    created_at: datetime
    updated_at: datetime
    status: PlanStatus = "draft"
    source: PlanSource = "chat"
    intent_text: Optional[str] = None
    project_id: Optional[str] = None
    steps: list[PlanStep] = Field(default_factory=list)
    message: Optional[str] = None
    decision_id: Optional[str] = None
    decision_mode: Optional[DecisionMode] = None
    execution_integrity: Optional[ExecutionIntegrity] = None


class StructuredIntent(BaseModel):
    capability_id: str
    params: dict[str, Any] = Field(default_factory=dict)
    label: Optional[str] = None
    suggestion_id: Optional[str] = None


class CreatePlanRequest(BaseModel):
    source: PlanSource = "chat"
    intent_text: Optional[str] = None
    structured: Optional[StructuredIntent] = None
    # Pre-computed steps (e.g. client already ran editor command) — skips LLM
    structured_steps: Optional[list[StructuredIntent]] = None
    project_id: Optional[str] = None
    user_tier: str = "free"
    project_context: Optional[dict[str, Any]] = None
    decision_gate: bool = False
    # Client-supplied mode is ignored — server derives from DecisionRecord.
    decision_mode: Optional[DecisionMode] = None


class ExecutePlanRequest(BaseModel):
    plan_id: str
    project_id: str
    base_revision: int
    base_snapshot_hash: Optional[str] = None
    proposed_manifest: RenderManifest
    actor_session_id: str = ""


class PlanStore(Protocol):
    def put(self, plan: Plan) -> None: ...

    def get(self, plan_id: str) -> Optional[Plan]: ...


class InMemoryPlanStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.plans: dict[str, Plan] = {}

    def put(self, plan: Plan) -> None:
        with self._lock:
            self.plans[plan.plan_id] = plan.model_copy(deep=True)

    def get(self, plan_id: str) -> Optional[Plan]:
        with self._lock:
            p = self.plans.get(plan_id)
            return p.model_copy(deep=True) if p else None


# Cross-instance durable plans (Cloud Run). Same sync ABI as InMemory —
# OrchestratorService already offloads put/get via asyncio.to_thread.
_PLAN_REDIS_TTL_SEC = int(os.environ.get("ORCH_PLAN_TTL_SEC", "7200"))
_PLAN_REDIS_KEY_PREFIX = "studio:orch:plan:"


class RedisPlanStore:
    """Redis-backed PlanStore — JSON blob + TTL (FinOps: no always-on DB)."""

    def __init__(
        self,
        redis_client: Any = None,
        *,
        ttl_sec: int = _PLAN_REDIS_TTL_SEC,
        key_prefix: str = _PLAN_REDIS_KEY_PREFIX,
    ) -> None:
        self._ttl = max(60, int(ttl_sec))
        self._prefix = key_prefix
        self._redis = redis_client

    def _client(self) -> Any:
        if self._redis is not None:
            return self._redis
        from services.queue_service import redis_conn

        return redis_conn

    def _key(self, plan_id: str) -> str:
        return f"{self._prefix}{plan_id}"

    def put(self, plan: Plan) -> None:
        payload = plan.model_dump_json()
        self._client().setex(self._key(plan.plan_id), self._ttl, payload)

    def get(self, plan_id: str) -> Optional[Plan]:
        raw = self._client().get(self._key(plan_id))
        if raw is None:
            return None
        if isinstance(raw, (bytes, bytearray)):
            raw = raw.decode("utf-8")
        return Plan.model_validate_json(raw)


def _default_plan_store() -> PlanStore:
    """Production default = Redis; memory fallback only outside production."""
    import os

    is_prod = os.getenv("ENVIRONMENT", "").strip().lower() == "production"
    try:
        from services.queue_service import redis_conn

        if redis_conn is None:
            raise RuntimeError("redis_conn_none")
        redis_conn.ping()
        return RedisPlanStore(redis_client=redis_conn)
    except Exception as exc:  # noqa: BLE001
        if is_prod:
            logger.error(
                "orchestrator_plan_store_unavailable reason=%s — fail-closed",
                exc,
            )
            raise RuntimeError("orchestrator_plan_store_unavailable") from exc
        logger.warning("orchestrator_plan_store_fallback reason=%s", exc)
        return InMemoryPlanStore()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _action_to_capability(action: Any) -> Optional[tuple[str, dict[str, Any]]]:
    if isinstance(action, dict):
        cid = action.get("type") or action.get("capability_id")
        if not cid:
            return None
        params = {k: v for k, v in action.items() if k not in {"type", "capability_id"}}
        return str(cid), params
    cid = getattr(action, "type", None)
    if not cid:
        return None
    if hasattr(action, "model_dump"):
        data = action.model_dump(mode="json")
        params = {k: v for k, v in data.items() if k != "type"}
        return str(cid), params
    return str(cid), {}


def _compute_execution_integrity(plan: Plan) -> ExecutionIntegrity:
    """Tier 0 — compare intended steps vs Kernel outcomes. Never objective_verified."""
    intended = [s.capability_id for s in plan.steps]
    accepted = [s.capability_id for s in plan.steps if s.status == "accepted"]
    rejected = [s.capability_id for s in plan.steps if s.status == "rejected"]
    skipped = [s.capability_id for s in plan.steps if s.status == "skipped"]

    if plan.decision_id is not None and plan.decision_mode != "ACT":
        return ExecutionIntegrity(
            status="not_executed",
            intended_capabilities=intended,
            accepted=accepted,
            rejected=rejected,
            skipped=skipped,
            message=f"decision_mode:{plan.decision_mode}",
        )

    executed = any(s.status != "pending" for s in plan.steps)
    if not executed:
        return ExecutionIntegrity(
            status="not_executed",
            intended_capabilities=intended,
            accepted=accepted,
            rejected=rejected,
            skipped=skipped,
            message="plan_not_executed",
        )

    if rejected and accepted:
        status: ExecutionIntegrityStatus = "execution_partial"
    elif rejected and not accepted:
        status = "execution_failed"
    elif plan.status == "failed":
        status = "execution_failed"
    elif plan.status == "partial":
        status = "execution_partial"
    elif plan.status == "completed" and accepted:
        status = "execution_ok"
    elif skipped and not accepted and not rejected:
        status = "execution_failed"
    else:
        status = "execution_partial"

    # Gated ACT: mutating Kernel acceptance must bind ProjectEvents (event_ids).
    if plan.decision_id is not None and status == "execution_ok":
        for step in plan.steps:
            if step.status != "accepted":
                continue
            cap = get_capability(step.capability_id)
            if cap and "mutate_project" in (cap.get("side_effects") or []):
                if not step.event_ids:
                    status = "execution_partial"
                    break

    return ExecutionIntegrity(
        status=status,
        intended_capabilities=intended,
        accepted=accepted,
        rejected=rejected,
        skipped=skipped,
    )


class OrchestratorService:
    def __init__(
        self,
        store: Optional[PlanStore] = None,
        kernel: Optional[ProjectKernel] = None,
    ) -> None:
        self.store: PlanStore = store or _default_plan_store()
        self.kernel = kernel

    def _kernel(self) -> ProjectKernel:
        return self.kernel or get_project_kernel()

    async def _verify_gated_act_evidence(
        self, user_id: str, plan: Plan, project_id: str
    ) -> Optional[str]:
        """Re-check REMOVE_SILENCES segments against MediaGraph before Kernel execute."""
        from services.decision_service import (
            REMOVE_SILENCES_CAPABILITY,
            load_project_graph_for_decision,
            verify_remove_silences_params_against_graph,
        )

        remove_steps = [
            s for s in plan.steps if s.capability_id == REMOVE_SILENCES_CAPABILITY
        ]
        if not remove_steps:
            return None

        _, graph = await load_project_graph_for_decision(user_id, project_id)
        for step in remove_steps:
            ok, detail = verify_remove_silences_params_against_graph(
                dict(step.params), graph
            )
            if not ok:
                return f"evidence_verify_failed:{detail}"
        return None

    async def _verify_gated_kernel_events(
        self, user_id: str, plan: Plan
    ) -> ExecutionIntegrity:
        """After gated ACT execute: intended steps vs Kernel events. Never objective_verified.

        Does not treat CommandAck, HTTP 200, or client proposed_manifest as
        proof the creative objective succeeded. Missing events ≠ matched.
        """
        from services.decision_service import candidate_matches_project_event

        integrity = _compute_execution_integrity(plan)
        if plan.decision_mode != "ACT" or integrity.status == "not_executed":
            return integrity

        project_id = plan.project_id
        if not project_id:
            integrity.status = (
                "execution_partial"
                if integrity.status == "execution_ok"
                else integrity.status
            )
            integrity.kernel_events_verified = False
            integrity.message = "kernel_project_id_missing"
            return integrity

        kernel = self._kernel()
        notes: list[str] = []
        matched = True
        accepted_mutating = False
        for step in plan.steps:
            if step.status != "accepted":
                continue
            cap = get_capability(step.capability_id)
            mutates = bool(cap and "mutate_project" in (cap.get("side_effects") or []))
            if mutates:
                accepted_mutating = True
            if not step.command_id:
                matched = False
                notes.append("command_id_missing")
                continue
            event = await kernel.get_event_by_command(
                project_id, user_id, step.command_id
            )
            ok, detail = candidate_matches_project_event(
                step.capability_id, dict(step.params), event
            )
            if not ok:
                matched = False
                notes.append(detail)

        integrity.kernel_events_verified = matched if accepted_mutating else None
        if accepted_mutating and not matched:
            if integrity.status == "execution_ok":
                integrity.status = "execution_partial"
            integrity.message = "kernel_event_mismatch:" + ",".join(
                notes or ["unknown"]
            )
        elif integrity.status == "execution_ok":
            # Strategy A snapshot is client-proposed — not media proof.
            integrity.message = (
                "execution_ok_not_objective;snapshot=client_proposed_manifest"
            )
        return integrity

    async def _create_decision_gated_plan(
        self, user_id: str, body: CreatePlanRequest, plan: Plan
    ) -> Plan:
        """Decision Intelligence gate — server mode only; 0 steps unless ACT."""
        from services.decision_service import resolve_objective

        text = (body.intent_text or "").strip()
        if not text:
            plan.status = "failed"
            plan.message = "intent_required_for_decision_gate"
            plan.execution_integrity = ExecutionIntegrity(
                status="not_executed",
                message="empty_intent",
            )
            await asyncio.to_thread(self.store.put, plan)
            return plan

        record = await resolve_objective(
            user_id, text, body.project_id, project_context=body.project_context
        )
        record.plan_id = plan.plan_id

        plan.decision_id = record.decision_id
        plan.decision_mode = record.mode
        plan.message = record.rationale
        plan.execution_integrity = ExecutionIntegrity(
            status="not_executed",
            intended_capabilities=[a.capability_id for a in record.candidate_actions],
            message=f"decision_mode:{record.mode}",
        )

        if record.mode != "ACT":
            plan.steps = []
            plan.status = "draft"
            await asyncio.to_thread(self.store.put, plan)
            return plan

        steps: list[PlanStep] = []
        for action in record.candidate_actions:
            cid = action.capability_id
            cap = get_capability(cid)
            if cap is None:
                plan.status = "failed"
                plan.message = f"unknown_capability:{cid}"
                plan.steps = []
                await asyncio.to_thread(self.store.put, plan)
                return plan
            if not is_emit_allowed(cid):
                continue
            steps.append(
                PlanStep(
                    step_id=uuid4().hex,
                    capability_id=cid,
                    params=dict(action.params),
                )
            )

        plan.steps = steps
        if not steps:
            plan.status = "failed"
            plan.message = "no_emit_allowed_steps"
        else:
            plan.status = "draft"
            plan.execution_integrity = ExecutionIntegrity(
                status="not_executed",
                intended_capabilities=[s.capability_id for s in steps],
                message="awaiting_execute",
            )
        await asyncio.to_thread(self.store.put, plan)
        return plan

    async def create_plan(self, user_id: str, body: CreatePlanRequest) -> Plan:
        now = _now()
        plan = Plan(
            plan_id=uuid4().hex,
            owner_user_id=user_id,
            created_at=now,
            updated_at=now,
            status="draft",
            source=body.source,
            intent_text=body.intent_text,
            project_id=body.project_id,
            steps=[],
        )

        if body.decision_gate:
            return await self._create_decision_gated_plan(user_id, body, plan)

        intents: list[StructuredIntent] = []
        if body.structured_steps:
            intents.extend(body.structured_steps)
        elif body.structured is not None:
            intents.append(body.structured)

        if intents:
            steps: list[PlanStep] = []
            for intent in intents:
                cid = intent.capability_id
                cap = get_capability(cid)
                if cap is None:
                    plan.status = "failed"
                    plan.message = f"unknown_capability:{cid}"
                    await asyncio.to_thread(self.store.put, plan)
                    return plan
                if body.source in {"chat", "automation"} and not is_emit_allowed(cid):
                    continue  # skip emit-blocked; keep others
                steps.append(
                    PlanStep(
                        step_id=uuid4().hex,
                        capability_id=cid,
                        params=dict(intent.params),
                    )
                )
            plan.steps = steps
            plan.message = (
                intents[0].label
                if intents and intents[0].label
                else (body.intent_text or f"{len(steps)} steps")
            )
            if not steps:
                plan.status = "failed"
                plan.message = "no_emit_allowed_steps"
            await asyncio.to_thread(self.store.put, plan)
            return plan

        # Free-text LLM planning is DualModelRouter-only (/api/ai-editor/*) with
        # credit gates. Orchestrator accepts structured intents/steps only —
        # never an unguarded legacy ai_editor_engine call.
        text = (body.intent_text or "").strip()
        plan.status = "failed"
        plan.message = "structured_steps_required" if text else "intent_required"
        plan.steps = []
        await asyncio.to_thread(self.store.put, plan)
        return plan

    async def get_plan(self, plan_id: str, user_id: str) -> Optional[Plan]:
        plan = await asyncio.to_thread(self.store.get, plan_id)
        if plan is None or plan.owner_user_id != user_id:
            return None
        return plan

    async def execute_plan(self, user_id: str, body: ExecutePlanRequest) -> Plan:
        plan = await self.get_plan(body.plan_id, user_id)
        if plan is None:
            raise KeyError("plan_not_found")

        if plan.decision_id is not None and plan.decision_mode != "ACT":
            plan.execution_integrity = _compute_execution_integrity(plan)
            plan.message = (
                plan.message or f"decision_not_executable:{plan.decision_mode}"
            )
            plan.updated_at = _now()
            await asyncio.to_thread(self.store.put, plan)
            return plan

        if plan.status in {"completed", "failed", "partial"}:
            if plan.decision_id is not None and plan.execution_integrity is None:
                plan.execution_integrity = _compute_execution_integrity(plan)
            plan.updated_at = _now()
            await asyncio.to_thread(self.store.put, plan)
            return plan

        if plan.decision_id is not None:
            if plan.project_id and body.project_id != plan.project_id:
                refused = plan.model_copy(deep=True)
                refused.execution_integrity = ExecutionIntegrity(
                    status="execution_failed",
                    intended_capabilities=[s.capability_id for s in plan.steps],
                    message="project_id_mismatch",
                    kernel_events_verified=False,
                )
                refused.message = "project_id_mismatch"
                return refused

        if not plan.steps:
            plan.status = "failed"
            plan.message = "empty_plan"
            plan.updated_at = _now()
            await asyncio.to_thread(self.store.put, plan)
            return plan

        # Idempotent execute lock — concurrent POSTs must not double-apply mutations.
        # Production fails closed if Redis cannot grant the lock (PlanStore also needs Redis).
        # Non-prod fails open so local/tests with InMemoryPlanStore still execute.
        lock_key = f"orch:exec:{plan.plan_id}"
        try:
            import os

            from services.queue_service import redis_conn

            acquired = bool(redis_conn.set(lock_key, "1", nx=True, ex=180))
            if not acquired:
                fresh = await self.get_plan(body.plan_id, user_id)
                if fresh is not None:
                    return fresh
                raise KeyError("plan_execute_in_progress")
        except KeyError:
            raise
        except Exception as exc:
            is_prod = os.getenv("ENVIRONMENT", "").strip().lower() == "production"
            if is_prod:
                logger.error(
                    "orchestrator_execute_lock_unavailable plan_id=%s err=%s — fail-closed",
                    plan.plan_id,
                    exc,
                )
                raise RuntimeError("orchestrator_execute_lock_unavailable") from exc
            logger.warning(
                "orchestrator_execute_lock_unavailable plan_id=%s err=%s — proceeding",
                plan.plan_id,
                exc,
            )

        plan.status = "executing"
        if not plan.project_id:
            plan.project_id = body.project_id
        plan.updated_at = _now()
        await asyncio.to_thread(self.store.put, plan)

        if plan.decision_id is not None and plan.decision_mode == "ACT":
            evidence_err = await self._verify_gated_act_evidence(
                user_id, plan, plan.project_id or body.project_id
            )
            if evidence_err:
                for step in plan.steps:
                    if step.status == "pending":
                        step.status = "rejected"
                        step.reject_reason = "validation"
                        step.reject_detail = evidence_err
                plan.status = "failed"
                plan.message = evidence_err
                plan.execution_integrity = _compute_execution_integrity(plan)
                plan.updated_at = _now()
                await asyncio.to_thread(self.store.put, plan)
                return plan

        kernel = self._kernel()
        accepted = 0
        rejected = 0
        revision = body.base_revision
        snap_hash = body.base_snapshot_hash
        # Strategy A: same proposed_manifest applied once at end for mutating batch,
        # or per-step. v1: each step that mutates uses the same proposed_manifest
        # (client compiled final state) — only the last mutating step commits manifest.
        mutating_indices = [
            i
            for i, s in enumerate(plan.steps)
            if get_capability(s.capability_id)
            and "mutate_project"
            in (get_capability(s.capability_id) or {}).get("side_effects", [])
        ]
        last_mutating = mutating_indices[-1] if mutating_indices else None

        for i, step in enumerate(plan.steps):
            # Transport / chrome — never ProjectEvents (EP-002 E2)
            if step.capability_id in NON_EVENT_CAPABILITIES:
                step.status = "skipped"
                step.reject_detail = "non_event_capability_client_local"
                continue
            cap = get_capability(step.capability_id)
            if cap is None:
                step.status = "rejected"
                step.reject_reason = "unknown_capability"
                rejected += 1
                continue
            affects = "mutate_project" in (cap.get("side_effects") or [])
            command_id = uuid4().hex
            # Non-mutating emit-allowed caps may commit without proposed_manifest.
            # Mutating caps: only the last one in the batch carries Strategy A snapshot.
            proposed = (
                body.proposed_manifest
                if affects and last_mutating is not None and i == last_mutating
                else None
            )
            if affects and last_mutating is not None and i != last_mutating:
                step.status = "skipped"
                step.reject_detail = "batched_into_final_manifest_step"
                continue
            if affects and proposed is None:
                step.status = "rejected"
                step.reject_reason = "validation"
                step.reject_detail = "proposed_manifest_required"
                rejected += 1
                continue

            cmd = ProjectCommand(
                command_id=command_id,
                project_id=body.project_id,
                base_revision=revision,
                actor_session_id=body.actor_session_id,
                kind="capability",
                capability_id=step.capability_id,
                params=dict(step.params),
                source="orchestrator",
                proposed_manifest=proposed,
                base_snapshot_hash=snap_hash,
                plan_id=plan.plan_id,
                intent=plan.intent_text,
            )
            result: Union[CommandAck, CommandReject] = await kernel.accept_command(
                user_id, cmd
            )
            step.command_id = command_id
            if isinstance(result, CommandAck):
                step.status = "accepted"
                step.event_ids = list(result.event_ids)
                revision = result.new_revision
                snap_hash = result.snapshot_hash
                accepted += 1
            else:
                step.status = "rejected"
                step.reject_reason = result.reason
                step.reject_detail = result.detail
                rejected += 1
                break

        if rejected and accepted:
            plan.status = "partial"
        elif rejected:
            plan.status = "failed"
        else:
            plan.status = "completed"
        plan.updated_at = _now()
        if plan.decision_id is not None:
            plan.execution_integrity = await self._verify_gated_kernel_events(
                user_id, plan
            )
        await asyncio.to_thread(self.store.put, plan)
        logger.info(
            "orchestrator_execute plan_id=%s status=%s accepted=%s rejected=%s",
            plan.plan_id,
            plan.status,
            accepted,
            rejected,
        )
        return plan


_orch: Optional[OrchestratorService] = None


def get_orchestrator() -> OrchestratorService:
    global _orch
    if _orch is None:
        _orch = OrchestratorService()
    return _orch


def reset_orchestrator_for_tests(
    store: Optional[PlanStore] = None,
    kernel: Optional[ProjectKernel] = None,
) -> OrchestratorService:
    global _orch
    from services.project_kernel import reset_project_kernel_for_tests

    k = kernel or reset_project_kernel_for_tests(InMemoryProjectStore())
    # Tests always get InMemory unless an explicit store is injected.
    _orch = OrchestratorService(store=store or InMemoryPlanStore(), kernel=k)
    return _orch
