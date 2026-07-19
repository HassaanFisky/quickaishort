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
        timeline=RenderTimeline(
            fps=30.0, width=1080, height=1920, duration=duration
        ),
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
    head = await kernel.create_project(
        "user-a", CreateStudioProjectRequest(title="T")
    )
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
    cmd2 = cmd.model_copy(update={"base_revision": 0, "proposed_manifest": _manifest(50.0)})
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
    head = await kernel.create_project(
        "user-a", CreateStudioProjectRequest(title="T")
    )
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
    head = await kernel.create_project(
        "user-a", CreateStudioProjectRequest(title="T")
    )
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


@pytest.mark.asyncio
async def test_import_adk_segments_alias(kernel):
    head = await kernel.create_project(
        "user-a", CreateStudioProjectRequest(title="T")
    )
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
