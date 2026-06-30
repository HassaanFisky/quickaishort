"""Unit tests for RenderManifest Pydantic models (Phase 58 + 59).

Phase 59 tests verify that ExportRequest in main.py correctly accepts, validates,
and stores an optional RenderManifest without breaking the existing request path.
"""

import pytest
from pydantic import ValidationError
from models import (
    RenderTimeline,
    RenderTrack,
    RenderClip,
    RenderCaption,
    RenderOverlay,
    RenderEffect,
    RenderKeyframe,
    RenderManifest,
)


def test_valid_minimal_manifest():
    """Verify a valid minimal render manifest passes schema validation."""
    data = {
        "generatedAt": 1718000000000,
        "timeline": {
            "fps": 30.0,
            "width": 1080,
            "height": 1920,
            "duration": 60.0,
        },
    }
    manifest = RenderManifest(**data)
    assert manifest.version == 1
    assert manifest.generatedAt == 1718000000000
    assert manifest.timeline.fps == 30.0
    assert manifest.timeline.width == 1080
    assert manifest.timeline.height == 1920
    assert manifest.timeline.duration == 60.0
    assert len(manifest.tracks) == 0
    assert len(manifest.clips) == 0
    assert len(manifest.captions) == 0


def test_invalid_timeline_types():
    """Verify validation triggers on invalid timeline types."""
    with pytest.raises(ValidationError):
        # width must be integer
        RenderTimeline(fps=30.0, width="invalid", height=1920, duration=60.0)

    with pytest.raises(ValidationError):
        # fps must be float/numeric
        RenderTimeline(fps="not-a-number", width=1080, height=1920, duration=60.0)


def test_track_type_validation():
    """Verify track type must be either video or audio."""
    # Valid types
    assert RenderTrack(id="t1", type="video", label="V1").type == "video"
    assert RenderTrack(id="t2", type="audio", label="A1").type == "audio"

    # Invalid type
    with pytest.raises(ValidationError):
        RenderTrack(id="t3", type="subtitle", label="S1")


def test_clip_defaults_and_validation():
    """Verify clip validation and default values."""
    clip = RenderClip(
        id="c1",
        trackId="t1",
        sourceId="video.mp4",
        startSec=0.0,
        endSec=10.0,
        timelineStartSec=0.0,
    )
    assert clip.speed == 1.0
    assert clip.label is None
    assert clip.colorLabel is None

    # speed check is optional but should match schema types
    with pytest.raises(ValidationError):
        RenderClip(
            id="c1",
            trackId="t1",
            sourceId="video.mp4",
            startSec="invalid",
            endSec=10.0,
            timelineStartSec=0.0,
        )


def test_full_complex_manifest():
    """Verify a complete complex manifest can be fully parsed and validated."""
    data = {
        "version": 1,
        "generatedAt": 1718000000000,
        "timeline": {
            "fps": 29.97,
            "width": 1080,
            "height": 1920,
            "duration": 15.0,
        },
        "tracks": [
            {
                "id": "v1",
                "type": "video",
                "label": "V1",
                "locked": False,
                "muted": False,
            },
            {
                "id": "a1",
                "type": "audio",
                "label": "Voiceover",
                "locked": True,
                "muted": False,
            },
        ],
        "clips": [
            {
                "id": "clip-1",
                "trackId": "v1",
                "sourceId": "raw_input.mp4",
                "startSec": 5.0,
                "endSec": 20.0,
                "timelineStartSec": 0.0,
                "speed": 1.0,
                "label": "Scene A",
                "colorLabel": "#a855f7",
            }
        ],
        "captions": [
            {
                "id": "cap-1",
                "text": "Hello World",
                "startTime": 1.0,
                "endTime": 3.5,
                "style": {"fontSize": 24, "fontColor": "#ffffff"},
            }
        ],
        "overlays": [
            {
                "id": "ov-1",
                "type": "TEXT",
                "startSec": 0.5,
                "durationSec": 5.0,
                "opacity": 0.9,
                "x": 540.0,
                "y": 960.0,
                "scale": 1.2,
                "rotation": 15.0,
                "payload": {"text": "Pre-Flight", "fontWeight": 700},
            }
        ],
        "effects": [
            {
                "id": "eff-1",
                "clipId": "clip-1",
                "type": "frame_filter",
                "payload": {"brightness": 1.1, "contrast": 1.0},
            }
        ],
        "keyframes": [
            {
                "id": "kf-1",
                "targetId": "ov-1",
                "property": "scale",
                "timeSec": 2.0,
                "value": 1.5,
                "easing": "ease-in-out",
            }
        ],
        "sourceHash": "sha256-mock-hash",
    }
    manifest = RenderManifest(**data)
    assert len(manifest.tracks) == 2
    assert manifest.tracks[1].locked is True
    assert manifest.clips[0].label == "Scene A"
    assert manifest.captions[0].style["fontSize"] == 24
    assert manifest.overlays[0].payload["text"] == "Pre-Flight"
    assert manifest.effects[0].payload["brightness"] == 1.1
    assert manifest.keyframes[0].value == 1.5
    assert manifest.sourceHash == "sha256-mock-hash"


