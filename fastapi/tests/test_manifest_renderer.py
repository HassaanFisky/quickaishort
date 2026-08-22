import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

from services.manifest_renderer import compile_manifest_to_ffmpeg, ManifestRenderError

_HAS_FFMPEG = shutil.which("ffmpeg") is not None


def _make_manifest(clips=1, effects=None, mute=False):
    base_clip = {
        "id": "c1",
        "trackId": "v1",
        "sourceId": "input.mp4",
        "startSec": 0.0,
        "endSec": 2.0,
        "timelineStartSec": 0.0,
        "speed": 1.0,
    }
    clips_arr = []
    for i in range(clips):
        c = base_clip.copy()
        c["id"] = f"c{i+1}"
        c["timelineStartSec"] = float(i * 2)
        clips_arr.append(c)
    manifest = {
        "version": 1,
        "generatedAt": 1718000000000,
        "timeline": {"fps": 30, "width": 1080, "height": 1920, "duration": clips * 2.0},
        "tracks": [
            {
                "id": "v1",
                "type": "video",
                "label": "V1",
                "locked": False,
                "muted": False,
            }
        ],
        "clips": clips_arr,
        "captions": [],
        "overlays": [],
        "effects": effects or [],
        "keyframes": [],
    }
    if mute:
        manifest["muteSourceAudio"] = True
    return manifest


def _frame_filter(**payload):
    return {"id": "e1", "type": "frame_filter", "payload": payload}


def _export_settings(**payload):
    return {"id": "e2", "type": "export_settings", "payload": payload}


def test_compile_single_clip():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        fc, meta = compile_manifest_to_ffmpeg(_make_manifest(1), workdir)
        assert "trim=start=0" in fc
        assert "concat=n=1" in fc
        assert fc.endswith("[aout]") or "[aout]" in fc
        assert "[vout]" in fc
        assert meta["clip_count"] == 1
        assert meta["width"] == 1080


def test_compile_three_clips():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        fc, meta = compile_manifest_to_ffmpeg(_make_manifest(3), workdir)
        assert "concat=n=3" in fc
        assert meta["clip_count"] == 3


def test_missing_source_raises():
    with tempfile.TemporaryDirectory() as td:
        with pytest.raises(ManifestRenderError, match="Missing source asset"):
            compile_manifest_to_ffmpeg(_make_manifest(1), Path(td))


def test_invalid_manifest_raises():
    with tempfile.TemporaryDirectory() as td:
        bad = {"version": 1, "generatedAt": 0, "timeline": {"fps": 30}}
        with pytest.raises(ManifestRenderError):
            compile_manifest_to_ffmpeg(bad, Path(td))


# ── Preview parity: CSS filter semantics, not FFmpeg's own scales ───────────


def test_brightness_is_multiplicative_not_additive():
    """CSS brightness(k) multiplies. eq=brightness is an additive offset and
    blew out highlights, so the compiler must not use it for brightness."""
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        fc, _ = compile_manifest_to_ffmpeg(
            _make_manifest(1, [_frame_filter(brightness=1.25)]), workdir
        )
        assert "colorchannelmixer=rr=1.2500:gg=1.2500:bb=1.2500" in fc
        assert "eq=brightness" not in fc


def test_opacity_folds_into_the_same_gain_term():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        fc, _ = compile_manifest_to_ffmpeg(
            _make_manifest(1, [_frame_filter(brightness=1.0, opacity=0.5)]), workdir
        )
        assert "colorchannelmixer=rr=0.5000" in fc


def test_blur_uses_gaussian_to_match_css_blur():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        fc, _ = compile_manifest_to_ffmpeg(
            _make_manifest(1, [_frame_filter(blur=4.0)]), workdir
        )
        assert "gblur=sigma=4.000" in fc
        assert "boxblur" not in fc


def test_contrast_saturation_hue_and_crop_compile():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        fc, _ = compile_manifest_to_ffmpeg(
            _make_manifest(
                1,
                [
                    _frame_filter(
                        contrast=1.1,
                        saturation=1.3,
                        hue=15.0,
                        cropLeft=0.1,
                        cropRight=0.1,
                    )
                ],
            ),
            workdir,
        )
        assert "contrast=1.1000" in fc
        assert "saturation=1.3000" in fc
        assert "hue=h=15.000" in fc
        assert "crop=w=iw*0.8000" in fc


def test_neutral_frame_filter_emits_no_colour_ops():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        fc, _ = compile_manifest_to_ffmpeg(
            _make_manifest(
                1,
                [_frame_filter(brightness=1.0, contrast=1.0, saturation=1.0, hue=0.0)],
            ),
            workdir,
        )
        assert "colorchannelmixer" not in fc
        assert "[v_concat]null[vout]" in fc


# ── Export settings: speed, audio, fades ────────────────────────────────────


def test_playback_speed_reaches_the_renderer():
    """SET_PLAYBACK_SPEED only travels via exportSettings; if the compiler drops
    it the preview speeds up but the exported file does not."""
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        fc, _ = compile_manifest_to_ffmpeg(
            _make_manifest(1, [_export_settings(playbackSpeed=150)]), workdir
        )
        assert "setpts=0.666667*PTS" in fc
        assert "atempo=1.500000" in fc


