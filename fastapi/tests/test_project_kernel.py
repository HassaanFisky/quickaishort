"""EP-002 Project Kernel unit tests (InMemory store — no Firestore)."""

from __future__ import annotations

import pytest

from models.render_manifest import RenderManifest, RenderTimeline
from models.studio_project import (
    CreateStudioProjectRequest,
    ProjectCommand,
)
from services.project_kernel import (
    InMemoryProjectStore,
    CommandAck,
    CommandReject,
    hash_manifest,
    reset_project_kernel_for_tests,
)


def _manifest(duration: float = 10.0) -> RenderManifest:
    return RenderManifest(
        generatedAt=1_718_000_000_000,
        timeline=RenderTimeline(fps=30.0, width=1080, height=1920, duration=duration),
    )


@pytest.fixture
def kernel():
    return reset_project_kernel_for_tests(InMemoryProjectStore())


@pytest.mark.asyncio
async def test_create_and_head(kernel):
    head = await kernel.create_project(
        "user-a",
        CreateStudioProjectRequest(title="Demo", proposed_manifest=_manifest()),
    )
    assert head.revision == 0
    assert head.schema_version == 2
    assert head.snapshot_hash is not None
    got = await kernel.get_head(head.project_id, "user-a")
    assert got is not None
    assert got.title == "Demo"
    forbidden = await kernel.get_head(head.project_id, "user-b")
    assert forbidden is None


@pytest.mark.asyncio
async def test_capability_requires_proposed_manifest(kernel):
    head = await kernel.create_project("user-a", CreateStudioProjectRequest(title="T"))
    result = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="cmd-1",
            project_id=head.project_id,
            base_revision=0,
            kind="capability",
            capability_id="ADD_CAPTION",
            source="ui_direct",
            params={"text": "hi"},
        ),
    )
    assert isinstance(result, CommandReject)
    assert result.reason == "validation"
    assert result.detail == "proposed_manifest_required"


@pytest.mark.asyncio
async def test_accept_capability_bumps_revision(kernel):
    m0 = _manifest(10.0)
    head = await kernel.create_project(
        "user-a",
        CreateStudioProjectRequest(title="T", proposed_manifest=m0),
    )
    m1 = _manifest(12.0)
    result = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="cmd-add",
            project_id=head.project_id,
            base_revision=0,
            kind="capability",
            capability_id="ADD_CAPTION",
            source="ui_direct",
            proposed_manifest=m1,
            base_snapshot_hash=head.snapshot_hash,
            params={"text": "hi"},
        ),
    )
    assert isinstance(result, CommandAck)
    assert result.new_revision == 1
    assert result.snapshot_hash == hash_manifest(m1)
    head2 = await kernel.get_head(head.project_id, "user-a")
    assert head2 is not None
    assert head2.revision == 1
    assert head2.undo_stack == [0]


@pytest.mark.asyncio
async def test_conflict_on_stale_base_revision(kernel):
    head = await kernel.create_project(
        "user-a",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest()),
    )
    await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="cmd-a",
            project_id=head.project_id,
            base_revision=0,
            kind="capability",
            capability_id="ADD_CAPTION",
            source="ui_direct",
            proposed_manifest=_manifest(11.0),
        ),
    )
    result = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="cmd-b",
            project_id=head.project_id,
            base_revision=0,
            kind="capability",
            capability_id="ADD_CAPTION",
            source="ui_direct",
            proposed_manifest=_manifest(99.0),
        ),
    )
    assert isinstance(result, CommandReject)
    assert result.reason == "conflict"
    assert result.head_revision == 1
    assert len(result.missing_events) >= 1


