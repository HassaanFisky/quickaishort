"""EP-003 MediaGraph + SuggestionIntent models."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

SCHEMA_VERSION = 1

GraphStatus = Literal["pending", "partial", "ready", "failed"]
FacetStatus = Literal["missing", "pending", "ready", "error"]
Provenance = Literal["edge", "server", "agent"]
IntentKind = Literal["capability", "analyze_deeper", "informational"]


class FacetBlob(BaseModel):
    status: FacetStatus = "missing"
    version: int = 1
    updated_at: Optional[datetime] = None
    provenance: Provenance = "edge"
    data: dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None


class MediaGraph(BaseModel):
    schema_version: int = SCHEMA_VERSION
    graph_id: str
    owner_user_id: str
    asset_id: Optional[str] = None
    project_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    status: GraphStatus = "pending"
    facets: dict[str, FacetBlob] = Field(default_factory=dict)
    revision: int = 0


class SuggestionEvidence(BaseModel):
    facet_keys: list[str] = Field(default_factory=list)
    summary: str


class SuggestionIntent(BaseModel):
    suggestion_id: str
    label: str
    capability_id: Optional[str] = None
    intent_kind: IntentKind = "capability"
    params: dict[str, Any] = Field(default_factory=dict)
    evidence: SuggestionEvidence
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    interactive: bool = True


class CreateMediaGraphRequest(BaseModel):
    asset_id: Optional[str] = None
    project_id: Optional[str] = None


class UpsertFacetsRequest(BaseModel):
    provenance: Provenance = "edge"
    facets: dict[str, dict[str, Any]]
    """Map facet_key → data payload. Server sets status=ready unless data has status."""
