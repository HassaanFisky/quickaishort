"""Optional Gemini re-rank of MediaGraph suggestion labels (Phase 5 scaffold).

Default path is flag-OFF: callers keep pure ``derive_suggestions`` output.
When STUDIO_SUGGESTION_LLM=1, one CostGuard-cached model call may rewrite
labels / order; any failure returns the heuristic list unchanged.
"""

from __future__ import annotations

import importlib
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from core.flags import is_mock_ai_mode, is_studio_suggestion_llm
from models.media_graph import MediaGraph, SuggestionIntent

logger = logging.getLogger(__name__)

OPERATION = "studio_suggestion_rank"
RankFn = Callable[
    [MediaGraph, list[SuggestionIntent]],
    Awaitable[list[SuggestionIntent]],
]


class RankedSuggestionItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    suggestion_id: str = Field(min_length=1, max_length=128)
    label: str = Field(min_length=1, max_length=240)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class SuggestionRankPayload(BaseModel):
    """Cached / model JSON — label rewrite only; no new capability ABI."""

    model_config = ConfigDict(extra="forbid")

    items: list[RankedSuggestionItem] = Field(default_factory=list, max_length=16)


def apply_ranked_labels(
    suggestions: list[SuggestionIntent],
    ranked: SuggestionRankPayload,
) -> list[SuggestionIntent]:
    """Merge ranked labels onto heuristic intents; never invent capability_ids."""

    by_id = {s.suggestion_id: s for s in suggestions}
    out: list[SuggestionIntent] = []
    seen: set[str] = set()
    for item in ranked.items:
        base = by_id.get(item.suggestion_id)
        if base is None or item.suggestion_id in seen:
            continue
        seen.add(item.suggestion_id)
        conf = item.confidence if item.confidence is not None else base.confidence
        out.append(base.model_copy(update={"label": item.label, "confidence": conf}))
    for s in suggestions:
        if s.suggestion_id not in seen:
            out.append(s)
    return out


def _facet_snapshot(graph: MediaGraph) -> dict[str, Any]:
    snap: dict[str, Any] = {}
    for key, blob in sorted(graph.facets.items()):
        if blob.status != "ready":
            continue
        # Cap payload size — ranker needs evidence shape, not full transcript.
        data = blob.data
        if key == "transcript" and isinstance(data, dict):
            chunks = data.get("chunks") or []
            if isinstance(chunks, list) and len(chunks) > 8:
                data = {
                    **data,
                    "chunks": chunks[:8],
                    "chunk_count": data.get("chunk_count") or len(chunks),
                }
        snap[key] = {"status": blob.status, "data": data}
    return snap


def _heuristic_query(suggestions: list[SuggestionIntent]) -> str:
    parts = [f"{s.suggestion_id}:{s.label}" for s in suggestions[:12]]
    return " | ".join(parts) or "empty"


async def _default_rank_via_llm(
    graph: MediaGraph,
    suggestions: list[SuggestionIntent],
) -> list[SuggestionIntent]:
    """One Gemini call to re-rank/rewrite labels. Raises on any model failure."""

    if is_mock_ai_mode():
        # Zero-spend sandbox: identity rank (proves flag path without Gemini).
        return suggestions

    gemini_client = importlib.import_module("services.gemini_client")
    schema = json.dumps(
        SuggestionRankPayload.model_json_schema(),
        sort_keys=True,
        separators=(",", ":"),
    )
    facets = json.dumps(
        _facet_snapshot(graph),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    current = json.dumps(
        [
            {
                "suggestion_id": s.suggestion_id,
                "label": s.label,
                "confidence": s.confidence,
                "capability_id": s.capability_id,
                "evidence": s.evidence.model_dump(mode="json"),
            }
            for s in suggestions
        ],
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    prompt = (
        "Re-rank and rewrite suggestion chip labels for a video editor. "
        "Use only the supplied facet JSON and existing suggestion_ids. "
        "Do not invent new suggestion_ids or capabilities. "
        "Return one JSON object matching the schema.\n"
        f"SCHEMA: {schema}\n"
        f"FACETS_JSON: {facets}\n"
        f"SUGGESTIONS_JSON: {current}"
    )
    text = await gemini_client.call_gemini_text(
        prompt,
        json_mode=True,
        max_attempts=1,
    )
    payload = SuggestionRankPayload.model_validate_json(text, strict=True)
    return apply_ranked_labels(suggestions, payload)


def _default_cache():
    from middleware.cost_guard import SimilarQueryCache

    queue_service = importlib.import_module("services.queue_service")
    return SimilarQueryCache(queue_service.async_redis_conn)


async def maybe_rank_suggestions(
    graph: MediaGraph,
    suggestions: list[SuggestionIntent],
    *,
    user_id: str = "anonymous",
    cache: Any | None = None,
    rank_fn: Optional[RankFn] = None,
) -> list[SuggestionIntent]:
    """Flag-gated CostGuard-cached re-rank. Flag OFF → heuristics unchanged."""

    if not is_studio_suggestion_llm():
        return suggestions
    if not suggestions:
        return suggestions

    try:
        return await _rank_with_cost_guard(
            graph,
            suggestions,
            user_id=user_id,
            cache=cache,
            rank_fn=rank_fn or _default_rank_via_llm,
        )
    except Exception as exc:
        # Fail-closed: 429, CostGuardUnavailable, ValidationError, Redis, etc.
        logger.warning(
            "suggestion_llm_rank_failed graph_id=%s fail_closed=%s",
            graph.graph_id,
            type(exc).__name__,
        )
        return suggestions


async def _rank_with_cost_guard(
    graph: MediaGraph,
    suggestions: list[SuggestionIntent],
    *,
    user_id: str,
    cache: Any | None,
    rank_fn: RankFn,
) -> list[SuggestionIntent]:
    from middleware.cost_guard import (
        CacheDescriptor,
        CacheLookupStatus,
        schema_fingerprint,
    )

    cache_client = cache if cache is not None else _default_cache()
    descriptor = CacheDescriptor(
        user_id=user_id or "anonymous",
        operation=OPERATION,
        query=_heuristic_query(suggestions),
        workload_id=graph.graph_id,
        tier="free",
        context={
            "graph_id": graph.graph_id,
            "revision": graph.revision,
            "facets": _facet_snapshot(graph),
            "suggestion_ids": [s.suggestion_id for s in suggestions],
        },
        response_schema_hash=schema_fingerprint(SuggestionRankPayload),
    )

    lookup = await cache_client.lookup(descriptor)
    if lookup.status is CacheLookupStatus.HIT:
        try:
            payload = SuggestionRankPayload.model_validate(lookup.payload, strict=True)
            return apply_ranked_labels(suggestions, payload)
        except (ValidationError, TypeError, ValueError):
            await cache_client.invalidate(lookup.cache_key)
            lookup = await cache_client.lookup(descriptor)

    if lookup.status is CacheLookupStatus.IN_FLIGHT:
        # Do not block chip UX on a twin in-flight rank.
        return suggestions

    if lookup.status is not CacheLookupStatus.MISS_RESERVED:
        return suggestions

    try:
        ranked = await rank_fn(graph, suggestions)
        store_payload = SuggestionRankPayload(
            items=[
                RankedSuggestionItem(
                    suggestion_id=s.suggestion_id,
                    label=s.label,
                    confidence=s.confidence,
                )
                for s in ranked
            ]
        )
        await cache_client.store(
            lookup,
            store_payload.model_dump(mode="json"),
        )
        return ranked
    except Exception:
        await cache_client.release(lookup)
        raise
