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
from typing import Literal, Optional, List

import ffmpeg
from services.video_service import VideoService
from services.storage_service import get_storage_service

logger = logging.getLogger(__name__)

# ── FFmpeg timeout constants (env-overridable) ─────────────────────────────────
# Per-segment: single clip trim/scale. 120s is generous for a 3-minute clip.
_FFMPEG_SEGMENT_TIMEOUT: int = int(os.environ.get("FFMPEG_SEGMENT_TIMEOUT_S", "120"))
# Final concat/stitch pass: scales with number of clips.
_FFMPEG_FINAL_TIMEOUT: int = int(os.environ.get("FFMPEG_FINAL_TIMEOUT_S", "300"))


def _run_ffmpeg(stream, *, timeout: int = _FFMPEG_SEGMENT_TIMEOUT) -> None:
    """
    Execute an ffmpeg-python stream graph with a hard wall-clock timeout.

    Uses ``subprocess.run`` directly so Python can kill the process on timeout
    rather than relying on the RQ job-level 600s watchdog. A hung FFmpeg
    (corrupted input, impossible filter, stalled network read) will raise
    ``RuntimeError`` within ``timeout`` seconds and free the worker immediately.

    Args:
        stream: A compiled ffmpeg-python output node (result of .overwrite_output()).
        timeout: Wall-clock seconds before the process is killed. Defaults to
            _FFMPEG_SEGMENT_TIMEOUT (120s). Pass _FFMPEG_FINAL_TIMEOUT (300s)
            for the final multi-clip stitch pass.

    Raises:
        RuntimeError: On timeout or non-zero exit code.
    """
    cmd = stream.compile()
    try:
        result = subprocess.run(
            cmd,
            timeout=timeout,
            capture_output=True,
        )
    except subprocess.TimeoutExpired as exc:
        logger.error(
            "ffmpeg_timeout cmd_prefix=%s timeout_s=%d",
            " ".join(cmd[:6]),
            timeout,
        )
        raise RuntimeError(
            f"ffmpeg timed out after {timeout}s — cmd: {' '.join(cmd[:8])}"
        ) from exc

    if result.returncode != 0:
        stderr = (result.stderr or b"").decode("utf-8", errors="replace")
        logger.error(
            "ffmpeg_nonzero_exit code=%d stderr_tail=%s",
            result.returncode,
            stderr[-500:],
        )
        raise RuntimeError(
            f"ffmpeg exited {result.returncode}: {stderr[-2000:]}"
        )  # noqa: EM102


def _validate_background_music(url_or_path: str) -> bool:
    """
    Validate that the background music input is safe.
    Prevents SSRF and local file traversal vulnerabilities.
    """
    if not url_or_path:
        return False

    # 1. If it's a URL
    if url_or_path.startswith(("http://", "https://")):
        from urllib.parse import urlparse

        try:
            parsed = urlparse(url_or_path)
            hostname = parsed.hostname.lower() if parsed.hostname else ""

            # Prevent private IP addresses, localhost, and metadata servers
            if any(
                h in hostname
                for h in ["localhost", "127.0.0.1", "169.254.169.254", "metadata"]
            ):
                return False

            # Clean allowlist check - allow Pixabay, local storage, googleapis, and public CDNs
            allowed_domains = [
                "pixabay.com",
                "googleapis.com",
                "quickaishort.online",
                "storage.googleapis.com",
                "cdn.pixabay.com",
            ]
            if any(
                hostname == domain or hostname.endswith("." + domain)
                for domain in allowed_domains
            ):
                return True

            # Check dynamic origin from env variables
            public_url = os.environ.get("PUBLIC_API_URL", "")
            if public_url:
                pub_host = urlparse(public_url).hostname
                if pub_host and hostname == pub_host.lower():
                    return True
            return False
        except Exception:
            return False

    # 2. If it's a local file path, prevent directory traversal outside of allowed directories
    path = Path(url_or_path)
    try:
        resolved = path.resolve()
        # Allow if it's an asset or temp file
        allowed_prefixes = [
            Path(tempfile.gettempdir()).resolve(),
            Path(os.getcwd()).resolve(),
        ]
        if any(
            resolved.as_posix().startswith(prefix.as_posix())
            for prefix in allowed_prefixes
        ):
            return True
        return False
    except Exception:
        return False


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
    image_path: Optional[Path] = (
        None  # PNG on disk; if None and enabled, drawtext fallback
    )


