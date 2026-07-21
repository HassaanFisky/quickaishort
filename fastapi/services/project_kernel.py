"""EP-002 Project Kernel — server-authoritative composition log.

Commands → Events → materialized RenderManifest (Strategy A: client proposes).
EP-001 registry gates capability identity and orchestrator emit.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any, Optional, Protocol, Union
from uuid import uuid4

from models.render_manifest import RenderManifest
from models.studio_project import (
    SCHEMA_VERSION,
    Actor,
    CommandAck,
    CommandReject,
    CreateStudioProjectRequest,
    InverseSpec,
    MediaAsset,
    ProjectCommand,
    ProjectEvent,
    ProjectOp,
    StudioProjectHead,
    TranscriptChunk,
)
from services.tool_registry import get_capability, is_emit_allowed

logger = logging.getLogger(__name__)

STUDIO_PROJECTS = "studio_projects"
STUDIO_ASSETS = "studio_assets"
MAX_RECENT_COMMAND_IDS = 128
MAX_REVISION_SNAPSHOTS = 64
MAX_TXN_OPS = 400

# E2 — never become ProjectEvents (Kernel policy; EP-001 untouched)
NON_EVENT_CAPABILITIES: frozenset[str] = frozenset(
    {
        "SEEK",
        "PLAY",
        "PAUSE",
        "SCROLL_HAND",
        "TIMELINE_ZOOM",
        "POINTER_SELECT",
        "FORWARD_LANE_SELECT",
        "BACKWARD_LANE_SELECT",
        "MAGNETIC_SNAP_TOGGLE",
    }
)

CommandResult = Union[CommandAck, CommandReject]


def kernel_enabled() -> bool:
    return os.environ.get("STUDIO_PROJECT_KERNEL", "1").strip().lower() not in {
        "0",
        "false",
        "off",
        "no",
    }


def hash_manifest(manifest: RenderManifest) -> str:
    payload = manifest.model_dump(mode="json")
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _capability_affects_manifest(cap: dict[str, Any]) -> bool:
    return "mutate_project" in (cap.get("side_effects") or [])


class ProjectStore(Protocol):
    def create_project(self, head: StudioProjectHead) -> None: ...

    def get_project(self, project_id: str) -> Optional[StudioProjectHead]: ...

    def list_projects(self, owner_user_id: str) -> list[StudioProjectHead]: ...

    def get_events_after(
        self, project_id: str, after_revision: int, limit: int
    ) -> list[ProjectEvent]: ...

    def get_event_by_command(
        self, project_id: str, command_id: str
    ) -> Optional[ProjectEvent]: ...

    def apply_command_transaction(
        self,
        project_id: str,
        expected_revision: int,
        mutate_fn: Any,
    ) -> tuple[bool, Optional[StudioProjectHead], list[ProjectEvent], Optional[str]]:
        """Atomically apply mutate_fn(head) -> (new_head, events) or raise.

        Returns (ok, head, events, error_code).
        error_code: conflict | deleted | not_found | validation
        """
        ...

    def soft_delete(self, project_id: str, owner_user_id: str) -> bool: ...

    def put_asset(self, asset: MediaAsset) -> None: ...

    def get_asset(self, asset_id: str) -> Optional[MediaAsset]: ...


class InMemoryProjectStore:
    """Deterministic store for unit tests (simulates Firestore transaction)."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.projects: dict[str, StudioProjectHead] = {}
        self.events: dict[str, list[ProjectEvent]] = {}
        self.assets: dict[str, MediaAsset] = {}
        self.command_index: dict[tuple[str, str], str] = {}

    def create_project(self, head: StudioProjectHead) -> None:
        with self._lock:
            self.projects[head.project_id] = head.model_copy(deep=True)
            self.events[head.project_id] = []

    def get_project(self, project_id: str) -> Optional[StudioProjectHead]:
        with self._lock:
            h = self.projects.get(project_id)
            return h.model_copy(deep=True) if h else None

    def list_projects(self, owner_user_id: str) -> list[StudioProjectHead]:
        with self._lock:
            rows = [
                p.model_copy(deep=True)
                for p in self.projects.values()
                if p.owner_user_id == owner_user_id and p.status != "deleted"
            ]
            rows.sort(key=lambda p: p.updated_at, reverse=True)
            return rows

    def get_events_after(
        self, project_id: str, after_revision: int, limit: int
    ) -> list[ProjectEvent]:
        with self._lock:
            evs = [
                e.model_copy(deep=True)
                for e in self.events.get(project_id, [])
                if e.revision > after_revision
            ]
            evs.sort(key=lambda e: e.revision)
            return evs[:limit]

    def get_event_by_command(
        self, project_id: str, command_id: str
    ) -> Optional[ProjectEvent]:
        with self._lock:
            eid = self.command_index.get((project_id, command_id))
            if not eid:
                return None
            for e in self.events.get(project_id, []):
                if e.event_id == eid:
                    return e.model_copy(deep=True)
            return None

    def apply_command_transaction(
        self,
        project_id: str,
        expected_revision: int,
        mutate_fn: Any,
    ) -> tuple[bool, Optional[StudioProjectHead], list[ProjectEvent], Optional[str]]:
        with self._lock:
            head = self.projects.get(project_id)
            if head is None:
                return False, None, [], "not_found"
            if head.status == "deleted":
                return False, head.model_copy(deep=True), [], "deleted"
            if head.revision != expected_revision:
                return False, head.model_copy(deep=True), [], "conflict"
            try:
                new_head, new_events = mutate_fn(head.model_copy(deep=True))
            except ValueError as exc:
                return False, head.model_copy(deep=True), [], f"validation:{exc}"
            if len(new_events) > MAX_TXN_OPS:
                return False, head.model_copy(deep=True), [], "validation:txn_ops"
            self.projects[project_id] = new_head
            self.events.setdefault(project_id, []).extend(new_events)
            for e in new_events:
                self.command_index[(project_id, e.command_id)] = e.event_id
            return True, new_head.model_copy(deep=True), new_events, None

    def soft_delete(self, project_id: str, owner_user_id: str) -> bool:
        with self._lock:
            h = self.projects.get(project_id)
            if not h or h.owner_user_id != owner_user_id:
                return False
            h.status = "deleted"
            h.deleted_at = _now()
            h.updated_at = h.deleted_at
            return True

    def put_asset(self, asset: MediaAsset) -> None:
        with self._lock:
            self.assets[asset.asset_id] = asset.model_copy(deep=True)

    def get_asset(self, asset_id: str) -> Optional[MediaAsset]:
        with self._lock:
            a = self.assets.get(asset_id)
            return a.model_copy(deep=True) if a else None