@pytest.mark.asyncio
async def test_idempotent_command_id(kernel):
    head = await kernel.create_project(
        "user-a",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest()),
    )
    cmd = ProjectCommand(
        command_id="same-id",
        project_id=head.project_id,
        base_revision=0,
        kind="capability",
        capability_id="ADD_CAPTION",
        source="ui_direct",
        proposed_manifest=_manifest(11.0),
    )
    r1 = await kernel.accept_command("user-a", cmd)
    assert isinstance(r1, CommandAck)
    # Second submit with same command_id but would-be conflict base — still idempotent ack
    cmd2 = cmd.model_copy(
        update={"base_revision": 0, "proposed_manifest": _manifest(50.0)}
    )
    r2 = await kernel.accept_command("user-a", cmd2)
    assert isinstance(r2, CommandAck)
    assert r2.new_revision == 1
    head2 = await kernel.get_head(head.project_id, "user-a")
    assert head2 is not None
    assert head2.revision == 1
    assert head2.snapshot_manifest is not None
    assert head2.snapshot_manifest.timeline.duration == 11.0


@pytest.mark.asyncio
async def test_non_event_capability_rejected(kernel):
    head = await kernel.create_project("user-a", CreateStudioProjectRequest(title="T"))
    result = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="seek-1",
            project_id=head.project_id,
            base_revision=0,
            kind="capability",
            capability_id="SEEK",
            source="ui_direct",
        ),
    )
    assert isinstance(result, CommandReject)
    assert result.detail == "non_event_capability"


@pytest.mark.asyncio
async def test_emit_blocked_for_chat(kernel):
    head = await kernel.create_project("user-a", CreateStudioProjectRequest(title="T"))
    result = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="explain-1",
            project_id=head.project_id,
            base_revision=0,
            kind="capability",
            capability_id="EXPLAIN_LAST_EDIT",
            source="chat",
        ),
    )
    assert isinstance(result, CommandReject)
    assert result.reason == "emit_blocked"


@pytest.mark.asyncio
async def test_undo_redo(kernel):
    m0 = _manifest(10.0)
    head = await kernel.create_project(
        "user-a",
        CreateStudioProjectRequest(title="T", proposed_manifest=m0),
    )
    await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="c1",
            project_id=head.project_id,
            base_revision=0,
            kind="capability",
            capability_id="ADD_CAPTION",
            source="ui_direct",
            proposed_manifest=_manifest(12.0),
        ),
    )
    head1 = await kernel.get_head(head.project_id, "user-a")
    assert head1 is not None
    undo = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="u1",
            project_id=head.project_id,
            base_revision=1,
            kind="system",
            system_op="undo",
            source="ui_direct",
        ),
    )
    assert isinstance(undo, CommandAck)
    head2 = await kernel.get_head(head.project_id, "user-a")
    assert head2 is not None
    assert head2.revision == 2
    assert head2.snapshot_manifest is not None
    assert head2.snapshot_manifest.timeline.duration == 10.0
    redo = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="r1",
            project_id=head.project_id,
            base_revision=2,
            kind="system",
            system_op="redo",
            source="ui_direct",
        ),
    )
    assert isinstance(redo, CommandAck)
    head3 = await kernel.get_head(head.project_id, "user-a")
    assert head3 is not None
    assert head3.snapshot_manifest is not None
    assert head3.snapshot_manifest.timeline.duration == 12.0


@pytest.mark.asyncio
async def test_soft_delete_blocks_commands(kernel):
    head = await kernel.create_project(
        "user-a",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest()),
    )
    assert await kernel.soft_delete(head.project_id, "user-a")
    result = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="after-del",
            project_id=head.project_id,
            base_revision=0,
            kind="capability",
            capability_id="ADD_CAPTION",
            source="ui_direct",
            proposed_manifest=_manifest(5.0),
        ),
    )
    assert isinstance(result, CommandReject)
    assert result.detail == "project_deleted"


@pytest.mark.asyncio
async def test_events_after(kernel):
    head = await kernel.create_project(
        "user-a",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest()),
    )
    await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="e1",
            project_id=head.project_id,
            base_revision=0,
            kind="capability",
            capability_id="ADD_CAPTION",
            source="ui_direct",
            proposed_manifest=_manifest(11.0),
        ),
    )
    events = await kernel.get_events(head.project_id, "user-a", after_revision=0)
    assert events is not None
    assert len(events) == 1
    assert events[0].capability_id == "ADD_CAPTION"

    by_cmd = await kernel.get_event_by_command(head.project_id, "user-a", "e1")
    assert by_cmd is not None
    assert by_cmd.event_id == events[0].event_id
    assert await kernel.get_event_by_command(head.project_id, "user-b", "e1") is None
    assert await kernel.get_event_by_command(head.project_id, "user-a", "") is None


