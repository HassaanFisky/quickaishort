"""Master Engineering Specification v1.0 — Phase P0 Verified Video Loop Integration Test.

Enforces the end-to-end verified loop:
  1. Ingest real media -> probe container & streams.
  2. MediaGraph evidence -> silence facet extraction.
  3. Deterministic Decision Gate (ADR-016) -> Mode ACT, 0 Gemini tokens, 0 credits.
  4. Project Kernel (ADR-008) -> monotonic revision bump, event ledger, idempotency.
  5. RenderManifest (ADR-012) -> multi-clip timeline composition with excised silence.
  6. FFmpeg execution -> real physical MP4 baked on disk.
  7. Post-Render Binary Verifier (Section 4.8) -> ffprobe stream & duration checks pass.
  8. Verifier fail-closed security -> invalid/corrupted files block terminal state.
"""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import pytest
from datetime import datetime, timezone

from models.media_graph import FacetBlob, MediaGraph
from models.render_manifest import (
    RenderClip,
    RenderManifest,
    RenderTimeline,
    RenderTrack,
)
from models.studio_project import (
    CreateStudioProjectRequest,
    ProjectCommand,
    StudioProjectHead,
)
from services.decision_service import (
    REMOVE_SILENCES_CAPABILITY,
    decide_from_state,
)
from services.local_media_pipeline import LocalMediaPipeline
from services.manifest_renderer import (
    build_ffmpeg_manifest_cmd,
    compile_manifest_to_ffmpeg,
)
from services.project_kernel import (
    CommandAck,
    InMemoryProjectStore,
    ProjectKernel,
    hash_manifest,
    reset_project_kernel_for_tests,
)
from services.render_verifier import verify_rendered_media


