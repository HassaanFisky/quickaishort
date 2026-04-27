"""Server-side render pipeline.

Replaces the client-side `src/workers/ffmpeg.worker.ts`. Designed to run inside
an RQ worker (sync, blocking is fine; we own the process).

Flow:
  1. yt-dlp downloads only the requested segment (saves bandwidth on 1GB+ files).
  2. ffmpeg-python applies aspect-ratio crop/pad, optional reframing, optional
     watermark, optional caption burn-in, encodes libx264+aac.
  3. Caller is responsible for uploading the result to GridFS and cleanup.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional

import ffmpeg
import yt_dlp

logger = logging.getLogger(__name__)

AspectRatio = Literal["9:16", "1:1"]
Quality = Literal["low", "medium", "high"]

QUALITY_PRESETS: dict[Quality, dict[str, str]] = {
    "low": {"crf": "28", "preset": "ultrafast"},
    "medium": {"crf": "23", "preset": "veryfast"},
    "high": {"crf": "18", "preset": "fast"},
}

DEFAULT_CAPTION_STYLE = (
    "Fontname=Montserrat,FontSize=16,PrimaryColour=&H00FFFF00,"
    "OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,"
    "Alignment=2,MarginV=20"
)


@dataclass
class Reframing:
    center_x: float  # normalized 0-1
    center_y: float  # normalized 0-1
    scale: float = 1.0


@dataclass
class CaptionsConfig:
    enabled: bool = False
    srt_content: str = ""
    style: str = DEFAULT_CAPTION_STYLE


@dataclass
class WatermarkConfig:
    enabled: bool = False
    image_path: Optional[Path] = None  # PNG on disk; if None and enabled, drawtext fallback


@dataclass
class RenderJob:
    video_id: str
    start_sec: float
    end_sec: float
    aspect_ratio: AspectRatio = "9:16"
    quality: Quality = "medium"
    reframing: Optional[Reframing] = None
    captions: CaptionsConfig = field(default_factory=CaptionsConfig)
    watermark: WatermarkConfig = field(default_factory=WatermarkConfig)


@dataclass
class RenderResult:
    output_path: Path
    workdir: Path
    duration_sec: float
    file_size_bytes: int


class RenderService:
    """Stateless render pipeline. One instance per job is fine."""

    def __init__(self) -> None:
        pass

    def run(self, job: RenderJob) -> RenderResult:
        workdir = Path(tempfile.mkdtemp(prefix="qais-export-"))
        try:
            source = self._download_segment(job, workdir)
            output = self._transcode(job, source, workdir)
            return RenderResult(
                output_path=output,
                workdir=workdir,
                duration_sec=job.end_sec - job.start_sec,
                file_size_bytes=output.stat().st_size,
            )
        except Exception:
            self.cleanup(workdir)
            raise

    @staticmethod
    def cleanup(workdir: Path) -> None:
        shutil.rmtree(workdir, ignore_errors=True)

    def _download_segment(self, job: RenderJob, workdir: Path) -> Path:
        youtube_url = f"https://www.youtube.com/watch?v={job.video_id}"
        output_template = str(workdir / f"source_{uuid.uuid4().hex}.%(ext)s")

        ydl_opts = {
            "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "download_ranges": yt_dlp.utils.download_range_func(
                None, [(job.start_sec, job.end_sec)]
            ),
            "outtmpl": output_template,
            "quiet": True,
            "no_warnings": True,
            "force_keyframes_at_cuts": True,
            "merge_output_format": "mp4",
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=True)
            downloaded = ydl.prepare_filename(info)

        downloaded_path = Path(downloaded)
        if downloaded_path.suffix != ".mp4":
            mp4_candidate = downloaded_path.with_suffix(".mp4")
            if mp4_candidate.exists():
                downloaded_path = mp4_candidate

        if not downloaded_path.exists():
            raise RuntimeError(
                f"yt-dlp reported success but {downloaded_path} is missing"
            )
        return downloaded_path

    def _transcode(self, job: RenderJob, source: Path, workdir: Path) -> Path:
        output = workdir / f"export_{uuid.uuid4().hex}.mp4"
        captions_path: Optional[Path] = None
        if job.captions.enabled and job.captions.srt_content:
            captions_path = workdir / "captions.srt"
            captions_path.write_text(job.captions.srt_content, encoding="utf-8")

        video = ffmpeg.input(str(source)).video
        audio = ffmpeg.input(str(source)).audio

        video = self._apply_aspect_ratio(video, job)

        if job.watermark.enabled and job.watermark.image_path is not None:
            wm = ffmpeg.input(str(job.watermark.image_path)).filter(
                "scale", 200, -1
            )
            video = ffmpeg.overlay(
                video,
                wm,
                x="main_w-overlay_w-20",
                y="main_h-overlay_h-20",
            )
        elif job.watermark.enabled:
            video = video.drawtext(
                text="QuickAI",
                fontsize=48,
                fontcolor="white@0.8",
                x="w-tw-40",
                y="h-th-40",
            )

        if captions_path is not None:
            video = video.filter(
                "subtitles",
                str(captions_path).replace("\\", "/"),
                force_style=job.captions.style,
            )

        preset = QUALITY_PRESETS[job.quality]
        out = ffmpeg.output(
            video,
            audio,
            str(output),
            vcodec="libx264",
            acodec="aac",
            audio_bitrate="192k",
            crf=preset["crf"],
            preset=preset["preset"],
            movflags="+faststart",
        ).overwrite_output()

        try:
            out.run(quiet=True)
        except ffmpeg.Error as exc:
            stderr = (exc.stderr or b"").decode("utf-8", errors="replace")
            logger.error("ffmpeg failed: %s", stderr)
            raise RuntimeError(f"ffmpeg failed: {stderr[-2000:]}") from exc
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"ffmpeg subprocess failed: {exc}") from exc

        return output

    def _apply_aspect_ratio(self, video, job: RenderJob):
        if job.aspect_ratio == "9:16":
            if job.reframing is not None:
                cx = job.reframing.center_x
                w_expr = "ih*(9/16)"
                x_expr = f"min(max(0\\,iw*{cx}-{w_expr}/2)\\,iw-{w_expr})"
                video = video.filter("crop", w_expr, "ih", x_expr, 0)
            else:
                video = video.filter(
                    "scale", 1080, 1920, force_original_aspect_ratio="increase"
                ).filter("crop", 1080, 1920)
            return video.filter("scale", 1080, 1920)

        if job.aspect_ratio == "1:1":
            return (
                video.filter(
                    "scale", 1080, 1080, force_original_aspect_ratio="increase"
                ).filter("crop", 1080, 1080)
            )

        return video
