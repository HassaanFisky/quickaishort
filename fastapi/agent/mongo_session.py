"""Custom Mongo Session Service for Google ADK Python.
Implements the BaseSessionService interface for persistent session storage.
This uses the existing MongoDB connection to support horizontal scaling
without requiring Google Cloud Application Default Credentials.
"""

from __future__ import annotations
import logging
import uuid
import time
from typing import Any, Optional

from google.adk.sessions.base_session_service import BaseSessionService, ListSessionsResponse, GetSessionConfig
from google.adk.sessions.session import Session
from services.db import get_db

logger = logging.getLogger(__name__)

class MongoSessionService(BaseSessionService):
    def __init__(self, collection_name: str = "adk_sessions"):
        self.collection_name = collection_name
        # Note: We rely on the FastAPI lifespan having called init_db()
        # The motor pool is global and we fetch it on-demand to avoid 
        # initialization order issues.
        logger.info(f"MongoSessionService initialized with collection: {collection_name}")

    def _get_collection(self):
        try:
            return get_db()[self.collection_name]
        except Exception as e:
            raise RuntimeError(f"MongoSessionService failed to get DB connection: {e}")

    async def create_session(
        self,
        *,
        app_name: str,
        user_id: str,
        state: Optional[dict[str, Any]] = None,
        session_id: Optional[str] = None,
    ) -> Session:
        session_id = session_id or str(uuid.uuid4())
        now = time.time()
        
        session = Session(
            id=session_id,
            user_id=user_id,
            app_name=app_name,
            state=state or {},
            create_time=now,
            update_time=now,
        )
        
        # Insert or replace in MongoDB
        doc = session.model_dump()
        # Add index fields for easier querying if needed
        doc["_id"] = session_id
        
        await self._get_collection().update_one(
            {"_id": session_id},
            {"$set": doc},
            upsert=True
        )
        return session

    async def get_session(
        self,
        *,
        session_id: str,
        config: Optional[GetSessionConfig] = None,
    ) -> Session:
        doc = await self._get_collection().find_one({"_id": session_id})
        if not doc:
            raise KeyError(f"Session {session_id} not found in MongoDB.")
        
        # Remove the _id before converting back to Session model
        doc.pop("_id", None)
        return Session(**doc)

    async def update_session(self, *, session: Session) -> Session:
        session.update_time = time.time()
        doc = session.model_dump()
        doc["_id"] = session.id
        
        result = await self._get_collection().update_one(
            {"_id": session.id},
            {"$set": doc}
        )
        if result.matched_count == 0:
             raise KeyError(f"Session {session.id} not found in MongoDB for update.")
        return session

    async def delete_session(self, *, session_id: str) -> None:
        await self._get_collection().delete_one({"_id": session_id})

    async def list_sessions(
        self,
        *,
        user_id: Optional[str] = None,
        app_name: Optional[str] = None,
        page_size: int = 100,
        page_token: Optional[str] = None,
    ) -> ListSessionsResponse:
        query = {}
        if user_id:
            query["user_id"] = user_id
        if app_name:
            query["app_name"] = app_name
            
        cursor = self._get_collection().find(query).sort("update_time", -1).limit(page_size)
        docs = await cursor.to_list(length=page_size)
        
        sessions = []
        for doc in docs:
            doc.pop("_id", None)
            sessions.append(Session(**doc))
            
        # Basic pagination: just return empty token for now as ADK handles it gracefully
        return ListSessionsResponse(sessions=sessions, next_page_token="")