def test_audio_boost_uses_the_legacy_unity_baseline():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        # 85 is unity in RenderService; the default must be a no-op.
        fc, _ = compile_manifest_to_ffmpeg(
            _make_manifest(1, [_export_settings(audioBoost=85)]), workdir
        )
        assert "volume=" not in fc

        fc, _ = compile_manifest_to_ffmpeg(
            _make_manifest(1, [_export_settings(audioBoost=170)]), workdir
        )
        assert "volume=2.0000" in fc


def test_transition_enabled_produces_reachable_fades():
    """ADD_FADE_IN/OUT land on exportSettings.transitionEnabled — that flag is
    the only fade signal the manifest actually carries."""
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        fc, _ = compile_manifest_to_ffmpeg(
            _make_manifest(1, [_export_settings(transitionEnabled=True)]), workdir
        )
        assert "fade=t=in:st=0:d=0.500" in fc
        assert "fade=t=out:st=1.500:d=0.500" in fc
        assert "afade=t=in" in fc


def test_clip_color_grade_reaches_the_renderer():
    """HSL_SECONDARIES / exposure live in clipColorState, not frameFilters. If
    the compiler ignores them the grade is preview-only."""
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        effect = {
            "id": "e3",
            "type": "clip_color",
            "payload": {
                "exposure": 1.0,
                "saturation": 1.2,
                "hueShift": 20.0,
                "satAdjust": 25.0,
                "lumAdjust": -10.0,
            },
        }
        fc, _ = compile_manifest_to_ffmpeg(_make_manifest(1, [effect]), workdir)
        assert "colorchannelmixer=rr=2.0000" in fc  # 2^1.0 exposure stops
        assert "eq=saturation=1.2000" in fc
        assert "hue=h=20.000:s=1.2500:b=-0.1000" in fc


def test_mute_source_audio_zeroes_the_track():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        fc, _ = compile_manifest_to_ffmpeg(_make_manifest(1, mute=True), workdir)
        assert "volume=0.0" in fc


# ── Tier policy: the manifest branch must not lose the watermark ────────────


def test_watermark_is_burned_into_the_manifest_filtergraph():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        fc, _ = compile_manifest_to_ffmpeg(
            _make_manifest(1), workdir, watermark_text="Made with QuickAI"
        )
        assert "drawtext=text='Made with QuickAI'" in fc
        assert "x=w-tw-40:y=h-th-40" in fc


def test_no_watermark_when_not_required():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        fc, _ = compile_manifest_to_ffmpeg(_make_manifest(1), workdir)
        assert "drawtext" not in fc


def test_watermark_text_cannot_break_out_of_the_filter_argument():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        fc, _ = compile_manifest_to_ffmpeg(
            _make_manifest(1), workdir, watermark_text="a':b%c\\d"
        )
        # No raw single quote may survive, or the drawtext arg terminates early.
        drawtext = fc[fc.index("drawtext=text='") + len("drawtext=text='"):]
        assert "'" == drawtext[drawtext.index("'")]  # first quote is the closer
        assert "\\:" in fc


# ── Runtime proof: the graph must actually execute in FFmpeg ────────────────


@pytest.mark.skipif(not _HAS_FFMPEG, reason="FFmpeg binary unavailable")
def test_generated_filtergraph_executes_and_brightness_matches_css():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        source = workdir / "input.mp4"
        subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "color=c=0x808080:s=320x240:d=2:r=10",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                "-pix_fmt", "yuv420p", "-shortest", str(source),
            ],
            check=True,
        )

        # Match the source aspect so scale/pad adds no black bars — otherwise
        # letterboxing, not the colour maths, dominates the measured average.
        manifest = _make_manifest(1, [_frame_filter(brightness=1.25)])
        manifest["timeline"] = {
            "fps": 10,
            "width": 320,
            "height": 240,
            "duration": 2.0,
        }

        fc, _ = compile_manifest_to_ffmpeg(
            manifest, workdir, watermark_text="Made with QuickAI"
        )
        out = workdir / "out.mp4"
        proc = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-i", str(source),
                "-filter_complex", fc,
                "-map", "[vout]", "-map", "[aout]",
                "-c:v", "libx264", "-crf", "23", "-preset", "ultrafast",
                "-c:a", "aac", str(out),
            ],
            capture_output=True,
        )
        assert proc.returncode == 0, proc.stderr.decode()[-2000:]
        assert out.exists() and out.stat().st_size > 0

        probe = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-v", "info", "-i", str(out),
                "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
                "-frames:v", "1", "-f", "null", "-",
            ],
            capture_output=True,
        )
        match = re.search(rb"YAVG=([0-9.]+)", probe.stdout)
        assert match, probe.stdout[-500:]
        yavg = float(match.group(1))
        # Source luma is ~126; CSS brightness(1.25) => ~157. The old additive
        # eq=brightness=0.25 mapping produced ~189.
        assert 145.0 < yavg < 170.0, f"luma {yavg} is not a 1.25x multiply"