@pytest.mark.asyncio
async def test_import_adk_segments_alias(kernel):
    head = await kernel.create_project("user-a", CreateStudioProjectRequest(title="T"))
    result = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="imp-1",
            project_id=head.project_id,
            base_revision=0,
            kind="system",
            system_op="import_adk_segments",
            source="ui_direct",
            params={"segments": [{"id": "s1"}]},
        ),
    )
    assert isinstance(result, CommandAck)
    events = await kernel.get_events(head.project_id, "user-a", 0)
    assert events is not None
    assert events[0].op.type == "import_assets"
    assert events[0].op.params.get("source") == "adk_segments"


def test_export_request_project_fields():
    from models import ExportRequest

    req = ExportRequest(
        videoId="v1",
        start_sec=0,
        end_sec=5,
        user_id="u1",
        project_id="p1",
        project_revision=3,
    )
    assert req.project_id == "p1"
    assert req.project_revision == 3
    legacy = ExportRequest(videoId="v1", start_sec=0, end_sec=5, user_id="u1")
    assert legacy.project_id is None


@pytest.mark.asyncio
async def test_ai_edit_creates_ai_origin_revision(kernel):
    head = await kernel.create_project(
        "user-a",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest(10.0)),
    )
    ack = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="ai-1",
            project_id=head.project_id,
            base_revision=0,
            kind="capability",
            capability_id="ADD_CAPTION",
            source="chat",
            proposed_manifest=_manifest(12.0),
            params={"text": "hook"},
        ),
    )
    assert isinstance(ack, CommandAck)
    assert ack.origin == "ai"
    assert ack.parent_revision == 0
    assert ack.new_revision == 1
    events = await kernel.get_events(head.project_id, "user-a", 0)
    assert events is not None
    assert events[0].origin == "ai"
    assert events[0].actor.kind == "agent"
    assert events[0].parent_revision == 0


@pytest.mark.asyncio
async def test_manual_edit_creates_manual_origin_revision(kernel):
    head = await kernel.create_project(
        "user-a",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest(10.0)),
    )
    ack = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="man-1",
            project_id=head.project_id,
            base_revision=0,
            kind="system",
            system_op="commit_snapshot",
            source="ui_direct",
            proposed_manifest=_manifest(11.0),
        ),
    )
    assert isinstance(ack, CommandAck)
    assert ack.origin == "manual"
    assert ack.parent_revision == 0
    assert ack.new_revision == 1
    head2 = await kernel.get_head(head.project_id, "user-a")
    assert head2 is not None
    assert head2.snapshot_manifest is not None
    assert head2.snapshot_manifest.timeline.duration == 11.0


@pytest.mark.asyncio
async def test_consecutive_edits_form_revision_lineage(kernel):
    head = await kernel.create_project(
        "user-a",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest(10.0)),
    )
    ai = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="ai-lin",
            project_id=head.project_id,
            base_revision=0,
            kind="capability",
            capability_id="ADD_CAPTION",
            source="orchestrator",
            proposed_manifest=_manifest(12.0),
        ),
    )
    manual = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="man-lin",
            project_id=head.project_id,
            base_revision=1,
            kind="system",
            system_op="commit_snapshot",
            source="ui_direct",
            proposed_manifest=_manifest(13.0),
        ),
    )
    assert isinstance(ai, CommandAck) and isinstance(manual, CommandAck)
    assert (ai.parent_revision, ai.new_revision) == (0, 1)
    assert (manual.parent_revision, manual.new_revision) == (1, 2)
    events = await kernel.get_events(head.project_id, "user-a", -1)
    assert events is not None
    assert [e.origin for e in events] == ["ai", "manual"]
    assert [e.parent_revision for e in events] == [0, 1]


