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


def test_compile_three_clips():
    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        (workdir / "input.mp4").touch()
        manifest = _make_manifest(3)
        fc, meta = compile_manifest_to_ffmpeg(manifest, workdir)
        assert "concat=n=3" in fc
        assert meta["clip_count"] == 3


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
