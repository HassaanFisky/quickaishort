"""Timing alignment helpers for dubbed audio segments."""

from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

from models.dub import DubSegment

logger = logging.getLogger(__name__)

_FFPROBE = shutil.which("ffprobe") or "ffprobe"
_FFMPEG = shutil.which("ffmpeg") or "ffmpeg"


def probe_duration_sec(path: Path) -> float:
    try:
        result = subprocess.run(
            [
                _FFPROBE,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if result.returncode != 0:
            return 0.0
        return max(0.0, float((result.stdout or "0").strip() or 0))
    except Exception as exc:
        logger.warning("ffprobe_failed path=%s error=%s", path, exc)
        return 0.0


def fit_segment_audio(
    source_mp3: Path,
    target_duration: float,
    dest_mp3: Path,
) -> bool:
    """Pad with silence or atempo-stretch into target_duration window."""

    target = max(0.15, float(target_duration))
    actual = probe_duration_sec(source_mp3)
    if actual <= 0.05:
        return False

    ratio = actual / target
    # Prefer mild rate change; otherwise pad/trim.
    if 0.85 <= ratio <= 1.15:
        atempo = max(0.5, min(2.0, ratio))
        cmd = [
            _FFMPEG,
            "-y",
            "-i",
            str(source_mp3),
            "-filter:a",
            f"atempo={atempo:.4f}",
            "-t",
            f"{target:.3f}",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "4",
            str(dest_mp3),
        ]
    elif actual < target:
        pad = target - actual
        cmd = [
            _FFMPEG,
            "-y",
            "-i",
            str(source_mp3),
            "-af",
            f"apad=pad_dur={pad:.3f}",
            "-t",
            f"{target:.3f}",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "4",
            str(dest_mp3),
        ]
    else:
        cmd = [
            _FFMPEG,
            "-y",
            "-i",
            str(source_mp3),
            "-t",
            f"{target:.3f}",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "4",
            str(dest_mp3),
        ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=False)
    if result.returncode != 0 or not dest_mp3.exists():
        logger.warning(
            "fit_segment_audio_failed code=%s stderr=%s",
            result.returncode,
            (result.stderr or "")[-400:],
        )
        return False
    return True


def concat_segment_files(paths: list[Path], dest_mp3: Path) -> bool:
    if not paths:
        return False
    work = Path(tempfile.mkdtemp(prefix="qai-dub-concat-"))
    try:
        list_file = work / "list.txt"
        lines = []
        for p in paths:
            safe = str(p).replace("'", "'\\''")
            lines.append(f"file '{safe}'")
        list_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
        cmd = [
            _FFMPEG,
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-c:a",
            "libmp3lame",
            "-q:a",
            "4",
            str(dest_mp3),
        ]
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=120, check=False
        )
        ok = result.returncode == 0 and dest_mp3.exists()
        if not ok:
            logger.warning(
                "concat_failed code=%s stderr=%s",
                result.returncode,
                (result.stderr or "")[-400:],
            )
        return ok
    finally:
        shutil.rmtree(work, ignore_errors=True)


def mark_timing_adjusted(
    segments: list[DubSegment], fitted_flags: list[bool]
) -> list[DubSegment]:
    out: list[DubSegment] = []
    for seg, fitted in zip(segments, fitted_flags):
        out.append(seg.model_copy(update={"timing_adjusted": bool(fitted)}))
    return out
