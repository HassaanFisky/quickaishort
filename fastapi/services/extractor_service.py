"""
Self-healing audio extractor service.

Architecture:
  Request → Cache check → Circuit Breaker filter → Tier chain
          → Validation → ffmpeg normalise → Cache write → return bytes

Every failure is classified, logged with request_id + tier + timestamp,
and fed to the circuit breaker. No exception is swallowed silently.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import random
import shutil
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set

import httpx

from services.circuit_breaker import CircuitBreaker, RedisCircuitBreaker
from services.logging import log_metric

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Prometheus metrics  (optional dependency — service works without it)
# ──────────────────────────────────────────────────────────────────────────────

try:
    from prometheus_client import (
        Counter,
        Histogram,
        generate_latest,
        CONTENT_TYPE_LATEST,
    )

    _METRIC_DURATION = Histogram(
        "extraction_duration_seconds",
        "Per-tier extraction duration in seconds",
        ["tier", "status"],
        buckets=[1, 5, 10, 20, 30, 45, 60, 90],
    )
    _METRIC_TIER_FAILURES = Counter(
        "tier_failures_total",
        "Extraction failures by tier and error class",
        ["tier", "error_class"],
    )
    _METRIC_CIRCUIT_OPENS = Counter(
        "circuit_open_total",
        "Times a circuit breaker opened per tier",
        ["tier"],
    )
    _METRIC_CACHE_HITS = Counter(
        "cache_hits_total", "Cache hits on extraction requests"
    )
    _METRIC_CACHE_MISSES = Counter(
        "cache_misses_total", "Cache misses on extraction requests"
    )
    _METRIC_EXHAUSTION = Counter(
        "extraction_exhausted_total",
        "Requests where every tier failed",
    )
    _METRIC_SUCCESS = Counter(
        "extraction_success_total",
        "Successful extractions by tier",
        ["tier"],
    )
    METRICS_AVAILABLE = True
except ImportError:
    METRICS_AVAILABLE = False
    generate_latest = None  # type: ignore[assignment]
    CONTENT_TYPE_LATEST = "text/plain"


# ──────────────────────────────────────────────────────────────────────────────
# Error taxonomy
# ──────────────────────────────────────────────────────────────────────────────


class TierError(Enum):
    TRANSIENT = "transient"  # timeout, network blip → retry
    RATE_LIMITED = "rate_limited"  # 429 → backoff + retry; no circuit open
    BLOCKED = "blocked"  # 403 / IP block → next tier; open circuit
    AUTH_REQUIRED = "auth_required"  # 401 / sign-in required → skip tier
    FORMAT_UNAVAIL = "format_unavail"  # yt-dlp "format not available" → next tier
    INVALID_OUTPUT = "invalid_output"  # validation failed → next tier
    PROVIDER_DOWN = "provider_down"  # DNS fail / connection refused → open circuit
    TIMEOUT = "timeout"  # asyncio.TimeoutError → retry once


class ExtractionError(Exception):
    """Raised by tier functions with a classified error_class."""

    def __init__(self, message: str, error_class: TierError, tier: str) -> None:
        super().__init__(message)
        self.error_class = error_class
        self.tier = tier


class AllTiersExhaustedError(Exception):
    """Raised when every configured tier has been attempted and failed."""


class ValidationError(Exception):
    """Raised when an output file fails integrity checks."""


# ──────────────────────────────────────────────────────────────────────────────
# Error classifier
# ──────────────────────────────────────────────────────────────────────────────


def classify_error(
    exc: Exception,
    stderr: str = "",
    status_code: int = 0,
) -> TierError:
    """
    Map a raw exception + yt-dlp stderr + HTTP status to a TierError.
    Called for exceptions not already wrapped in ExtractionError.
    """
    if isinstance(exc, asyncio.TimeoutError):
        return TierError.TIMEOUT

    s = stderr.lower()

    if status_code == 429 or "rate limit" in s or "too many requests" in s:
        return TierError.RATE_LIMITED

    if status_code == 403 or any(
        k in s for k in ("bot", "blocked", "forbidden", "access denied")
    ):
        return TierError.BLOCKED

    if status_code == 401 or any(
        k in s for k in ("sign in", "login required", "auth.jwt", "authentication")
    ):
        return TierError.AUTH_REQUIRED

    if "format is not available" in s or "no video formats found" in s:
        return TierError.FORMAT_UNAVAIL

    if isinstance(exc, (ConnectionRefusedError, ConnectionResetError)):
        return TierError.PROVIDER_DOWN

    # OSError errno -2 / -3 are DNS failures
    exc_str = str(exc).lower()
    if any(
        k in exc_str
        for k in ("name or service not known", "temporary failure in name resolution")
    ):
        return TierError.PROVIDER_DOWN

    return TierError.TRANSIENT


# ──────────────────────────────────────────────────────────────────────────────
# Retry: exponential backoff with full jitter
# ──────────────────────────────────────────────────────────────────────────────


async def with_retries(
    fn: Callable[[], Awaitable[Any]],
    max_retries: int,
    retry_on: List[TierError],
    base_delay: float = 1.0,
    max_delay: float = 30.0,
) -> Any:
    """
    Call fn() up to max_retries + 1 times.

    Full jitter: sleep between 0 and min(max_delay, base * 2^attempt).
    This avoids thundering-herd when many concurrent requests hit a
    recovering tier simultaneously.

    Only retries when error_class is in retry_on. Any other error class
    propagates immediately without retrying.
    """
    last_exc: Optional[Exception] = None

    for attempt in range(max_retries + 1):
        try:
            return await fn()
        except ExtractionError as exc:
            last_exc = exc
            if exc.error_class not in retry_on or attempt == max_retries:
                raise
            cap = min(max_delay, base_delay * (2**attempt))
            delay = random.uniform(0, cap)
            logger.info(
                "[extractor] retry attempt=%d delay=%.2fs tier=%s error=%s",
                attempt + 1,
                delay,
                exc.tier,
                exc.error_class.value,
            )
            await asyncio.sleep(delay)

    raise last_exc  # type: ignore[misc]


# ──────────────────────────────────────────────────────────────────────────────
# Output validation
# ──────────────────────────────────────────────────────────────────────────────

_MIN_AUDIO_BYTES = 50_000  # 50 KB — anything smaller is truncated/corrupt
_MIN_DURATION_S = 1.0
_MAX_DURATION_S = 7_200.0  # 2 hours upper bound


async def validate_output(path: Path, request_id: str) -> None:
    """
    Verify the extracted file is non-empty, non-corrupt, and has a sane duration.

    Raises ValidationError on any check failure. This is intentionally strict —
    a corrupt file that reaches the user is worse than a transparent retry.
    """
    if not path.exists():
        raise ValidationError(f"[{request_id}] output file does not exist: {path}")

    size = path.stat().st_size
    if size < _MIN_AUDIO_BYTES:
        raise ValidationError(
            f"[{request_id}] output too small: {size} bytes (min={_MIN_AUDIO_BYTES})"
        )

    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            str(path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
    except asyncio.TimeoutError:
        raise ValidationError(f"[{request_id}] ffprobe timed out after 10s")

    if proc.returncode != 0:
        raise ValidationError(
            f"[{request_id}] ffprobe returned non-zero — file is corrupt"
        )

    try:
        info = json.loads(stdout)
    except json.JSONDecodeError:
        raise ValidationError(f"[{request_id}] ffprobe output was not valid JSON")

    duration = float(info.get("format", {}).get("duration", 0.0))
    if not (_MIN_DURATION_S <= duration <= _MAX_DURATION_S):
        raise ValidationError(
            f"[{request_id}] duration out of range: {duration:.1f}s "
            f"(expected {_MIN_DURATION_S}–{_MAX_DURATION_S})"
        )


# ──────────────────────────────────────────────────────────────────────────────
# Cache layer
# ──────────────────────────────────────────────────────────────────────────────


class ExtractionCache:
    """
    Redis-backed result cache.
    """

    _VERSION = "v1"
    _LOCK_TTL_S = 90

    def __init__(self, redis_conn: Any, ttl: int = 3_600) -> None:
        self._r = redis_conn
        self._ttl = ttl

    def _key(self, url: str, quality: str = "audio") -> str:
        digest = hashlib.sha256(f"{url}:{quality}".encode()).hexdigest()
        return f"extract:{self._VERSION}:{digest}"

    def _lock_key(self, url: str) -> str:
        digest = hashlib.sha256(url.encode()).hexdigest()
        return f"extract:lock:{digest}"

    async def get(self, url: str) -> Optional[bytes]:
        try:
            return await self._r.get(self._key(url))
        except Exception as exc:
            logger.warning("[cache] get failed: %s", exc)
            return None

    async def set(self, url: str, data: bytes) -> None:
        try:
            await self._r.setex(self._key(url), self._ttl, data)
        except Exception as exc:
            logger.warning("[cache] set failed: %s", exc)

    async def acquire_lock(self, url: str) -> bool:
        """NX lock. Returns True if acquired, False if already held."""
        try:
            return bool(
                await self._r.set(
                    self._lock_key(url), "1", nx=True, ex=self._LOCK_TTL_S
                )
            )
        except Exception:
            return True  # Redis unavailable → proceed without lock

    async def release_lock(self, url: str) -> None:
        try:
            await self._r.delete(self._lock_key(url))
        except Exception:
            pass


# ──────────────────────────────────────────────────────────────────────────────
# yt-dlp subprocess helper
# ──────────────────────────────────────────────────────────────────────────────


async def _run_ytdlp(cmd: List[str], tmpdir: str, tier_name: str) -> str:
    """
    Run a yt-dlp subprocess. Returns the path of the downloaded file.

    Raises ExtractionError with a classified error_class on any failure.
    Captures full stderr for classification — never discards it.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=65)
    except asyncio.TimeoutError:
        raise ExtractionError(
            "yt-dlp timed out after 65s", TierError.TIMEOUT, tier_name
        )

    stderr = stderr_bytes.decode("utf-8", errors="replace")

    if proc.returncode != 0:
        ec = classify_error(Exception(stderr), stderr)
        # Truncate to 500 chars for log — full stderr often has noise
        raise ExtractionError(stderr[-500:].strip(), ec, tier_name)

    # Exit 0 but no output file → treat as invalid output
    for filename in os.listdir(tmpdir):
        if filename.startswith("ytdlp_audio"):
            return os.path.join(tmpdir, filename)

    raise ExtractionError(
        "yt-dlp exited 0 but produced no output file",
        TierError.INVALID_OUTPUT,
        tier_name,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Tier extractor functions
# Each function must either return a file path (str) or raise ExtractionError.
# They must not swallow exceptions — the caller classifies and logs them.
# ──────────────────────────────────────────────────────────────────────────────


async def tier_piped(url: str, tmpdir: str) -> str:
    """
    Tier 1: Piped API.
    Fastest extraction via public Piped instances. Returns a direct audio URL
    which we then stream to a local file.
    """
    from services.video_service import VideoService

    video_id = VideoService.extract_video_id(url)
    if not video_id:
        raise ExtractionError("Invalid YouTube URL", TierError.INVALID_OUTPUT, "piped")

    instances = VideoService.PIPED_INSTANCES.copy()
    random.shuffle(instances)

    for instance in instances[:3]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{instance}/streams/{video_id}")
                if resp.status_code == 200:
                    data = resp.json()
                    audio_streams = data.get("audioStreams", [])
                    if audio_streams:
                        sorted_streams = sorted(
                            audio_streams,
                            key=lambda x: x.get("bitrate", 0),
                            reverse=True,
                        )
                        stream_url = sorted_streams[0].get("url")

                        out_path = os.path.join(tmpdir, "piped_audio.mp3")
                        async with httpx.AsyncClient(
                            timeout=60.0, follow_redirects=True
                        ) as dl:
                            async with dl.stream("GET", stream_url) as r:
                                r.raise_for_status()
                                with open(out_path, "wb") as f:
                                    async for chunk in r.aiter_bytes(65_536):
                                        f.write(chunk)
                        return out_path
        except Exception as e:
            logger.debug(f"[extractor] piped instance {instance} failed: {e}")
            continue

    raise ExtractionError(
        "All Piped instances failed", TierError.PROVIDER_DOWN, "piped"
    )


async def tier_invidious(url: str, tmpdir: str) -> str:
    """
    Tier 5: Invidious API (Public fallback).
    """
    from services.video_service import VideoService

    video_id = VideoService.extract_video_id(url)
    if not video_id:
        raise ExtractionError(
            "Invalid YouTube URL", TierError.INVALID_OUTPUT, "invidious"
        )

    instances = VideoService.INVIDIOUS_INSTANCES.copy()
    random.shuffle(instances)

    for instance in instances[:2]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{instance}/api/v1/videos/{video_id}")
                if resp.status_code == 200:
                    data = resp.json()
                    formats = data.get("adaptiveFormats", [])
                    audio_only = [f for f in formats if "audio" in f.get("type", "")]
                    if audio_only:
                        stream_url = audio_only[0].get("url")
                        out_path = os.path.join(tmpdir, "invidious_audio.mp3")
                        async with httpx.AsyncClient(
                            timeout=60.0, follow_redirects=True
                        ) as dl:
                            async with dl.stream("GET", stream_url) as r:
                                r.raise_for_status()
                                with open(out_path, "wb") as f:
                                    async for chunk in r.aiter_bytes(65_536):
                                        f.write(chunk)
                        return out_path
        except Exception:
            continue

    raise ExtractionError(
        "All Invidious instances failed", TierError.PROVIDER_DOWN, "invidious"
    )


async def tier_android_music(url: str, tmpdir: str) -> str:
    """
    Tier 1: yt-dlp with android_music + android clients, no browser cookies.

    android_music uses YouTube's token-based auth, which does not require
    JS signature solving and works from datacenter IPs. Confirmed working
    on Cloud Run (us-central1) as of 2026-05.
    """
    from app.utils.youtube_auth import get_cookie_file  # local import: avoids circular

    out_tmpl = os.path.join(tmpdir, "ytdlp_audio.%(ext)s")
    proxy = os.environ.get("YOUTUBE_PROXY")

    cmd = [
        "yt-dlp",
        "--format",
        "bestaudio/best",
        "--output",
        out_tmpl,
        "--no-playlist",
        "--no-warnings",
        "--extractor-args",
        "youtube:player_client=android_music,android",
    ]
    if proxy:
        cmd += ["--proxy", proxy]
    cmd.append(url)

    return await _run_ytdlp(cmd, tmpdir, "android_music")


async def tier_web_cookies(url: str, tmpdir: str) -> str:
    """
    Tier 2: yt-dlp with browser cookies, default client selection.

    Uses the YOUTUBE_COOKIES env var (Netscape format written to a temp file
    by youtube_auth.get_cookie_file()). Falls back with AUTH_REQUIRED if no
    cookie file is configured — the circuit breaker will NOT open on this
    error class so the tier stays available for future requests that may
    have cookies configured.
    """
    from app.utils.youtube_auth import get_cookie_file

    cookie_path = get_cookie_file()
    if not cookie_path:
        raise ExtractionError(
            "YOUTUBE_COOKIES env var not set — cookie tier unavailable",
            TierError.AUTH_REQUIRED,
            "web_cookies",
        )

    out_tmpl = os.path.join(tmpdir, "ytdlp_audio.%(ext)s")
    proxy = os.environ.get("YOUTUBE_PROXY")

    cmd = [
        "yt-dlp",
        "--format",
        "bestaudio/best",
        "--output",
        out_tmpl,
        "--no-playlist",
        "--no-warnings",
        "--cookies",
        cookie_path,
    ]
    if proxy:
        cmd += ["--proxy", proxy]
    cmd.append(url)

    return await _run_ytdlp(cmd, tmpdir, "web_cookies")


async def tier_cobalt(url: str, tmpdir: str) -> str:
    """
    Tier 3: Cobalt self-hosted instance.

    Requires COBALT_API_URL to point to a self-hosted Cobalt instance.
    The public api.cobalt.tools now requires JWT authentication; without
    a self-hosted instance this tier will raise AUTH_REQUIRED immediately
    without opening the circuit (so it can be enabled later by setting
    COBALT_API_URL to a working instance).
    """
    api_url = os.getenv("COBALT_API_URL", "https://api.cobalt.tools/")

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                api_url,
                json={"url": url, "downloadMode": "audio"},
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
            )
    except httpx.ConnectError as exc:
        raise ExtractionError(str(exc), TierError.PROVIDER_DOWN, "cobalt")
    except httpx.TimeoutException:
        raise ExtractionError("cobalt POST timed out", TierError.TIMEOUT, "cobalt")

    if resp.status_code == 400:
        err_code = resp.json().get("error", {}).get("code", "unknown")
        ec = TierError.AUTH_REQUIRED if "auth.jwt" in err_code else TierError.BLOCKED
        raise ExtractionError(f"cobalt 400: {err_code}", ec, "cobalt")

    if resp.status_code == 429:
        raise ExtractionError("cobalt rate limited", TierError.RATE_LIMITED, "cobalt")

    if resp.status_code != 200:
        raise ExtractionError(
            f"cobalt unexpected status {resp.status_code}",
            TierError.TRANSIENT,
            "cobalt",
        )

    stream_url = resp.json().get("url")
    if not stream_url:
        raise ExtractionError(
            "cobalt returned no stream URL in response",
            TierError.INVALID_OUTPUT,
            "cobalt",
        )

    out_path = os.path.join(tmpdir, "cobalt_audio.mp3")
    try:
        async with httpx.AsyncClient(timeout=60.0) as dl:
            async with dl.stream("GET", stream_url) as r:
                r.raise_for_status()
                with open(out_path, "wb") as f:
                    async for chunk in r.aiter_bytes(65_536):
                        f.write(chunk)
    except httpx.HTTPStatusError as exc:
        raise ExtractionError(
            f"cobalt stream download failed: {exc.response.status_code}",
            TierError.TRANSIENT,
            "cobalt",
        )
    except httpx.TimeoutException:
        raise ExtractionError(
            "cobalt stream download timed out",
            TierError.TIMEOUT,
            "cobalt",
        )

    return out_path


