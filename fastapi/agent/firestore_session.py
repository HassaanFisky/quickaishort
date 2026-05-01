"""Custom Firestore Session Service for Google ADK Python.
Implements the BaseSessionService interface for persistent session storage.
This implementation is strictly persistent to support horizontal scaling.
Author: Antigravity (Senior Engineer)
"""

from __future__ import annotations
import logging
import uuid
import time
from typing import Any, Optional

from google.adk.sessions.base_session_service import BaseSessionService, ListSessionsResponse, GetSessionConfig
from google.adk.sessions.session import Session

logger = logging.getLogger(__name__)

class FirestoreSessionService(BaseSessionService):
    def __init__(self, collection_name: str = "adk_sessions"):
        self.collection_name = collection_name
        self._use_firestore = False
        
        try:
            from google.cloud import firestore
            
            # Initialize async client
            self.db = firestore.AsyncClient()
            self._use_firestore = True
            logger.info(f"FirestoreSessionService initialized with collection: {collection_name}")
        except Exception as e:
            logger.error(f"CRITICAL: Firestore initialization failed. Horizontal scaling sessions will NOT work. Error: {e}")
            # We do NOT fallback to InMemorySessionService to comply with production safety rules.
            # We instead let it fail hard so the infrastructure issue is visible.
            self._use_firestore = False
            raise RuntimeError(f"Failed to initialize FirestoreSessionService: {e}")

    async def create_session(
        self,
        *,
        app_name: str,
        user_id: str,
        state: Optional[dict[str, Any]] = None,
        session_id: Optional[str] = None,
    ) -> Session:
        if not self._use_firestore:
             raise RuntimeError("FirestoreSessionService is not available.")
            
        session_id = session_id or str(uuid.uuid4())
        now = time.time()
        
        session = Session(
            app_name=app_name,
            user_id=user_id,
            session_id=session_id,
            state=state or {},
            created_at=now,
            updated_at=now,
            events=[]
        )
        
        doc_ref = self.db.collection(self.collection_name).document(session_id)
        await doc_ref.set({
            "app_name": app_name,
            "user_id": user_id,
            "session_id": session_id,
            "state": session.state,
            "created_at": now,
            "updated_at": now
        })
        
        return session

    async def get_session(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
        config: Optional[GetSessionConfig] = None,
    ) -> Optional[Session]:
        if not self._use_firestore:
             raise RuntimeError("FirestoreSessionService is not available.")
            
        doc_ref = self.db.collection(self.collection_name).document(session_id)
        doc = await doc_ref.get()
        
        if not doc.exists:
            return None
            
        data = doc.to_dict()
        if data.get("app_name") != app_name or data.get("user_id") != user_id:
            return None
            
        return Session(
            app_name=app_name,
            user_id=user_id,
            session_id=session_id,
            state=data.get("state", {}),
            created_at=data.get("created_at", 0),
            updated_at=data.get("updated_at", 0),
            events=[]
        )

    async def list_sessions(self, *, app_name: str, user_id: str) -> ListSessionsResponse:
        if not self._use_firestore:
             raise RuntimeError("FirestoreSessionService is not available.")
            
        query = self.db.collection(self.collection_name)\
            .where("app_name", "==", app_name)\
            .where("user_id", "==", user_id)
            
        docs = await query.get()
        sessions = []
        for doc in docs:
            data = doc.to_dict()
            sessions.append(Session(
                app_name=app_name,
                user_id=user_id,
                session_id=doc.id,
                state=data.get("state", {}),
                created_at=data.get("created_at", 0),
                updated_at=data.get("updated_at", 0)
            ))
        return ListSessionsResponse(sessions=sessions)

    async def delete_session(self, *, app_name: str, user_id: str, session_id: str) -> None:
        if not self._use_firestore:
             raise RuntimeError("FirestoreSessionService is not available.")
        await self.db.collection(self.collection_name).document(session_id).delete()