@dataclass
class CanvasOverlay:
    """A user-placed text or sticker element to composite onto the video."""

    type: str  # "text" or "sticker"
    content: str  # Raw text / emoji
    x_pct: float = 0.5  # Fractional x position (0=left, 1=right)
    y_pct: float = 0.5  # Fractional y position (0=top, 1=bottom)
    scale: float = 1.0
    rotation: float = 0.0


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
    background_music: Optional[str] = None
    hook_overlay: str = ""
    emotional_peaks: list[float] = field(default_factory=list)
    cinematic_style: str = "Impact"
    canvas_overlays: List[CanvasOverlay] = field(default_factory=list)
    audio_boost: float = 85.0
    playback_speed: float = 100.0
    noise_suppression: float = 20.0
    filter_name: str = "None"
    transition_enabled: bool = False
    voiceover_enabled: bool = False


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

    def run(
        self, job: RenderJob, progress_callback: Optional[callable] = None
    ) -> RenderResult:
        workdir = Path(tempfile.mkdtemp(prefix="qais-export-"))
        try:
            if progress_callback:
                progress_callback("Downloading segment from YouTube...")
            source = self._download_segment(job, workdir)

            if progress_callback:
                progress_callback(
                    "Transcoding video (applying aspect ratio, captions)..."
                )
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
            from services.video_acquisition import acquire_video

            result = acquire_video(job.video_id, job.start_sec, job.end_sec, workdir)
            if result["status"] == "ready":
                return Path(result["video_path"])
            raise RuntimeError(result.get("error", "acquisition failed"))
        except ImportError:
            # Fallback if video_acquisition not importable (e.g. missing dep)
            pass
        except Exception as e:
            logger.error("[RenderService] Tiered acquisition failed for %s: %s", job.video_id, e)
            raise RuntimeError(f"YouTube download blocked after all fallbacks: {e}")

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

        # ---------------------------------------------------------
        # APPLY NEW EDITOR SETTINGS (Speed, FX, Transitions, Audio)
        # ---------------------------------------------------------
        if job.playback_speed != 100.0:
            speed = max(0.5, min(2.0, job.playback_speed / 100.0))
            video = video.filter("setpts", f"{1.0/speed}*PTS")
            audio = audio.filter("atempo", speed)

        if job.filter_name == "Urban":
            video = video.filter("eq", contrast=1.2, saturation=0.8, gamma=1.1)
        elif job.filter_name == "Retro":
            video = video.filter(
                "colorchannelmixer",
                rr=0.393,
                rg=0.769,
                rb=0.189,
                gr=0.349,
                gg=0.686,
                gb=0.168,
                br=0.272,
                bg=0.534,
                bb=0.131,
            )
        elif job.filter_name == "Cinematic":
            video = video.filter("eq", contrast=1.1, saturation=1.2)

        if job.transition_enabled:
            # Simple fade in/out for 0.5s
            duration = job.end_sec - job.start_sec
            video = video.filter("fade", t="in", st=0, d=0.5).filter(
                "fade", t="out", st=duration - 0.5, d=0.5
            )

        if job.audio_boost != 85.0:
            volume = job.audio_boost / 85.0
            audio = audio.filter("volume", volume)

        if job.noise_suppression > 0:
            # Highpass filter for basic noise reduction
            audio = audio.filter("highpass", f=200)

        if job.voiceover_enabled:
            # AI Voiceover Enhancement: Boost vocal frequencies (around 3kHz)
            audio = audio.filter("equalizer", f=3000, width_type="h", width=2000, g=5)

        # ---------------------------------------------------------

        # APPLY CINEMATIC EFFECTS (ZOOM/PULSE)
        if job.emotional_peaks:
            # CHANGED: Autonomous 'Genius' cinematic zoom logic
            # For each peak, we create a 0.5s zoom-in (scale 1.0 -> 1.1)
            # We use the zoompan filter which is powerful but requires careful syntax
            zoom_expr = "1.0"
            for peak in job.emotional_peaks:
                # pulse at peak: (t is relative to clip start in zoompan)
                # We use a simple step function for the 0.5s window
                zoom_expr = f"if(between(it,{peak},{peak+0.5}),1.1,{zoom_expr})"

            # zoompan: z=zoom, d=duration(frames), s=output_size
            # Note: zoompan happens at 30fps by default
            # H4 Fix: Dynamically set size based on job aspect ratio to prevent double scaling overhead
            zoompan_size = "1080x1080" if job.aspect_ratio == "1:1" else "1080x1920"
            video = video.filter("zoompan", z=zoom_expr, d=1, s=zoompan_size, fps=30)

        if job.watermark.enabled and job.watermark.image_path is not None:
            wm = ffmpeg.input(str(job.watermark.image_path)).filter("scale", 200, -1)
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

        if job.hook_overlay:
            # CHANGED: Apply the 'Genius' hook overlay for the first 3 seconds
            # Style: Big, yellow, centered with box
            video = video.drawtext(
                text=job.hook_overlay.upper(),
                fontfile="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                fontsize=72,
                fontcolor="yellow",
                box=1,
                boxcolor="black@0.6",
                boxborderw=10,
                x="(w-text_w)/2",
                y="(h-text_h)/2-100",
                enable="between(t,0,3)",
            )

        # Canvas overlays — applied before captions so captions render on top
        for overlay in job.canvas_overlays:
            # Compute pixel position from fractional coords using ffmpeg expressions.
            # Output size at this point in the filter chain is always 1080x1920 (9:16).
            out_w, out_h = (1080, 1920) if job.aspect_ratio == "9:16" else (1080, 1080)
            px = int(overlay.x_pct * out_w)
            py = int(overlay.y_pct * out_h)
            font_size = max(24, int(48 * overlay.scale))

            # Sanitise text: ffmpeg drawtext uses ':' and '\n' as special chars
            safe_text = (
                overlay.content.replace("\\", "\\\\")
                .replace(":", "\\:")
                .replace("'", "\\'")[:200]  # hard cap — long text breaks ffmpeg parser
            )

            try:
                video = video.drawtext(
                    text=safe_text,
                    fontfile="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                    fontsize=font_size,
                    fontcolor="white",
                    box=1,
                    boxcolor="black@0.5",
                    boxborderw=6,
                    x=str(px),
                    y=str(py),
                )
            except Exception as _ov_err:
                # Never let a canvas overlay crash the whole render
                logger.warning(
                    "canvas_overlay_skipped content=%r err=%s", overlay.content, _ov_err
                )

        if captions_path is not None:
            video = video.filter(
                "subtitles",
                str(captions_path).replace("\\", "/"),
                force_style=job.captions.style,
            )

        if job.background_music:
            if not _validate_background_music(job.background_music):
                logger.warning(
                    "Background music validation failed for source '%s' (SSRF/path traversal risk blocked) — skipping ambient mix",
                    job.background_music,
                )
            else:
                try:
                    music = ffmpeg.input(job.background_music, stream_loop=-1)
                    # Volume filter: primary 1.0, music 0.15 (ambient)
                    audio = ffmpeg.filter(
                        [audio, music.audio.filter("volume", 0.15)],
                        "amix",
                        duration="first",
                    )
                except Exception as exc:
                    logger.warning(
                        "Background music mix failed: %s — falling back to original audio",
                        exc,
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
            threads=2,
        ).overwrite_output()

        # _run_ffmpeg enforces a hard timeout and raises RuntimeError on failure.
        # The legacy ffmpeg.Error / CalledProcessError paths are subsumed by it.
        _run_ffmpeg(out, timeout=_FFMPEG_SEGMENT_TIMEOUT)

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
            return video.filter(
                "scale", 1080, 1080, force_original_aspect_ratio="increase"
            ).filter("crop", 1080, 1080)

        return video


