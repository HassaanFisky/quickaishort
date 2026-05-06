"""Pydantic v2 model for the UserStats collection."""

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field


class UserStats(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str
    credits_balance: int = 5000  # Massive limit: e.g., 500 exports/month
    total_projects: int = 0
    total_duration_processed: float = 0.0
    export_count: int = 0
    ai_runs: int = 0
    is_premium: bool = False
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatsIncrement(BaseModel):
    """Inbound payload for the stats increment pubsub channel."""

    user_id: str
    duration_delta: float = 0.0
    export_delta: int = 0
    ai_run_delta: int = 0
    project_delta: int = 0
