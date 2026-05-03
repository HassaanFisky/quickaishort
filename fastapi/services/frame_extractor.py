"""Sample keyframes from a video clip for vision-grounded scoring.

Used by the viral agent's ScoringAgent to evaluate `visualEnergy` and
`cameraMovement` from real frames — not just transcript text.

Caching: frames are stored under tempfile.gettempdir()/qais-frames/<hash>.
The cache key is a SHA-1 of (video_id, start_sec, end_sec, frames). Re-runs
are O(disk) instead of O(re-download + re-decode).
"""

from __future__ import annotations

import hashlib
import logging
import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import ffmpeg
import yt_dlp

logger = logging.getLogger(__name__)

FRAMES_PER_CLIP_DEFAULT = 5
FRAME_MAX_DIMENSION = 512


@dataclass
class ExtractedFrame:
    index: int
    timestamp_sec: float
    data: bytes  # JPEG bytes


def _cache_dir() -> Path:
    base = Path(tempfile.gettempdir()) / "qais-frames"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _cache_key(video_id: str, start: float, end: float, frames: int) -> str:
    raw = f"{video_id}|{start:.3f}|{end:.3f}|{frames}".encode("utf-8")
    return hashlib.sha1(raw).hexdigest()


def _read_cached(cache_path: Path) -> Optional[list[ExtractedFrame]]:
    if not cache_path.exists():
        return None
    out: list[ExtractedFrame] = []
    for f in sorted(cache_path.glob("frame_*.jpg")):
        try:
            idx_str, ts_str = f.stem.replace("frame_", "").split("_")
            out.append(
                ExtractedFrame(
                    index=int(idx_str),
                    timestamp_sec=float(ts_str),
                    data=f.read_bytes(),
                )
            )
        except Exception:
            continue
    return out or None


def extract_clip_frames(
    video_id: str,
    start_sec: float,
    end_sec: float,
    *,
    frames: int = FRAMES_PER_CLIP_DEFAULT,
) -> list[ExtractedFrame]:
    """Download the clip segment via yt-dlp (worst quality is fine for vision)
    and sample `frames` evenly-spaced JPEGs. Cached on disk.
    """
    if end_sec <= start_sec:
        return []
    if frames <= 0:
        return []

    cache_path = _cache_dir() / _cache_key(video_id, start_sec, end_sec, frames)
    cached = _read_cached(cache_path)
    if cached is not None:
        return cached

    workdir = Path(tempfile.mkdtemp(prefix="qais-frame-"))
    try:
        downloaded = _download_segment(video_id, start_sec, end_sec, workdir)
        cache_path.mkdir(parents=True, exist_ok=True)
        out: list[ExtractedFrame] = []
        duration = max(end_sec - start_sec, 0.001)
        offsets = (
            [duration / 2.0]
            if frames == 1
            else [duration * (i + 1) / (frames + 1) for i in range(frames)]
        )

        for idx, offset in enumerate(offsets):
            frame_path = cache_path / f"frame_{idx}_{offset:.3f}.jpg"
            try:
                (
                    ffmpeg.input(str(downloaded), ss=offset)
                    .filter("scale", FRAME_MAX_DIMENSION, -2)
                    .output(str(frame_path), vframes=1, format="image2", vcodec="mjpeg")
                    .overwrite_output()
                    .run(quiet=True)
                )
            except ffmpeg.Error as exc:
                stderr = (exc.stderr or b"").decode("utf-8", errors="replace")
                logger.warning("Frame extract %d failed: %s", idx, stderr[-500:])
                continue
            if frame_path.exists():
                out.append(
                    ExtractedFrame(
                        index=idx,
                        timestamp_sec=offset,
                        data=frame_path.read_bytes(),
                    )
                )
        return out
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _download_segment(video_id: str, start: float, end: float, workdir: Path) -> Path:
    template = str(workdir / f"src_{video_id}.%(ext)s")
    ydl_opts = {
        # Lowest reasonable quality — we only need frames for vision scoring.
        "format": "worstvideo[ext=mp4]+worstaudio[ext=m4a]/worst[ext=mp4]/worst",
        "download_ranges": yt_dlp.utils.download_range_func(None, [(start, end)]),
        "outtmpl": template,
        "quiet": True,
        "no_warnings": True,
        "force_keyframes_at_cuts": True,
        "merge_output_format": "mp4",
        "extractor_args": {"youtube": {"player_client": ["android", "ios"]}},
        "nocheckcertificate": True,
    }
    youtube_url = f"https://www.youtube.com/watch?v={video_id}"
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(youtube_url, download=True)
        path = Path(ydl.prepare_filename(info))
    if path.suffix != ".mp4":
        candidate = path.with_suffix(".mp4")
        if candidate.exists():
            path = candidate
    if not path.exists():
        raise RuntimeError(f"yt-dlp did not produce expected file: {path}")
    return path


def clear_cache() -> None:
    """For tests / cleanup scripts."""
    base = _cache_dir()
    for entry in base.iterdir():
        if entry.is_dir():
            shutil.rmtree(entry, ignore_errors=True)


# Soft import flag so callers can decide whether to invoke us at all.
def is_available() -> bool:
    return shutil.which("ffmpeg") is not None and bool(os.environ.get("PATH"))
