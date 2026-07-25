"""Dub Video orchestration — Redis job state, cache, translate, TTS, align."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from models.dub import (
    DUB_CREDIT_CAPTIONS,
    DUB_CREDIT_FULL,
    DUB_JOB_TTL_SECONDS,
    DubJobCreateRequest,
    DubJobStatus,
    DubMode,
    DubSegment,
    DubStage,
    DubTaskPayload,
)
from services.dub_align import concat_segment_files, fit_segment_audio, mark_timing_adjusted
from services.dub_translate import (
    segments_to_srt,
    translate_segments,
    translation_cache_key,
)
from services.dub_voices import resolve_voice_id

logger = logging.getLogger(__name__)

_JOB_KEY = "dub:job:{}"
_FINGERPRINT_KEY = "dub:fp:{}"
_CANCEL_KEY = "dub:cancel:{}"
_TX_CACHE_KEY = "dub:txcache:{}"


def credit_cost_for_mode(mode: DubMode) -> int:
    if mode == "captions_only":
        return DUB_CREDIT_CAPTIONS
    return DUB_CREDIT_FULL


def compute_fingerprint(
    req: DubJobCreateRequest, voice_id: str
) -> str:
    payload = {
        "chunks": [
            {"t": c.text, "s": round(c.start, 3), "e": round(c.end, 3)}
            for c in req.transcript
        ],
        "lang": req.target_lang,
        "mode": req.mode,
        "voice": voice_id,
        "src_fp": req.source_fingerprint or "",
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _redis():
    from services.queue_service import redis_conn

    return redis_conn


def _job_key(job_id: str) -> str:
    return _JOB_KEY.format(job_id)


def save_job(status: DubJobStatus) -> None:
    r = _redis()
    r.setex(
        _job_key(status.job_id),
        DUB_JOB_TTL_SECONDS,
        status.model_dump_json(),
    )


def load_job(job_id: str) -> Optional[DubJobStatus]:
    raw = _redis().get(_job_key(job_id))
    if not raw:
        return None
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode()
    try:
        return DubJobStatus.model_validate_json(raw)
    except Exception:
        logger.exception("dub_job_parse_failed job_id=%s", job_id)
        return None


def mark_cancelled(job_id: str) -> None:
    _redis().setex(_CANCEL_KEY.format(job_id), DUB_JOB_TTL_SECONDS, "1")


def is_cancelled(job_id: str) -> bool:
    return bool(_redis().get(_CANCEL_KEY.format(job_id)))


def _update(
    job: DubJobStatus,
    *,
    status: DubStage | None = None,
    progress: float | None = None,
    message: str | None = None,
    **fields: Any,
) -> DubJobStatus:
    data = job.model_dump()
    if status is not None:
        data["status"] = status
    if progress is not None:
        data["progress"] = max(0.0, min(100.0, float(progress)))
    if message is not None:
        data["message"] = message
    data.update(fields)
    data["updated_at"] = time.time()
    updated = DubJobStatus.model_validate(data)
    save_job(updated)
    return updated


def _load_tx_cache(key: str) -> list[DubSegment] | None:
    raw = _redis().get(_TX_CACHE_KEY.format(key))
    if not raw:
        return None
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode()
    try:
        rows = json.loads(raw)
        return [DubSegment.model_validate(row) for row in rows]
    except Exception:
        return None


def _save_tx_cache(key: str, segments: list[DubSegment]) -> None:
    _redis().setex(
        _TX_CACHE_KEY.format(key),
        DUB_JOB_TTL_SECONDS,
        json.dumps([s.model_dump() for s in segments], ensure_ascii=False),
    )


async def _signed_get_url(remote_path: str) -> Optional[str]:
    try:
        from services.storage_service import get_storage_service
        from services.db import get_gcs_bucket, is_ready
        import datetime
        import google.auth
        import google.auth.transport.requests

        if not is_ready():
            return None
        storage = get_storage_service()
        blob = storage._blob(remote_path)
        credentials, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        auth_req = google.auth.transport.requests.Request()
        await asyncio.to_thread(credentials.refresh, auth_req)
        sa_email: str = getattr(credentials, "service_account_email", "") or os.environ.get(
            "GOOGLE_SERVICE_ACCOUNT_EMAIL", ""
        )
        if not sa_email:
            return None
        url = await asyncio.to_thread(
            blob.generate_signed_url,
            version="v4",
            expiration=datetime.timedelta(minutes=60),
            method="GET",
            service_account_email=sa_email,
            access_token=getattr(credentials, "token", None),
        )
        _ = get_gcs_bucket  # keep import used for readiness side-effects
        return url
    except Exception as exc:
        logger.warning("dub_signed_url_failed path=%s error=%s", remote_path, exc)
        return None


async def create_job(
    req: DubJobCreateRequest, user_id: str
) -> DubJobStatus:
    voice_id = resolve_voice_id(req.target_lang, req.voice_id)
    fingerprint = compute_fingerprint(req, voice_id)

    # Idempotent reuse of completed job for same fingerprint+user
    existing_id = _redis().get(_FINGERPRINT_KEY.format(f"{user_id}:{fingerprint}"))
    if existing_id:
        if isinstance(existing_id, (bytes, bytearray)):
            existing_id = existing_id.decode()
        existing = load_job(str(existing_id))
        if existing and existing.status in {"ready", "degraded"}:
            return existing.model_copy(update={"cache_hit": True})

    now = time.time()
    job = DubJobStatus(
        job_id=uuid.uuid4().hex,
        user_id=user_id,
        status="queued",
        mode=req.mode,
        target_lang=req.target_lang,
        voice_id=voice_id,
        progress=0,
        message="Queued",
        fingerprint=fingerprint,
        mute_source_audio=req.mode in {"full_dub", "voiceover_only"},
        created_at=now,
        updated_at=now,
    )
    save_job(job)
    _redis().setex(
        _FINGERPRINT_KEY.format(f"{user_id}:{fingerprint}"),
        DUB_JOB_TTL_SECONDS,
        job.job_id,
    )
    # Persist request body for worker resume
    _redis().setex(
        f"dub:req:{job.job_id}",
        DUB_JOB_TTL_SECONDS,
        req.model_dump_json(),
    )
    return job


def load_request(job_id: str) -> Optional[DubJobCreateRequest]:
    raw = _redis().get(f"dub:req:{job_id}")
    if not raw:
        return None
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode()
    try:
        return DubJobCreateRequest.model_validate_json(raw)
    except Exception:
        return None


async def run_translate_stage(job: DubJobStatus, req: DubJobCreateRequest) -> DubJobStatus:
    if is_cancelled(job.job_id):
        return _update(job, status="cancelled", message="Cancelled", progress=100)

    job = _update(job, status="translating", progress=10, message="Translating speech")
    tx_key = translation_cache_key(req.transcript, req.target_lang)
    cached = _load_tx_cache(tx_key)
    if cached:
        segments = cached
        logger.info("dub_translate_cache_hit job_id=%s", job.job_id)
    else:
        segments = await translate_segments(req.transcript, req.target_lang)
        _save_tx_cache(tx_key, segments)

    srt = segments_to_srt(segments)
    return _update(
        job,
        progress=40,
        message="Translation ready",
        segments=segments,
        translated_srt=srt,
    )


async def run_synthesize_and_align(job: DubJobStatus) -> DubJobStatus:
    """TTS each segment, align to window, concat to GCS vo.mp3."""

    if is_cancelled(job.job_id):
        return _update(job, status="cancelled", message="Cancelled", progress=100)

    if job.mode == "captions_only":
        return _update(
            job,
            status="ready",
            progress=100,
            message="Translated captions ready",
            mute_source_audio=False,
        )

    from services.tts_service import get_tts_service

    tts = get_tts_service()
    if not tts.google_api_key and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        # API key path is primary for tts_service; missing key → degrade
        if not tts.google_api_key:
            return _update(
                job,
                status="degraded",
                progress=100,
                message="Voice unavailable — subtitles ready",
                fallback_reason="tts_unavailable",
                mute_source_audio=False,
            )

    job = _update(job, status="synthesizing", progress=50, message="Generating voice")
    work = Path(tempfile.mkdtemp(prefix="qai-dub-"))
    fitted_paths: list[Path] = []
    fitted_flags: list[bool] = []
    failed = 0

    try:
        for i, seg in enumerate(job.segments):
            if is_cancelled(job.job_id):
                return _update(job, status="cancelled", message="Cancelled", progress=100)

            uri = await tts.generate(
                seg.translated_text,
                voice_id=job.voice_id,
                provider="google",
                speaking_rate=1.0,
            )
            if not uri:
                failed += 1
                fitted_flags.append(False)
                continue

            raw_mp3 = work / f"raw_{i}.mp3"
            from services.storage_service import get_storage_service

            storage = get_storage_service()
            ok = storage.download_gcs_file(uri, raw_mp3)
            if not ok and uri.startswith("gridfs://"):
                ok = storage.download_file(
                    uri[len("gridfs://") :], raw_mp3, _bucket_name="uploads"
                )
            if not ok or not raw_mp3.exists():
                failed += 1
                fitted_flags.append(False)
                continue

            target_dur = max(0.15, seg.end - seg.start)
            fitted = work / f"fit_{i}.mp3"
            aligned = fit_segment_audio(raw_mp3, target_dur, fitted)
            if not aligned:
                # fall back to raw clip
                fitted.write_bytes(raw_mp3.read_bytes())
                aligned = True
            fitted_paths.append(fitted)
            fitted_flags.append(aligned)
            pct = 50 + int(35 * (i + 1) / max(1, len(job.segments)))
            job = _update(
                job,
                progress=pct,
                message=f"Synthesizing voice ({i + 1}/{len(job.segments)})",
            )

        fail_ratio = failed / max(1, len(job.segments))
        if fail_ratio > 0.3 or not fitted_paths:
            return _update(
                job,
                status="degraded",
                progress=100,
                message="Voice unavailable — subtitles ready",
                fallback_reason="tts_partial_failure",
                mute_source_audio=False,
                segments=mark_timing_adjusted(job.segments, fitted_flags)
                if fitted_flags
                else job.segments,
            )

        job = _update(job, status="aligning", progress=88, message="Aligning timing")
        out_mp3 = work / "vo.mp3"
        if not concat_segment_files(fitted_paths, out_mp3):
            return _update(
                job,
                status="degraded",
                progress=100,
                message="Voice merge failed — subtitles ready",
                fallback_reason="align_concat_failed",
                mute_source_audio=False,
            )

        remote = f"dubs/{job.user_id}/{job.job_id}/vo.mp3"
        from services.storage_service import get_storage_service

        storage = get_storage_service()
        gs_uri = await storage.upload_file_async(
            out_mp3, remote, content_type="audio/mpeg", _bucket_name="uploads"
        )
        preview = await _signed_get_url(remote)
        segments = mark_timing_adjusted(job.segments, fitted_flags)

        job = _update(
            job,
            status="subtitling",
            progress=95,
            message="Preparing subtitles",
            segments=segments,
            dub_audio_uri=gs_uri,
            preview_audio_url=preview,
            mute_source_audio=True,
        )
        return _update(
            job,
            status="ready",
            progress=100,
            message="Dub ready",
        )
    finally:
        import shutil

        shutil.rmtree(work, ignore_errors=True)


async def process_dub_job(job_id: str) -> DubJobStatus:
    job = load_job(job_id)
    if job is None:
        raise RuntimeError(f"dub_job_not_found:{job_id}")
    if job.status in {"ready", "degraded", "failed", "cancelled"}:
        return job

    req = load_request(job_id)
    if req is None:
        return _update(
            job, status="failed", progress=100, message="Missing request", error="request_missing"
        )

    try:
        job = await run_translate_stage(job, req)
        if job.status in {"cancelled", "failed"}:
            return job
        job = await run_synthesize_and_align(job)
        return job
    except Exception as exc:
        logger.exception("dub_job_failed job_id=%s", job_id)
        job = load_job(job_id) or job
        return _update(
            job,
            status="failed",
            progress=100,
            message="Dub failed",
            error=str(exc)[:500],
        )


async def dispatch_dub_processing(job_id: str, user_id: str, run_id: str = "") -> None:
    """Wake worker via Cloud Tasks when configured; otherwise inline process."""

    mode = os.environ.get("RENDER_DISPATCH_MODE", "").strip().lower()
    if not mode:
        mode = (
            "cloud_tasks"
            if os.environ.get("ENVIRONMENT", "").lower() == "production"
            else "rq"
        )

    if mode == "cloud_tasks" and os.environ.get("CLOUD_TASKS_RENDER_URL"):
        try:
            from services.render_dispatch import dispatch_dub_task

            await dispatch_dub_task(
                DubTaskPayload(job_id=job_id, user_id=user_id, run_id=run_id or "")
            )
            return
        except Exception as exc:
            logger.warning(
                "dub_cloud_tasks_dispatch_failed job_id=%s error=%s — inline fallback",
                job_id,
                exc,
            )

    # Dev / fallback: process inline (same process)
    await process_dub_job(job_id)
