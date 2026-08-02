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
    ready = [f for f in graph.facets.values() if f.status == "ready"]
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


def _fmt_time(sec: float) -> str:
    s = max(0, int(round(float(sec))))
    return f"{s // 60}:{s % 60:02d}"


def _quote(text: str, max_len: int = 42) -> str:
    cleaned = " ".join(str(text or "").split()).strip()
    if not cleaned:
        return ""
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1].rstrip() + "…"


def _chunk_list(data: dict[str, Any]) -> list[dict[str, Any]]:
    raw = data.get("chunks") or []
    out: list[dict[str, Any]] = []
    for c in raw:
        if not isinstance(c, dict):
            continue
        text = str(c.get("text") or "").strip()
        try:
            start = float(c.get("start", 0) or 0)
            end = float(c.get("end", start) or start)
        except (TypeError, ValueError):
            continue
        if end < start:
            continue
        out.append({"text": text, "start": start, "end": end})
    out.sort(key=lambda c: c["start"])
    return out


def _hook_chunk(chunks: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """First speech window with enough words to act as a hook."""
    for c in chunks:
        words = [w for w in c["text"].split() if w]
        if len(words) >= 3 or len(c["text"]) >= 12:
            return c
    return chunks[0] if chunks else None


def _densest_window(
    chunks: list[dict[str, Any]], window_sec: float = 8.0
) -> Optional[dict[str, Any]]:
    if not chunks:
        return None
    best: Optional[dict[str, Any]] = None
    best_words = -1
    for i, start_c in enumerate(chunks):
        w_start = float(start_c["start"])
        w_end = w_start + window_sec
        words = 0
        texts: list[str] = []
        end = w_start
        for c in chunks[i:]:
            if float(c["start"]) >= w_end:
                break
            words += len([w for w in c["text"].split() if w])
            if c["text"]:
                texts.append(c["text"])
            end = max(end, float(c["end"]))
        if words > best_words:
            best_words = words
            best = {
                "start": w_start,
                "end": end,
                "text": " ".join(texts),
                "words": words,
            }
    return best


def _silence_gaps(segments: list[Any]) -> list[dict[str, float]]:
    """Normalize facet/store segments to silence gaps only (never invent)."""
    gaps: list[dict[str, float]] = []
    for s in segments:
        if not isinstance(s, dict):
            continue
        seg_type = s.get("type")
        if seg_type == "keep":
            continue
        try:
            start = float(s.get("start", 0) or 0)
            end = float(s.get("end", 0) or 0)
        except (TypeError, ValueError):
            continue
        if end <= start:
            continue
        gaps.append({"start": start, "end": end})
    gaps.sort(key=lambda g: g["start"])
    return gaps


def _speech_density(chunks: list[dict[str, Any]], duration: float) -> float:
    if duration <= 0 or not chunks:
        return 0.0
    spoken = sum(max(0.0, float(c["end"]) - float(c["start"])) for c in chunks)
    return min(1.0, spoken / duration)


def derive_suggestions(graph: MediaGraph) -> list[SuggestionIntent]:
    """Pure derivation — evidence-backed packs, no I/O, no LLM, no invented facets."""
    out: list[SuggestionIntent] = []
    ready_keys = {k for k, f in graph.facets.items() if f.status == "ready"}

    if not ready_keys:
        out.append(
            SuggestionIntent(
                suggestion_id="skel-analyzing",
                label="QuickAI is reading your video…",
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
    audio_energy = graph.facets.get("audio_energy")

    captions_on = bool(
        captions and captions.status == "ready" and captions.data.get("enabled")
    )
    chunks: list[dict[str, Any]] = []
    chunk_count = 0
    transcript_ready = bool(
        transcript
        and transcript.status == "ready"
        and (transcript.data.get("chunk_count") or transcript.data.get("chunks"))
    )
    if transcript_ready and transcript is not None:
        chunks = _chunk_list(transcript.data)
        chunk_count = int(transcript.data.get("chunk_count") or len(chunks))

    duration_sec = 0.0
    if duration_f and duration_f.status == "ready":
        try:
            duration_sec = float(duration_f.data.get("seconds") or 0)
        except (TypeError, ValueError):
            duration_sec = 0.0

    hook = _hook_chunk(chunks) if chunks else None
    densest = _densest_window(chunks) if chunks else None

    # ── Transcript / caption craft ──────────────────────────────────────────
    if transcript_ready and hook is not None:
        hook_q = _quote(hook["text"])
        hook_label = (
            f'Trim to hook: "{hook_q}"' if hook_q else "Trim to opening hook"
        )
        out.append(
            SuggestionIntent(
                suggestion_id="sug-trim-hook",
                label=hook_label,
                capability_id="TRIM",
                intent_kind="capability",
                params={
                    "start": float(hook["start"]),
                    "end": float(hook["end"]) + 6.0,
                },
                evidence=SuggestionEvidence(
                    facet_keys=["transcript"],
                    summary=(
                        f'Hook @ {_fmt_time(hook["start"])}'
                        + (f': "{hook_q}"' if hook_q else "")
                    ),
                ),
                confidence=0.88,
                interactive=True,
            )
        )
        if densest and densest["words"] >= 8:
            densest_q = _quote(densest["text"])
            out.append(
                SuggestionIntent(
                    suggestion_id="sug-seek-dense",
                    label=(
                        f'Jump to densest speech: "{densest_q}"'
                        if densest_q
                        else "Jump to densest speech"
                    ),
                    capability_id="SEEK",
                    intent_kind="capability",
                    params={"time": float(densest["start"])},
                    evidence=SuggestionEvidence(
                        facet_keys=["transcript"],
                        summary=(
                            f'{densest["words"]} words @ '
                            f'{_fmt_time(densest["start"])}–{_fmt_time(densest["end"])}'
                        ),
                    ),
                    confidence=0.78,
                    interactive=True,
                )
            )

    if transcript_ready and not captions_on:
        hook_q = _quote(hook["text"]) if hook else ""
        out.append(
            SuggestionIntent(
                suggestion_id="sug-add-captions",
                label="Add subtitles",
                capability_id="TOGGLE_CAPTIONS",
                intent_kind="capability",
                params={"enabled": True},
                evidence=SuggestionEvidence(
                    facet_keys=["transcript", "captions_present"]
                    if captions and captions.status == "ready"
                    else ["transcript"],
                    summary=(
                        f"Transcript ready ({chunk_count} chunks); captions off"
                        + (f' · starts "{hook_q}"' if hook_q else "")
                    ),
                ),
                confidence=0.86,
                interactive=True,
            )
        )
        if hook and hook_q:
            out.append(
                SuggestionIntent(
                    suggestion_id="sug-hook-caption",
                    label=f'Hook caption: "{hook_q}"',
                    capability_id="GENERATE_HOOK_CAPTION",
                    intent_kind="capability",
                    params={"captions": [hook["text"].strip()]},
                    evidence=SuggestionEvidence(
                        facet_keys=["transcript"],
                        summary=f'From transcript @ {_fmt_time(hook["start"])}',
                    ),
                    confidence=0.82,
                    interactive=True,
                )
            )
            out.append(
                SuggestionIntent(
                    suggestion_id="sug-add-hook-caption",
                    label=f'Burn-in hook: "{hook_q}"',
                    capability_id="ADD_CAPTION",
                    intent_kind="capability",
                    params={
                        "text": hook["text"].strip(),
                        "startTime": float(hook["start"]),
                        "endTime": max(
                            float(hook["end"]), float(hook["start"]) + 2.5
                        ),
                    },
                    evidence=SuggestionEvidence(
                        facet_keys=["transcript"],
                        summary=(
                            f'{_fmt_time(hook["start"])}–{_fmt_time(hook["end"])}'
                        ),
                    ),
                    confidence=0.8,
                    interactive=True,
                )
            )

    if transcript_ready:
        out.append(
            SuggestionIntent(
                suggestion_id="sug-dub-video",
                label="Dub into another language",
                capability_id="DUB_VIDEO",
                intent_kind="capability",
                # Language chosen in DubPanel — avoid surprise default.
                params={"mode": "full_dub"},
                evidence=SuggestionEvidence(
                    facet_keys=["transcript"],
                    summary=f"EN transcript ready · {chunk_count} chunks",
                ),
                confidence=0.8,
                interactive=True,
            )
        )

    # ── Silence surgery ─────────────────────────────────────────────────────
    long_silences: list[dict[str, float]] = []
    if silence and silence.status == "ready":
        gaps = _silence_gaps(silence.data.get("segments") or [])
        long_silences = [
            g
            for g in gaps
            if (g["end"] - g["start"]) >= SILENCE_SUGGEST_MIN_SEC
        ]
        long_silences.sort(key=lambda g: g["end"] - g["start"], reverse=True)
        if long_silences:
            top_n = long_silences[:3]
            times = ", ".join(
                f'{_fmt_time(g["start"])}–{_fmt_time(g["end"])}' for g in top_n
            )
            out.append(
                SuggestionIntent(
                    suggestion_id="sug-remove-silences",
                    label=f"Cut dead air ({len(long_silences)} gaps)",
                    capability_id="REMOVE_SILENCES",
                    intent_kind="capability",
                    params={
                        "min_silence_sec": SILENCE_SUGGEST_MIN_SEC,
                        "padding_sec": 0.05,
                        "segments": [
                            {"start": g["start"], "end": g["end"], "type": "silence"}
                            for g in long_silences
                        ],
                    },
                    evidence=SuggestionEvidence(
                        facet_keys=["silence"],
                        summary=(
                            f"{len(long_silences)} silence ≥ "
                            f"{SILENCE_SUGGEST_MIN_SEC}s · {times}"
                        ),
                    ),
                    confidence=min(0.95, 0.55 + 0.05 * len(long_silences)),
                    interactive=True,
                )
            )
            longest = long_silences[0]
            out.append(
                SuggestionIntent(
                    suggestion_id="sug-preview-silence",
                    label=f'Preview dead air @ {_fmt_time(longest["start"])}',
                    capability_id="SEEK",
                    intent_kind="capability",
                    params={"time": float(longest["start"])},
                    evidence=SuggestionEvidence(
                        facet_keys=["silence"],
                        summary=(
                            f'Longest gap {_fmt_time(longest["start"])}–'
                            f'{_fmt_time(longest["end"])} '
                            f'({longest["end"] - longest["start"]:.1f}s)'
                        ),
                    ),
                    confidence=0.72,
                    interactive=True,
                )
            )

    # ── Viral pack ──────────────────────────────────────────────────────────
    strong: list[dict[str, Any]] = []
    if viral and viral.status == "ready":
        moments = viral.data.get("moments") or []
        for m in moments:
            if not isinstance(m, dict):
                continue
            try:
                score = float(m.get("score", 0) or 0)
                start = float(m.get("start", 0) or 0)
                end = float(m.get("end", start) or start)
            except (TypeError, ValueError):
                continue
            if score >= VIRAL_SCORE_THRESHOLD:
                strong.append(
                    {
                        "start": start,
                        "end": end,
                        "score": score,
                        "hook": str(m.get("hook") or m.get("reason") or ""),
                    }
                )
        if strong:
            top = max(strong, key=lambda m: float(m["score"]))
            top_score = float(top["score"])
            detect_moments = [
                {
                    "timestamp": float(m["start"]),
                    "hook": m["hook"]
                    or f"Moment @ {_fmt_time(m['start'])} (score {int(m['score'])})",
                    "score": float(m["score"]),
                }
                for m in sorted(strong, key=lambda x: -float(x["score"]))[:5]
            ]
            out.append(
                SuggestionIntent(
                    suggestion_id="sug-detect-viral-surface",
                    label=f"Show {len(detect_moments)} viral moments",
                    capability_id="DETECT_VIRAL_MOMENTS",
                    intent_kind="capability",
                    params={"moments": detect_moments},
                    evidence=SuggestionEvidence(
                        facet_keys=["viral_moments"],
                        summary=(
                            f"Top score {int(top_score)} @ "
                            f'{_fmt_time(top["start"])}–{_fmt_time(top["end"])}'
                        ),
                    ),
                    confidence=min(0.92, top_score / 100.0),
                    interactive=True,
                )
            )
            out.append(
                SuggestionIntent(
                    suggestion_id="sug-viral-seek",
                    label=(
                        f'Jump to best moment ({int(top_score)})'
                        + (
                            f': "{_quote(top["hook"], 28)}"'
                            if top.get("hook")
                            else f' @ {_fmt_time(top["start"])}'
                        )
                    ),
                    capability_id="SEEK",
                    intent_kind="capability",
                    params={"time": float(top["start"])},
                    evidence=SuggestionEvidence(
                        facet_keys=["viral_moments"],
                        summary=(
                            f'{_fmt_time(top["start"])}–{_fmt_time(top["end"])} '
                            f"score={int(top_score)}"
                        ),
                    ),
                    confidence=min(0.9, top_score / 100.0),
                    interactive=True,
                )
            )
            trim_end = float(top["end"]) if float(top["end"]) > float(top["start"]) else float(top["start"]) + 12.0
            out.append(
                SuggestionIntent(
                    suggestion_id="sug-viral-trim",
                    label=f'Trim to best moment @ {_fmt_time(top["start"])}',
                    capability_id="TRIM",
                    intent_kind="capability",
                    params={"start": float(top["start"]), "end": trim_end},
                    evidence=SuggestionEvidence(
                        facet_keys=["viral_moments"],
                        summary=(
                            f'Score {int(top_score)} · '
                            f'{_fmt_time(top["start"])}–{_fmt_time(trim_end)}'
                        ),
                    ),
                    confidence=min(0.88, top_score / 100.0),
                    interactive=True,
                )
            )
            out.append(
                SuggestionIntent(
                    suggestion_id="sug-viral-sfx",
                    label="Add impact SFX on best moment",
                    capability_id="ADD_SFX",
                    intent_kind="capability",
                    params={
                        "sfx_id": "impact-thud",
                        "start_sec": float(top["start"]),
                        "volume": 1.0,
                    },
                    evidence=SuggestionEvidence(
                        facet_keys=["viral_moments"],
                        summary=f'Wired SFX at {_fmt_time(top["start"])} (score {int(top_score)})',
                    ),
                    confidence=0.7,
                    interactive=True,
                )
            )

    if duration_sec > 600 and not strong:
        has_viral_facet = bool(
            viral and viral.status == "ready" and (viral.data.get("moments") or [])
        )
        out.append(
            SuggestionIntent(
                suggestion_id="sug-detect-viral",
                label="Find highlights",
                capability_id="DETECT_VIRAL_MOMENTS",
                intent_kind="capability",
                params={},
                evidence=SuggestionEvidence(
                    facet_keys=["duration"]
                    if not has_viral_facet
                    else ["duration", "viral_moments"],
                    summary=(
                        f"Duration {int(duration_sec)}s with no strong viral moments yet"
                    ),
                ),
                confidence=0.6,
                interactive=True,
            )
        )

    # ── Audio / pacing (only from existing facets — never invent energy) ────
    if transcript_ready and duration_sec >= 90:
        density = _speech_density(chunks, duration_sec)
        if density >= 0.7:
            out.append(
                SuggestionIntent(
                    suggestion_id="sug-playback-speed",
                    label="Speed up dense speech (1.25×)",
                    capability_id="SET_PLAYBACK_SPEED",
                    intent_kind="capability",
                    params={"value": 125},
                    evidence=SuggestionEvidence(
                        facet_keys=["transcript", "duration"],
                        summary=(
                            f"Speech density {density:.0%} over {int(duration_sec)}s"
                        ),
                    ),
                    confidence=0.68,
                    interactive=True,
                )
            )

    if audio_energy and audio_energy.status == "ready":
        try:
            level = float(
                audio_energy.data.get("rms")
                or audio_energy.data.get("level")
                or audio_energy.data.get("score")
                or 0
            )
        except (TypeError, ValueError):
            level = 0.0
        # Facet present + low signal → boost / denoise. Never invent the facet.
        if level > 0 and level < 0.35:
            out.append(
                SuggestionIntent(
                    suggestion_id="sug-audio-boost",
                    label="Boost quiet audio",
                    capability_id="SET_AUDIO_BOOST",
                    intent_kind="capability",
                    params={"value": 130},
                    evidence=SuggestionEvidence(
                        facet_keys=["audio_energy"],
                        summary=f"Low energy facet level={level:.2f}",
                    ),
                    confidence=0.65,
                    interactive=True,
                )
            )
            out.append(
                SuggestionIntent(
                    suggestion_id="sug-noise-reduction",
                    label="Reduce background noise",
                    capability_id="SET_NOISE_REDUCTION",
                    intent_kind="capability",
                    params={"value": 55},
                    evidence=SuggestionEvidence(
                        facet_keys=["audio_energy"],
                        summary=f"Low energy facet level={level:.2f}",
                    ),
                    confidence=0.62,
                    interactive=True,
                )
            )

    if not any(s.interactive for s in out):
        out.append(
            SuggestionIntent(
                suggestion_id="skel-partial",
                label="Keep editing — more suggestions unlock as analysis finishes",
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

    out.sort(key=lambda s: (-s.confidence, s.suggestion_id))
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
        # O(1) via Kernel head pointer when already bound (FinOps).
        try:
            from services.project_kernel import get_project_kernel

            head = await get_project_kernel().get_project(project_id, owner_user_id)
            if head and head.media_graph_id:
                bound = await self.get(head.media_graph_id, owner_user_id)
                if bound is not None:
                    return bound
        except Exception as exc:
            logger.warning(
                "media_graph_head_lookup_failed project_id=%s: %s", project_id, exc
            )

        existing = await asyncio.to_thread(
            self.store.find_by_project, owner_user_id, project_id
        )
        if existing:
            await self._best_effort_bind_head(
                owner_user_id, project_id, existing.graph_id
            )
            return existing
        created = await self.create(
            owner_user_id, CreateMediaGraphRequest(project_id=project_id)
        )
        await self._best_effort_bind_head(owner_user_id, project_id, created.graph_id)
        return created

    async def _best_effort_bind_head(
        self, owner_user_id: str, project_id: str, graph_id: str
    ) -> None:
        try:
            from services.project_kernel import get_project_kernel

            ok = await get_project_kernel().bind_media_graph_id(
                project_id, owner_user_id, graph_id
            )
            if ok:
                logger.info(
                    "media_graph_bound project_id=%s graph_id=%s", project_id, graph_id
                )
        except Exception as exc:
            logger.warning(
                "media_graph_bind_failed project_id=%s graph_id=%s: %s",
                project_id,
                graph_id,
                exc,
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
        changed = False
        for key, data in body.facets.items():
            status = data.get("status", "ready")
            if status not in {"missing", "pending", "ready", "error"}:
                status = "ready"
            payload = {k: v for k, v in data.items() if k != "status"}
            prev = g.facets.get(key)
            if (
                prev is not None
                and prev.status == status
                and prev.data == payload
                and prev.provenance == body.provenance
            ):
                continue
            changed = True
            g.facets[key] = FacetBlob(
                status=status,  # type: ignore[arg-type]
                version=(prev.version + 1) if prev is not None else 1,
                updated_at=now,
                provenance=body.provenance,
                data=payload,
                error=data.get("error"),
            )
        if not changed:
            # FinOps: identical edge upsert must not rewrite Firestore.
            return g
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
        rows = derive_suggestions(g)
        # Phase 5: optional LLM re-rank behind STUDIO_SUGGESTION_LLM (default OFF).
        from services.suggestion_ranker import maybe_rank_suggestions

        return await maybe_rank_suggestions(g, rows, user_id=user_id)


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
