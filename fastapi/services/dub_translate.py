"""Structured Gemini translation for timed Dub Video segments."""

from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any

from models.dub import DubSegment, DubTranscriptChunk
from services.dub_voices import DUB_LANG_LABELS

logger = logging.getLogger(__name__)

_JSON_FENCE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


def translation_cache_key(
    chunks: list[DubTranscriptChunk], target_lang: str
) -> str:
    payload = json.dumps(
        [{"t": c.text, "s": round(c.start, 3), "e": round(c.end, 3)} for c in chunks],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    digest = hashlib.sha256(f"{target_lang}|{payload}".encode("utf-8")).hexdigest()
    return f"dub:tx:{digest}"


def _parse_json_payload(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        raise ValueError("empty_translation_response")
    fence = _JSON_FENCE.search(text)
    if fence:
        text = fence.group(1).strip()
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("translation_not_object")
    return data


def _mock_translate(
    chunks: list[DubTranscriptChunk], target_lang: str
) -> list[DubSegment]:
    label = DUB_LANG_LABELS.get(target_lang, target_lang)
    out: list[DubSegment] = []
    for i, chunk in enumerate(chunks):
        out.append(
            DubSegment(
                id=f"seg-{i}",
                source_text=chunk.text,
                translated_text=f"[{label}] {chunk.text}",
                start=chunk.start,
                end=max(chunk.end, chunk.start + 0.1),
            )
        )
    return out


async def translate_segments(
    chunks: list[DubTranscriptChunk],
    target_lang: str,
) -> list[DubSegment]:
    """Translate timed chunks. Returns one segment per input chunk."""

    from core.flags import is_mock_ai_mode

    if target_lang == "en":
        return [
            DubSegment(
                id=f"seg-{i}",
                source_text=c.text,
                translated_text=c.text,
                start=c.start,
                end=max(c.end, c.start + 0.1),
            )
            for i, c in enumerate(chunks)
        ]

    if is_mock_ai_mode():
        return _mock_translate(chunks, target_lang)

    lang_name = DUB_LANG_LABELS.get(target_lang, target_lang)
    numbered = [
        {"id": f"seg-{i}", "text": c.text, "start": c.start, "end": c.end}
        for i, c in enumerate(chunks)
    ]
    prompt = (
        "You are a professional audiovisual translator.\n"
        f"Translate each segment into {lang_name} ({target_lang}).\n"
        "Preserve meaning, keep spoken style natural, do not invent new lines.\n"
        "Keep the same segment ids and approximate timing.\n"
        "Return ONLY JSON of the form:\n"
        '{"segments":[{"id":"seg-0","text":"...","start":0.0,"end":1.2}]}\n\n'
        f"INPUT:\n{json.dumps({'segments': numbered}, ensure_ascii=False)}"
    )

    from services.gemini_client import call_gemini_text

    raw = await call_gemini_text(prompt, json_mode=True, max_attempts=2)
    data = _parse_json_payload(raw)
    rows = data.get("segments")
    if not isinstance(rows, list) or not rows:
        raise ValueError("translation_missing_segments")

    by_id = {
        str(row.get("id")): row
        for row in rows
        if isinstance(row, dict) and row.get("id") is not None
    }
    out: list[DubSegment] = []
    for i, chunk in enumerate(chunks):
        sid = f"seg-{i}"
        row = by_id.get(sid) or (rows[i] if i < len(rows) else None)
        if not isinstance(row, dict):
            raise ValueError(f"translation_segment_missing:{sid}")
        text = str(row.get("text") or "").strip()
        if not text:
            raise ValueError(f"translation_empty:{sid}")
        start = float(row.get("start", chunk.start))
        end = float(row.get("end", chunk.end))
        out.append(
            DubSegment(
                id=sid,
                source_text=chunk.text,
                translated_text=text,
                start=max(0.0, start),
                end=max(start + 0.1, end),
            )
        )
    return out


def segments_to_srt(segments: list[DubSegment]) -> str:
    def _ts(sec: float) -> str:
        ms = int(round(sec * 1000))
        h, rem = divmod(ms, 3_600_000)
        m, rem = divmod(rem, 60_000)
        s, milli = divmod(rem, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{milli:03d}"

    blocks: list[str] = []
    for i, seg in enumerate(segments, start=1):
        blocks.append(
            f"{i}\n{_ts(seg.start)} --> {_ts(seg.end)}\n{seg.translated_text}\n"
        )
    return "\n".join(blocks).strip() + "\n"
