"""M0 Decision Intelligence contracts.

Maps Objective / Evidence / DecisionRecord onto existing Studio Kernel
roles (MediaGraph observations, Registry capabilities, Kernel project id).
Does not replace Project Document, Registry, or Orchestrator models.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

SCHEMA_VERSION = 1

EvidenceKind = Literal[
    "VERIFIED_FACT",
    "PROJECT_OBSERVATION",
    "MODEL_INFERENCE",
    "PREDICTION",
    "ASSUMPTION",
    "UNCERTAINTY",
]

DecisionMode = Literal[
    "ACT",
    "ASK",
    "RESEARCH",
    "SIMULATE",
    "DEFER",
    "NOTHING",
]

DecisionStatus = Literal["decided"]
ActorKind = Literal["system", "user"]
ObjectiveClass = Literal["empty", "dead_air_pacing", "unrelated"]

ExecutionIntegrityStatus = Literal[
    "not_executed",
    "execution_ok",
    "execution_partial",
    "execution_failed",
]


class Objective(BaseModel):
    objective_id: str
    text: str
    project_id: Optional[str] = None
    created_at: datetime
    medium_hints: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    success_criteria: list[str] = Field(default_factory=list)
    objective_class: ObjectiveClass = "unrelated"


class EvidenceItem(BaseModel):
    evidence_id: str
    kind: EvidenceKind
    source: str
    reference: str
    summary: str
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class CandidateAction(BaseModel):
    capability_id: str
    params: dict[str, Any] = Field(default_factory=dict)
    label: Optional[str] = None


class ExecutionIntegrity(BaseModel):
    """Tier 0 execution/result integrity — never objective_verified.

    kernel_events_verified is None when events were not read back (ungated
    or not-yet-executed). False means missing/mismatch — missing ≠ zero.
    Client proposed_manifest is never treated as proof dead-air is gone.
    """

    status: ExecutionIntegrityStatus
    intended_capabilities: list[str] = Field(default_factory=list)
    accepted: list[str] = Field(default_factory=list)
    rejected: list[str] = Field(default_factory=list)
    skipped: list[str] = Field(default_factory=list)
    message: Optional[str] = None
    kernel_events_verified: Optional[bool] = None


class DecisionRecord(BaseModel):
    schema_version: int = SCHEMA_VERSION
    decision_id: str
    project_id: Optional[str] = None
    objective: Objective
    mode: DecisionMode
    evidence: list[EvidenceItem] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    rationale: str
    specialist_outputs: list[dict[str, Any]] = Field(default_factory=list)
    candidate_actions: list[CandidateAction] = Field(default_factory=list)
    verification_plan: Optional[str] = None
    prediction: Optional[str] = None
    status: DecisionStatus = "decided"
    plan_id: Optional[str] = None
    actor: ActorKind = "system"
    created_at: datetime
    gemini_called: bool = False
    credits_charged: int = 0
