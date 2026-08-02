"""STUDIO_SUGGESTION_LLM — default OFF; fail-closed to heuristics when ON."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.flags import is_studio_suggestion_llm
from models.media_graph import (
    FacetBlob,
    MediaGraph,
    SuggestionEvidence,
    SuggestionIntent,
)
from services.suggestion_ranker import maybe_rank_suggestions


def _graph() -> MediaGraph:
    now = datetime.now(timezone.utc)
    return MediaGraph(
        graph_id="g-rank-1",
        owner_user_id="u1",
        created_at=now,
        updated_at=now,
        facets={
            "duration": FacetBlob(status="ready", data={"seconds": 30}),
        },
    )


def _heuristic_rows() -> list[SuggestionIntent]:
    return [
        SuggestionIntent(
            suggestion_id="sug-a",
            label="Cut dead air",
            capability_id="REMOVE_SILENCES",
            evidence=SuggestionEvidence(facet_keys=["silence"], summary="2 gaps"),
            confidence=0.7,
            interactive=True,
        ),
        SuggestionIntent(
            suggestion_id="sug-b",
            label="Add subtitles",
            capability_id="TOGGLE_CAPTIONS",
            evidence=SuggestionEvidence(facet_keys=["captions_present"], summary="off"),
            confidence=0.6,
            interactive=True,
        ),
    ]


def test_suggestion_llm_flag_default_off(monkeypatch):
    monkeypatch.delenv("STUDIO_SUGGESTION_LLM", raising=False)
    assert is_studio_suggestion_llm() is False


def test_suggestion_llm_flag_env_on(monkeypatch):
    monkeypatch.setenv("STUDIO_SUGGESTION_LLM", "1")
    assert is_studio_suggestion_llm() is True


@pytest.mark.asyncio
async def test_maybe_rank_flag_off_skips_ranker(monkeypatch):
    monkeypatch.delenv("STUDIO_SUGGESTION_LLM", raising=False)
    rows = _heuristic_rows()
    calls: list[int] = []

    async def boom(_graph, _suggestions):
        calls.append(1)
        raise RuntimeError("ranker must not run when flag OFF")

    out = await maybe_rank_suggestions(_graph(), rows, rank_fn=boom)
    assert out is rows
    assert calls == []
    assert [s.label for s in out] == ["Cut dead air", "Add subtitles"]


@pytest.mark.asyncio
async def test_maybe_rank_flag_on_failure_falls_back(monkeypatch):
    monkeypatch.setenv("STUDIO_SUGGESTION_LLM", "1")
    rows = _heuristic_rows()

    async def fail(_graph, _suggestions):
        raise RuntimeError("simulated 429")

    # Bypass Redis CostGuard — inject a fake cache for the miss → fail path.
    from middleware.cost_guard import SimilarQueryCache

    class _FakeRedis:
        def __init__(self) -> None:
            self.store: dict[str, object] = {}

        async def get(self, key: str) -> object:
            return self.store.get(key)

        async def set(
            self,
            key: str,
            value: object,
            *,
            ex: int | None = None,
            nx: bool = False,
        ) -> object:
            if nx and key in self.store:
                return False
            self.store[key] = value
            return True

        async def delete(self, key: str) -> object:
            self.store.pop(key, None)
            return 1

        async def eval(self, *_a, **_k) -> object:
            return 1

    cache = SimilarQueryCache(_FakeRedis())
    out = await maybe_rank_suggestions(
        _graph(),
        rows,
        user_id="u1",
        cache=cache,
        rank_fn=fail,
    )
    assert out is rows
    assert [s.label for s in out] == ["Cut dead air", "Add subtitles"]


@pytest.mark.asyncio
async def test_maybe_rank_flag_on_success_rewrites(monkeypatch):
    monkeypatch.setenv("STUDIO_SUGGESTION_LLM", "1")
    rows = _heuristic_rows()

    async def rewrite(_graph, suggestions):
        return [
            suggestions[1].model_copy(update={"label": "Turn on captions now"}),
            suggestions[0].model_copy(update={"label": "Remove silence gaps"}),
        ]

    from middleware.cost_guard import SimilarQueryCache

    class _FakeRedis:
        def __init__(self) -> None:
            self.store: dict[str, object] = {}

        async def get(self, key: str) -> object:
            return self.store.get(key)

        async def set(
            self,
            key: str,
            value: object,
            *,
            ex: int | None = None,
            nx: bool = False,
        ) -> object:
            if nx and key in self.store:
                return False
            self.store[key] = value
            return True

        async def delete(self, key: str) -> object:
            self.store.pop(key, None)
            return 1

        async def eval(self, *_a, **_k) -> object:
            return 1

    out = await maybe_rank_suggestions(
        _graph(),
        rows,
        user_id="u1",
        cache=SimilarQueryCache(_FakeRedis()),
        rank_fn=rewrite,
    )
    assert [s.label for s in out] == [
        "Turn on captions now",
        "Remove silence gaps",
    ]
    assert out[0].capability_id == "TOGGLE_CAPTIONS"
    assert out[1].capability_id == "REMOVE_SILENCES"