@pytest.mark.asyncio
async def test_commit_snapshot_identity_does_not_fork(kernel):
    m0 = _manifest(10.0)
    head = await kernel.create_project(
        "user-a",
        CreateStudioProjectRequest(title="T", proposed_manifest=m0),
    )
    ack = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="ident-1",
            project_id=head.project_id,
            base_revision=0,
            kind="system",
            system_op="commit_snapshot",
            source="ui_direct",
            proposed_manifest=m0,
        ),
    )
    assert isinstance(ack, CommandAck)
    assert ack.new_revision == 0
    assert ack.event_ids == []
    head2 = await kernel.get_head(head.project_id, "user-a")
    assert head2 is not None
    assert head2.revision == 0


@pytest.mark.asyncio
async def test_mixed_ai_manual_undo_restores_authoritative_state(kernel):
    m0 = _manifest(10.0)
    head = await kernel.create_project(
        "user-a",
        CreateStudioProjectRequest(title="T", proposed_manifest=m0),
    )
    await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="ai-u",
            project_id=head.project_id,
            base_revision=0,
            kind="capability",
            capability_id="ADD_CAPTION",
            source="chat",
            proposed_manifest=_manifest(12.0),
        ),
    )
    await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="man-u",
            project_id=head.project_id,
            base_revision=1,
            kind="system",
            system_op="commit_snapshot",
            source="ui_direct",
            proposed_manifest=_manifest(14.0),
        ),
    )
    undo_manual = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="undo-man",
            project_id=head.project_id,
            base_revision=2,
            kind="system",
            system_op="undo",
            source="ui_direct",
        ),
    )
    assert isinstance(undo_manual, CommandAck)
    assert undo_manual.origin == "system"
    restored = await kernel.get_head(head.project_id, "user-a")
    assert restored is not None
    assert restored.snapshot_manifest is not None
    assert restored.snapshot_manifest.timeline.duration == 12.0
    undo_ai = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="undo-ai",
            project_id=head.project_id,
            base_revision=3,
            kind="system",
            system_op="undo",
            source="ui_direct",
        ),
    )
    assert isinstance(undo_ai, CommandAck)
    original = await kernel.get_head(head.project_id, "user-a")
    assert original is not None
    assert original.snapshot_manifest is not None
    assert original.snapshot_manifest.timeline.duration == 10.0


@pytest.mark.asyncio
async def test_revision_snapshots_survive_store_rehydrate(kernel):
    head = await kernel.create_project(
        "user-a",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest(10.0)),
    )
    await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="persist-1",
            project_id=head.project_id,
            base_revision=0,
            kind="capability",
            capability_id="ADD_CAPTION",
            source="ui_direct",
            proposed_manifest=_manifest(12.0),
        ),
    )
    live = kernel.store.get_project(head.project_id)
    assert live is not None
    dumped = live.model_dump(mode="json")
    from models.studio_project import StudioProjectHead

    restored = StudioProjectHead.model_validate(dumped)
    assert restored.revision == 1
    assert "0" in restored.revision_snapshots
    assert "1" in restored.revision_snapshots
    assert restored.revision_snapshots["1"]["hash"] == restored.snapshot_hash


@pytest.mark.asyncio
async def test_client_projection_cannot_bypass_stale_revision(kernel):
    """Client stacks are not truth: a stale base_revision is rejected."""
    head = await kernel.create_project(
        "user-a",
        CreateStudioProjectRequest(title="T", proposed_manifest=_manifest(10.0)),
    )
    await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="first",
            project_id=head.project_id,
            base_revision=0,
            kind="capability",
            capability_id="ADD_CAPTION",
            source="chat",
            proposed_manifest=_manifest(12.0),
        ),
    )
    stale_local_undo = await kernel.accept_command(
        "user-a",
        ProjectCommand(
            command_id="stale-undo",
            project_id=head.project_id,
            base_revision=0,
            kind="system",
            system_op="undo",
            source="ui_direct",
        ),
    )
    assert isinstance(stale_local_undo, CommandReject)
    assert stale_local_undo.reason == "conflict"
    head2 = await kernel.get_head(head.project_id, "user-a")
    assert head2 is not None
    assert head2.revision == 1
    assert head2.snapshot_manifest is not None
    assert head2.snapshot_manifest.timeline.duration == 12.0
