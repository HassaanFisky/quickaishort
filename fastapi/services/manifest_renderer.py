"""RenderManifest → FFmpeg compiler.

Phase 61
Converts a validated RenderManifest dict into an FFmpeg filter_complex
that concatenates timeline clips in order.

Keeps existing RenderService code path intact – this is a parallel
ingest that produces a RenderJob compatible with RenderService.
"""

from __future__ import annotations

import json
import shlex
from pathlib import Path
from typing import Any, Dict, List, Tuple

from models.render_manifest import RenderManifest


class ManifestRenderError(ValueError):
    pass


def compile_manifest_to_ffmpeg(
    manifest_dict: Dict[str, Any],
    workdir: Path,
    input_resolver=None,
) -> Tuple[str, Dict[str, Any]]:
    """
    Compile a RenderManifest into an FFmpeg concat filter_complex.

    Returns:
        (filter_complex, render_meta)
        filter_complex: str suitable for `-filter_complex`
        render_meta: {"duration": float, "width": int, "height": int, "fps": float, "clip_count": int}

    input_resolver(sourceId: str) -> Path
        Callable that resolves a manifest sourceId to a local file.
        Default: workdir / sourceId
    """
    # Validate with Pydantic – raises ValidationError if bad
    try:
        manifest = RenderManifest.model_validate(manifest_dict)
    except Exception as e:
        raise ManifestRenderError(f"Invalid RenderManifest: {e}")

    if input_resolver is None:

        def input_resolver(sid: str) -> Path:
            return workdir / sid

    # Sort clips by timelineStartSec
    clips = sorted(manifest.clips, key=lambda c: c.timelineStartSec)
    if not clips:
        raise ManifestRenderError("Manifest contains 0 clips – nothing to render")

    # Build input list – deduplicate source files
    source_to_index: Dict[str, int] = {}
    inputs: List[Path] = []
    for clip in clips:
        if clip.sourceId not in source_to_index:
            src_path = input_resolver(clip.sourceId)
            if not src_path.exists():
                raise ManifestRenderError(
                    f"Missing source asset: {clip.sourceId} → {src_path}"
                )
            source_to_index[clip.sourceId] = len(inputs)
            inputs.append(src_path)

    # Build filter_complex: trim each clip, setpts, scale/pad to timeline size, concat
    filter_parts: List[str] = []
    concat_inputs: List[str] = []

    tw, th = manifest.timeline.width, manifest.timeline.height
    fps = manifest.timeline.fps

    for i, clip in enumerate(clips):
        src_idx = source_to_index[clip.sourceId]
        # trim
        # [0:v]trim=start=5:end=20,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30[v0];
        v_label = f"v{i}"
        a_label = f"a{i}"
        start = max(0.0, clip.startSec)
        end = max(start + 0.05, clip.endSec)
        speed = clip.speed if clip.speed and clip.speed > 0 else 1.0

        # video trim + speed + scale/pad
        vf = f"[{src_idx}:v]trim=start={start}:end={end},setpts=PTS-STARTPTS"
        if speed != 1.0:
            vf += f",setpts=PTS/{speed}"
        # scale to fit 9:16 canvas, pad letterbox
        vf += (
            f",scale={tw}:{th}:force_original_aspect_ratio=decrease"
            f",pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2:color=black"
            f",fps={fps},format=yuv420p[{v_label}]"
        )
        filter_parts.append(vf)
        concat_inputs.append(f"[{v_label}]")

        # audio trim + atempo
        af = f"[{src_idx}:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS"
        if speed != 1.0:
            # atempo only supports 0.5-2.0, chain if needed – simple case here
            atempo = max(0.5, min(2.0, speed))
            af += f",atempo={atempo}"
        af += f"[{a_label}]"
        filter_parts.append(af)
        concat_inputs.append(f"[{a_label}]")

    # concat n segments, v=1 a=1 per segment
    n = len(clips)
    concat_filter = "".join(concat_inputs) + f"concat=n={n}:v=1:a=1[vout][aout]"
    filter_parts.append(concat_filter)

    filter_complex = ";".join(filter_parts)

    render_meta = {
        "duration": manifest.timeline.duration,
        "width": tw,
        "height": th,
        "fps": fps,
        "clip_count": n,
        "source_count": len(inputs),
    }

    return filter_complex, render_meta


def build_ffmpeg_manifest_cmd(
    manifest_dict: Dict[str, Any],
    input_files: List[Path],
    output_path: Path,
    workdir: Path,
    quality: str = "medium",
) -> List[str]:
    """
    Build a full ffmpeg command line for a RenderManifest.
    Returns argv list suitable for subprocess.run
    """
    # Re-resolve inputs by sourceId order expected by compile_manifest_to_ffmpeg
    # For Phase 61 simple case: input_files[0] is the primary source
    # Full multi-source mapping is done in compile_manifest_to_ffmpeg via input_resolver

    # We need to inject the actual input files into the workdir with their sourceId names
    # Caller is responsible for staging files – here we just compile
    filter_complex, meta = compile_manifest_to_ffmpeg(manifest_dict, workdir)

    # Map quality → crf
    crf_map = {"low": "28", "medium": "23", "high": "18"}
    crf = crf_map.get(quality, "23")

    # Build input args – we need to know which source files the manifest references
    # Re-parse to get unique sourceIds in clip order
    manifest = RenderManifest.model_validate(manifest_dict)
    clips = sorted(manifest.clips, key=lambda c: c.timelineStartSec)
    seen = []
    for c in clips:
        if c.sourceId not in seen:
            seen.append(c.sourceId)

    # input_files must match seen order, or be resolvable in workdir
    cmd = ["ffmpeg", "-y"]
    for src_id in seen:
        src_path = workdir / src_id
        if not src_path.exists() and input_files:
            # fallback: first input file satisfies first source
            src_path = input_files[0]
        cmd.extend(["-i", str(src_path)])

    cmd.extend(
        [
            "-filter_complex",
            filter_complex,
            "-map",
            "[vout]",
            "-map",
            "[aout]",
            "-c:v",
            "libx264",
            "-crf",
            crf,
            "-preset",
            "medium",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
    )
    return cmd
