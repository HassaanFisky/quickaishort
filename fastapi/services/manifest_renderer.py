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

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from models.render_manifest import RenderManifest

# Legacy RenderService treats audioBoost 85 as unity gain; both server render
# paths must share this constant or the same project exports at two volumes.
AUDIO_BOOST_UNITY = 85.0
FADE_SECONDS = 0.5


class ManifestRenderError(ValueError):
    pass


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _as_float(value: Any, default: float) -> float:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return default
    return default if out != out else out  # NaN guard


def _escape_drawtext(text: str) -> str:
    """Escape text for the FFmpeg drawtext filter (caption/watermark)."""
    text = str(text or "")
    text = text.replace("\r", " ").replace("\n", " ")
    text = text.replace("\\", "\\\\")
    text = text.replace("'", "\u2019")  # single quotes terminate the filter arg
    text = text.replace(":", "\\:")
    text = text.replace("%", "\\%")
    text = text.replace(",", "\\,")
    text = text.replace(";", "\\;")
    text = text.replace("[", "\\[")
    text = text.replace("]", "\\]")
    text = text.replace("=", "\\=")
    return text[:240]


def compile_manifest_to_ffmpeg(
    manifest_dict: Dict[str, Any],
    workdir: Path,
    input_resolver=None,
    watermark_text: Optional[str] = None,
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

    # ── Effects chain (single source of truth for manifest-driven renders) ────
    # Only effect types that frontend compileRenderManifest actually emits are
    # handled here: frame_filter, export_settings, default_transition.
    def _effect(*types: str):
        return next((e for e in manifest.effects if e.type in types), None)

    frame_filter_effect = _effect("frame_filter", "FRAME_FILTER")
    export_settings_effect = _effect("export_settings", "EXPORT_SETTINGS")

    v_effects: List[str] = []
    a_effects: List[str] = []

    # 1. Frame filters — mapped to match the CSS filter chain used by the
    #    editor preview (VideoCanvas.getCssFilter), not to FFmpeg's own scales.
    if frame_filter_effect and isinstance(frame_filter_effect.payload, dict):
        fp = frame_filter_effect.payload
        brightness = _as_float(fp.get("brightness"), 1.0)
        contrast = _as_float(fp.get("contrast"), 1.0)
        saturation = _as_float(fp.get("saturation"), 1.0)
        hue = _as_float(fp.get("hue"), 0.0)
        blur = _as_float(fp.get("blur"), 0.0)
        opacity = _as_float(fp.get("opacity"), 1.0)

        # CSS brightness()/opacity() are multiplicative; FFmpeg eq=brightness is
        # an additive offset, so eq would blow out highlights. colorchannelmixer
        # is the multiplicative equivalent.
        gain = _clamp(brightness, 0.0, 4.0) * _clamp(opacity, 0.0, 1.0)
        if abs(gain - 1.0) > 1e-3:
            v_effects.append(
                f"colorchannelmixer=rr={gain:.4f}:gg={gain:.4f}:bb={gain:.4f}"
            )

        # eq contrast/saturation are centred the same way as the CSS functions.
        eq_params = []
        if abs(contrast - 1.0) > 1e-3:
            eq_params.append(f"contrast={_clamp(contrast, 0.0, 4.0):.4f}")
        if abs(saturation - 1.0) > 1e-3:
            eq_params.append(f"saturation={_clamp(saturation, 0.0, 4.0):.4f}")
        if eq_params:
            v_effects.append(f"eq={':'.join(eq_params)}")

        if abs(hue) > 1e-3:
            v_effects.append(f"hue=h={_clamp(hue, -360.0, 360.0):.3f}")

        # CSS blur() is a Gaussian with std-dev in px — gblur, not boxblur.
        if blur > 0.0:
            v_effects.append(f"gblur=sigma={_clamp(blur, 0.0, 50.0):.3f}")

        cl = _clamp(_as_float(fp.get("cropLeft"), 0.0), 0.0, 0.49)
        cr = _clamp(_as_float(fp.get("cropRight"), 0.0), 0.0, 0.49)
        ct = _clamp(_as_float(fp.get("cropTop"), 0.0), 0.0, 0.49)
        cb = _clamp(_as_float(fp.get("cropBottom"), 0.0), 0.0, 0.49)
        if cl or cr or ct or cb:
            remain_w = max(0.02, 1.0 - cl - cr)
            remain_h = max(0.02, 1.0 - ct - cb)
            v_effects.append(
                f"crop=w=iw*{remain_w:.4f}:h=ih*{remain_h:.4f}"
                f":x=iw*{cl:.4f}:y=ih*{ct:.4f}"
            )

    # 2. Export settings — style preset, speed, audio. Baselines must match the
    #    legacy RenderService path so both server renderers agree.
    if export_settings_effect and isinstance(export_settings_effect.payload, dict):
        ep = export_settings_effect.payload
        preset = str(ep.get("filter", "None"))
        if preset == "Urban":
            v_effects.append("eq=contrast=1.2:saturation=0.8:gamma=1.1")
        elif preset == "Retro":
            v_effects.append("eq=contrast=1.1:saturation=0.85:brightness=-0.05")
        elif preset == "Cinematic":
            v_effects.append("eq=contrast=1.1:saturation=1.2")

        # SET_PLAYBACK_SPEED only reaches the renderer through export settings;
        # without this the preview speeds up but the exported file does not.
        speed_pct = _as_float(ep.get("playbackSpeed"), 100.0)
        if abs(speed_pct - 100.0) > 1e-3:
            speed = _clamp(speed_pct / 100.0, 0.5, 2.0)
            v_effects.append(f"setpts={1.0 / speed:.6f}*PTS")
            a_effects.append(f"atempo={speed:.6f}")

        # Legacy RenderService treats 85 as unity gain; keep one contract.
        audio_boost = _as_float(ep.get("audioBoost"), AUDIO_BOOST_UNITY)
        if abs(audio_boost - AUDIO_BOOST_UNITY) > 1e-3:
            vol = _clamp(audio_boost / AUDIO_BOOST_UNITY, 0.0, 4.0)
            a_effects.append(f"volume={vol:.4f}")

        if _as_float(ep.get("noiseSuppression"), 0.0) > 0:
            a_effects.append("highpass=f=200")

        if bool(ep.get("voiceoverEnabled")):
            a_effects.append("equalizer=f=3000:width_type=h:width=2000:g=5")

        # ADD_FADE_IN/ADD_FADE_OUT land on exportSettings.transitionEnabled in the
        # editor store; that flag is the only fade signal the manifest carries.
        if bool(ep.get("transitionEnabled")):
            total = max(0.0, float(manifest.timeline.duration))
            fade_d = min(FADE_SECONDS, total / 2.0) if total > 0 else FADE_SECONDS
            if fade_d > 0.01:
                v_effects.append(f"fade=t=in:st=0:d={fade_d:.3f}")
                a_effects.append(f"afade=t=in:st=0:d={fade_d:.3f}")
                if total > fade_d:
                    out_st = total - fade_d
                    v_effects.append(f"fade=t=out:st={out_st:.3f}:d={fade_d:.3f}")
                    a_effects.append(f"afade=t=out:st={out_st:.3f}:d={fade_d:.3f}")

    # 3. Colour grade — mirrors VideoCanvas.getCssFilter's clipColorState branch
    #    so a grade applied in preview also lands in the exported file.
    clip_color_effect = _effect("clip_color", "CLIP_COLOR")
    if clip_color_effect and isinstance(clip_color_effect.payload, dict):
        cp = clip_color_effect.payload
        exposure = _as_float(cp.get("exposure"), 0.0)
        if abs(exposure) > 1e-3:
            gain = _clamp(2.0**exposure, 0.0, 4.0)
            v_effects.append(
                f"colorchannelmixer=rr={gain:.4f}:gg={gain:.4f}:bb={gain:.4f}"
            )

        grade_eq = []
        c_contrast = _as_float(cp.get("contrast"), 1.0)
        if abs(c_contrast - 1.0) > 1e-3:
            grade_eq.append(f"contrast={_clamp(c_contrast, 0.0, 4.0):.4f}")
        c_saturation = _as_float(cp.get("saturation"), 1.0)
        if abs(c_saturation - 1.0) > 1e-3:
            grade_eq.append(f"saturation={_clamp(c_saturation, 0.0, 4.0):.4f}")
        if grade_eq:
            v_effects.append(f"eq={':'.join(grade_eq)}")

        hue_shift = _as_float(cp.get("hueShift"), 0.0)
        # satAdjust/lumAdjust are HSL_SECONDARIES percentages (-100..100).
        sat_adjust = _clamp(_as_float(cp.get("satAdjust"), 0.0), -100.0, 100.0)
        lum_adjust = _clamp(_as_float(cp.get("lumAdjust"), 0.0), -100.0, 100.0)
        hue_args = []
        if abs(hue_shift) > 1e-3:
            hue_args.append(f"h={_clamp(hue_shift, -360.0, 360.0):.3f}")
        if abs(sat_adjust) > 1e-3:
            hue_args.append(f"s={1.0 + sat_adjust / 100.0:.4f}")
        if abs(lum_adjust) > 1e-3:
            hue_args.append(f"b={lum_adjust / 100.0:.4f}")
        if hue_args:
            v_effects.append(f"hue={':'.join(hue_args)}")

    # 4. Dub / mute — muteSourceAudio is a first-class manifest field.
    if manifest.muteSourceAudio:
        a_effects.append("volume=0.0")

    # 5. Captions from the composition snapshot. Times are timeline seconds
    #    after compileRenderManifest remaps them through the edit window.
    captions_enabled = True
    if export_settings_effect and isinstance(export_settings_effect.payload, dict):
        captions_enabled = bool(
            export_settings_effect.payload.get("captionsEnabled", True)
        )
    if captions_enabled:
        for cap in list(manifest.captions or [])[:24]:
            text = str(getattr(cap, "text", "") or "").strip()
            if not text:
                continue
            start = max(0.0, _as_float(getattr(cap, "startTime", 0.0), 0.0))
            end = max(start + 0.05, _as_float(getattr(cap, "endTime", start + 2.0), start + 2.0))
            v_effects.append(
                f"drawtext=text='{_escape_drawtext(text)}'"
                f":fontsize=42:fontcolor=white:borderw=2:bordercolor=black"
                f":x=(w-text_w)/2:y=h-th-140"
                f":enable='between(t,{start:.3f},{end:.3f})'"
            )

    # 6. Tier watermark. The manifest branch bypasses the legacy filtergraph, so
    #    the Free-tier watermark has to be burned in here or it is lost.
    if watermark_text:
        v_effects.append(
            f"drawtext=text='{_escape_drawtext(watermark_text)}'"
            f":fontsize=48:fontcolor=white@0.8:x=w-tw-40:y=h-th-40"
        )

    filter_parts.append(
        f"[v_concat]{','.join(v_effects)}[vout]"
        if v_effects
        else "[v_concat]null[vout]"
    )
    filter_parts.append(
        f"[a_concat]{','.join(a_effects)}[aout]"
        if a_effects
        else "[a_concat]anull[aout]"
    )

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