class FirestoreProjectStore:
    """Production Firestore-backed store (sync client via asyncio.to_thread)."""

    def _col(self):
        from services.db import get_db

        return get_db().collection(STUDIO_PROJECTS)

    def _asset_col(self):
        from services.db import get_db

        return get_db().collection(STUDIO_ASSETS)

    def create_project(self, head: StudioProjectHead) -> None:
        data = head.model_dump(mode="json")
        self._col().document(head.project_id).set(data)

    def get_project(self, project_id: str) -> Optional[StudioProjectHead]:
        snap = self._col().document(project_id).get()
        if not snap.exists:
            return None
        return StudioProjectHead.model_validate(snap.to_dict())

    def list_projects(self, owner_user_id: str) -> list[StudioProjectHead]:
        snaps = (
            self._col()
            .where("owner_user_id", "==", owner_user_id)
            .where("status", "==", "active")
            .stream()
        )
        rows = [StudioProjectHead.model_validate(s.to_dict()) for s in snaps]
        rows.sort(key=lambda p: p.updated_at, reverse=True)
        return rows[:100]

    def get_events_after(
        self, project_id: str, after_revision: int, limit: int
    ) -> list[ProjectEvent]:
        q = (
            self._col()
            .document(project_id)
            .collection("events")
            .where("revision", ">", after_revision)
            .order_by("revision")
            .limit(limit)
        )
        return [ProjectEvent.model_validate(s.to_dict()) for s in q.stream()]

    def get_event_by_command(
        self, project_id: str, command_id: str
    ) -> Optional[ProjectEvent]:
        q = (
            self._col()
            .document(project_id)
            .collection("events")
            .where("command_id", "==", command_id)
            .limit(1)
        )
        for s in q.stream():
            return ProjectEvent.model_validate(s.to_dict())
        return None

    def apply_command_transaction(
        self,
        project_id: str,
        expected_revision: int,
        mutate_fn: Any,
    ) -> tuple[bool, Optional[StudioProjectHead], list[ProjectEvent], Optional[str]]:
        from google.cloud import firestore
        from services.db import get_db

        db = get_db()
        doc_ref = self._col().document(project_id)
        events_col = doc_ref.collection("events")

        @firestore.transactional
        def _txn(transaction: firestore.Transaction):
            snap = doc_ref.get(transaction=transaction)
            if not snap.exists:
                return False, None, [], "not_found"
            head = StudioProjectHead.model_validate(snap.to_dict())
            if head.status == "deleted":
                return False, head, [], "deleted"
            if head.revision != expected_revision:
                return False, head, [], "conflict"
            try:
                new_head, new_events = mutate_fn(head.model_copy(deep=True))
            except ValueError as exc:
                return False, head, [], f"validation:{exc}"
            if len(new_events) > MAX_TXN_OPS:
                return False, head, [], "validation:txn_ops"
            transaction.set(doc_ref, new_head.model_dump(mode="json"))
            for e in new_events:
                transaction.set(
                    events_col.document(e.event_id), e.model_dump(mode="json")
                )
            return True, new_head, new_events, None

        return _txn(db.transaction())

    def soft_delete(self, project_id: str, owner_user_id: str) -> bool:
        ref = self._col().document(project_id)
        snap = ref.get()
        if not snap.exists:
            return False
        data = snap.to_dict() or {}
        if data.get("owner_user_id") != owner_user_id:
            return False
        now = _now()
        ref.update(
            {
                "status": "deleted",
                "deleted_at": now.isoformat(),
                "updated_at": now.isoformat(),
            }
        )
        return True

    def put_asset(self, asset: MediaAsset) -> None:
        self._asset_col().document(asset.asset_id).set(asset.model_dump(mode="json"))

    def get_asset(self, asset_id: str) -> Optional[MediaAsset]:
        snap = self._asset_col().document(asset_id).get()
        if not snap.exists:
            return None
        return MediaAsset.model_validate(snap.to_dict())


