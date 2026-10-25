"""Unit and integration tests verifying local media pipeline with real FFmpeg media."""

from pathlib import Path
import subprocess
import pytest

from services.local_media_pipeline import (
    LocalMediaPipeline,
    MediaProbeResult,
)
from services.local_persistence import get_local_db


def _generate_real_test_video(dest: Path, duration: float = 3.0) -> Path:
    """Generate a real H.264 + AAC MP4 with a silent window between 1.0s and 2.0s."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"testsrc=duration={duration}:size=320x240:rate=30",
        "-f",
        "lavfi",
        "-i",
        f"sine=frequency=440:duration={duration}",
        "-af",
        "volume=enable='between(t,1.0,2.0)':volume=0",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        str(dest),
    ]
    subprocess.run(cmd, check=True, capture_output=True, shell=False)
    return dest


def test_media_probing_real_video(tmp_path: Path):
    pipeline = LocalMediaPipeline(storage_root=tmp_path)
    sample_video = _generate_real_test_video(
        tmp_path / "uploads" / "test.mp4", duration=3.0
    )

    probe = pipeline.probe_media(sample_video)
    assert isinstance(probe, MediaProbeResult)
    assert 2.5 <= probe.duration <= 3.5
    assert probe.width == 320
    assert probe.height == 240
    assert probe.fps == pytest.approx(30.0, abs=1.0)
    assert probe.has_audio is True
    data = probe.to_dict()
    assert data["codec"] == "h264"


def test_media_probing_rejects_corrupt_file(tmp_path: Path):
    pipeline = LocalMediaPipeline(storage_root=tmp_path)
    corrupt_video = tmp_path / "corrupt.mp4"
    corrupt_video.write_bytes(b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom")

    with pytest.raises(ValueError):
        pipeline.probe_media(corrupt_video)


def test_subtitle_generation_srt_and_vtt(tmp_path: Path):
    pipeline = LocalMediaPipeline(storage_root=tmp_path)
    captions = [
        {"text": "First caption hook", "startTime": 0.0, "endTime": 2.5},
        {"text": "Second caption punchline", "startTime": 3.0, "endTime": 5.5},
    ]

    # SRT
    srt_out = tmp_path / "exports" / "test.srt"
    pipeline.generate_subtitles(captions, srt_out, format_type="srt")
    assert srt_out.exists()
    content = srt_out.read_text(encoding="utf-8")
    assert "00:00:00,000 --> 00:00:02,500" in content
    assert "First caption hook" in content

    # VTT
    vtt_out = tmp_path / "exports" / "test.vtt"
    pipeline.generate_subtitles(captions, vtt_out, format_type="vtt")
    assert vtt_out.exists()
    vtt_content = vtt_out.read_text(encoding="utf-8")
    assert "WEBVTT" in vtt_content
    assert "00:00:00.000 --> 00:00:02.500" in vtt_content


def test_silence_detection_real_audio(tmp_path: Path):
    pipeline = LocalMediaPipeline(storage_root=tmp_path)
    media_file = _generate_real_test_video(
        tmp_path / "uploads" / "audio_silence.mp4", duration=3.0
    )

    intervals = pipeline.detect_silence(media_file, min_silence_sec=0.5)
    assert isinstance(intervals, list)
    assert len(intervals) >= 1
    s_start, s_end = intervals[0]
    assert 0.8 <= s_start <= 1.2
    assert 1.8 <= s_end <= 2.2


@pytest.mark.asyncio
async def test_local_render_job_real_video_and_verification(tmp_path: Path):
    pipeline = LocalMediaPipeline(storage_root=tmp_path)
    _generate_real_test_video(tmp_path / "uploads" / "input_001.mp4", duration=3.0)
    job_id = "test_render_001"
    options = {
        "captions": [{"text": "Hello local world", "startTime": 0.0, "endTime": 2.0}],
        "remove_silences": True,
        "min_silence_sec": 0.5,
        "aspect_ratio": "9:16",
    }

    result = await pipeline.execute_render_job(
        job_id=job_id,
        video_id="input_001.mp4",
        start_sec=0.0,
        end_sec=3.0,
        options=options,
        user_id="test_user",
    )

    assert result["status"] == "success"
    assert result["progress"] == 100
    assert "download_url" in result
    assert result["verification"]["verified"] is True
    assert result["verification"]["segments_rendered"] == 2
    assert 1.5 <= result["verification"]["output_duration"] <= 2.5

    # Check LocalSQLiteDB state
    db = get_local_db()
    doc = db.collection("render_jobs").document(job_id).get()
    assert doc.exists
    doc_data = doc.to_dict()
    assert doc_data["status"] == "success"
    assert doc_data["user_id"] == "test_user"

    # Check generated and verified files
    exported_file = tmp_path / "exports" / f"{job_id}.mp4"
    assert exported_file.exists()
    assert exported_file.stat().st_size > 1000
    out_probe = pipeline.verify_rendered_output(exported_file)
    assert out_probe.duration > 1.0


@pytest.mark.asyncio
async def test_local_render_job_fails_honestly_when_source_missing(tmp_path: Path):
    pipeline = LocalMediaPipeline(storage_root=tmp_path)
    result = await pipeline.execute_render_job(
        job_id="missing_src_job",
        video_id="nonexistent_source.mp4",
        start_sec=0.0,
        end_sec=5.0,
        options={},
        user_id="test_user",
    )
    assert result["status"] == "dead"
    assert "not found" in result["error"].lower()
