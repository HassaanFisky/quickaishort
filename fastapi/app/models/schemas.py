from typing import List, Optional, Literal
from pydantic import BaseModel, Field

# ---- Agent Schemas ----

class Scene(BaseModel):
    id: str
    start_sec: float
    end_sec: float
    narration: str
    visual_description: str
    asset_type_needed: str
    caption_text: str
    transition_type: str
    confidence: float

class Storyboard(BaseModel):
    video_type: str
    target_duration_sec: float
    scenes: List[Scene]

class PersonaResult(BaseModel):
    persona_name: str
    hook_score: int = Field(..., ge=0, le=100)
    clarity_score: int = Field(..., ge=0, le=100)
    retention_score: int = Field(..., ge=0, le=100)
    visual_match_score: int = Field(..., ge=0, le=100)
    emotion_score: int = Field(..., ge=0, le=100)
    novelty_score: int = Field(..., ge=0, le=100)
    confidence: float = Field(..., ge=0.0, le=1.0)
    predicted_drop_second: float
    edit_notes: List[str]
    recommended_changes: List[str]

class PreflightDecision(BaseModel):
    viral_score: float
    decision: Literal["RENDER", "REVISE", "REJECT"]
    persona_results: List[PersonaResult]
    refinement_notes: List[str]

# ---- Job Schemas ----

class CreateJobRequest(BaseModel):
    input_type: Literal["script", "youtube", "talking_head"]
    input_text: Optional[str] = None
    input_url: Optional[str] = None
    # For talking_head, it might upload directly or pass a GCS ref
    input_gcs_ref: Optional[str] = None
    requested_duration_sec: float = 60.0

class JobStatusResponse(BaseModel):
    job_id: str
    status: Literal["QUEUED", "RUNNING", "FAILED", "COMPLETED", "REJECTED", "PREFLIGHT", "DECISION"]
    current_stage: str
    viral_score: Optional[float] = None
    decision: Optional[str] = None
    error_message: Optional[str] = None
    download_url: Optional[str] = None
    retry_count: int = 0
    lock_id: Optional[str] = None

class RerunRequest(BaseModel):
    action: Literal["retry", "force_render", "abort"]
