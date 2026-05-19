"""Project management service backed by Firestore.

Handles persistence for video projects, including scripts, segments,
voiceover settings, and render history.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from services.db import get_db

logger = logging.getLogger(__name__)

COLLECTION = "Projects"


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
    def _col(self):
        return get_db().collection(COLLECTION)

    async def create_project(self, user_id: str, title: str, script: str) -> str:
        project_id = uuid4().hex
        doc = {
            "_id": project_id,
            "user_id": user_id,
            "title": title,
            "script": script,
            "segments": [],
            "status": "draft",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }

        def _do():
            self._col().document(project_id).set(doc)

        await asyncio.to_thread(_do)
        return project_id

    async def get_project(self, project_id: str, user_id: str) -> Optional[Project]:
        def _do():
            snap = self._col().document(project_id).get()
            return snap.to_dict() if snap.exists else None

        doc = await asyncio.to_thread(_do)
        if doc and doc.get("user_id") == user_id:
            return Project(**doc)
        return None

    async def list_projects(self, user_id: str) -> List[Project]:
        def _do():
            snaps = self._col().where("user_id", "==", user_id).stream()
            docs = [s.to_dict() for s in snaps]
            docs.sort(key=lambda d: d.get("updated_at", datetime.min.replace(tzinfo=timezone.utc)), reverse=True)
            return docs[:100]

        docs = await asyncio.to_thread(_do)
        return [Project(**d) for d in docs]

    async def update_project(
        self, project_id: str, user_id: str, updates: dict
    ) -> bool:
        def _do():
            doc_ref = self._col().document(project_id)
            snap = doc_ref.get()
            if not snap.exists or snap.to_dict().get("user_id") != user_id:
                return False
            updates["updated_at"] = datetime.now(timezone.utc)
            doc_ref.update(updates)
            return True

        return await asyncio.to_thread(_do)

    async def delete_project(self, project_id: str, user_id: str) -> bool:
        def _do():
            doc_ref = self._col().document(project_id)
            snap = doc_ref.get()
            if not snap.exists or snap.to_dict().get("user_id") != user_id:
                return False
            doc_ref.delete()
            return True

        return await asyncio.to_thread(_do)


def get_project_service() -> ProjectService:
    return ProjectService()
