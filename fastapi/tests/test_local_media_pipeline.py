"""Unit tests verifying local media pipeline, probing, subtitle generation, and render jobs."""

from pathlib import Path
import pytest

from services.local_media_pipeline import (
    LocalMediaPipeline,
    MediaProbeResult,
    get_local_media_pipeline,
)
from services.local_persistence import STUDIO_STORAGE_DIR, get_local_db


def test_media_probing_and_fallback(tmp_path: Path):
    pipeline = LocalMediaPipeline(storage_root=tmp_path)
    sample_video = tmp_path / "test.mp4"
    sample_video.write_bytes(b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom")

    probe = pipeline.probe_media(sample_video)
    assert isinstance(probe, MediaProbeResult)
    assert probe.duration > 0
    assert probe.width > 0
    assert probe.height > 0
    assert probe.fps > 0
    data = probe.to_dict()
    assert "codec" in data


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


def test_silence_detection(tmp_path: Path):
    pipeline = LocalMediaPipeline(storage_root=tmp_path)
    fake_media = tmp_path / "audio.mp4"
    fake_media.write_bytes(b"dummy")

    intervals = pipeline.detect_silence(fake_media, min_silence_sec=0.6)
    assert isinstance(intervals, list)


@pytest.mark.asyncio
async def test_local_render_job_state_transitions(tmp_path: Path):
    pipeline = LocalMediaPipeline(storage_root=tmp_path)
    job_id = "test_render_001"
    options = {
        "captions": [{"text": "Hello local world", "startTime": 0.0, "endTime": 3.0}],
    }

    result = await pipeline.execute_render_job(
        job_id=job_id,
        video_id="input_001.mp4",
        start_sec=0.0,
        end_sec=10.0,
        options=options,
        user_id="test_user",
    )

    assert result["status"] == "success"
    assert result["progress"] == 100
    assert "download_url" in result

    # Check LocalSQLiteDB state
    db = get_local_db()
    doc = db.collection("render_jobs").document(job_id).get()
    assert doc.exists
    doc_data = doc.to_dict()
    assert doc_data["status"] == "success"
    assert doc_data["user_id"] == "test_user"

    # Check generated files
    exported_file = tmp_path / "exports" / f"{job_id}.mp4"
    assert exported_file.exists()
