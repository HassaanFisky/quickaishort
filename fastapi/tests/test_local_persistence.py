"""Unit tests verifying zero-daemon local persistence and AI provider fallback."""

from pathlib import Path
from google.cloud import firestore
import pytest

from services.local_persistence import (
    LocalFirestoreClient,
    LocalSQLiteDB,
    LocalGCSBucket,
    LocalMemoryRedis,
)
from services.ai_intelligence_provider import (
    DeterministicEngine,
    CloudProvider,
    EngineTier,
)
from services.project_kernel import (
    FirestoreProjectStore,
    ProjectKernel,
)
from models.studio_project import (
    Actor,
    CreateStudioProjectRequest,
    ProjectCommand,
    ProjectOp,
)


def test_local_sqlite_crud_and_restart_survival(tmp_path: Path):
    db_file = tmp_path / "test.db"
    db = LocalSQLiteDB(db_file)

    # Insert / Set
    db.set_document("projects", "p1", {"title": "Test Project", "duration": 15.0})

    # Simulate process restart by instantiating a new LocalSQLiteDB on the same file
    db_restarted = LocalSQLiteDB(db_file)
    doc = db_restarted.get_document("projects", "p1")
    assert doc is not None
    assert doc["title"] == "Test Project"
    assert doc["duration"] == 15.0

    # Update
    db_restarted.set_document("projects", "p1", {"title": "Updated", "duration": 30.0})
    updated = db_restarted.get_document("projects", "p1")
    assert updated["title"] == "Updated"

    # List
    docs = db_restarted.list_documents("projects")
    assert len(docs) == 1

    # Delete
    deleted = db_restarted.delete_document("projects", "p1")
    assert deleted is True
    assert db_restarted.get_document("projects", "p1") is None


def test_local_firestore_transactions_and_subcollections(tmp_path: Path):
    db_file = tmp_path / "firestore_local.db"
    client = LocalFirestoreClient(db_file)

    doc_ref = client.collection("UserStats").document("u1")
    doc_ref.set({"user_id": "u1", "credits_balance": 100, "ai_runs": 0})
    doc_ref.update({"ai_runs": firestore.Increment(2)})
    assert doc_ref.get().to_dict()["ai_runs"] == 2

    @firestore.transactional
    def _deduct(transaction: firestore.Transaction) -> int:
        snap = doc_ref.get(transaction=transaction)
        bal = snap.to_dict()["credits_balance"] - 20
        transaction.update(doc_ref, {"credits_balance": bal})
        return bal

    new_bal = _deduct(client.transaction())
    assert new_bal == 80
    assert doc_ref.get().to_dict()["credits_balance"] == 80

    # Subcollection query with > and order_by
    events_col = client.collection("projects").document("proj1").collection("events")
    events_col.document("00000001").set({"revision": 1, "op_type": "ADD_CLIP"})
    events_col.document("00000002").set({"revision": 2, "op_type": "TRIM_CLIP"})
    after_1 = [
        s.to_dict()
        for s in events_col.where("revision", ">", 1).order_by("revision").stream()
    ]
    assert len(after_1) == 1
    assert after_1[0]["revision"] == 2


@pytest.mark.asyncio
async def test_project_kernel_persists_across_sqlite_reopen(
    tmp_path: Path, monkeypatch
):
    import services.db as db_mod

    db_file = tmp_path / "kernel.db"
    monkeypatch.setattr(db_mod, "get_db", lambda: LocalFirestoreClient(db_file))
    kernel1 = ProjectKernel(store=FirestoreProjectStore())

    created = await kernel1.create_project(
        "local_studio_user",
        CreateStudioProjectRequest(
            title="Persistent Local Cut",
        ),
    )
    assert created.revision == 0

    ack = await kernel1.accept_command(
        "local_studio_user",
        ProjectCommand(
            project_id=created.project_id,
            command_id="cmd-persist-1",
            base_revision=0,
            kind="system",
            system_op="set_title",
            params={"title": "Persistent Local Cut v2"},
        ),
    )
    assert ack.status == "accepted"
    assert ack.new_revision == 1

    # Re-open from SQLite file (simulating backend restart)
    monkeypatch.setattr(db_mod, "get_db", lambda: LocalFirestoreClient(db_file))
    kernel2 = ProjectKernel(store=FirestoreProjectStore())
    reloaded = await kernel2.get_project(created.project_id, "local_studio_user")
    assert reloaded is not None
    assert reloaded.title == "Persistent Local Cut v2"
    assert reloaded.revision == 1
    events = await kernel2.get_events(
        created.project_id, "local_studio_user", after_revision=0
    )
    assert events is not None and len(events) == 1
    assert events[0].command_id == "cmd-persist-1"


def test_local_storage_bucket(tmp_path: Path):
    bucket = LocalGCSBucket(tmp_path)
    test_file = tmp_path / "sample.mp4"
    test_file.write_text("fake video bytes")

    # Upload
    blob = bucket.blob("uploads/sample.mp4")
    blob.upload_from_filename(str(test_file))
    assert blob.exists()
    blob.reload()
    assert blob.size == len("fake video bytes")

    # Path traversal protection
    with pytest.raises(ValueError):
        bucket.blob("../secrets.txt")


def test_local_memory_redis():
    redis = LocalMemoryRedis()
    assert redis.ping() is True

    # String operations
    redis.set("key1", "val1")
    assert redis.get("key1") == b"val1"

    # Hash operations
    redis.hset("hash1", mapping={"f1": "v1", "f2": "v2"})
    assert redis.hget("hash1", "f1") == b"v1"
    all_fields = redis.hgetall("hash1")
    assert b"f1" in all_fields

    # Delete
    redis.delete("key1", "hash1")
    assert redis.get("key1") is None


def test_deterministic_engine_actions():
    res = DeterministicEngine.plan_command("remove all dead air and silence")
    assert res["status"] == "success"
    assert res["engine_used"] == EngineTier.LOCAL_DETERMINISTIC.value
    assert any(a["type"] == "REMOVE_SILENCES" for a in res["actions"])

    viral_res = DeterministicEngine.plan_command("create viral shorts reel")
    assert any(a["type"] == "SET_ASPECT_RATIO" for a in viral_res["actions"])


@pytest.mark.asyncio
async def test_cloud_provider_fallback_on_429():
    async def failing_gemini_call():
        raise RuntimeError("429 ResourceExhausted: Quota exceeded for quota metric")

    plan = await CloudProvider.execute_with_fallback(
        failing_gemini_call,
        prompt="remove dead air",
    )
    assert plan["status"] == "success"
    assert plan["engine_used"] == EngineTier.LOCAL_DETERMINISTIC.value
    assert len(plan["actions"]) > 0
