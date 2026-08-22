"""RenderManifest → FFmpeg compiler.

Converts a validated RenderManifest dict into an FFmpeg filter_complex
that concatenates timeline clips in order, and applies:
- Visual frame filters (brightness, contrast, saturation, hue, blur, crop)
- Style presets (Cinematic, Urban, Retro)
- Audio dynamics (volume gain/boost, noise reduction highpass, fade in/out)
- Captions overlay
- Audio mute / dub track routing
"""

from __future__ import annotations

import json
import re
import shlex
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from models.render_manifest import RenderManifest


class ManifestRenderError(ValueError):
    pass


def _escape_drawtext(text: str) -> str:
    """Escape text for FFmpeg drawtext filter."""
    text = str(text or "")
    text = text.replace("\\", "\\\\")
    text = text.replace("'", "\u2019")  # replace single quote with right single quote
    text = text.replace(":", "\\:")
    text = text.replace("%", "\\%")
    return text


def compile_manifest_to_ffmpeg(
    manifest_dict: Dict[str, Any],
    workdir: Path,
    input_resolver=None,
) -> Tuple[str, Dict[str, Any]]:
    """
    Compile a RenderManifest into an FFmpeg filter_complex.

    Returns:
        (filter_complex, render_meta)
        filter_complex: str suitable for `-filter_complex`
        render_meta: {"duration": float, "width": int, "height": int, "fps": float, "clip_count": int}
    """
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

    filter_parts: List[str] = []
    concat_inputs: List[str] = []

    tw, th = manifest.timeline.width, manifest.timeline.height
    fps = manifest.timeline.fps

    for i, clip in enumerate(clips):
        src_idx = source_to_index[clip.sourceId]
        v_label = f"v{i}"
        a_label = f"a{i}"
        start = max(0.0, clip.startSec)
        end = max(start + 0.05, clip.endSec)
        speed = clip.speed if clip.speed and clip.speed > 0 else 1.0

        # video trim + speed + scale/pad
        vf = f"[{src_idx}:v]trim=start={start}:end={end},setpts=PTS-STARTPTS"
        if speed != 1.0:
            vf += f",setpts=PTS/{speed}"
        # scale to fit target canvas, pad letterbox
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
            atempo = max(0.5, min(2.0, speed))
            af += f",atempo={atempo}"
        af += f"[{a_label}]"
        filter_parts.append(af)
        concat_inputs.append(f"[{a_label}]")

    # concat n segments, v=1 a=1 per segment
    n = len(clips)
    concat_filter = "".join(concat_inputs) + f"concat=n={n}:v=1:a=1[v_concat][a_concat]"
    filter_parts.append(concat_filter)

    # ── Effects Chain on Video ────────────────────────────────────────────────
    curr_v_label = "v_concat"
    curr_a_label = "a_concat"

    # Extract effects
    frame_filter_effect = next(
        (e for e in manifest.effects if e.type in ("frame_filter", "FRAME_FILTER")),
        None,
    )
    export_settings_effect = next(
        (e for e in manifest.effects if e.type in ("export_settings", "EXPORT_SETTINGS")),
        None,
    )
    fade_in_effect = next(
        (e for e in manifest.effects if e.type in ("fade_in", "ADD_FADE_IN")),
        None,
    )
    fade_out_effect = next(
        (e for e in manifest.effects if e.type in ("fade_out", "ADD_FADE_OUT")),
        None,
    )

    v_effects: List[str] = []
    a_effects: List[str] = []

    # 1. Frame filters (brightness, contrast, saturation, hue, blur, crop)
    if frame_filter_effect and isinstance(frame_filter_effect.payload, dict):
        fp = frame_filter_effect.payload
        brightness = float(fp.get("brightness", 1.0))
        contrast = float(fp.get("contrast", 1.0))
        saturation = float(fp.get("saturation", 1.0))
        hue = float(fp.get("hue", 0.0))
        blur = float(fp.get("blur", 0.0))

        eq_params = []
        if brightness != 1.0:
            # map [0.5, 2.0] where 1.0 is 0 offset to [-0.5, 0.5]
            eq_params.append(f"brightness={brightness - 1.0:.2f}")
        if contrast != 1.0:
            eq_params.append(f"contrast={contrast:.2f}")
        if saturation != 1.0:
            eq_params.append(f"saturation={saturation:.2f}")

        if eq_params:
            v_effects.append(f"eq={':'.join(eq_params)}")

        if hue != 0.0:
            v_effects.append(f"hue=h={hue:.1f}")

        if blur > 0.0:
            b_val = max(1, min(20, int(blur * 2)))
            v_effects.append(f"boxblur={b_val}:{b_val}")

        # Crop / Pan
        cl = float(fp.get("cropLeft", 0.0))
        cr = float(fp.get("cropRight", 0.0))
        ct = float(fp.get("cropTop", 0.0))
        cb = float(fp.get("cropBottom", 0.0))
        if cl > 0 or cr > 0 or ct > 0 or cb > 0:
            remain_w = max(0.1, 1.0 - cl - cr)
            remain_h = max(0.1, 1.0 - ct - cb)
            v_effects.append(f"crop=w=iw*{remain_w:.3f}:h=ih*{remain_h:.3f}:x=iw*{cl:.3f}:y=ih*{ct:.3f}")

    # 2. Export settings visual preset
    if export_settings_effect and isinstance(export_settings_effect.payload, dict):
        ep = export_settings_effect.payload
        filter_preset = str(ep.get("filter", "None"))
        if filter_preset == "Urban":
            v_effects.append("eq=contrast=1.2:saturation=0.8:gamma=1.1")
        elif filter_preset == "Retro":
            v_effects.append("eq=contrast=1.1:saturation=0.85:brightness=-0.05")
        elif filter_preset == "Cinematic":
            v_effects.append("eq=contrast=1.15:saturation=1.1:brightness=-0.05")

        # Audio boost / Noise suppression
        audio_boost = float(ep.get("audioBoost", 100))
        if audio_boost != 100.0 and audio_boost >= 0:
            vol_factor = audio_boost / 100.0
            a_effects.append(f"volume={vol_factor:.2f}")

        noise_suppression = float(ep.get("noiseSuppression", 0))
        if noise_suppression > 0:
            a_effects.append("highpass=f=200")

    # 3. Fade In / Out
    if fade_in_effect and isinstance(fade_in_effect.payload, dict):
        dur_ms = float(fade_in_effect.payload.get("duration_ms", 500.0))
        dur_s = max(0.1, dur_ms / 1000.0)
        v_effects.append(f"fade=t=in:st=0:d={dur_s:.2f}")
        a_effects.append(f"afade=t=in:st=0:d={dur_s:.2f}")

    if fade_out_effect and isinstance(fade_out_effect.payload, dict):
        st_ms = float(fade_out_effect.payload.get("start_ms", 0.0))
        dur_ms = float(fade_out_effect.payload.get("duration_ms", 500.0))
        st_s = max(0.0, st_ms / 1000.0)
        dur_s = max(0.1, dur_ms / 1000.0)
        v_effects.append(f"fade=t=out:st={st_s:.2f}:d={dur_s:.2f}")
        a_effects.append(f"afade=t=out:st={st_s:.2f}:d={dur_s:.2f}")

    # 4. Audio Mute / Dub Audio
    if manifest.muteSourceAudio:
        a_effects.append("volume=0.0")

    # Apply video effects
    if v_effects:
        filter_parts.append(f"[{curr_v_label}]{','.join(v_effects)}[vout]")
    else:
        # Pass through
        filter_parts.append(f"[{curr_v_label}]null[vout]")

    # Apply audio effects
    if a_effects:
        filter_parts.append(f"[{curr_a_label}]{','.join(a_effects)}[aout]")
    else:
        # Pass through
        filter_parts.append(f"[{curr_a_label}]anull[aout]")

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
    filter_complex, meta = compile_manifest_to_ffmpeg(manifest_dict, workdir)

    # Map quality → crf
    crf_map = {"low": "28", "medium": "23", "high": "18"}
    crf = crf_map.get(quality, "23")

    manifest = RenderManifest.model_validate(manifest_dict)
    clips = sorted(manifest.clips, key=lambda c: c.timelineStartSec)
    seen = []
    for c in clips:
        if c.sourceId not in seen:
            seen.append(c.sourceId)

    cmd = ["ffmpeg", "-y"]
    for src_id in seen:
        src_path = workdir / src_id
        if not src_path.exists() and input_files:
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
