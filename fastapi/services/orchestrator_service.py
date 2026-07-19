"""EP-004 Orchestrator — Plan creation + Kernel-mediated execute."""

from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime, timezone
from typing import Any, Literal, Optional, Protocol, Union
from uuid import uuid4

from pydantic import BaseModel, Field

from models.render_manifest import RenderManifest
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


class OrchestratorService:
    def __init__(
        self,
        store: Optional[PlanStore] = None,
        kernel: Optional[ProjectKernel] = None,
    ) -> None:
        self.store: PlanStore = store or InMemoryPlanStore()
        self.kernel = kernel

    def _kernel(self) -> ProjectKernel:
        return self.kernel or get_project_kernel()

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

        text = (body.intent_text or "").strip()
        if not text:
            plan.status = "failed"
            plan.message = "intent_required"
            await asyncio.to_thread(self.store.put, plan)
            return plan

        from services.ai_editor_engine import process_editor_command

        result = await process_editor_command(
            command=text,
            user_tier=body.user_tier,
            project_context=body.project_context,
        )
        actions = result.get("actions") or []
        steps: list[PlanStep] = []
        for a in actions:
            mapped = _action_to_capability(a)
            if not mapped:
                continue
            cid, params = mapped
            if get_capability(cid) is None:
                continue
            if not is_emit_allowed(cid):
                continue
            steps.append(
                PlanStep(step_id=uuid4().hex, capability_id=cid, params=params)
            )
        plan.steps = steps
        plan.message = result.get("message") or None
        if not steps:
            plan.status = "failed"
            plan.message = plan.message or "no_emit_allowed_steps"
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
        if not plan.steps:
            plan.status = "failed"
            plan.message = "empty_plan"
            plan.updated_at = _now()
            await asyncio.to_thread(self.store.put, plan)
            return plan

        plan.status = "executing"
        plan.project_id = body.project_id
        plan.updated_at = _now()
        await asyncio.to_thread(self.store.put, plan)

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
    _orch = OrchestratorService(store=store or InMemoryPlanStore(), kernel=k)
    return _orch