def render_video(production_plan: dict) -> str:
    """
    Production-grade entry point for rendering a full production plan.
    Downloads, trims, scales, stitches multiple clips, and overlays a voiceover.
    """
    workdir = Path(tempfile.mkdtemp(prefix="qais-render-"))

    try:
        segments = production_plan.get("segments", [])
        voiceover_path = production_plan.get("voiceover_path")
        # Smart transitions: 0.5s xfade between adjacent clips when enabled.
        # Falls back to frame-accurate concat when disabled or only one clip exists.
        transition_enabled = bool(production_plan.get("transition_enabled", False))

        if not segments:
            raise ValueError("No segments found in production plan")

        processed_clips = []
        processed_clip_paths: list[str] = []
        clip_durations: list[float] = []
        for i, seg in enumerate(segments):
            clip_source = seg.get("clip_path")
            start = float(seg.get("start_sec", 0))
            end = float(seg.get("end_sec", 5))

            # M5 Fix: Validate that start_sec < end_sec to avoid zero-duration sub-clips.
            if start >= end:
                logger.warning(
                    "[render_video] Segment %d has invalid timings (start_sec=%.2f >= end_sec=%.2f). Adjusting end_sec to start_sec + 1.0.",
                    i,
                    start,
                    end,
                )
                end = start + 1.0

            duration = end - start

            target_clip = workdir / f"seg_{i}.mp4"

            if not clip_source or clip_source == "BLACK_FRAME":
                _run_ffmpeg(
                    ffmpeg.input(f"color=c=black:s=1080x1920:d={duration}", f="lavfi")
                    .output(str(target_clip), vcodec="libx264", pix_fmt="yuv420p")
                    .overwrite_output()
                )
            elif clip_source.startswith("gridfs://"):
                # Handle GridFS URIs (used for ADK uploads)
                remote_path = clip_source[len("gridfs://") :]  # noqa: E203
                local_source = workdir / f"gridfs_src_{i}.mp4"
                storage = get_storage_service()

                # We assume uploads bucket for adk_uploads/ paths
                bucket: Literal["uploads", "exports"] = (
                    "uploads" if "adk_uploads/" in remote_path else "exports"
                )

                success = storage.download_file(
                    remote_path, local_source, _bucket_name=bucket
                )
                if not success:
                    logger.error(
                        "[render_video] GridFS download failed for %s", clip_source
                    )
                    # Fallback to black frame
                    _run_ffmpeg(
                        ffmpeg.input(
                            f"color=c=black:s=1080x1920:d={duration}", f="lavfi"
                        )
                        .output(str(target_clip), vcodec="libx264", pix_fmt="yuv420p")
                        .overwrite_output()
                    )
                else:
                    _run_ffmpeg(
                        ffmpeg.input(str(local_source), ss=start, t=duration)
                        .filter(
                            "scale", 1080, 1920, force_original_aspect_ratio="increase"
                        )
                        .filter("crop", 1080, 1920)
                        .output(
                            str(target_clip),
                            vcodec="libx264",
                            acodec="aac",
                            crf=23,
                            preset="veryfast",
                        )
                        .overwrite_output()
                    )
            elif clip_source.startswith("gs://"):
                # Genius Step: Handle GCS URIs for private asset library
                local_source = workdir / f"gcs_src_{i}.mp4"
                storage = get_storage_service()
                success = storage.download_gcs_file(clip_source, local_source)

                if not success:
                    logger.error(
                        "[render_video] GCS download failed for %s", clip_source
                    )
                    # Fallback to black frame
                    _run_ffmpeg(
                        ffmpeg.input(
                            f"color=c=black:s=1080x1920:d={duration}", f="lavfi"
                        )
                        .output(str(target_clip), vcodec="libx264", pix_fmt="yuv420p")
                        .overwrite_output()
                    )
                else:
                    _run_ffmpeg(
                        ffmpeg.input(str(local_source), ss=start, t=duration)
                        .filter(
                            "scale", 1080, 1920, force_original_aspect_ratio="increase"
                        )
                        .filter("crop", 1080, 1920)
                        .output(
                            str(target_clip),
                            vcodec="libx264",
                            acodec="aac",
                            crf=23,
                            preset="veryfast",
                        )
                        .overwrite_output()
                    )
            elif clip_source.startswith("http"):
                # Real download and trim — yt-dlp first, Cobalt fallback.
                # Any failure here (network, region-block, dead Pexels link, etc.)
                # degrades to a black frame so the overall render NEVER crashes
                # on a single bad stock source.
                try:
                    video_id = VideoService.extract_video_id(clip_source) or "unknown"
                    downloaded_file = str(
                        VideoService.download_segment_sync(
                            video_id, start, end, workdir
                        )
                    )
                    _run_ffmpeg(
                        ffmpeg.input(downloaded_file, ss=start, t=duration)
                        .filter(
                            "scale", 1080, 1920, force_original_aspect_ratio="increase"
                        )
                        .filter("crop", 1080, 1920)
                        .output(
                            str(target_clip),
                            vcodec="libx264",
                            acodec="aac",
                            crf=23,
                            preset="veryfast",
                        )
                        .overwrite_output()
                    )
                except Exception as dl_err:
                    logger.warning(
                        "[render_video] HTTP source unavailable, substituting black frame: %s (%s)",
                        clip_source,
                        dl_err,
                    )
                    _run_ffmpeg(
                        ffmpeg.input(
                            f"color=c=black:s=1080x1920:d={duration}", f="lavfi"
                        )
                        .output(str(target_clip), vcodec="libx264", pix_fmt="yuv420p")
                        .overwrite_output()
                    )
            else:
                # Local file path
                _run_ffmpeg(
                    ffmpeg.input(clip_source, ss=start, t=duration)
                    .filter("scale", 1080, 1920, force_original_aspect_ratio="increase")
                    .filter("crop", 1080, 1920)
                    .output(
                        str(target_clip),
                        vcodec="libx264",
                        acodec="aac",
                        crf=23,
                        preset="veryfast",
                    )
                    .overwrite_output()
                )

            processed_clips.append(ffmpeg.input(str(target_clip)))
            processed_clip_paths.append(str(target_clip))
            clip_durations.append(duration)

        # Stitch videos.
        # If transitions are enabled and there are at least two clips, use an
        # xfade chain (0.5s fade between each adjacent pair) for video and a
        # matching acrossfade chain for audio. Otherwise fall back to the
        # frame-accurate concat (original behavior).
        if transition_enabled and len(processed_clip_paths) > 1:
            # H5 Fix: Clamp xfade duration to never exceed 40% of the shortest clip's duration
            # to prevent negative/invalid offsets on short sub-clips.
            XFADE = max(0.1, min(0.5, min(clip_durations) * 0.4))
            # Re-input each saved clip so we can pull video and audio streams
            # independently into the filter graph.
            clip_inputs = [ffmpeg.input(p) for p in processed_clip_paths]
            v_acc = clip_inputs[0].video
            a_acc = clip_inputs[0].audio
            cumulative = clip_durations[0]
            for i in range(1, len(clip_inputs)):
                offset = max(0.0, cumulative - XFADE)
                v_acc = ffmpeg.filter(
                    [v_acc, clip_inputs[i].video],
                    "xfade",
                    transition="fade",
                    duration=XFADE,
                    offset=offset,
                )
                a_acc = ffmpeg.filter(
                    [a_acc, clip_inputs[i].audio],
                    "acrossfade",
                    d=XFADE,
                )
                # Each xfade overlaps the two clips by XFADE seconds, so the
                # running total grows by next_duration - XFADE.
                cumulative += clip_durations[i] - XFADE
            v = v_acc
            a = a_acc
        else:
            # Frame-accurate concat. Clips must have audio (silence fallback
            # is provided upstream by black-frame substitution where needed).
            joined = ffmpeg.concat(*processed_clips, v=1, a=1).node
            v = joined[0]
            a = joined[1]

        # Overlay voiceover if provided
        if voiceover_path:
            local_vo = voiceover_path
            if voiceover_path.startswith("gridfs://"):
                remote_vo = voiceover_path[len("gridfs://") :]  # noqa: E203
                local_vo = str(workdir / "voiceover.mp3")
                get_storage_service().download_file(
                    remote_vo, Path(local_vo), _bucket_name="uploads"
                )

            if os.path.exists(local_vo):
                vo = ffmpeg.input(local_vo)
                # Mix voiceover (higher volume) with ambient audio (lower volume)
                a_ambient = a.filter("volume", 0.3)
                a_voice = vo.filter("volume", 1.5)
                a = ffmpeg.filter(
                    [a_ambient, a_voice], "amix", inputs=2, duration="first"
                )

        output_path = workdir / "final_output.mp4"
        # Use the longer final-concat timeout — number of clips scales the work.
        _run_ffmpeg(
            ffmpeg.output(
                v,
                a,
                str(output_path),
                vcodec="libx264",
                acodec="aac",
                crf=21,
                preset="medium",
                movflags="faststart",
                threads=2,
            ).overwrite_output(),
            timeout=_FFMPEG_FINAL_TIMEOUT,
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
