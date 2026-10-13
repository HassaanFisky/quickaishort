from __future__ import annotations

import json
from pathlib import Path

from services.render_verifier import verify_rendered_media


def test_render_verifier_accepts_valid_video(tmp_path: Path, monkeypatch) -> None:
    output = tmp_path / "final.mp4"
    output.write_bytes(b"valid")

    class Result:
        returncode = 0
        stdout = json.dumps(
            {
                "format": {"duration": "10.0"},
                "streams": [
                    {
                        "codec_type": "video",
                        "width": 1080,
                        "height": 1920,
                        "duration": "10.0",
                    },
                    {"codec_type": "audio", "duration": "10.0"},
                ],
            }
        )
        stderr = ""

    monkeypatch.setattr(
        "services.render_verifier.subprocess.run",
        lambda *args, **kwargs: Result(),
    )

    result = verify_rendered_media(
        output,
        expected_duration_sec=10.0,
        expected_width=1080,
        expected_height=1920,
    )

    assert result.passed is True
    assert result.has_video is True
    assert result.has_audio is True
    assert result.duration_sec == 10.0


def test_render_verifier_rejects_missing_video_stream(
    tmp_path: Path, monkeypatch
) -> None:
    output = tmp_path / "audio-only.mp4"
    output.write_bytes(b"not-a-real-container")

    class Result:
        returncode = 0
        stdout = json.dumps(
            {
                "format": {"duration": "3.0"},
                "streams": [{"codec_type": "audio", "duration": "3.0"}],
            }
        )
        stderr = ""

    monkeypatch.setattr(
        "services.render_verifier.subprocess.run",
        lambda *args, **kwargs: Result(),
    )

    result = verify_rendered_media(output)

    assert result.passed is False
    assert result.checks["video_stream"] is False
    assert result.error == "output_verification_failed:video_stream,dimensions_positive"


def test_render_verifier_rejects_duration_drift(tmp_path: Path, monkeypatch) -> None:
    output = tmp_path / "wrong-duration.mp4"
    output.write_bytes(b"valid")

    class Result:
        returncode = 0
        stdout = json.dumps(
            {
                "format": {"duration": "4.0"},
                "streams": [{"codec_type": "video", "width": 1080, "height": 1920}],
            }
        )
        stderr = ""

    monkeypatch.setattr(
        "services.render_verifier.subprocess.run",
        lambda *args, **kwargs: Result(),
    )

    result = verify_rendered_media(output, expected_duration_sec=10.0)

    assert result.passed is False
    assert result.checks["duration_matches_expected"] is False
