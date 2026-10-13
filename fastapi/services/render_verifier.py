"""Deterministic post-render media verification.

The render worker may only publish a successful terminal state after the
produced MP4 passes these mechanical checks. This module never calls an LLM.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional


@dataclass(frozen=True)
class RenderVerification:
    passed: bool
    checks: dict[str, bool]
    duration_sec: Optional[float]
    width: Optional[int]
    height: Optional[int]
    has_video: bool
    has_audio: bool
    error: Optional[str] = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "checks": dict(self.checks),
            "duration_sec": self.duration_sec,
            "width": self.width,
            "height": self.height,
            "has_video": self.has_video,
            "has_audio": self.has_audio,
            "error": self.error,
        }


def verify_rendered_media(
    path: Path,
    *,
    expected_duration_sec: Optional[float] = None,
    expected_width: Optional[int] = None,
    expected_height: Optional[int] = None,
) -> RenderVerification:
    """Probe a rendered media file with fixed ffprobe arguments.

    A render passes only when the file exists, is non-empty, contains a video
    stream with valid dimensions/duration, and — when expectations are present —
    stays within conservative tolerances of the requested output.
    """

    path = Path(path)
    checks = {
        "exists": path.is_file(),
        "non_empty": False,
        "ffprobe_ok": False,
        "video_stream": False,
        "duration_positive": False,
        "dimensions_positive": False,
        "duration_matches_expected": True,
        "dimensions_match_expected": True,
    }

    if not checks["exists"]:
        return RenderVerification(
            passed=False,
            checks=checks,
            duration_sec=None,
            width=None,
            height=None,
            has_video=False,
            has_audio=False,
            error="render_output_missing",
        )

    try:
        checks["non_empty"] = path.stat().st_size > 0
    except OSError:
        checks["non_empty"] = False

    if not checks["non_empty"]:
        return RenderVerification(
            passed=False,
            checks=checks,
            duration_sec=None,
            width=None,
            height=None,
            has_video=False,
            has_audio=False,
            error="render_output_empty",
        )

    try:
        proc = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-show_entries",
                "stream=index,codec_type,width,height,duration",
                "-of",
                "json",
                str(path),
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return RenderVerification(
            passed=False,
            checks=checks,
            duration_sec=None,
            width=None,
            height=None,
            has_video=False,
            has_audio=False,
            error=f"ffprobe_unavailable:{type(exc).__name__}",
        )

    if proc.returncode != 0:
        return RenderVerification(
            passed=False,
            checks=checks,
            duration_sec=None,
            width=None,
            height=None,
            has_video=False,
            has_audio=False,
            error="ffprobe_failed",
        )

    checks["ffprobe_ok"] = True

    try:
        payload = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        return RenderVerification(
            passed=False,
            checks=checks,
            duration_sec=None,
            width=None,
            height=None,
            has_video=False,
            has_audio=False,
            error="ffprobe_invalid_json",
        )

    streams = payload.get("streams") or []
    video = next(
        (s for s in streams if s.get("codec_type") == "video"),
        None,
    )
    has_audio = any(s.get("codec_type") == "audio" for s in streams)
    checks["video_stream"] = video is not None

    width = int(video.get("width") or 0) if video else 0
    height = int(video.get("height") or 0) if video else 0

    raw_format_duration = (payload.get("format") or {}).get("duration")
    try:
        duration = (
            float(raw_format_duration) if raw_format_duration is not None else None
        )
    except (TypeError, ValueError):
        duration = None

    if duration is None and video:
        try:
            duration = float(video.get("duration"))
        except (TypeError, ValueError):
            duration = None

    checks["duration_positive"] = bool(duration is not None and duration > 0.05)
    checks["dimensions_positive"] = width > 0 and height > 0

    if (
        expected_duration_sec is not None
        and expected_duration_sec > 0
        and duration is not None
    ):
        tolerance = max(0.75, min(2.0, expected_duration_sec * 0.03))
        checks["duration_matches_expected"] = (
            abs(duration - expected_duration_sec) <= tolerance
        )

    if expected_width and expected_height:
        checks["dimensions_match_expected"] = (
            width == expected_width and height == expected_height
        )

    passed = all(checks.values())
    error = None
    if not passed:
        failed = [name for name, ok in checks.items() if not ok]
        error = "output_verification_failed:" + ",".join(failed)

    return RenderVerification(
        passed=passed,
        checks=checks,
        duration_sec=duration,
        width=width or None,
        height=height or None,
        has_video=bool(video),
        has_audio=has_audio,
        error=error,
    )