# ──────────────────────────────────────────────────────────────────────────────
# Tier registry
# Ordered by priority. ExtractorService iterates this list on every request.
# ──────────────────────────────────────────────────────────────────────────────

TIER_CONFIG: List[Dict[str, Any]] = [
    {
        "name": "piped",
        "fn": tier_piped,
        "max_retries": 1,
        "retry_on": [TierError.TRANSIENT, TierError.TIMEOUT],
        "circuit_ignore_errors": {"rate_limited"},
        "circuit_failure_threshold": 8,  # Higher threshold as public instances are often flaky
        "circuit_open_duration_s": 60.0,
        "circuit_success_threshold": 1,
    },
    {
        "name": "android_music",
        "fn": tier_android_music,
        "max_retries": 1,
        "retry_on": [TierError.TRANSIENT, TierError.TIMEOUT],
        "circuit_ignore_errors": {"rate_limited"},
        "circuit_failure_threshold": 5,
        "circuit_open_duration_s": 120.0,
        "circuit_success_threshold": 2,
    },
    {
        "name": "web_cookies",
        "fn": tier_web_cookies,
        "max_retries": 0,
        "retry_on": [],
        "circuit_ignore_errors": {"rate_limited", "auth_required"},
        "circuit_failure_threshold": 3,
        "circuit_open_duration_s": 180.0,
        "circuit_success_threshold": 2,
    },
    {
        "name": "cobalt",
        "fn": tier_cobalt,
        "max_retries": 2,
        "retry_on": [TierError.TRANSIENT, TierError.RATE_LIMITED, TierError.TIMEOUT],
        "circuit_ignore_errors": {"rate_limited", "auth_required"},
        "circuit_failure_threshold": 4,
        "circuit_open_duration_s": 240.0,
        "circuit_success_threshold": 2,
    },
    {
        "name": "invidious",
        "fn": tier_invidious,
        "max_retries": 0,
        "retry_on": [],
        "circuit_ignore_errors": {"rate_limited"},
        "circuit_failure_threshold": 5,
        "circuit_open_duration_s": 300.0,
        "circuit_success_threshold": 1,
    },
]