# ---------------------------------------------------------------------------
# Phase 59 — ExportRequest model integration tests
# These tests exercise the ExportRequest Pydantic model from models/export_request.py.
# They do NOT import main.py and therefore require no Redis/Sentry/app startup.
# ---------------------------------------------------------------------------

from models import ExportRequest  # noqa: E402 — imported after module-level fixtures

# Minimal valid RenderManifest dict that satisfies the schema.
_VALID_MANIFEST = {
    "version": 1,
    "generatedAt": 1718000000000,
    "timeline": {
        "fps": 30.0,
        "width": 1080,
        "height": 1920,
        "duration": 15.0,
    },
}

# Minimal ExportRequest dict *without* a render_manifest (legacy path).
_BASE_EXPORT = {
    "videoId": "abc123",
    "start_sec": 0.0,
    "end_sec": 15.0,
    "user_id": "user-test",
}


def test_export_request_valid_manifest_accepted():
    """Phase 59: ExportRequest must accept a valid RenderManifest and preserve it."""
    payload = {**_BASE_EXPORT, "render_manifest": _VALID_MANIFEST}
    req = ExportRequest(**payload)
    assert req.render_manifest is not None
    assert req.render_manifest.version == 1
    assert req.render_manifest.generatedAt == 1718000000000
    assert req.render_manifest.timeline.fps == 30.0

    # Serialising back to dict must include a non-None render_manifest key.
    dumped = req.model_dump()
    assert "render_manifest" in dumped
    assert isinstance(dumped["render_manifest"], dict)
    assert dumped["render_manifest"]["version"] == 1


def test_export_request_invalid_manifest_rejected():
    """Phase 59: ExportRequest must reject a structurally invalid RenderManifest."""
    # timeline.width is required; omitting it should raise a ValidationError.
    bad_manifest = {
        "version": 1,
        "generatedAt": 1718000000000,
        "timeline": {
            "fps": 30.0,
            # 'width' is intentionally missing
            "height": 1920,
            "duration": 15.0,
        },
    }
    with pytest.raises(ValidationError) as exc_info:
        ExportRequest(**{**_BASE_EXPORT, "render_manifest": bad_manifest})

    errors = exc_info.value.errors()
    # At least one error should reference the 'width' field inside the manifest.
    field_paths = [".".join(str(loc) for loc in err["loc"]) for err in errors]
    assert any(
        "width" in path for path in field_paths
    ), f"Expected a 'width' field error; got: {field_paths}"


def test_export_request_without_manifest_still_works():
    """Phase 59: legacy ExportRequest without render_manifest must keep working."""
    req = ExportRequest(**_BASE_EXPORT)
    assert req.render_manifest is None

    # Core fields must remain intact.
    assert req.videoId == "abc123"
    assert req.start_sec == 0.0
    assert req.end_sec == 15.0
    assert req.user_id == "user-test"

    # Defaults must remain unchanged.
    assert req.aspect_ratio == "9:16"
    assert req.quality == "medium"
    assert req.watermark_enabled is False
    assert req.transition_enabled is False
