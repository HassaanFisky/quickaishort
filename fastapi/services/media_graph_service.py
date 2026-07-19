"""EP-003 MediaGraph service — facet merge + grounded suggestion derivation.

Never invents clickable creative advice without facet evidence (Phase 2 A5a).
"""

from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime, timezone
from typing import Any, Optional, Protocol
from uuid import uuid4

from models.media_graph import (
    SCHEMA_VERSION,
    CreateMediaGraphRequest,
    FacetBlob,
    MediaGraph,
    SuggestionEvidence,
    SuggestionIntent,
    UpsertFacetsRequest,
)

logger = logging.getLogger(__name__)

COLLECTION = "studio_media_graphs"
SILENCE_SUGGEST_MIN_SEC = 0.6
VIRAL_SCORE_THRESHOLD = 70.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


class MediaGraphStore(Protocol):
    def put(self, graph: MediaGraph) -> None: ...

    def get(self, graph_id: str) -> Optional[MediaGraph]: ...

    def find_by_project(
        self, owner_user_id: str, project_id: str
    ) -> Optional[MediaGraph]: ...


class InMemoryMediaGraphStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.graphs: dict[str, MediaGraph] = {}

    def put(self, graph: MediaGraph) -> None:
        with self._lock:
            self.graphs[graph.graph_id] = graph.model_copy(deep=True)

    def get(self, graph_id: str) -> Optional[MediaGraph]:
        with self._lock:
            g = self.graphs.get(graph_id)
            return g.model_copy(deep=True) if g else None

    def find_by_project(
        self, owner_user_id: str, project_id: str
    ) -> Optional[MediaGraph]:
        with self._lock:
            for g in self.graphs.values():
                if g.owner_user_id == owner_user_id and g.project_id == project_id:
                    return g.model_copy(deep=True)
            return None


class FirestoreMediaGraphStore:
    def _col(self):
        from services.db import get_db

        return get_db().collection(COLLECTION)

    def put(self, graph: MediaGraph) -> None:
        self._col().document(graph.graph_id).set(graph.model_dump(mode="json"))

    def get(self, graph_id: str) -> Optional[MediaGraph]:
        snap = self._col().document(graph_id).get()
        if not snap.exists:
            return None
        return MediaGraph.model_validate(snap.to_dict())

    def find_by_project(
        self, owner_user_id: str, project_id: str
    ) -> Optional[MediaGraph]:
        q = (
            self._col()
            .where("owner_user_id", "==", owner_user_id)
            .where("project_id", "==", project_id)
            .limit(1)
        )
        for s in q.stream():
            return MediaGraph.model_validate(s.to_dict())
        return None


def _recompute_status(graph: MediaGraph) -> None:
    ready = [
        f
        for f in graph.facets.values()
        if f.status == "ready"
    ]
    if not graph.facets:
        graph.status = "pending"
    elif ready and len(ready) == len(graph.facets):
        graph.status = "ready"
    elif ready:
        graph.status = "partial"
    elif any(f.status == "error" for f in graph.facets.values()):
        graph.status = "failed"
    else:
        graph.status = "pending"


