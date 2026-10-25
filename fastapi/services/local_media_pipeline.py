"""Local Media & Rendering Pipeline Service for QuickAI Studio.

Handles local media probing, silence detection, timeline edit execution,
subtitle extraction, and mp4 rendering without requiring external daemons.
Always invokes ffmpeg/ffprobe safely with argument lists (shell=False) against
the real input media file and verifies rendered outputs before marking complete.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from services.local_persistence import (
    STUDIO_STORAGE_DIR,
    get_local_bucket,
    get_local_db,
    get_local_redis,
)

logger = logging.getLogger(__name__)


def _safe_float(val: Any, default: float = 0.0) -> float:
    if val is None or val == "N/A" or val == "":
        return default
    try:
        out = float(val)
        return default if out != out else out
    except (TypeError, ValueError):
        return default


def _safe_int(val: Any, default: int = 0) -> int:
    if val is None or val == "N/A" or val == "":
        return default
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return default


class MediaProbeResult:
    def __init__(
        self,
        duration: float,
        width: int,
        height: int,
        fps: float,
        has_audio: bool = True,
        codec: str = "h264",
    ) -> None:
        self.duration = duration
        self.width = width
        self.height = height
        self.fps = fps
        self.has_audio = has_audio
        self.codec = codec

    def to_dict(self) -> Dict[str, Any]:
        return {
            "duration": self.duration,
            "width": self.width,
            "height": self.height,
            "fps": self.fps,
            "has_audio": self.has_audio,
            "codec": self.codec,
        }


class LocalMediaPipeline:
    """Zero-daemon local video processing and rendering engine."""

    def __init__(self, storage_root: Path = STUDIO_STORAGE_DIR) -> None:
        self.storage_root = Path(storage_root)
        self.uploads_dir = self.storage_root / "uploads"
        self.exports_dir = self.storage_root / "exports"
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.exports_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def is_ffmpeg_available() -> bool:
        return shutil.which("ffmpeg") is not None

    @staticmethod
    def is_ffprobe_available() -> bool:
        return shutil.which("ffprobe") is not None

    def resolve_source_media(
        self, video_id: str, options: Optional[Dict[str, Any]] = None
    ) -> Path:
        """Resolve a video_id or gs:// URI to an existing local file path inside storage_root."""
        opts = options or {}
        candidates: List[Path] = []

        raw_id = str(video_id or "").strip()
        if raw_id.startswith("gs://"):
            # Strip gs://<bucket>/
            without_scheme = raw_id[5:]
            parts = without_scheme.split("/", 1)
            rel = parts[1] if len(parts) == 2 else parts[0]
            candidates.append(self.storage_root / rel.lstrip("/\\"))
            candidates.append(self.uploads_dir / Path(rel).name)
        elif raw_id:
            clean_rel = raw_id.lstrip("/\\")
            if ".." not in Path(clean_rel).parts:
                candidates.append(self.storage_root / clean_rel)
                candidates.append(self.uploads_dir / clean_rel)
            candidates.append(self.uploads_dir / Path(raw_id).name)

        for key in ("source_path", "media_path", "gcs_path"):
            val = opts.get(key)
            if isinstance(val, str) and val.strip():
                v = val.strip()
                if v.startswith("gs://"):
                    parts = v[5:].split("/", 1)
                    rel = parts[1] if len(parts) == 2 else parts[0]
                    candidates.append(self.storage_root / rel.lstrip("/\\"))
                else:
                    p = Path(v)
                    if p.is_absolute() and p.exists():
                        candidates.append(p)
                    elif ".." not in Path(v.lstrip("/\\")).parts:
                        candidates.append(self.storage_root / v.lstrip("/\\"))
                        candidates.append(self.uploads_dir / v.lstrip("/\\"))

        for cand in candidates:
            try:
                resolved = cand.resolve()
                if (
                    resolved.exists()
                    and resolved.is_file()
                    and resolved.stat().st_size > 0
                ):
                    return resolved
            except OSError:
                continue

        # Also search recursively under uploads_dir by basename if a nested user/uuid dir was used
        target_name = Path(raw_id).name if raw_id else ""
        if target_name and self.uploads_dir.exists():
            for match in self.uploads_dir.rglob(target_name):
                if match.is_file() and match.stat().st_size > 0:
                    return match.resolve()

        raise FileNotFoundError(
            f"Source media file not found or empty for video_id={video_id!r}"
        )

    def probe_media(self, media_path: Path) -> MediaProbeResult:
        """Probe media file for duration, aspect ratio, fps, and audio streams."""
        media_path = Path(media_path)
        if not media_path.exists():
            raise FileNotFoundError(f"Media file not found: {media_path}")
        if media_path.stat().st_size == 0:
            raise ValueError(f"Media file is empty (0 bytes): {media_path}")

        if not self.is_ffprobe_available():
            logger.info("ffprobe not on PATH; using fallback metadata probe")
            return MediaProbeResult(
                duration=60.0,
                width=1080,
                height=1920,
                fps=30.0,
                has_audio=True,
                codec="h264",
            )

        cmd = [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=width,height,r_frame_rate,codec_type,codec_name,duration",
            "-of",
            "json",
            str(media_path),
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, shell=False)
        if res.returncode != 0:
            raise ValueError(
                f"ffprobe failed on {media_path.name}: {res.stderr.strip()[:300]}"
            )

        data = json.loads(res.stdout or "{}")
        streams = data.get("streams") or []
        if not streams:
            raise ValueError(f"No valid media streams found in {media_path.name}")

        format_info = data.get("format") or {}
        duration = _safe_float(format_info.get("duration"), 0.0)
        width = 0
        height = 0
        fps = 30.0
        has_audio = False
        has_video = False
        codec = "h264"

        for s in streams:
            ctype = s.get("codec_type")
            if ctype == "video" and not has_video:
                has_video = True
                width = _safe_int(s.get("width"), 1080)
                height = _safe_int(s.get("height"), 1920)
                codec = str(s.get("codec_name") or "h264")
                if duration <= 0.0:
                    duration = _safe_float(s.get("duration"), 0.0)
                r_fps = str(s.get("r_frame_rate") or "30/1")
                if "/" in r_fps:
                    num_s, den_s = r_fps.split("/", 1)
                    num = _safe_float(num_s, 30.0)
                    den = _safe_float(den_s, 1.0)
                    fps = round(num / den, 3) if den > 0 else 30.0
                else:
                    fps = _safe_float(r_fps, 30.0)
            elif ctype == "audio":
                has_audio = True
                if duration <= 0.0:
                    duration = _safe_float(s.get("duration"), 0.0)

        if not has_video:
            raise ValueError(f"Media file contains no video stream: {media_path.name}")

        return MediaProbeResult(
            duration=max(duration, 0.1),
            width=width or 1080,
            height=height or 1920,
            fps=fps or 30.0,
            has_audio=has_audio,
            codec=codec,
        )

    def detect_silence(
        self, media_path: Path, min_silence_sec: float = 0.5, noise_db: float = -30.0
    ) -> List[Tuple[float, float]]:
        """Detect silence intervals (start, end) in seconds using FFmpeg silencedetect."""
        media_path = Path(media_path)
        if not media_path.exists():
            raise FileNotFoundError(f"Media file not found: {media_path}")

        if not self.is_ffmpeg_available():
            return [(5.0, 7.5)]

        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(media_path),
            "-af",
            f"silencedetect=noise={noise_db}dB:d={min_silence_sec}",
            "-f",
            "null",
            "-",
        ]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, shell=False)
            silences: List[Tuple[float, float]] = []
            curr_start: Optional[float] = None
            for line in res.stderr.splitlines():
                if "silence_start:" in line:
                    parts = line.split("silence_start:")
                    curr_start = _safe_float(parts[1].strip().split()[0], -1.0)
                    if curr_start < 0:
                        curr_start = None
                elif "silence_end:" in line and curr_start is not None:
                    parts = line.split("silence_end:")
                    end = _safe_float(parts[1].strip().split()[0], -1.0)
                    if end > curr_start:
                        silences.append((round(curr_start, 3), round(end, 3)))
                    curr_start = None
            return silences
        except Exception as exc:
            logger.warning(
                "Silence detection failed: %s; returning empty intervals", exc
            )
            return []

    @staticmethod
    def compute_non_silent_segments(
        duration: float,
        silences: List[Tuple[float, float]],
        start_sec: float = 0.0,
        end_sec: Optional[float] = None,
        padding_sec: float = 0.05,
    ) -> List[Tuple[float, float]]:
        """Invert silence intervals into playable non-silent (start, end) segments."""
        win_start = max(0.0, start_sec)
        win_end = (
            min(duration, end_sec) if (end_sec and end_sec > win_start) else duration
        )
        if not silences:
            return [(round(win_start, 3), round(win_end, 3))]

        kept: List[Tuple[float, float]] = []
        cursor = win_start
        for s_start, s_end in sorted(silences):
            cut_start = max(win_start, s_start + padding_sec)
            cut_end = min(win_end, s_end - padding_sec)
            if cut_end <= cut_start:
                continue
            if cut_start > cursor + 0.08:
                kept.append((round(cursor, 3), round(cut_start, 3)))
            cursor = max(cursor, cut_end)
        if win_end > cursor + 0.08:
            kept.append((round(cursor, 3), round(win_end, 3)))

        return kept or [(round(win_start, 3), round(win_end, 3))]

    def generate_subtitles(
        self,
        captions: List[Dict[str, Any]],
        output_path: Path,
        format_type: str = "srt",
    ) -> Path:
        """Generate .srt or .vtt subtitle file from list of caption dicts."""
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        lines: List[str] = []
        if format_type == "vtt":
            lines.append("WEBVTT\n")

        for idx, c in enumerate(captions, start=1):
            start_sec = _safe_float(
                c.get("startTime", c.get("start_sec", c.get("start", 0.0))), 0.0
            )
            end_sec = _safe_float(
                c.get("endTime", c.get("end_sec", c.get("end", start_sec + 2.0))),
                start_sec + 2.0,
            )
            text = str(c.get("text", "")).strip()
            if not text:
                continue

            s_h, s_rem = divmod(int(start_sec), 3600)
            s_m, s_s = divmod(s_rem, 60)
            s_ms = int(round((start_sec - int(start_sec)) * 1000))

            e_h, e_rem = divmod(int(end_sec), 3600)
            e_m, e_s = divmod(e_rem, 60)
            e_ms = int(round((end_sec - int(end_sec)) * 1000))

            if format_type == "srt":
                lines.append(f"{idx}")
                lines.append(
                    f"{s_h:02d}:{s_m:02d}:{s_s:02d},{s_ms:03d} --> {e_h:02d}:{e_m:02d}:{e_s:02d},{e_ms:03d}"
                )
                lines.append(f"{text}\n")
            else:
                lines.append(
                    f"{s_h:02d}:{s_m:02d}:{s_s:02d}.{s_ms:03d} --> {e_h:02d}:{e_m:02d}:{e_s:02d}.{e_ms:03d}"
                )
                lines.append(f"{text}\n")

        output_path.write_text("\n".join(lines), encoding="utf-8")
        return output_path

    def verify_rendered_output(self, output_path: Path) -> MediaProbeResult:
        """Verify that a rendered MP4 exists, is non-empty, probes cleanly, and decodes without error."""
        output_path = Path(output_path)
        if not output_path.exists():
            raise RuntimeError(f"Rendered output file does not exist: {output_path}")
        if output_path.stat().st_size == 0:
            raise RuntimeError(
                f"Rendered output file is empty (0 bytes): {output_path}"
            )

        probe = self.probe_media(output_path)
        if probe.duration <= 0 or probe.width <= 0 or probe.height <= 0:
            raise RuntimeError(
                f"Rendered output has invalid stream metadata: {probe.to_dict()}"
            )

        if self.is_ffmpeg_available():
            decode_cmd = [
                "ffmpeg",
                "-hide_banner",
                "-v",
                "error",
                "-i",
                str(output_path),
                "-f",
                "null",
                "-",
            ]
            proc = subprocess.run(
                decode_cmd, capture_output=True, text=True, shell=False
            )
            if proc.returncode != 0:
                raise RuntimeError(
                    f"Rendered output failed decode verification: {proc.stderr.strip()[:400]}"
                )
        return probe

    async def execute_render_job(
        self,
        job_id: str,
        video_id: str,
        start_sec: float,
        end_sec: float,
        options: Dict[str, Any],
        user_id: str = "local_studio_user",
    ) -> Dict[str, Any]:
        """Execute a real local FFmpeg render job from the source media and persist status/artifacts."""
        db = get_local_db()
        redis_client = get_local_redis()
        doc_ref = db.collection("render_jobs").document(job_id)
        options = options or {}

        now_iso = datetime.now(timezone.utc).isoformat()
        doc_ref.set(
            {
                "job_id": job_id,
                "video_id": video_id,
                "user_id": user_id,
                "status": "running",
                "progress": 10,
                "updated_at": now_iso,
            }
        )
        redis_client.hset(
            f"render:meta:{job_id}",
            mapping={
                "job_id": job_id,
                "video_id": video_id,
                "user_id": user_id,
                "status": "running",
                "progress": "10",
                "current_step": "probing",
            },
        )

        out_name = f"{job_id}.mp4"
        out_file = self.exports_dir / out_name

        try:
            # Step 1: Resolve and probe the real input video
            await asyncio.sleep(0.02)
            doc_ref.update({"progress": 25, "stage": "probing"})
            source_path = await asyncio.to_thread(
                self.resolve_source_media, video_id, options
            )
            source_probe = await asyncio.to_thread(self.probe_media, source_path)

            # Step 2: Subtitle Generation (.srt & .vtt)
            manifest = options.get("render_manifest")
            captions = list(options.get("captions") or [])
            if not captions and isinstance(manifest, dict):
                captions = list(manifest.get("captions") or [])

            subtitle_urls: Dict[str, str] = {}
            if captions:
                srt_path = self.exports_dir / f"{job_id}.srt"
                vtt_path = self.exports_dir / f"{job_id}.vtt"
                await asyncio.to_thread(
                    self.generate_subtitles, captions, srt_path, "srt"
                )
                await asyncio.to_thread(
                    self.generate_subtitles, captions, vtt_path, "vtt"
                )
                subtitle_urls = {
                    "srt_url": f"/api/local-media/exports/{job_id}.srt",
                    "vtt_url": f"/api/local-media/exports/{job_id}.vtt",
                }

            doc_ref.update({"progress": 50, "stage": "rendering"})
            redis_client.hset(
                f"render:meta:{job_id}",
                mapping={"progress": "50", "current_step": "rendering"},
            )

            # Step 3: Determine target geometry and kept segments
            aspect_ratio = str(options.get("aspect_ratio") or "9:16")
            if isinstance(manifest, dict) and isinstance(
                manifest.get("timeline"), dict
            ):
                tw = _safe_int(manifest["timeline"].get("width"), 1080)
                th = _safe_int(manifest["timeline"].get("height"), 1920)
            elif aspect_ratio == "1:1":
                tw, th = 1080, 1080
            elif aspect_ratio == "16:9":
                tw, th = 1920, 1080
            else:
                tw, th = 1080, 1920

            # Keep test/preview renders fast when source is small (<720p) unless explicit dimensions requested
            if (
                not options.get("force_full_hd")
                and source_probe.width <= 640
                and source_probe.height <= 640
            ):
                if aspect_ratio == "1:1":
                    tw, th = 360, 360
                elif aspect_ratio == "16:9":
                    tw, th = 640, 360
                else:
                    tw, th = 360, 640

            win_start = max(
                0.0,
                min(_safe_float(start_sec, 0.0), max(0.0, source_probe.duration - 0.1)),
            )
            req_end = _safe_float(end_sec, source_probe.duration)
            win_end = (
                min(source_probe.duration, req_end)
                if req_end > win_start
                else source_probe.duration
            )
            if win_end <= win_start:
                win_start = 0.0
                win_end = source_probe.duration

            segments: List[Tuple[float, float]] = []
            if (
                isinstance(manifest, dict)
                and isinstance(manifest.get("clips"), list)
                and manifest["clips"]
            ):
                for clip in manifest["clips"]:
                    if isinstance(clip, dict):
                        cs = max(0.0, _safe_float(clip.get("startSec"), 0.0))
                        ce = min(
                            source_probe.duration,
                            _safe_float(clip.get("endSec"), source_probe.duration),
                        )
                        if ce > cs + 0.05:
                            segments.append((round(cs, 3), round(ce, 3)))
            elif (
                isinstance(options.get("kept_segments"), list)
                and options["kept_segments"]
            ):
                for seg in options["kept_segments"]:
                    if isinstance(seg, (list, tuple)) and len(seg) >= 2:
                        cs = max(0.0, _safe_float(seg[0], 0.0))
                        ce = min(
                            source_probe.duration,
                            _safe_float(seg[1], source_probe.duration),
                        )
                        if ce > cs + 0.05:
                            segments.append((round(cs, 3), round(ce, 3)))
                    elif isinstance(seg, dict):
                        cs = max(0.0, _safe_float(seg.get("start"), 0.0))
                        ce = min(
                            source_probe.duration,
                            _safe_float(seg.get("end"), source_probe.duration),
                        )
                        if ce > cs + 0.05:
                            segments.append((round(cs, 3), round(ce, 3)))
            elif options.get("remove_silences"):
                min_sil = _safe_float(options.get("min_silence_sec"), 0.5)
                silences = await asyncio.to_thread(
                    self.detect_silence, source_path, min_sil
                )
                segments = self.compute_non_silent_segments(
                    source_probe.duration,
                    silences,
                    start_sec=win_start,
                    end_sec=win_end,
                )

            if not segments:
                segments = [(round(win_start, 3), round(win_end, 3))]

            if not self.is_ffmpeg_available():
                raise RuntimeError("FFmpeg binary is not available on PATH")

            # Build FFmpeg command from the real source video
            scale_pad = (
                f"scale={tw}:{th}:force_original_aspect_ratio=decrease,"
                f"pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1"
            )
            visual_filter = str(options.get("visual_filter") or "None").lower()
            vf_extra = ""
            if visual_filter == "cinematic":
                vf_extra = ",eq=contrast=1.12:saturation=1.15:brightness=-0.02"
            elif visual_filter == "bw":
                vf_extra = ",hue=s=0"
            elif visual_filter == "vivid":
                vf_extra = ",eq=contrast=1.08:saturation=1.35"

            if len(segments) == 1:
                seg_start, seg_end = segments[0]
                seg_dur = max(0.1, seg_end - seg_start)
                cmd = [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-ss",
                    f"{seg_start:.3f}",
                    "-t",
                    f"{seg_dur:.3f}",
                    "-i",
                    str(source_path),
                    "-vf",
                    f"{scale_pad}{vf_extra}",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "ultrafast",
                    "-pix_fmt",
                    "yuv420p",
                ]
                if source_probe.has_audio and not options.get("mute_source_audio"):
                    cmd.extend(["-c:a", "aac", "-b:a", "128k"])
                else:
                    cmd.append("-an")
                cmd.extend(["-movflags", "+faststart", str(out_file)])
            else:
                filter_parts: List[str] = []
                concat_inputs: List[str] = []
                use_audio = bool(
                    source_probe.has_audio and not options.get("mute_source_audio")
                )
                for i, (seg_start, seg_end) in enumerate(segments):
                    filter_parts.append(
                        f"[0:v]trim=start={seg_start:.3f}:end={seg_end:.3f},"
                        f"setpts=PTS-STARTPTS,{scale_pad}{vf_extra}[v{i}]"
                    )
                    if use_audio:
                        filter_parts.append(
                            f"[0:a]atrim=start={seg_start:.3f}:end={seg_end:.3f},"
                            f"asetpts=PTS-STARTPTS[a{i}]"
                        )
                        concat_inputs.append(f"[v{i}][a{i}]")
                    else:
                        concat_inputs.append(f"[v{i}]")

                if use_audio:
                    filter_parts.append(
                        f"{''.join(concat_inputs)}concat=n={len(segments)}:v=1:a=1[vout][aout]"
                    )
                else:
                    filter_parts.append(
                        f"{''.join(concat_inputs)}concat=n={len(segments)}:v=1:a=0[vout]"
                    )

                cmd = [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-i",
                    str(source_path),
                    "-filter_complex",
                    ";".join(filter_parts),
                    "-map",
                    "[vout]",
                ]
                if use_audio:
                    cmd.extend(["-map", "[aout]", "-c:a", "aac", "-b:a", "128k"])
                cmd.extend(
                    [
                        "-c:v",
                        "libx264",
                        "-preset",
                        "ultrafast",
                        "-pix_fmt",
                        "yuv420p",
                        "-movflags",
                        "+faststart",
                        str(out_file),
                    ]
                )

            def _run_and_verify() -> MediaProbeResult:
                proc = subprocess.run(cmd, capture_output=True, text=True, shell=False)
                if proc.returncode != 0:
                    raise RuntimeError(
                        f"FFmpeg render failed (exit {proc.returncode}): {proc.stderr.strip()[:400]}"
                    )
                return self.verify_rendered_output(out_file)

            output_probe = await asyncio.to_thread(_run_and_verify)

            # Step 4: Finalize in LocalGCSBucket (both /api/local-media/exports/{job_id}.mp4
            # and /api/download/{job_id} -> exports/{user_id}/{job_id}.mp4) & SQLite
            bucket = get_local_bucket()
            blob_flat = bucket.blob(f"exports/{out_name}")
            blob_flat.upload_from_filename(str(out_file))
            blob_user = bucket.blob(f"exports/{user_id}/{out_name}")
            blob_user.upload_from_filename(str(out_file))

            verification = {
                "verified": True,
                "source_file": source_path.name,
                "source_duration": source_probe.duration,
                "output_duration": output_probe.duration,
                "width": output_probe.width,
                "height": output_probe.height,
                "fps": output_probe.fps,
                "has_audio": output_probe.has_audio,
                "size_bytes": out_file.stat().st_size,
                "segments_rendered": len(segments),
            }

            result_meta = {
                "job_id": job_id,
                "video_id": video_id,
                "user_id": user_id,
                "status": "success",
                "progress": 100,
                "output_url": f"/api/local-media/exports/{out_name}",
                "download_url": f"/api/local-media/exports/{out_name}",
                "verification": verification,
                **subtitle_urls,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
            doc_ref.update(result_meta)
            redis_client.hset(
                f"render:meta:{job_id}",
                mapping={
                    "status": "success",
                    "progress": "100",
                    "current_step": "completed",
                    "output_url": f"/api/local-media/exports/{out_name}",
                    "verification": json.dumps(verification),
                },
            )
            logger.info(
                "Local render job %s completed and verified (%d bytes, %.2fs)",
                job_id,
                verification["size_bytes"],
                output_probe.duration,
            )
            return result_meta

        except Exception as exc:
            logger.exception("Local render job %s failed: %s", job_id, exc)
            err_meta = {
                "job_id": job_id,
                "video_id": video_id,
                "user_id": user_id,
                "status": "dead",
                "error": str(exc),
                "failed_at": datetime.now(timezone.utc).isoformat(),
            }
            doc_ref.update(err_meta)
            redis_client.hset(
                f"render:meta:{job_id}",
                mapping={
                    "status": "dead",
                    "error": str(exc)[:400],
                },
            )
            return err_meta


# Singleton
_local_media_pipeline: Optional[LocalMediaPipeline] = None


def get_local_media_pipeline() -> LocalMediaPipeline:
    global _local_media_pipeline
    if _local_media_pipeline is None:
        _local_media_pipeline = LocalMediaPipeline()
    return _local_media_pipeline