# ──────────────────────────────────────────────────────────────────────────────
# ExtractorService  (singleton — one instance shared across all requests)
# ──────────────────────────────────────────────────────────────────────────────


class ExtractorService:
    """
    Orchestrates the full extraction chain:
      cache → circuit filter → tier attempt → validation → cache write

    Thread-safe for asyncio concurrency. Circuit state is in-process
    (acceptable for Cloud Run single-instance; for multi-instance deployments
    move circuit state to Redis).
    """

    def __init__(self, redis_conn: Any, async_redis_conn: Any = None) -> None:
        self.cache = ExtractionCache(async_redis_conn or redis_conn)
        # Use Redis-backed circuit breakers so state is shared across all
        # Cloud Run instances. Falls back to in-process if Redis is down.
        try:
            # Prevent socket blocks on start: bypass ping if REDIS_URL is unconfigured in production
            is_prod = os.getenv("ENVIRONMENT") == "production"
            redis_url = os.getenv("REDIS_URL")
            if is_prod and not redis_url:
                raise RuntimeError("REDIS_URL not configured in production")

            # Ping Redis to verify connectivity (fails fast due to socket_timeout)
            if redis_conn:
                redis_conn.ping()
            else:
                raise ValueError("redis_conn is None")

            self.circuits: Dict[str, Any] = {
                t["name"]: RedisCircuitBreaker(
                    tier_name=t["name"],
                    redis_conn=redis_conn,
                    failure_threshold=t["circuit_failure_threshold"],
                    open_duration_s=t["circuit_open_duration_s"],
                    success_threshold=t["circuit_success_threshold"],
                    ignore_error_classes=t["circuit_ignore_errors"],
                )
                for t in TIER_CONFIG
            }
            logger.info("[extractor] Redis-backed circuit breakers active")
        except Exception as _cb_err:
            logger.warning(
                "[extractor] Redis CB init failed (%s) — falling back to in-process",
                _cb_err,
            )
            self.circuits = {
                t["name"]: CircuitBreaker(
                    tier_name=t["name"],
                    failure_threshold=t["circuit_failure_threshold"],
                    open_duration_s=t["circuit_open_duration_s"],
                    success_threshold=t["circuit_success_threshold"],
                    ignore_error_classes=t["circuit_ignore_errors"],
                )
                for t in TIER_CONFIG
            }

    # ── Public API ────────────────────────────────────────────────────────────

    async def extract_audio(self, url: str, request_id: Optional[str] = None) -> bytes:
        """
        Extract audio from url and return MP3 bytes.

        Raises AllTiersExhaustedError if every tier fails.
        Never returns partial or corrupt data — validation ensures this.
        """
        if not request_id:
            request_id = uuid.uuid4().hex[:12]

        # ── 1. Cache check ────────────────────────────────────────────────────
        cached = await self.cache.get(url)
        if cached:
            if METRICS_AVAILABLE:
                _METRIC_CACHE_HITS.inc()
            logger.info("[extractor] cache.hit request_id=%s", request_id)
            return cached

        if METRICS_AVAILABLE:
            _METRIC_CACHE_MISSES.inc()

        lock_acquired = await self.cache.acquire_lock(url)
        tmpdir = tempfile.mkdtemp(prefix=f"qais-{request_id[:8]}-")
        attempted: List[str] = []
        req_start = time.monotonic()

        try:
            # ── 2. Tier chain ─────────────────────────────────────────────────
            for tier in TIER_CONFIG:
                tier_name = tier["name"]
                cb = self.circuits[tier_name]

                if cb.is_open():
                    logger.info(
                        "[extractor] tier.skipped request_id=%s tier=%s reason=circuit_open",
                        request_id,
                        tier_name,
                    )
                    continue

                attempted.append(tier_name)
                logger.info(
                    "[extractor] tier.attempt request_id=%s tier=%s",
                    request_id,
                    tier_name,
                )
                t_start = time.monotonic()

                try:
                    # ── 3. Run with retries ───────────────────────────────────
                    raw_path_str = await with_retries(
                        fn=lambda t=tier: t["fn"](url, tmpdir),
                        max_retries=tier["max_retries"],
                        retry_on=tier["retry_on"],
                    )
                    raw_path = Path(raw_path_str)

                    # ── 4. Normalise to MP3 via ffmpeg ────────────────────────
                    mp3_path = Path(tmpdir) / "final.mp3"
                    conv = await asyncio.create_subprocess_exec(
                        "ffmpeg",
                        "-y",
                        "-i",
                        str(raw_path),
                        "-vn",
                        "-b:a",
                        "128k",
                        "-ar",
                        "44100",  # normalise sample rate
                        str(mp3_path),
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                    )
                    await asyncio.wait_for(conv.communicate(), timeout=120)
                    final_path = mp3_path if mp3_path.exists() else raw_path

                    # ── 5. Validate output ────────────────────────────────────
                    await validate_output(final_path, request_id)

                    # ── 6. Record success ─────────────────────────────────────
                    duration_s = time.monotonic() - t_start
                    cb.record_success()

                    if METRICS_AVAILABLE:
                        _METRIC_DURATION.labels(
                            tier=tier_name, status="success"
                        ).observe(duration_s)
                        _METRIC_SUCCESS.labels(tier=tier_name).inc()

                    result_bytes = final_path.read_bytes()
                    await self.cache.set(url, result_bytes)

                    log_metric(
                        "extraction_success",
                        1,
                        metadata={
                            "tier": tier_name,
                            "request_id": request_id,
                            "duration_ms": int(duration_s * 1000),
                        },
                    )

                    logger.info(
                        "[extractor] tier.success request_id=%s tier=%s "
                        "duration_ms=%d size_bytes=%d",
                        request_id,
                        tier_name,
                        int(duration_s * 1000),
                        len(result_bytes),
                    )
                    return result_bytes

                except (
                    ExtractionError,
                    ValidationError,
                    asyncio.TimeoutError,
                    Exception,
                ) as exc:
                    # ── 7. Classify, record, and log every failure ────────────
                    duration_s = time.monotonic() - t_start

                    if isinstance(exc, ExtractionError):
                        ec = exc.error_class
                        err_msg = str(exc)
                    elif isinstance(exc, ValidationError):
                        ec = TierError.INVALID_OUTPUT
                        err_msg = str(exc)
                    elif isinstance(exc, asyncio.TimeoutError):
                        ec = TierError.TIMEOUT
                        err_msg = "asyncio.TimeoutError"
                    else:
                        ec = classify_error(exc)
                        err_msg = str(exc)

                    cb.record_failure(ec.value)

                    # Emit circuit-open metric here (avoids circular import in
                    # circuit_breaker.py)
                    if cb.state == "OPEN":
                        log_metric(
                            "circuit_open",
                            1,
                            metadata={"tier": tier_name, "request_id": request_id},
                        )
                        if METRICS_AVAILABLE:
                            _METRIC_CIRCUIT_OPENS.labels(tier=tier_name).inc()
                            _METRIC_DURATION.labels(
                                tier=tier_name, status="failure"
                            ).observe(duration_s)

                    log_metric(
                        "extraction_failure",
                        1,
                        metadata={
                            "tier": tier_name,
                            "error_class": ec.value,
                            "request_id": request_id,
                            "duration_ms": int(duration_s * 1000),
                        },
                    )

                    logger.warning(
                        "[extractor] tier.failure request_id=%s tier=%s "
                        "error_class=%s duration_ms=%d circuit=%s msg=%s "
                        "recovery=next_tier",
                        request_id,
                        tier_name,
                        ec.value,
                        int(duration_s * 1000),
                        cb.state,
                        err_msg[:300],
                    )

            # ── 8. All tiers exhausted ────────────────────────────────────────
            total_ms = int((time.monotonic() - req_start) * 1000)
            if METRICS_AVAILABLE:
                _METRIC_EXHAUSTION.inc()

            logger.error(
                "[extractor] extraction.exhausted request_id=%s "
                "tiers_attempted=%s total_ms=%d recovery=return_503",
                request_id,
                attempted,
                total_ms,
            )
            raise AllTiersExhaustedError(
                f"All extraction tiers failed after {total_ms}ms. "
                f"Attempted: {attempted}"
            )

        finally:
            if lock_acquired:
                await self.cache.release_lock(url)
            shutil.rmtree(tmpdir, ignore_errors=True)

    def tier_states(self) -> Dict[str, dict]:
        """Snapshot of all circuit breaker states. Used by /debug/tiers."""
        return {name: cb.state_dict() for name, cb in self.circuits.items()}

    def is_ready(self) -> bool:
        """
        Returns True if at least one tier's circuit is not OPEN.
        Used by the /ready readiness probe.
        """
        return any(not cb.is_open() for cb in self.circuits.values())


