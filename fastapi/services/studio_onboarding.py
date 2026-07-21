"""EP-008 — Editor onboarding persistence (Firestore + in-memory for tests)."""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Any, Literal, Optional, Protocol

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

COLLECTION = "studio_user_prefs"
OnboardingStatus = Literal["not_started", "in_progress", "completed", "skipped"]


class EditorOnboardingV1(BaseModel):
    status: OnboardingStatus = "not_started"
    step_index: int = 0
    version: int = 1
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class OnboardingStore(Protocol):
    def get_editor_v1(self, user_id: str) -> EditorOnboardingV1: ...

    def put_editor_v1(self, user_id: str, state: EditorOnboardingV1) -> None: ...


class InMemoryOnboardingStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._data: dict[str, EditorOnboardingV1] = {}

    def get_editor_v1(self, user_id: str) -> EditorOnboardingV1:
        with self._lock:
            return self._data.get(user_id, EditorOnboardingV1()).model_copy()

    def put_editor_v1(self, user_id: str, state: EditorOnboardingV1) -> None:
        with self._lock:
            self._data[user_id] = state.model_copy()


class FirestoreOnboardingStore:
    def _doc(self, user_id: str):
        from services.db import get_db

        return get_db().collection(COLLECTION).document(user_id)

    def get_editor_v1(self, user_id: str) -> EditorOnboardingV1:
        snap = self._doc(user_id).get()
        if not snap.exists:
            return EditorOnboardingV1()
        data = snap.to_dict() or {}
        raw = data.get("editor_v1") or {}
        try:
            return EditorOnboardingV1.model_validate(raw)
        except Exception:
            return EditorOnboardingV1()

    def put_editor_v1(self, user_id: str, state: EditorOnboardingV1) -> None:
        self._doc(user_id).set(
            {
                "editor_v1": state.model_dump(mode="json"),
                "updated_at": state.updated_at,
            },
            merge=True,
        )


_store: Optional[OnboardingStore] = None
_lock = threading.Lock()


def get_onboarding_store() -> OnboardingStore:
    global _store
    with _lock:
        if _store is not None:
            return _store
        try:
            from services.db import is_ready

            if is_ready():
                _store = FirestoreOnboardingStore()
            else:
                _store = InMemoryOnboardingStore()
        except Exception:
            logger.warning("onboarding: falling back to in-memory store")
            _store = InMemoryOnboardingStore()
        return _store


def reset_onboarding_store_for_tests(
    store: Optional[OnboardingStore] = None,
) -> OnboardingStore:
    global _store
    with _lock:
        _store = store or InMemoryOnboardingStore()
        return _store


async def get_editor_onboarding(user_id: str) -> EditorOnboardingV1:
    import asyncio

    store = get_onboarding_store()
    return await asyncio.to_thread(store.get_editor_v1, user_id)


async def put_editor_onboarding(
    user_id: str,
    *,
    status: OnboardingStatus,
    step_index: int,
) -> EditorOnboardingV1:
    import asyncio

    state = EditorOnboardingV1(
        status=status,
        step_index=max(0, step_index),
        version=1,
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    store = get_onboarding_store()
    await asyncio.to_thread(store.put_editor_v1, user_id, state)
    return state


async def should_auto_show_tour(user_id: str) -> bool:
    """Returning users with exports never get interrupted."""
    state = await get_editor_onboarding(user_id)
    if state.status in ("completed", "skipped"):
        return False
    try:
        from services.stats_service import get_user_stats

        stats = await get_user_stats(user_id)
        if int(stats.get("export_count") or 0) > 0:
            # Soft-complete so we never show again
            await put_editor_onboarding(user_id, status="completed", step_index=0)
            return False
    except Exception as exc:
        logger.debug("onboarding export_count check failed: %s", exc)
    return state.status in ("not_started", "in_progress")