def derive_suggestions(graph: MediaGraph) -> list[SuggestionIntent]:
    """Pure derivation — no I/O, no LLM, no title heuristics."""
    out: list[SuggestionIntent] = []
    ready_keys = {k for k, f in graph.facets.items() if f.status == "ready"}

    if not ready_keys:
        out.append(
            SuggestionIntent(
                suggestion_id="skel-analyzing",
                label="Analyzing media… suggestions appear when understanding is ready",
                capability_id=None,
                intent_kind="informational",
                params={},
                evidence=SuggestionEvidence(
                    facet_keys=[],
                    summary="No ready facets yet",
                ),
                confidence=0.0,
                interactive=False,
            )
        )
        return out

    transcript = graph.facets.get("transcript")
    captions = graph.facets.get("captions_present")
    silence = graph.facets.get("silence")
    viral = graph.facets.get("viral_moments")
    duration_f = graph.facets.get("duration")

    captions_on = bool(
        captions and captions.status == "ready" and captions.data.get("enabled")
    )
    if (
        transcript
        and transcript.status == "ready"
        and not captions_on
        and (transcript.data.get("chunk_count") or transcript.data.get("chunks"))
    ):
        chunk_count = transcript.data.get("chunk_count")
        if chunk_count is None:
            chunks = transcript.data.get("chunks") or []
            chunk_count = len(chunks)
        out.append(
            SuggestionIntent(
                suggestion_id="sug-add-captions",
                label="Add captions from transcript",
                capability_id="TOGGLE_CAPTIONS",
                intent_kind="capability",
                params={"enabled": True},
                evidence=SuggestionEvidence(
                    facet_keys=["transcript"],
                    summary=f"Transcript ready ({chunk_count} chunks); captions not enabled",
                ),
                confidence=0.85,
                interactive=True,
            )
        )

    if silence and silence.status == "ready":
        segments = silence.data.get("segments") or []
        long_ones = [
            s
            for s in segments
            if float(s.get("end", 0) - s.get("start", 0)) >= SILENCE_SUGGEST_MIN_SEC
        ]
        if long_ones:
            out.append(
                SuggestionIntent(
                    suggestion_id="sug-remove-silences",
                    label=f"Remove {len(long_ones)} silence gap(s)",
                    capability_id="REMOVE_SILENCES",
                    intent_kind="capability",
                    params={"min_silence_sec": SILENCE_SUGGEST_MIN_SEC, "padding_sec": 0.05},
                    evidence=SuggestionEvidence(
                        facet_keys=["silence"],
                        summary=f"{len(long_ones)} silence segments ≥ {SILENCE_SUGGEST_MIN_SEC}s",
                    ),
                    confidence=min(0.95, 0.55 + 0.05 * len(long_ones)),
                    interactive=True,
                )
            )

    if viral and viral.status == "ready":
        moments = viral.data.get("moments") or []
        strong = [
            m
            for m in moments
            if float(m.get("score", 0)) >= VIRAL_SCORE_THRESHOLD
        ]
        if strong:
            top = max(strong, key=lambda m: float(m.get("score", 0)))
            out.append(
                SuggestionIntent(
                    suggestion_id="sug-viral-trim",
                    label=f"Jump to top viral moment (score {int(float(top.get('score', 0)))})",
                    capability_id="SEEK",
                    intent_kind="capability",
                    params={"time": float(top.get("start", 0))},
                    evidence=SuggestionEvidence(
                        facet_keys=["viral_moments"],
                        summary=f"Top moment {top.get('start')}–{top.get('end')} score={top.get('score')}",
                    ),
                    confidence=min(0.9, float(top.get("score", 0)) / 100.0),
                    interactive=True,
                )
            )

    if duration_f and duration_f.status == "ready":
        dur = float(duration_f.data.get("seconds") or 0)
        if dur > 600 and not (viral and viral.status == "ready" and (viral.data.get("moments") or [])):
            out.append(
                SuggestionIntent(
                    suggestion_id="sug-detect-viral",
                    label="Detect viral moments in this long video",
                    capability_id="DETECT_VIRAL_MOMENTS",
                    intent_kind="capability",
                    params={},
                    evidence=SuggestionEvidence(
                        facet_keys=["duration"],
                        summary=f"Duration {int(dur)}s with no viral_moments facet yet",
                    ),
                    confidence=0.6,
                    interactive=True,
                )
            )

    if not any(s.interactive for s in out):
        out.append(
            SuggestionIntent(
                suggestion_id="skel-partial",
                label="Media partially understood — keep editing or wait for deeper analysis",
                capability_id=None,
                intent_kind="informational",
                params={},
                evidence=SuggestionEvidence(
                    facet_keys=sorted(ready_keys),
                    summary=f"Ready facets: {', '.join(sorted(ready_keys))}",
                ),
                confidence=0.2,
                interactive=False,
            )
        )

    return out[:8]


class MediaGraphService:
    def __init__(self, store: Optional[MediaGraphStore] = None) -> None:
        self.store: MediaGraphStore = store or FirestoreMediaGraphStore()

    async def create(
        self, owner_user_id: str, body: CreateMediaGraphRequest
    ) -> MediaGraph:
        now = _now()
        graph = MediaGraph(
            schema_version=SCHEMA_VERSION,
            graph_id=uuid4().hex,
            owner_user_id=owner_user_id,
            asset_id=body.asset_id,
            project_id=body.project_id,
            created_at=now,
            updated_at=now,
            status="pending",
            facets={},
            revision=0,
        )
        await asyncio.to_thread(self.store.put, graph)
        logger.info("media_graph_created graph_id=%s", graph.graph_id)
        return graph

    async def ensure_for_project(
        self, owner_user_id: str, project_id: str
    ) -> MediaGraph:
        existing = await asyncio.to_thread(
            self.store.find_by_project, owner_user_id, project_id
        )
        if existing:
            return existing
        return await self.create(
            owner_user_id, CreateMediaGraphRequest(project_id=project_id)
        )

    async def get(self, graph_id: str, user_id: str) -> Optional[MediaGraph]:
        g = await asyncio.to_thread(self.store.get, graph_id)
        if g is None or g.owner_user_id != user_id:
            return None
        return g

    async def upsert_facets(
        self, graph_id: str, user_id: str, body: UpsertFacetsRequest
    ) -> Optional[MediaGraph]:
        g = await self.get(graph_id, user_id)
        if g is None:
            return None
        now = _now()
        for key, data in body.facets.items():
            status = data.get("status", "ready")
            if status not in {"missing", "pending", "ready", "error"}:
                status = "ready"
            payload = {k: v for k, v in data.items() if k != "status"}
            g.facets[key] = FacetBlob(
                status=status,  # type: ignore[arg-type]
                version=(g.facets.get(key).version + 1) if key in g.facets else 1,
                updated_at=now,
                provenance=body.provenance,
                data=payload,
                error=data.get("error"),
            )
        g.revision += 1
        g.updated_at = now
        _recompute_status(g)
        await asyncio.to_thread(self.store.put, g)
        return g

    async def suggestions(
        self, graph_id: str, user_id: str
    ) -> Optional[list[SuggestionIntent]]:
        g = await self.get(graph_id, user_id)
        if g is None:
            return None
        return derive_suggestions(g)


_svc: Optional[MediaGraphService] = None


def get_media_graph_service() -> MediaGraphService:
    global _svc
    if _svc is None:
        _svc = MediaGraphService()
    return _svc


def reset_media_graph_service_for_tests(
    store: Optional[MediaGraphStore] = None,
) -> MediaGraphService:
    global _svc
    _svc = MediaGraphService(store=store or InMemoryMediaGraphStore())
    return _svc