def _generate_synthetic_video_with_silence(dest: Path, duration: float = 4.0) -> Path:
    """Generate a real H.264+AAC MP4 with an explicit dead-air window from 1.5s to 2.5s."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg_bin = LocalMediaPipeline.get_ffmpeg_bin() or "ffmpeg"
    cmd = [
        ffmpeg_bin,
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
        "volume=enable='between(t,1.5,2.5)':volume=0",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        str(dest),
    ]
    subprocess.run(cmd, check=True, timeout=30)
    assert dest.exists() and dest.stat().st_size > 0
    return dest


@pytest.mark.asyncio
async def test_p0_end_to_end_verified_video_loop(tmp_path: Path):
    # -------------------------------------------------------------------------
    # STEP 1: Ingest & Probe
    # -------------------------------------------------------------------------
    pipeline = LocalMediaPipeline(storage_root=tmp_path / "storage")
    source_raw = tmp_path / "raw_video.mp4"
    _generate_synthetic_video_with_silence(source_raw, duration=4.0)

    probe = pipeline.probe_media(source_raw)
    assert probe.has_audio is True
    assert 3.8 <= probe.duration <= 4.2
    assert probe.width == 320
    assert probe.height == 240

    # -------------------------------------------------------------------------
    # STEP 2: MediaGraph Evidence (Silence Detection)
    # -------------------------------------------------------------------------
    silence_gaps = pipeline.detect_silence(source_raw, min_silence_sec=0.4, noise_db=-30.0)
    assert len(silence_gaps) >= 1
    gap_start, gap_end = silence_gaps[0]
    assert 1.4 <= gap_start <= 1.6
    assert 2.4 <= gap_end <= 2.6
    assert (gap_end - gap_start) >= 0.8

    now = datetime.now(timezone.utc)
    graph = MediaGraph(
        graph_id="graph-p0-test",
        owner_user_id="user-p0",
        project_id="proj-p0-test",
        created_at=now,
        updated_at=now,
        status="ready",
        revision=1,
        facets={
            "silence": FacetBlob(
                status="ready",
                data={"segments": [{"start": gap_start, "end": gap_end, "type": "silence"}]},
            )
        },
    )

    head0 = StudioProjectHead(
        project_id="proj-p0-test",
        owner_user_id="user-p0",
        title="P0 Master Loop Video",
        created_at=now,
        updated_at=now,
        revision=0,
        media_graph_id=graph.graph_id,
    )

    # -------------------------------------------------------------------------
    # STEP 3: Deterministic Decision Gate (ADR-016)
    # -------------------------------------------------------------------------
    decision = decide_from_state(
        "Remove unnecessary dead air and tighten the pacing.",
        project_id="proj-p0-test",
        graph=graph,
        head=head0,
    )

    assert decision.mode == "ACT"
    assert decision.gemini_called is False
    assert decision.credits_charged == 0
    assert len(decision.candidate_actions) == 1
    action = decision.candidate_actions[0]
    assert action.capability_id == REMOVE_SILENCES_CAPABILITY
    cut_segments = action.params["segments"]
    assert len(cut_segments) == 1
    cut_start = cut_segments[0]["start"]
    cut_end = cut_segments[0]["end"]

    # -------------------------------------------------------------------------
    # STEP 4: Project Kernel State Transition (ADR-008)
    # -------------------------------------------------------------------------
    kernel = reset_project_kernel_for_tests(InMemoryProjectStore())

    # Initial manifest with 1 full clip
    m0 = RenderManifest(
        generatedAt=1_718_000_000_000,
        timeline=RenderTimeline(fps=30.0, width=320, height=240, duration=4.0),
        tracks=[
            RenderTrack(id="v1", type="video", label="Main Video"),
            RenderTrack(id="a1", type="audio", label="Main Audio"),
        ],
        clips=[
            RenderClip(
                id="clip-orig",
                sourceId="source_raw.mp4",
                trackId="v1",
                startSec=0.0,
                endSec=4.0,
                timelineStartSec=0.0,
            )
        ],
    )

    created_head = await kernel.create_project(
        "user-p0",
        CreateStudioProjectRequest(
            title="P0 Master Loop Project",
            proposed_manifest=m0,
        ),
    )
    assert created_head.revision == 0

    # Proposed manifest after cutting the silence (produces 2 clips)
    first_dur = round(cut_start, 3)
    second_dur = round(4.0 - cut_end, 3)
    m1 = RenderManifest(
        generatedAt=1_718_000_001_000,
        timeline=RenderTimeline(
            fps=30.0,
            width=320,
            height=240,
            duration=round(first_dur + second_dur, 3),
        ),
        tracks=[
            RenderTrack(id="v1", type="video", label="Main Video"),
            RenderTrack(id="a1", type="audio", label="Main Audio"),
        ],
        clips=[
            RenderClip(
                id="clip-part-1",
                sourceId="source_raw.mp4",
                trackId="v1",
                startSec=0.0,
                endSec=first_dur,
                timelineStartSec=0.0,
            ),
            RenderClip(
                id="clip-part-2",
                sourceId="source_raw.mp4",
                trackId="v1",
                startSec=cut_end,
                endSec=4.0,
                timelineStartSec=first_dur,
            ),
        ],
    )

    cmd = ProjectCommand(
        command_id="cmd-remove-silence-001",
        project_id=created_head.project_id,
        base_revision=0,
        kind="capability",
        capability_id=REMOVE_SILENCES_CAPABILITY,
        source="chat",
        proposed_manifest=m1,
        base_snapshot_hash=created_head.snapshot_hash,
        params={"segments": cut_segments},
    )

    ack = await kernel.accept_command("user-p0", cmd)
    assert isinstance(ack, CommandAck)
    assert ack.new_revision == 1
    assert ack.snapshot_hash == hash_manifest(m1)

    # Idempotency check: repeated command returns same ACK without duplicating
    ack_dup = await kernel.accept_command("user-p0", cmd)
    assert isinstance(ack_dup, CommandAck)
    assert ack_dup.new_revision == 1

    # Verify event logged in store
    events = await kernel.get_events(created_head.project_id, "user-p0", after_revision=0)
    assert events is not None and len(events) == 1
    assert events[0].capability_id == REMOVE_SILENCES_CAPABILITY
    assert events[0].revision == 1

    # -------------------------------------------------------------------------
    # STEP 5 & 6: Manifest Compilation & FFmpeg Bake (ADR-012)
    # -------------------------------------------------------------------------
    workdir = tmp_path / "render_workdir"
    workdir.mkdir(parents=True, exist_ok=True)
    # Copy source video into workdir as source_raw.mp4
    workdir_source = workdir / "source_raw.mp4"
    workdir_source.write_bytes(source_raw.read_bytes())

    output_baked_mp4 = tmp_path / "baked_export.mp4"

    filter_complex, meta = compile_manifest_to_ffmpeg(
        m1.model_dump(mode="json"),
        workdir=workdir,
    )
    assert "[vout]" in filter_complex
    assert "[aout]" in filter_complex
    assert meta["clip_count"] == 2

    ffmpeg_cmd = build_ffmpeg_manifest_cmd(
        manifest_dict=m1.model_dump(mode="json"),
        input_files=[workdir_source],
        output_path=output_baked_mp4,
        workdir=workdir,
        quality="medium",
    )

    # Run FFmpeg compilation to bake final MP4
    result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, timeout=45)
    assert result.returncode == 0, f"FFmpeg render failed: {result.stderr}"
    assert output_baked_mp4.exists()
    assert output_baked_mp4.stat().st_size > 0

    # -------------------------------------------------------------------------
    # STEP 7: Post-Render Binary Verifier (Section 4.8)
    # -------------------------------------------------------------------------
    expected_dur = m1.timeline.duration
    verification = verify_rendered_media(
        output_baked_mp4,
        expected_duration_sec=expected_dur,
        expected_width=320,
        expected_height=240,
    )

    assert verification.passed is True
    assert verification.has_video is True
    assert verification.has_audio is True
    assert verification.checks["exists"] is True
    assert verification.checks["non_empty"] is True
    assert verification.checks["ffprobe_ok"] is True
    assert verification.checks["video_stream"] is True
    assert verification.checks["duration_positive"] is True
    assert verification.checks["dimensions_positive"] is True
    assert verification.checks["duration_matches_expected"] is True
    assert verification.checks["dimensions_match_expected"] is True
    assert verification.error is None
    # Confirm the silence was removed: duration is now ~3.0s instead of 4.0s
    assert 2.8 <= verification.duration_sec <= 3.2

    # -------------------------------------------------------------------------
    # STEP 8: Verifier Fail-Closed Security (Adversarial Check)
    # -------------------------------------------------------------------------
    corrupted_mp4 = tmp_path / "corrupted.mp4"
    corrupted_mp4.write_bytes(b"\x00" * 256)
    corrupted_verification = verify_rendered_media(corrupted_mp4)
    assert corrupted_verification.passed is False
    assert corrupted_verification.checks["ffprobe_ok"] is False

    # Duration mismatch reject check
    drift_verification = verify_rendered_media(
        output_baked_mp4,
        expected_duration_sec=120.0,  # wildly different expected duration
    )
    assert drift_verification.passed is False
    assert drift_verification.checks["duration_matches_expected"] is False
