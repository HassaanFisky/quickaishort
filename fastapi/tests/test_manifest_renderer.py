import tempfile
from pathlib import Path
import pytest

from services.manifest_renderer import compile_manifest_to_ffmpeg, ManifestRenderError


def _make_manifest(clips=1):
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
    return {
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
        "effects": [],
        "keyframes": [],
    }


def test_compile_single_clip():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        manifest = _make_manifest(1)
        fc, meta = compile_manifest_to_ffmpeg(manifest, workdir)
        assert "trim=start=0" in fc
        assert "concat=n=1" in fc
        assert meta["clip_count"] == 1
        assert meta["width"] == 1080


def test_compile_manifest_with_visual_and_audio_effects():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        manifest = _make_manifest(1)
        manifest["effects"] = [
            {
                "id": "e1",
                "type": "frame_filter",
                "payload": {
                    "brightness": 1.2,
                    "contrast": 1.1,
                    "saturation": 1.3,
                    "hue": 15.0,
                    "blur": 2.0,
                    "cropLeft": 0.1,
                    "cropRight": 0.1,
                },
            },
            {
                "id": "e2",
                "type": "export_settings",
                "payload": {
                    "filter": "Cinematic",
                    "audioBoost": 140,
                    "noiseSuppression": 80,
                },
            },
            {
                "id": "e3",
                "type": "fade_in",
                "payload": {"duration_ms": 500.0},
            },
            {
                "id": "e4",
                "type": "fade_out",
                "payload": {"start_ms": 1500.0, "duration_ms": 500.0},
            },
        ]
        manifest["muteSourceAudio"] = True
        fc, meta = compile_manifest_to_ffmpeg(manifest, workdir)
        assert "eq=brightness=0.20:contrast=1.10:saturation=1.30" in fc
        assert "hue=h=15.0" in fc
        assert "boxblur=4:4" in fc
        assert "crop=" in fc
        assert "eq=contrast=1.15:saturation=1.1:brightness=-0.05" in fc
        assert "fade=t=in" in fc
        assert "fade=t=out" in fc
        assert "volume=0.0" in fc
        assert meta["clip_count"] == 1


def test_missing_source_raises():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        # do NOT create input.mp4
        manifest = _make_manifest(1)
        with pytest.raises(ManifestRenderError, match="Missing source asset"):
            compile_manifest_to_ffmpeg(manifest, workdir)


def test_invalid_manifest_raises():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        bad = {
            "version": 1,
            "generatedAt": 0,
            "timeline": {"fps": 30},
        }  # missing width/height
        with pytest.raises(ManifestRenderError):
            compile_manifest_to_ffmpeg(bad, workdir)
