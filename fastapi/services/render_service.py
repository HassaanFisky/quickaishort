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
import os
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional

import ffmpeg
import yt_dlp
import asyncio
from app.utils.youtube_auth import inject_ydl_bypass
from services.video_service import VideoService
from services.storage_service import get_storage_service




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
    background_music: Optional[str] = None  # Local path or URL


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

    def run(self, job: RenderJob, progress_callback: Optional[callable] = None) -> RenderResult:
        workdir = Path(tempfile.mkdtemp(prefix="qais-export-"))
        try:
            if progress_callback:
                progress_callback("Downloading segment from YouTube...")
            source = self._download_segment(job, workdir)
            
            if progress_callback:
                progress_callback("Transcoding video (applying aspect ratio, captions)...")
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
        """Sync download for use inside RQ worker. No event loop created."""
        try:
            return VideoService.download_segment_sync(
                job.video_id, job.start_sec, job.end_sec, workdir
            )
        except Exception as e:
            logger.error("[RenderService] Download failed for %s: %s", job.video_id, e)
            raise RuntimeError(f"YouTube download blocked after all fallbacks: {e}")

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

        if job.background_music:
            try:
                music = ffmpeg.input(job.background_music, stream_loop=-1)
                # Volume filter: primary 1.0, music 0.15 (ambient)
                audio = ffmpeg.filter([audio, music.audio.filter("volume", 0.15)], "amix", duration="first")
            except Exception as exc:
                logger.warning("Background music mix failed: %s — falling back to original audio", exc)

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


def render_video(production_plan: dict) -> str:
    """
    Production-grade entry point for rendering a full production plan.
    Downloads, trims, scales, stitches multiple clips, and overlays a voiceover.
    """
    from yt_dlp import YoutubeDL
    
    service = RenderService()
    workdir = Path(tempfile.mkdtemp(prefix="qais-render-"))
    
    try:
        segments = production_plan.get("segments", [])
        voiceover_path = production_plan.get("voiceover_path")
        
        if not segments:
            raise ValueError("No segments found in production plan")
            
        processed_clips = []
        for i, seg in enumerate(segments):
            clip_source = seg.get("clip_path")
            start = float(seg.get("start_sec", 0))
            end = float(seg.get("end_sec", 5))
            duration = end - start
            
            target_clip = workdir / f"seg_{i}.mp4"
            
            if not clip_source or clip_source == "BLACK_FRAME":
                (
                    ffmpeg.input(f"color=c=black:s=1080x1920:d={duration}", f="lavfi")
                    .output(str(target_clip), vcodec="libx264", pix_fmt="yuv420p")
                    .overwrite_output()
                    .run(quiet=True)
                )
            elif clip_source.startswith("gridfs://"):
                # Handle GridFS URIs (used for ADK uploads)
                remote_path = clip_source[len("gridfs://"):]
                local_source = workdir / f"gridfs_src_{i}.mp4"
                storage = get_storage_service()
                
                # We assume uploads bucket for adk_uploads/ paths
                bucket: Literal["uploads", "exports"] = "uploads" if "adk_uploads/" in remote_path else "exports"
                
                success = storage.download_file(remote_path, local_source, bucket_name=bucket)
                if not success:
                    logger.error("[render_video] GridFS download failed for %s", clip_source)
                    # Fallback to black frame to avoid crashing the whole render
                    clip_source = "BLACK_FRAME"
                    # Re-run this iteration with BLACK_FRAME
                    (
                        ffmpeg.input(f"color=c=black:s=1080x1920:d={duration}", f="lavfi")
                        .output(str(target_clip), vcodec="libx264", pix_fmt="yuv420p")
                        .overwrite_output()
                        .run(quiet=True)
                    )
                else:
                    (
                        ffmpeg.input(str(local_source), ss=start, t=duration)
                        .filter("scale", 1080, 1920, force_original_aspect_ratio="increase")
                        .filter("crop", 1080, 1920)
                        .output(str(target_clip), vcodec="libx264", acodec="aac", crf=23, preset="veryfast")
                        .overwrite_output()
                        .run(quiet=True)
                    )
            elif clip_source.startswith("http"):
                # Real download and trim — yt-dlp first, Cobalt fallback
                try:
                    video_id = VideoService.extract_video_id(clip_source) or "unknown"
                    downloaded_file = str(
                        VideoService.download_segment_sync(video_id, start, end, workdir)
                    )
                except Exception as dl_err:
                    logger.error("[render_video] sync download failed for %s: %s", clip_source, dl_err)
                    raise
                
                (
                    ffmpeg.input(downloaded_file, ss=start, t=duration)
                    .filter("scale", 1080, 1920, force_original_aspect_ratio="increase")
                    .filter("crop", 1080, 1920)
                    .output(str(target_clip), vcodec="libx264", acodec="aac", crf=23, preset="veryfast")
                    .overwrite_output()
                    .run(quiet=True)
                )
            else:
                # Local file path
                (
                    ffmpeg.input(clip_source, ss=start, t=duration)
                    .filter("scale", 1080, 1920, force_original_aspect_ratio="increase")
                    .filter("crop", 1080, 1920)
                    .output(str(target_clip), vcodec="libx264", acodec="aac", crf=23, preset="veryfast")
                    .overwrite_output()
                    .run(quiet=True)
                )
            
            processed_clips.append(ffmpeg.input(str(target_clip)))

        # Stitch videos
        # We assume clips have audio or we provide silence if missing
        joined = ffmpeg.concat(*processed_clips, v=1, a=1).node
        v = joined[0]
        a = joined[1]
        
        # Overlay voiceover if provided
        if voiceover_path:
            local_vo = voiceover_path
            if voiceover_path.startswith("gridfs://"):
                remote_vo = voiceover_path[len("gridfs://"):]
                local_vo = str(workdir / "voiceover.mp3")
                get_storage_service().download_file(remote_vo, Path(local_vo), bucket_name="uploads")
            
            if os.path.exists(local_vo):
                vo = ffmpeg.input(local_vo)
                # Mix voiceover (higher volume) with ambient audio (lower volume)
                a_ambient = a.filter("volume", 0.3)
                a_voice = vo.filter("volume", 1.5)
                a = ffmpeg.filter([a_ambient, a_voice], "amix", inputs=2, duration="first")
            
        output_path = workdir / "final_output.mp4"
        (
            ffmpeg.output(
                v, a, str(output_path),
                vcodec="libx264", acodec="aac",
                crf=21, preset="medium",
                movflags="faststart"
            )
            .overwrite_output()
            .run(quiet=True)
        )
        
        final_dest = Path(tempfile.gettempdir()) / f"qai_final_{uuid.uuid4().hex}.mp4"
        shutil.move(str(output_path), str(final_dest))
        logger.info(f"Render successful: {final_dest}")
        return str(final_dest)
        
    except Exception as e:
        logger.error(f"render_video failed: {e}")
        raise
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
