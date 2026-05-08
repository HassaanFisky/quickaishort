"""Project management service.

Handles persistence for video projects, including scripts, segments,
voiceover settings, and render history.
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional, Any
from uuid import uuid4

from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase
from services.db import get_db

logger = logging.getLogger(__name__)

class ProjectSegment(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    clip_path: str
    start_sec: float
    end_sec: float
    text: str

class Project(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    title: str
    script: str
    segments: List[ProjectSegment] = Field(default_factory=list)
    voice_id: str = "en-US-Neural2-D"
    aspect_ratio: str = "9:16"
    quality: str = "medium"
    status: str = "draft"
    job_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProjectService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db["Projects"]

    async def create_project(self, user_id: str, title: str, script: str) -> str:
        project_id = uuid4().hex
        project = {
            "_id": project_id,
            "user_id": user_id,
            "title": title,
            "script": script,
            "segments": [],
            "status": "draft",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        await self.collection.insert_one(project)
        return project_id

    async def get_project(self, project_id: str, user_id: str) -> Optional[Project]:
        doc = await self.collection.find_one({"_id": project_id, "user_id": user_id})
        if doc:
            return Project(**doc)
        return None

    async def list_projects(self, user_id: str) -> List[Project]:
        cursor = self.collection.find({"user_id": user_id}).sort("updated_at", -1)
        docs = await cursor.to_list(length=100)
        return [Project(**doc) for doc in docs]

    async def update_project(self, project_id: str, user_id: str, updates: dict) -> bool:
        updates["updated_at"] = datetime.now(timezone.utc)
        result = await self.collection.update_one(
            {"_id": project_id, "user_id": user_id},
            {"$set": updates}
        )
        return result.modified_count > 0

    async def delete_project(self, project_id: str, user_id: str) -> bool:
        result = await self.collection.delete_one({"_id": project_id, "user_id": user_id})
        return result.deleted_count > 0

# Instance provider
def get_project_service() -> ProjectService:
    return ProjectService(get_db())