class ProjectKernel:
    def __init__(self, store: Optional[ProjectStore] = None) -> None:
        self.store: ProjectStore = store or FirestoreProjectStore()

    async def create_project(
        self, owner_user_id: str, body: CreateStudioProjectRequest
    ) -> StudioProjectHead:
        now = _now()
        project_id = uuid4().hex
        snap = body.proposed_manifest
        snap_hash = hash_manifest(snap) if snap else None
        head = StudioProjectHead(
            schema_version=SCHEMA_VERSION,
            project_id=project_id,
            owner_user_id=owner_user_id,
            title=body.title or "Untitled",
            created_at=now,
            updated_at=now,
            status="active",
            revision=0,
            snapshot_revision=0,
            snapshot_manifest=snap,
            snapshot_hash=snap_hash,
            active_run_id=body.active_run_id,
            primary_asset_id=body.primary_asset_id,
            legacy_adk_project_id=body.legacy_adk_project_id,
        )
        if snap is not None:
            head.revision_snapshots["0"] = {
                "hash": snap_hash,
                "manifest": snap.model_dump(mode="json"),
            }
        await asyncio.to_thread(self.store.create_project, head)
        logger.info(
            "studio_project_created project_id=%s owner=%s", project_id, owner_user_id
        )
        return head

    async def get_project(
        self, project_id: str, user_id: str
    ) -> Optional[StudioProjectHead]:
        head = await asyncio.to_thread(self.store.get_project, project_id)
        if head is None or head.owner_user_id != user_id:
            return None
        return head

    async def list_projects(self, user_id: str) -> list[StudioProjectHead]:
        return await asyncio.to_thread(self.store.list_projects, user_id)

    async def get_head(
        self, project_id: str, user_id: str
    ) -> Optional[StudioProjectHead]:
        return await self.get_project(project_id, user_id)

    async def get_events(
        self, project_id: str, user_id: str, after_revision: int, limit: int = 100
    ) -> Optional[list[ProjectEvent]]:
        head = await self.get_project(project_id, user_id)
        if head is None:
            return None
        limit = max(1, min(limit, 500))
        return await asyncio.to_thread(
            self.store.get_events_after, project_id, after_revision, limit
        )

    async def soft_delete(self, project_id: str, user_id: str) -> bool:
        return await asyncio.to_thread(self.store.soft_delete, project_id, user_id)

    async def register_asset(
        self,
        owner_user_id: str,
        gcs_uri: str,
        content_type: str = "video/mp4",
        source: str = "upload",
    ) -> MediaAsset:
        asset = MediaAsset(
            asset_id=uuid4().hex,
            owner_user_id=owner_user_id,
            gcs_uri=gcs_uri,
            content_type=content_type,
            created_at=_now(),
            source=source,  # type: ignore[arg-type]
        )
        await asyncio.to_thread(self.store.put_asset, asset)
        return asset

    async def accept_command(
        self, user_id: str, command: ProjectCommand
    ) -> CommandResult:
        head = await asyncio.to_thread(self.store.get_project, command.project_id)
        if head is None or head.owner_user_id != user_id:
            return CommandReject(reason="auth", detail="project_not_found_or_forbidden")
        if head.status == "deleted":
            return CommandReject(
                reason="validation",
                detail="project_deleted",
                head_revision=head.revision,
            )

        # E4 — idempotency
        if command.command_id in head.recent_command_ids:
            prior = await asyncio.to_thread(
                self.store.get_event_by_command, command.project_id, command.command_id
            )
            if prior:
                return CommandAck(
                    command_id=command.command_id,
                    event_ids=[prior.event_id],
                    new_revision=head.revision,
                    snapshot_manifest=head.snapshot_manifest,
                    snapshot_hash=head.snapshot_hash,
                )

        if command.kind == "capability":
            reject = self._validate_capability_command(command)
            if reject:
                reject.head_revision = head.revision
                return reject
        elif command.kind == "system":
            reject = self._validate_system_command(command)
            if reject:
                reject.head_revision = head.revision
                return reject
        else:
            return CommandReject(
                reason="validation",
                detail="unknown_kind",
                head_revision=head.revision,
            )

        if command.base_revision != head.revision:
            missing = await asyncio.to_thread(
                self.store.get_events_after,
                command.project_id,
                command.base_revision,
                100,
            )
            return CommandReject(
                reason="conflict",
                detail="base_revision_mismatch",
                head_revision=head.revision,
                missing_events=missing,
            )

        # E1 — base snapshot hash when client claims it
        if (
            command.base_snapshot_hash is not None
            and head.snapshot_hash is not None
            and command.base_snapshot_hash != head.snapshot_hash
        ):
            return CommandReject(
                reason="conflict",
                detail="base_snapshot_hash_mismatch",
                head_revision=head.revision,
            )

        def mutate(
            h: StudioProjectHead,
        ) -> tuple[StudioProjectHead, list[ProjectEvent]]:
            return self._apply_mutating(h, user_id, command)

        ok, new_head, events, err = await asyncio.to_thread(
            self.store.apply_command_transaction,
            command.project_id,
            command.base_revision,
            mutate,
        )
        if not ok:
            if err == "conflict":
                missing = await asyncio.to_thread(
                    self.store.get_events_after,
                    command.project_id,
                    command.base_revision,
                    100,
                )
                return CommandReject(
                    reason="conflict",
                    detail="base_revision_mismatch",
                    head_revision=new_head.revision if new_head else None,
                    missing_events=missing,
                )
            if err == "deleted":
                return CommandReject(
                    reason="validation",
                    detail="project_deleted",
                    head_revision=new_head.revision if new_head else None,
                )
            if err and err.startswith("validation"):
                return CommandReject(
                    reason="validation",
                    detail=err.split(":", 1)[-1] if ":" in err else err,
                    head_revision=head.revision,
                )
            return CommandReject(
                reason="validation",
                detail=err or "transaction_failed",
                head_revision=head.revision,
            )

        assert new_head is not None
        logger.info(
            "studio_command_accepted project_id=%s command_id=%s revision=%s",
            command.project_id,
            command.command_id,
            new_head.revision,
        )
        return CommandAck(
            command_id=command.command_id,
            event_ids=[e.event_id for e in events],
            new_revision=new_head.revision,
            snapshot_manifest=new_head.snapshot_manifest,
            snapshot_hash=new_head.snapshot_hash,
        )

    def _validate_capability_command(
        self, command: ProjectCommand
    ) -> Optional[CommandReject]:
        cid = command.capability_id
        if not cid:
            return CommandReject(reason="validation", detail="capability_id_required")
        if cid in NON_EVENT_CAPABILITIES:
            return CommandReject(reason="validation", detail="non_event_capability")
        cap = get_capability(cid)
        if cap is None:
            return CommandReject(reason="unknown_capability", detail=f"unknown:{cid}")
        if command.source in {"chat", "orchestrator", "automation"}:
            if not is_emit_allowed(cid):
                return CommandReject(
                    reason="emit_blocked",
                    detail=f"orchestrator_emit_false:{cid}",
                )
        if _capability_affects_manifest(cap) and command.proposed_manifest is None:
            return CommandReject(
                reason="validation",
                detail="proposed_manifest_required",
            )
        return None

    def _validate_system_command(
        self, command: ProjectCommand
    ) -> Optional[CommandReject]:
        op = command.system_op
        if not op:
            return CommandReject(reason="validation", detail="system_op_required")
        if op in {"undo", "redo", "revert_to_revision"}:
            return None
        if op in {
            "import_assets",
            "import_adk_segments",
            "set_title",
            "attach_primary_asset",
        }:
            # import may attach assets without manifest; if composition changes, require manifest
            if command.proposed_manifest is None and op.startswith("import"):
                # allow metadata-only import without manifest
                return None
            return None
        return CommandReject(reason="validation", detail=f"unknown_system_op:{op}")

    def _apply_mutating(
        self, head: StudioProjectHead, user_id: str, command: ProjectCommand
    ) -> tuple[StudioProjectHead, list[ProjectEvent]]:
        parent = head.revision
        new_rev = parent + 1
        event_id = uuid4().hex
        now = _now()
        prev_hash = head.snapshot_hash
        affects = False
        next_hash = prev_hash
        cap_id = command.capability_id
        cap_ver: Optional[int] = None
        op_type = "capability"
        op_params = dict(command.params)

        if command.kind == "capability":
            assert command.capability_id
            cap = get_capability(command.capability_id)
            assert cap is not None
            affects = _capability_affects_manifest(cap)
            cap_ver = int(cap.get("version", 1))
            op_type = command.capability_id
            if affects:
                assert command.proposed_manifest is not None
                head.snapshot_manifest = command.proposed_manifest
                next_hash = hash_manifest(command.proposed_manifest)
                head.snapshot_hash = next_hash
                head.snapshot_revision = new_rev
                self._remember_snapshot(head, new_rev)
                head.undo_stack = [*head.undo_stack, parent][-MAX_REVISION_SNAPSHOTS:]
                head.redo_stack = []
        else:
            op_type, op_params, affects, next_hash = self._apply_system(
                head, command, parent, new_rev
            )

        if command.transcript_chunks:
            # E3 — store first compose / merge by append (no invent)
            if not head.transcript_chunks:
                head.transcript_chunks = list(command.transcript_chunks)
            else:
                # idempotent replace only when explicitly flagged
                if command.params.get("replace_transcript"):
                    head.transcript_chunks = list(command.transcript_chunks)

        actor = Actor(
            kind="user" if command.source == "ui_direct" else "agent",
            user_id=user_id,
            agent_id="ai_editor_agent" if command.source != "ui_direct" else None,
            session_id=command.actor_session_id or None,
        )
        event = ProjectEvent(
            event_id=event_id,
            project_id=head.project_id,
            revision=new_rev,
            parent_revision=parent,
            ts=now,
            actor=actor,
            capability_id=cap_id if command.kind == "capability" else None,
            capability_version=cap_ver,
            command_id=command.command_id,
            op=ProjectOp(type=op_type, params=op_params),
            affects_manifest=affects,
            inverse=InverseSpec(strategy="revert_to_revision", revision=parent),
            prev_snapshot_hash=prev_hash,
            next_snapshot_hash=next_hash,
        )
        head.revision = new_rev
        head.updated_at = now
        recent = [c for c in head.recent_command_ids if c != command.command_id]
        recent.append(command.command_id)
        head.recent_command_ids = recent[-MAX_RECENT_COMMAND_IDS:]
        return head, [event]

    def _apply_system(
        self,
        head: StudioProjectHead,
        command: ProjectCommand,
        parent: int,
        new_rev: int,
    ) -> tuple[str, dict[str, Any], bool, Optional[str]]:
        op = command.system_op
        assert op is not None
        params = dict(command.params)

        if op == "import_adk_segments":
            op = "import_assets"
            params = {**params, "source": "adk_segments"}

        if op == "set_title":
            title = str(params.get("title") or "").strip()
            if not title:
                raise ValueError("title_required")
            head.title = title
            return "set_title", params, False, head.snapshot_hash

        if op == "attach_primary_asset":
            aid = params.get("asset_id")
            if not aid:
                raise ValueError("asset_id_required")
            head.primary_asset_id = str(aid)
            return "attach_primary_asset", params, False, head.snapshot_hash

        if op == "import_assets":
            if command.proposed_manifest is not None:
                head.snapshot_manifest = command.proposed_manifest
                h = hash_manifest(command.proposed_manifest)
                head.snapshot_hash = h
                head.snapshot_revision = new_rev
                self._remember_snapshot(head, new_rev)
                head.undo_stack = [*head.undo_stack, parent][-MAX_REVISION_SNAPSHOTS:]
                head.redo_stack = []
                return "import_assets", params, True, h
            return "import_assets", params, False, head.snapshot_hash

        if op == "undo":
            if not head.undo_stack:
                raise ValueError("nothing_to_undo")
            target = head.undo_stack[-1]
            head.undo_stack = head.undo_stack[:-1]
            head.redo_stack = [*head.redo_stack, parent]
            self._restore_revision(head, target, new_rev)
            return (
                "revert_to_revision",
                {"target_revision": target},
                True,
                head.snapshot_hash,
            )

        if op == "redo":
            if not head.redo_stack:
                raise ValueError("nothing_to_redo")
            target = head.redo_stack[-1]
            head.redo_stack = head.redo_stack[:-1]
            head.undo_stack = [*head.undo_stack, parent]
            self._restore_revision(head, target, new_rev)
            return (
                "revert_to_revision",
                {"target_revision": target, "redo": True},
                True,
                head.snapshot_hash,
            )

        if op == "revert_to_revision":
            target = int(params.get("revision", -1))
            if target < 0:
                raise ValueError("revision_required")
            head.undo_stack = [*head.undo_stack, parent][-MAX_REVISION_SNAPSHOTS:]
            head.redo_stack = []
            self._restore_revision(head, target, new_rev)
            return (
                "revert_to_revision",
                {"target_revision": target},
                True,
                head.snapshot_hash,
            )

        raise ValueError(f"unknown_system_op:{op}")

    def _remember_snapshot(self, head: StudioProjectHead, revision: int) -> None:
        if head.snapshot_manifest is None:
            return
        key = str(revision)
        head.revision_snapshots[key] = {
            "hash": head.snapshot_hash,
            "manifest": head.snapshot_manifest.model_dump(mode="json"),
        }
        # Cap
        if len(head.revision_snapshots) > MAX_REVISION_SNAPSHOTS:
            keys = sorted(head.revision_snapshots.keys(), key=lambda k: int(k))
            for k in keys[: len(keys) - MAX_REVISION_SNAPSHOTS]:
                del head.revision_snapshots[k]

    def _restore_revision(
        self, head: StudioProjectHead, target: int, new_rev: int
    ) -> None:
        snap = head.revision_snapshots.get(str(target))
        if snap is None and target == 0 and head.snapshot_manifest is None:
            head.snapshot_manifest = None
            head.snapshot_hash = None
            head.snapshot_revision = new_rev
            return
        if snap is None:
            raise ValueError(f"snapshot_unavailable:{target}")
        manifest = RenderManifest.model_validate(snap["manifest"])
        head.snapshot_manifest = manifest
        head.snapshot_hash = snap.get("hash") or hash_manifest(manifest)
        head.snapshot_revision = new_rev
        self._remember_snapshot(head, new_rev)


_kernel: Optional[ProjectKernel] = None


def get_project_kernel() -> ProjectKernel:
    global _kernel
    if _kernel is None:
        _kernel = ProjectKernel()
    return _kernel


def reset_project_kernel_for_tests(
    store: Optional[ProjectStore] = None,
) -> ProjectKernel:
    global _kernel
    _kernel = ProjectKernel(store=store or InMemoryProjectStore())
    return _kernel