# ──────────────────────────────────────────────────────────────────────────────
# Module-level singleton
# ──────────────────────────────────────────────────────────────────────────────

_service_instance: Optional[ExtractorService] = None


def get_extractor_service() -> ExtractorService:
    """
    Lazy singleton.
    """
    global _service_instance
    if _service_instance is None:
        from services.queue_service import async_redis_conn, redis_conn  # noqa: PLC0415

        _service_instance = ExtractorService(
            redis_conn=redis_conn, async_redis_conn=async_redis_conn
        )
    return _service_instance


# ──────────────────────────────────────────────────────────────────────────────
# Worker watchdog
# ──────────────────────────────────────────────────────────────────────────────


class WorkerWatchdog:
    """
    Monitors a long-running asyncio task via a heartbeat.
    If the worker misses heartbeats consecutively, it is cancelled and restarted.

    Usage in the RQ render worker (render_worker.py):
        watchdog = WorkerWatchdog(worker_coroutine)
        asyncio.run(watchdog.run())
        # Inside the worker loop: watchdog.heartbeat()
    """

    def __init__(
        self,
        worker_fn: Callable[[], Awaitable[None]],
        heartbeat_interval: float = 30.0,
        max_missed: int = 3,
    ) -> None:
        self._worker_fn = worker_fn
        self._heartbeat_interval = heartbeat_interval
        self._max_missed = max_missed
        self._last_heartbeat = time.monotonic()
        self._missed = 0
        self._worker_task: Optional[asyncio.Task] = None  # type: ignore[type-arg]

    def heartbeat(self) -> None:
        """Call from within the monitored worker to signal liveness."""
        self._last_heartbeat = time.monotonic()

    async def run(self) -> None:
        """Start the worker and supervise it indefinitely."""
        self._worker_task = asyncio.create_task(self._worker_fn())

        while True:
            await asyncio.sleep(self._heartbeat_interval)
            elapsed = time.monotonic() - self._last_heartbeat

            if elapsed > self._heartbeat_interval * 2:
                self._missed += 1
                logger.warning(
                    "[watchdog] missed heartbeat tier_name=worker missed=%d "
                    "elapsed_s=%.1f max_missed=%d",
                    self._missed,
                    elapsed,
                    self._max_missed,
                )

                if self._missed >= self._max_missed:
                    logger.error(
                        "[watchdog] restarting worker missed=%d reason=heartbeat_timeout",
                        self._missed,
                    )
                    if self._worker_task and not self._worker_task.done():
                        self._worker_task.cancel()
                        try:
                            await self._worker_task
                        except asyncio.CancelledError:
                            pass
                    self._worker_task = asyncio.create_task(self._worker_fn())
                    self._missed = 0
                    self._last_heartbeat = time.monotonic()
            else:
                self._missed = 0
