"""Latest DecisionRecord per project — Redis TTL, same plane as PlanStore.

Used so a follow-up like "keep the original opening" can revise the last
authorized cut instead of inventing a second unrelated answer.
Always fail-open on Redis errors: missing prior is ASK, not a 500.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

from models.studio_decision import DecisionRecord

logger = logging.getLogger(__name__)

_TTL_SEC = int(os.environ.get("ORCH_PLAN_TTL_SEC", "7200"))
_PREFIX = "studio:decision:latest:"


def _key(user_id: str, project_id: str) -> str:
    return f"{_PREFIX}{user_id}:{project_id}"


def _client() -> Any:
    from services.queue_service import redis_conn

    if redis_conn is None:
        raise RuntimeError("redis_conn_none")
    return redis_conn


def put_latest(user_id: str, project_id: str, record: DecisionRecord) -> None:
    if not user_id or not project_id:
        return
    try:
        ttl = max(60, _TTL_SEC)
        _client().setex(_key(user_id, project_id), ttl, record.model_dump_json())
    except Exception as exc:  # noqa: BLE001
        is_prod = os.getenv("ENVIRONMENT", "").strip().lower() == "production"
        if is_prod:
            logger.warning(
                "decision_store_put_failed project_id=%s err=%s", project_id, exc
            )
            return
        logger.debug("decision_store_put_skipped err=%s", exc)


def get_latest(user_id: str, project_id: str) -> Optional[DecisionRecord]:
    if not user_id or not project_id:
        return None
    try:
        raw = _client().get(_key(user_id, project_id))
    except Exception as exc:  # noqa: BLE001
        logger.debug("decision_store_get_skipped err=%s", exc)
        return None
    if raw is None:
        return None
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8")
    try:
        return DecisionRecord.model_validate_json(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("decision_store_corrupt project_id=%s err=%s", project_id, exc)
        return None
