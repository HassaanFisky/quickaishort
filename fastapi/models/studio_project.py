"""EP-002 Studio Project Kernel models (schema_version 2).

Authoritative composition state: Commands → Events → materialized RenderManifest.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from models.render_manifest import RenderManifest

SCHEMA_VERSION = 2

ProjectStatus = Literal["active", "archived", "deleted"]
ActorKind = Literal["user", "agent", "system"]
CommandKind = Literal["capability", "system"]
CommandSource = Literal["chat", "ui_direct", "orchestrator", "automation"]
RejectReason = Literal[
    "auth", "conflict", "emit_blocked", "validation", "unknown_capability"
]
SystemOpType = Literal[
    "undo",
    "redo",
    "revert_to_revision",
    "import_assets",
    "import_adk_segments",  # alias → import_assets + source=adk_segments
    "set_title",
    "attach_primary_asset",
]


class Collaborator(BaseModel):
    user_id: str
    role: Literal["owner", "editor", "viewer"] = "editor"


class EditLock(BaseModel):
    user_id: str
    expires_at: datetime
    session_id: str


class Actor(BaseModel):
    kind: ActorKind
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    session_id: Optional[str] = None


class InverseSpec(BaseModel):
    strategy: Literal["compensating_capability", "revert_to_revision", "none"]
    capability_id: Optional[str] = None
    params: Optional[dict[str, Any]] = None
    revision: Optional[int] = None


class ProjectOp(BaseModel):
    type: str
    params: dict[str, Any] = Field(default_factory=dict)


class TranscriptChunk(BaseModel):
    text: str
    start: float
    end: float


class ProjectCommand(BaseModel):
    command_id: str
    project_id: str
    base_revision: int
    actor_session_id: str = ""
    kind: CommandKind = "capability"
    capability_id: Optional[str] = None
    params: dict[str, Any] = Field(default_factory=dict)
    plan_id: Optional[str] = None
    intent: Optional[str] = None
    source: CommandSource = "ui_direct"
    # E1 — Strategy A materialization
    proposed_manifest: Optional[RenderManifest] = None
    base_snapshot_hash: Optional[str] = None
    # E3 — optional transcript contribution
    transcript_chunks: Optional[list[TranscriptChunk]] = None
    # System ops
    system_op: Optional[SystemOpType] = None


class ProjectEvent(BaseModel):
    event_id: str
    project_id: str
    revision: int
    parent_revision: int
    ts: datetime
    actor: Actor
    capability_id: Optional[str] = None
    capability_version: Optional[int] = None
    command_id: str
    op: ProjectOp
    affects_manifest: bool
    inverse: Optional[InverseSpec] = None
    prev_snapshot_hash: Optional[str] = None
    next_snapshot_hash: Optional[str] = None


class StudioProjectHead(BaseModel):
    schema_version: int = SCHEMA_VERSION
    project_id: str
    owner_user_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    status: ProjectStatus = "active"
    revision: int = 0
    snapshot_revision: int = 0
    snapshot_manifest: Optional[RenderManifest] = None
    snapshot_hash: Optional[str] = None
    active_run_id: Optional[str] = None
    primary_asset_id: Optional[str] = None
    media_graph_id: Optional[str] = None
    legacy_adk_project_id: Optional[str] = None
    collaborators: list[Collaborator] = Field(default_factory=list)
    edit_lock: Optional[EditLock] = None
    deleted_at: Optional[datetime] = None
    # E5
    undo_stack: list[int] = Field(default_factory=list)
    redo_stack: list[int] = Field(default_factory=list)
    # E4 — idempotency ring
    recent_command_ids: list[str] = Field(default_factory=list)
    # Revision → {manifest, hash} for undo (capped in service)
    revision_snapshots: dict[str, dict[str, Any]] = Field(default_factory=dict)
    # E3
    transcript_chunks: list[TranscriptChunk] = Field(default_factory=list)


class MediaAsset(BaseModel):
    asset_id: str
    owner_user_id: str
    gcs_uri: str
    content_type: str = "video/mp4"
    created_at: datetime
    source: Literal["upload", "youtube", "adk"] = "upload"


class CommandAck(BaseModel):
    status: Literal["accepted"] = "accepted"
    command_id: str
    event_ids: list[str]
    new_revision: int
    snapshot_manifest: Optional[RenderManifest] = None
    snapshot_hash: Optional[str] = None


class CommandReject(BaseModel):
    status: Literal["rejected"] = "rejected"
    reason: RejectReason
    detail: str
    head_revision: Optional[int] = None
    missing_events: list[ProjectEvent] = Field(default_factory=list)


class CreateStudioProjectRequest(BaseModel):
    title: str = "Untitled"
    primary_asset_id: Optional[str] = None
    active_run_id: Optional[str] = None
    legacy_adk_project_id: Optional[str] = None
    proposed_manifest: Optional[RenderManifest] = None


class UndoRedoRequest(BaseModel):
    command_id: str
    base_revision: int
    actor_session_id: str = ""
